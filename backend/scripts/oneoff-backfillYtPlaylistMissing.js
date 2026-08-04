#!/usr/bin/env node
// 一次性 script —— 2026-08-03 Eric 委派:截咗兩個 YouTube 第三方 aggregate
// playlist(「廣東話兒童詩歌」Meolyck / 「兒童詩歌 粵語」Chris Chu),核對完
// DB 見到 60 條真係漏收(已扣走 3 條經 duration 核實嘅重複片 + 2 條已下架/
// 私人冇得攞)。呢啲片嘅原始上傳頻道(jesussong good/MrKoKei/徐敏雅/I'm G等)
// 完全唔喺 worshipGroups.js 追蹤緊嘅 registry 入面,所以用 backfillGroupFromList
// 呢條共用 pipeline,跳過 org/channel 限制,逐個上傳者砌一個 ad-hoc 「group」
// 直接用 video id 收。跑完即棄,唔存入 worshipGroups.js(呢啲純粹一次性
// aggregate-playlist 搵歌,唔係要長期追蹤嘅團體)。
//
// Usage: node scripts/oneoff-backfillYtPlaylistMissing.js [--dry]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { backfillGroupFromList } from '../lib/backfillCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'kids-refetch', 'playlist-backfill-by-uploader.json');
const DRY = process.argv.includes('--dry');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

async function main() {
  const byUploader = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  let lockToken = null;
  try {
    lockToken = await acquireDbLock('oneoff-backfillYtPlaylistMissing');
    if (!lockToken) { log('攞唔到 DB 鎖,收手。'); process.exit(1); }
    const db = await openDb();

    let totalAdded = 0, totalTried = 0, totalSkipped = 0;
    const summary = [];
    for (const [uploader, list] of Object.entries(byUploader)) {
      const group = {
        name: uploader,
        org: uploader,
        lang: '兒童',
        kidsLang: '粵語',
        priority: 4,
      };
      log(`backfill 上傳者「${uploader}」(${list.length} 條)`);
      const r = await backfillGroupFromList(db, group, list, list.length, { delayMs: 3500, dry: DRY, log });
      totalAdded += r.added; totalTried += r.tried; totalSkipped += r.skipped;
      summary.push({ uploader, ...r, listLen: list.length });
    }
    log(`=== 總計:試咗 ${totalTried} 條,收錄 ${totalAdded} 首,跳過 ${totalSkipped} 條 ===`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    releaseDbLock(lockToken);
  }
}

main().catch((e) => { console.error('oneoff-backfillYtPlaylistMissing 出錯:', e); process.exit(1); });
