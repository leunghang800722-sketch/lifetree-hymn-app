// R2b 粵語雙數線 2026-08-24 出品。「庫入面嗰行被截短」偵測器。
// 動機:今班兩個實例(#3234「頹喪流淚真心關注」缺「一笑就經過」、#3236「我要變 願明白」缺「更多」)
//   任何「漏行」掃描器都捉唔到 —— 因為嗰行**存在**,只係短咗一截。
// 做法:自己 OCR 一整行原文 O,如果 O 包含庫某一行 D(而且 O 唔喺庫全文入面),
//   即係螢幕打嘅比庫入面長 → 庫嗰行截咗。跨行拼接由 flat.includes(O) 一條擋走。
// 用法:node ops/lyrics/truncscan.mjs [lang:parity]   例:node ops/lyrics/truncscan.mjs 粵語:0
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗]|Ministr|Music Min|版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|混音|All Rights|Official|Lyric|專輯|www\.|詞[:：]|曲[:：]|調[:：]|粵譯/;
function lcs(a,b){if(!a||!b)return 0;let prev=new Array(b.length+1).fill(0),best=0;
 for(let i=1;i<=a.length;i++){const cur=new Array(b.length+1).fill(0);
  for(let j=1;j<=b.length;j++){cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:0;if(cur[j]>best)best=cur[j];}prev=cur;}return best;}
function lcseq(a,b){const m=a.length,n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=m;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
// o 同庫全文「同長度滑動窗」嘅最佳字元對齊數:擋走「庫已經有,得一兩個字 OCR 爛咗」
function bestWindow(o,flat){const L=o.length;let best=0;
 for(let i=0;i+L<=flat.length;i++){const v=lcseq(o,flat.slice(i,i+L));if(v>best)best=v;if(best>=L)break;}return best;}
const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nRow=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!frames.length) continue;
  const dlines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const dnorm=dlines.map(norm);
  const flat=dnorm.join('');
  const cand=new Map();   // normOCR -> {raw,ts:[],d}
  for(const f of frames){
    for(const raw of String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean)){
      if(JUNK.test(raw)) continue;
      const o=norm(raw);
      if(o.length<8||flat.includes(o)) continue;
      // 揾庫入面邊行係佢嘅真子串(而且短咗至少 3 個字)
      let best=null;
      for(let i=0;i<dnorm.length;i++){const d=dnorm[i];
        if(d.length<5||d.length+3>o.length) continue;
        if(o.includes(d)&&(!best||d.length>best.d.length)) best={d,line:dlines[i]};}
      if(!best) continue;
      // 🔴 2026-08-24 加濾網:最大噪音源係「庫其實已經有呢句,但 OCR 爛咗一兩個字」
      //   (實例 #96 攔→棚、#116 寬→寛、#1522 我→取、#1696 貴→費、#2026 祢→祈)。
      //   判準:o 同庫全文嘅最長共同子串 ≥ o 長度 - 2 → 當庫已經有,唔報。
      if(bestWindow(o,flat)>=o.length-2) continue;
      // 🔴 R1b 2026-08-24 加濾網 ①「兩層字幕疊埋」:國語雙數分區 68 首候選 0 真,
      //   最大噪音源係**過場幀影到上一句淡出 + 下一句淡入**,OCR 讀成一行,
      //   令庫嗰行夾喺**中間**(實例 #2134「願祢L『我們讚美歡唱』寶座」、
      //   #324「榮耀『應允我的呼求』的盾牌」、#2390「滿有『我要讚美敬拜』乏者」)。
      //   真.截短嘅話,多出嗰截一定喺**單邊**(前或者後),唔會前後夾攻。
      const head=o.startsWith(best.d), tail=o.endsWith(best.d);
      if(!head&&!tail) continue;
      // 🔴 濾網 ②「同一句打兩次」:螢幕一行打咗兩次(副歌疊句),庫照慣例只收一次。
      //   (實例 #8266「成作祢歡喜的祭 成作祢歡喜的祭」、#8274「噢我的救主 噢我的救主 唯一的救主」、
      //    #1950「一切榮耀屬於祢切榮耀屬於祢」、#1328「(能力屬祢)能力屬於祢」)
      //   判準:多出嗰截同庫嗰行 lcseq ≥ 多出長度−1 → 佢根本就係同一句嘅重覆/殘片。
      const extra=head?o.slice(best.d.length):o.slice(0,o.length-best.d.length);
      if(extra.length&&lcseq(extra,best.d)>=extra.length-1) continue;
      const key=o;
      if(!cand.has(key)) cand.set(key,{raw,ts:[],best});
      cand.get(key).ts.push(f.t);
    }
  }
  if(!cand.size) continue; nSong++;
  console.log(`\n#${r.id} (${r.duration}) ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,40)}  [庫 ${dlines.length} 行 / OCR ${frames.length} 幀]`);
  for(const [,v] of cand){ nRow++;
    console.log(`   ✂️[${v.ts.length}幀 t=${v.ts.slice(0,3).join(',')}] 螢幕「${v.raw.slice(0,52)}」  ⟵ 庫「${v.best.line.slice(0,40)}」`);}
}
console.log(`\n掃 ${rows.length} 首,命中 ${nSong} 首 / ${nRow} 行`);
