// R2b 粵語雙數線 2026-08-24 晚班出品。
// 病種:**粵/國雙層字幕片** —— CantonHymn 一類粵譯 cover MV 會同時打「粵譯行」同「國語原詞行」,
//   庫有機會靜靜收咗國語層。呢隻掃描器揾「我(粵語)庫入面有,但同一行原封不動係某首 **國語** verified 歌嘅行」。
// 用法:node ops/lyrics/bilayerscan.mjs 粵語:0
// 佐證分級:hit 行如果**我自己 OCR 都影到**,代表螢幕真係有 → 更可能係第二層(而唔係共用歌詞)。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠她妳他它]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const all=db.prepare("SELECT id,lang,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
// 國語行索引(≥7 字先算,擋走「我愛你」呢類通用短句)
const zh=new Map();
for(const r of all){ if(r.lang!=='國語')continue;
  for(const l of r.lyrics.split('\n')){const k=norm(l); if(k.length<7)continue; if(!zh.has(k))zh.set(k,[]); zh.get(k).push(r.id);} }
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const t=new Map(all.map(r=>[r.id,r.title]));
let n=0;
for(const r of all){
  if(r.lang!==MLANG||r.id%2!==Number(MPAR))continue;
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>String(f.text||'').split('\n').map(s=>norm(s.trim())).filter(Boolean));
  // 🔴 濾網:單行撞中冇意思 —— 中文詩歌大量共用**經文原文**同**同一首詩歌嘅通用中文詞**
  //   (實測 99 首命中,全部係「願耶和華賜福給你保護你」民6:24 / 「壓傷的蘆葦祂不折斷」賽42:3 呢類)。
  //   真.雙層污染嘅特徵係**同一首國語歌一次過中多行**(國語原詞係成段打埋落螢幕第二層)。
  //   所以改成:按國語來源 group,同一首國語歌要中 ≥MINSAME 行先出。
  const MINSAME=Number(process.argv[3]||2);
  const bySrc=new Map();
  for(const l of r.lyrics.split('\n')){
    const k=norm(l); if(k.length<7)continue;
    const src=zh.get(k); if(!src)continue;
    const seen=frames.filter(ls=>ls.some(x=>x.includes(k))).length;
    for(const s of new Set(src)){ if(!bySrc.has(s))bySrc.set(s,[]); bySrc.get(s).push({l,seen}); }
  }
  const rows=[];
  for(const [s,ls] of bySrc){ if(ls.length<MINSAME)continue;
    rows.push(`   ⚠️ 撞 國語 #${s} ${(t.get(s)||'').slice(0,30)} —— ${ls.length} 行`);
    ls.forEach(v=>rows.push(`      「${v.l.trim()}」 [我 OCR ${v.seen} 幀]`));
  }
  if(!rows.length)continue; n++;
  console.log(`\n#${r.id} (${r.duration}) ${r.title.slice(0,50)}  [庫 ${r.lyrics.split('\n').filter(s=>s.trim()).length} 行]`);
  console.log(rows.join('\n'));
}
console.log(`\n掃完,有國語同行嘅歌:${n}`);
