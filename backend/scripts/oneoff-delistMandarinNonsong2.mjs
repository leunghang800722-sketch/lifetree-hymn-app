// 2026-08-09 國語隊 round11 揪出嘅第二批「根本唔係歌」內容,逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  2162, // 新心音樂事工《雲彩般的見證（二）》—— 同 2169 一樣係機構訪問/見證系列
  3977, // 新心音樂事工《沉思集》：榮耀的主 —— 默想講章系列(同 3944/3964)
  6888, // 約書亞樂團【搖滾媽媽唱 Season2】服事感覺好受傷!怎麼辦? —— 談話節目,唔係歌
  7957, // 天韻合唱團【謝光哲團長】—— 團長個人見證訪問
];

(async () => {
  for (const id of ids) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', ids.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
