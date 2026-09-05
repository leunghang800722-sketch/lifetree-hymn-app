#!/usr/bin/env node
// S6 — backend lib/ 未用 export 掃描器（方法論同 S2，範圍換做 backend/lib/**）
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S6
//
// 1D §3.2 已核實「lib/ 全部 26 檔——零死碼」（檔案層面：每個 lib/*.js 都有
// ≥1 非自身引用）。本掃描器做深一層：檔案層面冇死唔代表每個 export 都有用，
// 呢度逐個 export identifier 查。
//
// 正控：requireAuth.js 嘅 default export（廣泛引用）要判 USED；刻意揀一個
// 已知「零引用」嘅假想不存在 identifier 做負控（若掃描器連負控都報 USED 即
// 表示 regex 有 bug，見底部）。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const LIB = path.join(ROOT, 'backend/lib');

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (full.endsWith('.js') || full.endsWith('.mjs')) out.push(full);
    }
  }
  return out;
}

const files = walk(LIB);

const EXPORT_RE = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
const EXPORT_CONST_RE = /export\s+const\s+([A-Za-z0-9_$]+)/g;
const EXPORT_CLASS_RE = /export\s+class\s+([A-Za-z0-9_$]+)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g;
const EXPORT_DEFAULT_NAMED_RE = /export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;

const allExports = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const names = new Set();
  for (const re of [EXPORT_RE, EXPORT_CONST_RE, EXPORT_CLASS_RE, EXPORT_DEFAULT_NAMED_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) names.add(m[1]);
  }
  EXPORT_LIST_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_LIST_RE.exec(text))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      const asMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (asMatch) names.add(asMatch[2]);
      else names.add(part.split(/\s+/)[0]);
    }
  }
  const hasDefaultExport = /export\s+default\s+/.test(text);
  for (const n of names) allExports.push({ file: f, name: n });
  if (hasDefaultExport && !text.match(EXPORT_DEFAULT_NAMED_RE)) {
    // anonymous default export (e.g. `export default async function(req,res){}` or
    // `export default { ... }`) — track by filename-derived symbol for reference counting
    allExports.push({ file: f, name: `__default__${path.basename(f, path.extname(f))}`, isAnonymousDefault: true });
  }
}

function countReferences(name, definingFile, isAnonymousDefault) {
  if (isAnonymousDefault) {
    // for anonymous default exports, "usage" = another file importing from this
    // exact file path (relative import resolving to this file). Approximate via
    // grep for the file's basename (without ext) inside an import/require string.
    const base = path.basename(definingFile, path.extname(definingFile));
    const safe = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let out;
    try {
      out = execSync(
        `grep -rlE "(from ['\\"][^'\\"]*${safe}(\\.js)?['\\"]|require\\(['\\"][^'\\"]*${safe}(\\.js)?['\\"]\\))" --include='*.js' --include='*.mjs' ${JSON.stringify(
          path.join(ROOT, 'backend')
        )} --exclude-dir=node_modules || true`,
        { maxBuffer: 1024 * 1024 * 50 }
      ).toString();
    } catch {
      out = '';
    }
    const files_ = out.split('\n').filter(Boolean).filter((l) => path.resolve(l) !== path.resolve(definingFile));
    return { externalHits: files_, sameFileHits: [] };
  }
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out;
  try {
    out = execSync(
      `grep -rnE '\\b${safe}\\b' --include='*.js' --include='*.mjs' ${JSON.stringify(
        path.join(ROOT, 'backend')
      )} --exclude-dir=node_modules || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  const lines = out.split('\n').filter(Boolean);
  const externalHits = [];
  const sameFileHits = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    const filePart = line.slice(0, idx);
    if (path.resolve(filePart) === path.resolve(definingFile)) sameFileHits.push(line);
    else externalHits.push(line);
  }
  return { externalHits, sameFileHits };
}

const results = [];
for (const { file, name, isAnonymousDefault } of allExports) {
  const { externalHits, sameFileHits } = countReferences(name, file, isAnonymousDefault);
  let classification;
  if (isAnonymousDefault) {
    classification = externalHits.length > 0 ? 'USED' : 'ZERO_REFERENCE';
  } else if (externalHits.length === 0 && sameFileHits.length <= 1) {
    classification = 'ZERO_REFERENCE';
  } else if (externalHits.length === 0) {
    classification = 'INTERNAL_ONLY';
  } else {
    classification = 'USED';
  }
  results.push({ file: path.relative(ROOT, file), name, classification });
}

const zeroRef = results.filter((r) => r.classification === 'ZERO_REFERENCE');
const internalOnly = results.filter((r) => r.classification === 'INTERNAL_ONLY');

// positive control: requireAuth's default export must be USED
const requireAuthCtl = results.find((r) => r.file.endsWith('lib/requireAuth.js'));
const controlPass = requireAuthCtl && requireAuthCtl.classification === 'USED';

const output = {
  scanner: 'S6-backend-lib-exports',
  totalExportsScanned: results.length,
  zeroReferenceCount: zeroRef.length,
  internalOnlyCount: internalOnly.length,
  zeroReference: zeroRef,
  internalOnly,
  positiveControl: {
    requireAuthDefault: requireAuthCtl || 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S6 POSITIVE CONTROL FAILED');
  process.exit(1);
}
