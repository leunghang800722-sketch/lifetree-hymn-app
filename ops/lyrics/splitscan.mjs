// R2 粵語單數線 2026-08-24 出品。用法:node ops/lyrics/splitscan.mjs [lang:parity]
// 病種:**庫入面有 OCR reveal 動畫嘅斷行殘留** —— 同一句歌詞俾人斷開咗做兩行(甚至三行)寫入庫,
// 例 #5895「拿」+「走所有的阻隔」、「抬」+「頭望」。junkscan 嘅「孤字」只捉到 ≤3 字嘅頭,
// 捉唔到「賜我清潔的」+「心」呢種頭長尾短。
// 判準:庫入面**連續兩行** A、B,A+B(去標點)喺同一條片嘅**某一幀 OCR 同一行**出現過,
//       而且 A 同 B 各自都**唔係**獨立出現喺任何一幀嘅完整一行 → 判斷斷行。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[^一-鿿A-Za-z]/g,'');
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let hit=0,tot=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const frames=(tl.ocr||[]);
  if(frames.length<3)continue;
  // OCR 每一行(逐幀逐行)嘅 normalized set
  const ocrLines=new Set(); const ocrByT=[];
  for(const f of frames){
    for(const l of String(f.text||'').split('\n')){
      const n=norm(l); if(n.length>=2){ocrLines.add(n);ocrByT.push([f.t,n]);}
    }
  }
  if(!ocrLines.size)continue;
  const lines=(r.lyrics||'').split('\n');
  const out=[];
  for(let i=0;i<lines.length-1;i++){
    const A=norm(lines[i]),B=norm(lines[i+1]);
    if(!A||!B)continue;
    // 🔴 v1 實測:淨靠「A+B 喺同一 OCR 行」信噪比得 0%(43 對全部係**螢幕一屏兩行、OCR 黐埋**,
    //   唔係庫斷錯行)。v2 加硬閘:**一定要有一邊 ≤3 個字**(即 #5895「拿」「心」「頭望」嗰種
    //   自己企唔成句嘅碎片);兩邊都成句嘅一律當 OCR 黐埋,唔報。
    if(Math.min(A.length,B.length)>3)continue;
    const AB=A+B;
    if(AB.length<4||AB.length>24)continue;
    const f=ocrByT.find(([t,n])=>n===AB);
    if(!f)continue;
    if(ocrLines.has(A)&&ocrLines.has(B))continue; // 兩邊都試過獨立成行 → 真係兩句
    out.push(`   ✂️[t=${f[0]}] 庫[${i}]「${lines[i].trim()}」+ 庫[${i+1}]「${lines[i+1].trim()}」 = 螢幕一行「${lines[i].trim()}${lines[i+1].trim()}」`+
             (ocrLines.has(A)?'  (A 有獨立幀)':'')+(ocrLines.has(B)?'  (B 有獨立幀)':''));
  }
  if(out.length){hit++;tot+=out.length;console.log(`\n#${r.id} (${r.duration}) ${r.artist} | ${r.title.slice(0,44)}  [庫 ${lines.filter(s=>s.trim()).length} 行]`);console.log(out.join('\n'));}
}
console.log(`\n掃 ${rows.length} 首,疑似斷行 ${hit} 首 / ${tot} 對`);
