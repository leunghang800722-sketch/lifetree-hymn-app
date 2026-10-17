// R1 國語單數線 2026-08-25 出品:scripframe 嘅「獨佔證據」版。
//
// 🔴 動機:scripframe 落國語單數出 62 首 / 143 行,絕大部分係**假陽性** ——
//   好多詩歌本身就係唱經文(#8225《錫安大道》唱以賽亞書 35:10、#8539《天國的子民》唱彼前 2:9),
//   庫嗰行同經文卡撞係必然嘅,唔係污染。呢個就係 [[project-lyrics-scripture-card-whisper-trap]]
//   講嗰個陷阱,而嗰次結論係「要用結構證據,唔好用統計/whisper 裁判」。
//
// 🔑 本掃描器嘅結構證據 = **獨佔性**:
//   一條庫行如果**淨係喺經文卡嗰啲幀出現過**,喺全片其他幀(即真字幕幀)一次都冇出現 →
//   佢根本冇被唱過,係抄卡抄落去。
//   反之,只要佢喺任何一幀「唔帶出處」嘅幀度出現過 → 佢係真歌詞,唔報。
//   實證原型:#1985《普天下歡唱》庫尾巴嗰行「你們既從罪裡得了釋放,作了神的奴僕,」
//   全片只出現喺 t=228 羅馬書 6:22 嗰張卡。
//
// 用法: node ops/lyrics/scripframe2.mjs [lang:parity]
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖你]/g,'你').replace(/[裏裡]/g,'里').replace(/[他祂她]/g,'他').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const BOOK=/創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳記|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米書|耶利米哀歌|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多前書|哥林多後書|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得前書|彼得後書|約翰一書|約翰二書|約翰三書|猶大書|啟示錄/;
const NUM=/[0-9０-９]|[一二三四五六七八九十百]+[:：章節]/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const cover=(d,o)=>lcseq(d,o)>=Math.ceil(d.length*0.8);
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND curated=1 AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
// 🐞 OCR 會喺書卷名中間插字(實測 #8497「約翰福者音1:9」),硬 regex 撈唔到。
//   所以書卷名改用「容許每個字之間插一個雜字」嘅寬鬆比對。
const FUZZY=new RegExp('(?:'+BOOK.source.split('|').map(b=>b.split('').join('.{0,1}')).join('|')+')');
const isCite=l=>(BOOK.test(l)||FUZZY.test(l))&&NUM.test(l)&&!/^\s*[詞曲調認羽因請][/、，,]?\s*(曲)?\s*[：:]/.test(l);
let nSong=0,nRow=0,nRaw=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!frames.length) continue;
  const dlines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const cardT=new Map();   // libIdx -> [t...]  (喺經文卡幀出現)
  const plainT=new Map();  // libIdx -> [t...]  (喺普通幀出現)
  for(const f of frames){
    const raws=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const card=raws.some(isCite);
    // 🐞 濾網③(2026-08-25 修):官方歌詞版 MV 好興將一句歌詞**斷做兩行**擺
    //   (#5429「既然有這麼多的 ⏐ 見證人」)。逐行比對嘅話呢句喺普通幀永遠對唔返,
    //   於是變假陽性。所以普通幀要**連埋成幀嘅文字**一齊比。
    // 🐞 兩邊都要 join:經文卡好興將一句經文斷做兩三行擺(實測 #6191 約書亞記一章9節
    //   「你當剛強壯膽!」/「不要懼怕,也不要驚惶,」分兩行,而庫係一行),只逐行比就撈唔到成張卡。
    const cands=[...raws.filter(l=>!(card&&isCite(l)))];
    cands.push(raws.filter(l=>!isCite(l)).join(''));
    for(const raw of cands){
      const o=norm(raw); if(o.length<7) continue;
      for(let i=0;i<dlines.length;i++){
        const d=norm(dlines[i]); if(d.length<7) continue;
        if(!cover(d,o)) continue;
        const m=card?cardT:plainT;
        if(!m.has(i)) m.set(i,[]); m.get(i).push(f.t);
      }
    }
  }
  const bad=[...cardT.keys()].filter(i=>!plainT.has(i));
  nRaw+=cardT.size;
  if(!bad.length) continue;
  // 🔑 濾網②「成條片都係經文卡」:好多歌本身就係唱經文(#5849 八福 = 逐句馬太福音5,
  //   #5759 來向耶和華歌唱 = 詩篇95),條片索性用經文卡做字幕,於是全庫都冇「普通幀」佐證。
  //   要求:條片本身有足夠普通字幕幀證據(≥5 行對得返普通幀),而且候選唔可以佔庫太大比例。
  if(plainT.size<5) continue;
  if(bad.length>Math.max(2,dlines.length*0.3)) continue;
  nSong++;
  console.log(`\n#${r.id} ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,42)}  [庫 ${dlines.length} 行, dur ${r.duration}]`);
  for(const i of bad){ nRow++;
    console.log(`   🩸 庫第${i+1}行「${dlines[i].slice(0,44)}」 卡幀 t=${cardT.get(i).join(',')} / 普通幀 0 次`);}
}
console.log(`\n掃 ${rows.length} 首;經文卡撞庫 ${nRaw} 行 → 過「獨佔」閘剩 ${nRow} 行 / ${nSong} 首`);
