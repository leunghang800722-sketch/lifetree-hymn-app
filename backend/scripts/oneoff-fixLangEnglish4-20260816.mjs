// 2026-08-16 Eric 拍板(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P0):hold 池入面 4 首
// 「lang 標咗國語但其實係英文歌」修返 lang='英文'。歌詞本身係啱嘅(英文歌配
// 英文歌詞),錯嘅係語言標籤;改完之後語言錯配擋板自然唔會再攔佢哋。
//   6595 約書亞樂團【Shout for Freedom】/ 6669【You Fight for Me】
//   6815【We're Gonna Worship The King】/ 8271 小羊詩歌 YOU ARE MY FAVORITE (English)
// 用 hymnDb 鎖(即攞即放)—— raw sqlite3 UPDATE 會俾並行 job saveDb() 靜靜哋覆寫。
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const ids = [6595, 6669, 6815, 8271];

(async () => {
  const token = await acquireDbLock('oneoff-fixLangEnglish4');
  if (!token) { console.error('攞唔到 DB 鎖,收工(遲啲再行)'); process.exit(1); }
  try {
    const db = await openDb();
    for (const id of ids) {
      const before = query(db, 'SELECT id, title, lang FROM hymns_all WHERE id=?', [id])[0];
      if (!before) { console.log(`id ${id} 搵唔到,跳過`); continue; }
      db.run(`UPDATE hymns_all SET lang='英文' WHERE id=?`, [id]);
      console.log(`id ${id} lang '${before.lang}' → '英文'(${before.title.slice(0, 50)})`);
    }
    saveDb(db);
    console.log('DONE', ids.length);
  } finally {
    releaseDbLock(token);
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
