// R2 粵語單數線 2026-08-23 晚班出品。用法 + 已知假陽性見 docs/LYRICS-CATCHUP-LEDGER.md 21:41 收爐行。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
for(const spec of process.argv.slice(2)){
  const [a,b]=spec.split(':').map(Number);
  const A=db.prepare('SELECT id,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE id=?').get(a);
  const B=db.prepare('SELECT lyrics FROM hymns_all WHERE id=?').get(b);
  const tl=JSON.parse(A.lyrics_timeline||'{}');
  const flat=norm(A.lyrics);
  const frames=(tl.ocr||[]).map(f=>({t:f.t,raw:String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean),n:norm(f.text)}));
  console.log(`\n===== #${A.id} (${A.duration}) ${A.title.slice(0,46)}  [庫 ${A.lyrics.split('\n').filter(s=>s.trim()).length} 行 / OCR ${frames.length} 幀]`);
  console.log('庫: '+A.lyrics.split('\n').filter(s=>s.trim()).join(' / '));
  for(const l of B.lyrics.split('\n')){
    const n=norm(l); if(n.length<5||flat.includes(n)) continue;
    const hits=frames.filter(f=>f.n.includes(n));
    if(!hits.length) continue;
    console.log(`  ➕ 「${l.trim()}」  ←${hits.length}幀: `+hits.slice(0,2).map(h=>`[${h.t}] ${h.raw.join(' ⏐ ').slice(0,70)}`).join(' ;; '));
  }
}
