const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const DB_PATH = path.join(__dirname, 'hymns.db');

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  const allStmt = db.prepare('SELECT id, title, artist, youtube_id FROM hymns ORDER BY id');
  const allHymns = [];
  while (allStmt.step()) allHymns.push(allStmt.getAsObject());
  allStmt.free();

  console.log('Total hymns:', allHymns.length);

  const checkCover = (yid) => {
    return new Promise(resolve => {
      const req = https.get(`https://img.youtube.com/vi/${yid}/hqdefault.jpg`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(8000, () => { req.destroy(); resolve(false); });
      req.end();
    });
  };

  const getOembedTitle = (yid) => {
    return new Promise(resolve => {
      https.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yid}&format=json`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data).title || ''); }
          catch(e) { resolve(''); }
        });
      }).on('error', () => resolve(''));
    });
  };

  let fixed = 0;
  let checked = 0;

  for (const hymn of allHymns) {
    if (fixed >= 12) break;

    const coverOK = await checkCover(hymn.youtube_id);
    if (coverOK) continue;

    checked++;
    const searchQuery = `${hymn.title} ${hymn.artist || ''}`.trim();
    console.log(`\n[${checked}] id=${hymn.id} "${hymn.title}" (old=${hymn.youtube_id})`);

    let newId;
    try {
      newId = execSync(`yt-dlp "ytsearch1:${searchQuery.replace(/"/g, '\\"')}" --get-id --no-playlist 2>/dev/null`, 
        { timeout: 15000, encoding: 'utf-8' }).trim();
    } catch(e) {}
    
    if (!newId || newId.length !== 11) {
      console.log('  No result');
      continue;
    }

    const newCoverOK = await checkCover(newId);
    if (!newCoverOK) {
      console.log('  Cover FAIL');
      continue;
    }

    const title = await getOembedTitle(newId);
    const match = (title || '').toLowerCase().includes((hymn.title || '').toLowerCase().substring(0, 6));
    
    if (!match) {
      console.log(`  Title mismatch: "${(title||'').substring(0,40)}"`);
      continue;
    }

    console.log(`  ✅ ${newId} | ${(title||'').substring(0,50)}`);
    db.run('UPDATE hymns SET youtube_id = ? WHERE id = ?', [newId, hymn.id]);
    fixed++;

    await new Promise(r => setTimeout(r, 3000));
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\nDone: ${fixed} new fixes`);
})();
