// truncscan + 三層濾網(R1 2026-08-24):① 只收「庫行係螢幕行嘅前綴」(尾巴補完,唔收前面黐字)
//  ② 尾巴 ≥3 字而且唔可以係庫另一行嘅開頭(擋走「兩行黐埋一行」)③ 要 ≥2 幀
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗]|Ministr|Music Min|版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|混音|All Rights|Official|Lyric|專輯|www\.|詞[:：]|曲[:：]|調[:：]|粵譯|收錄|經文/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
function bestWindow(o,flat){const L=o.length;let best=0;
 for(let i=0;i+L<=flat.length;i++){const v=lcseq(o,flat.slice(i,i+L));if(v>best)best=v;if(best>=L)break;}return best;}
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nRow=0,killPre=0,killFuse=0,killFrm=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!frames.length) continue;
  const dlines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const dnorm=dlines.map(norm); const flat=dnorm.join('');
  const cand=new Map();
  for(const f of frames){
    for(const raw of String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean)){
      if(JUNK.test(raw)) continue;
      const o=norm(raw); if(o.length<8||flat.includes(o)) continue;
      let best=null;
      for(let i=0;i<dnorm.length;i++){const d=dnorm[i];
        if(d.length<5||d.length+3>o.length) continue;
        if(o.includes(d)&&(!best||d.length>best.d.length)) best={d,line:dlines[i],i};}
      if(!best) continue;
      if(bestWindow(o,flat)>=o.length-2) continue;
      if(!o.startsWith(best.d)){killPre++;continue;}                       // ①
      const tail=o.slice(best.d.length);
      if(tail.length<3){killPre++;continue;}
      if(dnorm.some(d=>d.length>=4&&(d.startsWith(tail.slice(0,Math.min(4,tail.length)))||tail.startsWith(d.slice(0,4))))){killFuse++;continue;} // ②
      const key=o;
      if(!cand.has(key)) cand.set(key,{raw,ts:[],best,tail});
      cand.get(key).ts.push(f.t);
    }
  }
  const keep=[...cand.values()].filter(v=>{if(v.ts.length<2){killFrm++;return false}return true});  // ③
  if(!keep.length) continue; nSong++;
  console.log(`\n#${r.id} (${r.duration}) ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,40)}  [庫 ${dlines.length} 行]`);
  for(const v of keep){ nRow++;
    console.log(`   ✂️[${v.ts.length}幀 t=${v.ts.slice(0,4).join(',')}] 螢幕「${v.raw.slice(0,56)}」 ⟵ 庫 line${v.best.i+1}「${v.best.line.slice(0,40)}」 尾巴「${v.tail}」`);}
}
console.log(`\n掃 ${rows.length} 首,命中 ${nSong} 首 / ${nRow} 行 | 濾走:非前綴/尾巴太短 ${killPre}、兩行黐埋 ${killFuse}、單幀 ${killFrm}`);
