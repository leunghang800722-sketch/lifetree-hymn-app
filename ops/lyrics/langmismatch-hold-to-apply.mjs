#!/usr/bin/env node
/**
 * 47H 衝刺 b04(2026-08-16 01:xx)——中英對照 hold 池「一鍵出街」預備 script。
 *
 * ⛔ 唔好自己行。呢個 script 係等 Eric 拍板 b01/b03 問嗰條問題之後先用:
 *      (a) 中英對照照出街    → --mode both
 *      (b) 只出中文行        → --mode chinese-only
 *      (c) 維持現狀          → 唔使行,乜都唔做
 *
 * 佢**唔會寫 DB**,淨係將 backend/data/lyrics-langmismatch-hold.json 轉成
 * 一個 reviewLyrics.js --apply 食得嘅 apply 檔,之後照正常兩步走:
 *      node backend/scripts/auditLyricsBatch.js <出嚟嗰個 apply 檔>
 *      node backend/scripts/reviewLyrics.js --apply <...-passed.json>
 *
 * 注意:
 *  - --mode chinese-only 會剷走「拉丁字母多過 CJK 字」嘅行(即官方 MV 嗰啲英文對照行),
 *    剩返中文行 → 過到 auditLyricsBatch.js 現有嘅語言錯配擋板,唔使改 audit code。
 *  - --mode both 保留原文,**一定會再次俾同一道擋板攔住**,所以行之前要 Eric 先決定
 *    點改 auditLyricsBatch.js 個門檻(b01 建議:CJK < 15 字先當英文歌)。
 *  - 全首英文、lang 標中文嗰種(Eric 講明唔可以入庫)唔屬呢兩個 mode,
 *    用 --min-cjk 過濾走(預設 15:剷走中文少過 15 字嘅條目)。
 *
 * 用法:
 *   node ops/lyrics/langmismatch-hold-to-apply.mjs --mode chinese-only --out /tmp/hold-apply.json [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOLD = path.join(__dirname, '..', '..', 'backend', 'data', 'lyrics-langmismatch-hold.json');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const mode = arg('--mode');
const out = arg('--out');
const minCjk = Number(arg('--min-cjk', '15'));
const dry = argv.includes('--dry');

if (!['both', 'chinese-only'].includes(mode)) {
  console.error('要 --mode both 或者 --mode chinese-only(見檔頭說明)'); process.exit(2);
}
if (!out && !dry) { console.error('要 --out <檔路徑>(或者用 --dry 淨係睇統計)'); process.exit(2); }

const CJK = /[一-鿿㐀-䶿]/g;
const LAT = /[A-Za-z]/g;
const nCjk = s => (s.match(CJK) || []).length;
const nLat = s => (s.match(LAT) || []).length;

const hold = JSON.parse(fs.readFileSync(HOLD, 'utf8'));
const rows = [];
let skippedThin = 0;

for (const item of hold) {
  const lyrics = item.lyrics || '';
  let body = lyrics;
  if (mode === 'chinese-only') {
    body = lyrics.split('\n')
      // 淨係剷「拉丁多過 CJK」嘅行;空行、純中文行、經文附註全部保留
      .filter(l => !(l.trim() && nLat(l) > nCjk(l)))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  if (nCjk(body) < minCjk) { skippedThin++; continue; }
  rows.push({ id: item.id, lang: item.lang, lyrics: body });
}

console.log(`hold 池 ${hold.length} 條 → mode=${mode},出 ${rows.length} 條,`
  + `因中文少過 ${minCjk} 字剔走 ${skippedThin} 條(多數係「全首英文但 lang 標中文」嗰種,Eric 講明唔入庫)`);
if (dry) { console.log('(--dry,冇寫檔)'); process.exit(0); }
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`寫咗 → ${out}\n跟住行:\n  node backend/scripts/auditLyricsBatch.js ${out}\n  node backend/scripts/reviewLyrics.js --apply <上面出嘅 -passed.json>`);
