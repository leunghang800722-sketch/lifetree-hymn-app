// 2026-08-23 R2b 粵語雙數線出品。用法見 docs/LYRICS-CATCHUP-LEDGER.md 20:06 收爐行。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称]/g,'你').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
function lcs(a,b){if(!a||!b)return 0;let prev=new Array(b.length+1).fill(0),best=0;
 for(let i=1;i<=a.length;i++){const cur=new Array(b.length+1).fill(0);
  for(let j=1;j<=b.length;j++){if(a[i-1]===b[j-1]){cur[j]=prev[j-1]+1;if(cur[j]>best)best=cur[j];}}prev=cur;}return best;}
const [mineId,sibId]=process.argv.slice(2,4).map(Number);
const me=db.prepare("SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE id=?").get(mineId);
const sb=db.prepare("SELECT id,title,artist,lyrics FROM hymns_all WHERE id=?").get(sibId);
let tl={};try{tl=JSON.parse(me.lyrics_timeline||'{}')}catch(e){}
const ocr=(tl.ocr||[]).map(f=>norm(f.text)).filter(Boolean);
const wh=(tl.whisper||[]).map(s=>norm(s.text)).filter(Boolean);
console.log(`##### 我 ${me.id} | ${me.duration} | ${me.title}  (ocr${ocr.length} wh${wh.length})`);
console.log((me.lyrics||'').split('\n').filter(s=>s.trim()).map(s=>'   '+s).join('\n'));
const mySet=new Set((me.lyrics||'').split('\n').map(norm).filter(k=>k.length>=4));
// 🔴 斷行唔同會令「其實已經有」嘅行扮成漏行 —— 用成篇文字做子串包含檢查
const myAll=(me.lyrics||'').split('\n').map(norm).join('');  // 🔴 唔可以用 '|' 分隔:兄弟片斷行唔同,跨行嘅句子會對唔上
console.log(`##### 兄弟 ${sb.id} | ${sb.artist} | ${sb.title}`);
for(const l of (sb.lyrics||'').split('\n')){
  const k=norm(l); if(!k){console.log('');continue;}
  if(mySet.has(k)||myAll.includes(k)){console.log('   ='+l);continue;}
  let o=0,w=0;
  for(const p of ocr){const v=lcs(k,p); if(v>o)o=v;}
  for(const p of wh){const v=lcs(k,p); if(v>w)w=v;}
  const tag=(o>=Math.max(4,k.length*0.5)?'OCR✓':o>=4?`ocr${o}`:'ocr-')+' '+(w>=Math.max(4,k.length*0.5)?'WH✓':w>=4?`wh${w}`:'wh-');
  console.log(`   +[${tag}] ${l}`);
}
