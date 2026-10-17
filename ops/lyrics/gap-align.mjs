// R2 粵語單數線 2026-08-23 晚班出品。用法 + 已知假陽性見 docs/LYRICS-CATCHUP-LEDGER.md 21:41 收爐行。
// R2 2026-08-23 晚班:whisper t0/t1 同 OCR frame t 時序對位 —— 用嚟精準指出「OCR 漏咗邊幾行」
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
for(const id of process.argv.slice(2).map(Number)){
  const r=db.prepare('SELECT title,duration,lyrics_timeline FROM hymns_all WHERE id=?').get(id);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const ev=[];
  for(const f of (tl.ocr||[])){
    const ls=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(ls.length) ev.push({t:f.t,k:'OCR',s:ls.join(' ⏐ ')});
  }
  for(const w of (tl.whisper||[])) ev.push({t:w.t0,t1:w.t1,k:'WHI',s:w.text});
  ev.sort((a,b)=>a.t-b.t||(a.k==='WHI'?-1:1));
  console.log(`===== #${id} ${r.title} dur=${r.duration}`);
  let lastOcr=-99;
  for(const e of ev){
    let flag='';
    if(e.k==='WHI'){
      const near=(tl.ocr||[]).some(f=>f.t>=e.t-4&&f.t<=(e.t1||e.t)+4&&String(f.text||'').trim());
      if(!near) flag='  🔴冇OCR';
    }
    console.log(`${String(e.t).padStart(4)} ${e.k} ${e.s}${flag}`);
  }
}
