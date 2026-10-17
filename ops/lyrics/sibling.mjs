// 2026-08-23 R2b 粵語雙數線出品。用法見 docs/LYRICS-CATCHUP-LEDGER.md 20:06 收爐行。
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const all=db.prepare("SELECT id,lang,title,artist,lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const idx=new Map(); const info=new Map();
for(const r of all){
  const set=new Set((r.lyrics||'').split('\n').map(norm).filter(k=>k.length>=6));
  if(!set.size)continue;
  const all=(r.lyrics||'').split('\n').map(norm).join('');
  info.set(r.id,{...r,set,all,n:(r.lyrics||'').split('\n').filter(s=>s.trim()).length});
  for(const k of set){ if(!idx.has(k))idx.set(k,[]); idx.get(k).push(r.id); }
}
// 🐞 R2 2026-08-24 修:舊版分區**寫死** `粵語 + id%2===0`(R2b 嘅分區)而且完全唔理 argv,
//   R2/R1/R1b 叫佢會靜靜掃返 R2b 分區 → 跨線撞單風險。而家收 argv[2] = `lang:parity`,
//   **預設維持 `粵語:0`**,所以 R2b 舊叫法零改動。
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const mine=all.filter(r=>r.lang===MLANG&&r.id%2===Number(MPAR)&&info.has(r.id));
const out=[];
for(const r of mine){
  const me=info.get(r.id); const cnt=new Map();
  for(const k of me.set) for(const o of (idx.get(k)||[])) if(o!==r.id) cnt.set(o,(cnt.get(o)||0)+1);
  for(const [o,shared] of cnt){
    if(shared<3)continue;
    const ot=info.get(o);
    const overlap=shared/Math.min(me.set.size,ot.set.size);
    if(overlap<0.5)continue;
    const onlyOther=[...ot.set].filter(k=>!me.set.has(k)&&!me.all.includes(k));
    if(onlyOther.length<2)continue;
    out.push({id:r.id,title:r.title,artist:r.artist,myN:me.n,mySet:me.set.size,sib:o,sibTitle:ot.title,sibArtist:ot.artist,sibLang:ot.lang,sibN:ot.n,shared,overlap:+overlap.toFixed(2),gain:onlyOther.length});
  }
}
out.sort((a,b)=>b.gain-a.gain);
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`我分區 ${mine.length} 首,搵到 ${out.length} 對「兄弟片而且對方多料」`);
console.log(out.slice(0,30).map(x=>`${x.id}(${x.myN}行) ← ${x.sib}(${x.sibN}行,${x.sibLang}) 共${x.shared} ov${x.overlap} +${x.gain}\t${x.title.slice(0,24)} ⟷ ${x.sibTitle.slice(0,24)}`).join('\n'));
