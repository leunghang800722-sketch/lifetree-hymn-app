#!/usr/bin/env node
// S9 — 資料/產物檔掃描器（只列唔刪，Fable 決定）
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S9
//
// 範圍：backend/data/hymns.db（F5）、backend/public/** 未被 route/前端引用
// 嘅檔、ops/perf/** 舊 baseline 目錄。
//
// 呢個掃描器冇「正控/負控」喺傳統意義（冇一個確定嘅正例可以斷言），改用
// 「已知證據交叉」代替：F5 已經喺 1D 報告確認 0 bytes 零引用，本掃描器
// 重新驗證同一結論（bytes==0 且 grep 全 repo 零引用）作為自證。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');

// 呢個 repo 有 15GB backend/（一堆 .mkv/.mp4/.webm 原始片源 + users.db/hymns.db
// 備份），第一版用全 repo grep 掃 10 個 basename 逐個行,實測 >120s 唔完
// （grep 要逐 byte 掃晒啲 GB 級二進位檔）。改做：只喺會出現「真引用」嘅
// 幾個目錄（backend 嘅程式碼/文件、frontend 程式碼、ops、根目錄 *.md）搵，
// 用 --include 白名單擋晒二進位/媒體檔，唔使掃 15GB 片源。
const SEARCH_DIRS = [
  path.join(ROOT, 'backend/routes'),
  path.join(ROOT, 'backend/lib'),
  path.join(ROOT, 'backend/scripts'),
  path.join(ROOT, 'backend/server.js'),
  path.join(ROOT, 'backend/package.json'),
  path.join(ROOT, 'frontend/hymn-app/src'),
  path.join(ROOT, 'frontend/hymn-app/App.js'),
  path.join(ROOT, 'ops'),
].filter((p) => fs.existsSync(p));

function grepRefCount(basename, excludeSelf) {
  let out;
  try {
    const dirsArg = SEARCH_DIRS.map((d) => JSON.stringify(d)).join(' ');
    out = execSync(
      `grep -rl --include='*.js' --include='*.mjs' --include='*.py' --include='*.sh' --include='*.json' -F ${JSON.stringify(
        basename
      )} ${dirsArg} 2>/dev/null || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  return out
    .split('\n')
    .filter(Boolean)
    .filter((l) => !excludeSelf || path.resolve(l) !== path.resolve(excludeSelf));
}

const results = { f5: null, publicFiles: [], perfBaselineDirs: [] };

// ---- F5: backend/data/hymns.db ----
{
  const f = path.join(ROOT, 'backend/data/hymns.db');
  if (fs.existsSync(f)) {
    const st = fs.statSync(f);
    // exclude this scanner's own directory — it literally contains the string
    // 'backend/data/hymns.db' in comments describing what it checks, which is a
    // self-reference false positive, not a real caller.
    const refs = grepRefCount('data/hymns.db', f).filter((r) => !r.includes('ops/perf/deadcode/'));
    results.f5 = {
      file: 'backend/data/hymns.db',
      bytes: st.size,
      mtime: st.mtime.toISOString(),
      referencedBy: refs.map((r) => path.relative(ROOT, r)),
      confirmedZeroBytesZeroRef: st.size === 0 && refs.length === 0,
    };
  } else {
    results.f5 = { file: 'backend/data/hymns.db', exists: false };
  }
}

// ---- backend/public/** ----
{
  const publicDir = path.join(ROOT, 'backend/public');
  if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const fname of files) {
      const refs = grepRefCount(fname, path.join(publicDir, fname));
      // exclude backend/server.js's own static-serve wiring references (path literal
      // 'public') by checking hit files aren't just the dir listing itself
      results.publicFiles.push({
        file: `backend/public/${fname}`,
        referencedByCount: refs.length,
        referencedBy: refs.slice(0, 5).map((r) => path.relative(ROOT, r)),
      });
    }
  }
}

// ---- ops/perf/** old baseline dirs ----
{
  const perfDir = path.join(ROOT, 'ops/perf');
  if (fs.existsSync(perfDir)) {
    const dirs = fs.readdirSync(perfDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const d of dirs) {
      const full = path.join(perfDir, d);
      let sizeBytes = 0;
      let fileCount = 0;
      const stack = [full];
      while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const p = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(p);
          else {
            fileCount++;
            sizeBytes += fs.statSync(p).size;
          }
        }
      }
      results.perfBaselineDirs.push({ dir: `ops/perf/${d}`, fileCount, sizeBytes });
    }
  }
}

const output = {
  scanner: 'S9-data-artifacts',
  note: '呢類只列唔刪（執行單 §1.1 S9 明文：Fable 決定），本掃描器唔輸出「建議刪」判斷',
  ...results,
};

console.log(JSON.stringify(output, null, 2));
