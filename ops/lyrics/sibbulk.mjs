import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const norm=s=>S2T(String(s)).replace(/[祢禰袮称你祂他]/g,'你').replace(/[裏裡]/g,'里').replace(/[沈沉]/g,'沉').replace(/[綑捆]/g,'捆').replace(/[依倚]/g,'依').replace(/[度渡]/g,'度').replace(/[紮扎]/g,'扎').replace(/[着著]/g,'著').replace(/[^一-鿿]/g,'');
const pairs=JSON.parse(process.argv[2]);
for(const [me,sib] of pairs){
 const A=db.prepare('select id,title,duration,lyrics,lyrics_timeline from hymns_all where id=?').get(me);
 const B=db.prepare('select id,title,duration,lyrics from hymns_all where id=?').get(sib);
 const aAll=A.lyrics.split('\n').map(norm).join('|');
 const tl=A.lyrics_timeline?JSON.parse(A.lyrics_timeline):{};
 const ocrTxt=(Array.isArray(tl.ocr)?tl.ocr:[]).map(f=>norm(f.text)).join('|');
 const whTxt=(Array.isArray(tl.whisper)?tl.whisper:[]).map(w=>norm(w.text||'')).join('|');
 const hits=[];
 for(const l of B.lyrics.split('\n').map(s=>s.trim()).filter(Boolean)){
   const k=norm(l); if(k.length<3||aAll.includes(k))continue;
   const inO=ocrTxt.includes(k), inW=whTxt.includes(k);
   hits.push((inO?'☑':'  ')+(inW?'♪':' ')+' '+l);
 }
 const conf=hits.filter(h=>h[0]==='☑'||h[1]==='♪').length;
 if(!conf) { console.log(`—— #${me} ← #${sib}  ${A.title.slice(0,24)}  :佐證 0 條,跳過`); continue; }
 console.log(`██ #${me}(${A.lyrics.split('\n').filter(s=>s.trim()).length}行) ← #${sib}  ${A.title.slice(0,34)} (${A.duration})`);
 hits.forEach(h=>console.log('   '+h));
}
