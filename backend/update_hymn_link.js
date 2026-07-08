#!/usr/bin/env node
/**
 * update_hymn_link.js — 更新詩歌 YouTube link
 *
 * 用法：
 *   node backend/update_hymn_link.js                # 互動模式
 *   node backend/update_hymn_link.js hymns.csv       # 批量模式
 *
 * CSV 格式（無 header）：
 *   hymn_id,new_youtube_id
 *   1,dQw4w9WgXcQ
 *   15,newID1234567
 *
 * 或者單首更新：
 *   node backend/update_hymn_link.js --id 1 --yt dQw4w9WgXcQ
 */

const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'hymns.db');

try {
  var initSqlJs = require('sql.js');
} catch (e) {
  console.error('❌ sql.js not found. Run: npm install sql.js');
  process.exit(1);
}

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Interactive mode: list current hymns and prompt
    console.log('\n📋 當前詩歌列表：');
    const stmt = db.prepare("SELECT id, title, artist, youtube_id FROM hymns ORDER BY id");
    while (stmt.step()) {
      const [id, title, artist, yt] = stmt.getAsObject();
      console.log(`  [${id}] ${title} — ${artist || 'N/A'} (${yt})`);
    }
    stmt.free();
    console.log('');
    const readline = require('readline').createInterface({
      input: process.stdin, output: process.stdout
    });
    const answer = await new Promise(r => readline.question('要更新邊首？輸入 ID 或 q 離開: ', r));
    readline.close();
    if (answer.toLowerCase() === 'q') { console.log('Bye'); process.exit(0); }
    const id = parseInt(answer);
    const row = db.exec(`SELECT id, title, youtube_id FROM hymns WHERE id = ${id}`);
    if (!row.length) { console.log('❌ 找不到該 ID'); process.exit(1); }
    const [oldId, oldTitle, oldYt] = row[0].values[0];
    console.log(`\n當前: [${oldId}] ${oldTitle} → youtube_id: ${oldYt}`);
    const rl2 = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const newYt = await new Promise(r => rl2.question('新 youtube_id: ', r));
    rl2.close();
    if (!newYt.trim()) { console.log('❌ 未輸入新 ID'); process.exit(1); }
    db.run(`UPDATE hymns SET youtube_id = '${newYt.trim()}' WHERE id = ${id}`);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`✅ 已更新 [${id}] ${oldTitle}: ${oldYt} → ${newYt.trim()}`);
    process.exit(0);

  } else if (args[0] === '--id' && args[1] && args[2] === '--yt' && args[3]) {
    // Single update mode
    const id = parseInt(args[1]);
    const newYt = args[3].trim();
    const row = db.exec(`SELECT id, title, youtube_id FROM hymns WHERE id = ${id}`);
    if (!row.length) { console.log('❌ 找不到 ID:', id); process.exit(1); }
    const [oldId, oldTitle, oldYt] = row[0].values[0];
    db.run(`UPDATE hymns SET youtube_id = '${newYt}' WHERE id = ${id}`);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`✅ 已更新 [${id}] ${oldTitle}: ${oldYt} → ${newYt}`);
    process.exit(0);

  } else if (fs.existsSync(args[0])) {
    // CSV batch mode
    const csv = fs.readFileSync(args[0], 'utf8').trim().split('\n');
    let updated = 0;
    for (const line of csv) {
      const [idStr, newYt] = line.split(',').map(s => s.trim());
      const id = parseInt(idStr);
      if (!id || !newYt) {
        console.log('⚠️ 跳過無效行:', line);
        continue;
      }
      const row = db.exec(`SELECT id, title, youtube_id FROM hymns WHERE id = ${id}`);
      if (!row.length) {
        console.log(`⚠️ 跳過 ID ${id}: 找不到`);
        continue;
      }
      const [oldId, oldTitle, oldYt] = row[0].values[0];
      db.run(`UPDATE hymns SET youtube_id = '${newYt}' WHERE id = ${id}`);
      console.log(`  ✅ [${id}] ${oldTitle}: ${oldYt} → ${newYt}`);
      updated++;
    }
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`\n✅ 批量更新完成！共更新 ${updated} 首`);
    process.exit(0);

  } else {
    console.log('用法：');
    console.log('  node backend/update_hymn_link.js                    # 互動模式');
    console.log('  node backend/update_hymn_link.js --id <ID> --yt <YT_ID>  # 單首更新');
    console.log('  node backend/update_hymn_link.js hymns.csv         # 批量 CSV');
    process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
