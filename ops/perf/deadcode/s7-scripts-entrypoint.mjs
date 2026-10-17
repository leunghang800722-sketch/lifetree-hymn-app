#!/usr/bin/env node
// S7 — backend scripts / ops 入口掃描器
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S7
//
// 每個 backend/scripts/*.js 、ops/**/*.{sh,mjs,py} 查 4 條入口：
//   (a) 12 個 ~/Library/LaunchAgents/com.hymn*.plist 嘅 ProgramArguments
//   (b) 其他 script 用 execFile/spawn/require/import/`node ...`/`bash ...` 呼叫佢
//   (c) package.json scripts
//   (d) *.md 文件提及（只算「有記錄」，唔算入口——執行單明文規定）
//
// 標三類：「排程」(a命中)、「人手 CLI」(b/c命中，或者冇任何入口但睇落係
// 設計成人手執行嘅工具——呢類淨係列出嚟俾人手覆核,唔自動判)、「零入口」
// (abc 都冇命中)。
//
// 正控：growLibrary.js 一定要判「排程」。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');

// ---- (a) plist ProgramArguments ----
const plistDir = path.join(os.homedir(), 'Library/LaunchAgents');
const plistFiles = fs.existsSync(plistDir)
  ? fs.readdirSync(plistDir).filter((f) => /^com\.hymn.*\.plist$/.test(f))
  : [];

const scheduledScriptPaths = new Set();
for (const pf of plistFiles) {
  const full = path.join(plistDir, pf);
  let xml;
  try {
    xml = execSync(`plutil -extract ProgramArguments xml1 -o - ${JSON.stringify(full)}`, { maxBuffer: 1024 * 1024 }).toString();
  } catch {
    continue;
  }
  const strs = [...xml.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  for (const s of strs) {
    if (s.includes('/hymn-app/')) {
      scheduledScriptPaths.add(path.resolve(s));
    }
  }
}

// ---- candidate files ----
function walk(dir, filterExt) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (filterExt.some((e) => full.endsWith(e))) out.push(full);
    }
  }
  return out;
}

const backendScripts = walk(path.join(ROOT, 'backend/scripts'), ['.js', '.mjs']);
const opsScripts = walk(path.join(ROOT, 'ops'), ['.sh', '.mjs', '.py']);
const allScripts = [...backendScripts, ...opsScripts];

// ---- (c) package.json scripts (both frontend + backend) ----
const pkgScriptsText = [
  path.join(ROOT, 'backend/package.json'),
  path.join(ROOT, 'frontend/hymn-app/package.json'),
]
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')).scripts || {}))
  .join(' ');

// ---- (e) .claude/settings.json hooks — a 4th real entry-point kind found during
// S7 dev: ops/deploy/session-cleanup-ios.sh is NOT in any plist/cross-script/
// package.json, but IS wired as a SessionEnd hook command in .claude/settings.json
// (see CLAUDE.md). Without this check it would false-positive as "零入口".
const claudeSettingsPath = path.join(ROOT, '.claude/settings.json');
const claudeSettingsText = fs.existsSync(claudeSettingsPath) ? fs.readFileSync(claudeSettingsPath, 'utf8') : '';

// ---- (b) cross-script references: build a combined text corpus of all scripts +
// backend/server.js + backend/routes + ops docs are EXCLUDED (docs don't count as
// entry point per exec order) ----
const corpusFiles = [
  ...allScripts,
  path.join(ROOT, 'backend/server.js'),
  ...walk(path.join(ROOT, 'backend/routes'), ['.js']),
  ...walk(path.join(ROOT, 'backend/lib'), ['.js']),
];
const corpus = corpusFiles.map((f) => {
  try {
    return { file: f, text: fs.readFileSync(f, 'utf8') };
  } catch {
    return { file: f, text: '' };
  }
});

function referencedByOtherScript(scriptFile) {
  const base = path.basename(scriptFile);
  const hits = [];
  for (const { file, text } of corpus) {
    if (path.resolve(file) === path.resolve(scriptFile)) continue;
    if (text.includes(base)) hits.push(path.relative(ROOT, file));
  }
  return hits;
}

const results = allScripts.map((f) => {
  const rel = path.relative(ROOT, f);
  const isScheduled = scheduledScriptPaths.has(path.resolve(f));
  const crossRefs = referencedByOtherScript(f);
  const inPkgScripts = pkgScriptsText.includes(path.basename(f));
  const inClaudeHook = claudeSettingsText.includes(path.basename(f));
  let classification;
  if (isScheduled) classification = '排程';
  else if (inClaudeHook) classification = 'Claude hook（.claude/settings.json）';
  else if (crossRefs.length > 0 || inPkgScripts) classification = '人手CLI或被其他script呼叫';
  else classification = '零入口（未搵到任何a/b/c/hook命中，需人手核實係咪設計為獨立人手工具）';
  return {
    file: rel,
    classification,
    scheduledPlist: isScheduled
      ? plistFiles.find((pf) => {
          try {
            const xml = execSync(
              `plutil -extract ProgramArguments xml1 -o - ${JSON.stringify(path.join(plistDir, pf))}`
            ).toString();
            return xml.includes(path.basename(f));
          } catch {
            return false;
          }
        })
      : null,
    crossRefFiles: crossRefs.slice(0, 5),
    inPackageJsonScripts: inPkgScripts,
  };
});

const zeroEntry = results.filter((r) => r.classification.startsWith('零入口'));

// positive control: growLibrary.js must be "排程"
const growLibCtl = results.find((r) => r.file.endsWith('backend/scripts/growLibrary.js'));
const controlPass = growLibCtl && growLibCtl.classification === '排程';

const output = {
  scanner: 'S7-scripts-entrypoint',
  totalScripts: results.length,
  scheduledCount: results.filter((r) => r.classification === '排程').length,
  claudeHookCount: results.filter((r) => r.classification === 'Claude hook（.claude/settings.json）').length,
  manualCliCount: results.filter((r) => r.classification === '人手CLI或被其他script呼叫').length,
  zeroEntryCount: zeroEntry.length,
  zeroEntry,
  results,
  positiveControl: {
    growLibrary: growLibCtl ? growLibCtl.classification : 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S7 POSITIVE CONTROL FAILED (growLibrary.js expected 排程)');
  process.exit(1);
}
