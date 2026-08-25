// R1 國語單數線 2026-08-24 出品。`scripframe` 嘅「唱定卡」裁判 —— 三重硬濾網,自動化,唔使開條片。
// 動機:scripframe 淨係話「呢行同經文幀夾」,但**歌自己咏唱經文**同**間奏擺經文卡**兩件事佢分唔到。
//   實測 69 首候選入面只得 8 首係真污染。
// 判準:一行要**同時**滿足三樣先算「卡」——
//   ① 出現喺經文幀(scripframe 已做);
//   ② 全首 OCR 冇任何一個「非經文幀」出過佢 —— ⚠️ 一定要 LCS ≥ 62% 模糊比對,唔可以 includes,
//      因為唱嗰陣嘅字幕 OCR 隨時讀爛(#5849《八福》「因為他們必得安慰」讀成「四得安慰」);
//   ③ 全首 whisper 由頭到尾冇唱過 —— ⚠️ 要掃全首,唔可以淨掃卡附近 ±N 秒
//      (#407 張卡喺 t=32、真唱喺 t=54–90,掃附近會誤判)。
// 另加一條低成本啟發式:中招行數 ≥ 全首一半 → 掃描器問題唔係污染,自動剔走。
// 用法:node ops/lyrics/scripframe.mjs <lang:parity> > /tmp/sf.txt && node ops/lyrics/cardjudge.mjs /tmp/sf.txt
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称]/g,'你').replace(/[衪祂他她]/g,'你').replace(/[裏裡]/g,'里').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const txt=fs.readFileSync(process.argv[2],'utf8').split('\n');
let cur=null; const groups=new Map();
for(const ln of txt){
  let m=ln.match(/^#(\d+)\s/); if(m){cur=Number(m[1]); continue;}
  m=ln.match(/📖\[\d+幀 t=([\d,]+)\] 庫「(.+?)」/);
  if(m&&cur){ if(!groups.has(cur))groups.set(cur,new Set()); groups.get(cur).add(m[2]); }
}
function lcs(a,b){if(!a||!b)return 0;let best=0;const dp=new Array(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){let prev=0;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=a[i-1]===b[j-1]?prev+1:0;if(dp[j]>best)best=dp[j];prev=t;}}return best;}
// 🐞 R1b 2026-08-24 修:上面個 lcs 係**連續**子串,whisper 一個同音字錯就即刻斷開,
//    令「其實有唱」嘅經文段被判成「淨係卡上有」。實例 #8580《天國的子民》——
//    庫「惟有你們是被揀選的族類」,whisper 聽成「唯有你們是被簡選的族類」,
//    惟/唯 同 揀/簡 兩處斷開,最長連續子串得 5,過唔到 0.6×11=7 嘅閘 → 假報污染。
//    改用「限窗子序列」:喺對方文字度開一個 (k+3) 長度嘅滑窗,窗內行 LCSubsequence。
//    限窗係為咗防止長 whisper 段/長 OCR 幀靠字數多而砌夠分,唔可以用全串子序列。
function lcsub(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
function winLcs(k,text){ if(!k||!text) return 0;
 const W=k.length+3; if(text.length<=W) return Math.max(lcs(k,text),lcsub(k,text));
 let best=lcs(k,text);
 for(let i=0;i+W<=text.length;i++){const v=lcsub(k,text.slice(i,i+W)); if(v>best)best=v;}
 return best;}
// 出處寫法至少三種:「詩篇十七篇1節」「詩十七篇1節」「詩篇17：3」
const isCardFrame=s=>/(創|出|利|民|申|書|士|得|撒|王|代|拉|尼|斯|伯|詩|箴|傳|歌|賽|耶|哀|結|但|何|珥|摩|俄|拿|彌|鴻|哈|番|該|亞|瑪|太|可|路|約|徒|羅|林|加|弗|腓|西|帖|提|多|門|來|雅|彼|猶|啟)[^\n]{0,4}(篇|章|書|福音)?\s*[0-9０-９一二三四五六七八九十百]+\s*[:：章節篇]/.test(s);
let n=0;
for(const [id,set] of groups){
  const r=db.prepare('SELECT title,artist,lyrics,lyrics_timeline FROM hymns_all WHERE id=?').get(id);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const O=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>({t:Math.round(f.t),s:String(f.text||'')}));
  const W=(Array.isArray(tl.whisper)?tl.whisper:[]).map(w=>norm(w.text)).filter(x=>x.length>=4);
  if(!W.length||!O.length) continue;
  const total=r.lyrics.split('\n').filter(x=>x.trim()).length;
  const out=[];
  for(const line of set){
    const k=norm(line); if(k.length<5) continue;
    const inPlain=O.some(f=>!isCardFrame(f.s)&&winLcs(k,norm(f.s))>=Math.ceil(k.length*0.62));
    const sung=W.some(w=>winLcs(k,w)>=Math.max(5,Math.ceil(k.length*0.6)));
    if(!inPlain&&!sung) out.push(line);
  }
  if(out.length<2) continue;
  if(out.length>=total/2){ console.log(`\n(剔)#${id} ${out.length}/${total} 行中招 → 掃描器問題,唔係污染`); continue; }
  n++;
  console.log(`\n#${id} ${r.artist} | ${r.title.slice(0,42)} [庫 ${total} 行] —— ${out.length} 行淨係卡上有`);
  for(const l of out) console.log(`   🃏 ${l}`);
}
console.log(`\n判到 ${n} 首真經文卡污染`);
