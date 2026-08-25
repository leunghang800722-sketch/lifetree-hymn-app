// 「庫有、片冇」:歌詞行喺自己條片嘅 OCR/whisper 都揾唔到 → 可能係抄錯來源/幻覺
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称你祂他它]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
// argv[3] = 分區 WHERE(預設 R1 國語單數)。R1b/R2/R2b 傳自己嗰句就得,唔使改 code。
// R1b 2026-08-24:argv[3] 兩種寫法都收 —— raw SQL,或者同大多數掃描器一致嘅 `lang:parity`(例 國語:0)。
//   舊版淨係收 raw SQL,四條線傳慣嘅 `國語:0` 會被當成 argv[2] 輸出路徑,然後靜靜掃返 default 分區。實測踩過兩次。
const _w=process.argv[3]||"lang='國語' AND id%2=1";
const _m=/^(國語|粵語|英文|日語):([01])$/.exec(_w);
const WHERE=_m?`lang='${_m[1]}' AND id%2=${_m[2]}`:_w;
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE ${WHERE} AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all();
const out=[];
for(const r of rows){
  let tl; try{tl=JSON.parse(r.lyrics_timeline)}catch(e){continue}
  const ocr=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>norm(f.text)).join('|');
  const wh=(Array.isArray(tl.whisper)?tl.whisper:[]).map(w=>norm(w.text||'')).join('|');
  if(ocr.length<20&&wh.length<20) continue;
  const lines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const orphans=[];
  for(const l of lines){
    const k=norm(l); if(k.length<4) continue;
    // 逐段 4 字滑窗:只要有一段連續 4 字喺片入面出現就算有佐證
    let found=false;
    for(let i=0;i+4<=k.length;i++){const seg=k.slice(i,i+4); if(ocr.includes(seg)||wh.includes(seg)){found=true;break}}
    if(!found) orphans.push(l);
  }
  const n=lines.filter(l=>norm(l).length>=4).length;
  if(orphans.length && n) out.push({id:r.id,title:r.title,artist:r.artist,duration:r.duration,n,orphans,ratio:+(orphans.length/n).toFixed(2)});
}
out.sort((a,b)=>b.ratio-a.ratio||b.orphans.length-a.orphans.length);
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首,有孤兒行 ${out.length} 首 / 共 ${out.reduce((s,x)=>s+x.orphans.length,0)} 行`);
console.log(out.slice(0,25).map(x=>`#${x.id} ${x.orphans.length}/${x.n} (${x.ratio}) ${(x.title||'').slice(0,30)}`).join('\n'));
