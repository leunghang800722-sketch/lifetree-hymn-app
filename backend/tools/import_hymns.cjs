#!/usr/bin/env node
/**
 * import_hymns.js — 將爬取嘅 JSON 檔案匯入 hymns.db
 *
 * 用法：
 *   node tools/import_hymns.js                           # 匯入 tools/ 所有 JSON
 *   node tools/import_hymns.js tools/UCxxx_zh-cn.json    # 匯入指定檔案
 *   node tools/import_hymns.js --dedup                    # 匯入並去重
 *   node tools/import_hymns.js --backup                   # 先備份再匯入
 */

const path = require('path');
const fs = require('fs');
const DB_PATH = path.join(__dirname, '..', 'hymns.db');

try {
  var initSqlJs = require('sql.js');
} catch (e) {
  console.error('❌ sql.js not found. Run: npm install sql.js');
  process.exit(1);
}

async function main() {
  const SQL = await initSqlJs();
  const args = process.argv.slice(2);
  let imported = [];
  let existingCount = 0;

  // Determine source files
  let jsonFiles = [];
  if (args.length > 0 && !args[0].startsWith('--')) {
    jsonFiles = args.filter(a => !a.startsWith('--'));
  } else {
    jsonFiles = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.json') && f.startsWith('UC'))
      .map(f => path.join(__dirname, f));
  }

  if (jsonFiles.length === 0) {
    console.log('❌ 找不到 JSON 檔案。先執行:');
    console.log('   export YOUTUBE_API_KEY="xxx"');
    console.log('   node tools/batch_scrape.js');
    process.exit(1);
  }

  const doBackup = args.includes('--backup');
  const doDedup = args.includes('--dedup');

  // Backup
  if (doBackup && fs.existsSync(DB_PATH)) {
    const backupPath = DB_PATH + '.backup-' + Date.now();
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`💾 已備份: ${path.basename(backupPath)}`);
  }

  // Load DB
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db = buf ? new SQL.Database(buf) : new SQL.Database();

  // Ensure hymns table exists
  db.run(`CREATE TABLE IF NOT EXISTS hymns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT,
    category TEXT DEFAULT '詩歌',
    youtube_id TEXT NOT NULL,
    duration TEXT,
    lyrics TEXT,
    title_en TEXT DEFAULT '',
    album TEXT DEFAULT '',
    lang TEXT DEFAULT '粵語',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Get existing youtube_ids to avoid duplicates
  const existingStmt = db.prepare("SELECT youtube_id FROM hymns");
  const existingIds = new Set();
  while (existingStmt.step()) {
    existingIds.add(existingStmt.getAsObject().youtube_id);
  }
  existingStmt.free();
  existingCount = existingIds.size;

  console.log(`\n📋 當前資料庫: ${existingCount} 首`);
  console.log(`📥 準備匯入 ${jsonFiles.length} 個檔案...\n`);

  // Import each file
  for (const file of jsonFiles) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let fileImported = 0;
    let fileSkipped = 0;

    let fileLang = '國語';

    for (const hymn of data) {
      if (!hymn.youtube_id || !hymn.title) continue;

      // Use language from JSON data, fallback to filename detection
      fileLang = hymn.language || ({
        'zh-yue': '粵語', 'zh-cn': '國語', 'en': '英文'
      })[path.basename(file).match(/_(zh-yue|zh-cn|en)\./)?.[1]] || '國語';

      // Dedup by youtube_id
      if (existingIds.has(hymn.youtube_id)) {
        if (doDedup) fileSkipped++;
        continue;
      }

      // Clean title (remove emoji, [ ] brackets etc)
      const cleanTitle = hymn.title
        .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf\-\–\—\.\,\!\?\&\'\\/\(\)【】「」\（\）]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);

      if (!cleanTitle) continue;

      try {
        db.run(
          "INSERT INTO hymns (title, artist, youtube_id, lang, category) VALUES (?, ?, ?, ?, ?)",
          [cleanTitle, hymn.artist || '', hymn.youtube_id, fileLang, '詩歌']
        );
        existingIds.add(hymn.youtube_id);
        fileImported++;
      } catch (e) {
        console.warn(`   ⚠️  匯入失敗: ${cleanTitle} — ${e.message}`);
      }
    }

    imported.push({ file: path.basename(file), lang: fileLang, count: fileImported, skipped: fileSkipped });
    console.log(`  ✅ ${path.basename(file)} — 新增 ${fileImported} 首${fileSkipped ? ` (跳過 ${fileSkipped} 重複)` : ''}`);
  }

  // Save DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  // Summary
  const newTotal = existingCount + imported.reduce((s, i) => s + i.count, 0);
  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 匯入完成！`);
  console.log(`   原有: ${existingCount} 首`);
  console.log(`   新增: ${imported.reduce((s, i) => s + i.count, 0)} 首`);
  console.log(`   總計: ${newTotal} 首`);

  if (doDedup && imported.some(i => i.skipped > 0)) {
    console.log(`   跳過: ${imported.reduce((s, i) => s + i.skipped, 0)} 首（重複）`);
  }

  console.log(`\n📋 各語言新增：`);
  const byLang = {};
  for (const i of imported) {
    byLang[i.lang] = (byLang[i.lang] || 0) + i.count;
  }
  for (const [lang, count] of Object.entries(byLang)) {
    console.log(`   ${lang}: ${count} 首`);
  }
  console.log(`═══════════════════════════════════\n`);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
