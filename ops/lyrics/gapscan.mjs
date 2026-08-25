// R1 2026-08-24:「整首抄唔齊」偵測器。動機 = #7339 福爾摩沙(50→73)俾 reverse-scan 六層濾網
// 全部濾走,但係 sectionscan 只捉到 3 行。做法唔睇單行,睇**成首嘅乾淨孤兒行總數**。
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
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<8) continue;
  const dl=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const dn=dl.map(norm).filter(Boolean); const flat=dn.join('');
  if(dn.length<4) continue;
  const cand=new Map();
  for(const f of frames){
    for(const raw of String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean)){
      if(JUNK.test(raw)) continue;
      if(/[、。，！？：；「」《》（）]/.test(raw)) continue;
      if(String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean).length>=4) continue;
      const k=norm(raw);
      if(k.length<6||k.length>22) continue;          // 乾淨歌詞行嘅長度區間
      if(flat.includes(k)) continue;
      // 同庫任何一行有 ≥80% 字元對得上 → 當庫已經有(OCR 爛字/A′)
      let ok=true;
      for(const d of dn){ if(Math.abs(d.length-k.length)>3) continue;
        if(lcseq(k,d)>=Math.ceil(k.length*0.8)){ok=false;break;} }
      if(!ok) continue;
      // 🔴 OCR 爛字濾網:同庫全文做同長度滑動窗字元對齊,≥75% 就當「庫已經有,只係 OCR 讀爛」
      //    (實例 #5927 `充滿找充滿找` vs 庫 `充滿我 來充滿我`、`我需要称` vs `我需要祢`)
      {let bw=0;for(let i=0;i+k.length<=flat.length;i++){const v=lcseq(k,flat.slice(i,i+k.length));if(v>bw)bw=v;if(bw>=k.length)break;}
       if(bw>=Math.ceil(k.length*0.75)) continue;}
      if(!cand.has(k)) cand.set(k,{raw,ts:[]});
      cand.get(k).ts.push(f.t);
    }
  }
  let keep=[...cand.values()];
  // 🔴 浮水印聚類(R1 2026-08-24 加):同一個英文浮水印每幀 OCR 出唔同亂碼(實例 #7553
  //    `Torching Heaven on Bended Knees` → `雙縣脆下米烘腩买众` 等 33 種寫法)。
  //    做法:孤兒行之間兩兩比 lcseq/maxlen ≥0.5,同一組 ≥3 條 → 成組當浮水印剔走。
  {
    const K=keep.map(v=>norm(v.raw));
    const par=K.map((_,i)=>i); const find=x=>par[x]===x?x:(par[x]=find(par[x]));
    for(let i=0;i<K.length;i++)for(let j=i+1;j<K.length;j++){
      const m=Math.max(K[i].length,K[j].length); if(!m) continue;
      if(lcseq(K[i],K[j])>=m*0.5) par[find(i)]=find(j);}
    const grp=new Map(); K.forEach((_,i)=>{const g=find(i);grp.set(g,(grp.get(g)||0)+1)});
    keep=keep.filter((_,i)=>grp.get(find(i))<3);
  }
  if(keep.length<4) continue;
  out.push({id:r.id,title:r.title,artist:r.artist,libN:dl.length,n:keep.length,
    rows:keep.sort((a,b)=>a.ts[0]-b.ts[0])});
}
out.sort((a,b)=>b.n-a.n);
console.log(`掃 ${rows.length} 首,孤兒行 ≥4 嘅有 ${out.length} 首`);
for(const s of out.slice(0,Number(process.argv[3]||25)))
  console.log(`${s.id}\t孤兒${s.n}\t庫${s.libN}\t${(s.artist||'').slice(0,10)}\t${s.title.slice(0,40)}`);
