// R2b 粵語雙數線 2026-08-24 出品。「片頭標題卡 / credits 卡」污染偵測器。
// 動機:R1 2026-08-24 記低「片頭標題卡假陽性」係補行掃描器嘅老噪音,但反過嚟睇 ——
//   如果**庫入面**某行淨係喺「片頭卡 / credits 幀」出現過,咁就係抄咗標題卡入歌詞。
// 判準:該行喺 OCR 有佐證,但**全部佐證幀**都係 (a) 同幀有 credit 關鍵詞,或者 (b) t<20 片頭。
// 用法:node ops/lyrics/cardscan.mjs [lang:parity]
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖你]/g,'你').replace(/[裏裡]/g,'里').replace(/[他祂她]/g,'他').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const CRED=/作詞|作曲|編曲|填詞|監製|主唱|混音|和聲|曲[:：]|詞[:：]|唱[:：]|演唱|製作|出品|版權|粵譯|Official|Lyric|Music|Produc/i;
function lcseq(a,b){const m=a.length,n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=m;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const rows=db.prepare(`SELECT id,title,artist,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nRow=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<6) continue;
  const dlines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  // 🔴 濾網:好多歌詞片成條片都印住「Official Lyric Video」/ 詞曲 credit 浮水印,
  //   咁樣全片都算「卡幀」,成首歌會全行中招(實例 #128 12 行全報)。
  //   卡幀佔比 >30% = 浮水印片,唔好掃。
  const cardFrames=frames.filter(f=>(f.t!=null&&f.t<20)||String(f.text||'').split('\n').some(l=>CRED.test(l))).length;
  if(cardFrames/frames.length>0.3) continue;
  const bad=[];
  for(const line of dlines){
    const d=norm(line); if(d.length<4||d.length>18) continue;
    let good=0,card=[];
    for(const f of frames){
      const raws=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
      const isCard=(f.t!=null&&f.t<20)||raws.some(l=>CRED.test(l));
      let hit=false;
      for(const raw of raws){const o=norm(raw); if(o.length<4) continue;
        if(o.includes(d)||lcseq(d,o)>=Math.ceil(d.length*0.85)){hit=true;break;}}
      if(!hit) continue;
      if(isCard) card.push(f.t); else good++;
    }
    if(card.length&&!good) bad.push({line,card});
  }
  if(!bad.length) continue; nSong++;
  console.log(`\n#${r.id} ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,38)}  [庫 ${dlines.length} 行 / OCR ${frames.length} 幀]`);
  // 🔬 R2 2026-08-24 加分級:實測粵語單數 169 行入面 165 行係**片頭 credit 卡同時印住第一句歌詞**
  //   (t=16/18 嗰幀),即係「唯一佐證係卡幀」呢個訊號喺片頭係結構性失效。唔可以直接濾走
  //   (真陽性 #4389《軍裝》/#4711《牽引》嘅片名卡都係 t=2 單幀),所以改為**標籤分流**:
  //   🔴 = 有非片頭卡幀 或 該行約等於片名(titlescan 訊號) → 值得睇;⚪ = 片頭單幀 → 通常係第一句歌詞。
  const tnorm=norm(r.title);
  for(const b of bad){ nRow++;
    const late=b.card.some(t=>t!=null&&t>=30);
    const isTitle=tnorm.includes(norm(b.line))&&norm(b.line).length>=3;
    const tier=(late||isTitle)?'🔴':'⚪';
    console.log(`   ${tier}[卡幀 t=${b.card.slice(0,4).join(',')} / 正常幀 0]${isTitle?' (=片名)':''}${late?' (非片頭)':''} 庫「${b.line.slice(0,40)}」`);}
}
console.log(`\n掃 ${rows.length} 首,命中 ${nSong} 首 / ${nRow} 行`);
