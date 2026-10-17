#!/usr/bin/env node
// ops/perf/classify-devices.mjs — DEEP-AUDIT-W1-EXEC-20260906 B5
//
// 目的:1E(`DEEP-AUDIT-1E-TELEMETRY-20260906.md` §1)嘅「邊個 deviceId 係真
// 用戶、邊個係模擬器/session 測試殘留」判斷係人手判嘅——一 code 化,下一輪
// (after)先可以用**同一把尺**重跑,唔會因為剔除標準變咗而誤報「改善」
// (根源文件 §5 拍板 5「剔除規則 code 化」)。
//
// 用法: node ops/perf/classify-devices.mjs [--json]
//   讀 backend/logs/client-log/*.jsonl,輸出每個 deviceId 嘅
//   { platform, rows, firstSeen, lastSeen, class, reason }。
//   `--json` 輸出原始 JSON(俾 harness/其他腳本消化);冇呢個 flag 就印
//   人睇嘅表(預設)。
//
// ⚠️ 呢個腳本淨係讀 backend/logs/ 同 backend/public/app-version.json,
// 唔起 server、唔連 DB、唔改任何檔案——純離線分析工具。
//
// ── 分類規則(逐條寫明出處,1E §1 用過嘅原文為準)──────────────────
//
// R1(真機,已確認)—— deviceId 出現喺 `backend/public/app-version.json` 嘅
//   `hlsDeviceIds` 名單入面。呢個名單本身有獨立來源:`HLS-EXEC-D123-
//   GATE-20260901` §3,Eric 開一次 app 之後由佢真機 deviceId 人手填入做
//   單機 gate——即係話「呢個 id = Eric 部真 iOS 機」有 client-log 之外嘅
//   第二個來源佐證,係 1E 「唯一有第二個獨立來源確認」嘅 deviceId。
//
// R2(iOS 模擬器/測試殘留,剔除)—— 1E §1 第 2 點原文標準:
//   (a) 呢個 deviceId 淨係喺**單一曆日**出現過,**而且**
//   (b-i) 嗰日 `perfMarks`(每次冷開一條)出現 ≥2 次(=同一日開咗超過一次
//         app,唔似真人成日用一部機),**或者**
//   (b-ii) 完全冇 `perfMarks`/`perfHome`/`perfNav`/`perfRenders` 呢四種
//         「生命週期」beacon,淨得播放類 event(`nextTrackMs`/
//         `hlsStartupKick`/`nativeSkipAttributed`/…)連環爆——即冇經過
//         正常開機/首頁流程,結構上似 scripted 播放迴圈測試。
//   同 memory `project-multi-sim-clientlog-contamination`(「每個 fresh
//   模擬器/重裝 = 新 AsyncStorage = 新 deviceId」)吻合。
//
// R3(Android,未證實)—— platform === 'android' 但唔喺 R1 嘅
//   hlsDeviceIds 名單(而家個名單淨係得 iOS 一部真機,結構上唔會有
//   android 命中 R1)。1E §1 第 3 點:呢類 deviceId 冇任何獨立來源(唔知
//   係 Eric 真 Android 機定係持久化 AVD `hymntest`),一律標
//   `unverified`,唔可以當真用戶 baseline。
//
// R4(其他/未分類)—— 唔中 R1/R2/R3 嘅任何一條(例如 iOS 但跨多個曆日,
//   又冇獨立來源確認)——1E 呢一輪剛好冚晒(45 個 iOS deviceId = 1 個 R1 +
//   44 個 R2),但下次重跑數據變咗有可能出現呢類「兩頭唔到岸」嘅個案,
//   一律老實標 `unknown`,唔靠估。
//
// R0((none))—— row 本身冇 deviceId(2026-08-31 之前嘅歷史行,呢個欄仲未
//   加入白名單),獨立一組,唔可以歸機。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
const CLIENT_LOG_DIR = path.join(BACKEND_DIR, 'logs', 'client-log');
const APP_VERSION_PATH = path.join(BACKEND_DIR, 'public', 'app-version.json');

const LIFECYCLE_EVENTS = new Set(['perfMarks', 'perfHome', 'perfNav', 'perfRenders']);
const NONE_KEY = '(none)';

function loadConfirmedRealIds() {
  try {
    const manifest = JSON.parse(fs.readFileSync(APP_VERSION_PATH, 'utf8'));
    return new Set(Array.isArray(manifest.hlsDeviceIds) ? manifest.hlsDeviceIds : []);
  } catch (e) {
    console.error(`[classify-devices] 讀唔到 ${APP_VERSION_PATH}: ${e?.message} —— R1 規則今次跑唔到,全部當唔中 R1`);
    return new Set();
  }
}

function listLogFiles() {
  let entries = [];
  try {
    entries = fs.readdirSync(CLIENT_LOG_DIR, { withFileTypes: true });
  } catch (e) {
    console.error(`[classify-devices] 讀唔到 ${CLIENT_LOG_DIR}: ${e?.message}`);
    return [];
  }
  return entries
    .filter((ent) => ent.isFile() && /^client-log-\d{4}-\d{2}-\d{2}\.jsonl$/.test(ent.name))
    .map((ent) => path.join(CLIENT_LOG_DIR, ent.name))
    .sort();
}

function dateKeyOf(row) {
  // 優先用 backend 落 disk 嗰個 ts(persist 一定有),clientTs 係 client 自報,
  // 唔信作分組用(可以亂/可以係未來時間)。
  const ts = row.ts || row.clientTs;
  if (!ts) return null;
  const d = String(ts).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function readAllRows() {
  const rows = [];
  for (const filePath of listLogFiles()) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      console.error(`[classify-devices] 讀唔到 ${filePath}: ${e?.message}`);
      continue;
    }
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch (_) {
        // 壞行(半截寫入/損壞)—— 跳過,唔中斷成個分析。
      }
    }
  }
  return rows;
}

function classify(devices, confirmedRealIds) {
  const out = [];
  for (const [deviceId, info] of devices) {
    const rowsCount = info.rows.length;
    const firstSeen = info.rows.reduce((min, r) => (r._date && (!min || r._date < min) ? r._date : min), null);
    const lastSeen = info.rows.reduce((max, r) => (r._date && (!max || r._date > max) ? r._date : max), null);
    const platform = info.platform || 'unknown';
    const dateSet = info.dateSet;

    let cls = 'unknown';
    let reason = '';

    if (deviceId === NONE_KEY) {
      cls = 'unknown';
      reason = 'R0:row 冇 deviceId(2026-08-31 之前嘅歷史行,呢個欄仲未加入白名單),唔可以歸機';
    } else if (confirmedRealIds.has(deviceId)) {
      cls = 'real';
      reason = 'R1:出現喺 app-version.json 嘅 hlsDeviceIds(獨立來源確認,HLS-EXEC-D123-GATE-20260901 §3)';
    } else if (platform === 'android') {
      cls = 'unverified';
      reason = 'R3:Android 且唔喺 hlsDeviceIds——冇任何獨立來源確認係真機定係持久化 AVD,唔可以當真用戶 baseline(1E §1 第 3 點)';
    } else if (platform === 'ios') {
      const singleDay = dateSet.size === 1;
      const maxPerfMarksSameDay = Math.max(0, ...Array.from(info.perfMarksByDate.values()));
      const hasLifecycle = info.lifecycleEventCount > 0;
      if (singleDay && maxPerfMarksSameDay >= 2) {
        cls = 'sim';
        reason = `R2(b-i):單一曆日 + perfMarks 同日 ${maxPerfMarksSameDay} 次(≥2)——似同一日開咗多過一次 app`;
      } else if (singleDay && !hasLifecycle) {
        cls = 'sim';
        reason = 'R2(b-ii):單一曆日 + 完全冇生命週期 beacon(perfMarks/perfHome/perfNav/perfRenders),淨播放 event 連環爆';
      } else {
        cls = 'unknown';
        reason = `R4:iOS 但唔中 R1/R2(跨 ${dateSet.size} 個曆日,maxPerfMarksSameDay=${maxPerfMarksSameDay},hasLifecycle=${hasLifecycle})`;
      }
    } else {
      cls = 'unknown';
      reason = `R4:platform=${platform} 唔中任何已知規則`;
    }

    out.push({
      deviceId,
      deviceIdShort: deviceId === NONE_KEY ? NONE_KEY : deviceId.slice(0, 8),
      platform,
      rows: rowsCount,
      firstSeen,
      lastSeen,
      daysSeen: dateSet.size,
      class: cls,
      reason,
    });
  }
  // real 排最前,方便對數;其餘按 rows 由多到少。
  out.sort((a, b) => {
    if (a.class === 'real' && b.class !== 'real') return -1;
    if (b.class === 'real' && a.class !== 'real') return 1;
    return b.rows - a.rows;
  });
  return out;
}

export function classifyDevices() {
  const confirmedRealIds = loadConfirmedRealIds();
  const rows = readAllRows();

  const devices = new Map(); // deviceId -> { rows: [], platform, dateSet, perfMarksByDate, lifecycleEventCount }
  for (const row of rows) {
    const deviceId = row.deviceId ? String(row.deviceId) : NONE_KEY;
    const dateKey = dateKeyOf(row);
    const tagged = { ...row, _date: dateKey };
    if (!devices.has(deviceId)) {
      devices.set(deviceId, {
        rows: [],
        platform: null,
        dateSet: new Set(),
        perfMarksByDate: new Map(),
        lifecycleEventCount: 0,
      });
    }
    const d = devices.get(deviceId);
    d.rows.push(tagged);
    if (row.platform && !d.platform) d.platform = String(row.platform);
    if (dateKey) d.dateSet.add(dateKey);
    if (LIFECYCLE_EVENTS.has(row.event)) {
      d.lifecycleEventCount++;
      if (row.event === 'perfMarks' && dateKey) {
        d.perfMarksByDate.set(dateKey, (d.perfMarksByDate.get(dateKey) || 0) + 1);
      }
    }
  }

  return classify(devices, confirmedRealIds);
}

function printTable(results) {
  const header = ['class', 'platform', 'deviceIdShort', 'rows', 'daysSeen', 'firstSeen', 'lastSeen', 'reason'];
  console.log(header.join('\t'));
  for (const r of results) {
    console.log([r.class, r.platform, r.deviceIdShort, r.rows, r.daysSeen, r.firstSeen, r.lastSeen, r.reason].join('\t'));
  }
  const summary = results.reduce((acc, r) => {
    const key = `${r.platform}:${r.class}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log('\n--- summary (platform:class -> deviceId 數) ---');
  for (const [k, v] of Object.entries(summary).sort()) console.log(`${k}\t${v}`);
}

// 淨係喺直接 `node classify-devices.mjs` 執行先跑主程式,俾 harness `import`
// 呢個檔攞 `classifyDevices()` 唔會順手印咗成個表出嚟。
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const results = classifyDevices();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printTable(results);
  }
}
