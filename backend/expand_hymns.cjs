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

  // Artists to expand - search their most popular songs
  const targets = [
    { artist: 'Hillsong Worship', lang: '英文', queries: ['Hillsong Worship top songs', 'Hillsong United worship', 'Hillsong Young Free'] },
    { artist: 'Bethel Music', lang: '英文', queries: ['Bethel Music worship songs', 'Bethel Music popular'] },
    { artist: 'Elevation Worship', lang: '英文', queries: ['Elevation Worship top songs', 'Elevation Worship popular'] },
    { artist: '約書亞樂團', lang: '國語', queries: ['約書亞樂團 敬拜詩歌', '約書亞樂團 熱門詩歌'] },
    { artist: '讚美之泉', lang: '國語', queries: ['讚美之泉 敬拜讚美', '讚美之泉 熱門詩歌'] },
    { artist: '天韻詩歌', lang: '國語', queries: ['天韻詩歌 熱門', '天韻合唱團 詩歌'] },
    { artist: '生命河靈糧堂', lang: '國語', queries: ['生命河靈糧堂 敬拜', '生命河 詩歌'] },
    { artist: 'ACM', lang: '粵語', queries: ['ACM 詩歌 粵語', 'ACM 敬拜'] },
    { artist: '團契遊樂園', lang: '粵語', queries: ['團契遊樂園 詩歌', '團契遊樂園 熱門'] },
    { artist: '基恩敬拜', lang: '粵語', queries: ['基恩敬拜 AGWMM 詩歌', '基恩敬拜 敬拜'] },
    { artist: '玻璃海', lang: '粵語', queries: ['玻璃海樂團 詩歌', '玻璃海 敬拜'] },
    { artist: 'Maverick City', lang: '英文', queries: ['Maverick City Music worship', 'Maverick City top songs'] },
    { artist: 'Chris Tomlin', lang: '英文', queries: ['Chris Tomlin worship songs', 'Chris Tomlin popular'] },
    { artist: 'Kari Jobe', lang: '英文', queries: ['Kari Jobe worship songs', 'Kari Jobe top'] },
    { artist: 'Phil Wickham', lang: '英文', queries: ['Phil Wickham worship', 'Phil Wickham songs'] },
    { artist: 'Passion', lang: '英文', queries: ['Passion conference worship', 'Passion top songs'] },
    { artist: 'Cody Carnes', lang: '英文', queries: ['Cody Carnes worship', 'Cody Carnes songs'] },
    { artist: 'Brandon Lake', lang: '英文', queries: ['Brandon Lake worship', 'Brandon Lake songs'] },
    { artist: 'CeCe Winans', lang: '英文', queries: ['CeCe Winans worship', 'CeCe Winans gospel'] },
    { artist: '小羊詩歌', lang: '國語', queries: ['小羊詩歌 敬拜', '小羊詩歌 熱門'] },
    { artist: '我心旋律', lang: '國語', queries: ['我心旋律 詩歌', '我心旋律 敬拜'] },
  ];

  let added = 0;
  let skipped = 0;
  const remaining_target = 835;

  for (const target of targets) {
    if (added >= remaining_target) break;
    
    for (const query of target.queries) {
      if (added >= remaining_target) break;
      console.log(`\n=== ${target.artist}: "${query}" ===`);

      let ids;
      try {
        const raw = execSync(`yt-dlp "ytsearch10:${query.replace(/"/g,'\\"')}" --get-id --no-playlist 2>/dev/null`, 
          { timeout: 20000, encoding: 'utf-8' });
        ids = raw.trim().split('\n').filter(s => s.length === 11);
      } catch(e) { 
        console.log('  Search failed');
        continue; 
      }

      console.log(`  Found ${ids.length} candidate IDs`);

      for (const yid of ids) {
        if (added >= remaining_target) break;
        
        if (existing.has(yid)) { skipped++; continue; }
        
        const coverOK = await getCover(yid);
        if (!coverOK) continue;

        const title = await getOembed(yid);
        if (!title) continue;

        const simpleTitle = title.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|Official|MV|Lyrics|Video|Live|Audio|高清|中英字幕|歌詞版/gi, '').trim().substring(0, 60);

        db.run('INSERT INTO hymns (title, artist, youtube_id, lang, category) VALUES (?, ?, ?, ?, ?)',
          [simpleTitle || title.substring(0,60), target.artist, yid, target.lang, '詩歌']);

        existing.add(yid);
        added++;
        console.log(`  [${added}] + ${simpleTitle.substring(0,35)} (${target.artist})`);
        
        await sleep(3000); // avoid rate limit
      }
    }
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\nDone: added ${added}, skipped ${skipped} duplicates`);
  console.log(`New total: ~${665 + added}`);
})();
