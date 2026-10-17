// R1 國語單數線 2026-08-25 出品:「全段字卡漏行」掃描器。
// 🔴 動機 = gapscan2 有個結構性盲點:佢第 44 行寫住 `if(lines.length>=4) continue;`
//    (為咗擋走「一幀塞晒成頁」嘅噪音)。但**新心音樂事工 / 讚美之泉官方歌詞版呢類片
//    根本就係「一幀一張完整字卡」** —— 一張卡 3–6 行歌詞,加埋 logo/詞曲/版權角標,
//    OCR 出嚟必然 ≥4 行。即係話 gapscan2 **由頭到尾冇睇過呢類片**,
//    而呢類片先至係最容易對數嘅(靜態卡、OCR 最乾淨、成段歌詞一次過睇到)。
//    實測:#2317 #3973 #1939 #1965 #3141 #3153 六首全部係喺呢個盲點入面。
//
// 判準:一幀入面「濾走 credits/浮水印之後」剩低 ≥MINL 行歌詞行,
//   其中 ≥MINA 行對得返庫(錨:證明呢張卡真係呢首歌嘅歌詞卡),
//   剩低對唔返庫嘅行 = 候選漏行。
//   ⚠️ 呢個判準**只讀一幀之內**,唔靠次序、唔靠兄弟片、唔靠 whisper。
//
// 用法: node ops/lyrics/cardgap.mjs [lang:parity] [minLines=3] [minAnchor=2]   (env: SHOW=id,id, MINF=1 最少幀數, MINK=5 最短行長)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const pre=s=>String(s).replace(/[祢禰袮称尔袖妳]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠他她它]/g,'他').replace(/[沈沉]/g,'沉').replace(/[那哪]/g,'那').replace(/[着著]/g,'著').replace(/[妳你]/g,'你').replace(/[^一-鿿]/g,'');
// credits / 浮水印 / 專輯角標 / 經文出處
const JUNK=/[©℗@]|Ministr|Music|Official|Lyrics|Worship|www\.|http|版[權檬棒橫獲福社榴權]|所有|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|製作|專[輯辑]|收錄|[詞词調曲訶認弱數詢][\/／].{0,4}[:：]|[詞词調曲][:：]|經文|摘編|詩篇|以賽亞|羅馬書|約翰福音|哥林多|歷代志|以弗所|腓立比|啟示錄|馬太福音|創世記/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const MINL=Number(process.argv[3]||3), MINA=Number(process.argv[4]||2);
const MINK=Number(process.env.MINK||5);
// 罕見字語料(沿用 gapscan2 ①):OCR 亂碼會生出全庫幾乎冇出現過嘅字
const corpus=db.prepare("SELECT lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const freq=new Map();
for(const r of corpus) for(const c of (r.lyrics||'')) if(/[一-鿿]/.test(c)) freq.set(c,(freq.get(c)||0)+1);
const garbage=s=>[...s].some(c=>/[一-鿿]/.test(c)&&(freq.get(c)||0)<=2);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(!frames.length) continue;
  const dl=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const dn=dl.map(norm).filter(Boolean); const flat=dn.join('');
  if(dn.length<3) continue;
  const inLib=k=>{
    if(flat.includes(k)) return true;
    for(const d of dn){ if(Math.abs(d.length-k.length)>3) continue;
      if(lcseq(k,d)>=Math.ceil(k.length*0.8)) return true; }
    // 🐞 2026-08-25 修:呢個「攤平全首歌做滑窗 LCS ≥75%」對**短行**係假匹配機器 ——
    //    5 個字嘅行只要全首歌任何一個 5 字窗撞到 4 個順序相同嘅字就當「庫有」。
    //    實例 #8369《無人知我心》嘅副歌行「像我的主」就係咁樣被食咗,
    //    而首歌真係成句副歌都漏埋。所以滑窗只准用喺 ≥8 字嘅長行(容 OCR 爛字),
    //    短行淨係認上面兩關(整句 includes / 對單一庫行 80%)。
    if(k.length<8) return false;
    let bw=0;
    for(let i=0;i+k.length<=flat.length;i++){const v=lcseq(k,flat.slice(i,i+k.length));if(v>bw)bw=v;if(bw>=k.length)break;}
    return bw>=Math.ceil(k.length*0.75);
  };
  const cand=new Map(); const cards=[];
  for(const f of frames){
    const raws=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const lyr=[]; const ctx=[];
    for(const raw of raws){
      if(JUNK.test(raw)) continue;
      // 🔴 經文卡 / 散文濾網(2026-08-25 加):真歌詞字卡幾乎冇全形標點,
      //    但經文卡(羅馬書/詩篇/約書亞記…)同司儀字幕成句都係。實測擋走 162 命中入面
      //    十幾首純經文卡假陽性,零真陽性損失(六首實錘漏行全部冇標點)。
      if(/[。；、！？《》]|，.*，|節\s*[—\-一]?\s*$/.test(raw)) continue;
      const k=norm(raw);
      if(k.length>=2&&k.length<=40) ctx.push({raw,k});   // 合併行/重複框判斷用嘅上下文(未過 MINK)
      // MINK 短行模式(2026-08-25):R2b 08-25 實錘「短句副歌係全線盲點」——
      //   幾乎每隻掃描器都有 ≥4/≥5 字濾網,令「是祢」「像我的主」「敬拜神羔羊」
      //   呢類招牌短副歌喺工具眼中隱形。喺**強字卡**(錨 ≥3 行)入面放短行係安全嘅,
      //   因為同幀有三行對得返庫已經證明呢一幀係歌詞區。配 MINF≥2 用。
      if(k.length<MINK||k.length>24) continue;
      if(k.length/pre(raw).replace(/\s/g,'').length < 0.6) continue;   // 大半係拉丁/數字 → 唔係中文歌詞行
      lyr.push({raw,k});
    }
    if(lyr.length<MINL) continue;
    const hit=lyr.filter(x=>inLib(x.k));
    if(hit.length<MINA) continue;
    // 🐞 2026-08-25 R2b 加「合併行」濾網:上面 inLib 對**短行**只認「整句 includes」同
    //    「對單一庫行 80%」兩關(滑窗 ≥8 字先開,係 #8369 嗰個修正)。但好多庫係
    //    **將同一幀嘅兩個 OCR 行合併寫成一行**(「全世界只有祢明白我軟弱」),
    //    只要 OCR 喺短行度錯一個字(明白→明自),三關就全部接唔到 → 報假漏行。
    //    修法唔係放鬆 inLib(會踩返 #8369),而係用**同幀相鄰行**做上下文:
    //    候選同佢前面/後面嗰行黐返埋一齊,如果對得返某一條庫行 ≥80% → 係合併行,唔係漏行。
    //    實測粵語雙數:#4932「明自我軟弱」/#3102「進人祢安息處」/#6174「仍在袖手裡」三個假陽性全清,零真陽性損失。
    const joinInLib=s=>{ for(const d of dn){ if(Math.abs(d.length-s.length)>4) continue;
      if(lcseq(s,d)>=Math.ceil(s.length*0.8)) return true; } return false; };
    // ⚠️ 相鄰行一定要由 ctx(未過 MINK 濾網)嗰度攞 —— 好多庫係「長行 + 一個 4 字短行」
    //    合併寫成一條,而嗰個短行俾 MINK≥5 剔咗出 lyr,用 lyr 做鄰居就永遠併唔返。
    //    實例 #3078「聽著這脈膊亂跳」+「心不安寧」(4字) = 庫第 5 行。
    const merged=b=>{ const i=ctx.findIndex(x=>x.k===b.k); if(i<0) return false;
      const a=ctx[i-1], c=ctx[i+1];
      if(a&&joinInLib(a.k+b.k)) return true;
      if(c&&joinInLib(b.k+c.k)) return true; return false; };
    // 🐞 2026-08-25 R2b:OCR **同一行讀兩次**(兩個偵測框,一個乾淨一個爛)——
    //    #6174 每張卡都有「仍在祂手裡」同「仍在袖手裡」孖住出。爛嗰個對唔返庫就變假漏行。
    //    判準:同一幀入面有另一行**已經對得返庫**而且同候選 LCS ≥80% → 係重複框,唔係漏行。
    const dupOf=b=>ctx.some(y=>y.k!==b.k&&inLib(y.k)&&Math.abs(y.k.length-b.k.length)<=2
        &&lcseq(b.k,y.k)>=Math.ceil(Math.max(b.k.length,y.k.length)*0.8));
    const RAW=process.env.RAW==='1';   // RAW=1 = 熄晒 2026-08-25 R2b 加嘅三層濾網,做 A/B 對照用
    const miss=lyr.filter(x=>!inLib(x.k)&&!garbage(x.raw)&&(RAW||(!merged(x)&&!dupOf(x))));
    cards.push({t:f.t,n:lyr.length,hit:hit.length,miss:miss.map(x=>x.raw)});
    for(const m of miss){
      if(!cand.has(m.k)) cand.set(m.k,{raw:m.raw,ts:[]});
      cand.get(m.k).ts.push(f.t);
    }
  }
  if(!cand.size) continue;
  // 浮水印聚類(沿用 gapscan2):同一句喺 ≥3 個互相似嘅變體出現 = 角標唔係歌詞
  let keep=[...cand.entries()].map(([k,v])=>({k,...v}));
  {
    const par=keep.map((_,i)=>i); const find=x=>par[x]===x?x:(par[x]=find(par[x]));
    for(let i=0;i<keep.length;i++)for(let j=i+1;j<keep.length;j++){
      const m=Math.max(keep[i].k.length,keep[j].k.length); if(!m) continue;
      if(lcseq(keep[i].k,keep[j].k)>=m*0.5) par[find(i)]=find(j);}
    const grp=new Map(); keep.forEach((_,i)=>{const g=find(i);grp.set(g,(grp.get(g)||0)+1)});
    keep=keep.filter((_,i)=>grp.get(find(i))<3);
  }
  // 🧹 2026-08-25 R2b 加「無歌詞幀」濾網(借 shortline.mjs 嘅核心判準):
  //    浮水印 / 片名 overlay / 頻道角標 一定會喺**片頭卡、間奏、片尾 credits** 出現,
  //    真歌詞行唔會。所以攞返成條片所有幀,計候選喺「一條庫行都對唔到嘅幀」出現過幾多次,
  //    >0 就剔。上面個聚類濾網要 ≥3 個相似變體先接得住,單一寫法嘅角標(「同心圓．同心唱」
  //    「難成的事.歌鄰敬拜」「路邊的一課 1/6」)同埋**成片打橫掛住嘅片名**(#1918
  //    「在這恬靜的一刻」出現喺 39 幀入面連片頭 t=2 都有)佢一律接唔到。
  {
    const dead=[];
    for(const f of frames){
      const ls=String(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean)
        .filter(x=>!JUNK.test(x)).map(x=>({raw:x,k:norm(x)})).filter(x=>x.k.length>=3);
      if(!ls.length) continue;
      if(ls.some(x=>inLib(x.k))) continue;          // 呢幀有歌詞 → 唔算死幀
      dead.push(ls.map(x=>x.k).join('\u0001'));
    }
    if(dead.length&&process.env.RAW!=='1') keep=keep.filter(v=>!dead.some(d=>d.includes(v.k)));
  }
  const MINF=Number(process.env.MINF||1);
  keep=keep.filter(v=>v.ts.length>=MINF);
  if(!keep.length) continue;
  out.push({id:r.id,title:r.title,artist:r.artist,dur:r.duration,libN:dl.length,cards,keep:keep.sort((a,b)=>a.ts[0]-b.ts[0])});
}
out.sort((a,b)=>b.keep.length-a.keep.length);
const SHOW=(process.env.SHOW||'').split(',').filter(Boolean).map(Number);
if(SHOW.length){
  for(const id of SHOW){
    const s=out.find(x=>x.id===id); const r=rows.find(x=>x.id===id);
    console.log(`\n===== #${id} ${r?r.title.slice(0,55):'?'} | ${r?r.artist:''} | ${r?r.duration:''}`);
    if(!r) continue;
    console.log('--- 庫:'); (r.lyrics||'').split('\n').map(x=>x.trim()).filter(Boolean).forEach((l,i)=>console.log(`  ${String(i+1).padStart(2)} ${l}`));
    if(!s){console.log('  (唔喺命中名單)');continue;}
    console.log('--- 字卡(只印有漏行嗰啲):');
    for(const c of s.cards) if(c.miss.length) console.log(`  t=${c.t} [${c.hit}/${c.n} 對得返庫] 漏:${c.miss.map(x=>'「'+x+'」').join(' ')}`);
  }
  process.exit(0);
}
console.log(`掃 ${rows.length} 首 → 命中 ${out.length} 首`);
for(const s of out.slice(0,Number(process.argv[5]||60)))
  console.log(`${s.id}\t漏${s.keep.length}\t庫${s.libN}\t${(s.artist||'').slice(0,10)}\t${s.title.slice(0,34)}\t${s.keep.slice(0,3).map(v=>'「'+v.raw.slice(0,18)+'」×'+v.ts.length).join(' ')}`);
