// R1 2026-08-24 出品:「同框對句只抄咗一句」偵測器。
// 今班四個實例(#4983 ×2、#6409、#6707、#8117)都係同一個型:一幀打兩行,庫入面得上句(或者下句)。
// 判準:一幀**啱啱好兩行乾淨中文**,其中一行喺庫全文搵到、另一行搵唔到 → 報。
// 「庫有嗰行」本身就係最強嘅上下文錨:證明呢一幀係歌詞幀唔係字卡/水印。
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s).replace(/[祢禰袮称尔妳]/g,'你')).replace(/[祢禰袮称尔]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂他她它妳牠]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的').replace(/[沈沉]/g,'沉').replace(/[眞真]/g,'真').replace(/[榮荣燿耀]/g,'榮').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗]|Ministr|版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|All Rights|Official|專輯|收錄|www\.|詞[:：]|曲[:：]|調[:：]|經文|摘編|Copyright|詩篇|以賽亞|羅馬書|約翰福音|哥林多|歷代志|以弗所|路加|馬太|彼得|耶利米|創世|出埃及|利未|民數|申命|約書亞記|士師|撒母耳|列王|尼希米|以斯帖|約伯|箴言|傳道|雅歌|耶利米哀歌|以西結|但以理|何西阿|約珥|阿摩司|俄巴底|約拿|彌迦|那鴻|哈巴谷|西番雅|哈該|撒迦利|瑪拉基|馬可|使徒行傳|加拉太|腓立比|歌羅西|帖撒羅尼迦|提摩太|提多|腓利門|希伯來|雅各書|猶大書|啟示錄|專[輯辑糊報鞋]|前導|主歌|副歌|橋段|影視中心|視聽中心|傳播中心|製作中心|音樂事工|敬拜事工|事工協會|詩歌創作|Worship Ministry/;   // 🔴 R2b 2026-08-24 晚班加「音樂事工」一族:粵語雙數 16 個候選有 4 個(#4712 #4714 #4716 #5070)係「基恩敬拜音樂事工」浮水印同歌詞行同框,兩行框剛好被當成「一行有一行冇」
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const near=(k,flat)=>{for(let i=0;i+k.length<=flat.length;i++){if(lcseq(k,flat.slice(i,i+k.length))>=Math.ceil(k.length*0.8))return true;}return false;};
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const MAXROWS=Math.max(2,Math.min(3,Number(process.env.MAXROWS||2)));
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nS=0,nR=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<6) continue;
  const dl=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const flat=dl.map(norm).join(''); if(flat.length<40) continue;
  const cand=new Map();
  for(const f of frames){
    const raw=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    // 🔴 R1 2026-08-25:應 R2 2026-08-24 嘅建議,由硬性「啱啱好兩行」放寬到 2–3 行(env `MAXROWS=3`)。
    //   R2 嗰轉喺粵語掃 808 首出 15 首全假,但同日兩單真命中(#4763 #2341)偏偏係**一幀三行**嘅字幕卡,
    //   即係話舊條件結構上睇唔到嗰種病。三行嗰陣條件更加嚴:**要三行入面啱啱好缺一行**
    //   (剩低兩行都喺庫 = 兩個錨),所以信噪比理論上仲高過兩行。
    //   預設維持 2(行為零改動),要試就 `MAXROWS=3 node pairscan.mjs 國語:1`。
    if(raw.length<2 || raw.length>MAXROWS) continue;
    if(raw.some(x=>JUNK.test(x))) continue;
    const K=raw.map(norm);
    if(K.some(k=>k.length<6||k.length>20)) continue;
    const inLib=K.map(k=>flat.includes(k)||near(k,flat));
    const missIdx=inLib.map((v,i)=>v?-1:i).filter(i=>i>=0);
    if(missIdx.length!==1) continue;                   // 要啱啱好缺一行(其餘全部做錨)
    const j=missIdx[0];                                // 缺嗰行
    const key=K[j];
    if(!cand.has(key)) cand.set(key,{miss:raw[j],anchor:raw.filter((_,i)=>i!==j).join(' ⏐ '),ts:[]});
    cand.get(key).ts.push(f.t);
  }
  let keep=[...cand.values()].filter(v=>v.ts.length>=2);
  // 🔴 R1b 2026-08-24 加:「同框花字變體」濾網 —— 今班國語雙數 13 個候選 0 真,
  //    最大宗假陽性係「缺行其實就係庫已有嗰行,得一兩個字俾 OCR 讀爛」
  //    (#4210 萬王之王→「萬玉之玉」、#7000 亙古至今→「瓦古至令」、#6200 盡我→「孟找」)。
  //    舊有嘅 near() 用 0.8 門檻 + 定長窗,兩個字讀爛就跌穿,擋唔到。
  //    ⚠️ 唔可以淨係「同庫行似 ≥len−2 就剔」—— 咁會系統性誤殺**對仗句**
  //    (「祢是萬王之王 / 祢是萬主之主」啱啱好爭兩個字),同 08-23 posSim 嗰單嘢一樣。
  //    真正嘅判準係「**同一首歌另有一幀,用同一個錨,而嗰幀嘅對句喺庫入面搵到**」——
  //    即係話呢對句根本已經收錄咗,今次淨係影到花咗嘅嗰版。對仗句唔會有呢種孿生幀。
  {
    const clean=[];   // 同一首歌入面「兩行都合格、其中一行喺庫」嘅幀
    for(const f of frames){
      const raw=String(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
      if(raw.length!==2) continue;
      if(raw.some(x=>JUNK.test(x))) continue;
      const K=raw.map(norm);
      if(K.some(k=>k.length<6||k.length>20)) continue;
      const inLib=K.map(k=>flat.includes(k)||near(k,flat));
      if(inLib[0]&&!inLib[1]) clean.push({lib:K[0],other:K[1]});
      if(inLib[1]&&!inLib[0]) clean.push({lib:K[1],other:K[0]});
      if(inLib[0]&&inLib[1]){clean.push({lib:K[0],other:K[1]});clean.push({lib:K[1],other:K[0]});}
    }
    const sim=(a,b)=>{const m=Math.max(a.length,b.length);return m?lcseq(a,b)>=m-2:false;};
    keep=keep.filter(v=>{
      const k=norm(v.miss), a=norm(v.anchor);
      // 揾有冇另一幀:錨相近(或者一樣),而同框嗰行**喺庫**、又同我哋個「缺行」相近
      return !clean.some(c=>sim(c.other,a)&&sim(c.lib,k));
    });
  }
  // 🔴 專輯橫幅/浮水印聚類:同一首歌嘅「缺行」之間兩兩比 lcseq/maxlen ≥0.5,同組 ≥2 條 → 成組剔
  //    (實例 #8415 泥土音樂 `專輯:平安永不離開` 橫幅 OCR 出 7 種寫法,一首歌報 7 行)
  {
    const K=keep.map(v=>norm(v.miss));
    const par=K.map((_,i)=>i); const find=x=>par[x]===x?x:(par[x]=find(par[x]));
    for(let i=0;i<K.length;i++)for(let j=i+1;j<K.length;j++){
      const m=Math.max(K[i].length,K[j].length); if(!m) continue;
      if(lcseq(K[i],K[j])>=m*0.5) par[find(i)]=find(j);}
    const grp=new Map(); K.forEach((_,i)=>{const g=find(i);grp.set(g,(grp.get(g)||0)+1)});
    keep=keep.filter((_,i)=>grp.get(find(i))<2);
  }
  if(!keep.length) continue; nS++;
  console.log(`\n#${r.id} (${r.duration}) ${(r.artist||'').slice(0,10)} | ${r.title.slice(0,40)}  [庫 ${dl.length} 行]`);
  for(const v of keep){nR++;console.log(`   ➕[${v.ts.length}幀 t=${v.ts.slice(0,4).join(',')}] 缺「${v.miss.slice(0,34)}」 ⟵ 錨「${v.anchor.slice(0,30)}」`);}
}
console.log(`\n掃 ${rows.length} 首,命中 ${nS} 首 / ${nR} 行`);
