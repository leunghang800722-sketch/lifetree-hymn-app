// R2 粵語單數線 2026-08-24 晚班出品:「跨歌污染整 block」偵測器。
// 動機 = #3435《詩23》(同心圓) 頭七行原封不動係 #5303《從心底讚頌》(ACM) 嘅頭七行,
//   而且**七行喺 #3435 自己條片嘅 OCR + whisper 一個字都揾唔到**。呢種病 gapscan 撈唔到
//   (佢睇「片有庫冇」,呢個係「庫有片冇"),行數又冇異常,所以之前一直漏網。
// 做法:①逐首計「庫入面邊幾行喺自己片(OCR+whisper 全文)完全冇佐證」——用 4 字滑窗,
//        任何一個 4 字窗撞到就當有佐證(寬鬆,寧縱毋枉);
//      ②喺呢啲「冇佐證行」入面揾**連續 ≥MINRUN 行**;
//      ③再查呢個 block 嘅行係咪原封不動出現喺另一首 verified 歌 → 報埋邊首。
// 用法: node crossblock.mjs [lang:parity] [minRun=3]   (env: DIFFTITLE=1 = 濾走同名兄弟片補完)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s).replace(/[祢禰袮称尔妳]/g,'你')).replace(/[祢禰袮称袖]/g,'你').replace(/[衪祂牠妳他她它]/g,'你').replace(/[裏裡]/g,'里').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const MINRUN=Number(process.argv[3]||3);
const DIFFTITLE=process.env.DIFFTITLE==='1';
const all=db.prepare("SELECT id,title,artist,lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const idx=new Map();          // 行 → 邊幾首歌有
for(const r of all) for(const l of r.lyrics.split('\n')){const k=norm(l); if(k.length<6)continue;
  if(!idx.has(k))idx.set(k,new Set()); idx.get(k).add(r.id);}
const T=new Map(all.map(r=>[r.id,r]));
const rows=db.prepare(`SELECT id,title,artist,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let n=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  const wh=Array.isArray(tl.whisper)?tl.whisper:[];
  if(frames.length<6) continue;
  const hay=norm(frames.map(f=>f.text||'').join('\n')+'\n'+wh.map(w=>w.text||'').join('\n'));
  if(hay.length<80) continue;                       // 片本身冇料 → 冇資格判
  const dl=r.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
  const miss=dl.map(l=>{const k=norm(l); if(k.length<6) return false;   // 短行唔判
    for(let i=0;i+4<=k.length;i++) if(hay.includes(k.slice(i,i+4))) return false;
    return true;});
  // 揾連續 run
  let i=0;
  while(i<dl.length){
    if(!miss[i]){i++;continue;}
    let j=i; while(j<dl.length&&miss[j]) j++;
    if(j-i>=MINRUN){
      // 呢個 block 有冇喺第二首歌出現
      const owners=new Map();
      for(let x=i;x<j;x++){const s=idx.get(norm(dl[x]));if(!s)continue;
        for(const id of s) if(id!==r.id) owners.set(id,(owners.get(id)||0)+1);}
      const top=[...owners.entries()].sort((a,b)=>b[1]-a[1])[0];
      // 🔴 同名 = 兄弟片合法補完(實測 17 個 block 有 15 個係呢類),DIFFTITLE=1 就淨係報唔同名嗰啲
      if(top&&DIFFTITLE){
        const clean=t=>String(t||'').replace(/[^一-鿿A-Za-z]/g,'').toLowerCase();
        const A=clean(r.title),B=clean(T.get(top[0])?.title);
        let same=false;
        // 最長共同開頭 ≥3 字 = 同一首歌唔同 upload(片名前面就係歌名,後面係頻道/場次資料)
        {let L=0; while(L<A.length&&L<B.length&&A[L]===B[L]) L++; if(L>=3) same=true;}
        for(let L=6;L<=Math.min(A.length,B.length);L++){ if(B.includes(A.slice(0,L))||A.includes(B.slice(0,L))) same=true; }
        // 再試核心歌名(《》內)
        const core=x=>{const m=String(x||'').match(/[《【]([^》】]{2,20})[》】]/);return m?clean(m[1]):''};
        const ca=core(r.title),cb=core(T.get(top[0])?.title);
        if(ca&&cb&&(ca===cb)) same=true;
        if(ca&&clean(T.get(top[0])?.title).includes(ca)) same=true;
        if(cb&&A.includes(cb)) same=true;
        if(same){ i=j; continue; }
      }
      if(DIFFTITLE&&!top){ i=j; continue; }   // 冇第二首歌認領 = 唔算跨歌污染
      n++;
      console.log(`\n#${r.id} ${(r.artist||'').slice(0,10)} | ${r.title.slice(0,44)}  [庫${dl.length}行]`);
      console.log(`   ⚠️ 第 ${i+1}–${j} 行(${j-i} 行)喺自己片 OCR+whisper 零佐證`);
      if(top) console.log(`   🔴 其中 ${top[1]} 行原封不動出現喺 #${top[0]} ${(T.get(top[0])?.title||'').slice(0,40)}`);
      for(let x=i;x<j;x++) console.log(`      ${x+1} ${dl[x]}`);
    }
    i=j;
  }
}
console.log(`\n掃 ${rows.length} 首,連續 ≥${MINRUN} 行零佐證嘅 block ${n} 個`);
