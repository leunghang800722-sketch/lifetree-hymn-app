// R1b 國語雙數線 2026-08-25 出品 ——「歌名行漏晒」掃描器。
//
// 由來:今日一班捉到嘅三個真陽性入面有兩個係同一個病 ——
//   #326《領我到磐石之上》庫 16 行完全冇「領我到磐石之上」呢句(佢係副歌第一句);
//   #56《有誰能像祢》庫寫住「有誰能」,「像祢」兩個字俾人截咗。
//   兩首嘅共通點:**漏咗嗰句就係歌名本身**。歌名句通常係全首最多人記得嗰句,
//   亦係最多幀出現嗰句,但所有現有掃描器都靠「同幀錨定 / 相似度」,
//   歌名句一漏就冇錨,反而最容易靜靜走甩。
//
// 判準(好簡單,所以精度高):
//   歌名(去晒括號/英文/頻道名之後嘅中文主幹)喺自己條片 OCR 出現 ≥MINF 個唔同幀,
//   而庫嘅歌詞入面**冇任何一行包含得返佢**(用子序列 cover,擋簡繁/祢称差異)→ 報。
//
// ⚠️ 內置兩個必需濾網(冇咗就成堆片名卡噪音):
//   ① 歌名只出現喺頭 15 秒 / 尾 15 秒 → 當片名卡,唔報(#6844 #8632 實測)
//   ② 歌名 <3 個中文字 → 唔報(太易撞)
//   ③ 🏆 **常駐橫額閘(首轉實測最大假陽性源頭,12 個命中入面 4 個靠佢)**:
//      歌名行如果**同其他歌詞行同幀出現**,佢就係屏幕角落嗰條常駐標題橫額,唔係歌詞。
//      真陽性嘅形狀啱啱相反 —— 歌名行**獨佔成幀**(段落之間嗰張 refrain 卡),
//      因為佢係真係唱緊嗰句,個屏幕就淨係得佢。
//      實測:#8544 不停讚美(36 幀全部同「主 我來到 祢的面前」等歌詞行同幀)、
//           #8156 一粒麥子 / #8632 一路靠著祂(中英片,歌名行**冇自己嘅英文對照行** ——
//           呢個係 [[project-lyrics-r1b-2026-08-24-night]] 嗰條「雙語片卡vs唱」判準)、
//           #3476 起來回應出發(同 credit 卡黐埋);
//      而 #1532 耶穌已足夠 11 幀**全部獨佔**,whisper 亦聽到「也足以足夠也足以足夠」= 真 refrain。
//      env `BANNER=1` 可以關咗呢層睇返晒。
//
// 用法: node ops/lyrics/titlemiss.mjs [lang:parity] [minFrames=3]   (env: BANNER=1 關掉常駐橫額閘)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const pre=s=>String(s).replace(/[祢禰袮称尔袖妳]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g,'你').replace(/[裏裡]/g,'里')
  .replace(/[衪祂牠他她它]/g,'他').replace(/[那哪]/g,'那').replace(/[着著]/g,'著')
  .replace(/[的得地]/g,'的').replace(/[^一-鿿]/g,'');
// a 係咪 b 嘅子序列(擋 OCR 中間多咗一兩個字)
const covered=(a,b)=>{let i=0;for(const c of b){if(c===a[i])i++;if(i>=a.length)return true;}return i>=a.length;};
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [MLANG,MPAR]=(process.argv[2]||'國語:0').split(':');
const MINF=Number(process.argv[3]||3);
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND curated=1 AND lyrics_status='verified'
    AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let scanned=0; const out=[];
for(const r of rows){
  // 抽歌名中文主幹:去掉【】()（）[] 內容同英文
  let t=String(r.title||'').replace(/[【\[(（].*?[】\])）]/g,' ').replace(/[|｜\/].*$/,' ');
  const cand=norm(t);
  if(cand.length<3||cand.length>12) continue;
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<5) continue;
  scanned++;
  const lib=(r.lyrics||'').split('\n').map(norm).filter(Boolean);
  if(lib.some(l=>covered(cand,l))) continue;           // 庫有,收工
  const ts=[]; let alone=0, withOther=0;
  for(const f of frames){
    const lines=String(f.text||'').split('\n').map(s=>s.trim()).filter(s=>norm(s).length>=2);
    const hitIdx=lines.findIndex(line=>covered(cand,norm(line)));
    if(hitIdx<0) continue;
    ts.push(f.t);
    // 同幀仲有冇「唔係浮水印/credit」嘅其他中文行?有 = 常駐橫額
    const others=lines.filter((line,i)=>i!==hitIdx && norm(line).length>=4
      && !/[©℗@]|Ministr|Music|Official|Lyric|Worship|www|http|版權|所有|作詞|作曲|編曲|專[輯辑]|收錄|詞[:：\/／]|曲[:：\/／]|English/i.test(line));
    if(others.length) withOther++; else alone++;
  }
  const uniq=[...new Set(ts)];
  if(uniq.length<MINF) continue;
  const last=frames[frames.length-1]?.t||0;
  const mid=uniq.filter(t2=>t2>15&&t2<last-15);
  if(!mid.length) continue;                            // 全部喺頭尾 15 秒 = 片名卡
  if(!process.env.BANNER && withOther>alone) continue;  // 濾網③ 常駐橫額
  out.push({id:r.id,title:r.title,artist:r.artist,cand,uniq,mid,libN:lib.length,alone,withOther});
}
out.sort((a,b)=>b.mid.length-a.mid.length);
console.log(`掃 ${scanned} 首(有歌名主幹+夠幀)→ 命中 ${out.length} 首`);
for(const s of out) console.log(`${s.id}\t中段${s.mid.length}幀/共${s.uniq.length}\t庫${s.libN}\t${(s.artist||'').slice(0,8)}\t${s.title.slice(0,34)}\t「${s.cand}」\tt=${s.mid.slice(0,8).join(',')}`);
