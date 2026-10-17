// R1b 國語雙數線 2026-08-24 出品。
// 「一字之差」跨歌交叉檢查:兩首歌(通常係同一首歌嘅唔同片)有一句幾乎一模一樣、
// 淨係差一個字 → 其中一邊多數係 OCR 錯別字留咗喺庫入面。
// 實例:#6750「膽怯戰競」vs #6798/#6850「膽怯戰兢」;#7088「讚美跳耀」vs #7122「讚美跳躍」。
// ⚠️ 呢隻嘢捉嘅係**單字污染**唔係漏行 —— 自己 OCR 幫唔到手(OCR 自己就係錯嗰個),
//    要靠「邊個寫法成詞」+「全庫幾多首用邊個寫法」去判。
// 用法:node ops/lyrics/charfix.mjs <lang>:<parity>   例:node ops/lyrics/charfix.mjs 國語:0
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db', { readOnly: true });
const [lang, parityRaw] = (process.argv[2] || '國語:0').split(':');
const parity = Number(parityRaw);
// 同音/異體字先 fold 走,唔好當成差異(四條線共用嗰套 + 那/哪、的/得/地)
const fold = s => String(s)
  .replace(/[祢禰袮称你妳]/g, '你')
  .replace(/[衪祂牠他]/g, '他')
  .replace(/[裡裏里]/g, '裡')
  .replace(/[着著]/g, '著')
  .replace(/[臺台]/g, '台')
  .replace(/[哪那]/g, '那')
  .replace(/[的得地]/g, '的')
  .replace(/[^一-鿿]/g, '');
const rows = db.prepare("select id,lang,title,lyrics from hymns_all where lyrics_status='verified' and lyrics is not null and length(lyrics)>0").all();
// key = fold 完再喺第 i 位挖走一個字;同 key 但唔同 fold 字串 = 一字之差
const idx = new Map();
for (const r of rows) {
  for (const raw of String(r.lyrics).split('\n')) {
    const f = fold(raw);
    if (f.length < 6) continue;
    for (let i = 0; i < f.length; i++) {
      const k = i + '|' + f.slice(0, i) + ' ' + f.slice(i + 1);
      let a = idx.get(k);
      if (!a) idx.set(k, a = []);
      a.push({ id: r.id, lang: r.lang, title: r.title, raw: raw.trim(), f });
    }
  }
}
const charCount = new Map();
const cnt = w => {
  if (charCount.has(w)) return charCount.get(w);
  const c = rows.filter(r => String(r.lyrics).includes(w)).length;
  charCount.set(w, c);
  return c;
};
// 🔴 三層濾網(v1 出 945 行根本讀唔晒):
//  ①**唔准同一首歌自己夾自己** —— 同一首歌前後段「祂/祢」「我/她」交替係正常寫法,
//    唔係污染。v1 冇呢層,noise 佔咗一大半。
//  ②**代名詞/常見虛字唔算** —— 你祢祂他她我們的了 呢類差異係風格唔係錯字。
//  ③**要「我嗰隻字明顯罕見過佢嗰隻」**(全庫首數 ≤ 對方 1/5) —— 錯別字嘅特徵就係
//    全庫得一兩首咁寫,啱嘅寫法幾十上百首。
const PRON = new Set([...'你祢祂他她我們的了個是有在不而與和之]']);
const seen = new Set();
let n = 0;
for (const [, arr] of idx) {
  if (arr.length < 2) continue;
  const uniq = [...new Map(arr.map(x => [x.f + '#' + x.id, x])).values()];
  if (new Set(uniq.map(x => x.f)).size < 2) continue;
  const mine = uniq.filter(x => x.lang === lang && x.id % 2 === parity);
  if (!mine.length) continue;
  for (const m of mine) {
    const others = uniq.filter(x => x.f !== m.f && x.id !== m.id);   // 濾網①
    if (!others.length) continue;
    let d = -1;
    for (let i = 0; i < m.f.length; i++) if (m.f[i] !== others[0].f[i]) { d = i; break; }
    if (d < 0) continue;
    const myCh = m.f[d];
    if (PRON.has(myCh)) continue;                                    // 濾網②
    const myN = cnt(myCh);
    const good = others.filter(x => !PRON.has(x.f[d]) && myN * 5 <= cnt(x.f[d]));  // 濾網③
    if (!good.length) continue;
    const sig = m.id + '|' + m.raw;
    if (seen.has(sig)) continue;
    seen.add(sig);
    console.log('');
    console.log(`#${m.id} [${m.lang}] ${String(m.title).slice(0, 44)}`);
    console.log(`   我:「${m.raw}」  字「${myCh}」(全庫 ${myN} 首)`);
    for (const x of good.slice(0, 3))
      console.log(`   他:「${x.raw}」 ← #${x.id} ${String(x.title).slice(0, 36)}  字「${x.f[d]}」(全庫 ${cnt(x.f[d])} 首)`);
    n++;
  }
}
console.log('');
console.log(`掃 ${rows.length} 首,一字之差 ${n} 行`);
