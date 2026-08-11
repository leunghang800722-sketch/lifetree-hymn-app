// 2026-08-11 粵語隊複核衝刺,揪出嘅「根本唔係歌」內容,逐首人手讀過確認先落。
import { delistHymn } from '../lib/adminHymns.js';

const ids = [
  1971, // 三吉 與《超出預計的愛》——songwriter interview/behind-the-scenes,唔係歌演出本身
  2203, // 【The Sound Of Salvation 救贖的聲音】預售中！—— 合輯album presale promo flyer,唔係歌
];

(async () => {
  for (const id of ids) {
    const r = await delistHymn(id);
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', ids.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
