// R1 國語單數線 2026-08-25 出品 —— `sibbulk.mjs` 嘅收緊版(「兄弟片漏行」低噪音版)。
//
// 🐞 由來 = sibbulk 一個結構性 bug:佢用 `庫行.map(norm).join('|')` 做底本查「庫有冇呢句」,
//   **句與句之間夾住個 '|'**。兄弟片將一句寫成一行、而我哋庫拆成兩行 → 必然報「庫冇」。
//   實測 #5117《讓我尋見祢》報 6 條,6/6 全部已經喺庫(庫「尋求必尋見」+「祈求必應許」
//   兩行,兄弟寫成一行)。呢隻加返 sibproof2 已經驗證過嘅兩層濾網:
//     ⓐ **攤平做一條無分隔字串**再 includes(殺斷行假陽性)
//     ⓑ **同字重組**:候選同某條庫行長度差 ≤2 而且字頻多重集 overlap ≥ len−1 → 當 FP
//        (「讓我的心每天讚頌」vs「讓我的心每天頌讚」呢類)
//   實測候選由 35 首跌到 13 首,真陽性零損失。
//
// ⚠️ 佢**只負責收窄**,唔負責落刀:☑ = 自己條片 OCR 撐、♪ = 自己 whisper 撐,
//   淨係得 ♪ 嘅唔好落刀(whisper 同音字太散)。仲要人手排除三種佢見唔到嘅嘢:
//   ① 經文卡 / 片頭簡介卡(#349 #1011 實測)② 片名/專輯橫額(#8023 #6477)
//   ③ 兄弟其實係組曲/合集片(標題有 組曲 medley 系列 合集 或者 '/' '|' 分隔多個歌名)
//
// 用法: node ops/lyrics/sibgap.mjs '[[me,sib],[me,sib],...]'
import { DatabaseSync } from 'node:sqlite';
import { Converter } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/opencc-js/dist/esm/full.js';
const S2T=Converter({from:'cn',to:'t'});
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const pre=s=>String(s).replace(/[祢禰袮称尔袖妳你]/g,'你');
const norm=s=>S2T(pre(s)).replace(/[祢禰袮称尔袖妳你]/g,'你').replace(/[衪祂牠他她它]/g,'他').replace(/[裏裡]/g,'里').replace(/[着著]/g,'著').replace(/[沈沉]/g,'沉').replace(/[^一-鿿]/g,'');
const bag=s=>{const m=new Map();for(const c of s)m.set(c,(m.get(c)||0)+1);return m;};
const overlap=(a,b)=>{let n=0;for(const [k,v] of a)n+=Math.min(v,b.get(k)||0);return n;};
const pairs=JSON.parse(process.argv[2]);
for(const [me,sib] of pairs){
 const A=db.prepare('select id,title,duration,lyrics,lyrics_timeline from hymns_all where id=?').get(me);
 const B=db.prepare('select id,title,lyrics from hymns_all where id=?').get(sib);
 const aLines=A.lyrics.split('\n').map(s=>s.trim()).filter(Boolean);
 const aFlat=aLines.map(norm).join('');            // ⓐ 攤平,殺斷行假陽性
 const aBags=aLines.map(l=>({k:norm(l),b:bag(norm(l))}));
 const tl=A.lyrics_timeline?JSON.parse(A.lyrics_timeline):{};
 const ocrLines=[]; for(const f of (Array.isArray(tl.ocr)?tl.ocr:[])) for(const l of String(f.text||'').split('\n')) { const k=norm(l); if(k.length>2) ocrLines.push(k); }
 const ocrTxt=ocrLines.join('|');
 const whTxt=(Array.isArray(tl.whisper)?tl.whisper:[]).map(w=>norm(w.text||'')).join('|');
 const hits=[];
 for(const l of B.lyrics.split('\n').map(s=>s.trim()).filter(Boolean)){
   const k=norm(l); if(k.length<5) continue;
   if(aFlat.includes(k)) continue;                                  // ⓐ
   const kb=bag(k);
   if(aBags.some(x=>Math.abs(x.k.length-k.length)<=2 && overlap(kb,x.b)>=k.length-1)) continue;  // ⓑ 同字重組
   const inO=ocrTxt.includes(k), inW=whTxt.includes(k);
   if(!inO&&!inW) continue;
   if(inO && ocrLines.some(o=>o===k && aFlat.includes(k))) continue;
   hits.push((inO?'☑':'  ')+(inW?'♪':' ')+' '+l);
 }
 if(!hits.length) continue;
 console.log(`██ #${me}(${aLines.length}行) ← #${sib}  ${A.title.slice(0,40)} (${A.duration})`);
 for(const h of hits) console.log('   '+h);
}
