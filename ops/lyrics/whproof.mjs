// R2 粵語單數線 2026-08-24 出品。R1 2026-08-24 加 argv[2] 分區參數(格式 `lang:parity`,預設維持 R2 粵語單數)。
// 兄弟片候選 × 自己 whisper LCS 佐證(捉「滾動字幕/無字幕段」漏成段 verse)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
function lcs(a,b){if(!a||!b)return 0;let best=0;const dp=new Array(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){let prev=0;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=a[i-1]===b[j-1]?prev+1:0;if(dp[j]>best)best=dp[j];prev=t;}}return best;}
const all=db.prepare("SELECT id,lang,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const info=new Map(); const idx=new Map();
for(const r of all){const set=new Set((r.lyrics||'').split('\n').map(norm).filter(k=>k.length>=6));
 if(set.size<3)continue; info.set(r.id,{...r,set}); for(const k of set){if(!idx.has(k))idx.set(k,[]);idx.get(k).push(r.id);}}
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const mine=all.filter(r=>r.lang===MLANG&&r.id%2===Number(MPAR)&&info.has(r.id));
let n=0;
for(const r of mine){
  const me=info.get(r.id); const flat=norm(r.lyrics);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  // 🐞 R1 2026-08-24 修:有啲歌 lyrics_timeline.whisper 唔係 array(實例 #5225),舊版即場 crash 斷掃描。
  const W=(Array.isArray(tl.whisper)?tl.whisper:[]).map(w=>({t:Math.round(w.t0),n:norm(w.text)})).filter(w=>w.n.length>=4);
  if(W.length<4) continue;
  const cnt=new Map();
  for(const k of me.set) for(const o of (idx.get(k)||[])) if(o!==r.id) cnt.set(o,(cnt.get(o)||0)+1);
  const seen=new Set(); const rows=[];
  for(const [o,shared] of cnt){ if(shared<4) continue;
    for(const l of (info.get(o).lyrics||'').split('\n')){
      const k=norm(l); if(k.length<7||flat.includes(k)||seen.has(k))continue;
      let best=0,bt=null; for(const w of W){const v=lcs(k,w.n); if(v>best){best=v;bt=w;}}
      if(best < Math.max(6, Math.ceil(k.length*0.6))) continue; seen.add(k);
      rows.push(`   ♪[lcs ${best}/${k.length}] 「${l.trim()}」 ← #${o}  whisper[${bt.t}] ${bt.n.slice(0,44)}`);
    }}
  if(rows.length<2) continue; n++;
  console.log(`\n#${r.id} (${r.duration}) ${r.title.slice(0,42)}  [庫 ${r.lyrics.split('\n').filter(s=>s.trim()).length} 行]`);
  console.log(rows.join('\n'));
}
console.log('\n有 ≥2 條 whisper 佐證嘅歌:'+n);
