import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
for(const id of process.argv.slice(2).map(Number)){
 const r=db.prepare('select title,duration,lyrics_timeline from hymns_all where id=?').get(id);
 const tl=JSON.parse(r.lyrics_timeline||'{}');
 console.log('===== #'+id+' '+r.title.slice(0,40)+' ('+r.duration+')');
 const seen=new Set();
 for(const f of (tl.ocr||[])){
   for(const l of f.text.split('\n').map(s=>s.trim()).filter(Boolean)){
     const k=l.replace(/[^一-鿿a-zA-Z]/g,''); if(k.length<2||seen.has(k))continue; seen.add(k);
     console.log('  ['+f.t+'] '+l);
   }
 }
}
