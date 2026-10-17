// 2026-08-15 Eric 拍板:【靈命塑造系列】(基恩敬拜 AGWMM)整個系列落架。
// 全部標籤「純音樂」——冇人聲嘅冥想/背景器樂,唔係詩歌,唔使逐首查。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  4205, // 【靈命塑造系列】當你痛苦難過時 - 基恩敬拜 AGWMM
  4206, // 【靈命塑造系列】當你感到無望時 - 基恩敬拜 AGWMM
  4215, // 【靈命塑造系列】當你困倦無力時 - 基恩敬拜 AGWMM
  4217, // 【靈命塑造系列】當你徬徨無助時 - 基恩敬拜 AGWMM
  4833, // 【靈命塑造系列】當你迷失方向時 - 基恩敬拜 AGWMM
  4835, // 【靈命塑造系列】當你孤單寂寞時 - 基恩敬拜 AGWMM
];

(async () => {
  for (const id of ids) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: ${r.hymn.title} before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', ids.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
