// R2b 粵語雙數線 2026-08-24 出品。「同幀有經文出處 → 成幀都係經文卡」偵測器。
// 動機:#4216 嘅經文卡污染 `scripcard` 捉唔到 —— 嗰行冇書卷名、標點又唔夠和合本特徵,
//   但佢**同幀**下面就印住「詩篇 二十三4」。改由「幀」入手就一擊即中。
// 做法:揾出帶出處嘅 OCR 幀(書卷名/簡寫 + 章節數字),攞嗰幀所有行,
//   同庫歌詞逐行對(LCSubseq ≥ 行長×0.8)→ 命中即係庫抄咗經文卡。
// 用法:node ops/lyrics/scripframe.mjs [lang:parity]   例:node ops/lyrics/scripframe.mjs 粵語:0
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖你]/g,'你').replace(/[裏裡]/g,'里').replace(/[他祂她]/g,'他').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const BOOK=/創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳記|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米書|耶利米哀歌|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多前書|哥林多後書|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得前書|彼得後書|約翰一書|約翰二書|約翰三書|猶大書|啟示錄/;
const NUM=/[0-9０-９]|[一二三四五六七八九十百]+[:：章節]/;
function lcseq(a,b){const m=a.length,n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=m;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const rows=db.prepare(`SELECT id,title,artist,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nRow=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!frames.length) continue;
  const dlines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const hits=new Map();   // db 行 index -> [{t, raw}]
  for(const f of frames){
    const raws=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    // 呢一幀有冇出處?(同一行有書卷名 + 數字/章節)
    // 🐞 R1 2026-08-24 修:新心音樂事工成批片每一幀字幕都印住 credit「詞：詩篇一百五十篇」/
    //   「詞：以弗所書三章二十節」(書卷名做作詞人),舊版見到書卷名就當成經文卡 → 成首歌每句都變候選
    //   (實測 #2357 2/15、#3171 10/12、#3487 5/11 全部假陽性)。credit 行唔算出處。
    const isCite=l=>BOOK.test(l)&&NUM.test(l)&&!/^\s*[詞曲調認羽因請][/、，,]?\s*(曲)?\s*[：:]/.test(l);
    if(!raws.some(isCite)) continue;
    for(const raw of raws){
      const o=norm(raw); if(o.length<7) continue;
      if(BOOK.test(raw)&&NUM.test(raw)) continue;      // 出處嗰行本身唔使報(連 credit 行一齊跳過)
      for(let i=0;i<dlines.length;i++){
        const d=norm(dlines[i]); if(d.length<7) continue;
        if(lcseq(d,o)>=Math.ceil(d.length*0.8)){
          if(!hits.has(i)) hits.set(i,[]); hits.get(i).push({t:f.t,raw});}
      }
    }
  }
  if(!hits.size) continue; nSong++;
  console.log(`\n#${r.id} ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,40)}  [庫 ${dlines.length} 行]`);
  for(const [i,hs] of hits){ nRow++;
    console.log(`   📖[${hs.length}幀 t=${hs.slice(0,3).map(h=>h.t).join(',')}] 庫「${dlines[i].slice(0,44)}」  ⟵ 經文幀「${hs[0].raw.slice(0,44)}」`);}
}
console.log(`\n掃 ${rows.length} 首,命中 ${nSong} 首 / ${nRow} 行`);
