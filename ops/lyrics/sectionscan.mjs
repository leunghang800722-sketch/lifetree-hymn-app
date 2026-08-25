// 🆕 R1 2026-08-24:「連續漏段」掃描器。
// 動機:反查掃描器嘅 `n>=2` 閘結構性遮住「只唱一次嘅 bridge」(R1b 已記),
// 但單純放寬到 n>=1 會爆幾千條噪音(R2b 實測)。
// 呢隻改為**唔靠幀數,靠時序連續性**:真.漏段 = OCR 時間軸上連續好幾行都對唔返庫,
// 而且集中喺一個短時窗;浮水印/credits/經文卡係孤立一兩行。
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const _S2T=Converter({from:'cn',to:'t'});
const fold=s=>_S2T(String(s).replace(/[祢禰袮称尔妳]/g,'你')).replace(/[祢禰妳]/g,'你').replace(/[衪祂牠]/g,'他').replace(/找/g,'我').replace(/眞/g,'真').replace(/説/g,'說').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著');
const cjk=s=>s.replace(/[^一-鿿]/g,'');
const BOOKS='創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得|約翰一書|約翰二書|約翰三書|猶大書|啟示錄';
const BAD=new RegExp('('+BOOKS+')|(詞曲|作詞|作曲|編曲|監製|製作|演唱|主唱|和聲|混音|母帶|錄音|吉他|鍵盤|貝斯|導演|攝影|剪接|後期|美術|版權|發行|出品|策劃|統籌|翻譯|填詞|原曲|原唱|中譯|中譯詞|粵譯詞|經文|唱片|專輯|收錄)|(訂閱|頻道|官方|奉獻|請勿|翻印|更多歌曲|點選這裡)|^［?[閩台]］?|[©℗]|Ministr|Music Min|版[權檬棒橫]所有|調[\/／]曲|詞[\/／]曲|音樂事工|敬拜團|Worship\\s*Team');
const CREDITS=/^[*#＊＃●▲■・]|社團法人|基金會|協會|異象工場|大衛帳幕|admin by|Admin by|Copyright|All Rights|^詞[^曲]|^曲[^詞]|牧師|堂主任|院長|主席|神學院|培訓學院|靈糧堂|浸信會|宣道會|生命樹|使徒性|[：｜]|主[領领]|提琴|中提|大提|弦樂|木管|銅管|長笛|小號|鼓[手組]|打擊|樂手|人聲|企劃|平面|設計|燈光|音控|場務|行道會|長老會|Strings|Violin|Cello|Drums|Bass\b|Keys\b|www\.|\.com|\.tv/;
// 🐞 R1b 2026-08-24 修:舊版 /[，。；、！？]/ 會誤殺帶感嘆號嘅歌詞行
// (實例 #294《信心的旅途》兩句『啊！信心的旅途』/『啊！信心的歲月』全程隱形)。
// 而家:只有 `，`/`。`/`；`/`、` 直接算 prose;`！`/`？` 要出現 ≥2 次先算。
const PROSE=l=>/[，。；、]/.test(l)||((l.match(/[！？]/g)||[]).length>=2);
// 🗣️ SPEECH(R1b 2026-08-24 加):行級「口白/旁白/戲劇對白」指紋。
//   動機:國語雙數分區 sectionscan 14 個候選 **0 真**,全部係口白 —— 泥娃娃「生活篇」
//   兒童劇對白、天韻 Official MV 片頭歌手簡介、讚美之泉巡迴現場敬拜禱告、創作分享。
//   舊有 PROSE 淨係捉「有逗號句號」或者「兩個以上!?」,呢啲字幕通常一個標點都冇,所以走晒。
//   五條指紋(命中任何一條即當口白,行級剔走 —— run 跌穿 MIN_RUN 就自然消失):
//   ① CJK ≥17 —— 全庫 76,521 條 verified 歌詞行入面 99.67% 都 ≤16 字,
//      即係話呢條閘最多只會誤傷 0.33% 真歌詞行,而口白句動輒 17–21 字。
//   ② 單個 ？ 或 ！(PROSE 要兩個先計)
//   ③ 引號 「」『』“”"(對白專用,歌詞字幕唔會有)
//   ④ 句末語氣助詞 吧|呢|嗎|啦|囉|喔|呀|咧 —— ⚠️ 特登唔收「啊」同「耶」,
//      因為「主啊」「哈利路耶」係真歌詞。
//   ⑤ CJK ≥5 而且夾住 ≥4 個連續英文字母(講員讀英文人名/歌名)
const SPEECH=l=>{const k=(l.match(/[一-鿿]/g)||[]).length;
  return k>=17 || /[？！?!]/.test(l) || /[「」『』“”]/.test(l)
      || /[吧呢嗎啦囉喔呀咧][。．…]*$/.test(l.trim())
      || (k>=5 && /[A-Za-z]{4,}/.test(l));};
const FRAMEBAD=new RegExp('('+BOOKS+')|［[閩台]］|\\[[閩台]\\]|章\\d+節|\\d+:\\d+-\\d+');
function lcsLen(a,b){const m=a.length,n=b.length;if(!m||!n)return 0;
  let prev=new Array(n+1).fill(0),cur=new Array(n+1).fill(0);
  for(let i=1;i<=m;i++){for(let j=1;j<=n;j++){cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);}
    const t=prev;prev=cur;cur=t;cur.fill(0);}return prev[n];}
function bsim(a,b){if(!a.length||!b.length)return 0;
  const g=x=>{const m=new Map();for(let i=0;i<x.length-1;i++){const k=x.slice(i,i+2);m.set(k,(m.get(k)||0)+1);}return m;};
  const A=g(a),B=g(b);let inter=0,na=0,nb=0;
  for(const v of A.values())na+=v;for(const v of B.values())nb+=v;
  for(const [k,v] of A) if(B.has(k)) inter+=Math.min(v,B.get(k));
  return na+nb?2*inter/(na+nb):0;}
const winSim=(a,b)=>(a.length<4||!b.length)?0:lcsLen(a,b)/a.length;
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// R1b 2026-08-24:argv[3] 兩種寫法都收 —— 原本嘅 raw SQL,或者同其餘掃描器一致嘅 `lang:parity`(例 國語:0)。
//   舊版淨係收 raw SQL,四條線傳慣嘅 `國語:0` 會被當成 argv[2] 輸出路徑,然後靜靜掃返 default 分區(R1 單數)。實測踩過。
// 🔴 R2 2026-08-24 晚班修:第三次踩同一個坑 —— argv[2] 一直係**輸出路徑**,四條線傳慣嘅
//   `node xxx.mjs 粵語:1` 會令 argv[2]="粵語:1" 變咗檔名(repo root 真係積咗
//   `粵語:1` / `國語:1` / `lang='粵語' AND id%2=1` 三個 junk 檔),而 argv[3] 冇值 →
//   **靜靜掃返 default 嘅 R1 國語單數分區**,出嚟嘅結果全部唔係你分區嘅歌。
//   而家 argv[2] 撞正 `<lang>:<parity>` 就自動當佢係 filter,輸出改寫去 scratch。
const _LP=/^([^:\/]{1,6}語|英文|兒童):([01])$/;
if(_LP.test(process.argv[2]||'')){
  process.argv[4]=process.argv[3];             // 舊 argv[3](minRun)順延
  process.argv[3]=process.argv[2];
  process.argv[2]='/tmp/'+process.argv[1].split('/').pop().replace(/\.mjs$/,'')+'-out.json';
}
const _w=process.argv[3]||"lang='國語' AND id%2=1";
const _m=/^(國語|粵語|英文|日語):([01])$/.exec(_w);
const WHERE=_m?`lang='${_m[1]}' AND id%2=${_m[2]}`:_w;
// argv[4] = 最短 run 長度(預設 3)。放到 2 會多啲貨但噪音升,配合濾網 C/D 用。
const MIN_RUN=Number(process.argv[4]||3);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE ${WHERE} AND lyrics_status='verified' AND lyrics_timeline IS NOT NULL`).all();
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const frames=tl.ocr||[];if(!frames.length)continue;
  const curF=(r.lyrics||'').split('\n').map(x=>cjk(fold(x))).filter(Boolean);
  const curAll=curF.join('');
  if(curAll.length<20)continue;
  const titleKey=cjk(fold(r.title||''));
  const miss=[];const seen=new Set();
  for(const f of frames){
    const lines=String(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
    if(lines.some(l=>FRAMEBAD.test(l)))continue;
    for(const l of lines){
      if(PROSE(l)||SPEECH(l)||BAD.test(l)||CREDITS.test(l))continue;
      const k=cjk(fold(l));
      if(k.length<5)continue;
      if(seen.has(k))continue;
      if(titleKey&&titleKey.includes(k))continue;
      if(winSim(k,curAll)>=0.62)continue;          // 已經喺庫入面(含爛字版)
      let best=0;for(const c of curF){const s=winSim(k,c);if(s>best)best=s;}
      if(best>=0.6)continue;
      seen.add(k);miss.push({t:f.t,txt:l,k});
    }
  }
  if(miss.length<3)continue;
  // 🧹 濾網 A(浮水印/台徽聚類,見 [[project-lyrics-ocr-watermark-cluster]]):
  //    同一首歌入面互相似嘅候選 ≥3 條 = 同一個浮水印嘅 N 種爛法,成組剔。
  const dropA=new Set();
  for(let i=0;i<miss.length;i++){let g=1;
    for(let j=0;j<miss.length;j++){ if(i!==j&&bsim(miss[i].k,miss[j].k)>=0.55) g++; }
    if(g>=3) dropA.add(i);}
  // 🧹 濾網 B(爛字比例):候選入面有一撮字喺庫歌詞同 whisper 都完全冇出現過 → OCR 重影/爛幀。
  const WNOISE=/\[MUSIC\]|MUSIC|字幕|訂閱|感謝收看|請不吝|Amara|明鏡/;
  const wraw=tl.whisper;
  const wsegs=Array.isArray(wraw)?wraw.map(w=>String(w&&w.text||'')):(typeof wraw==='string'?[wraw]:[]);
  const whF=cjk(fold(wsegs.filter(x=>!WNOISE.test(x)).join('')));
  const pool=curAll+whF;
  const miss2=miss.filter((m,i)=>{ if(dropA.has(i))return false;
    const junk=[...m.k].filter(c=>!pool.includes(c)).length;
    return junk/m.k.length<=0.35; });
  if(miss2.length<3)continue;
  miss.length=0; miss.push(...miss2);
  // 揾「時序上連續」嘅 run:相鄰兩條相隔 ≤24 秒先當同一段
  const runs=[];let cur=[miss[0]];
  for(let i=1;i<miss.length;i++){ if(miss[i].t-cur[cur.length-1].t<=24) cur.push(miss[i]); else {runs.push(cur);cur=[miss[i]];} }
  runs.push(cur);
  const good=runs.filter(x=>x.length>=MIN_RUN);
  if(!good.length)continue;
  // 🧹 濾網 C(R1b 2026-08-24):創作分享 / 敬拜口白段。
  //    指紋 = 單一個 run、行數 ≥12、時窗 ≥60 秒(實測 9/21 假陽性屬呢類)。
  //    真.漏段極少會又長又密咁鋪滿成分鐘而一句都對唔返庫。
  if(good.every(x=>x.length>=12&&(x[x.length-1].t-x[0].t)>=60))continue;
  // 🧹 濾網 D(R1b 2026-08-24):片頭「歌手簡介卡」。
  //    指紋 = 單幀(t0===t1)、行數 ≥6、出現喺頭 20 秒(天韻 Official MV 系列 6/6 中招)。
  if(good.every(x=>x[0].t===x[x.length-1].t&&x.length>=6&&x[0].t<=20))continue;
  // 🧹 濾網 E(R1b 2026-08-24):現場敬拜「帶領禱告」段。
  //   指紋 = run 入面有禱告收結套語。實例 #4140 讚美之泉巡迴現場《安靜》——
  //   17 行全部係主領禱告,入面有「這樣禱告奉靠耶穌的名」同「我們一起說」。
  //   ⚠️ 特登唔收單獨嘅「奉耶穌的名」—— 嗰句真係有歌詞用。
  const PRAYER=/這樣禱告|禱告奉(靠|主)|奉靠.{0,3}耶穌.{0,4}的名|我們一起(說|來說|禱告)|跟(著|住)我(一起)?(說|禱告)/;
  if(good.every(x=>x.some(y=>PRAYER.test(y.txt))))continue;
  out.push({id:r.id,title:r.title,artist:r.artist,curLines:curF.length,runs:good.map(x=>({t0:x[0].t,t1:x[x.length-1].t,lines:x.map(y=>y.txt)}))});
}
out.sort((a,b)=>b.runs.reduce((s,x)=>s+x.lines.length,0)-a.runs.reduce((s,x)=>s+x.lines.length,0));
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首,有連續漏段 ${out.length} 首,總行 ${out.reduce((s,x)=>s+x.runs.reduce((t,y)=>t+y.lines.length,0),0)}`);
console.log(out.slice(0,40).map(x=>`${x.id}\t段${x.runs.length}\t行${x.runs.reduce((s,y)=>s+y.lines.length,0)}\t庫${x.curLines}\t${(x.artist||'').slice(0,8)}\t${x.title.slice(0,32)}`).join('\n'));
