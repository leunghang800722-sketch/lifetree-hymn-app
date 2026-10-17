// R2 粵語單數線 2026-08-24 出品。「片頭卡/credits 行留喺庫」偵測器。
// 動機:#115《玻璃海》庫 L12 個「玻璃海」係 t=4 嘅片名卡、#2349 L1/L8「我向祢禱告」係浮水印,
// 兩者 titlescan 只捉到後者(要同片名一模一樣)。呢隻唔靠片名 —— 靠**時間分佈**:
// 一句真歌詞一定喺歌唱段出現;只喺片頭 20 秒(或 duration 前 8%)出現過嘅庫行 = 片名卡/credits。
// 用法:node ops/lyrics/introcard.mjs 粵語:1
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// ⚠️ 祢→你 要喺 S2T 前後都行(opencc 會將祢轉做禰,見 08-23 共用 bug)
const pre=s=>String(s).replace(/[祢禰袮称尔袖]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂他她它]/g,'他').replace(/[沈沉]/g,'沉').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,album,org,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const secs=d=>{const m=String(d||'').match(/^(?:(\d+):)?(\d+):(\d+)$/); if(!m)return 0; return (+(m[1]||0))*3600+(+m[2])*60+(+m[3]);};
let hit=0, scanned=0;
for(const r of rows){
  let tl={}; try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const O=Array.isArray(tl.ocr)?tl.ocr:[];
  if(O.length<12) continue;                       // 幀太少判唔到時間分佈
  const dur=secs(r.duration); if(dur<90) continue; // 短片頭尾界線唔清
  const CUT=Math.max(20, Math.round(dur*0.08));
  const lastT=Math.max(...O.map(f=>Number(f.t0??f.t??0)));
  if(lastT < dur*0.5) continue;                   // OCR 只覆蓋前半 → 時間分佈唔可信
  scanned++;
  const lines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const NAMES=[norm(r.title),norm(r.artist),norm(r.album||''),norm(r.org||'')].filter(x=>x&&x.length>=3);
  const bad=[];
  for(const l of lines){
    const k=norm(l); if(k.length<3||k.length>14) continue;   // 太短易撞、太長唔會係卡
    const ts=[];
    for(const f of O){ if(norm(f.text||'').includes(k)) ts.push(Number(f.t0??f.t??0)); }
    if(!ts.length) continue;                       // 完全揾唔到 = 另一個病種,唔關呢隻事
    if(Math.max(...ts) >= CUT) continue;
    // 🔴 收兩層防呆(第一版 130 首命中率太低:真嘅 verse 1 首句都係得片頭一幀)。
    // 要「只喺片頭出現」**加**下面兩者之一先算:
    //  A) 嗰啲幀有 credits 標記(曲/詞/編/主唱/Music/Lyrics/©…)= 實錘片名卡
    //  B) 呢行本身等於片名 / 歌手 / org / 專輯名 = 實錘標題浮水印
    // 🐞 R2 同日修:原本個 regex 有 `Cover`,撞正英文歌詞行「Covered by Your grace so free」
    // (#3393)令真歌詞被當 credits;`Words` 亦會撞 "Words of life" 呢類。全部收窄成要跟標點/專有寫法。
    const CRED=/[曲詞編](?:[\/／、]|[:：])|作[詞曲]|填詞|編曲|監製|主唱|演唱|粵譯|粵詞|翻譯|混音|Music\s*[:：by]|Lyrics\s*[:：by]|Arranged|Cantonese Cover|©|℗/i;
    // 🔴 R2 同日修:持續 © 浮水印會令「credits 幀」全片成立(實例 #4413 十三幀全部有
    // `© 2009 Hong Kong Association…`)。所以 credits 標記要**唔係全片都有**先算數。
    const credAll=O.filter(f=>CRED.test(String(f.text||''))).length;
    const credIsWatermark = credAll > O.length*0.5;
    const credFrames=!credIsWatermark && ts.every(t=>O.some(f=>Number(f.t0??f.t??0)===t&&CRED.test(String(f.text||''))));
    const isName=NAMES.some(n=>n&&n===k);
    if(!credFrames&&!isName) continue;
    // 🔑 R2 同日加第三層(最有效):**片名卡係孤身出現嘅**。如果呢行同「另一句庫歌詞」
    // 出現喺同一幀,佢就係真歌詞 —— credits 卡冚住 verse 1 頭兩句係最大殘餘假陽性
    // (實例 #2889 t=18 一幀同時有 L1「我害怕 逼迫臨近」同 L2「冷笑熱諷 漫過我身」)。
    const shareFrame=ts.some(t=>O.some(f=>{
      if(Number(f.t0??f.t??0)!==t) return false;
      const ft=norm(f.text||'');
      return lines.some(o=>{const ok=norm(o); return ok!==k && ok.length>=4 && ft.includes(ok);});
    }));
    if(shareFrame) continue;
    bad.push({l,ts,why:credFrames?(isName?'credits幀+名稱':'credits幀'):'等於名稱'});
  }
  if(!bad.length) continue;
  hit++;
  console.log(`\n#${r.id} (${r.duration}) ${r.artist} | ${String(r.title).slice(0,50)}  [庫 ${lines.length} 行, ${O.length} 幀, 片頭界線 ${CUT}s]`);
  for(const b of bad) console.log(`   🃏 「${b.l}」只出現喺 t=${b.ts.join(',')}  [${b.why}]`);
}
console.log(`\n掃 ${rows.length} 首(合格 ${scanned} 首),命中 ${hit} 首`);
