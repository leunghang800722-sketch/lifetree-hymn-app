// 國語隊複核發現嘅第七批「根本唔係歌」內容 —— 逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const items = [
  [7624, '逆轉專輯製作【編曲人篇】_天韻合唱團 Official —— 標題明確係專輯製作花絮/編曲人訪談segment,唔係歌'],
];

(async () => {
  for (const [id, reason] of items) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent} — ${reason}`);
  }
  console.log('DONE', items.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
