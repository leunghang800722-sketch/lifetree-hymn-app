#!/usr/bin/env node
// S3 — icon/asset reference scanner
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S3
//
// odeIcons.js 每個 top-level key（icon name）喺全 repo 搵 `<OdeIcon name="X"`
// 或 `icon: "X"` / `icon: 'X'` 呢類引用；assets/ 每個檔喺全 repo 搵 require 引用
// （含 app.json 靜態路徑欄位）。
//
// 正控：已知有用 icon "close" 要命中。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const FRONTEND = path.join(ROOT, 'frontend/hymn-app');
const ICONS_FILE = path.join(FRONTEND, 'src/icons/odeIcons.js');
const ASSETS_DIR = path.join(FRONTEND, 'assets');

// ---- icons ----
const iconsText = fs.readFileSync(ICONS_FILE, 'utf8');
// find "export const ODE_ICONS = {" then parse top-level keys by indentation/brace depth
const startIdx = iconsText.indexOf('ODE_ICONS = {');
const body = iconsText.slice(startIdx);
const iconNames = [];
{
  // walk char by char tracking brace depth; a key at depth 1 (inside ODE_ICONS object,
  // before its own nested value braces) is a top-level icon name.
  let depth = 0;
  let i = body.indexOf('{'); // the ODE_ICONS opening brace
  depth = 1;
  i++;
  const KEY_RE = /^\s*([A-Za-z0-9_$]+)\s*:\s*\{/;
  while (i < body.length && depth > 0) {
    const ch = body[i];
    if (ch === '{') {
      if (depth === 1) {
        // look backwards from i to line start to grab key name
        const lineStart = body.lastIndexOf('\n', i) + 1;
        const linePrefix = body.slice(lineStart, i + 1);
        const m = linePrefix.match(KEY_RE);
        if (m) iconNames.push(m[1]);
      }
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    i++;
  }
}

function grepHits(pattern) {
  let out;
  try {
    out = execSync(
      `grep -rnE ${JSON.stringify(pattern)} --include='*.js' --include='*.jsx' ${JSON.stringify(
        FRONTEND
      )} --exclude-dir=node_modules --exclude-dir=android --exclude-dir=ios --exclude-dir=dist || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
}

const iconResults = iconNames.map((name) => {
  // exclude the definition line itself (odeIcons.js "name: {") by requiring the
  // reference pattern to be a usage form: name="X" / name:'X' / name={"X"} / or
  // a ternary inside name={...} (e.g. name={isPlaying ? 'pause' : 'play'}) —
  // the ternary form was a real false-negative found during S3 dev (icon "pause"
  // only appears as one branch of a ternary, not directly after name=).
  const pattern = `(name=["']${name}["']|icon:\\s*["']${name}["']|name=\\{[^}]*["']${name}["'][^}]*\\})`;
  const hits = grepHits(pattern).filter((l) => !l.includes('src/icons/odeIcons.js'));
  return { name, hitCount: hits.length, hits: hits.slice(0, 5), classification: hits.length > 0 ? 'USED' : 'ZERO_REFERENCE' };
});

// ---- assets ----
function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

const assetFiles = fs.existsSync(ASSETS_DIR) ? walk(ASSETS_DIR) : [];
const appJsonText = fs.readFileSync(path.join(FRONTEND, 'app.json'), 'utf8');

const assetResults = assetFiles.map((f) => {
  const base = path.basename(f);
  const rel = path.relative(FRONTEND, f);
  const inAppJson = appJsonText.includes(base);
  const hits = grepHits(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // metro pixel-density convention: foo@2x.png / foo@3x.png ride along with foo.png's
  // require() even though nothing literally requires the @2x/@3x filename.
  const densityMatch = base.match(/^(.*)@[23]x(\.[a-z]+)$/);
  let densityBaseUsed = false;
  if (densityMatch) {
    const baseName = densityMatch[1] + densityMatch[2];
    const baseHits = grepHits(baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    densityBaseUsed = baseHits.length > 0;
  }
  let classification;
  if (hits.length > 0 || inAppJson) classification = 'USED';
  else if (densityBaseUsed) classification = 'USED_VIA_DENSITY_CONVENTION';
  else classification = 'ZERO_REFERENCE';
  return { file: rel, inAppJson, directHitCount: hits.length, classification };
});

// positive control: "close" icon must hit
const closeCtl = iconResults.find((r) => r.name === 'close');
const controlPass = closeCtl && closeCtl.classification === 'USED';

const output = {
  scanner: 'S3-icon-asset',
  iconCount: iconResults.length,
  iconZeroRef: iconResults.filter((r) => r.classification === 'ZERO_REFERENCE'),
  assetCount: assetResults.length,
  assetZeroRef: assetResults.filter((r) => r.classification === 'ZERO_REFERENCE'),
  assetDensityConvention: assetResults.filter((r) => r.classification === 'USED_VIA_DENSITY_CONVENTION'),
  positiveControl: {
    close: closeCtl ? closeCtl.classification : 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S3 POSITIVE CONTROL FAILED');
  process.exit(1);
}
