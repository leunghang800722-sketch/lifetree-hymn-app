// R1 國語單數線 2026-08-25 出品:langproof —— §4 鏡像(英文原唱配中文字幕)零爭議實錘。
//
// 動機:§4 政策一票否決「中文歌配英文歌詞」,鏡像方向(英文原唱 + 中文對照投影)四條線
//   由開線到而家都係**肉眼讀 whisper 再估**,累計十幾首「等拍板」但每條線嘅判準都唔一致。
//   2026-08-25 R1 批1 實測發現一條乾淨到冇得拗嘅數:
//   **whisper unique 段落入面「完全冇 CJK」嘅比例** —— 15 首分區 draft 出咗雙峰分佈:
//   3 首係 100%(#3771 55/55、#3515 74/74、#3535 92/92),其餘 11 首係 0%,**中間零灰色地帶**。
//   原因:whisper 係逐段標語言嘅,英文原唱連司儀口白都會轉錄成英文;中文歌就算 OCR 有英文對照行,
//   whisper 都唔會吐純英文段。所以呢條數量緊 OCR 讀到乜,直接量「把口唱緊乜」。
//
// 🔴 2026-08-25 同日修正:上面條數**單獨用會出大量假陽性**。攞成個國語:1 draft 池(170 首)實測,
//   ≥90% 英文有 32 首,但入面一大堆係**中文內容**(#2169 雲彩般的見證、#7585 約書亞自問自答、
//   #6545 貝斯教室、#2213 歌者心聲)。根因:**whisper 間中行 translate mode**,將中文口白直接
//   譯成英文散文,甚至吐 `[SPEAKING CHINESE]` / `(speaking in foreign language)` 呢類註解。
//   所以一定要加**第二證人**:量「whisper 嘅英文段有幾多 % 喺條片自己嘅 OCR 度搵到」。
//   真英文原唱(投影有英文行)→ 15–100%;translate mode 嘅中文片 → **一律 0%**(實測 5/5)。
//   兩個證人夾埋先算實錘。
//
// ⚠️ 四個已知限制:
//   ① whisper 段數太少(<5)唔可靠 —— 全 [MUSIC]/幻覺片會出假數,所以預設 minSeg=5,唔夠就標 `?`。
//   ② 日文歌會被當「有 CJK」→ 出 0%,睇 `jp=` 欄(平假名/片假名段數)先分得出,唔好淨睇英文%。
//   ③ 中英夾雜嘅現場敬拜(例:英文副歌 + 國語主領)會落喺中間,呢類先要肉眼覆核。
//   ④ 第二證人有一個結構性盲點:**英文原唱但投影淨係打中文**(冇英文對照行)→ OCR 佐證 0%,
//      會被當成 translate mode 剔走。所以 `ocr0%` 嗰批唔係「判咗冇事」,係「工具講唔到」,
//      要肉眼開 whisper 睇係散文定係歌詞。實例 #7159。
//
// 用法: node langproof.mjs [lang:parity] [status=draft] [minSeg=5]
//   例: node langproof.mjs 國語:1            # R1 分區 draft
//       node langproof.mjs 國語:1 verified   # 掃已出街嘅,揾漏網鏡像
//       node langproof.mjs 粵語:0 draft
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [spec='國語:1', status='draft', minSegArg] = process.argv.slice(2);
const [lang, parityRaw] = spec.split(':');
const parity = parityRaw===undefined||parityRaw===''?null:Number(parityRaw);
const minSeg = Number(minSegArg||5);
const CJK=/[一-鿿㐀-䶵]/;
const KANA=/[ぁ-んァ-ヶ]/;
// 🔒 2026-08-25 R1 加:whisper 自己嘅「外語註解」= **單向硬拒閘**。
//   whisper 遇到佢認為唔係主語言嘅唱段/講話,會吐 `(singing in foreign language)` /
//   `[SPEAKING CHINESE]` / `[FOREIGN]`。實測 19 首 A 型候選:5 首有呢啲標記,
//   逐首肉眼覆核 **5/5 全部真係中文原唱**(3 首係「英文副歌 + 中文主歌」混合體)。
//   ⚠️ **單向**:標記=0 唔代表就係英文原唱 —— whisper 全 translate mode 嗰陣一個標記都唔會出
//   (實例 #6589 #6757 #7053 #6307,四首都係中文原唱但零標記)。所以呢個閘只可以用嚟**剔走**。
const TRANSLATE_MARK=/speaking in foreign|speaking chinese|speaking foreign|singing in foreign|foreign language|\[FOREIGN\]/i;
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
const rows=db.prepare("SELECT id,title,artist,duration,lyrics_timeline FROM hymns_all WHERE lang=? AND lyrics_status=? AND lyrics_timeline IS NOT NULL").all(lang,status);
const out=[];
for(const r of rows){
  if(parity!==null && (r.id%2)!==parity) continue;
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const wh=Array.isArray(tl.whisper)?tl.whisper:[];      // 🔴 唔係 array 會斷掃描(08-24 R1 實錄)
  const uniq=[...new Set(wh.map(x=>String(x&&x.text||'').trim()).filter(Boolean))];
  if(!uniq.length) continue;
  const eng=uniq.filter(t=>!CJK.test(t)&&!KANA.test(t)).length;
  const jp =uniq.filter(t=>KANA.test(t)).length;
  const pct=Math.round(eng/uniq.length*100);
  // 第二證人:whisper 嘅英文句喺自己條片 OCR 搵唔搵到
  const ocrHay=clean((tl.ocr||[]).map(f=>f&&f.text).join(' '));
  let cHit=0,cTot=0;
  for(const t of uniq){
    if(CJK.test(t)||KANA.test(t))continue;
    const k=clean(t); if(k.length<12)continue;
    let h=0,n=0; for(let i=0;i+8<=k.length;i+=4){n++;if(ocrHay.includes(k.slice(i,i+8)))h++;}
    if(n>=2){cTot++;if(h/n>=0.5)cHit++;}
  }
  const corr=cTot?Math.round(cHit/cTot*100):-1;
  const mark=uniq.filter(t=>TRANSLATE_MARK.test(t)).length;
  out.push({...r, n:uniq.length, eng, jp, pct, corr, cTot, mark});
}
out.sort((a,b)=>b.pct-a.pct||b.jp-a.jp);
let mirror=0, jpn=0, grey=0, trans=0;
for(const o of out){
  const weak = o.n<minSeg;
  const twoWitness = o.corr>=15 && o.cTot>=3 && o.mark===0;   // mark>0 = 單向硬拒
  let tag='   ';
  if(!weak && o.pct>=90 && twoWitness){tag='🚨 ';mirror++;}
  else if(!weak && o.pct>=90){tag='🔇';trans++;}      // 英文但 OCR 對唔上 / 有外語標記 → 唔係英文原唱
  else if(!weak && o.pct>=25){tag='⚠️ ';grey++;}
  else if(o.jp>=Math.ceil(o.n/2)){tag='🌏 ';jpn++;}
  const c=o.corr<0?' --':String(o.corr).padStart(3)+'%';
  console.log(`${tag}${weak?'?':' '} #${String(o.id).padStart(4)} ${String(o.duration).padStart(5)} wh=${String(o.n).padStart(3)} 英${String(o.eng).padStart(3)}(${String(o.pct).padStart(3)}%) ocr佐證${c}(n=${String(o.cTot).padStart(2)}) 日${String(o.jp).padStart(2)}${o.mark?' 譯註'+o.mark:'    '}  ${o.title.slice(0,40)}`);
}
console.log(`\n掃 ${lang}:${parity===null?'全部':parity} ${status} —— ${out.length} 首有 whisper。`);
console.log(`🚨 §4鏡像實錘(≥90%英文 + OCR 佐證≥15%)=${mirror}   🔇 英文但 OCR 對唔上(多數係 whisper translate mode,要肉眼)=${trans}   ⚠️ 灰色地帶=${grey}   🌏 疑似日語=${jpn}   (\`?\`=whisper 段數 <${minSeg})`);
