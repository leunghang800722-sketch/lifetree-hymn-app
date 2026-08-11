// 國語隊複核發現嘅第五批「根本唔係歌」內容 —— 逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const items = [
  [246, '【All for ONE】2026 約書亞台灣敬拜巡迴台北場 —— 標題明確係巡迴演唱會現場錄影/紀錄片,內容係主唱講述異象使命同多首歌曲介紹嘅巡迴側寫,唔係單一歌曲'],
];

(async () => {
  for (const [id, reason] of items) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent} — ${reason}`);
  }
  console.log('DONE', items.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
