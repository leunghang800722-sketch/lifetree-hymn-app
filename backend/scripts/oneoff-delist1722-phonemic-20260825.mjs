// 2026-08-25 Eric 拍板:落架 id 1722(「Hypersonic Fest 2023 / 悅雨音樂 GRM
// Session Replay @ KITEC Atrium / Phone Mic Recorded」,35:12)——
// 電話咪錄嘅 35 分鐘現場 session 重播,唔係一首歌,錄音質素成疑。
// 背景:2026-08-25 04:07Z Eric 部 iOS 背景自動接續輪到呢首,長檔冇本地預載
// 行冷 stream,撞正慢網入咗 AVPlayer stall-retry 風暴,「播播下自己停咗」。
// 同日一併落實:隨心聽/自動接續池排除 >10 分鐘長檔(frontend utils/autoplay.js)。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  1722, // Hypersonic Fest 2023 GRM Session Replay(電話咪 35 分鐘現場錄音,非單曲)
];

(async () => {
  for (const id of ids) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: ${r.hymn.title} before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', ids.length);
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
