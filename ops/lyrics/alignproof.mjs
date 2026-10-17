// R1b 國語雙數線 2026-08-24 出品。
// 「OCR 幀時間 × whisper 時間對齊」零爭議判準:餵 id + 一句歌詞,吐出
//   ① 該句喺自己 OCR 出現嘅幀時間  ② 自己 whisper LCS 命中嘅時間
// 兩邊時間對得住(±3秒)= 真係唱;OCR 有但 whisper 冇 = 字幕/字卡殘留。
// 用法:node ops/lyrics/alignproof.mjs <id> "<一句歌詞>" [<id> "<句>" ...]
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>String(s).replace(/[祢禰袮称妳你]/g,'你').replace(/[衪祂牠]/g,'他').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
function lcs(a,b){if(!a||!b)return 0;let best=0;const dp=new Array(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){let prev=0;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=a[i-1]===b[j-1]?prev+1:0;if(dp[j]>best)best=dp[j];prev=t;}}return best;}
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
  const id=Number(args[i]), line=args[i+1]; const k=norm(line);
  const r=db.prepare('select title,duration,lyrics_timeline from hymns_all where id=?').get(id);
  if(!r){console.log(`#${id} 冇呢首`);continue}
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  const ocrT=(tl.ocr||[]).filter(f=>String(f.text).split('\n').some(x=>norm(x).includes(k))).map(f=>f.t);
  const Wraw=(Array.isArray(tl.whisper)?tl.whisper:[]);
  const W=Wraw.map(w=>({t:Math.round(w.t0),n:norm(w.text)}));
  // 🔴 R1b 2026-08-24:好多歌 whisper 成條 timeline 都係 [MUSIC](ASR 完全失敗),
  //    嗰陣「whisper 冇命中」**唔代表冇唱**,只係佢做唔到裁判。一定要先驗 whisper 本身有冇用。
  const usable=W.filter(w=>w.n.length>=4).length;
  // 🔑 R1b 2026-08-24 第二層校準:whisper 段數夠唔代表聽得準。
  //    攞「庫入面已有嘅行」做對照題 —— whisper 連現有行都對唔中,就冇資格判新行。
  //    (實例 #6490 帶我重回天父懷抱:OCR 四幀 + 兄弟片 #6472 都有,但 whisper 最高 lcs 得 1。)
  const known=(db.prepare('select lyrics from hymns_all where id=?').get(id).lyrics||'')
    .split('\n').map(norm).filter(x=>x.length>=6);
  let hitKnown=0;
  for(const kl of known){const need2=Math.max(4,Math.ceil(kl.length*0.5));
    if(W.some(w=>lcs(kl,w.n)>=need2)) hitKnown++;}
  const recall = known.length? hitKnown/known.length : 0;
  const whisperDead = usable<3 || (known.length>=4 && recall<0.34);
  // 門檻:whisper 爛得好緊要,用 0.5 比例(最少 4 字)先至捉到
  const need=Math.max(4,Math.ceil(k.length*0.5));
  const scored=W.map(w=>({t:w.t,l:lcs(k,w.n),n:w.n})).sort((a,b)=>b.l-a.l);
  const whT=scored.filter(w=>w.l>=need).map(w=>w.t);
  const best=scored[0];
  // 對齊:每個 OCR 幀時間,揾有冇 whisper 命中喺 ±4 秒內
  const aligned=ocrT.filter(t=>whT.some(w=>Math.abs(w-t)<=4));
  const verdict = whisperDead ? `⚪ whisper 判唔到(可用段 ${usable}/${Wraw.length};對現有 ${known.length} 行嘅 recall ${(recall*100).toFixed(0)}%)—— 要另揾證據`
                : aligned.length>=2 ? '✅唱(多點對齊)' : aligned.length===1 ? '🟡唱(單點對齊)'
                : (whT.length>=2 ? '🟡唱(whisper有OCR對唔上)' : ocrT.length? '⛔ 疑似字幕/字卡殘留(OCR有whisper冇)' : '—OCR冇');
  console.log(`#${id} 「${line}」 (${r.duration})`);
  console.log(`   OCR t=${JSON.stringify(ocrT.slice(0,10))}  whisper t=${JSON.stringify(whT.slice(0,10))} (門檻 ${need}/${k.length}, 最高 lcs=${best?best.l:'-'} @t=${best?best.t:'-'}; whisper 對現有 ${known.length} 行 recall ${(recall*100).toFixed(0)}%)  對齊=${aligned.length}  → ${verdict}`);
}
