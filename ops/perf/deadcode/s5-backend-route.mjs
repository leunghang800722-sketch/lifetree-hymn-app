#!/usr/bin/env node
// S5 — backend route/handler 三方交叉掃描器
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S5
//
// server.js mount 表 × 前端 API_BASE 打嘅 path（grep '/api/' 字串）×
// `[deprecated-route]` 持久計數（backend/logs/metrics/ops-metrics.json 嘅
// total.deprecatedRouteHits + hourly 逐小時分佈）。
//
// 兩種掛載風格：
//   (a) router-style：`app.use('/api/xxx', xxxRoutes)` —— routes/xxx.js 內
//       `router.get('/sub', ...)` 要拼埋 prefix
//   (b) app-function-style：`xxxRoutes(app)` —— routes/xxx.js 內直接
//       `app.get('/api/xxx/sub', ...)`，路徑已經係完整字串
//
// 正控：`/api/hymns` 要三方（server.js 掛載表、前端 grep、非 zero 嘅命中假設）都命中。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend/hymn-app');

const serverText = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');

// map router-var-name -> mount prefix, e.g. app.use('/api/home', homeRoutes) => homeRoutes: '/api/home'
const routerMountPrefix = {};
{
  const re = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)(?:\([^)]*\))?\s*\)/g;
  let m;
  while ((m = re.exec(serverText))) {
    routerMountPrefix[m[2]] = m[1];
  }
}

// map import name -> file, e.g. import homeRoutes from './routes/home.js'
const importFile = {};
{
  const re = /import\s+([A-Za-z0-9_]+)\s+from\s+['"](\.\/routes\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(serverText))) {
    importFile[m[1]] = path.join(BACKEND, m[2]);
  }
}

// app-function-style calls: xxxRoutes(app, ...)  (bare call, not inside app.use(...))
const appFunctionStyleVars = new Set();
{
  const re = /^([A-Za-z0-9_]+)\(app[,)]/gm;
  let m;
  while ((m = re.exec(serverText))) {
    appFunctionStyleVars.add(m[1]);
  }
}

// server.js inline routes (defined directly in server.js, not in routes/*.js)
const inlineRoutes = [];
{
  const re = /\bapp\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(serverText))) {
    inlineRoutes.push({ method: m[1], path: m[2], file: 'server.js (inline)' });
  }
}

// per-route-file extraction
const routesDir = path.join(BACKEND, 'routes');
const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

const allRoutes = [...inlineRoutes];
for (const rf of routeFiles) {
  const full = path.join(routesDir, rf);
  const text = fs.readFileSync(full, 'utf8');
  const re = /\b(?:router|app)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
  const reGeneric = /\b(?:router|app)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  let m;
  const bareHandlerRoutes = new Map(); // "method /path" -> handlerName, for bare-reference calls like router.get('/x', gone)
  while ((m = re.exec(text))) {
    bareHandlerRoutes.set(`${m[1]} ${m[2]}`, m[3]);
  }
  const matchPositions = [];
  reGeneric.lastIndex = 0;
  while ((m = reGeneric.exec(text))) {
    matchPositions.push({ method: m[1], subpath: m[2], index: m.index });
  }
  // per-route stub detection: a route is a "410 stub" ONLY if its handler is the
  // BARE function reference `gone` with no other args (`router.get('/x', gone)`).
  // This is deliberately narrow — an earlier version of this scanner used a loose
  // `\bgone\b` substring match over the whole handler body slice, which produced a
  // false positive on routes/share.js's `/api/p/:token`: that route has a
  // substantive handler that conditionally returns `res.status(410).json({error:
  // 'gone'})` for one specific expired-token case (a normal, working, per-request
  // conditional — not "this whole endpoint is dead"), and the file also has a CSS
  // class literally named `.gone` in an inline HTML template. Both matched the loose
  // regex. The bare-reference check fixes this: only the four known-dead files
  // (category/search/audio/home routes) actually delegate the ENTIRE handler to a
  // shared `gone(req,res){ res.status(410)... }` function by passing it as a bare
  // callback, which is what makes them structurally different from a route that
  // merely CAN return 410 sometimes.
  const localPaths = matchPositions.map((p) => {
    const handlerName = bareHandlerRoutes.get(`${p.method} ${p.subpath}`);
    return { method: p.method, subpath: p.subpath, isStub: handlerName === 'gone' };
  });
  // is this file's export a router object (mounted via app.use(prefix, X)) or a
  // function(app) that registers absolute paths directly?
  // Heuristic: if any extracted subpath already starts with '/api/', it's app-function-style.
  const looksAbsolute = localPaths.some((p) => p.subpath.startsWith('/api/') || p.subpath.startsWith('/.well-known') || p.subpath === '/');
  // find the mount prefix for this file: either declared in server.js
  // (app.use('/api/x', xRoutes)), OR mounted INSIDE the file itself via a nested
  // `app.use('/api/x', ..., router)` call (e.g. admin.js does this with its own
  // requireAuth/requireAdmin middleware chain — server.js just calls `adminRoutes(app)`
  // with no visible prefix, the real prefix is hidden inside the file).
  const importVarForFile = Object.entries(importFile).find(([, f]) => f === full)?.[0];
  let prefix = importVarForFile ? routerMountPrefix[importVarForFile] : undefined;
  if (!prefix) {
    const inFileMount = text.match(/app\.use\(\s*['"]([^'"]+)['"][^)]*\brouter\b/);
    if (inFileMount) prefix = inFileMount[1];
  }

  for (const p of localPaths) {
    let fullPath;
    if (looksAbsolute || !prefix) {
      fullPath = p.subpath;
    } else {
      fullPath = prefix.replace(/\/$/, '') + (p.subpath === '/' ? '' : p.subpath);
    }
    allRoutes.push({ method: p.method, path: fullPath, file: `routes/${rf}`, stubCandidate: p.isStub });
  }
}

// ---- frontend hit check ----
function frontendHit(routePath) {
  // strip :param segments to a prefix match usable in grep, e.g. /api/audio/:youtubeId -> /api/audio/
  const stripped = routePath.replace(/\/:[^/]+/g, '');
  const safe = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out;
  try {
    out = execSync(
      `grep -rlF ${JSON.stringify(stripped)} --include='*.js' --include='*.jsx' ${JSON.stringify(
        FRONTEND
      )} --exclude-dir=node_modules --exclude-dir=android --exclude-dir=ios --exclude-dir=dist || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
}

// ---- deprecatedRouteHits persisted counter ----
const metricsPath = path.join(BACKEND, 'logs/metrics/ops-metrics.json');
let deprecatedRouteHits = {};
let hourlyDeprecated = {};
if (fs.existsSync(metricsPath)) {
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  deprecatedRouteHits = metrics.total?.deprecatedRouteHits || {};
  for (const [hour, bucket] of Object.entries(metrics.hourly || {})) {
    if (bucket.deprecatedRouteHits && Object.keys(bucket.deprecatedRouteHits).length) {
      hourlyDeprecated[hour] = bucket.deprecatedRouteHits;
    }
  }
}

const results = allRoutes.map((r) => {
  const fHits = frontendHit(r.path);
  const strippedForCounter = r.path.replace(/\/:[^/]+/g, '');
  // deprecatedRouteHits keys are recorded by the actual mounted base path (e.g. "/api/search"),
  // match by prefix containment.
  const depHitKey = Object.keys(deprecatedRouteHits).find((k) => r.path.startsWith(k) || k.startsWith(strippedForCounter));
  return {
    method: r.method,
    path: r.path,
    file: r.file,
    stubCandidate: !!r.stubCandidate,
    frontendHitCount: fHits.length,
    frontendHitFiles: fHits.slice(0, 3).map((f) => path.relative(ROOT, f)),
    deprecatedRouteHitKey: depHitKey || null,
    deprecatedRouteHitCount: depHitKey ? deprecatedRouteHits[depHitKey] : 0,
  };
});

// positive control: /api/hymns must be mounted, frontend-hit, and NOT flagged as stub
const hymnsCtl = results.find((r) => r.path === '/api/hymns');
const controlPass = hymnsCtl && hymnsCtl.frontendHitCount > 0 && !hymnsCtl.stubCandidate;

const output = {
  scanner: 'S5-backend-route',
  totalRoutes: results.length,
  zeroFrontendHit: results.filter((r) => r.frontendHitCount === 0),
  stubCandidates: results.filter((r) => r.stubCandidate),
  deprecatedRouteHitsRaw: deprecatedRouteHits,
  deprecatedRouteHitsHourly: hourlyDeprecated,
  routes: results,
  positiveControl: {
    '/api/hymns': hymnsCtl
      ? { frontendHitCount: hymnsCtl.frontendHitCount, stubCandidate: hymnsCtl.stubCandidate }
      : 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S5 POSITIVE CONTROL FAILED (/api/hymns expected frontend-hit and non-stub)');
  process.exit(1);
}
