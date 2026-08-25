// R1b 國語雙數線 2026-08-25 出品 —— 「英文孤兒行」掃描器。
// 判準:中英逐行對照嘅歌,如果一句英文行上面唔係中文行(係另一句英文 / 空行 / 段落開頭),
//        就代表當初抄歌詞漏咗佢嘅中文對照行。跟住去**自己條片**嘅 OCR 幀揾返嗰句英文,
//        抽緊貼喺佢上面嗰行中文做候選 —— 同一幀上下相鄰,佐證硬過任何相似度分數。
// 用法:node ops/lyrics/orphanline.mjs <lang>:<parity>      例:國語:0(預設)
//
// 已知三種假陽性(全部係「排版唔係 1:1 交替」),下面 §濾網 已經處理咗前兩種:
//   ① 2×2 區塊排版(中A/中B/英A/英B 一組)—— 同一幀四行齊出,庫其實抄啱
//   ② 1 中對 2 英(一句中文蓋兩句英文)
//   ③ 英文本來就冇中文對照(幀入面淨係得英文)—— 呢種會出「(OCR 揾唔到對照)」,自己肉眼剔
// ⛔ §4 提醒:英文原唱配中文對照嗰批(天韻 Christmas 系列等)雖然一樣會命中,拍板前一律唔好郁。
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [MLANG,MPAR]=(process.argv[2]||'國語:0').split(':');
const isCJK=s=>/[一-鿿]/.test(s);
const isLat=s=>/[A-Za-z]/.test(s)&&!isCJK(s);
const key=s=>s.replace(/[^A-Za-z]/g,'').toLowerCase();
const rows=db.prepare("SELECT id,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND curated=1 AND lyrics_status='verified' AND id%2=? AND lyrics IS NOT NULL").all(MLANG,+MPAR);
let scanned=0,hit=0,lines=0;
for(const r of rows){
  const L=(r.lyrics||'').split('\n');
  const cj=L.filter(isCJK).length, la=L.filter(isLat).length;
  if(la<4||la>cj*1.4||cj>la*2.2) continue;       // 唔係中英逐行對照片
  scanned++;
  // 🐞 R1b 2026-08-25 修:舊版寫死「中文行喺英文行上面」,但天韻 Christmas 系列嗰批
  //    係**英文行喺上、中文對照行喺下**,結果每首嘅行 1 同每段開頭第一句英文都變假孤兒
  //    (實測 #7804/#7806/#7944/#7802/#8032 全部係咁)。而家先數返首歌邊個排版佔多數,
  //    再淨係查嗰一邊嘅鄰行 —— 行為只減唔加。
  let above=0,below=0;
  for(let i=0;i<L.length;i++){
    if(!isLat(L[i])) continue;
    if(i>0&&isCJK(L[i-1])) above++;
    if(i+1<L.length&&isCJK(L[i+1])) below++;
  }
  const cnAfter=below>above;   // true = 英文行喺上、中文對照行喺下
  const orphans=[];
  for(let i=0;i<L.length;i++){
    if(!isLat(L[i])) continue;
    const nb=cnAfter?(L[i+1]!==undefined?L[i+1].trim():''):(L[i-1]!==undefined?L[i-1].trim():'');
    if(nb&&isCJK(nb)) continue;
    orphans.push([i+1,L[i]]);
  }
  if(!orphans.length||orphans.length>3) continue; // >3 = 成段英文,唔係逐行對照
  let tl={}; try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const ocr=Array.isArray(tl.ocr)?tl.ocr:[];
  const out=[];
  for(const [ln,txt] of orphans){
    const k=key(txt).slice(0,20);
    const cands={}; let blocky=0,total=0;
    if(k.length>8) for(const f of ocr){
      const fl=(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
      const j=fl.findIndex(x=>key(x).includes(k));
      if(j<0) continue;
      total++;
      // §濾網:同一幀入面英文行數 > 中文行數 → 2×2 區塊 / 1中對2英,唔好報
      // 只准睇緊貼上面嗰一行:2×2 區塊排版嗰陣英文行上面係另一句英文,自然唔會有候選
      const nbi=cnAfter?j+1:j-1;
      if(nbi>=0&&nbi<fl.length&&isCJK(fl[nbi])) cands[fl[nbi]]=(cands[fl[nbi]]||0)+1; else blocky++;
    }
    const best=Object.entries(cands).sort((a,b)=>b[1]-a[1]);
    if(!best.length){
      if(total&&blocky===total) continue;         // 全部幀都係區塊排版 → 靜靜跳過
      out.push(`   🕳️ 行${ln}「${txt.trim()}」 → (OCR 揾唔到對照,自己開片睇)`);
    } else {
      out.push(`   🕳️ 行${ln}「${txt.trim()}」 → 候選中文行:${best.map(([c,n])=>`「${c}」×${n}`).join(' / ')}`);
    }
  }
  if(!out.length) continue;
  hit++; lines+=out.length;
  console.log(`\n#${r.id} (${r.duration}) ${r.title.slice(0,58)} [中${cj}/英${la}]`);
  out.forEach(x=>console.log(x));
}
console.log(`\n掃 ${scanned} 首中英對照歌,命中 ${hit} 首 / ${lines} 條孤兒行`);
