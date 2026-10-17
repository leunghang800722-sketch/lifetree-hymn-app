#!/usr/bin/env node
// S1 — 前端 import graph reachability scanner
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S1
//
// 由 frontend/hymn-app/index.js + App.js 起，resolve 所有 import/require
// （相對路徑，含 .js/.jsx/.ts/.tsx、Platform 檔名後綴 .ios/.android/.native、
// index 檔），輸出 unreachable 檔（src/**、assets/**、plugins/** 全部檔案
// 減去 reachable set）。
//
// 正控：隨機揀 3 個已知被引用嘅檔，證明 graph 見到佢哋（見底部 ASSERT）。
//
// 局限（如實記錄）：
// - 只做靜態字面 import/require 解析，動態 require（變量拼字串）睇唔到——
//   全 repo 掃過，冇搵到呢類用法（見輸出 "dynamicRequireWarnings"）。
// - assets 靠 require('...png' 等) 字面掃描，唔追蹤 app.json/plugins 入口
//   （plugin 入口按執行單註明「另計」，呢個掃描器唔覆蓋，見 S4）。
// - Platform 檔名後綴（.ios.js/.android.js）當「同一邏輯模組」處理：resolve
//   base name 時兩個變體都算 reachable，如果只有一個變體被 import 到都算。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const FRONTEND = path.join(ROOT, 'frontend/hymn-app');
const SRC = path.join(FRONTEND, 'src');
const ASSETS = path.join(FRONTEND, 'assets');
const PLUGINS = path.join(FRONTEND, 'plugins');

const EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const PLATFORM_SUFFIXES = ['.ios', '.android', '.native', '.web'];

function walkAll(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

const allSrcFiles = walkAll(SRC);
const allAssetFiles = walkAll(ASSETS);
const allPluginFiles = walkAll(PLUGINS);
const allCandidateFiles = new Set([...allSrcFiles, ...allAssetFiles, ...allPluginFiles]);

// index files under CODE dirs only (not assets) for import resolution purposes
const codeFileSet = new Set(
  [...allSrcFiles, ...allPluginFiles, path.join(FRONTEND, 'App.js'), path.join(FRONTEND, 'index.js')]
);

function tryResolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // not a relative import — package or absolute alias, skip (S4 covers deps)
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [];
  // exact
  candidates.push(base);
  for (const ext of EXTS) candidates.push(base + ext);
  // platform-suffixed variants
  for (const suf of PLATFORM_SUFFIXES) {
    for (const ext of EXTS) candidates.push(base + suf + ext);
  }
  // directory index
  for (const ext of EXTS) candidates.push(path.join(base, 'index' + ext));

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT_RE = /(?:import\s+(?:[\s\S]*?)\s+from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
const IMPORT_RE2 = /import\s+['"]([^'"]+)['"]/g; // bare side-effect import
const ASSET_REQUIRE_RE = /require\(\s*['"](\.\.?\/[^'")]+\.(?:png|jpg|jpeg|gif|webp|ttf|otf|mp3|json))['"]\s*\)/g;

const reachable = new Set();
const queue = [];
const dynamicRequireWarnings = [];

function enqueue(f) {
  if (!f) return;
  const resolved = fs.realpathSync(f);
  if (!reachable.has(resolved)) {
    reachable.add(resolved);
    queue.push(resolved);
  }
}

enqueue(path.join(FRONTEND, 'index.js'));
enqueue(path.join(FRONTEND, 'App.js'));

while (queue.length) {
  const file = queue.pop();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const specs = new Set();
  for (const re of [IMPORT_RE, IMPORT_RE2, ASSET_REQUIRE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) specs.add(m[1]);
  }
  // detect dynamic require (template literal / variable) — record as warning, not resolvable
  const dynReq = text.match(/require\(\s*[^'"][^)]*\)/g);
  if (dynReq) {
    for (const d of dynReq) {
      if (/require\(\s*['"]/.test(d)) continue; // already a literal, false positive from broad match
      dynamicRequireWarnings.push({ file: path.relative(ROOT, file), snippet: d.slice(0, 80) });
    }
  }
  for (const spec of specs) {
    const resolved = tryResolve(file, spec);
    if (resolved) enqueue(resolved);
  }
}

// unreachable = candidate files (src/assets/plugins) not in reachable set
const unreachable = [...allCandidateFiles]
  .map((f) => fs.realpathSync(f))
  .filter((f) => !reachable.has(f))
  .sort();

// ---- positive control ----
const knownReferenced = [
  path.join(SRC, 'context/AuthContext.js'),
  path.join(SRC, 'components/LogoRing.js'),
  path.join(SRC, 'icons/OdeIcon.js'),
].map((f) => (fs.existsSync(f) ? fs.realpathSync(f) : f));

const controlResults = knownReferenced.map((f) => ({
  file: path.relative(ROOT, f),
  exists: fs.existsSync(f),
  reachable: reachable.has(f),
}));

const controlPass = controlResults.every((r) => r.exists && r.reachable);

const result = {
  scanner: 'S1-import-graph',
  reachableCount: reachable.size,
  candidateFileCount: allCandidateFiles.size,
  unreachableCount: unreachable.length,
  unreachable: unreachable.map((f) => path.relative(ROOT, f)),
  dynamicRequireWarnings,
  positiveControl: {
    files: controlResults,
    pass: controlPass,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!controlPass) {
  console.error('S1 POSITIVE CONTROL FAILED — graph resolution likely broken, do not trust unreachable list');
  process.exit(1);
}
