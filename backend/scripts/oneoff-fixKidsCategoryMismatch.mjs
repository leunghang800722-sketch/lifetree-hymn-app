// 一次性修:category 含「兒童」但 kids 欄仍係 0 嘅歌(URL加歌流程冇 kids
// 掣,confirm() 從來冇傳呢個欄——見 AdminAddHymnScreen.js)。
// 用 acquireDbLock 包住,避免同並行 job 嘅 saveDb() 撞車覆寫。
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const TARGET_IDS = [5740, 5741];

const token = await acquireDbLock('oneoff-fixKidsCategoryMismatch');
if (!token) {
  console.error('攞唔到 DB lock,放棄');
  process.exit(1);
}

try {
  const db = await openDb();
  for (const id of TARGET_IDS) {
    const before = query(db, 'SELECT id, title, category, lang, kids FROM hymns_all WHERE id = ?', [id]);
    if (before.length === 0) {
      console.error(`id=${id} 搵唔到,skip`);
      continue;
    }
    db.run('UPDATE hymns_all SET kids = 1 WHERE id = ?', [id]);
    console.log(`已修 id=${id} "${before[0].title}": kids 0 -> 1`);
  }
  saveDb(db);
  console.log('done');
} finally {
  releaseDbLock(token);
}
