// R2 粵語單數線 2026-08-25 出品:「庫得個殼」偵測器 —— OCR 讀到嘅唯一歌詞行遠多過庫。
//
// 動機:cardgap / gapscan2 都係**逐幀**問「呢張卡有冇對唔返庫嘅行」,所以佢哋最叻捉
//   「一首大致齊嘅歌漏咗一兩行」。但另一個病係**成首歌只入咗個殼**(副歌兩三行入咗庫,
//   成個 verse 由頭到尾冇入過)——呢種片每一幀都「錨唔夠」或者「漏成幀」,
//   逐幀判準要麼靜靜跳過,要麼淹死喺噪音。呢隻改為**全片累計**:
//   數全片有幾多條「出現 ≥MINFR2 幀、庫入面完全揾唔返」嘅唯一行,≥MINU 條就報。
//   實戰:#3539《天堂又怎麼樣》「我願為你攀山越嶺」×18(庫由頭到尾冇呢句)、
//        #2307《奉獻予主基督》「頌讚基督 任誰獲祢拯救」×2。
//
// 兩層必需濾網(冇咗就 209 首噪音):
//   ① `MINFR2`(預設 3):OCR 亂碼唔會連續三幀讀出同一串字;真歌詞行會。
//   ② 罕見字閘 `clean()`:成條行每個字喺全庫 verified 語料出現 ≥RARE(預設 20)次。
//      呢條閘一路殺剩 209 → 30 首,而兩個真陽性一條都冇跌。
//
// ⚠️ 已知假陽性(全部實測過,唔好再重複踩):
//   ⓐ **粵/國雙層字幕**(#199 充滿我):每屏「（粵）…／（國）…」,庫只收粵語層,
//      國語層成條行必然「庫冇」。見 [[project-lyrics-r2b-2026-08-24-night]] bilayerscan。
//   ⓑ **專輯/曲目表卡**(#4381 ACM 齊唱兒歌曲目表、#3585 GLP 音樂會宣傳海報)。
//   ⓒ **經文卡**(#5951/#5953 詩篇63:2、#2465 馬太11:28、#5425 瑪拉基書):睇同幀有冇出處。
//   ⓓ **司儀/祝福口白卡**(#3419「感謝天父對我們奇妙的創造」、「願主耶穌基督的恩惠…林後十三14」)。
//   ⓔ **見證字幕**(#1615 見證 珍惜眼前人):片入面「講」嘅唔係「唱」嘅。
//   ⓕ **苦路站名卡**(#3075「耶穌被判死刑」「第一次跌倒」)。
//
// 用法: node ops/lyrics/shellscan.mjs [lang:parity]   (env: MINU=6 最少幾多條庫冇行, MINFR2=3, RARE=20)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const pre=s=>String(s).replace(/[祢禰袮称尔袖妳]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠他她它]/g,'他').replace(/[沈沉]/g,'沉').replace(/[那哪]/g,'那').replace(/[着著]/g,'著').replace(/[妳你]/g,'你').replace(/[的得地]/g,'的').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗@]|Ministr|Music|Official|Lyric|Worship|www\.|http|版[權檬棒橫獲福社榴權]|所有|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|製作|專[輯辑]|收錄|詞[:：\/／]|曲[:：\/／]|調[:：]|經文|摘編|詩篇|以賽亞|羅馬書|約翰福音|哥林多|歷代志|以弗所|腓立比|啟示錄|啓|馬太福音|創世記|參考經文|敬拜隊|事工|使團|平台/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const MINU=Number(process.env.MINU||6);   // 至少幾多條「庫冇」嘅唯一行先報
// 罕見字語料:OCR 亂碼會生出全庫幾乎冇出現過嘅字
const corpus=db.prepare("SELECT lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const freq=new Map();
for(const c0 of corpus) for(const c of (c0.lyrics||'')) if(/[一-鿿]/.test(c)) freq.set(c,(freq.get(c)||0)+1);
const RARE=Number(process.env.RARE||20);
const clean=k=>[...k].every(c=>(freq.get(c)||0)>=RARE);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[]; if(frames.length<8) continue;
  const dn=(r.lyrics||'').split('\n').map(s=>norm(s)).filter(Boolean); if(!dn.length) continue;
  const flat=dn.join('');
  const inLib=k=>{ if(flat.includes(k)) return true;
    for(const d of dn){ if(d.includes(k)) return true;
      if(d.length>=k.length){ for(let i=0;i+k.length<=d.length;i++) if(lcseq(k,d.slice(i,i+k.length))>=Math.ceil(k.length*0.75)) return true; }
      else if(lcseq(k,d)>=Math.ceil(k.length*0.75)) return true; }
    return false; };
  // OCR 行:同幀相鄰兩行黐埋亦算(擋庫合併行)
  const uniq=new Map();
  for(const f of frames){
    const raws=String(f.text||'').split('\n').map(s=>s.trim()).filter(s=>s&&!JUNK.test(s));
    const ks=raws.map(norm);
    for(let i=0;i<ks.length;i++){
      for(const k of [ks[i], ks[i]+(ks[i+1]||'')]){
        if(k.length<5||k.length>26) continue;
        if(inLib(k)) { uniq.set(k,'hit'); continue; }
        uniq.set(k,(uniq.get(k)==='hit')?'hit':((uniq.get(k)||0)+1));
      }
    }
  }
  // 只計「出現 ≥2 幀」嘅庫冇行(單幀多數係爛字)
  const MINFR2=Number(process.env.MINFR2||3);
  const miss=[...uniq.entries()].filter(([k,v])=>v!=='hit'&&v>=MINFR2&&clean(k));
  if(miss.length<MINU) continue;
  out.push({id:r.id,title:r.title,artist:r.artist,lib:dn.length,miss});
}
out.sort((a,b)=>b.miss.length-a.miss.length);
console.log(`掃 ${rows.length} 首 → 命中 ${out.length} 首`);
for(const o of out.slice(0,30)) console.log(`${o.id}\t庫冇${o.miss.length}\t庫${o.lib}\t${(o.artist||'').slice(0,10)}\t${(o.title||'').slice(0,32)}\t${o.miss.slice(0,4).map(m=>'「'+m[0].slice(0,14)+'」×'+m[1]).join(' ')}`);
