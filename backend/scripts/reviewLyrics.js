#!/usr/bin/env node
// 校對介面 —— LYRICS-PIPELINE-PLAN 任務3。俾之後嘅 AI 校對 session(或者 Eric 抽查)用,
// 兩個動作:
//   --export   dump 晒 status='draft' 嘅歌做一個 JSON 檔,俾校對 session 對照官方來源
//              (讚美之泉/小羊官網、CantonHymn)逐句執靚。
//   --apply    讀入校對完嘅 [{id, lyrics}] 陣列,寫入 `lyrics` 欄 + status='verified'。
//
// ⚠️ 呢個係方案「草稿≠入庫」嘅底線:只有 --apply 之後 status='verified' 嘅歌先會出
// 喺 `lyrics` 欄(前端 `hymns` view 直接讀呢欄)。draft 永遠唔會俾前端見到。
//
// 同 fetchLyrics.js 一樣行返 hymnDb.js 嘅 DB 鎖(即攞即放,唔好揸住鎖做慢嘢)——
// --apply 呢度冇乜慢工序,但為咗同 growLibrary/fetchLyrics 唔會撞埋手,一樣行鎖。
//
// Usage:
//   node scripts/reviewLyrics.js --export --limit 20 --out /tmp/draft-batch1.json
//   node scripts/reviewLyrics.js --apply /tmp/draft-batch1-verified.json

import fs from 'fs';
import path from 'path';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const today = () => new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const DO_EXPORT = process.argv.includes('--export');
const APPLY_FILE = arg('--apply', null);

async function doExport() {
  const limit = Number(arg('--limit', 9999));
  const outPath = arg('--out', path.join(process.cwd(), `lyrics-draft-${today()}.json`));

  const db = await openDb();
  const rows = query(db, `SELECT id, title, artist, lang, lyrics_source, lyrics_draft, lyrics_checked_at
                          FROM hymns_all
                          WHERE curated=1 AND status!='dead' AND lyrics_status='draft'
                          ORDER BY lyrics_checked_at ASC
                          LIMIT ?`, [limit]);

  if (!rows.length) { log('冇 status=draft 嘅歌可以 export(可能全部校對晒,或者仲未有草稿)'); return; }

  // 校對 session 對照嘅官方來源提示(唔係強制,淨係方便佢揀邊個網搜):粵語 → CantonHymn,
  // 國語/英文 → 讚美之泉/約書亞樂團/小羊詩歌官網,睇 artist 就知去邊度搵。
  const payload = rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    lang: r.lang,
    source: r.lyrics_source,      // cc / ocr / whisper —— 校對時可以參考,ocr 通常最準,whisper 最多錯
    draft: r.lyrics_draft,
    lyrics: null,                 // 校對session 填呢個欄;保持 null = 未校
  }));

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  log(`export 咗 ${payload.length} 首草稿 → ${outPath}`);
  log('校對做法:對照官方來源(粵語睇 CantonHymn;國語/英文睇返 artist 官網/讚美之泉/約書亞樂團),');
  log('逐首填返 `lyrics` 欄(校對好嘅正確歌詞全文),完咗用 --apply 讀返個檔就得。');
}

async function doApply(file) {
  if (!fs.existsSync(file)) { log(`搵唔到檔案:${file}`); process.exit(1); }
  let items;
  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log(`JSON 格式錯:${e?.message || e}`); process.exit(1);
  }
  if (!Array.isArray(items)) { log('檔案要係 [{id, lyrics}] 陣列'); process.exit(1); }

  let applied = 0, skipped = 0;
  for (const item of items) {
    const id = item?.id;
    const lyrics = (item?.lyrics || '').trim();
    if (!id || !lyrics) { skipped++; continue; } // 冇校好(lyrics 仲係 null/空)嘅唔郁,留返 draft

    // 即攞即放:淨係 UPDATE 嗰一刻先攞鎖,唔好因為 apply 一個大批而長開住個鎖。
    const token = await acquireDbLock('reviewLyrics');
    if (!token) { log(`  ⚠ id=${id} 攞唔到 DB 鎖,skip(可以之後重跑呢個檔補返)`); skipped++; continue; }
    try {
      const freshDb = await openDb();
      freshDb.run(
        `UPDATE hymns_all SET lyrics=?, lyrics_status='verified', lyrics_checked_at=? WHERE id=?`,
        [lyrics, today(), id]
      );
      saveDb(freshDb);
      applied++;
    } finally {
      releaseDbLock(token);
    }
  }
  log(`--apply 完成:寫入(verified)${applied} 首,skip(未校/冇 lyrics)${skipped} 首`);
}

async function main() {
  if (DO_EXPORT) { await doExport(); return; }
  if (APPLY_FILE) { await doApply(APPLY_FILE); return; }
  log('用法:--export [--limit N] [--out file.json]  或者  --apply <file.json>');
}

main().catch((e) => { console.error('reviewLyrics 出錯:', e); process.exit(1); });
