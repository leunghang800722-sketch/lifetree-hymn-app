// 🆕 R1 2026-08-24:「兩層字幕只抄一層」掃描器(照 R2b 2026-08-23 記低嘅型態砌)。
// 型態:一幀 OCR 有兩層(上／下),入庫嗰陣只抄咗一層,漏咗嗰層通常好短(2–6 CJK),
// 所以會俾反查掃描器嘅 `>=5 CJK` + `n>=2` 濾網剷走 —— 結構上兩隻現有掃描器都捉唔到。
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const _S2T=Converter({from:'cn',to:'t'});
const fold=s=>_S2T(String(s).replace(/[祢禰袮称尔妳]/g,'你')).replace(/[祢禰妳]/g,'你').replace(/[衪祂牠]/g,'他').replace(/找/g,'我').replace(/眞/g,'真').replace(/説/g,'說').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著');
const cjk=s=>s.replace(/[^一-鿿]/g,'');
const F=s=>cjk(fold(s));
const BOOKS='創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得|約翰一書|約翰二書|約翰三書|猶大書|啟示錄';
const BAD=new RegExp('('+BOOKS+')|(詞曲|作詞|作曲|編曲|監製|製作|演唱|主唱|和聲|混音|母帶|錄音|吉他|鍵盤|貝斯|導演|攝影|剪接|後期|美術|版權|發行|出品|策劃|統籌|翻譯|填詞|原曲|原唱|中譯|粵譯|經文|唱片|專輯|收錄|影視|中心|事工|敬拜團)|(訂閱|頻道|官方|奉獻|請勿|翻印|更多歌曲)|[©℗：｜:]|[，。；、！？]|Ministr|版[權檬棒橫]所有');
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// R1b 2026-08-24:argv[3] 兩種寫法都收 —— raw SQL,或者同大多數掃描器一致嘅 `lang:parity`(例 國語:0)。
//   舊版淨係收 raw SQL,四條線傳慣嘅 `國語:0` 會被當成 argv[2] 輸出路徑,然後靜靜掃返 default 分區。實測踩過兩次。
// 🔴 R2 2026-08-24 晚班修:第三次踩同一個坑 —— argv[2] 一直係**輸出路徑**,四條線傳慣嘅
//   `node xxx.mjs 粵語:1` 會令 argv[2]="粵語:1" 變咗檔名(repo root 真係積咗
//   `粵語:1` / `國語:1` / `lang='粵語' AND id%2=1` 三個 junk 檔),而 argv[3] 冇值 →
//   **靜靜掃返 default 嘅 R1 國語單數分區**,出嚟嘅結果全部唔係你分區嘅歌。
//   而家 argv[2] 撞正 `<lang>:<parity>` 就自動當佢係 filter,輸出改寫去 scratch。
const _LP=/^([^:\/]{1,6}語|英文|兒童):([01])$/;
if(_LP.test(process.argv[2]||'')){
  process.argv[4]=process.argv[3];             // 舊 argv[3](minRun)順延
  process.argv[3]=process.argv[2];
  process.argv[2]='/tmp/'+process.argv[1].split('/').pop().replace(/\.mjs$/,'')+'-out.json';
}
const _w=process.argv[3]||"lang='國語' AND id%2=1";
const _m=/^(國語|粵語|英文|日語):([01])$/.exec(_w);
const WHERE=_m?`lang='${_m[1]}' AND id%2=${_m[2]}`:_w;
const rows=db.prepare(`SELECT id,title,artist,lyrics,lyrics_timeline FROM hymns_all WHERE ${WHERE} AND lyrics_status='verified' AND lyrics_timeline IS NOT NULL`).all();
const out=[];
for(const r of rows){
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){continue}
  const frames=tl.ocr||[];if(!frames.length)continue;
  const curF=(r.lyrics||'').split('\n').map(F).filter(Boolean);
  const curSet=new Set(curF); const curAll=curF.join('');
  if(curAll.length<20)continue;
  const titleKey=F(r.title||'');
  const hits=new Map();
  for(const f of frames){
    const lines=String(f.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
    if(lines.length<2)continue;
    const kk=lines.map(F);
    // 呢幀入面有冇任何一行 100% 命中庫?(即係「有一層抄咗」)
    const matched=kk.map(k=>k.length>=4&&curSet.has(k));
    if(!matched.some(Boolean))continue;
    for(let i=0;i<lines.length;i++){
      if(matched[i])continue;
      const k=kk[i];
      if(k.length<2||k.length>6)continue;                    // 漏咗嗰層特徵:短
      if(curAll.includes(k))continue;                        // 庫入面其實有
      if(titleKey&&titleKey.includes(k))continue;
      if(BAD.test(lines[i]))continue;
      if(/[A-Za-z]/.test(lines[i])&&cjk(lines[i]).length<2)continue;
      const key=k;
      if(!hits.has(key))hits.set(key,{txt:lines[i],n:0,t:f.t,near:[]});
      const h=hits.get(key);h.n++;
      if(h.near.length<2){const nb=lines.filter((_,j)=>j!==i&&matched[j]); if(nb.length)h.near.push(nb[0]);}
    }
  }
  const cands=[...hits.values()].filter(h=>h.n>=2);
  if(!cands.length)continue;
  // 同一首歌吐超過 6 條 = 多數係浮水印/裝飾層,唔係漏行
  if(cands.length>6)continue;
  out.push({id:r.id,title:r.title,artist:r.artist,curLines:curF.length,c:cands});
}
out.sort((a,b)=>b.c.length-a.c.length);
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首,候選 ${out.length} 首 / ${out.reduce((s,x)=>s+x.c.length,0)} 行`);
console.log(out.slice(0,45).map(x=>`${x.id}\t${x.c.length}\t庫${x.curLines}\t${(x.artist||'').slice(0,7)}\t${x.title.slice(0,26)}\t|| `+x.c.map(c=>`「${c.txt}」x${c.n}(同幀:${c.near[0]||'-'})`).join(' ; ')).join('\n'));
