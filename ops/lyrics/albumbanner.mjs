// R1 國語單數線 2026-08-25 出品 ——「專輯名/節目名橫額抄咗做歌詞」偵測器。
//
// 由來:#6511《一同起舞》庫第 1 行係「將來的國度」= 讚美之泉**專輯名**,唔係歌詞。
//   `titlecard.py` 捉唔到佢,因為佢判準②要求「第 1 行對得返**歌名**」;
//   呢隻掉轉頭,問「第 1 行對唔對得返 **album 欄 / 標題括號外嘅專輯尾巴 / 節目名**」。
//
// 判準(全部要成立):
//   ① 庫任何一行 L 係 2–12 個中文字嘅短行;
//   ② L 對得返 album 欄(或者標題入面「《…》」「專輯」前面嗰段)嘅中文主幹;
//   ③ L 唔係歌名本身(歌名 = 另一隻掃描器嘅範圍,唔重複報);
//   ④ L 喺 OCR 出現過。
// 唔要求「獨佔成幀」—— 橫額嘅特徵**啱啱相反**,佢會同歌詞行同幀出現。
//
// 用法: node ops/lyrics/albumbanner.mjs [lang:parity]
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const cjk=s=>String(s||'').replace(/[^一-鿿]/g,'');
const [LANG,PAR]=(process.argv[2]||'國語:1').split(':');
const rows=db.prepare("SELECT id,title,album,lang,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL").all(LANG);
let n=0,hit=0;
for(const r of rows){
  if(r.id%2!==Number(PAR))continue;
  n++;
  // 專輯名候選:album 欄 + 標題《…》 + 標題「…專輯」前面嗰段
  const cands=new Set();
  if(r.album) cands.add(cjk(r.album));
  for(const m of String(r.title).matchAll(/《([^》]+)》/g)) cands.add(cjk(m[1]));
  for(const m of String(r.title).matchAll(/([一-鿿]{2,12})\s*專輯/g)) cands.add(cjk(m[1]));
  cands.delete('');
  if(!cands.size)continue;
  // 🔑 排除「專輯名 = 歌名」嗰種(讚美之泉/天韻習慣用主打歌做專輯名,呢個係最大假陽性源頭)。
  //    做法唔係砌「歌名主幹」(砌唔準),而係攞**標題入面所有 ≥2 字嘅中文連續段**做黑名單。
  const tRuns=new Set(String(r.title).match(/[一-鿿]{2,}/g)||[]);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline)}catch(e){continue}
  const ocr=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>cjk(f.text)).join('|');
  if(!ocr)continue;
  const lines=r.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
  const bad=[];
  for(const l of lines){
    const k=cjk(l);
    if(k.length<2||k.length>12)continue;
    if(l.includes(' ')||l.includes('　'))continue;
    if(!cands.has(k))continue;
    if([...tRuns].some(t=>t.includes(k)))continue;   // 專輯名喺歌名入面出現過 → 佢係歌名唔係橫額
    if(lines.some(x=>x!==l&&cjk(x).includes(k)))continue; // 佢係另一句歌詞嘅一部分 → 可能真係唱
    if(!ocr.includes(k))continue;
    bad.push(l);
  }
  if(bad.length){hit++;console.log(`#${r.id}\t${(r.album||'—').slice(0,18)}\t${r.title.slice(0,40)}\n   🏷️ 疑似專輯橫額行: ${JSON.stringify(bad)}`);}
}
console.log(`掃 ${n} 首 → 命中 ${hit} 首`);
