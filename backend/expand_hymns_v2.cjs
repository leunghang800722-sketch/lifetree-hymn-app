const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const DB_PATH = path.join(__dirname, 'hymns.db');

const getCover = (yid) => new Promise(resolve => {
  const req = https.get(`https://img.youtube.com/vi/${yid}/hqdefault.jpg`, (res) => {
    res.resume(); resolve(res.statusCode === 200);
  });
  req.on('error', () => resolve(false));
  req.setTimeout(8000, () => { req.destroy(); resolve(false); });
  req.end();
});

const getOembed = (yid) => new Promise(resolve => {
  https.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yid}&format=json`, (res) => {
    let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d).title||'')}catch{resolve('')}});
  }).on('error',()=>resolve(''));
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Get existing yt_ids for dedup
  const existing = new Set();
  const st = db.prepare('SELECT youtube_id FROM hymns');
  while (st.step()) existing.add(st.getAsObject().youtube_id);
  st.free();
  console.log('Existing unique IDs:', existing.size);

  // Popular worship songs to search - curated list
  const targetSongs = [
    // English worship songs
    { title: 'Way Maker', artist: 'Sinach', lang: '英文' },
    { title: '10,000 Reasons', artist: 'Matt Redman', lang: '英文' },
    { title: 'Good Good Father', artist: 'Chris Tomlin', lang: '英文' },
    { title: 'What A Beautiful Name', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Oceans', artist: 'Hillsong United', lang: '英文' },
    { title: 'Reckless Love', artist: 'Cory Asbury', lang: '英文' },
    { title: 'Great Are You Lord', artist: 'All Sons Daughters', lang: '英文' },
    { title: 'So Will I', artist: 'Hillsong United', lang: '英文' },
    { title: 'Who You Say I Am', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Living Hope', artist: 'Phil Wickham', lang: '英文' },
    { title: 'Graves Into Gardens', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Jireh', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Build My Life', artist: 'Passion', lang: '英文' },
    { title: 'Do It Again', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Raise A Hallelujah', artist: 'Bethel Music', lang: '英文' },
    { title: 'I Thank God', artist: 'Maverick City', lang: '英文' },
    { title: 'Rattle', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Trust In God', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Firm Foundation', artist: 'Cody Carnes', lang: '英文' },
    { title: 'Holy Forever', artist: 'Chris Tomlin', lang: '英文' },
    { title: 'The Blessing', artist: 'Kari Jobe', lang: '英文' },
    { title: 'King of Kings', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Yet Not I But Through Christ In Me', artist: 'CityAlight', lang: '英文' },
    { title: 'How Great Is Our God', artist: 'Chris Tomlin', lang: '英文' },
    { title: 'Amazing Grace', artist: 'Chris Tomlin', lang: '英文' },
    { title: 'Mighty To Save', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'In Christ Alone', artist: 'Passion', lang: '英文' },
    { title: 'Cornerstone', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Hosanna', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Shout To The Lord', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Bless The Lord Oh My Soul', artist: 'Hillsong Worship', lang: '英文' },
    { title: 'Glorious Day', artist: 'Passion', lang: '英文' },
    { title: 'Resurrecting', artist: 'Elevation Worship', lang: '英文' },
    { title: 'No Longer Slaves', artist: 'Bethel Music', lang: '英文' },
    { title: 'Just Be Held', artist: 'Casting Crowns', lang: '英文' },
    { title: 'Nobody', artist: 'Casting Crowns', lang: '英文' },
    { title: 'See A Victory', artist: 'Elevation Worship', lang: '英文' },
    { title: 'I Speak Jesus', artist: 'Passion', lang: '英文' },
    { title: 'Praise', artist: 'Elevation Worship', lang: '英文' },
    { title: 'Same God', artist: 'Elevation Worship', lang: '英文' },
    
    // Chinese worship songs
    { title: '恩典太美麗', artist: 'ACM', lang: '粵語' },
    { title: '這一生最美的祝福', artist: '讚美之泉', lang: '國語' },
    { title: '我要向高山舉目', artist: '讚美之泉', lang: '國語' },
    { title: '耶穌愛我', artist: '讚美之泉', lang: '國語' },
    { title: '深深的愛', artist: '讚美之泉', lang: '國語' },
    { title: '親眼看見你', artist: '約書亞樂團', lang: '國語' },
    { title: '你坐著為王', artist: '生命河靈糧堂', lang: '國語' },
    { title: '如鷹展翅上騰', artist: '生命河靈糧堂', lang: '國語' },
    { title: '從天而降', artist: '約書亞樂團', lang: '國語' },
    { title: '找到我自己', artist: '約書亞樂團', lang: '國語' },
    { title: '天父的花園', artist: '讚美之泉', lang: '國語' },
    { title: '活著為要敬拜你', artist: '生命河靈糧堂', lang: '國語' },
    { title: '神羔羊', artist: '約書亞樂團', lang: '國語' },
    { title: '滿有能力', artist: '讚美之泉', lang: '國語' },
    { title: '醫治我', artist: '讚美之泉', lang: '國語' },
    { title: '寶貴十架', artist: '讚美之泉', lang: '國語' },
    { title: '復興聖潔', artist: '讚美之泉', lang: '國語' },
    { title: '更深經歷你', artist: '讚美之泉', lang: '國語' },
    { title: '我要歌頌你', artist: '讚美之泉', lang: '國語' },
    { title: '大能拯救', artist: 'Hillsong', lang: '國語' },
    { title: '我心堅定於你', artist: '約書亞樂團', lang: '國語' },
    { title: '我高舉雙手', artist: '讚美之泉', lang: '國語' },
    { title: '我的心你要稱頌耶和華', artist: '約書亞樂團', lang: '國語' },
    { title: '一生愛你', artist: '讚美之泉', lang: '國語' },
    { title: '我要歡唱', artist: '讚美之泉', lang: '國語' },
    { title: '榮耀的呼召', artist: '約書亞樂團', lang: '國語' },
    { title: '你愛永不變', artist: '讚美之泉', lang: '國語' },
    { title: '觸摸到你', artist: '約書亞樂團', lang: '國語' },
    { title: '我們愛因為神先愛', artist: '約書亞樂團', lang: '國語' },
    { title: '井水湧上來', artist: '讚美之泉', lang: '國語' },
    
    // More Cantonese
    { title: '讓我愛', artist: '角聲使團', lang: '粵語' },
    { title: '主信實無變', artist: '角聲使團', lang: '粵語' },
    { title: '只因愛', artist: '角聲使團', lang: '粵語' },
    { title: '全然為你', artist: '角聲使團', lang: '粵語' },
    { title: '傾聽我的心', artist: '角聲使團', lang: '粵語' },
    { title: '最美好... 這刻', artist: '角聲使團', lang: '粵語' },
    { title: '是祢配得', artist: '角聲使團', lang: '粵語' },
    { title: '我們一起禱告吧', artist: 'ACM', lang: '粵語' },
    { title: '請堅固我', artist: '基恩敬拜', lang: '粵語' },
    { title: '陪我渡過', artist: '基恩敬拜', lang: '粵語' },
    { title: '再次站起來', artist: '基恩敬拜', lang: '粵語' },
    { title: '有祢同行', artist: '基恩敬拜', lang: '粵語' },
    { title: '普天頌讚', artist: '基恩敬拜', lang: '粵語' },
    { title: '信心的等待', artist: '基恩敬拜', lang: '粵語' },
    { title: '耶和華是愛', artist: 'ACM', lang: '粵語' },
    { title: '齊唱新歌', artist: 'ACM', lang: '粵語' },
    { title: '願我屈膝你跟前', artist: '團契遊樂園', lang: '粵語' },
    { title: '一生不變', artist: '團契遊樂園', lang: '粵語' },
    { title: '深深愛祢', artist: '玻璃海', lang: '粵語' },
    { title: '進入聖所', artist: '玻璃海', lang: '粵語' },
    { title: '投靠', artist: '玻璃海', lang: '粵語' },
    { title: '平安', artist: '玻璃海', lang: '粵語' },
    { title: '再次飛翔', artist: '玻璃海', lang: '粵語' },
  ];

  let added = 0;
  let failed = 0;
  let dups = 0;

  for (const song of targetSongs) {
    if (added >= 200) break;
    
    const query = `${song.title} ${song.artist} official`.trim();
    console.log(`\nSearching: ${query}`);

    let yid;
    try {
      yid = execSync(`yt-dlp "ytsearch1:${query.replace(/"/g,'\\"')}" --get-id --no-playlist 2>/dev/null`, 
        { timeout: 15000, encoding: 'utf-8' }).trim();
    } catch(e) { 
      failed++;
      console.log(`  Search failed`);
      await sleep(2000);
      continue; 
    }

    if (!yid || yid.length !== 11) { failed++; console.log(`  Invalid ID`); await sleep(2000); continue; }
    if (existing.has(yid)) { dups++; console.log(`  Duplicate`); await sleep(1500); continue; }

    const coverOK = await getCover(yid);
    if (!coverOK) { failed++; console.log(`  Cover 404`); await sleep(2000); continue; }

    const title = await getOembed(yid);
    const titleLower = (title || '').toLowerCase();
    const songLower = song.title.toLowerCase();
    
    if (!titleLower.includes(songLower.substring(0, 6))) {
      failed++;
      console.log(`  Title mismatch: "${(title||'').substring(0,40)}"`);
      await sleep(2000);
      continue;
    }

    // Clean title for storage
    const cleanTitle = title.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|Official|MV|Lyrics|Video|Live|Audio|高清|中英字幕|歌詞版|歌詞|字幕/gi, '').trim().substring(0, 80);

    db.run('INSERT INTO hymns (title, artist, youtube_id, lang, category) VALUES (?, ?, ?, ?, ?)',
      [cleanTitle || song.title, song.artist, yid, song.lang, '詩歌']);

    existing.add(yid);
    added++;
    console.log(`  ✅ [${added}] ${cleanTitle.substring(0,35)} → ${yid}`);
    
    await sleep(3000);
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\n========================================`);
  console.log(`Added: ${added}`);
  console.log(`Duplicates: ${dups}`);
  console.log(`Failed: ${failed}`);
  console.log(`New total: ~${665 + added}`);
  console.log(`========================================`);
})();
