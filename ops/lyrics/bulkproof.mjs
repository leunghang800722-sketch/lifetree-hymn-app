// R2 粵語單數線 2026-08-24 出品。R1b 2026-08-24 加 argv[2] 分區參數(預設維持 R2 粵語單數)。
// 兄弟片候選 × 自己 OCR 幀「原文包含」硬佐證(bulk 版)
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称袖妳]/g,'你').replace(/[裏裡]/g,'里').replace(/[衪祂牠她妳他它]/g,'你').replace(/[那哪]/g,'那').replace(/[的得地]/g,'的').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const all=db.prepare("SELECT id,lang,title,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lyrics_status='verified' AND lyrics IS NOT NULL").all();
const info=new Map(); const idx=new Map();
for(const r of all){const set=new Set((r.lyrics||'').split('\n').map(norm).filter(k=>k.length>=6));
 if(set.size<3)continue; info.set(r.id,{...r,set}); for(const k of set){if(!idx.has(k))idx.set(k,[]);idx.get(k).push(r.id);}}
const [MLANG,MPAR]=(process.argv[2]||'粵語:1').split(':');
const mine=all.filter(r=>r.lang===MLANG&&r.id%2===Number(MPAR)&&info.has(r.id));
let n=0;
for(const r of mine){
  const me=info.get(r.id); const flat=norm(r.lyrics);
  let tl={};try{tl=JSON.parse(r.lyrics_timeline||'{}')}catch(e){}
  // R1b 2026-08-24 修:舊版 n=norm(整幀) 會將唔同行黐成一條 string,
  //   令「跨行拼接」出假命中(實例 #2336 萬福源頭 5/5 全部係 credits+歌詞疊幀拼出嚟)。
  //   而家改成 lines[] 逐行比,要一整行原文包含先算。
  // R1b 2026-08-24 再加兩層濾網(實測假陽性最大兩個源頭):
  //  ① 片頭/片尾字卡:t<12 或 t>片長-15,而且同幀有 credits 字樣 → 唔可以做佐證
  //     (實例 #5296/#4998/#6584/#1336/#6420/#300,兄弟片真係唱嗰句,我隻片只係字卡有)
  //  ② 和合本經文卡:同幀出現 ≥2 個全形句讀(。：；、)→ 降權跳過
  //     (實例 #850 主禱文,唱版同和合本卡版同時存在,卡版會撞中兄弟片嘅和合本式行)
    // 🔴 R2b 2026-08-24 晚班加:片頭標題卡走漏 —— #1794 t=2 `CHRISTLAN MUSIC GATHERING ⏐ 當我已無力祈禱 ⏐ COvERED BY 阿修 ⏐ 曲./麥溶思` 用 `曲.` `調琴/` 而唔係 `曲:`,
  //   舊 regex 全部接唔到,結果攞歌名卡當「漏行」硬佐證。加埋 `曲[.．/／]` / `調琴` / `COVERED BY` / `MUSIC GATHERING` / `音樂事工`。
  const CREDITS=/收錄|專輯|詞[:：]|曲[:：]|曲[.．\/／]|調琴|詞曲|作詞|作曲|主唱|演唱|版權|經文摘編|編曲|音樂事工|Copyright|COPYRIGHT|©|Ministries|COVERED BY|COvERED BY|MUSIC GATHERING/i;
  const durSec=(()=>{const m=String(r.duration||'').match(/^(\d+):(\d+)$/);return m?(+m[1]*60+ +m[2]):null})();
  const frames=(tl.ocr||[]).map(f=>{const raw=String(f.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const joined=raw.join(' ');
    // R1b 2026-08-24 二次收緊:credits 字樣唔止喺頭尾出現(實例 #7930 t=120/280 `祢的名何其美 ⏐ 經文摘編:葉薇心`),
    //   所以同幀有 credits 就一律唔做佐證,唔再限時間。
    const isCard=CREDITS.test(joined);
    const isScrip=((joined.match(/[。：；、]/g)||[]).length>=2);
    return {t:f.t,raw,lines:raw.map(norm),bad:isCard||isScrip};}).filter(f=>!f.bad);
  if(!frames.length) continue;
  const cnt=new Map();
  for(const k of me.set) for(const o of (idx.get(k)||[])) if(o!==r.id) cnt.set(o,(cnt.get(o)||0)+1);
  const seen=new Set(); const rows=[];
  for(const [o,shared] of cnt){ if(shared<4) continue;
    for(const l of (info.get(o).lyrics||'').split('\n')){
      const k=norm(l); if(k.length<6||flat.includes(k)||seen.has(k))continue;
      const hits=frames.filter(f=>f.lines.some(x=>x.includes(k)));
      if(hits.length<1) continue; seen.add(k);
      rows.push(`   ➕[${hits.length}幀] 「${l.trim()}」 ← #${o}  ${hits.slice(0,2).map(h=>`[${h.t}] ${h.raw.join(' ⏐ ').slice(0,60)}`).join(' ;; ')}`);
    }}
  if(!rows.length) continue; n++;
  console.log(`\n#${r.id} (${r.duration}) ${r.title.slice(0,44)}  [庫 ${r.lyrics.split('\n').filter(s=>s.trim()).length} 行 / OCR ${frames.length} 幀]`);
  console.log(rows.join('\n'));
}
console.log('\n有硬佐證嘅歌:'+n);
