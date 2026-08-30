#!/usr/bin/env node
// 分區隊列速查(LYRICS-ZOMBIE-REAPER-EXEC-20260830.md T2)。
//
// Eric 2026-08-30拍板:每班開波要先查自己分區可做draft,<10就即刻收工
// (唔准轉軌掃verified/寫新掃描器/全庫掃描)。呢個script將SOP §3步驟2
// (export → bi-freeze --refresh → bi-freeze --filter)機械化,再按
// REVIEW-LINE-SOP.md 嘅 lang + id%2 分區公式(R1=國語單數/R1b=國語雙數/
// R2=粵語單數/R2b=粵語雙數)過濾。
//
// 用法:node ops/lyrics/queuecheck.mjs R1|R1b|R2|R2b
// 輸出:
//   R1: count=N
//   ids=1,3,5,...
// exit 0 = count>=10(有貨做);exit 1 = count<10(冇貨,即刻收工);
// exit 2 = queuecheck本身壞咗(export/bi-freeze行失敗、揀錯線名等)——**唔准當冇貨**,
// 人手照SOP §3步驟2自己行export→bi-freeze→filter判斷隊列。
//
// ⚠️ export temp檔一律用 os.tmpdir(),唔准寫落 backend/(deploy gate 紅線)。

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');

const LINES = {
  R1: { lang: '國語', parity: 1 },
  R1b: { lang: '國語', parity: 0 },
  R2: { lang: '粵語', parity: 1 },
  R2b: { lang: '粵語', parity: 0 },
};

const line = process.argv[2];
if (!LINES[line]) {
  console.error('用法:node ops/lyrics/queuecheck.mjs R1|R1b|R2|R2b');
  process.exit(2);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymn-queuecheck-'));
const exportFile = path.join(tmpDir, 'export.json');
const splitDir = path.join(tmpDir, 'split');

// ⚠️ N1(Opus5驗收揪出):`process.exit()` 直接終結process,唔會等JS引擎行埋
// 呢輪嘅 `finally` —— 之前喺 try 入面直接 exit,每次call都漏低823K temp dir。
// 而家改做:exitCode存變量,try/catch/finally入面唔准exit,清完temp先真exit。
let exitCode = 2;
try {
  // SOP §3 步驟2:export draft → bi-freeze 過濾中英錯配凍結池
  execFileSync('node', ['scripts/reviewLyrics.js', '--export', '--out', exportFile], {
    cwd: BACKEND,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  execFileSync('node', [path.join(__dirname, 'bi-freeze.mjs'), '--refresh'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  execFileSync('node', [path.join(__dirname, 'bi-freeze.mjs'), '--filter', exportFile, '--out', splitDir], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const actionable = JSON.parse(fs.readFileSync(path.join(splitDir, 'actionable.json'), 'utf8'));
  const { lang, parity } = LINES[line];
  const mine = actionable.filter((it) => it.lang === lang && (it.id % 2 === parity));
  const ids = mine.map((it) => it.id);

  console.log(`${line}: count=${ids.length}`);
  console.log(`ids=${ids.join(',')}`);

  exitCode = ids.length >= 10 ? 0 : 1;
} catch (err) {
  console.error(`[queuecheck] 出錯:${err.message}`);
  // execFileSync嘅stdio係pipe,錯誤原因會匿咗喺err.stderr,之前冇印出嚟好難查。
  if (err.stderr) {
    const stderrText = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr);
    if (stderrText.trim()) console.error(`[queuecheck] stderr:\n${stderrText}`);
  }
  exitCode = 2;
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
process.exit(exitCode);
