// R1b 國語雙數線 2026-08-25 出品 —— 「同幀 block 錨定」掃描器。
//
// 由來:今日 cardgap 落國語雙數 138 命中,真陽性 3 條全部**唔係**佢報嘅糊字候選行,
//       而係我人手讀嗰啲「一幀夠晒一整段」嘅乾淨幀嗰陣睇返出嚟(#1966 #2152 #6454)。
//       所以直接針對呢個 pattern 寫一隻:
//
// 判準:一個 OCR 幀入面如果有 ≥2 行**乾淨中文行**對得返庫嘅行(錨),
//       而同一幀仲有第三行乾淨中文行**庫完全冇**(連 fuzzy 都唔似) →
//       嗰行就係「抄歌詞嗰陣跳咗一行」。同幀相鄰係最硬嘅佐證,好過任何相似度分數。
//
// 濾網(全部只減唔加):
//   ① 浮水印/credit/版權/專輯名 行一律唔算(WM)
//   ② 候選要 ≥5 個中文字、拉丁字母佔比 <0.3
//   ③ 候選對任何一條庫行 cover ≥0.7 → 當係同一行嘅糊字重讀,唔報
//      (呢條係今日實測最大嘅假陽性源頭:#3658 #5186 #2248 #1826 #3910 #4058 全部中招)
//   ④ 錨行要 ≥2 條,而且錨行本身要係乾淨行
//   ⑤ 可選 whisper 佐證:--wh 要求候選喺自己 whisper 有 lcs≥3 且 cover≥0.5
//
// 用法:node ops/lyrics/blockgap.mjs <lang>:<parity> [--wh]      例:國語:0
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
function lcs(a,b){if(!a||!b)return 0;let best=0;const dp=new Array(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){let prev=0;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=a[i-1]===b[j-1]?prev+1:0;if(dp[j]>best)best=dp[j];prev=t;}}return best;}
function cover(a,b){if(!a.length)return 0;let n=0;const bag=b.split('');
 for(const c of a){const i=bag.indexOf(c);if(i>=0){bag.splice(i,1);n++;}}return n/a.length;}
const WM=/版權|所有|Ministr|Music|©|＠|新心音樂|音樂事工|讚美之泉|天韻|有情天|生命河|泥土音樂|大衛帳幕|Worship|www|Copyright|專輯|詞[:：]|曲[:：]|詞\/曲|作詞|作曲|編曲|Lyric|Compos|敬拜讚美系列|影視中心|更多歌曲|點選這裡/i;
const latRatio=s=>{const t=s.replace(/\s/g,'');return t.length?(t.match(/[A-Za-z]/g)||[]).length/t.length:1;};
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [MLANG,MPAR]=(process.argv[2]||'國語:0').split(':');
const NEEDWH=process.argv.includes('--wh');
// 🔤 罕見字濾網:用全庫 verified 歌詞砌一張字頻表。OCR 糊字最典型嘅指紋就係
//    「砌到啲全庫歌詞從來冇出現過嘅字」(詙簣/荠苓/蜺/嵇/瀼/邸/趧…)。
//    候選行只要有一個字全庫出現 < RAREN 次就當糊字,唔報。
const RAREN=Number((process.argv.find(a=>a.startsWith('--rare='))||'--rare=3').split('=')[1]);
const freq=new Map();
for(const x of db.prepare("SELECT lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all())
  for(const c of norm(x.lyrics||'')) freq.set(c,(freq.get(c)||0)+1);
const garbled=s=>{for(const c of norm(s)) if((freq.get(c)||0)<RAREN) return true; return false;};
const rows=db.prepare("SELECT id,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND curated=1 AND lyrics_status='verified' AND id%2=? AND lyrics IS NOT NULL").all(MLANG,+MPAR);
let scanned=0,hit=0,cands=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const ocr=Array.isArray(tl.ocr)?tl.ocr:[]; if(ocr.length<3) continue;
  scanned++;
  const curLines=(r.lyrics||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const curN=curLines.map(norm).filter(x=>x.length>=4);
  const curFlat=curN.join('');
  const W=(Array.isArray(tl.whisper)?tl.whisper:[]).map(x=>norm(x.text||'')).filter(Boolean);
  const found=new Map();                       // 候選行 → {n, anchors, t}
  for(const f of ocr){
    const fl=(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
    // 🔑 經文卡濾網(R1b 2026-08-25 加,實測 #4150 #8486 #7254 #8118 四首靠佢):
    //    經文卡同唱版行文字高度相似,結果卡入面兩行做咗「錨」、第三行變假候選。
    //    卡嘅指紋:整幀有聖經出處(XX書 9:6 / ~以賽亞書9:6~),或者 ≥2 行收喺 、；。,
    //    唱詞字幕**唔會**咁標點。見到就成幀跳過。
    // R1b 2026-08-25 再放寬:出處可以用中文數字(傳道書四：11)、標點加返「！？」
    if(/[一-鿿]{1,5}[書記音福傳示][\s]*[0-9一二三四五六七八九十百]+\s*[:：篇章]/.test(f.text||'')) continue;
    if(/參考經文|經文[:：]|詩篇|節[-—~～]?\s*$/.test(f.text||'')) continue;
    const punc=fl.filter(x=>/[、；。，！？]\s*$/.test(x)).length;
    if(punc>=2) continue;
    const clean=fl.filter(x=>!WM.test(x)&&latRatio(x)<0.3&&norm(x).length>=5);
    if(clean.length<3) continue;
    if(clean.some(garbled)) continue;   // 成幀有糊字 → 錨都信唔過
    const anchors=[],miss=[];
    for(const c of clean){
      const q=norm(c);
      let best=0; for(const cl of curN){const v=Math.max(cover(q,cl),cover(cl,q)); if(v>best)best=v;}
      // R1b 2026-08-25 加:字幕成日將**兩條庫行重排做一行**(實例 #1958「同聲讚美主 高唱哈利路亞」
      //   = 庫 line18 尾 + line19 頭),逐行比對永遠當佢係新行。所以再對庫全文攤平比一次。
      if(best<0.8&&cover(q,curFlat)>=0.85) best=0.85;
      if(best>=0.8) anchors.push(c); else if(best<0.7) miss.push(c);
    }
    if(anchors.length<2||!miss.length) continue;
    for(const m of miss){
      const k=norm(m);
      const e=found.get(k)||{n:0,txt:m,anchors:new Set(),t:[]};
      e.n++; e.t.push(f.t); anchors.forEach(a=>e.anchors.add(a)); found.set(k,e);
    }
  }
  const out=[];
  for(const [k,e] of found){
    if(NEEDWH){
      let bl=0,bc=0; for(const w of W){const L=lcs(k,w),C=cover(k,w); if(L>bl||(L===bl&&C>bc)){bl=L;bc=C;}}
      if(!(bl>=3&&bc>=0.5)) continue;
    }
    out.push(`   ➕[${e.n}幀 t=${e.t.slice(0,3).join(',')}] 「${e.txt}」  錨:${[...e.anchors].slice(0,2).map(a=>'「'+a.slice(0,16)+'」').join('')}`);
  }
  if(!out.length) continue;
  hit++; cands+=out.length;
  console.log(`\n#${r.id} (${r.duration}) ${r.title.slice(0,52)}  [庫${curLines.length}行 / OCR${ocr.length}幀]`);
  out.forEach(x=>console.log(x));
}
console.log(`\n掃 ${scanned} 首${NEEDWH?'(要 whisper 佐證)':''},命中 ${hit} 首 / ${cands} 條候選`);
