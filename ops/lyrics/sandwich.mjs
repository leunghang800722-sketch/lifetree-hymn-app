// R2b 粵語雙數線 2026-08-25 出品:「同幀三文治」漏行掃描器。
// 動機:今班最硬嗰單(#5470 傳頌千里)嘅指紋係 —— 一個 OCR 幀入面有三行 A/B/C,
//   A 同 C 喺庫入面**係相鄰兩行**,但夾喺中間嘅 B **喺庫入面唔喺佢哋中間**
//   (B 可能喺庫第啲位置出現過,亦可能成首歌都冇)。
//   螢幕同一幀擺住三行 = 呢三行係同一組,所以 B 一定係庫漏咗嘅嗰行。
//   呢個判準唔使靠兄弟片、唔使靠 whisper,淨靠自己條片,而且**零爭議**。
//
// 用法: node sandwich.mjs [lang:parity]        (預設 粵語:0)
//   env: SHOW=id,id  只印呢幾首嘅詳情
//
// 已知會出假陽性嘅位(報告會標出嚟,唔會自動剔):
//   ① 雙層字幕片(粵譯+國語原詞 / 中英對照)—— 兩層同幀,B 係另一層
//   ② 和聲/伴唱層(例「高聲唱高聲唱」)
//   ③ 經文卡同歌詞疊幀
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// 🔴 一定要喺 S2T 之前先中和 祢/称/尔 —— opencc cn→t 會將「称」轉做「稱」,
//   之後嘅 [称]→你 就永遠接唔到,同一句歌詞會變咗兩個 key。
//   (2026-08-25 實測:#1690「竭力呼叫称」明明庫有「竭力呼叫祢…」都照報漏行。
//    同一個坑 08-23 R2b 喺 junkscan 撞過「祢→禰」版本。)
const pre=s=>String(s).replace(/[祢禰袮称袖尔]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称袖尔]/g,'你').replace(/[裏裡]/g,'里'.replace(/[着著]/g,'著'))
  .replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的')
  .replace(/[沈沉]/g,'沉').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗]|Ministr|版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|All Rights|Official|Lyrics? ?MV|專輯|收錄|www\.|詞[:：]|曲[:：]|調[:：]|Copyright|音樂事工|敬拜者使團|齊唱金曲/;
function lcs(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const sim=(a,b)=>{const m=Math.max(a.length,b.length);return m?lcs(a,b)/m:0;};
// 最長共同**子序列**(唔同上面 lcs 嘅最長共同子串):量「同一句俾 OCR 讀爛咗」用
function lcseqLen(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}

const [MLANG,MPAR]=(process.argv[2]||'粵語:0').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const SHOW=new Set((process.env.SHOW||'').split(',').filter(Boolean).map(Number));
const out=[];
for(const r of rows){
  const lib=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  // 片名(去晒括號/英文/頻道名),畀濾網⑤ 用
  const TKEY=norm(String(r.title||'').replace(/[（(【\[].*?[)）】\]]/g,'').split(/[|｜\/\-–—]/)[0]);
  const nlib=lib.map(norm);
  if(nlib.filter(x=>x.length>=4).length<4) continue;
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const ocr=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!ocr.length) continue;
  // 每行 → 庫 index(最佳 fuzzy,≥0.75 先算命中)
  const mapLine=k=>{let bi=-1,bs=0;
    for(let i=0;i<nlib.length;i++){if(nlib[i].length<4)continue;const s=sim(k,nlib[i]);if(s>bs){bs=s;bi=i;}}
    return bs>=0.75?bi:-1;};
  const hits=[];
  for(const f of ocr){
    const ls=String(f.text||'').split('\n').map(s=>s.trim()).filter(s=>!JUNK.test(s));
    const ks=ls.map(norm);
    if(ls.length<3) continue;
    const idx=ks.map(k=>k.length>=4?mapLine(k):-2);   // -2 = 太短唔算
    for(let p=0;p+2<ls.length;p++){
      const a=idx[p],b=idx[p+1],c=idx[p+2];
      if(a<0||c<0) continue;
      if(c!==a+1) continue;                            // A、C 一定要庫相鄰
      if(ks[p+1].length<4) continue;                   // 中間行太短唔算
      if(b===a||b===c) continue;                       // 同一行重複讀
      // 🔴 濾網①(2026-08-25 首跑即刻要加):**摺行(word-wrap)假陽性**。
      //   長庫行喺螢幕上摺成兩行,OCR 會逐行出,於是「半截行」就夾喺兩條完整行中間。
      //   實例 #5264「屈膝祢前」夾喺「祢是王 尊貴主 我景仰」同「屈膝祢前 讓我頌讚祢」之間(5 幀);
      //        #1690「讓復興彰顯」夾喺「齊心仰望父神 讓復興彰顯」同「願祢轉化這世代」之間。
      //   判準:B 係 A 或者 C 嘅子字串(或者反過來)→ 一定係摺行,唔係漏行。
      const kb=ks[p+1], ka=nlib[a], kc=nlib[c];
      if(ka.includes(kb)||kc.includes(kb)||kb.includes(ka)||kb.includes(kc)) continue;
      if(sim(kb,ka)>=0.6||sim(kb,kc)>=0.6) continue;   // 濾網②:B 同鄰行 6 成似 = OCR 重讀/摺行變體
      // 濾網③(2026-08-25 加):B 係**任何**庫行嘅子字串 → 摺行碎片,唔係漏行。
      //   b>=0 只擋到 fuzzy ≥0.75 嗰啲;短碎片(#6174「使你福杯滿溢」對「祂必叫萬物互相效力 使你福杯滿溢」
      //   只有 0.44)會走甩,要獨立擋一次。
      if(nlib.some(n=>n.length>kb.length&&n.includes(kb))) continue;
      // 濾網④(2026-08-25 R2b 加):**同幀重複框** —— OCR 將同一行讀兩次(一乾淨一爛),
      //   爛嗰個唔對得返庫就夾喺兩條真行中間。實例 #3656 t=298「免我隱而来見的通錯」
      //   同幀有「願祢赦免我隱而未見的過錯」。判準:同一幀入面有另一行已經對得返庫
      //   而且同 B 有 6 成似 → 係重複框。(濾網② 只睇 A/C 兩條鄰行,睇唔到隔籬。)
      //   ⚠️ 呢度唔可以用 `sim`(佢係**最長共同子串**/max):OCR 爛字會將個子串斬到碎,
      //   #3656「免我隱**而**来見的通錯」對「願祢赦免我隱**而**未見的過錯」最長共同子串得 3,
      //   sim 只有 0.25 完全接唔到。要用**最長共同子序列**先量得到「同一句讀爛咗」。
      //   分母用**短嗰條**唔用長嗰條:重複框成日連前綴都讀甩(「願祢赦」冇咗),
      //   用 max 做分母 #3656 得 7/12=0.58 接唔到,用 min 係 7/9=0.78 就啱。
      //   為咗唔誤殺短嘅真漏行,呢層只喺 B ≥6 字先開(短行有濾網③同 shortline 睇)。
      if(ks.some((k2,q)=>{ if(q===p+1||idx[q]<0||k2.length<4) return false;
        const L=lcseqLen(kb,k2);
        if(L>=Math.ceil(Math.max(kb.length,k2.length)*0.65)) return true;       // 長度差唔多嘅重讀
        return kb.length>=6&&k2.length>=6&&L>=Math.ceil(Math.min(kb.length,k2.length)*0.75); // 讀甩前綴
      })) continue;
      // 濾網⑤(2026-08-25 R2b 加):**片名浮水印/角標**。B 入面含住歌名 = 角標唔係歌詞。
      //   實例 Milk&Honey 售碟角標「〈歌名〉試聽」(OCR 爛做 試糖/試路/試點/試𣊉):
      //   #3882「認信之後試𣊉」×7 幀、#2888「呼喊試糖」。
      if(TKEY.length>=2&&kb.includes(TKEY)&&kb.length<=TKEY.length+4) continue;
      hits.push({t:f.t,a:lib[a],b:ls[p+1],c:lib[c],bIdx:b,
        bWhere:b>=0?`庫第${b+1}行`:'成首庫都冇'});
    }
  }
  if(!hits.length) continue;
  // 同一個 B 出現幾多幀
  const g=new Map();
  for(const h of hits){const k=norm(h.b);if(!g.has(k))g.set(k,{...h,n:0,ts:[]});const e=g.get(k);e.n++;e.ts.push(h.t);}
  out.push({id:r.id,title:r.title,artist:r.artist,dur:r.duration,libN:lib.length,cands:[...g.values()].sort((x,y)=>y.n-x.n)});
}
out.sort((a,b)=>b.cands[0].n-a.cands[0].n);
if(SHOW.size){
  for(const s of out.filter(x=>SHOW.has(x.id))){
    console.log(`\n===== #${s.id} | ${s.dur} | ${s.title}`);
    for(const c of s.cands) console.log(`  [${c.n}幀 t=${c.ts.slice(0,6).join(',')}] 「${c.a}」\n      ⤷ 夾住:「${c.b}」  (${c.bWhere})\n      「${c.c}」`);
  }
  process.exit(0);
}
console.log(`掃 ${rows.length} 首 → 三文治候選 ${out.length} 首`);
for(const s of out.slice(0,40)){
  const c=s.cands[0];
  console.log(`${s.id}\t${c.n}幀\t庫${s.libN}\t${(s.artist||'').slice(0,10)}\t${s.title.slice(0,32)}\t夾住「${c.b.slice(0,18)}」(${c.bWhere})`);
}
