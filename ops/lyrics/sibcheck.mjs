import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称你]/g,'你').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const [me,sib]=process.argv.slice(2).map(Number);
const A=db.prepare('select id,title,artist,duration,lyrics,lyrics_timeline from hymns_all where id=?').get(me);
const B=db.prepare('select id,title,artist,duration,lyrics from hymns_all where id=?').get(sib);
// 2026-08-25 R1:draft 歌 lyrics 係 null,以前會直接 TypeError crash。用 draft 做第一參數係合法用法
// (「我未有歌詞,睇下兄弟片啱唔啱」),所以只 guard 唔好報錯。
if(!A){console.error('搵唔到 #'+me);process.exit(1);}
if(!B){console.error('搵唔到 #'+sib);process.exit(1);}
if(B.lyrics==null){console.error('#'+sib+' 冇歌詞(唔係 verified?),做唔到兄弟片比對');process.exit(1);}
const aLines=(A.lyrics||'').split('\n').map(s=>s.trim()).filter(Boolean);
const bLines=B.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
const aAll=aLines.map(norm).join('|');
const tl=A.lyrics_timeline?JSON.parse(A.lyrics_timeline):{};
const ocrTxt=(tl.ocr||[]).map(f=>norm(f.text)).join('|');
const whTxt=(tl.whisper||[]).map(w=>norm(w.text||'')).join('|');
console.log(`### 我 #${A.id} ${A.title} (${A.duration}) ${aLines.length}行 | OCR ${(tl.ocr||[]).length}幀 whisper ${(tl.whisper||[]).length}段`);
console.log(`### 兄 #${B.id} ${B.title} (${B.duration}) ${bLines.length}行`);
console.log('--- 我嘅歌詞 ---'); aLines.forEach((l,i)=>console.log((i+1)+'\t'+l));
console.log('--- 兄弟有、我冇嘅行 (☑=我自己OCR有 / ♪=我whisper有) ---');
for(const l of bLines){ const k=norm(l); if(!k||k.length<3) continue; if(aAll.includes(k)) continue;
  const inO=ocrTxt.includes(k), inW=whTxt.includes(k);
  console.log((inO?'☑':'  ')+(inW?'♪':' ')+' '+l); }
