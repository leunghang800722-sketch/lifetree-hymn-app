// 2026-08-23 R2b 粵語雙數線出品。用法見 docs/LYRICS-CATCHUP-LEDGER.md 20:06 收爐行。
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const CJ=/[一-鿿]/g;
const BOOKS=/創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦|提摩太|提多書|腓利門書|希伯來書|雅各書|彼得|約翰[一二三]書|猶大書|啟示錄|賽\d|詩\d|太\d|約\d|羅\d|林[前後]|弗\d|腓\d|來\d|啟\d/;
// argv[3] = 分區 WHERE(預設 R2b 粵語雙數)。R1b 2026-08-24 加,四條線共用唔使改 code。
// R1b 2026-08-24:argv[3] 兩種寫法都收 —— raw SQL,或者同大多數掃描器一致嘅 `lang:parity`(例 國語:0)。
//   舊版淨係收 raw SQL,四條線傳慣嘅 `國語:0` 會被當成 argv[2] 輸出路徑,然後靜靜掃返 default 分區。實測踩過兩次。
const _w=process.argv[3]||"lang='粵語' AND id%2=0";
const _m=/^(國語|粵語|英文|日語):([01])$/.exec(_w);
const WHERE=_m?`lang='${_m[1]}' AND id%2=${_m[2]}`:_w;
const rows=db.prepare(`SELECT id,title,artist,lyrics FROM hymns_all WHERE ${WHERE} AND lyrics_status='verified' AND lyrics IS NOT NULL`).all();
const out=[];
for(const r of rows){
  const bad=[];
  for(const l of (r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean)){
    const n=(l.match(CJ)||[]).length;
    const why=[];
    // R1b 2026-08-24:`（天父）`/`（孩子）`/`（男）` 等係分聲部標記,唔係經文卡
    if(/^[（(](天父|孩子|男|女|合|眾|齊|副歌|和聲)[）)]/.test(l)) continue;
    // `箴言`/`詩篇` 冇跟住章節數字就當普通名詞(例「成為我箴言」「是神美麗的詩篇」)
    if(BOOKS.test(l) && !(/(箴言|詩篇)/.test(l) && !/\d+[:：]\d+/.test(l))) why.push('書卷名');
    // 和合本散文特徵:全形頓號/句號/引號 + 夠長
    // R1b 2026-08-24 放寬:和合本用 `；` 分句好常見,唔一定同時有 `。」』`
    // (實例 #1332 尾巴約 12:24-25 四行淨係有 `，；`,舊 rule 捉唔到)
    if(n>=14 && ((/[、：]/.test(l) && /[。」』]/.test(l)) || /；/.test(l))) why.push('經文散文');
    if(n>=20 && /[，。]/.test(l) && /(我們|你們|他們|耶和華說|神說)/.test(l)) why.push('長散文');
    // R1b 2026-08-24 收緊:淨係「括號開頭 + 夠長」會誤殺一大堆和聲/第二聲部行
    // (實例 #4816「（不論我去哪裡 祢都與我同行）」、#7292「(我們同心宣告…)」)。
    // 要括號入面真係有和合本標點(，。；)或者書卷名先當經文卡。
    if(/^[「『（(]/.test(l) && n>=12 && (/[，。；]/.test(l)||BOOKS.test(l))) why.push('引號開頭長句');
    if(why.length) bad.push({l:l.slice(0,60),why:why.join('/')});
  }
  if(bad.length) out.push({id:r.id,title:r.title,artist:r.artist,bad});
}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首,命中 ${out.length} 首 / ${out.reduce((s,x)=>s+x.bad.length,0)} 行`);
for(const x of out) console.log(`== ${x.id} | ${(x.artist||'').slice(0,10)} | ${x.title.slice(0,28)}\n`+x.bad.map(b=>`   [${b.why}] ${b.l}`).join('\n'));
