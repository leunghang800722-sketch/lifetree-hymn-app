// R1 國語單數線 2026-08-25 出品:「標題卡短行」偵測器 —— introcard 嘅盲點補丁。
//
// 🔴 動機:批2 人手揾到 #5825《煉淨我》庫第 1 行孤零零一句「煉淨我」、
//   #5759《來向耶和華歌唱》庫第 1 行「來向耶和華歌唱」,兩條都係**片頭標題卡**抄咗落庫。
//   但 `introcard` 兩首都捉唔到 —— 因為佢問「呢條庫行喺唔喺片頭之後出現過」,
//   而「煉淨我」係真歌詞行「煉淨我 使我更像祢」嘅**前綴**,子序列一比就當佢中段出現過。
//   即係話:**凡係標題卡嗰句同時又係某句歌詞嘅頭幾個字(詩歌標題十居其九都係),
//   introcard 結構上一定漏。**
//
// 判準(三條全部要成立):
//   ① 庫入面有條短行 X(2–8 個中文字),而庫入面另有一條行 Y 係以 X 開頭(X≠Y);
//   ② X 喺 OCR 幀入面**冇試過獨立成一行**出現喺歌唱段(t 喺頭 MARGIN 秒同尾 MARGIN 秒之間);
//   ③ X 有喺片頭/片尾嘅幀出現過(即係真係有張卡)。
//   → X = 標題卡/浮水印,唔係歌詞。
//
// ⚠️ 已知假陽性型(人手要睇):
//   ⓐ 真係有「單獨唱一句歌名」嘅寫法(refrain 前嗰句 call);睇 whisper 有冇單獨嗰句。
//   ⓑ OCR 讀爛咗個字(實測 #5841「我要一心稱謝祢」俾 OCR 讀成「找要一心稱謝称」)——
//      所以下面 norm 加咗 找→我 fold。
//
// 用法: node ops/lyrics/prefixcard.mjs [lang:parity] [margin=20]
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const pre=s=>String(s).replace(/[祢禰袮称尔袖妳]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖妳]/g,'你').replace(/[裏裡]/g,'里')
  .replace(/[衪祂牠他她它]/g,'他').replace(/[着著]/g,'著').replace(/[找]/g,'我').replace(/[^一-鿿]/g,'');
const [MLANG,MPAR]=(process.argv[2]||'國語:1').split(':');
const MARGIN=Number(process.argv[3]||20);
const CARD=/[©℗]|CCLI|Copyright|版權所有|作詞|作曲|編曲|填詞|[詞词曲調譯译][:：\/／]|收錄於|專[輯辑][:：]/;   // ⚠️ 只認 credit 標記,唔可以放寬到「同幀有英文 / 頻道浮水印」—— 實測放寬會由 4 首變 85 首(天韻/泥土音樂成批片每幀都有 `Official MV` 浮水印)
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all
  WHERE lang=? AND id%2=? AND curated=1 AND lyrics_status='verified'
    AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL`).all(MLANG,Number(MPAR));
let nSong=0,nRow=0;
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const frames=Array.isArray(tl.ocr)?tl.ocr:[];
  if(frames.length<8) continue;
  const last=frames[frames.length-1].t||0;
  // 🐞 常駐 credit 閘:新心音樂事工成批片**每一幀**都印住「詞:…曲:…版權所有」,
  //   咁樣「呢幀係卡」呢個證據就冇咗判別力,首歌第一張歌詞卡(t=14–18)全部會變假陽性
  //   (實測 #1627 #3169 #1941 #3465 四首)。credit 覆蓋率過半 = 常駐,跳過。
  if(frames.filter(f=>CARD.test(String(f.text||''))).length > frames.length*0.5) continue;
  const L=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const N=L.map(norm);
  const bad=[];
  for(let i=0;i<L.length;i++){
    const x=N[i]; if(x.length<2||x.length>8) continue;
    // env ANY=1 關咗條件①(唔要求庫入面有「長版」),用嚟捉「片名卡孤零零一句、
    //   而庫入面根本冇長版」嗰種(#1941 伊甸 / #3963 榮耀 / #7785 平安 呢類 junkscan 孤字)。
    if(!process.env.ANY&&!N.some((y,j)=>j!==i&&y.length>x.length&&y.startsWith(x))) continue;   // ①
    let mid=0; const edge=[];
    for(const f of frames){
      const ls=String(f.text||'').split('\n').map(s=>norm(s)).filter(Boolean);
      if(!ls.includes(x)) continue;                                            // 要獨立成行
      // 🐞 兩層(首轉落國語單數逼出嚟):
      //   ⓐ **中段**只計 MARGIN < t < last−MARGIN,片尾 credits 卡唔可以當中段(否則 #6409 走甩);
      //   ⓑ 一定要有**片頭**佐證先報 —— 尾段 edge 嗰四個命中(#6099 #8279 #8301 #8539)
      //      100% 假陽性,佢哋係真嘅結尾句,啱啱好落喺「尾 MARGIN 秒」。
      if(f.t>MARGIN&&f.t<last-MARGIN) mid++;
      // 🔑 片頭嗰幀要**真係一張卡**先算數(同幀有 credit / 英文歌名 / 版權 / 專輯 / 頻道名)。
      //   冇呢層嘅話,「首歌喺 20 秒前開唱」嗰種(#409 t=12、泥土音樂成批 t=14–20)全部變假陽性
      //   —— ANY 模式實測 164 首,加咗之後先至用得。
      else if(f.t<=MARGIN&&CARD.test(String(f.text||''))) edge.push(f.t);
    }
    if(mid||!edge.length) continue;                                            // ②③
    bad.push({i,x:L[i],edge});
  }
  if(!bad.length) continue; nSong++;
  console.log(`\n#${r.id} ${(r.artist||'').slice(0,10)} | ${r.title.slice(0,40)} [庫${L.length}行 dur ${r.duration}]`);
  for(const b of bad){nRow++;console.log(`   🃏 庫第${b.i+1}行「${b.x}」 只喺片頭/尾幀獨立出現 t=${b.edge.join(',')}`);}
}
console.log(`\n掃 ${rows.length} 首 → 命中 ${nSong} 首 / ${nRow} 行`);
