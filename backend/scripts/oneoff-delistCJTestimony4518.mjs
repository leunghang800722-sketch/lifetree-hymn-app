// 2026-08-16 Eric 拍板:落架 id 4518(CJ and Friends「Why I Worship: How I Became
// a Christian – Nuo's Story」)—— 見證分享片,根本唔係歌,明確非歌內容。
// 同場另外三首(5143 生日歌 / 4453 洗手歌 / 4452 動物歌)Eric 指示**擱置唔郁**,
// 等佢遲啲先決定 —— 唔好加落嚟。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  4518, // Why I Worship: How I Became a Christian – Nuo's Story | CJ and Friends(見證分享,非歌)
];

(async () => {
  for (const id of ids) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: ${r.hymn.title} before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', ids.length);
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
