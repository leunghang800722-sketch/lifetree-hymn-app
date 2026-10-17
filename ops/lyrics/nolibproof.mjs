// R2b 粵語雙數線 2026-08-25 出品:反方向掃描器 —— 「庫有、自己條片 OCR 全程零佐證」。
//
// 動機:全部現有掃描器(cardgap / gapscan2 / sandwich / bulkproof …)都係量「OCR 有、庫冇」
//   = 捉**漏行**。但另一半病係**抄多咗**:經文卡當歌詞、跨歌污染(#3435)、兄弟片嘅行
//   溝咗入嚟、whisper 幻覺入咗庫。呢啲行喺自己條片一次都冇出現過,但冇工具專門量呢個方向。
//
// 判準(零爭議,只讀自己條片):
//   ①首歌要有足夠 OCR(≥MINFR 幀)而且**大部分庫行都搵得返**(佐證率 ≥MINQ)——
//     證明呢條片 OCR 讀得掂,咁「搵唔返」先有資訊;OCR 爛嘅片全首都搵唔返,零資訊。
//   ②報「喺全片任何一幀都對唔返」嘅庫行。對得返 = 整句 includes / 對單一 OCR 行 LCS ≥0.7 /
//     對「同幀連續兩條 OCR 行黐埋」LCS ≥0.7(擋住「庫合併行」呢個假陽性)。
//   ③排走首尾兩行(片頭卡/片尾 credits 時段通常冇字幕)同 <5 字短行(短行盲點另有工具)。
//
// 用法: node ops/lyrics/nolibproof.mjs [lang:parity] [minQ=0.75] [印幾多行]   (env: MINFR=10, SHOW=id,id)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T = Converter({ from: 'cn', to: 't' });
const db = new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db', { readOnly: true });
const pre = s => String(s).replace(/[祢禰袮称尔袖妳]/g, '你');
const norm = s => S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g, '你').replace(/[裏裡]/g, '里').replace(/[衪祂牠他她它]/g, '他')
  .replace(/[沈沉]/g, '沉').replace(/[那哪]/g, '那').replace(/[着著]/g, '著').replace(/[妳你]/g, '你').replace(/[^一-鿿]/g, '');
function lcseq(a, b) {
  const n = b.length; let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[n];
}
const [MLANG, MPAR] = (process.argv[2] || '粵語:0').split(':');
const MINQ = Number(process.argv[3] || 0.75), MINFR = Number(process.env.MINFR || 10);
const rows = db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG, Number(MPAR));
const out = [];
for (const r of rows) {
  let tl = {}; try { tl = JSON.parse(r.lyrics_timeline || '{}'); } catch (e) { continue; }
  const frames = Array.isArray(tl.ocr) ? tl.ocr : [];
  if (frames.length < MINFR) continue;
  const ocrLines = [];
  for (const f of frames) for (const raw of String(f.text || '').split('\n')) {
    const k = norm(raw); if (k.length >= 3) ocrLines.push({ t: f.t, k });
  }
  if (ocrLines.length < 10) continue;
  const flatO = ocrLines.map(x => x.k).join('');
  const dl = (r.lyrics || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (dl.length < 6) continue;
  const seen = d => {
    const k = norm(d); if (!k) return true;
    if (flatO.includes(k)) return true;
    for (const o of ocrLines) {
      if (Math.abs(o.k.length - k.length) > Math.max(6, k.length * 0.5)) continue;
      if (lcseq(k, o.k) >= Math.ceil(k.length * 0.7)) return true;
    }
    // 🐞 2026-08-25 首轉修:庫行成日係**幾條 OCR 行合併寫成一條**,而嗰幾條 OCR 行
    //    唔一定喺同一幀 —— 逐字 reveal / 逐句上字幕嘅片,「從前風聞有祢,現在親眼見祢;」
    //    會拆成 t=68 同 t=72 兩幀(#170)。所以要拉平做時序 list,滑窗夾 2–3 條連續行。
    for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= ocrLines.length; i++) {
      let j = ''; for (let x = 0; x < n; x++) j += ocrLines[i + x].k;
      if (Math.abs(j.length - k.length) > Math.max(6, k.length * 0.5)) continue;
      if (lcseq(k, j) >= Math.ceil(k.length * 0.7)) return true;
    }
    // 庫行只被 OCR 讀到一半(前綴/後綴被切走)—— 只要庫行有 ≥6 字連續子段撞到某條 OCR 行就當有佐證。
    //    實例 #8648「平安 平安 神與我們同在」OCR 淨係讀到「神與我們同在」(前面「平安 平安」冇讀到)。
    if (k.length >= 8) for (const o of ocrLines) {
      if (o.k.length < 6) continue;
      if (k.includes(o.k) || lcseq(o.k, k) >= Math.ceil(o.k.length * 0.85)) return true;
    }
    return false;
  };
  const mark = dl.map(d => ({ d, ok: seen(d), n: norm(d).length }));
  const elig = mark.filter(x => x.n >= 5);
  if (elig.length < 5) continue;
  const q = elig.filter(x => x.ok).length / elig.length;
  if (q < MINQ) continue;
  let bad = mark.map((x, i) => ({ ...x, i })).filter(x => !x.ok && x.n >= 5 && x.i > 0 && x.i < mark.length - 1);
  // 🔴 2026-08-25 首轉實測加:單一「零佐證」行 **99% 係 2 秒抽幀漏咗嗰一幀**,唔係污染
  //    (#762 受造奇妙可畏 127 幀,4 條零佐證行散喺 20 行入面,前後行全部有佐證 = 抽幀 gap;
  //     #166 第 27 行「不再有死亡…」爛咗一個字,但第 22–26、28 行成段啟示錄 21 章都喺 OCR 度)。
  //    真「抄多咗」(經文卡整塊入咗庫 / 跨歌污染 / 兄弟片溝入嚟)一定係**連續一整段**。
  //    所以只收 run ≥ MINRUN(預設 3)嘅連續零佐證段。
  const MINRUN = Number(process.env.MINRUN || 3);
  {
    const idx = new Set(bad.map(x => x.i)); const keepI = new Set();
    for (const x of bad) {
      let a = x.i; while (idx.has(a - 1)) a--;
      let b = x.i; while (idx.has(b + 1)) b++;
      if (b - a + 1 >= MINRUN) keepI.add(x.i);
    }
    bad = bad.filter(x => keepI.has(x.i));
  }
  if (!bad.length) continue;
  out.push({ id: r.id, title: r.title, artist: r.artist, libN: dl.length, q, bad, fr: frames.length });
}
out.sort((a, b) => b.bad.length - a.bad.length || b.q - a.q);
const SHOW = (process.env.SHOW || '').split(',').filter(Boolean).map(Number);
if (SHOW.length) {
  for (const id of SHOW) {
    const s = out.find(x => x.id === id); const r = rows.find(x => x.id === id);
    console.log(`\n===== #${id} ${r ? r.title.slice(0, 55) : '?'} | ${r ? r.artist : ''} | ${r ? r.duration : ''}`);
    if (!r) continue;
    (r.lyrics || '').split('\n').map(x => x.trim()).filter(Boolean).forEach((l, i) => {
      const b = s && s.bad.find(x => x.i === i);
      console.log(`  ${b ? '❌' : '  '}${String(i + 1).padStart(2)} ${l}`);
    });
  }
  process.exit(0);
}
console.log(`掃 ${rows.length} 首 → 命中 ${out.length} 首`);
for (const s of out.slice(0, Number(process.argv[4] || 40)))
  console.log(`${s.id}\t零佐證${s.bad.length}\t庫${s.libN}\tq=${s.q.toFixed(2)}\t幀${s.fr}\t${(s.artist || '').slice(0, 10)}\t${s.title.slice(0, 30)}\t${s.bad.slice(0, 2).map(x => '「' + x.d.slice(0, 16) + '」').join(' ')}`);
