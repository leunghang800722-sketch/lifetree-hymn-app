#!/usr/bin/env node
// S2 — 前端 unused export scanner
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S2
//
// 對 frontend/hymn-app/src/** 每個 module 嘅 named/default export，全 repo
// （排除 node_modules）grep import 位置。分兩類：
//   - ZERO_REFERENCE：全 repo（連自己檔案）都搵唔到呢個 identifier 被引用
//   - INTERNAL_ONLY：只有定義嗰檔（或同一 module 內部）用到，冇第二個檔 import
// 呢兩類都要分開標——INTERNAL_ONLY 唔算「死碼」，只係 export 多咗（P3 收窄 export）。
//
// 正控：
//   1. perfMarks.js 嘅 elapsedSinceT0 —— 已知零引用，一定要落 ZERO_REFERENCE
//   2. context/AuthContext.js 嘅 useAuth —— 已知全 app 廣泛引用，一定要落 USED

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const SRC = path.join(ROOT, 'frontend/hymn-app/src');

function walk(dir, exts) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (exts.some((e) => full.endsWith(e))) out.push(full);
    }
  }
  return out;
}

const files = walk(SRC, ['.js', '.jsx', '.ts', '.tsx']);

// export patterns:
//   export function NAME(
//   export const NAME =
//   export class NAME
//   export default function NAME(  -> treat as default, name is informative only
//   export { A, B, C }
const EXPORT_RE = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
const EXPORT_CONST_RE = /export\s+const\s+([A-Za-z0-9_$]+)/g;
const EXPORT_CLASS_RE = /export\s+class\s+([A-Za-z0-9_$]+)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g;

const allExports = []; // {file, name}

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const names = new Set();
  for (const re of [EXPORT_RE, EXPORT_CONST_RE, EXPORT_CLASS_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) names.add(m[1]);
  }
  let m;
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(text))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      // handle "X as Y" -> exported name is Y
      const asMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (asMatch) names.add(asMatch[2]);
      else names.add(part.split(/\s+/)[0]);
    }
  }
  for (const n of names) allExports.push({ file: f, name: n });
}

// Use ripgrep-less grep via execSync for portability; whole-word match, exclude node_modules
function countReferences(name, definingFile) {
  // Escape regex special chars in name (identifiers are safe, but be defensive)
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out;
  try {
    out = execSync(
      `grep -rnE '\\b${safe}\\b' --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' ${JSON.stringify(
        path.join(ROOT, 'frontend/hymn-app')
      )} --exclude-dir=node_modules --exclude-dir=android --exclude-dir=ios --exclude-dir=dist || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  const lines = out.split('\n').filter(Boolean);
  const definingFileRel = definingFile;
  const externalHits = [];
  const sameFileHits = [];
  const commentOnlyHits = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    const filePart = line.slice(0, idx);
    // strip "path:lineno:" prefix to get the source line content
    const rest = line.slice(idx + 1);
    const idx2 = rest.indexOf(':');
    const content = rest.slice(idx2 + 1);
    // heuristic: if a `//` appears before the identifier's first occurrence on this
    // line, treat as comment-only mention (not a real reference). Not perfect (misses
    // block comments, doesn't parse strings), but catches the common "見返上面 X()"
    // doc-comment false-positive pattern.
    const safeForFind = name;
    const identIdx = content.indexOf(safeForFind);
    const commentIdx = content.indexOf('//');
    const isCommentOnly = commentIdx !== -1 && commentIdx < identIdx;
    if (path.resolve(filePart) === path.resolve(definingFileRel)) {
      sameFileHits.push(line);
    } else if (isCommentOnly) {
      commentOnlyHits.push(line);
    } else {
      externalHits.push(line);
    }
  }
  return { externalHits, sameFileHits, commentOnlyHits, totalLines: lines.length };
}

const results = [];
for (const { file, name } of allExports) {
  const { externalHits, sameFileHits, commentOnlyHits } = countReferences(name, file);
  // externalHits includes the export declaration line itself only if grep matched other files;
  // the declaring file's own export line is in sameFileHits already (since file===definingFile).
  // But sameFileHits includes the export decl line itself (1 line minimum). So "internal only"
  // means externalHits.length === 0 but sameFileHits.length may be 1 (just the decl) or more
  // (decl + local usage elsewhere in same file).
  let classification;
  if (externalHits.length === 0 && sameFileHits.length <= 1) {
    classification = 'ZERO_REFERENCE'; // only the declaration line itself, no usage anywhere
  } else if (externalHits.length === 0) {
    classification = 'INTERNAL_ONLY'; // used elsewhere in same file but no external importer
  } else {
    classification = 'USED';
  }
  results.push({
    file: path.relative(ROOT, file),
    name,
    classification,
    externalHitCount: externalHits.length,
    sameFileHitCount: sameFileHits.length,
    commentOnlyHitCount: commentOnlyHits.length,
  });
}

const zeroRef = results.filter((r) => r.classification === 'ZERO_REFERENCE');
const internalOnly = results.filter((r) => r.classification === 'INTERNAL_ONLY');
const used = results.filter((r) => r.classification === 'USED');

// positive controls
const elapsedCtl = results.find((r) => r.name === 'elapsedSinceT0');
const useAuthCtl = results.find((r) => r.name === 'useAuth');
const controlPass =
  elapsedCtl && elapsedCtl.classification === 'ZERO_REFERENCE' && useAuthCtl && useAuthCtl.classification === 'USED';

const output = {
  scanner: 'S2-unused-exports',
  totalExportsScanned: results.length,
  zeroReferenceCount: zeroRef.length,
  internalOnlyCount: internalOnly.length,
  usedCount: used.length,
  zeroReference: zeroRef,
  internalOnly,
  positiveControl: {
    elapsedSinceT0: elapsedCtl ? elapsedCtl.classification : 'NOT_FOUND',
    useAuth: useAuthCtl ? useAuthCtl.classification : 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S2 POSITIVE CONTROL FAILED');
  process.exit(1);
}
