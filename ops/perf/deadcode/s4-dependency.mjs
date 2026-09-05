#!/usr/bin/env node
// S4 — 前端依賴引用掃描器
// DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md §1.1 S4
//
// package.json 每個 dependency 喺 import/require 命中 + app.json plugins +
// babel.config/metro.config + config plugin require()。每個 depcheck 假陽性
// 要人手核——1A DEP-003（expo-font）已知係假陽性範本：唔喺任何 JS import，
// 但係 app.json plugins 陣列用嚟配置字型（config-plugin-only 依賴）。
//
// 正控：expo-font 一定要被判「有用」（透過 app.json plugins，唔係透過 JS import）。

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const FRONTEND = path.join(ROOT, 'frontend/hymn-app');
const PKG = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'package.json'), 'utf8'));

const deps = { ...(PKG.dependencies || {}), ...(PKG.devDependencies || {}) };

const appJsonText = fs.readFileSync(path.join(FRONTEND, 'app.json'), 'utf8');
const babelText = fs.existsSync(path.join(FRONTEND, 'babel.config.js'))
  ? fs.readFileSync(path.join(FRONTEND, 'babel.config.js'), 'utf8')
  : '';
const metroPath = path.join(FRONTEND, 'metro.config.js');
const metroText = fs.existsSync(metroPath) ? fs.readFileSync(metroPath, 'utf8') : '';

// plugin files (config plugins referenced from app.json's "plugins" array)
const pluginFiles = [];
{
  const pluginsDir = path.join(FRONTEND, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    for (const f of fs.readdirSync(pluginsDir)) pluginFiles.push(fs.readFileSync(path.join(pluginsDir, f), 'utf8'));
  }
}

function grepImportHits(depName) {
  const safe = depName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out;
  try {
    out = execSync(
      `grep -rlE "(from ['\\"]${safe}['\\"]|require\\(['\\"]${safe}['\\"]\\)|from ['\\"]${safe}/|require\\(['\\"]${safe}/|import\\(['\\"]${safe}['\\"]\\)|import\\(['\\"]${safe}/)" --include='*.js' --include='*.jsx' ${JSON.stringify(
        FRONTEND
      )} --exclude-dir=node_modules --exclude-dir=android --exclude-dir=ios --exclude-dir=dist || true`,
      { maxBuffer: 1024 * 1024 * 50 }
    ).toString();
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
}

const results = [];
for (const dep of Object.keys(deps)) {
  const jsHits = grepImportHits(dep);
  const inAppJsonPlugins = appJsonText.includes(dep);
  const inBabelConfig = babelText.includes(dep);
  const inMetroConfig = metroText.includes(dep);
  const inConfigPlugin = pluginFiles.some((t) => t.includes(dep));

  let classification;
  let evidence;
  if (jsHits.length > 0) {
    classification = 'USED_JS_IMPORT';
    evidence = `${jsHits.length} file(s), e.g. ${path.relative(ROOT, jsHits[0])}`;
  } else if (inAppJsonPlugins) {
    classification = 'USED_CONFIG_PLUGIN_ONLY';
    evidence = 'app.json plugins array (config-plugin-only dependency, e.g. expo-font fonts config)';
  } else if (inBabelConfig) {
    classification = 'USED_BABEL_CONFIG';
    evidence = 'babel.config.js';
  } else if (inMetroConfig) {
    classification = 'USED_METRO_CONFIG';
    evidence = 'metro.config.js';
  } else if (inConfigPlugin) {
    classification = 'USED_VIA_PLUGIN_FILE';
    evidence = 'referenced inside plugins/*.js';
  } else {
    classification = 'NO_DIRECT_HIT_NEEDS_MANUAL_CHECK';
    evidence = 'zero import/require + not in app.json/babel/metro/plugin files — likely transitive-only or needs manual depcheck-style review';
  }

  results.push({ name: dep, version: deps[dep], classification, evidence });
}

const noDirect = results.filter((r) => r.classification === 'NO_DIRECT_HIT_NEEDS_MANUAL_CHECK');

// positive control: expo-font must be judged "used" (via config plugin, not JS import)
const expoFontCtl = results.find((r) => r.name === 'expo-font');
const controlPass = expoFontCtl && expoFontCtl.classification === 'USED_CONFIG_PLUGIN_ONLY';

const output = {
  scanner: 'S4-dependency',
  totalDeps: results.length,
  results,
  noDirectHitNeedsManualCheck: noDirect,
  positiveControl: {
    'expo-font': expoFontCtl ? expoFontCtl.classification : 'NOT_FOUND',
    pass: controlPass,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!controlPass) {
  console.error('S4 POSITIVE CONTROL FAILED (expo-font expected USED_CONFIG_PLUGIN_ONLY)');
  process.exit(1);
}
