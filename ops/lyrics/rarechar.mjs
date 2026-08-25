// R2 粵語單數線 2026-08-24 出品。「庫入面焗死咗嘅 OCR 爛字 / 非歌內容」偵測器。
// 原理:攞**全庫 verified 歌詞**做語料統計每個漢字出現次數,再喺你分區揾出「用咗全庫 ≤N 次
//   嘅字」嘅行。真歌詞用罕見字係常態(「襁褓」「蜻蜓」「霹靂」),所以**唔可以自動判死**,
//   佢係一張**人手覆核清單**:OCR 焗死咗嘅爛字(例 #165「也不作也不縑」、#4397「艱辛墣面」)
//   同埋抄咗宣傳/旁白入歌詞欄嘅非歌內容(例 #1787 峰會宣傳短片)會浮上嚟。
// 用法:node ops/lyrics/rarechar.mjs [lang:parity] [maxFreq=2]
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const MAXF=Number(process.argv[3]||2);
const all=db.prepare("SELECT id,lang,title,lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const freq=new Map();
for(const r of all) for(const c of (r.lyrics||'')) if(/[一-鿿]/.test(c)) freq.set(c,(freq.get(c)||0)+1);
const mine=all.filter(r=>r.lang===MLANG&&r.id%2===Number(MPAR));
let n=0;
for(const r of mine){
  const bad=[];
  for(const l of (r.lyrics||'').split('\n')){
    const rare=[...l].filter(c=>/[一-鿿]/.test(c)&&(freq.get(c)||0)<=MAXF);
    if(rare.length) bad.push(`   「${l.trim()}」   罕=${[...new Set(rare)].join('')}`);
  }
  if(bad.length){n+=bad.length;console.log(`\n#${r.id} ${r.title.slice(0,50)}`);console.log(bad.join('\n'));}
}
console.log(`\n掃 ${mine.length} 首(語料 ${all.length} 首 verified),罕見字行 ${n}`);
