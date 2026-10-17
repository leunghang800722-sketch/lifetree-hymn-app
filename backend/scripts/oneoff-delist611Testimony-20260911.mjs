// 2026-09-11 Eric:「幫我將所有見證落架」——App 詩歌庫搜「見證」見到大批 Church 611
// 「XXX見證｜某某弟兄/姊妹 Testimony」見證分享片(訪問/個人分享性質,9–19 分鐘),
// 同 2026-08-17「訪談同花絮」同一類非歌內容,直接落架(curated=0 + status=rejected,
// 唔刪 row,可 re-list)。
//
// 收錄標準:org='Church 611' AND status='ok' AND (標題含「見證」或 "testimony")。
// 09-11 逐條核過 292 條:三種標題格式(見證｜…Testimony / 611 Testimony | … /
// 見證 | …)全部係見證片,冇一首係歌名啱啱撞字;lyrics_status=draft 嗰批係字幕
// OCR 草稿(見證字幕),唔係歌詞。
//
// 明文保留(唔喺呢個 list):
//  · 559 Elevation Worship「My Testimony Live」——真歌
//  · 1615 全心製作「珍惜眼前人」(title 有「見證」前綴,verified 歌詞 6:36)——08-17 已擱置嘅「見證 <歌名>」類,係歌
//  · 2130 Endless Worship「見證信望愛」——真歌(verified)
//  · 7354 約書亞樂團「讓我見證你的奇妙 / Testify Your Wonder」——真歌(verified)
import { openDb } from '../lib/hymnDb.js';
import { delistHymn } from '../lib/adminHymns.js';

const db = await openDb();
const rows = db.exec(`SELECT id, coalesce(display_title, title) AS t FROM hymns_all
  WHERE org = 'Church 611' AND status = 'ok'
    AND (title LIKE '%見證%' OR display_title LIKE '%見證%' OR lower(title) LIKE '%testimony%' OR lower(display_title) LIKE '%testimony%')
  ORDER BY id`)[0]?.values || [];
console.log('candidates', rows.length);
const done = []; const failed = [];
for (const [id, t] of rows) {
  try {
    const r = await delistHymn(id);
    done.push(id);
    console.log(`OK ${id} | ${t} | before=${JSON.stringify(r.before)} idem=${!!r.idempotent}`);
  } catch (e) { failed.push(id); console.log(`FAIL ${id} | ${t} | ${e.code || e.message}`); }
}
console.log('DONE', done.length, '/', rows.length, 'failed', failed.length);
process.exit(failed.length ? 1 : 0);
