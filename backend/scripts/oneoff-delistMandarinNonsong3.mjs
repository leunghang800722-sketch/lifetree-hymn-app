// 國語隊複核發現嘅第一批「根本唔係歌」內容 —— 逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const items = [
  [6423, '2014讚美之泉兒童敬拜讚美專輯(5)新造的人 宣傳短片 —— 標題明確係專輯宣傳片,內容係介紹十首歌+DVD內容,唔係單一歌曲歌詞'],
];

(async () => {
  for (const [id, reason] of items) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent} — ${reason}`);
  }
  console.log('DONE', items.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
