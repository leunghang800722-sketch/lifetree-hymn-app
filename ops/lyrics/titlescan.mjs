// R1b 國語雙數線 2026-08-24 出品。
// 捉「歌詞欄殘留咗片名/版本標記/專輯資訊」—— 例:第一行係「展開清晨的翅膀 [Pop版]」。
// 用法:node ops/lyrics/titlescan.mjs "<lang>:<parity>"
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const [MLANG,MPAR]=(process.argv[2]||'國語:0').split(':');
const rows=db.prepare("SELECT id,title,lang,lyrics FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all()
  .filter(r=>r.lang===MLANG&&r.id%Number(2)===Number(MPAR));
const norm=s=>String(s).replace(/[\s　]/g,'');
// 片名核心:去走【】()（）[]｜| 之後嘅主體
const core=t=>norm(String(t).replace(/[【】\[\]()（）｜|].*$/,''));
let n=0;
for(const r of rows){
  const lines=r.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!lines.length) continue;
  const hits=[];
  const c=core(r.title);
  lines.forEach((l,i)=>{
    const nl=norm(l);
    // ① 版本/媒體標記
    if(/[\[(（【][^)\]）】]{0,12}(版|Live|live|LIVE|Acoustic|MV|Official|官方|演奏|純音樂|伴奏)[^)\]）】]{0,12}[\])）】]/.test(l)) hits.push(`[${i}] 版本標記: ${l}`);
    // ② 專輯 / 版權 / 詞曲 credits
    else if(/^(專輯|收錄|詞曲|作詞|作曲|編曲|主唱|演唱|歌手|版權|Copyright|COPYRIGHT|©)/.test(l)) hits.push(`[${i}] credits: ${l}`);
    // ③ 第一/最後一行完全等於片名核心
    else if((i===0||i===lines.length-1)&&c.length>=3&&nl===c) hits.push(`[${i}] 等於片名: ${l}`);
    // ④ 含 YouTube 式全形括號片名殘留
    else if(/[【】]/.test(l)) hits.push(`[${i}] 片名括號: ${l}`);
  });
  if(!hits.length) continue; n++;
  console.log(`\n#${r.id} ${r.title.slice(0,50)}  [庫 ${lines.length} 行]`);
  hits.forEach(h=>console.log('   '+h));
}
console.log('\n命中:'+n+' / 掃 '+rows.length);
