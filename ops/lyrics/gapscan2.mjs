// R2 粵語單數線 2026-08-24 晚班出品:gapscan v2 —— 加兩層「OCR 垃圾」濾網。
// 動機:gapscan 喺粵語分區出 73 首,抽頭四首(#4129 #3017 #6133 #4399)全部係**OCR 爛到冇得讀**
//   嘅假陽性(例「完全是您澩嫠藡屭改雀荃溝塑髏」),舊有嘅 75% LCS 爛字濾網接唔住,
//   因為爛得太犀利連 75% 都夾唔到。
// 兩層新濾網:
//   ① 罕見字濾網:攞全庫 verified 歌詞做語料,孤兒行入面有任何字全庫出現 ≤RARE 次 → 當 OCR 垃圾剔走。
//      (真歌詞行嘅字幾乎一定喺語料出現過好多次;OCR 亂碼會生出「澩嫠藡屭犦蓨」呢類字)
//   ② 成首 OCR 質素閘:算「合資格 OCR 行入面有幾多 % 對得返庫」,低過 MINQ 即係成條片 OCR 都爛,
//      孤兒行冇參考價值 → 成首跳過。
//   ③ 司儀口白 run 濾網:連住 ≥RUN 幀「一句庫行都冇、淨係孤兒」→ 整段當口白剔走。
// 用法: node gapscan2.mjs [lang:parity] [minOrphan=3] [rare=2] [minq=0.45]   (env: RUN=4, SHOW=id,id)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const pre=s=>String(s).replace(/[祢禰袮称尔妳]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂他她它]/g,'他').replace(/[沈沉]/g,'沉').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const JUNK=/[©℗]|Ministr|版[權檬棒橫獲福社榴]|作詞|作曲|編曲|填詞|監製|主唱|演唱|混音|All Rights|Official|Lyrics? MV|專輯|收錄|www\.|詞[:：]|曲[:：]|調[:：]|經文|摘編|Copyright|節[-—一]?$|詩篇|以賽亞|羅馬書|約翰福音|哥林多|歷代志|以弗所/;
function lcseq(a,b){const n=b.length;let prev=new Array(n+1).fill(0);
 for(let i=1;i<=a.length;i++){const cur=new Array(n+1).fill(0);
  for(let j=1;j<=n;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}return prev[n];}
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const MINO=Number(process.argv[3]||3), RARE=Number(process.argv[4]||2), MINQ=Number(process.argv[5]||0.45);
// ① 語料:全庫 verified 字頻(原文計,唔 normalize —— 亂碼字唔會俾 opencc 變走)
const corpus=db.prepare("SELECT lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const freq=new Map();
for(const r of corpus) for(const c of (r.lyrics||'')) if(/[一-鿿]/.test(c)) freq.set(c,(freq.get(c)||0)+1);
const garbage=s=>[...s].some(c=>/[一-鿿]/.test(c)&&(freq.get(c)||0)<=RARE);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const RUN=Number(process.env.RUN||4);
const ANCHOR=process.env.ANCHOR==='1';
const out=[]; let skipQ=0, dropRare=0, dropRun=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<8) continue;
  const dl=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const dn=dl.map(norm).filter(Boolean); const flat=dn.join('');
  if(dn.length<4) continue;
  const cand=new Map(); let elig=0, matched=0;
  const fr=[];                                        // 逐幀紀錄:有冇庫行、出咗咩孤兒
  for(const f of frames){
    const lines=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(lines.length>=4) continue;
    const rec={t:f.t,lib:0,orph:[],any:0};
    for(const raw of lines){
      if(JUNK.test(raw)) continue;
      if(/[、。，！？：；「」《》（）]/.test(raw)) continue;
      const k=norm(raw);
      if(k.length<6||k.length>22) continue;
      elig++; rec.any++;
      if(flat.includes(k)){matched++;rec.lib++;continue;}
      let ok=true;
      for(const d of dn){ if(Math.abs(d.length-k.length)>3) continue;
        if(lcseq(k,d)>=Math.ceil(k.length*0.8)){ok=false;break;} }
      if(!ok){matched++;rec.lib++;continue;}
      {let bw=0;for(let i=0;i+k.length<=flat.length;i++){const v=lcseq(k,flat.slice(i,i+k.length));if(v>bw)bw=v;if(bw>=k.length)break;}
       if(bw>=Math.ceil(k.length*0.75)){matched++;rec.lib++;continue;}}
      if(garbage(raw)){dropRare++;continue;}          // ① 罕見字 = OCR 亂碼
      rec.orph.push({k,raw});
    }
    if(rec.any) fr.push(rec);
  }
  // ③ 🔴 司儀口白 run 濾網(R2 2026-08-24 晚班加):Live 片嘅講道/司儀口白會連住一大串
  //    「淨係孤兒、一句庫行都冇」嘅幀(實例 #3609 t=148–216 十段、#3441 四段);
  //    真漏行永遠貼住庫行行(run ≤ 3)。run ≥ RUN 嘅整段剔走。
  {
    let i=0;
    while(i<fr.length){
      if(fr[i].lib===0&&fr[i].orph.length){
        let j=i; while(j<fr.length&&fr[j].lib===0&&fr[j].orph.length) j++;
        if(j-i>=RUN){ for(let x=i;x<j;x++){dropRun+=fr[x].orph.length; fr[x].orph=[];} }
        i=j;
      } else i++;
    }
  }
  // ④ ANCHOR 模式(R2 2026-08-24 加):只收「同一幀入面至少有一行對得返庫」嘅孤兒。
  //    庫行本身就係最強嘅上下文錨:證明呢一幀係歌詞幀,唔係字卡/浮水印/口白。
  //    (由 pairscan 借嘅判準,但唔限死「一幀兩行」—— 今日兩單真命中都係一幀三行)
  if(ANCHOR) for(const rec of fr) if(rec.lib===0) rec.orph=[];
  for(const rec of fr) for(const o of rec.orph){
    if(!cand.has(o.k)) cand.set(o.k,{raw:o.raw,ts:[]});
    cand.get(o.k).ts.push(rec.t);
  }
  const q=elig?matched/elig:0;
  let keep=[...cand.values()];
  // 浮水印聚類(沿用 v1)
  {
    const K=keep.map(v=>norm(v.raw));
    const par=K.map((_,i)=>i); const find=x=>par[x]===x?x:(par[x]=find(par[x]));
    for(let i=0;i<K.length;i++)for(let j=i+1;j<K.length;j++){
      const m=Math.max(K[i].length,K[j].length); if(!m) continue;
      if(lcseq(K[i],K[j])>=m*0.5) par[find(i)]=find(j);}
    const grp=new Map(); K.forEach((_,i)=>{const g=find(i);grp.set(g,(grp.get(g)||0)+1)});
    keep=keep.filter((_,i)=>grp.get(find(i))<3);
  }
  // ⑤ 🔴 CantonHymn 粵譯片「粵譯 + 國語原詞」雙層字幕濾網(2026-08-25 R2b 加)。
  //    呢類片每幀都係「上面粵譯(= 庫收咗嗰句)、下面國語原詞(= 庫冇)」,所以國語原詞
  //    每一行都會變孤兒 —— 係粵語分區 gapscan2 最大嘅單一假陽性源(實測 #3580 孤兒9、
  //    #3790 孤兒8、#3782 孤兒5,三首合共 22 條全部係第二層,零真漏行)。
  //    判準要窄:①只喺**認得出係粵譯 cover 嘅片**開(artist=CantonHymn 或者片名寫住粵語版/
  //    粵譯/Cantonese Cover|Demo|Version);②候選要**同幀有一條對得返庫嘅行、長度差 ≤2、
  //    LCS 落喺 0.35–0.8**(同義唔同詞先係平行譯本;差太遠 = 唔關事,差太近 = OCR 重複框)。
  //    ⚠️ 特登唔用「成日一齊出現」做判準 —— #742「祈求主看顧」都係次次同錨一齊出,
  //    會誤殺;亦特登卡死長度差 ≤2,#3012 真陽性「再沒留戀」(4字 vs 錨 7字)就過唔到呢個閘。
  if(/粵語版|粵譯|Cantonese\s*(Cover|Demo|Version)/i.test(r.title||'')||/CantonHymn/i.test(r.artist||'')){
    const anchors=[]; for(const rec of fr) if(rec.lib) for(const raw of []) anchors.push(raw);
    const byT=new Map(); for(const rec of fr) byT.set(rec.t,rec);
    const libAt=t=>{ const rec=byT.get(t); if(!rec) return [];
      const f=frames.find(x=>x.t===t); if(!f) return [];
      return String(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean)
        .map(norm).filter(k=>k.length>=4&&dn.some(d=>Math.abs(d.length-k.length)<=3&&lcseq(k,d)>=Math.ceil(k.length*0.8))); };
    keep=keep.filter(v=>{ const k=norm(v.raw);
      return !v.ts.some(t=>libAt(t).some(a=>Math.abs(a.length-k.length)<=2
        &&(()=>{const L=lcseq(k,a)/Math.max(k.length,a.length); return L>=0.35&&L<=0.8;})()));});
  }
  if(keep.length<MINO) continue;
  if(q<MINQ){skipQ++;continue;}                       // ② 成首 OCR 太爛
  out.push({id:r.id,title:r.title,artist:r.artist,libN:dl.length,n:keep.length,q,
    rows:keep.sort((a,b)=>a.ts[0]-b.ts[0])});
}
out.sort((a,b)=>b.n-a.n);
const SHOW=(process.env.SHOW||'').split(',').filter(Boolean).map(Number);
if(SHOW.length){
  for(const id of SHOW){
    const s0=out.find(x=>x.id===id);
    const r=rows.find(x=>x.id===id);
    console.log(`\n===== #${id} ${r?r.title.slice(0,50):'?'} | ${r?r.artist:''} | dur=${r?r.duration:''}`);
    if(!r) continue;
    console.log('--- 庫:');
    (r.lyrics||'').split('\n').map(x=>x.trim()).filter(Boolean).forEach((l,i)=>console.log(`  ${String(i+1).padStart(2)} ${l}`));
    console.log('--- 孤兒行:');
    if(s0) s0.rows.forEach(v=>console.log(`  t=${v.ts.join(',')} ${v.raw}`));
    else console.log('  (呢首唔喺命中名單)');
  }
  process.exit(0);
}
console.log(`掃 ${rows.length} 首 → 命中 ${out.length} 首(OCR 質素閘擋走 ${skipQ} 首,罕見字濾網剔走 ${dropRare} 行,口白 run 濾網剔走 ${dropRun} 行)`);
for(const s of out.slice(0,Number(process.argv[6]||40)))
  console.log(`${s.id}\t孤兒${s.n}\t庫${s.libN}\tq=${s.q.toFixed(2)}\t${(s.artist||'').slice(0,10)}\t${s.title.slice(0,38)}`);
