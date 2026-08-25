import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
// 2026-08-23 R1b 修:掃描器本身完全冇做簡繁/OCR 混淆字正規化,令「没/沒」「悦/悅」
// 「称/祢」「找/我」呢類純字形差異全部變成假候選(實測 top 20 首入面 5 首係 100% 呢種噪音)。
const _S2T=Converter({from:'cn',to:'t'});
// ⚠️ 次序好緊要:一定要 opencc 行先,再收 祢-family。opencc 會將 祢→禰(見 R2 晚班 bug),
// 所以收窄嗰步要行喺後面,一次過把 祢/禰/袮/称/尔 全部拍成「你」。
// 🔴 次序陷阱(實測踩過):唔可以「先 opencc 再收 祢-family」—— opencc 會把「称」當簡體轉做
// 「稱」,個 replace 就永遠揾唔返佢。所以要**收兩次**:opencc 之前收一次(殺 称/袮/尔),
// opencc 之後再收一次(殺 opencc 自己整出嚟嘅 祢→禰,見 R2 晚班同一個 bug)。
const fold=s=>_S2T(String(s).replace(/[祢禰袮称尔妳]/g,'你'))
  .replace(/[祢禰]/g,'你')
  // 2026-08-24 R1:`衪`(U+887A) 係 `祂` 嘅異體字,約書亞/大衛帳幕成批片嘅字幕全部用佢,
  // 唔收埋就令一堆「庫入面其實已經有」嘅行變假候選(#7015 #7333 #6455 #6457 實例)。
  .replace(/妳/g,'你').replace(/[衪祂牠]/g,'他').replace(/找/g,'我').replace(/眞/g,'真').replace(/説/g,'說').replace(/[着著]/g,'著');
const db = new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const CJK=/[一-鿿]/g;
const norm=s=>s.replace(/[^一-鿿A-Za-z0-9]/g,'').toLowerCase();
// 2026-08-23 R1 修:中英夾埋一行嘅字幕(約書亞 Acoustic Live 格式)個 norm key 帶住英文,
// 永遠對唔上庫入面純中文嗰行 → 逐首吐十幾條假候選。加一條淨 CJK 嘅 key 再比一次。
const cjk=s=>s.replace(/[^一-鿿]/g,'');
const BOOKS='創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得|約翰一書|約翰二書|約翰三書|猶大書|啟示錄';
const BAD=new RegExp('('+BOOKS+')|(詞曲|作詞|作曲|編曲|監製|製作|演唱|主唱|和聲|混音|母帶|錄音|吉他|鍵盤|貝斯|導演|攝影|剪接|後期|美術|版權|發行|出品|策劃|統籌|翻譯|填詞|原曲|原唱|中譯|經文|唱片)|(訂閱|頻道|官方|專輯|收錄|奉獻|請勿|翻印|更多歌曲|點選這裡|敬拜讚美)|^［?[閩台]］?|[©℗]|Ministr|Music Min|版[權檬棒橫]所有|廠權所有|調[\/／]曲|詞[\/／]曲|音樂事工|敬拜團|Worship\s*Team');
// 2026-08-23 R1b:片尾 credits roll 係第二大噪音源(#5152 八條候選全部係樂手名單)。
// 「：」/「｜」分隔 + 樂器/職務名 = credits 指紋;歌詞字幕唔會咁排。
const CREDITS=/^[*#＊＃●▲■・]|社團法人|基金會|協會|異象工場|大衛帳幕|admin by|Admin by|Copyright|All Rights|^詞[^曲]|^曲[^詞]|牧師|堂主任|院長|主席|神學院|培訓學院|靈糧堂|浸信會|宣道會|生命樹|使徒性|[：｜]|提琴|中提|大提|弦樂|木管|銅管|長笛|小號|鼓[手組]|打擊|樂手|人聲|企劃|平面|設計|燈光|音控|場務|行道會|浸信會|長老會|Strings|Violin|Cello|Drums|Bass\b|Keys\b/;
function sim(a,b){ if(!a.length||!b.length)return 0;
  const g=s=>{const m=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);m.set(k,(m.get(k)||0)+1);}return m;};
  const A=g(a),B=g(b);let inter=0,na=0,nb=0;
  for(const v of A.values())na+=v; for(const v of B.values())nb+=v;
  for(const [k,v] of A) if(B.has(k)) inter+=Math.min(v,B.get(k));
  return na+nb?2*inter/(na+nb):0;}
// 位置對位相似度:同長度(±1)而且同位置字撞夠多 → 同一句嘅簡體/OCR 變體
function posSim(a,b){
  if(Math.abs(a.length-b.length)>1) return 0;
  const n=Math.min(a.length,b.length); if(n<4) return 0;
  let best=0;
  for(const off of (a.length===b.length?[0]:[0,1,-1])){
    let hit=0;
    for(let i=0;i<n;i++){const j=i+off; if(j>=0&&j<b.length&&a[i]===b[j])hit++;}
    best=Math.max(best,hit/n);
  }
  return best;
}
// 滑動窗相似度:候選係「字幕半行」而庫入面係「成句對仗行」嗰陣,posSim 因為長度差太遠硬回 0。
// 改為喺庫成篇文字度掃同長度嘅窗,攞最高逐字命中率 → 一次過蓋埋「子串包含」同「單字 OCR 錯」。
// v2:改用 LCS 比例。滑動窗版本對「庫入面多咗一隻字」完全冇符 ——
// 「與祢永不分開」vs「與祢永遠不分開」滑動窗只得 0.5(插入令之後全部錯位),LCS 就有 1.0。
function lcsLen(a,b){const m=a.length,n=b.length; if(!m||!n) return 0;
  let prev=new Array(n+1).fill(0), cur=new Array(n+1).fill(0);
  for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]); }
    const t=prev; prev=cur; cur=t; cur.fill(0); }
  return prev[n];}
function winSim(a,b){ if(a.length<4||!b.length) return 0; return lcsLen(a,b)/a.length; }
// 全形標點 = 經文卡/散文卡指紋。歌詞字幕(讚美之泉/約書亞/我心旋律)慣例用空格分句唔用逗號句號。
const PROSE=/[，。；、！？]/;
// R2 2026-08-24 加 argv[3] 分區參數(預設維持 R1b 國語雙數),四條線唔使再改 code。
const _WHERE=process.argv[3]||"lang='國語' AND id%2=0";
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE ${_WHERE} AND lyrics_status='verified' AND lyrics_timeline IS NOT NULL`).all();
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const frames=tl.ocr||[]; if(!frames.length)continue;
  const cnt=new Map();
  // 🔬 2026-08-23 R1b 批4:三種噪音要**整幀**剔,唔可以逐行判 ——
  //  ① 經文卡跨兩幀:第一行(例「但願尊貴榮耀」)冇標點又冇書卷名,逐行判就走甩,
  //     但同幀第二行已經有「提摩太前書一章17節」。
  //  ② 台語/閩南語平行版字幕:標籤 ［閩］ 通常只打喺一組嘅第一行,第二行赤裸,
  //     逐行判會把第二行當國語漏行(#6498 尋見實例)。
  const FRAMEBAD=new RegExp('('+BOOKS+')|［[閩台]］|\\[[閩台]\\]|章\\d+節|\\d+:\\d+-\\d+');
  for(const fr of frames){
    const lines=String(fr.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
    if(lines.some(l=>FRAMEBAD.test(l)||PROSE.test(l))) continue;   // 整幀剔
    const seen=new Set();
    for(const l of lines){
      const k=norm(l); if(!k||seen.has(k))continue; seen.add(k);
      if(!cnt.has(k))cnt.set(k,{txt:l,n:0}); cnt.get(k).n++;
    }
  }
  const cur=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const curN=cur.map(norm).filter(Boolean); const curAll=curN.join('|');
  const curC=cur.map(cjk).filter(Boolean); const curCjkAll=curC.join('|');
  const titleKey=cjk(fold(r.title||''));
  // 🔬 2026-08-23 R1b:whisper 裁判 —— 真.漏行一定係「唱出嚟」嘅,所以就算 whisper 聽錯字,
  // 逐位命中率都會遠高過經文卡/credits/org 浮水印(呢啲根本冇人唱)。呢層一次過殺埋
  // 四類噪音(經文卡、片尾名單、機構浮水印、片頭導言卡),係目前最抵嘅一層。
  const WNOISE=/\[MUSIC\]|MUSIC|詩歌歌曲|詩歌歌詞|歌詞的錄音|字幕|訂閱|感謝收看|請不吝|Amara|明鏡/;
  const whF=(()=>{ let t={}; try{t=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
    // ⚠️ 實測:部分 verified 歌嘅 lyrics_timeline.whisper 唔係 array(舊格式係整段字串),
    //    直接 .map 會即刻拋 TypeError 炸停成個掃描。要分兩種格式處理。
    const raw=t.whisper;
    const segs=Array.isArray(raw)?raw.map(w=>String(w&&w.text||''))
              :(typeof raw==='string'?[raw]:[]);
    const kept=segs.filter(x=>!WNOISE.test(x));
    return cjk(fold([...new Set(kept)].join('')));
  })();
  const whUsable = whF.length>=30;   // whisper 冇真內容 → 唔可以做裁判,唔好一刀切死
  const curF=cur.map(x=>cjk(fold(x))).filter(Boolean);          // 正規化後嘅庫行
  const curFAll=curF.join('');                                   // 唔加分隔符:俾 winSim 掃成篇
  const cands=[];
  for(const [k,v] of cnt){
    if(v.n<2)continue;
    if((v.txt.match(CJK)||[]).length<5)continue;
    if(BAD.test(v.txt))continue;
    if(curAll.includes(k))continue;
    const kc=cjk(v.txt);
    if(kc.length>=4 && curCjkAll.includes(kc))continue;
    let rest=k; for(const c of curN.filter(x=>x.length>=4).sort((a,b)=>b.length-a.length)) rest=rest.split(c).join('');
    if((rest.match(CJK)||[]).length<5)continue;
    let best=0,pbest=0;
    for(const c of curN){const s=sim(k,c); if(s>best)best=s; const p=posSim(k,c); if(p>pbest)pbest=p;}
    for(const c of curC){const s=sim(kc,c); if(s>best)best=s; const p=posSim(kc,c); if(p>pbest)pbest=p;}
    if(best>=0.62||pbest>=0.72)continue;  // 2026-08-23 R1b:posSim 0.45→0.72(0.45 系統性誤殺對仗句,見 R2b 午班 ledger)
    // 2026-08-23 R1b 三層新濾網
    if(PROSE.test(v.txt)) continue;                              // ① 經文卡/散文卡
    if(CREDITS.test(v.txt)) continue;                            // ①b 片尾 credits roll / 講員銜頭
    if(titleKey && cjk(fold(v.txt)).length>=4 && titleKey.includes(cjk(fold(v.txt)))) continue; // ①c 片頭標題卡
    const kf=cjk(fold(v.txt));
    if(kf.length>=4 && winSim(kf,curFAll)>=0.72) continue;       // ② 簡繁+混淆字+半行對成行
    let fbest=0; for(const c of curF){const p=posSim(kf,c); if(p>fbest)fbest=p;}
    if(fbest>=0.72) continue;                                    // ③ 正規化後嘅逐位對位
    // ④ 2026-08-23 R1b:剩低最大宗假陽性 = 「庫入面已有嗰行嘅 OCR 爛字版」
    //    (例:「立恩典沿記號」vs「主恩典的記號」、「必充谱讀美」vs「必充滿讚美」)。
    //    實測呢類全部落喺合併相似度 0.55–0.72;真.漏行(台語段/對白卡)全部 ≤0.35。
    //    所以攞四個量度嘅最大值,喺 0.55 一刀切。寧願放走「同已有行只差一兩隻字」嘅漏行
    //    (本來就低價值),都唔好每首吐兩三條爛字候選。
    const mx=Math.max(best,pbest,fbest,winSim(kf,curFAll));
    if(mx>=0.55) continue;
    const w=whUsable?winSim(kf,whF):-1;
    if(whUsable && w<0.5) continue;                              // ⑤ whisper 裁判
    // ⑥ 爛字比例:同一段歌詞嘅「重度爛字重影幀」(#2258 [46] 吐「觠凳我心靈的豳膀」,
    //    而 [48] 就係同一段嘅清晰版)。特徵係入面有一撮字**成首歌其他地方都冇出現過**。
    if(whUsable){
      const pool=cjk(fold(r.lyrics||''))+whF;
      const junk=[...kf].filter(c=>!pool.includes(c)).length;
      if(junk/kf.length>0.35) continue;
    }
    cands.push({t:v.txt,n:v.n,k,best:+best.toFixed(2),p:+pbest.toFixed(2),mx:+mx.toFixed(2),w:+w.toFixed(2),wNA:!whUsable});
  }
  // 同首歌內互相似 → 浮水印/台徽變體群
  const drop=new Set();
  for(let i=0;i<cands.length;i++){let g=1;for(let j=0;j<cands.length;j++){if(i!==j&&(sim(cands[i].k,cands[j].k)>=0.6||posSim(cands[i].k,cands[j].k)>=0.5))g++;}if(g>=3)drop.add(i);}
  const keep=cands.filter((_,i)=>!drop.has(i));
  if(keep.length) out.push({id:r.id,title:r.title,artist:r.artist,duration:r.duration,curLines:cur.length,c:keep});
}
out.sort((a,b)=>b.c.length-a.c.length);
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首,有候選 ${out.length} 首,候選行 ${out.reduce((s,x)=>s+x.c.length,0)}`);
console.log(out.slice(0,50).map(x=>`${x.id}\t+${x.c.length}\t庫${x.curLines}\t${(x.artist||'').slice(0,10)}\t${x.title.slice(0,40)}`).join('\n'));
