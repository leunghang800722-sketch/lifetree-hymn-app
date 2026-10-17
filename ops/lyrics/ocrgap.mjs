// R1 國語單數線 2026-08-25 出品:「OCR 空窗 × whisper 有料」掃描器。
//
// 動機:所有現有掃描器(cardgap / blockgap / gapscan2 / sandwich / pairscan …)都係
//   「攞一個 OCR 幀,同庫對數」。即係話 —— **OCR 根本冇幀嗰段時間,全部掃描器都係盲嘅**。
//   R1b 08-25 揾到 #6636 就係呢個病(條片 7:58,OCR t=332 就停晒,最後 2 分半鐘零字幕,
//   而嗰段真係仲有兩行歌詞),但當時係人手撞返嚟嘅,冇工具。
//
// 判準(只讀自己條片,唔靠兄弟片):
//   ① 揾出片入面所有「連續 ≥GAP 秒冇任何 OCR 幀」嘅時間窗(包括最後一幀之後嘅尾巴)
//   ② 喺嗰啲窗入面攞 whisper 段落
//   ③ 濾走幻覺指紋 / [MUSIC] / 太短 / 拉丁為主
//   ④ 剩低嘅段落如果**對唔返庫任何一行**(子序列 cover < COVER)→ 報
//
// ⚠️ whisper 本身有同音字問題,所以呢隻掃描器嘅輸出**唔可以直接落字**,
//    佢嘅用途係「指出邊首歌、邊個時間窗值得人手開返條片睇」。
//
// 用法: node ops/lyrics/ocrgap.mjs [lang:parity] [gapSec=45]   (env: SHOW=id,id, MINCJK=8, COVER=0.5)
//   COVER 係「對成首庫」嘅子序列覆蓋率上限 —— whisper 同音字錯得好緊要,
//   逐行比會令一句本身喺庫嘅句子跌到 0.4,所以一定要同時同**整首拼埋**比先。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// 🔴 一定要喺 S2T 之前中和 祢/称/尔 —— opencc cn→t 會將「称」變「稱」,之後接唔返。
const pre=s=>String(s).replace(/[祢禰袮称袖尔]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称袖尔]/g,'你').replace(/[裏裡]/g,'里')
  .replace(/[着著]/g,'著').replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那')
  .replace(/[的得地]/g,'的').replace(/[沈沉]/g,'沉').replace(/[^一-鿿]/g,'');
// whisper 幻覺指紋(四條線累積落嚟)
const HALLU=/李宗盛|張震嶽|周杰倫|我就是想要你做我的朋友|不想跟他一起玩|訂閱|字幕由|請不吝點贊|明鏡與點點欄目|MUSIC|APPLAUSE|SUBSCRIBE|感謝(大家)?收看|下集再見/i;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const durSec=d=>{if(d==null)return null;const s=String(d);if(/^\d+$/.test(s))return +s;
  const p=s.split(':').map(Number);if(p.some(isNaN))return null;
  return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:p[0];};

const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const GAP=Number(process.argv[3]||45);
const MINCJK=Number(process.env.MINCJK||8);
const COVER=Number(process.env.COVER||0.5);
const SHOW=process.env.SHOW?new Set(process.env.SHOW.split(',').map(Number)):null;
// 🏆 罕見字濾網(R1 08-25 出品,原本喺 blockgap 用):由全庫 verified 歌詞砌字頻表,
//    候選只要有**任何一個字全庫出現 < MINFREQ 次**就唔報。whisper 同音字亂拼 /
//    OCR 亂碼必然帶僻字,而真歌詞嘅字一定喺詩歌語料出現過好多次。env RARE=0 可以閂咗佢。
const FREQ=new Map();
for(const x of db.prepare("SELECT lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all())
  for(const ch of String(x.lyrics).match(/[\u4e00-\u9fff]/g)||[]) FREQ.set(ch,(FREQ.get(ch)||0)+1);
const MINFREQ=Number(process.env.MINFREQ||30);
const RARE=process.env.RARE!=='0';
const hasRare=t=>(String(t).match(/[\u4e00-\u9fff]/g)||[]).some(c=>(FREQ.get(c)||0)<MINFREQ);

const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND curated=1 AND lyrics_status='verified'
    AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));

let hit=0,scanned=0;
for(const r of rows){
  if(SHOW&&!SHOW.has(r.id))continue;
  let tl;try{tl=JSON.parse(r.lyrics_timeline)}catch(e){continue}
  const ocr=Array.isArray(tl.ocr)?tl.ocr:[];
  const wh=Array.isArray(tl.whisper)?tl.whisper:[];
  if(!wh.length)continue;
  scanned++;
  const libN=String(r.lyrics).split('\n').map(norm).filter(s=>s.length>=3);
  if(!libN.length)continue;
  const libAll=libN.join('');   // 🔑 整首拼埋:whisper 一段隨時橫跨庫兩三行,逐行比會系統性低估 cover
  const ts=[...new Set(ocr.map(f=>+f.t))].sort((a,b)=>a-b);
  const dur=durSec(r.duration)??(wh.length?+wh[wh.length-1].t1:0);
  // 砌空窗
  const gaps=[];
  let prev=0;
  for(const t of ts){ if(t-prev>=GAP) gaps.push([prev,t]); prev=t; }
  if(dur-prev>=GAP) gaps.push([prev,dur]);
  if(!gaps.length)continue;
  const found=[];
  for(const s of wh){
    const t0=+s.t0,t1=+s.t1;
    if(!gaps.some(([a,b])=>t0>=a&&t1<=b))continue;
    const raw=String(s.text||'').trim();
    if(!raw||HALLU.test(raw))continue;
    // 🔴 whisper 卡帶:同一句喺一段入面重複三四次(「祝我靠近妳的地,祝我靠近妳的地,…」)。
    //    唔拆走嘅話 cover 會俾重複拉低,一段廢話變成「庫冇」。拆句去重先再比。
    const phrases=[...new Set(raw.split(/[，,。！!？?、\s]+/).map(x=>x.trim()).filter(Boolean))];
    const n=norm(phrases.join(''));
    if(n.length<MINCJK)continue;
    if(RARE&&hasRare(raw))continue;
    let best=lcseq(n,libAll)/n.length;   // 對「成首歌」嘅覆蓋率
    for(const l of libN){ const c=lcseq(n,l)/n.length; if(c>best)best=c; }
    if(best>=COVER)continue;
    found.push({t0,t1,raw,best:best.toFixed(2)});
  }
  if(!found.length)continue;
  // 同一段文字重複出現(whisper 卡帶)只當一條
  const seen=new Set();const uniq=found.filter(f=>{const k=norm(f.raw);if(seen.has(k))return false;seen.add(k);return true;});
  if(!uniq.length)continue;
  hit++;
  console.log(`\n#${r.id} (${r.duration}) ${String(r.title).slice(0,58)}  [庫${String(r.lyrics).split('\n').filter(s=>s.trim()).length}行 / OCR${ocr.length}幀 / 空窗${gaps.map(g=>g[0]+'-'+g[1]).join(',')}]`);
  for(const f of uniq.slice(0,8)) console.log(`   🕳️[${f.t0}-${f.t1}] cover=${f.best}  ${f.raw.slice(0,70)}`);
}
console.log(`\n掃 ${scanned} 首(有 whisper 嘅)→ 命中 ${hit} 首`);
