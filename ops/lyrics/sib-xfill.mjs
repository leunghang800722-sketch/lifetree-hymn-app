// R2 粵語單數線 2026-08-23 晚班出品。用法 + 已知假陽性見 docs/LYRICS-CATCHUP-LEDGER.md 21:41 收爐行。
// ⚠️ 分區寫死咗 lang='粵語' AND id%2=1,第二條線用要改個 WHERE。
// v2:用「成篇文字 substring 包含」代替「逐行 set 命中」→ 殺死併行假陽性
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
function lcs(a,b){if(!a||!b)return 0;let best=0;const dp=new Array(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){let prev=0;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=a[i-1]===b[j-1]?prev+1:0;if(dp[j]>best)best=dp[j];prev=t;}}return best;}
const all=db.prepare("SELECT id,lang,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const info=new Map(); const idx=new Map();
for(const r of all){const set=new Set((r.lyrics||'').split('\n').map(norm).filter(k=>k.length>=6));
 if(set.size<3)continue; info.set(r.id,{...r,set,flat:(r.lyrics||'').split('\n').map(norm).join('|')});
 for(const k of set){if(!idx.has(k))idx.set(k,[]);idx.get(k).push(r.id);}}
// 🐞 R2b 2026-08-24 修:舊版分區**寫死** `粵語 + id%2===1`(R2 嘅分區)而且完全唔理 argv,
//   第二條線傳 `粵語:0` 落去唔會報錯,會靜靜掃返 R2 分區 → 跨線撞單風險。
//   而家收 argv[2] = `lang:parity`,**預設維持 `粵語:1`**,所以舊叫法零改動。
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const mine=all.filter(r=>r.lang===MLANG&&r.id%2===Number(MPAR)&&info.has(r.id));
let nPair=0;
for(const r of mine){
  const me=info.get(r.id); const cnt=new Map();
  for(const k of me.set) for(const o of (idx.get(k)||[])) if(o!==r.id) cnt.set(o,(cnt.get(o)||0)+1);
  const meFlatAll=me.flat.replace(/\|/g,'');
  for(const [o,shared] of cnt){
    if(shared<5) continue; const ot=info.get(o);
    const extra=(ot.lyrics||'').split('\n').filter(l=>{const n=norm(l);return n.length>=5&&!meFlatAll.includes(n);});
    if(!extra.length) continue;
    let tl={};try{tl=JSON.parse(me.lyrics_timeline||'{}')}catch(e){}
    // 🐞 R1 2026-08-24 修:有啲歌 lyrics_timeline.whisper / .ocr 唔係 array(實例 #5225、#6331 之後嗰首),
    //   舊版即場 crash 斷咗成個掃描(今班喺 #6331 斷,後面成批未掃)。同 whproof 2026-08-24 嗰個修法一致。
    const w=(Array.isArray(tl.whisper)?tl.whisper:[]).map(x=>norm(x.text));
    const oc=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>norm(f.text));
    const rows=[];
    for(const l of extra){const n=norm(l);
      let bw=0,bo=0; for(const x of w){const v=lcs(n,x);if(v>bw)bw=v;}
      for(const x of oc){const v=lcs(n,x);if(v>bo)bo=v;}
      if(bo>=Math.min(n.length,6)||bw>=6) rows.push(`      ${bo>=6?'📺':'🎧'} ocr=${bo} whi=${bw} len=${n.length} | ${l}`);
    }
    if(!rows.length) continue; nPair++;
    console.log(`#${r.id}(${r.duration}) ← #${o} 共${shared} | ${r.title.slice(0,34)} ← ${ot.title.slice(0,34)}`);
    console.log(rows.join('\n'));
  }
}
console.log(`\n有實證候選對:${nPair}`);
