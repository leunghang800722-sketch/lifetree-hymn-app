// R2b 粵語雙數線 2026-08-25 出品:「短副歌行」漏行掃描器。
// 動機:今班 #4388《是祢是祢》(ACM 兒歌)實錘咗一個**結構性盲點** ——
//   幾乎每隻共用掃描器(show-ocr-cards / gapscan2 / bulkproof / pairscan …)都有
//   `norm(s).length > 2` 或者 `length >= 4/6` 呢類**短行濾網**,用嚟擋 OCR 噪音。
//   後果係:歌入面嘅**短句副歌/呼應句**(「是祢」「哈利路亞」「主啊」「在這夜裡」)
//   **喺所有工具眼中都係隱形**,庫寫漏咗都冇人捉得到。
//   #4388 條片每一段都係「是祢 / 基督生於伯利恆 / 是祢 / 甘心降世為萬民」,
//   庫三個「是祢」全部漏晒,仲要首歌就叫《是祢是祢》。
//
// 判準:一條 2–5 個中文字嘅 OCR 行,喺 ≥MINF 個唔同幀出現,
//   而且**唔係任何庫行嘅子字串**(擋摺行碎片),
//   而且同幀至少有一行對得返庫(證明係喺歌詞區,唔係角落浮水印)。
//
// 用法: node shortline.mjs [lang:parity] [minFrames=3]     (env: SHOW=id,id)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// 🔴 一定要喺 S2T 之前先中和 祢/称/尔 —— opencc cn→t 會將「称」轉做「稱」,
//   之後嘅 [称]→你 就永遠接唔到,同一句歌詞會變咗兩個 key。
//   (2026-08-25 實測:#1690「竭力呼叫称」明明庫有「竭力呼叫祢…」都照報漏行。
//    同一個坑 08-23 R2b 喺 junkscan 撞過「祢→禰」版本。)
const pre=s=>String(s).replace(/[祢禰袮称袖尔]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称袖尔]/g,'你').replace(/[裏裡]/g,'里'.replace(/[着著]/g,'著'))
  .replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的')
  .replace(/[沈沉]/g,'沉').replace(/[^一-鿿]/g,'');
// 短行專用垃圾名單:片名/廠牌/版權/宣傳角標最常見嘅二三字
const JUNKSHORT=/^(更多|詩歌|敬拜|音樂|事工|專輯|試聽|版權|作曲|作詞|編曲|監製|主唱|演唱|混音|字幕|導演|攝影|剪接|後期|製作|出品|呈獻|鳴謝|完|終|前奏|間奏|尾奏|副歌|主歌|repeat|Verse|Chorus)$/i;
const JUNKLINE=/[©℗]|Ministr|版[權檬棒橫獲福社榴]|All Rights|Official|www\.|Copyright/;

function lcs(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const MINF=Number(process.argv[3]||3);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const SHOW=new Set((process.env.SHOW||'').split(',').filter(Boolean).map(Number));
const out=[];
for(const r of rows){
  const lib=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const nlib=lib.map(norm);
  const flat=nlib.join('|');
  if(nlib.filter(x=>x.length>=4).length<3) continue;
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const ocr=Array.isArray(tl.ocr)?tl.ocr:[];
  if(ocr.length<6) continue;
  const cand=new Map();
  let nAnch=0;
  for(const f of ocr){
    const ls=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const ks=ls.map(norm);
    // 同幀要有至少一行對得返庫(≥5 字而且係庫行子字串/超字串)
    const anchored=ks.some(k=>k.length>=5&&nlib.some(n=>n.includes(k)||k.includes(n)));
    if(anchored) nAnch++;
    for(let i=0;i<ls.length;i++){
      const k=ks[i];
      if(k.length<2||k.length>5) continue;
      if(JUNKLINE.test(ls[i])||JUNKSHORT.test(ls[i].replace(/\s/g,''))) continue;
      if(flat.includes(k)) continue;                 // 已經喺庫(包括做子字串)
      // 濾網③(2026-08-25 加):OCR 爛一個字就變新 key。實例 #3600「**熊**站在破口」
      //   —— 庫明明有「**能**站在破口」。用 fuzzy 對返庫,≥0.7 即當已經收咗。
      if(nlib.some(n=>Math.abs(n.length-k.length)<=1&&lcs(n,k)>=Math.max(n.length,k.length)*0.7)) continue;
      if(!cand.has(k)) cand.set(k,{raw:ls[i],ts:[],out:0});
      const e=cand.get(k);
      if(anchored){ if(!e.ts.includes(f.t)) e.ts.push(f.t); } else e.out++;
    }
  }
  // 🔴 濾網(首跑 126 首入面 >95% 係浮水印,即刻要加):
  //   ① **浮水印一定會喺「冇歌詞嘅幀」出現**(片頭卡、片尾 credits、間奏)。
  //      所以規定候選喺「非歌詞幀」出現次數必須 = 0。呢招一次過殺晒
  //      「基敬/恩拜」(基恩敬拜 logo 打橫裂開)、「同心圓」、「敬拜馬拉松」、
  //      「貅瑪拉松」(敬拜馬拉松爛字)、「角聲使團」呢啲台徽。
  //   ② 佔比閘:出現喺過半歌詞幀 = 成片都有 = 浮水印,唔係一句副歌。
  //   ⚠️ 特登**唔用**「同 artist/org/title 撞字就剔」—— #4388 首歌就叫《是祢是祢》,
  //      漏咗嘅副歌行正正就係「是祢」,咁樣剔法會殺埋真陽性。
  const hits=[...cand.values()]
    .filter(e=>e.out===0 && e.ts.length>=MINF && (!nAnch||e.ts.length<=nAnch*0.5))
    .sort((a,b)=>b.ts.length-a.ts.length);
  if(!hits.length) continue;
  out.push({id:r.id,title:r.title,artist:r.artist,dur:r.duration,libN:lib.length,hits});
}
out.sort((a,b)=>b.hits[0].ts.length-a.hits[0].ts.length);
if(SHOW.size){
  for(const s of out.filter(x=>SHOW.has(x.id))){
    console.log(`\n===== #${s.id} | ${s.dur} | ${s.title}`);
    for(const h of s.hits) console.log(`  [${h.ts.length}幀 t=${h.ts.slice(0,10).join(',')}] 「${h.raw}」`);
  }
  process.exit(0);
}
console.log(`掃 ${rows.length} 首 → 短行候選 ${out.length} 首(門檻 ≥${MINF} 幀)`);
for(const s of out.slice(0,40))
  console.log(`${s.id}\t${s.hits[0].ts.length}幀\t庫${s.libN}\t${(s.artist||'').slice(0,10)}\t${s.title.slice(0,30)}\t${s.hits.slice(0,3).map(h=>'「'+h.raw+'」').join(' ')}`);
