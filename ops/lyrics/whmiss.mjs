// R2 粵語單數線 2026-08-24 出品:「whisper 段落覆蓋率離群值」掃描器。
// 動機:粵語 whisper 逐字錯 20-30%,絕對 LCS 門檻一係全部報一係全部唔報。
//   改用**每首歌自己嘅中位數做基準** —— 同一條片同一把聲,whisper 質素一致,
//   所以「庫入面有嗰句」嘅覆蓋率會叢聚喺一個值;明顯低過中位數嘅段 = 庫冇呢句。
// 用法: node whmiss.mjs [lang:parity] [離群倍數,預設 0.55]
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s).replace(/[称袮尔]/g,'你')).replace(/[祢禰袮称袖妳]/g,'你').replace(/[衪祂牠他她]/g,'他').replace(/[裏裡]/g,'里').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const NOISE=/\[MUSIC\]|MUSIC|詩歌歌曲|詩歌歌詞|歌詞的錄音|字幕|訂閱|感謝收看|請不吝|Amara|明鏡|點贊/;
// 🔴 whisper 幻覺 vein 指紋(記憶:『詞曲李宗盛/張震嶽』),同埋 credits 段
// R2 2026-08-25 加:實測三首唔同歌(#1751 #2025 #2341 #3293)吐同一句「我就是想要你做我的朋友」,
//   同 YouTube 頻道叫訂閱嘅整段,兩個都係 whisper 喺純音樂/長尾段嘅固定幻覺,四條線通用。
// R1b 2026-08-25 加:同一句仲有**反過來**嘅講法「你不想要我做你的女朋友吗」(實例 #4090 從我興起),
//   所以個指紋放寬到「想要你做我的 / 想要我做你的」兩個方向。
const HALLU=/李宗盛|張震嶽|張宇|周杰倫|詞曲|作詞|作曲|編曲|監製|主唱|和聲[:：]|想要(你做我|我做你)的(女?)朋友|不吝(点赞|點讚)|(订阅|訂閱).{0,4}(转发|轉發)|明镜与点点|感謝收看|字幕由/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
// 段落 s 喺庫全文最佳「同長度滑動窗」對齊比率
function cover(s,flat){const L=s.length;if(!L||flat.length<L)return 0;let best=0;
 for(let i=0;i+L<=flat.length;i++){const v=lcseq(s,flat.slice(i,i+L));if(v>best)best=v;if(best>=L)break;}return best/L;}
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const RATIO=Number(process.argv[3]||0.55);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nSeg=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const W=(Array.isArray(tl.whisper)?tl.whisper:[]).filter(w=>!NOISE.test(w.text||''));
  if(W.length<5) continue;
  const flat=r.lyrics.split('\n').map(norm).join('');
  if(flat.length<20) continue;
  // whisper 段落切句(逗號/句號都切,粵語 whisper 常常一段吐成幾句)
  const segs=[];
  for(const w of W) for(const p of String(w.text).split(/[,，。.!?！？、]/)){
    const k=norm(p); if(k.length>=10&&!HALLU.test(p)) segs.push({t:Math.round(w.t0),k,raw:p.trim()});}
  if(segs.length<5) continue;
  const uniq=new Map(); for(const s of segs) if(!uniq.has(s.k)) uniq.set(s.k,s);
  const list=[...uniq.values()];
  if(list.length<4) continue;
  for(const s of list) s.c=cover(s.k,flat);
  const sorted=[...list].map(s=>s.c).sort((a,b)=>a-b);
  const med=sorted[Math.floor(sorted.length/2)];
  if(med<0.70) continue;   // whisper 質素太差,唔可靠
  const out=list.filter(s=>s.c < med*RATIO && s.c < 0.35);
  if(!out.length) continue; nSong++;
  console.log(`\n#${r.id} (${r.duration}) ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,40)}  [庫${r.lyrics.split('\n').filter(Boolean).length}行 中位覆蓋 ${med.toFixed(2)}]`);
  for(const s of out.sort((a,b)=>a.t-b.t)){ nSeg++;
    console.log(`   ♪[t=${s.t} 覆蓋 ${s.c.toFixed(2)}] ${s.raw.slice(0,52)}`);}
}
console.log(`\n掃 ${rows.length} 首,離群 ${nSong} 首 / ${nSeg} 段`);
