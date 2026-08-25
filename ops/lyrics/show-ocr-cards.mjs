import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const JUNK=/[©℗]|Ministr|Music Min|版[權檬棒橫獲福社榴]|廠權|[^\s]{0,3}[\/／\\][曲詞]|作詞|作曲|編曲|填詞|All Rights|Official|Lyric|新心|專輯|www\.|[A-Za-z]{4,}\s+[A-Za-z]{2,}|^[A-Za-z0-9 ,.'!?-]+$|詞[:：]|曲[:：]|調[:：]/;
const norm=s=>s.replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
for(const id of process.argv.slice(2).map(Number)){
  const r=db.prepare('SELECT title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE id=?').get(id);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  console.log(`===== ${id} | ${r.duration} | ${r.title}`);
  console.log('庫: '+(r.lyrics||'').split('\n').filter(s=>s.trim()).join(' / '));
  const seen=new Set(); const outl=[];
  for(const f of (tl.ocr||[])){
    const ls=String(f.text||'').split('\n').map(s=>s.trim()).filter(s=>norm(s).length>2&&!JUNK.test(s));
    if(!ls.length)continue;
    const k=ls.map(norm).join('|'); if(seen.has(k))continue; seen.add(k);
    outl.push(`  [${f.t}] ${ls.join(' ⏐ ')}`);
  }
  console.log(outl.join('\n'));
}
