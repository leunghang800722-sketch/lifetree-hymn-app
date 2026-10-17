// 2026-08-09 國語隊歌詞複核期間揪出嘅「根本唔係歌」內容(訪問/教學片/花絮/
// 事工介紹/紀錄片系列/講座/宣傳短片/靈修禱告集),Eric 指示可以直接下架
// (curated=0, status='rejected'),唔使停低問。逐首人手讀過draft內容先分類,
// 唔係淨係憑標題估。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  // 新心音樂事工 25週年紀念系列 —— 訪問/見證/機構歷史紀錄片
  2169, 2170, 2171, 2179, 2188, 2213, 2220, 2222, 2229, 2238,
  // 新心音樂事工《二十天求復興》默想禱告集 —— 逐日靈修文字+講道,非歌
  3207, 3449, 3453, 3454, 3455, 3460, 3483,
  // 新心音樂事工《沉思集》默想系列 —— 同上,靈修講章
  3944, 3964,
  // 讚美之泉 巡迴VLOG/花絮/宣傳短片/APP promo/活動公告
  4853, 4991, 5006, 5846, 6058, 6329, 6549, 6189, 6353, 6447, 6461, 6518, 6520,
  // 讚美之泉 樂器教學示範(爵士鼓/貝斯/發聲)
  6535, 6545, 8050,
  // 天韻合唱團 訪談紀實/製作花絮
  7314, 8008,
  // 泥土音樂 演唱會公告/個人見證/靈修小站/花絮
  8356, 8457, 8561, 967,
  // 新心音樂事工 排練實況/音樂會公告
  1520,
  // 台北復興堂 學術講座(簡春安教授)
  1590,
];

(async () => {
  const results = [];
  for (const id of ids) {
    const r = await delistHymn(id);
    results.push({ id, before: r.before, after: r.after, idempotent: !!r.idempotent });
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', results.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
