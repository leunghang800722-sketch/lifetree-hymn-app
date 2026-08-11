// 國語隊複核發現嘅第四批「根本唔係歌」內容 —— 逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const items = [
  [4068, '讓我們竭力追求－作者分享 —— 標題明確係"作者分享"(創作訪問/詩歌分享),draft內容淨係"願神祝福你"呢句短講,唔係歌詞'],
];

(async () => {
  for (const [id, reason] of items) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent} — ${reason}`);
  }
  console.log('DONE', items.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
