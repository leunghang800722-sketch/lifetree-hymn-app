// R2 粵語單數線 2026-08-23 晚班出品。用法 + 已知假陽性見 docs/LYRICS-CATCHUP-LEDGER.md 21:41 收爐行。
// R2b 2026-08-24:加 argv[2] 分區參數 `lang:parity`(例 粵語:0 / 國語:1),**預設維持 R2 粵語單數**,行為零改動。
// R2 2026-08-23 晚班:殘缺偵測器 v2 —— 唔靠 whisper 字準,只問「呢一秒有冇人唱 / 有冇字幕」
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const NOISE=/\[MUSIC\]|MUSIC|詩歌歌曲|詩歌歌詞|歌詞的錄音|字幕|訂閱|感謝收看|請不吝|Amara/;
const cjk=s=>String(s).replace(/[^一-鿿]/g,'').length;
const secs=d=>{ if(!d)return 0; const p=String(d).split(':').map(Number); return p.length===2?p[0]*60+p[1]:(p.length===3?p[0]*3600+p[1]*60+p[2]:0); };
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const rows=db.prepare("SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL").all(MLANG,Number(MPAR));
const out=[];
for(const r of rows){
  const dur=secs(r.duration); if(!dur) continue;
  let tl={}; try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const W=(tl.whisper||[]).filter(w=>!NOISE.test(w.text)&&cjk(w.text)>=6);
  if(W.length<5) continue;
  const ocrT=(tl.ocr||[]).filter(f=>cjk(f.text)>=4).map(f=>f.t);
  if(!ocrT.length) { out.push({id:r.id,title:r.title,artist:r.artist,dur,sung:0,missPct:100,nOcr:0,nLib:(r.lyrics||'').split('\n').filter(s=>s.trim()).length,gaps:['冇任何有字OCR幀']}); continue; }
  let sung=0, missed=0; const gaps=[];
  for(const w of W){
    const a=w.t0, b=(w.t1||w.t0+3); const len=Math.max(0,b-a); sung+=len;
    const near=ocrT.some(t=>t>=a-6&&t<=b+6);
    if(!near){ missed+=len; gaps.push(`${Math.round(a)}-${Math.round(b)}`); }
  }
  if(sung<50) continue;
  out.push({id:r.id,title:r.title,artist:r.artist,dur,sung:Math.round(sung),missPct:Math.round(missed/sung*100),nOcr:ocrT.length,nLib:(r.lyrics||'').split('\n').filter(s=>s.trim()).length,gaps});
}
out.sort((a,b)=>b.missPct-a.missPct||b.sung-a.sung);
const hot=out.filter(o=>o.missPct>=40);
console.log(`掃 ${rows.length} 首 verified ${MLANG} id%2=${MPAR} → ${out.length} 首有足夠 whisper 可量`);
console.log(`🔴 「唱緊但零字幕」≥40% 嘅:${hot.length} 首 (${(hot.length/out.length*100).toFixed(1)}%)`);
console.log(`   ≥60%:${out.filter(o=>o.missPct>=60).length} 首`);
console.log(hot.slice(0,35).map(o=>`#${o.id} miss=${o.missPct}% 唱${o.sung}s/片${o.dur}s ocr幀${o.nOcr} 庫${o.nLib}行 | ${o.artist} | ${o.title.slice(0,42)}`).join('\n'));
fs.writeFileSync((process.env.SP||'/tmp')+'/incomplete-scan.json',JSON.stringify(out,null,1));
