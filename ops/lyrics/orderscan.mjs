// R2 粵語單數線 2026-08-24 出品:「庫入面相鄰兩行次序倒轉」偵測器。
// 動機:今班 #3443、R2b #3440、R1 #8389 三個同型實例 —— 呢個病任何「漏行/截短」掃描器都撈唔到,
//   因為兩行都喺庫入面、字都啱,錯嘅淨係次序。
// 做法:對庫每一對相鄰行 (A,B),喺自己 OCR 揾兩者**首次出現**嘅幀時間;
//   如果 B 首次出現明顯早過 A(>=4 秒),而且兩邊都至少兩幀 → 報。
// 用法: node orderscan.mjs [lang:parity]
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s).replace(/[称袮尔]/g,'你')).replace(/[祢禰袮称袖妳]/g,'你').replace(/[衪祂牠]/g,'他').replace(/[裏裡]/g,'里').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND id%2=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let n=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<6) continue;
  const dl=r.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
  // 每行喺 OCR 出現嘅幀時間(整行包含即算,行長 >=5 先計免得短行亂撞)
  const ts=dl.map(l=>{const k=norm(l); if(k.length<5) return null;
    const out=[]; for(const f of frames){ for(const o of String(f.text||'').split('\n')){ if(norm(o).includes(k)){out.push(f.t);break;} } }
    return out.length?out:null;});
  const hits=[];
  for(let i=0;i+1<dl.length;i++){
    const A=ts[i],B=ts[i+1];
    if(!A||!B||A.length<2||B.length<2) continue;
    // 🔴 v2:唔可以用「首見時間」—— 副歌行會喺前面出現過,令任何跟喺佢後面嘅行都變假陽性(實測 133 首)。
    // 改用「相鄰螢幕配對」:只計時間差 <=12 秒(即係前後幀)嘅 (a,b) 對,要**全部**都係 b 早過 a 先報。
    // 🔴 R2 2026-08-24 v3 加「重複行」濾網:庫入面出現多過一次嘅行,timestamp 歸屬含糊 ——
    // 實例 #3577 庫有兩句「白白賜恩，根本不配有」(L11 同 L13),掃描器將 L13 配到 L11 嗰個
    // t=64,睇落好似 L13 早過 L12,其實庫次序完全正確。兩行任何一行係重複行就跳過。
    const dupA=dl.filter(x=>x===dl[i]).length>1, dupB=dl.filter(x=>x===dl[i+1]).length>1;
    if(dupA||dupB) continue;
    // 🔴 R2 2026-08-24 v4:相鄰配對要限制「同一轉」—— 投影片型片(領唱版/歌詞版)同一段副歌
    // 播三轉,唔同轉之間嘅兩幀可以差 6–8 秒入到 12 秒窗(實例 #3411 將第三轉嘅 t=218 配到
    // 第二轉嘅 t=210)。做法 = 兩幀之間唔准夾住任何第三張唔同內容嘅幀。
    const allT=[...new Set(frames.map(f=>Number(f.t)))].sort((x,y)=>x-y);
    const between=(x,y)=>{const lo=Math.min(x,y),hi=Math.max(x,y);
      return allT.some(t=>t>lo&&t<hi&&!A.includes(t)&&!B.includes(t));};
    // ⚠️ 一定要「先用全部配對過 every(d<0),再用同轉配對數做加閘」。
    // 如果直接喺配對階段濾走跨轉配對,一個**正數** delta 俾濾走之後 every(d<0) 會由 false 變 true
    // —— 個濾網會**新增**假陽性(實測粵語雙數由 7 升到 8)。濾網只准減,唔准加。
    const all=[]; for(const a of A) for(const b of B) if(Math.abs(a-b)<=12) all.push({d:b-a,same:!between(a,b)});
    const pairs=all.filter(x=>x.same).map(x=>x.d);
    if(!(all.length>=2 && all.every(x=>x.d<0) && pairs.length>=2)) continue;
    // 🔴 R1b 2026-08-24 v5「最近鄰不對稱」加閘(只減唔加):上面個 12 秒窗喺行距 13–15 秒嘅片
    // 會**淨係收到反方向嗰對** —— 真嘅 (a→b) 差 14 秒入唔到窗,而跨句嘅 (b→前一個 a) 啱啱 12 秒
    // 入到窗,於是 every(d<0) 假成立。實例 #7028 勝過一切(A=46,104,234,260,286 / B=60,118,248,274,300,
    // 明明每次都係 A 早 14 秒)同 #5286 我的心你要稱頌耶和華(A 喺 B 前後都出現)。
    // 判準:對每一個 b,睇「最近嘅後面 A」要**明顯**近過「最近嘅前面 A」(<0.6 倍)先當 B 真係行先。
    const strict=B.every(b=>{
      const after=A.filter(a=>a>b), before=A.filter(a=>a<b);
      const dA=after.length?Math.min(...after)-b:Infinity;
      const dB=before.length?b-Math.max(...before):Infinity;
      return dA < dB*0.6;});
    if(!strict) continue;
    hits.push({i,A,B,pairs});
  }
  if(!hits.length) continue; n++;
  console.log(`\n#${r.id} (${r.duration}) ${(r.artist||'').slice(0,12)} | ${r.title.slice(0,40)}`);
  for(const h of hits)
    console.log(`   🔀 庫[${h.i}]「${dl[h.i]}」 OCR t=${h.A.join(',')} (${h.A.length}幀)\n      庫[${h.i+1}]「${dl[h.i+1]}」 OCR t=${h.B.join(',')} (${h.B.length}幀)  ← 相鄰配對 ${h.pairs.length} 對,後行平均早 ${Math.round(-h.pairs.reduce((a,b)=>a+b,0)/h.pairs.length)} 秒`);
}
console.log(`\n掃 ${rows.length} 首,次序可疑 ${n} 首`);
