// 2026-08-23 R2b 粵語雙數線出品。用法見 docs/LYRICS-CATCHUP-LEDGER.md 20:06 收爐行。
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
// argv[3] = 分區 WHERE(預設 R2b 粵語雙數)。R1b 2026-08-24 加。
// R1b 2026-08-24:argv[3] 兩種寫法都收 —— raw SQL,或者同大多數掃描器一致嘅 `lang:parity`(例 國語:0)。
//   舊版淨係收 raw SQL,四條線傳慣嘅 `國語:0` 會被當成 argv[2] 輸出路徑,然後靜靜掃返 default 分區。實測踩過兩次。
const _w=process.argv[3]||"lang='粵語' AND id%2=0";
const _m=/^(國語|粵語|英文|日語):([01])$/.exec(_w);
const WHERE=_m?`lang='${_m[1]}' AND id%2=${_m[2]}`:_w;
const rows=db.prepare(`SELECT id,title,artist,duration,lyrics FROM hymns_all WHERE ${WHERE} AND lyrics_status='verified' AND lyrics IS NOT NULL`).all();
const CJ=/[一-鿿]/g;
// opencc to:'t' 會把一大批「本來就係繁體」嘅字再擴成異體(一對多),要剔走,
// 否則 842 首入面 632 首中招、當中 3938 個係「祢→禰」。
// R1b 2026-08-24 加:唇脣 / 床牀 / 弦絃 / 仿彷 / 佛彿 亦係 opencc 一對多假陽性
// R2 2026-08-24 加:念唸 / 致緻 / 蒙矇 / 霉黴 —— 粵語單數分區 6 個「簡體」警報 100% 係呢四個字,
//   「默念」「景致」「蒙蔽」「發霉」全部係正規繁體寫法,同 祢→禰 完全同一個機制。
// R1b 2026-08-24 再加:欲仆晒划征克伙袜痴向 —— 國語雙數分區 11 個「簡體」警報 **100%** 係呢十個字,
//   全部係本身就存在嘅正體字(欲望/前仆後繼/撐晒你/我划我主掌舵/征戰/克制/做伙/袜離開/痴狂/向明天),
//   opencc s2t 將佢哋當成簡體對應字先報。同上面四個字一樣,加白名單。
const OK_TRAD=new Set([...'祢困群了吃托托才升秘峰里出准凶暗孤字台斗于后面制余表冲唇床弦仿佛背采回只吓念致蒙霉欲仆晒划征克伙袜痴向range'.replace('range','')]);
// R1b 2026-08-24:日文歌(有假名)嘅新字體唔係簡體,整首跳過
const KANA=/[ぁ-んァ-ヶ]/;
const TIME=/^\d{1,2}:\d{2}(:\d{2})?$/;
const out=[];
for(const r of rows){
  if(KANA.test(r.lyrics||'')) continue;
  const lines=(r.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const bad=[];
  for(const l of lines){
    const n=(l.match(CJ)||[]).length;
    const t=S2T(l);
    const reasons=[];
    const diff=[...l].filter((c,i)=>t[i]!==c&&!OK_TRAD.has(c));
    if(t.length===l.length&&diff.length) reasons.push('簡體:'+diff.join(''));
    if(TIME.test(l)) reasons.push('時間碼');
    if(n>0&&n<=2&&l.length<=3) reasons.push('孤字');
    if(/[a-zA-Z]/.test(l)&&n>0&&n<3&&l.length<6) reasons.push('雜訊');
    if(reasons.length) bad.push({l,why:reasons.join('/')});
  }
  if(bad.length) out.push({id:r.id,title:r.title,artist:r.artist,duration:r.duration,n:lines.length,bad});
}
out.sort((a,b)=>b.bad.length-a.bad.length);
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(`掃 ${rows.length} 首 verified,有問題 ${out.length} 首 / 問題行 ${out.reduce((s,x)=>s+x.bad.length,0)}`);
console.log(out.slice(0,40).map(x=>`${x.id}\t${x.bad.length}/${x.n}\t${(x.artist||'').slice(0,10)}\t${x.title.slice(0,30)}`).join('\n'));
