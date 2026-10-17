// 國語隊複核發現嘅第六批「根本唔係歌」內容 —— 逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const items = [
  [871, '盛曉玫 詩歌默想 不變的愛 —— 標題明確係"詩歌默想",內容係分析馬太福音第一章家譜嘅講道式默想文字,唔係歌詞'],
  [941, '算命與聖經預言 詩歌默想 新天地 —— 標題明確係"詩歌默想",內容係討論算命同聖經預言(以色列復國)嘅講道式教導,唔係歌詞'],
];

(async () => {
  for (const [id, reason] of items) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent} — ${reason}`);
  }
  console.log('DONE', items.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
