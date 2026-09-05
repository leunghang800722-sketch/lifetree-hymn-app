#!/usr/bin/env node
// ingest-church611-catalog.mjs — 官網目錄 30 首對照後,16 首未在庫入面,13 首
// 有確認生存嘅 youtube_id(已用 yt-dlp metadata 查過 uploader/duration/title,
// 見 ORG-611-CATALOG-REPORT-20260905.md §2),用 backfillGroupFromList()(同
// backfillFromList.js 人手工具 / growLibrary Tier1 共用嘅同一條 code path)寫入。
// DB 寫入全程經 acquireDbLock。3 首完全搵唔到 youtube 記錄(冇 embed、兩條
// 頻道 listing 都搵唔到)唔寫,留返做「目錄有、YouTube 搵唔到」清單。
//
// Usage: node ingest-church611-catalog.mjs --dry   (預覽,唔寫DB)
//        node ingest-church611-catalog.mjs         (真寫)

import { openDb, saveDb, acquireDbLock, releaseDbLock, query, formatDuration } from '../lib/hymnDb.js';
import { backfillGroupFromList } from '../lib/backfillCore.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';

const DRY = process.argv.includes('--dry');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// yt-dlp metadata 已人手查過(見報告),呢度直接餵 {id, title, duration}——
// title 用返 yt-dlp 吐出嚟嘅完整片名(同現有 RAWship 行一致嘅格式),
// display_title 由 backfillGroupFromList 內部 cleanDisplayTitle() 計。
const CHURCH611_NEW = [
  { id: 'Y6e6tD7g5KY', title: 'JEHOSHUA 2022', duration: 292 },
  { id: 'FFaudaO4oww', title: '誰像耶和華我的神呢｜611靈糧堂 20週年堂慶', duration: 449 },
  { id: 'RTA9x3p7OHQ', title: '《主禱文》 | RAWship vol. 1 | 611 Worship', duration: 473 },
  { id: 'Gk_bJYX_Cd0', title: '《以祢慈愛引領我》| RAWship vol. 1 | 611 Worship', duration: 268 },
  { id: 'ocY_9ESKJE4', title: '《人算什麼》| RAWship vol. 1 | 611 Worship', duration: 346 },
  { id: 'GXtxN9MdeE8', title: '《這是我主所定的日子》| RAWship vol. 1 | 611 Worship', duration: 264 },
  { id: 'QklaKQMiPmo', title: '《你看見了我》| RAWship vol. 1 | 611 Worship', duration: 312 },
  { id: 'KiLzyPuFgLo', title: '《是你觸動我心》| RAWship vol. 1 | 611 Worship', duration: 416 },
  { id: 'RTiJnGo4vRY', title: '海邊的沙 ｜611 Worship 敬拜｜現場敬拜 Live Worship', duration: 590 },
];

const WORSHIP611_NEW = [
  { id: 'S9w5-jbsUjI', title: 'Rejoice | 611靈糧堂24周年 | 611 Worship 2025.5.11', duration: 315 },
  { id: 'mOcaxCq3YzA', title: '詩篇 8 Psalm 8 | 611靈糧堂 24 周年 | 611 Worship 2025.5.11', duration: 136 },
];

// @611RAW —— 新發現、未喺 worshipGroups.js 追蹤嘅第三個頻道(官方單曲
// 歌詞版MV,同 Church611tv/611Worship 屬同一611靈糧堂事工但獨立 channel)。
// 暫時掛落 org='Church 611'(同一機構、同一官網目錄嚟源),留俾 Eric 判斷
// 要唔要之後喺 worshipGroups.js 開返一個獨立 entry 長期追蹤。
const RAW611_NEW = [
  { id: 'heAPkSZxrJ4', title: '【井啊！湧出水來】 歌詞版MV (Lyrics MV)', duration: 131 },
  { id: '6mVg4vAe9Gw', title: '【我的唯一】 歌詞版MV (Lyrics MV)', duration: 437 },
];

async function main() {
  let token = null;
  if (!DRY) {
    token = await acquireDbLock('ingest-church611-catalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
  }
  try {
    const db = await openDb();

    const groupChurch611 = { name: 'Church 611', lang: '粵語', durationCapSec: 1900 };
    const groupWorship611 = { name: '611 Worship', lang: '國語', durationCapSec: 1900 };
    const groupRaw611 = { name: 'Church 611', lang: '粵語', durationCapSec: 1900 }; // org 跟 Church 611

    log('=== Church 611(@Church611tv 新片,含 RAWship vol.1 個別曲)===');
    const r1 = await backfillGroupFromList(db, groupChurch611, CHURCH611_NEW, CHURCH611_NEW.length, { dry: DRY, log });

    log('=== 611 Worship(@611Worship 新片)===');
    const r2 = await backfillGroupFromList(db, groupWorship611, WORSHIP611_NEW, WORSHIP611_NEW.length, { dry: DRY, log });

    log('=== @611RAW(掛 org=Church 611)===');
    const r3 = await backfillGroupFromList(db, groupRaw611, RAW611_NEW, RAW611_NEW.length, { dry: DRY, log });

    // ⚠️ 人手覆核override:WORSHIP611_NEW 兩首經 backfillGroupFromList()
    // 撞正 isCompilation() 嘅 dateStamp 假陽性(`/20\d{2}[.\/]\d{1,2}[.\/]\d{1,2}/`
    // 撞中片名尾嘅「2025.5.11」錄製日期——呢個 regex 原意係擋「台北611晨禱
    // ｜...｜2026.06.19」呢類晨禱/禱告會直播日期戳,唔係想擋「單曲名 + 錄製
    // 日期」呢種官方單曲發佈慣例)。呢兩首已經有三重獨立證據證實係真.單曲
    // 唔係直播:①官網目錄逐條 post 列出(church611.org/611創作詩歌);②
    // yt-dlp metadata 片長 315s/136s 跌喺正常歌帶(唔係崇拜嗰種 40分鐘+);
    // ③標題本身就係單一歌名(Rejoice/詩篇8 Psalm 8),冇連續多首歌名。
    // 三重證據夠強,人手繞過呢一個 gate,唔靜靜哋跳、寫明喺度同報告入面。
    log('=== 611 Worship(人手override,dateStamp 假陽性)===');
    let overrideAdded = 0;
    for (const v of WORSHIP611_NEW) {
      const fresh = query(db, 'SELECT id FROM hymns_all WHERE youtube_id = ?', [v.id])[0];
      if (fresh) { log(`  ${v.id} 已存在(id=${fresh.id}),跳過`); continue; }
      let alive = false;
      try { alive = !!(await resolveAudioUrl(v.id)); } catch (_) {}
      if (!alive) { log(`  ✗ ${v.id} 拎唔到音訊,唔寫`); continue; }
      log(`  ✓ ${v.title} 驗證生存,${DRY ? '(--dry,唔寫)' : '寫入'}`);
      if (!DRY) {
        const today = new Date().toISOString().slice(0, 10);
        db.run(
          `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak, duration, org, kids, instrumental)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, 0, 0)`,
          [v.title, cleanDisplayTitle(v.title, groupWorship611.name), groupWorship611.name, groupWorship611.lang, v.id, groupWorship611.lang, today, formatDuration(v.duration), groupWorship611.name]
        );
        saveDb(db);
      }
      overrideAdded++;
      await new Promise((r) => setTimeout(r, 1500));
    }

    log(`\n總計:Church611=${r1.added} / 611Worship(override)=${overrideAdded} / 611RAW=${r3.added} (合計 ${r1.added + overrideAdded + r3.added})`);
  } finally {
    if (token) releaseDbLock(token);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
