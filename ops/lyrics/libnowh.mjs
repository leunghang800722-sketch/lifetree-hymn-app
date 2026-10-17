// R2 粵語單數線 2026-08-25 出品:「庫有、OCR 同 whisper 兩個證人都零佐證」反方向掃描器。
//
// 🔴 動機 = `nolibproof.mjs` 有個結構性盲點:佢第一關要求「大部分庫行喺 OCR 揾得返」
//    (佐證率 ≥MINQ=0.75)先至掃。但**OCR 讀得最爛嗰批片,正正就係庫最污糟嗰批**
//    —— 當年落字嗰個人都係對住同一份爛 OCR 抄,抄錯/抄漏/抄埋亂碼嘅機會最高。
//    實例 #2895《沒法阻止祢》:OCR 幾乎每個字都爛,nolibproof 佐證率過唔到閘直接 skip,
//    但佢庫入面有兩條行(「魔鬼無法叫祂止」「廣闊,魔鬼無法阻止」)係**兩個證人都話唔啱**。
//
// 修法唔係放鬆 nolibproof 個閘(會令乾淨片出一堆噪音),而係**加返第二個證人**:
//    佐證 = OCR 有 **或者** whisper 有。咁 OCR 爛嘅片可以靠 whisper 撐起佐證率過閘,
//    而報出嚟嘅行就係「兩個證人一齊話冇」—— 呢個係最硬嘅「抄多咗/抄錯咗」訊號。
//
// 判準:
//   ①首歌要 OCR ≥MINFR 幀 **而且** whisper ≥MINW 段(兩個證人都要在場,先有得講「兩邊都冇」)。
//   ②佐證(任何一個證人夠就算):整句 includes / 對單一證人行 LCS ≥HI / 對「同幀連續兩行黐埋」LCS ≥HI。
//     ⚠️ 粵語 whisper 係國語 ASR 出嚟嘅同音字湯,所以 whisper 嗰邊門檻特登放低(WHI),
//     寧願放生都唔好報假陽性。
//   ③首歌佐證率 ≥MINQ 先報(證明兩個證人合埋讀得掂呢首歌)。
//   ④只報 best ratio < LO 嘅行(明顯零佐證,唔係差少少)。
//   ⑤排走首尾行(片頭/片尾時段冇字幕)、<MINK 字短行、同埋成句都係標點/拉丁嘅行。
//
// 用法: node ops/lyrics/libnowh.mjs [lang:parity] [minQ=0.6] [印幾多首]
//   env: MINFR=10 最少 OCR 幀, MINW=5 最少 whisper 段, HI=0.7, WHI=0.6, LO=0.4, MINK=6, SHOW=id,id
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T = Converter({ from: 'cn', to: 't' });
const db = new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db', { readOnly: true });
// ⚠️ 四條線共用 fold:祢/禰/袮/称 一律先變「你」(opencc 會將「称」轉做「稱」,一定要喺 S2T 之前做)
const pre = s => String(s).replace(/[祢禰袮称尔袖妳]/g, '你');
const norm = s => S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g, '你').replace(/[裏裡]/g, '里').replace(/[衪祂牠他她它]/g, '他')
  .replace(/[沈沉]/g, '沉').replace(/[那哪]/g, '那').replace(/[着著]/g, '著').replace(/[妳你]/g, '你')
  .replace(/[的得地]/g, '的').replace(/[^一-鿿]/g, '');
function lcseq(a, b) {
  const n = b.length; let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[n];
}
const [MLANG, MPAR] = (process.argv[2] || '粵語:1').split(':');
const MINQ = Number(process.argv[3] || 0.6), TOPN = Number(process.argv[4] || 40);
const MINFR = Number(process.env.MINFR || 10), MINW = Number(process.env.MINW || 5);
const HI = Number(process.env.HI || 0.7), WHI = Number(process.env.WHI || 0.6);
const LO = Number(process.env.LO || 0.4), MINK = Number(process.env.MINK || 6);
const DENS = Number(process.env.DENS || 8);
const GAPF = Number(process.env.GAPF || 1);
const GAPS = Number(process.env.GAPS || 6);   // 夾縫閘:上下兩條庫行嘅佐證幀最多隔幾多秒   // 夾縫閘:上下兩條庫行嘅佐證幀最多隔幾多幀   // 平均幾多秒一幀,超過就當 OCR 太疏冇資格講「零佐證」
const SHOW = new Set((process.env.SHOW || '').split(',').filter(Boolean).map(Number));
// whisper 幻覺指紋(沿用 whmiss HALLU,四條線共用)
const HALLU = /字幕由|感謝收看|不吝[点點]贊|訂閱|轉發|明鏡與點點|我就是想要你做我的|请不吝|点赞|打赏|MUSIC|Amara|字幕志愿者/i;
const rows = db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG, Number(MPAR));
const out = [];
for (const r of rows) {
  if (SHOW.size && !SHOW.has(r.id)) continue;
  let tl = {}; try { tl = JSON.parse(r.lyrics_timeline || '{}'); } catch (e) { continue; }
  const frames = Array.isArray(tl.ocr) ? tl.ocr : [];
  const wseg = Array.isArray(tl.whisper) ? tl.whisper : [];
  if (frames.length < MINFR || wseg.length < MINW) continue;
  // 🔴 密度閘(2026-08-25 加,實測 #3891 逼出嚟):**唔可以淨係數幀數**。
  //    #3891《求主給這世代看見異象》8 分鐘片得 16 幀 = 平均 30 秒先一幀,
  //    OCR 由 t=60 一跳去 t=78,中間成句招牌副歌(亦即歌名)根本冇機會俾人影到,
  //    結果佢就變咗「兩個證人都話冇」嘅假陽性。冇密度就冇資格講「零佐證」。
  const durSec = (() => { const d = String(r.duration || ''); const m = d.match(/^(\d+):(\d+)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : (Number(d) || 0); })();
  const ts = frames.map(f => Number(f.t) || 0);
  const span = Math.max(...ts) - Math.min(...ts);
  const cover = durSec > 0 ? durSec : span;
  if (cover > 0 && cover / frames.length > DENS) continue;
  // ── 證人一:OCR(逐行 + 同幀相鄰兩行黐埋),同時記住每個字串出自邊幾幀(夾縫閘要用)
  // 🔴 黐行要記住佢**橫跨邊兩幀**:夾縫閘量「上一句最遲喺邊幀」同「下一句最早喺邊幀」,
  //    如果將一條跨幀黐行淨係記喺頭嗰幀,上一句就會被當成「早咗一幀出現過」,個閘即刻漏氣
  //    (實例 #163:join(frame8「不是我一個」+frame9「…青草地去」)記咗喺 frame8,
  //     結果 frame8→frame9 相隔 6 秒就當「冇空間」,但真正嘅空窗係 frame9 t=90 → frame10 t=108 足足 18 秒)。
  const ocrW = new Set(); const wAt = new Map();      // k -> [{a:最早幀, b:最遲幀}]
  const put = (k, a, b = a) => { ocrW.add(k); if (!wAt.has(k)) wAt.set(k, []); wAt.get(k).push({ a, b }); };
  // ⚠️ 「合併行」唔止喺同一幀入面。**逐句 reveal 嘅片**(一幀一句)會將庫嘅一條行
  //    攤開喺**連續兩幀**:實例 #5051 t=106「哀慟了的人」/ t=110「祂必安慰我心」,
  //    庫寫成一行。所以要將全片 OCR 行拉成一條**跨幀序列**,再黐相鄰兩條(最多三條)。
  const seq = [];
  frames.forEach((f, fi) => {
    for (const l of String(f.text || '').split('\n').map(s => norm(s)).filter(s => s.length >= 2)) {
      seq.push({ k: l, fi }); put(l, fi);
    }
  });
  for (let i = 0; i + 1 < seq.length; i++) {
    put(seq[i].k + seq[i + 1].k, seq[i].fi, seq[i + 1].fi);
    if (seq[i + 2]) put(seq[i].k + seq[i + 1].k + seq[i + 2].k, seq[i].fi, seq[i + 2].fi);
  }
  // ── 證人二:whisper(逐段 + 相鄰兩段黐埋),先隔走幻覺段
  const whW = new Set();
  const wt = wseg.map(s => String(s.text || '')).filter(t => t && !HALLU.test(t)).map(norm).filter(s => s.length >= 2);
  for (let i = 0; i < wt.length; i++) { whW.add(wt[i]); if (wt[i + 1]) whW.add(wt[i] + wt[i + 1]); }
  if (!ocrW.size || !whW.size) continue;
  // ⚠️ 唔准用「長度差太遠就 skip」做濾網 —— 實例 #3907 庫行「抱緊祢歷灰心失意 不要緊」
  //    喺 whisper 度係跨兩段(「…抱緊你」+「歷灰心,實意不要緊 這種星光…」),黐埋之後
  //    成條長好多,一 skip 就變假陽性。長嘅證人行改為**喺佢入面滑窗**(窗只喺單一證人行
  //    /同幀兩行之內,唔係攤平全首歌,所以唔會踩返 #8369 嗰個假匹配陷阱)。
  const best = (k, pool) => {
    let b = 0;
    for (const w of pool) {
      if (w.includes(k)) return 1;
      if (w.length + 4 < k.length) continue;
      if (w.length <= k.length + 4) { const v = lcseq(k, w) / k.length; if (v > b) b = v; continue; }
      const L = k.length + 2;
      for (let i = 0; i + L <= w.length + 1; i++) {
        const v = lcseq(k, w.slice(i, i + L)) / k.length; if (v > b) b = v; if (b >= 1) return 1;
      }
    }
    return b;
  };
  // 邊幾幀撐得起呢條庫行(夾縫閘用):只認 OCR,whisper 冇幀號
  const framesOf = k => {
    const sp = [];
    for (const w of ocrW) {
      let ok = w.includes(k);
      if (!ok && Math.abs(w.length - k.length) <= Math.max(4, k.length * 0.5)) ok = lcseq(k, w) / k.length >= HI;
      // ⚠️ 定位只准用「單行」或者「同幀黐行」(a===b)。**跨幀黐行冇得定位** ——
      //    佢代表嘅係兩幀合埋嘅內容,攞佢個尾幀當「上一句最遲出現嘅幀」會令夾縫閘漏氣
      //    (#163:庫7 靠 join(frame9+frame10) 就變咗「frame10 都仲喺度」,
      //     跟住 frame10→frame11 相隔 2 秒就當冇空間,但真空窗係 frame9→frame10 18 秒)。
      if (ok) sp.push(...(wAt.get(w) || []).filter(x => x.a === x.b));
    }
    return sp;
  };
  const dl = (r.lyrics || '').split('\n').map(s => s.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < dl.length; i++) {
    const k = norm(dl[i]);
    if (k.length < MINK) { items.push(null); continue; }
    const bo = best(k, ocrW), bw = best(k, whW);
    // 兩個證人各自有自己嘅門檻:OCR 嚴(HI)、whisper 鬆(WHI,粵語同音字湯)
    const ok = bo >= HI || bw >= WHI;
    items.push({ i, raw: dl[i], k, bo, bw, ok, score: Math.max(bo, bw) });
  }
  const real = items.filter(Boolean);
  if (real.length < 5) continue;
  const q = real.filter(x => x.ok).length / real.length;
  if (q < MINQ) continue;
  // ⑤排首尾行 + 只報明顯零佐證
  let miss = real.filter(x => !x.ok && x.score < LO && x.i > 0 && x.i < dl.length - 1);
  // 🔴 夾縫閘(2026-08-25 加,呢個先係本掃描器嘅命根):
  //    「兩個證人都冇」有兩個完全唔同嘅成因 —— (a) 真係抄多咗;(b) **OCR 根本冇影到嗰一刻**。
  //    #3891《求主給這世代看見異象》同 #163《一生的恩惠》都係 (b):OCR 由 t=60 跳去 t=78,
  //    中間隔咗成段時間,首歌嘅招牌副歌**根本冇機會出現喺任何一幀**,唔係庫錯。
  //    判準:候選行嘅上一條同下一條庫行都要有 OCR 佐證,而且**佢哋撐得住嘅幀要係相鄰**
  //    (中間最多隔 GAPF 幀)—— 咁先證明「首歌播到嗰個位,鏡頭係影到嘅,但螢幕冇呢句」。
  if (!process.env.NOGAP) miss = miss.filter(x => {
    const a = real.find(y => y.i === x.i - 1), b = real.find(y => y.i === x.i + 1);
    if (!a || !b || !a.ok || !b.ok) return false;
    const fa = framesOf(a.k), fb = framesOf(b.k);
    if (!fa.length || !fb.length) return false;
    // ⚠️ 一定要**同時**數幀號同秒數。stored `tl.ocr` 係「2 秒格 + 相鄰去重」嘅產物,
    //    而**冇字幕嗰啲空幀根本唔會入 array** —— 所以「幀號相鄰」可以係隔咗 18 秒
    //    (實例 #163 frame9 t=90 → frame10 t=108),中間完全有空間畀嗰句歌詞出現過。
    //    幀號相鄰 = 冇第三張卡插入過;秒數相近 = 中間真係冇時間位。兩個都要。
    // ⚠️ 幀號同秒數要**同一對**幀同時滿足,唔可以各自攞最細(會攞咗兩對唔同嘅幀夾埋算)。
    // 上一句用佢**最遲**嗰幀(sp.b),下一句用佢**最早**嗰幀(sp.a)
    for (const p of fa.map(x => x.b)) for (const q of fb.map(x => x.a)) {
      if (q <= p || q - p > GAPF) continue;
      if ((Number(frames[q].t) || 0) - (Number(frames[p].t) || 0) <= GAPS) return true;
    }
    return false;
  });
  if (!miss.length) continue;
  if (!miss.length) continue;
  out.push({ id: r.id, title: r.title, artist: r.artist, n: dl.length, q, miss });
}
out.sort((a, b) => b.miss.length - a.miss.length || b.q - a.q);
console.log(`掃 ${rows.length} 首 → 命中 ${out.length} 首`);
for (const o of out.slice(0, TOPN)) {
  if (SHOW.size) {
    console.log(`===== #${o.id} ${o.title} | ${o.artist} | 佐證率 ${(o.q * 100).toFixed(0)}%`);
    const dl = (db.prepare('SELECT lyrics FROM hymns_all WHERE id=?').get(o.id).lyrics || '').split('\n').filter(s => s.trim());
    const bad = new Set(o.miss.map(m => m.i));
    dl.forEach((l, i) => console.log(`${bad.has(i) ? ' ❌' : '  '} ${String(i + 1).padStart(3)} ${l}`));
    for (const m of o.miss) console.log(`     ↳ 第${m.i + 1}行 ocr=${m.bo.toFixed(2)} wh=${m.bw.toFixed(2)}`);
  } else {
    console.log(`${o.id}\t零佐證${o.miss.length}\t庫${o.n}\t佐證${(o.q * 100).toFixed(0)}%\t${(o.artist || '').slice(0, 10)}\t${(o.title || '').slice(0, 34)}\t${o.miss.map(m => '「' + m.raw.slice(0, 18) + '」').join(' ')}`);
  }
}
