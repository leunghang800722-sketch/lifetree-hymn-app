const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const DB_PATH = path.join(__dirname, 'hymns.db');
const BATCH_SIZE = 300; // how many new songs to add
const SEARCHES_PER_QUERY = 20; // videos per search

const getCover = (yid) => new Promise(resolve => {
  const req = https.get(`https://img.youtube.com/vi/${yid}/hqdefault.jpg`, (res) => {
    res.resume(); resolve(res.statusCode === 200);
  });
  req.on('error', () => resolve(false));
  req.setTimeout(8000, () => { req.destroy(); resolve(false); });
  req.end();
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Get existing yt_ids
  const existing = new Set();
  const st = db.prepare('SELECT youtube_id FROM hymns');
  while (st.step()) existing.add(st.getAsObject().youtube_id);
  st.free();
  console.log('Existing:', existing.size);

  // Broad search queries that hit different types of worship music
  const queries = [
    { q: 'worship songs 2025 Christian', lang: '英文', cat: '詩歌' },
    { q: 'best praise and worship songs', lang: '英文', cat: '詩歌' },
    { q: 'gospel worship songs', lang: '英文', cat: '詩歌' },
    { q: 'Hillsong Worship songs', lang: '英文', cat: '詩歌' },
    { q: 'Bethel Music songs', lang: '英文', cat: '詩歌' },
    { q: 'Elevation Worship songs', lang: '英文', cat: '詩歌' },
    { q: 'Chris Tomlin worship', lang: '英文', cat: '詩歌' },
    { q: 'Passion worship songs', lang: '英文', cat: '詩歌' },
    { q: '讚美之泉 敬拜讚美 2025', lang: '國語', cat: '詩歌' },
    { q: '約書亞樂團 敬拜 詩歌', lang: '國語', cat: '詩歌' },
    { q: '生命河靈糧堂 敬拜詩歌', lang: '國語', cat: '詩歌' },
    { q: '天韻詩歌 敬拜', lang: '國語', cat: '詩歌' },
    { q: '小羊詩歌 敬拜', lang: '國語', cat: '詩歌' },
    { q: '我心旋律 詩歌', lang: '國語', cat: '詩歌' },
    { q: 'ACM 粵語詩歌', lang: '粵語', cat: '詩歌' },
    { q: '基恩敬拜 AGWMM 詩歌', lang: '粵語', cat: '詩歌' },
    { q: '團契遊樂園 詩歌', lang: '粵語', cat: '詩歌' },
    { q: '玻璃海樂團 敬拜', lang: '粵語', cat: '詩歌' },
    { q: '角聲使團 詩歌', lang: '粵語', cat: '詩歌' },
  ];

  let added = 0;
  let searched = 0;
  let total_candidates = 0;

  for (const query of queries) {
    if (added >= BATCH_SIZE) break;
    
    console.log(`\n=== ${query.q} ===`);
    
    let ids;
    try {
      const raw = execSync(`yt-dlp "ytsearch${SEARCHES_PER_QUERY}:${query.q.replace(/"/g,'\\"')}" --get-id 2>/dev/null`, 
        { timeout: 30000, encoding: 'utf-8' });
      ids = raw.trim().split('\n').filter(s => s.length === 11);
    } catch(e) { 
      console.log(`  Error: ${e.message.substring(0,40)}`);
      await sleep(2000);
      continue; 
    }

    total_candidates += ids.length;
    console.log(`  ${ids.length} candidates`);

    for (const yid of ids) {
      if (added >= BATCH_SIZE) break;
      if (existing.has(yid)) continue;

      const coverOK = await getCover(yid);
      if (!coverOK) { searched++; continue; }

      // Get oembed title
      let title;
      try {
        title = await new Promise(resolve => {
          https.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yid}&format=json`, (res) => {
            let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d).title||'')}catch{resolve('')}});
          }).on('error',()=>resolve(''));
        });
      } catch(e) { title = ''; }

      if (!title || title.length < 5) { searched++; continue; }

      // Check if it's a playlist/compilation (skip those)
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('playlist') || lowerTitle.includes('compilation') || 
          lowerTitle.includes('top') || lowerTitle.includes('best') || 
          lowerTitle.includes('collection') || lowerTitle.includes('hour') || 
          lowerTitle.includes('hits') || lowerTitle.includes('medley') ||
          lowerTitle.includes('mix') || lowerTitle.includes('non stop') ||
          lowerTitle.includes('最熱門') || lowerTitle.includes('精選')) {
        searched++;
        continue;
      }

      const cleanTitle = title.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|\/[^\/]*\/|Official|MV|Lyrics|Video|Live|Audio|高清|中英字幕|歌詞版|歌詞|字幕/gi, '').trim().substring(0, 80);

      db.run('INSERT INTO hymns (title, artist, youtube_id, lang, category) VALUES (?, ?, ?, ?, ?)',
        [cleanTitle || 'Unknown', query.q.split(' ')[0], yid, query.lang, query.cat]);

      existing.add(yid);
      added++;
      console.log(`  [${added}] ${cleanTitle.substring(0,40)}`);

      await sleep(1500); // shorter delay
    }
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\n========================================`);
  console.log(`Added: ${added}`);
  console.log(`Total candidates found: ${total_candidates}`);
  console.log(`Searched (failed cover/title): ${searched}`);
  console.log(`New total: ~${708 + added}`);
  console.log(`========================================`);
})();
