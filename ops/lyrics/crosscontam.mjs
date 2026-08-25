// 孤兒行(自己片冇佐證) 有冇原封不動出現喺第啲歌 → 疑似「抄錯歌」污染
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
import fs from 'fs';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称你祂他它]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const all=db.prepare("SELECT id,title,lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const idx=new Map();
for(const r of all) for(const l of r.lyrics.split('\n')){const k=norm(l); if(k.length<7)continue; if(!idx.has(k))idx.set(k,new Set()); idx.get(k).add(r.id);}
const orph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const t=new Map(all.map(r=>[r.id,r.title]));
for(const x of orph){
  const hits=[];
  for(const l of x.orphans){const k=norm(l); if(k.length<7)continue;
    const s=idx.get(k); if(s&&s.size>1){const others=[...s].filter(i=>i!==x.id); hits.push(l+'  ⇠ 亦見於 '+others.slice(0,3).map(i=>'#'+i+' '+(t.get(i)||'').slice(0,16)).join(', '));}}
  if(hits.length>=2) {console.log('== #'+x.id+' '+x.title.slice(0,30)+' ('+x.orphans.length+'/'+x.n+')'); hits.forEach(h=>console.log('   '+h));}
}
