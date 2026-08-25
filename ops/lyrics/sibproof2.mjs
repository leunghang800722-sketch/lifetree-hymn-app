// R2b 粵語雙數線 2026-08-25 出品:「兄弟片補漏行」v2 —— sib-xfill 嘅接班人。
//
// 🔴 點解要重寫:sib-xfill 08-25 落粵語雙數出 180 條候選,**一條都落唔到字**。
//   逐條查完,四種假陽性佔咗 100%,而佢原本嘅濾網一條都攔唔到:
//   ⓐ **庫拆行方式唔同**:兄弟「人再可以愛真心相顧」vs 庫「人再可手牽手 沒界限」+「以愛 真心相顧」
//      → 逐行 set 比對必然報「庫冇」。**修法:攞成篇歌詞攤平做連續子串比。**
//   ⓑ **同字重組(字序/對仗差異)**:兄弟「讓我的心每天讚頌」vs 庫「讓我的心每天頌讚」、
//      兄弟「一天當可夠了」vs 庫「一天當就夠了」、兄弟「是祢為我打氣」vs 庫「是祂為我打氣」。
//      LCS / 子串兩種閘都攔唔到(連續子串斷開咗),但**兩條行嘅字幾乎一模一樣**。
//      🔑 **修法 = 字頻多重集重疊(overlap)**:候選同某條庫行共用 ≥len−1 個字 → 當 FP。
//      呢一層單獨殺咗 22 條入面嘅 8 條(-36%),而且零真陽性損失。
//   ⓒ **兄弟一字之差**:兄弟「常常在祢寶座前」vs 自己 OCR ×3「常常到祢寶座前」。
//      **修法:自己 OCR 撐嗰條行如果本身已經喺庫,就唔算佐證**(跟自己條片,唔好跟兄弟)。
//   ⓓ **公共文本歌跨譯本撞詞**:#1982《滿溢》(粵)同 #4896《耶和華是我的牧者》(華)都係詩篇23,
//      互相報對方漏行,但兩首各自嘅庫都同自己條片 OCR 一模一樣。
//      **修法:兄弟片行數必須 ≥ 自己 + MINDIFF,而且要求自己片有實證(見下)。**
//
// 判準:兄弟片(verified、同自己歌詞高度重疊)有、而自己庫冇嘅行,
//   一定要**自己條片**嘅 OCR 或者 whisper 湊夠 MINEV 個證據先報。
//   兄弟片只係「話畀你聽嗰幾隻字係乜」,唔可以單獨做落字理由。
//
// ⚠️ 仲有兩種佢攔唔到、要人手睇嘅:
//   ① **組曲 / medley 兄弟片**(#3812「獻給我天上的主＋謝謝我主」、#3052「不要憂慮2024組曲」)
//      多出嚟嘅行係**第二首歌**嘅。指紋:兄弟片行數係自己嘅 2 倍以上 + 片名有「＋」「組曲」。
//   ② **創作訪問 / 試聽版**(#2608 #2624 創作訪問、#4368 試聽版):條片本身淨係播半首,
//      庫短係啱嘅。指紋:自己片零 OCR 零 whisper 佐證(呢隻掃描器會自動隔走)。
//   ③ **副歌 header 只寫一次**(閘④ 攔唔到嘅殘餘,實測兩首全部係呢種):
//      庫將重複出現嘅「謝謝我主」只列一次擺喺第 1 行,但兄弟片每次副歌都寫成
//      「謝謝我主 願關心與體諒」「謝謝我主 常帶領我導航」—— 拆開兩截**唔相鄰**,
//      所以「相鄰 2/3 行串連」個閘夾唔到。同類:#1758「耶穌祢已經得勝 祢永遠掌權 掌管列國」
//      = 庫第 11 + 12 + 23 行。**判準:候選拆得開兩截,每截都喺庫揾得返 → FP。**
//
// 🧾 R1 國語單數線 2026-08-25 補:落國語單數 1684 首 → 38 首有自己片實證,
//    人手做咗 23 首,**19 首真陽性**(信噪比 83%)。同粵語雙數嗰次「0 真」差天共地,
//    原因係國語呢邊新心音樂事工 / 泥土音樂 / 天韻 三個 org 有個習慣:
//    **同一首歌出兩條片(MV 版 + 歌詞版/官方版),其中一條 OCR 成日只影到一半**
//    (副歌段零幀),但兩條片嘅 whisper 都完整 → 兄弟片解碼 + 自己 whisper 佐證特別好用。
//    🔑 心法:**兄弟片係「解碼器」,唔係「證據」**。佢負責話你知 whisper 嗰堆亂碼原本係乜字
//    (#8521「就是一波都變成心」→「舊事已過 都變成新」、#4053「恭祝您來臨」→「奉主名來的」),
//    但落唔落刀一定要睇自己條片。凡係「兄弟片有、自己片兩個證人都揾唔到」→ 一律唔郁。
//
// ⚠️ 國語單數實戰再多三種人手要睇嘅假陽性(ⓔⓕⓖ):
//   ⓔ **同一首歌唔同編曲版本歌詞真係唔同**:#5319《讓讚美飛揚 敬拜版》自己 whisper 五次
//      「讓我們的心向**上唱歌**」,兄弟片《古典版》#5299 係「向**神敞開**」。庫係啱嘅。
//   ⓕ **兒童雙語版多咗襯詞**:#6234《新的一天》(兒童版)有「**喔~喔~**今天是個新的一天」,
//      成人版冇。同類:重複次數差異(#5867 榮耀×3 vs #3735 榮耀×6)。
//   ⓖ **片頭簡介卡**(唔係經文卡、唔係片名卡,所以兩邊閘都攔唔到):#924/#1011《感恩》
//      條片頭有段推介文字「生命有高山低谷 / 忙碌中我們常忘了 / 連呼吸都是恩典。/ 今天,我們
//      停下腳步…願這首歌成為你心中的安慰與力量」,兄弟片庫抄咗第一行入去。
//      判準:一幀 ≥4 行 + 有「今天/我們/願這首歌」呢類第二人稱敘述 + 句號 = 簡介卡。
//
// 🆕 呢隻工具**結構上捉唔到**、但兄弟片人手比對一睇就明嘅三個病種(2026-08-25 國語單數實錄):
//   ① **副歌 header 被剝走**(#5791《十字架》):庫 4 行寫住「耶穌以愛覆蓋我」「祢寶血為我流下」…
//      每句前面嗰個「十字架 十字架」全部唔見咗。逐行 set 比對永遠捉唔到 —— 因為每個 token
//      喺庫入面都揾得返(庫另一行仲有「十字架 十字架 永是我的榮耀」)。
//      同 header ③「副歌 header 只寫一次」係同一個病嘅**鏡像**。
//   ② **錯位黐行**(#7973《表達》/ #5295《注目看耶穌》/ #371《等候神》):庫行 = 卡A下半 + 卡B上半,
//      結果兩張卡各自嘅另一半齊齊消失。#5295 仲因為咁令歌名句「注目看耶穌」(全片 12 次)冇入庫。
//   ③ **庫由第二段開始**(#3151《快樂來到主面前》/ #3943《與祢同走過》/ #3995《耶穌的愛》):
//      開場一整段(通常包埋歌名句)冇收,庫由 verse 中間開波。
//
// 📉 實測(粵語雙數 838 首 verified):sib-xfill 出 180 條候選 **0 真**;
//    呢隻四層閘之後 531 → **2 首 3 條**,而且三條全部係上面 ③ 嗰種,即係**零噪音落到人手**。
//    (今班四首寫入係人手用 ocrgap / shellscan / 短庫兄弟片掃出嚟,唔係呢隻工具。
//     佢嘅價值係「證明呢個方向喺我分區已經榨乾」,唔使下一轉再掃一次 180 條。)
//
// 用法: node ops/lyrics/sibproof2.mjs [lang:parity]   (env: MINEV=2, MINDIFF=2, SHOW=id,id)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T = Converter({ from: 'cn', to: 't' });
// 🔴 一定要喺 S2T 之前中和 祢/称/尔 —— opencc cn→t 會將「称」變「稱」
const pre = s => String(s).replace(/[祢禰袮称袖尔妳]/g, '你');
const norm = s => S2T(pre(s)).replace(/[祢禰袮称袖尔妳]/g, '你').replace(/[裏裡]/g, '里')
  .replace(/[衪祂牠他她它]/g, '他').replace(/[着著]/g, '著').replace(/[沈沉]/g, '沉')
  .replace(/[的得地]/g, '的').replace(/[那哪]/g, '那').replace(/[^一-鿿]/g, '');
const JUNK = /版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|收錄|專輯|經文|摘編|詩篇|以賽亞|羅馬書|約翰福音|哥林多|歷代志|以弗所|腓立比|啟示錄|馬太福音|創世記|彼得前書|耶利米/;
function lcs(a, b) {
  if (!a || !b) return 0; let best = 0; const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0; if (dp[j] > best) best = dp[j]; prev = t; } }
  return best;
}
// 字頻多重集重疊 —— 專打「同字重組」
function overlap(a, b) { const m = new Map(); for (const c of a) m.set(c, (m.get(c) || 0) + 1); let n = 0; for (const c of b) { if (m.get(c) > 0) { m.set(c, m.get(c) - 1); n++; } } return n; }

const MINEV = Number(process.env.MINEV || 2);
const MINDIFF = Number(process.env.MINDIFF || 2);
const SHOW = new Set((process.env.SHOW || '').split(',').filter(Boolean).map(Number));
const [MLANG, MPAR] = (process.argv[2] || '粵語:0').split(':');

const db = new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db', { readOnly: true });
const all = db.prepare("SELECT id,lang,title,lyrics,lyrics_timeline FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all()
  .map(r => {
    const lines = (r.lyrics || '').split('\n').map(s => s.trim()).filter(Boolean);
    return { id: r.id, lang: r.lang, title: r.title, tlRaw: r.lyrics_timeline, lines, keys: lines.map(norm).filter(k => k.length >= 6), flat: norm(r.lyrics || '') };
  });
const mine = all.filter(r => r.lang === MLANG && r.id % 2 === Number(MPAR) && r.keys.length >= 3);

let hits = 0, cands = 0;
for (const m of mine) {
  // 揾最夾嘅兄弟片(唔限同一分區、唔限同 lang —— 粵/國版本互為兄弟好常見)
  const sibs = [];
  for (const o of all) {
    if (o.id === m.id || o.lines.length < m.lines.length + MINDIFF) continue;
    const hit = m.keys.filter(k => o.flat.includes(k)).length;
    if (hit >= Math.max(2, Math.ceil(m.keys.length * 0.6))) sibs.push({ o, hit });
  }
  if (!sibs.length) continue;
  let tl = {}; try { tl = JSON.parse(m.tlRaw || '{}'); } catch (e) { }
  const ocrLines = [];
  for (const f of (tl.ocr || [])) for (const l of String(f.text || '').split('\n')) {
    const k = norm(l); if (k.length >= 4 && !JUNK.test(l)) ocrLines.push({ t: f.t, raw: l.trim(), k });
  }
  const whSegs = Array.isArray(tl.whisper) ? tl.whisper.map(s => ({ raw: String(s.text || '').trim(), k: norm(s.text || '') })) : [];
  const nl = m.lines.map(norm);
  const units = [...nl];
  for (let i = 0; i + 1 < nl.length; i++) units.push(nl[i] + nl[i + 1]);
  for (let i = 0; i + 2 < nl.length; i++) units.push(nl[i] + nl[i + 1] + nl[i + 2]);
  const inLib = k => k.length >= 5 && (m.flat.includes(k) || lcs(m.flat, k) >= k.length - 1);
  const report = [];
  const seen = new Set();
  for (const { o } of sibs) for (const line of o.lines) {
    const k = norm(line); if (k.length < 6 || seen.has(k) || JUNK.test(line)) continue;
    if (inLib(k)) continue;                                             // 閘① 連續子串
    // 閘② 同字重組:同某條庫行共用 ≥ len-1 個字 → FP
    // 閘④ 跨行黐埋:兄弟片成日將庫兩三行併埋一行(「謝謝我主 願關心與體諒」= 庫「謝謝我主」+「願關心與體諒 常維護我」)
    //     所以要同**相鄰 2/3 行嘅串連**一齊比,唔係淨係比單行。
    if (units.some(u => overlap(u, k) >= k.length - 1)) continue;
    seen.add(k);
    cands++;
    const oc = ocrLines.filter(x => lcs(x.k, k) >= Math.max(5, Math.floor(k.length * 0.6)) && !inLib(x.k));  // 閘③
    const wh = whSegs.filter(x => lcs(x.k, k) >= Math.max(6, Math.floor(k.length * 0.55)));
    if (oc.length + wh.length < MINEV) continue;
    report.push({ line, oc: oc.slice(0, 3), wh: wh.slice(0, 2), nOc: oc.length, nWh: wh.length, from: o.id });
  }
  if (!report.length) continue;
  hits++;
  console.log(`#${m.id} 庫${m.lines.length} | ${m.title.slice(0, 55)}`);
  for (const r of report) {
    console.log(`   ➕ 幀${r.nOc} wh${r.nWh} ← #${r.from} | ${r.line}`);
    if (r.oc.length) console.log(`      📺 ${r.oc.map(x => `[${x.t}] ${x.raw}`).join(' ⏐ ')}`);
    if (r.wh.length) console.log(`      🎧 ${r.wh.map(x => x.raw.slice(0, 46)).join(' ⏐ ')}`);
  }
  if (SHOW.has(m.id)) console.log('   庫: ' + m.lines.join(' / '));
}
console.log(`掃 ${mine.length} 首 → 過二閘候選 ${cands} 條 → 有自己片實證 ${hits} 首`);
