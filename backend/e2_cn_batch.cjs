const s=require('sql.js'),fs=require('fs'),{execSync}=require('child_process'),https=require('https');
const gc=yid=>new Promise(r=>{const h=https.get('https://img.youtube.com/vi/'+yid+'/hqdefault.jpg',res=>{res.resume();r(res.statusCode===200)});h.on('error',()=>r(false));h.setTimeout(8000,()=>{h.destroy();r(false)});h.end()});
const gt=yid=>new Promise(r=>{https.get('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v='+yid+'&format=json',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{r(JSON.parse(d).title||'')}catch{r('')}})}).on('error',()=>r(''))});
(async()=>{
const SQL=await s(),buf=fs.readFileSync('hymns.db'),db=new SQL.Database(buf);
const ex=new Set();
const st=db.prepare('SELECT youtube_id FROM hymns');while(st.step())ex.add(st.getAsObject().youtube_id);st.free();
console.log('Existing:',ex.size);
const channels=[
['ROLCC 生命河','@ROLCCmedia','國語'],
['小羊W247','@W247','國語'],
['Heavenly Melody','@heavenlymelody','國語'],
['Grace Wu詩歌','@gracewu','國語'],
['Hillsong UNITED','@hillsongunited','英文'],
['CityAlight','@cityalight','英文'],
['Jesus Image','@JesusImage','英文'],
['Mosaic MSC','@mosaicmsc','英文'],
['Worship Together','@worshiptogether','英文'],
['Soul City Worship','@soulcityworship','英文'],
];
let ad=0;
for(const[n,h,l]of channels){
if(ad>=250)break;let ids;
try{ids=execSync(`yt-dlp --flat-playlist --playlist-end 30 "https://www.youtube.com/${h}/videos" --get-id 2>/dev/null`,{timeout:30,encoding:'utf-8'}).trim().split('\n').filter(s=>s.length===11);}catch(e){console.log(n+' ERR');continue;}
console.log(`${n} (${l}): ${ids.length}`);
for(const y of ids){
if(ad>=250||ex.has(y))continue;
const ok=await gc(y);if(!ok)continue;
const t=await gt(y);if(!t||t.length<5)continue;
const lc=t.toLowerCase();
if(lc.includes('playlist')||lc.includes('hour')||lc.includes('mix')||lc.includes('medley')||lc.includes('精選')||lc.includes('組曲')||lc.includes('音樂會'))continue;
const ct=t.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|Official|MV|Lyrics|Video|Live|Audio|高清|歌詞|字幕/gi,'').trim().substring(0,80);
db.run('INSERT INTO hymns(title,artist,youtube_id,lang,category) VALUES(?,?,?,?,?)',[ct||t.substring(0,60),n,y,l,'詩歌']);
ex.add(y);ad++;if(ad%10===0)console.log('  +'+ad);
await new Promise(r=>setTimeout(r,400));
}
}
const d2=db.export();fs.writeFileSync('hymns.db',Buffer.from(d2));
const st2=db.prepare('SELECT COUNT(*) as c FROM hymns');
console.log('\nAdded:',ad,'Total:',st2.getAsObject().c);
})();
