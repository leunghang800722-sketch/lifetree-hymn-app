import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
const db=new DatabaseSync('/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db',{readOnly:true});
const B='創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳記[上下]?|列王紀[上下]?|歷代志[上下]?|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米書|耶利米哀歌|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多[前後]書|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦[前後]書|提摩太[前後]書|提多書|腓利門書|希伯來書|雅各書|彼得[前後]書|約翰[壹貳參一二三]書|猶大書|啟示錄';
const NUM='[0-9０-９一二三四五六七八九十百零]';
const pats=[
  new RegExp(`^[（(].*(${B}).*[）)]$`),          // （詩篇 27:1） 或 （經文正文——詩篇…）
  new RegExp(`——\\s*(${B})`),                    // ——羅馬書8:38
  new RegExp(`^[一—–-]\\s*(${B})`),               // 一 羅馬書八章37節 一
  new RegExp(`^(${B})\\s*${NUM}[^一-鿿]*$`),      // 詩篇 73:25 / 詩篇103篇
  new RegExp(`^(${B})\\s*${NUM}+[章篇]`),         // 傳道書 1章
  /^[（(]?經文[）)]?[：: ]*$/,
  new RegExp(`^[（(]?經文[）)]?.*(${B})`),
];
const isCite=l=>{const t=l.trim();return pats.some(p=>p.test(t));};
const isProse=l=>{const t=l.trim();const c=t.replace(/[^一-鿿]/g,'').length;
  return (/[，。；！？：、「」『』]/.test(t)&&c>=6)||/——/.test(t)||/^[「『]/.test(t);};
const rows=db.prepare("SELECT id,title,artist,lyrics FROM hymns_all WHERE lang='國語' AND id%2=0 AND lyrics_status='verified' AND lyrics IS NOT NULL").all();
const out=[];
for(const r of rows){
  const lines=(r.lyrics||'').split('\n');
  const idx=lines.map((l,i)=>[i,l]).filter(([i,l])=>isCite(l)).map(([i])=>i);
  if(!idx.length)continue;
  const kill=new Set(idx);
  for(const i of idx){
    for(let j=i-1;j>=0;j--){const t=lines[j].trim(); if(!t)continue; if(isProse(t)||isCite(t))kill.add(j); else break;}
    for(let j=i+1;j<lines.length;j++){const t=lines[j].trim(); if(!t)continue; if(isProse(t)||isCite(t))kill.add(j); else break;}
  }
  const keep=lines.filter((_,i)=>!kill.has(i));
  const removed=lines.filter((_,i)=>kill.has(i)).filter(s=>s.trim());
  const kept=keep.filter(s=>s.trim());
  if(!kept.length)continue;
  out.push({id:r.id,artist:r.artist,title:r.title,kept:kept.length,removed,lyrics:keep.join('\n').replace(/\n{3,}/g,'\n\n').trim()});
}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log('中招',out.length,'首');
const a=Number(process.argv[3]||0),b=Number(process.argv[4]||20);
for(const o of out.slice(a,b)){
  console.log(`--- ${o.id} | ${(o.artist||'').slice(0,8)} | ${o.title.slice(0,26)} | 剩${o.kept}行`);
  for(const l of o.removed) console.log(`   ✂ ${l.slice(0,100)}`);
}
