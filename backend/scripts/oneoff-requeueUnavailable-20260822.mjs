#!/usr/bin/env node
// 重掃 `unavailable` 工作面(Eric 2026-08-22 拍板)。
//
// 背景:879 首 unavailable 入面,大部分係**舊 Vision OCR 年代**判嘅。8/16 換咗
// PaddleOCR 主引擎之後已經證明過會翻案(天韻/盛曉玫兩個「死症 vein」就係例)。
// ⚠️ `unavailable` 喺現有 code 係 **terminal state** —— `pickOcrCandidates` 要求
// `lyrics_status='none' AND lyrics_source='cc:miss'`,所以佢**永遠唔會自動重試**
// (90 日重試從來冇真正實現)。要重掃就一定要主動 reset。
//
// 零成本分流(唔使打 YouTube,用 DB 已有嘅 whisper timeline):
//   whisper 轉錄有實質文字(剷走 [MUSIC] 呢類佔位符之後 ≥20 CJK 或 ≥60 拉丁字母)
//   = **首歌真係有人唱**,即係當時 OCR 攞唔到字係引擎問題,唔係首歌冇詞 → 值得重掃。
//   whisper 空 / 全部 [MUSIC] = 疑似純音樂 → **唔好推**,推咗都係白做。
//
// 用法:
//   node scripts/oneoff-requeueUnavailable-20260822.mjs --ids 1,2,3   # 指定(pilot 用)
//   node scripts/oneoff-requeueUnavailable-20260822.mjs --limit 200   # 由「有唱歌」桶入面攞頭 N 首
//   加 --dry 睇唔跑

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, '..', 'data', 'unavailable-requeue-20260822.json');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const IDS = arg('--ids', null);
const LIMIT = Number(arg('--limit', 0));
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const cjk = (s) => ((s || '').match(/[㐀-鿿]/g) || []).length;
const lat = (s) => ((s || '').match(/[A-Za-z]/g) || []).length;

// whisper 有冇實質文字(剷走 [MUSIC]/(音樂) 呢類佔位符先計)
function hasSinging(timeline) {
  try {
    const segs = (JSON.parse(timeline || '{}').whisper) || [];
    if (!segs.length) return false;
    const raw = segs.map((s) => s.text || '').join(' ');
    const real = raw.replace(/\[[^\]]*\]|\([^)]*\)/g, '');
    return cjk(real) >= 20 || lat(real) >= 60;
  } catch (_) { return false; }
}

const token = await acquireDbLock('oneoff-requeueUnavailable');
if (!token) { log('⛔ 攞唔到 DB 鎖'); process.exit(1); }
try {
  const db = await openDb();
  let rows = query(db, `SELECT id, title, artist, lyrics_checked_at, lyrics_timeline
                        FROM hymns_all
                        WHERE curated=1 AND status!='dead' AND lyrics_status='unavailable'
                        ORDER BY lyrics_checked_at ASC, id ASC`);
  if (IDS) {
    const want = new Set(IDS.split(',').map(Number));
    rows = rows.filter((r) => want.has(r.id));
  } else {
    rows = rows.filter((r) => hasSinging(r.lyrics_timeline));   // 只推「有唱歌」嗰批
    if (LIMIT) rows = rows.slice(0, LIMIT);
  }
  log(`今轉要 reset:${rows.length} 首`);
  if (!DRY) {
    for (const r of rows) {
      // status 由 unavailable → none,source → cc:miss,咁 pickOcrCandidates 先揀得返。
      // lyrics_draft / lyrics_timeline 都唔剷 —— 新 OCR 會覆寫,舊嘢留住做對照。
      db.run(`UPDATE hymns_all SET lyrics_status='none', lyrics_source='cc:miss' WHERE id=?`, [r.id]);
    }
    saveDb(db);
    let prev = { batches: [] };
    try { prev = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (_) {}
    prev.note = '重掃 unavailable(Eric 2026-08-22 拍板)。只推 whisper 實測有人唱歌嗰批;純音樂唔推。';
    prev.batches.push({ at: new Date().toISOString(), count: rows.length, ids: rows.map((r) => r.id) });
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, JSON.stringify(prev, null, 1), 'utf8');
    log(`✓ reset 完成,名單 append 咗落 ${LOG}`);
  }
  for (const r of rows.slice(0, 10)) log(`   ${r.id} [${r.artist}] ${String(r.title).slice(0, 34)}(當時判於 ${r.lyrics_checked_at})`);
} finally { releaseDbLock(token); }
