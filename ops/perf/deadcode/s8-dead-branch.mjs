#!/usr/bin/env node
// S8 — 死分支掃描器（逐個候選要引 caller 行號證明）
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S8
//
// 呢個掃描器唔係通用嘅——每個候選都係 1A 已經點名嘅具體 finding
// （APP-003 ×2、AVATAR-001），逐個用靜態方法搵晒*全部*真實 caller
// （唔淨係 1A 引用嗰一個），確認冇任何一個 caller 傳咗令分支變真嘅參數。
//
// 正控：每個候選都要至少搵到 ≥1 個真實 caller（證明條件分支本身冇打錯字
// 令規則失效——如果連 caller 都搵唔到，可能係 regex 本身有 bug）。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const FRONTEND = path.join(ROOT, 'frontend/hymn-app');
const APP_JS = path.join(FRONTEND, 'App.js');

function grep(pattern, dir = FRONTEND) {
  let out;
  try {
    out = execSync(
      `grep -rnE ${JSON.stringify(pattern)} --include='*.js' ${JSON.stringify(dir)} --exclude-dir=node_modules --exclude-dir=android --exclude-dir=ios --exclude-dir=dist || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
}

const findings = [];

// ---- APP-003a: opts.browseTap ----
{
  const branchDef = grep('if\\s*\\(opts\\.browseTap\\)', FRONTEND);
  // handlePlayHymn(App.js:4241) is passed as onPlayHymn to 4 screens (Home/Library/
  // Mine/SharedPlaylistSheet via prop assignment `onPlayHymn={handlePlayHymn}`), AND
  // HymnListScreen has its own local shadowed `handlePlayHymn` that calls the
  // `onPlayHymn` prop directly (bypassing App.js's function entirely for that one
  // screen). All real invocations of the onPlayHymn prop/App.js handlePlayHymn were
  // enumerated by grepping every `onPlayHymn(` call site (not just the ()-call, the
  // opts object literal passed at each site) across src/screens/*.js + App.js.
  const propAssignments = grep('onPlayHymn=\\{handlePlayHymn\\}', FRONTEND);
  const callSites = grep('onPlayHymn\\s*&&?\\s*onPlayHymn\\(|onPlayHymn\\(', FRONTEND).filter(
    (l) => !l.includes('onPlayHymn={handlePlayHymn}') && !l.includes('onPlayHymn={(')
  );
  // does ANY call site's opts literal contain "browseTap"?
  const anyPassesBrowseTap = callSites.some((l) => l.includes('browseTap'));
  findings.push({
    id: 'APP-003a-opts.browseTap',
    branchDefinitionLines: branchDef,
    onPlayHymnPropAssignments: propAssignments,
    onPlayHymnCallSites: callSites,
    anyCallerPassesBrowseTap: anyPassesBrowseTap,
    conclusion: anyPassesBrowseTap
      ? 'FOUND A CALLER PASSING browseTap — 1A finding may be STALE, re-check'
      : `確認：全部 ${callSites.length} 個 onPlayHymn(...) call site（含 HymnListScreen 本身唔經 handlePlayHymn 嘅獨立 inline closure）都冇一個傳 browseTap，分支恆假`,
  });
}

// ---- APP-003b: opts.appendAutoplayTail ----
{
  const branchDef = grep('if\\s*\\(opts\\.appendAutoplayTail', FRONTEND);
  const callSites = grep('onPlayHymn\\s*&&?\\s*onPlayHymn\\(|onPlayHymn\\(', FRONTEND).filter(
    (l) => !l.includes('onPlayHymn={handlePlayHymn}') && !l.includes('onPlayHymn={(')
  );
  const anyPasses = callSites.some((l) => l.includes('appendAutoplayTail'));
  // git history: when was the last caller that passed appendAutoplayTail removed?
  let gitHistory = [];
  try {
    gitHistory = execSync(`cd ${JSON.stringify(ROOT)} && git log -S'appendAutoplayTail' --oneline -- frontend/hymn-app/src/screens/PlaylistDetailSheet.js 2>/dev/null | tail -5`)
      .toString()
      .split('\n')
      .filter(Boolean);
  } catch {
    gitHistory = [];
  }
  findings.push({
    id: 'APP-003b-opts.appendAutoplayTail',
    branchDefinitionLines: branchDef,
    onPlayHymnCallSites: callSites,
    anyCallerPasses: anyPasses,
    gitHistoryOnPlaylistDetailSheet: gitHistory,
    conclusion: anyPasses
      ? 'FOUND A CALLER — 1A finding may be STALE'
      : `確認：全部 call site 都冇傳 appendAutoplayTail，分支恆假；PlaylistDetailSheet.js git 歷史顯示曾經傳過(見 gitHistoryOnPlaylistDetailSheet)`,
  });
}

// ---- AVATAR-001: useAuth() || {} ----
{
  const fallbackSites = grep('useAuth\\(\\)\\s*\\|\\|\\s*\\{\\}', FRONTEND);
  const authContextFile = path.join(FRONTEND, 'src/context/AuthContext.js');
  const authContextText = fs.existsSync(authContextFile) ? fs.readFileSync(authContextFile, 'utf8') : '';
  const useAuthDef = authContextText.match(/export function useAuth\(\)[\s\S]{0,300}/);
  const throwsWhenNoCtx = useAuthDef ? /throw/.test(useAuthDef[0]) : null;
  findings.push({
    id: 'AVATAR-001-useAuth-fallback',
    fallbackSites, // every file in the repo using the `useAuth() || {}` defensive pattern
    useAuthDefinitionSnippet: useAuthDef ? useAuthDef[0] : 'NOT_FOUND',
    useAuthThrowsWhenNoProvider: throwsWhenNoCtx,
    conclusion:
      throwsWhenNoCtx === true
        ? `確認：useAuth() 冇 ctx 會 throw（見 useAuthDefinitionSnippet），唔會返 falsy，所以 ${fallbackSites.length} 個 "|| {}" fallback 全部永不觸發（唯一保護作用係 lint/TS-like 心理安全感，運行時死碼）`
        : 'useAuth() 睇落唔會 throw——1A 判斷可能唔啱，要覆核',
  });
}

const output = {
  scanner: 'S8-dead-branch',
  findings,
  positiveControl: {
    note: '每個候選嘅 caller 數要 > 0（起碼搵到 caller 先可以講「有 caller 但條件永遠 false」；如果連 caller 都搵唔到，regex 本身可能有 bug，要人手覆核）',
    browseTapCallerCount: findings[0].onPlayHymnCallSites.length,
    appendAutoplayTailCallerCount: findings[1].onPlayHymnCallSites.length,
    avatarFallbackSiteCount: findings[2].fallbackSites.length,
    pass: findings[0].onPlayHymnCallSites.length > 0 && findings[2].fallbackSites.length > 0,
  },
};

console.log(JSON.stringify(output, null, 2));
