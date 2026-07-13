const s=require('sql.js'),fs=require('fs'),{execSync}=require('child_process'),https=require('https');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const gc=yid=>new Promise(r=>{const h=https.get("https://img.youtube.com/vi/"+yid+"/hqdefault.jpg",res=>{res.resume();r(res.statusCode===200)});h.on("error",()=>r(false));h.setTimeout(8000,()=>{h.destroy();r(false)});h.end()});
const gt=yid=>new Promise(r=>{https.get("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v="+yid+"&format=json",res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{try{r(JSON.parse(d).title||"")}catch{r("")}})}).on("error",()=>r(""))});

(async()=>{
const SQL=await s(),buf=fs.readFileSync("hymns.db"),db=new SQL.Database(buf);
const ex=new Set();
const st=db.prepare("SELECT youtube_id FROM hymns");while(st.step())ex.add(st.getAsObject().youtube_id);st.free();
console.log("Existing:",ex.size);

const channels=[
["Hillsong Worship","@HillsongWorship","英文"],["Bethel Music","@bethelmusic","英文"],
["Clay Music","@clay-music","國語"],["Phil Wickham","@philwickham","英文"],
["CityAlight","@cityalight","英文"],["Jesus Image","@JesusImage","英文"],
["Mosaic MSC","@mosaicmsc","英文"],["WorshipTogether","@worshiptogether","英文"],
["ChristianMusic","@christianmusic","英文"],["ROLCCmedia","@ROLCCmedia","國語"],
["W247小羊詩歌","@W247","國語"],["HeavenlyMelody","@heavenlymelody","國語"],
["GraceWu","@gracewu","國語"],["NYC","@nyc","英文"],
["NorthPoint","@northpointworship","英文"],["SoulCity","@soulcityworship","英文"],
["Southland","@southlandworship","英文"],
];

let added=0;let target=250;

for(const[name,handle,lang]of channels){
if(added>=target)break;
let ids;
try{
const raw=execSync('yt-dlp --flat-playlist --playlist-end 25 "'+'https://www.youtube.com/'+handle+'/videos" --get-id 2>/dev/null',{timeout:30,encoding:"utf-8"});
ids=raw.trim().split("\n").filter(s=>s.length===11);
}catch(e){continue;}

for(const yid of ids){
if(added>=target)break;
if(ex.has(yid))continue;

await sleep(300);
const ok=await gc(yid);if(!ok)continue;
const title=await gt(yid);if(!title||title.length<5)continue;
const l=title.toLowerCase();
if(l.includes("playlist")||l.includes("compilation")||l.includes("top " )||l.includes("collection")||l.includes("hour")||l.includes("hits")||l.includes("medley")||l.includes("mix")||l.includes("精選")||l.includes("組曲")||l.includes("熱門")||l.includes("音樂會"))continue;

const ct=title.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|Official|MV|Lyrics|Video|Live|Audio|高清|歌詞|字幕/gi,"").trim().substring(0,80);

db.run("INSERT INTO hymns(title,artist,youtube_id,lang,category) VALUES(?,?,?,?,?)",[ct||title.substring(0,60),name,yid,lang,"詩歌"]);
ex.add(yid);added++;
console.log("  ["+added+"] "+name+" → "+ct.substring(0,30));
}
}
const data=db.export();fs.writeFileSync("hymns.db",Buffer.from(data));
console.log("\nAdded:",added);
})();
