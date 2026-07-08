const initSqlJs = require('sql.js');
async function main() {
  const SQL = await initSqlJs();
  const fs = require('fs');
  const DB_PATH = __dirname + '/hymns.db';
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  // Check columns
  const r = db.exec("PRAGMA table_info(hymns)");
  console.log("Columns:", JSON.stringify(r[0].values, null, 2));
  
  // Add columns if not exist
  try { db.run("ALTER TABLE hymns ADD COLUMN title_en TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE hymns ADD COLUMN album TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE hymns ADD COLUMN lang TEXT DEFAULT '粵語'"); } catch(e) {}
  
  // Check what we have
  const hymns = db.exec("SELECT id, title, artist, category, lang FROM hymns ORDER BY id");
  console.log("Hymns:", JSON.stringify(hymns ? hymns[0].values : "no data", null, 2));
  
  // Update each hymn with proper data
  const updates = {
    1: { title_en: "Amazing Grace Is Too Beautiful", album: "敬拜主", lang: "粵語" },
    2: { title_en: "The Most Beautiful Blessing in Life", album: "這一生最美的祝福", lang: "國語" },
    3: { title_en: "I Will Lift Up My Eyes to the Hills", album: "玻璃海", lang: "粵語" },
    4: { title_en: "The Lords Prayer", album: "讚美之泉", lang: "國語" },
    5: { title_en: "Love You Deeply", album: "深愛你", lang: "國語" },
    6: { title_en: "Eternal Praise", album: "永恆的讚美", lang: "粵語" },
    7: { title_en: "Glory to the Lamb", album: "榮耀神羔羊", lang: "粵語" },
    8: { title_en: "Walk with Me Through Seasons", album: "陪我走過春夏秋冬", lang: "國語" },
    9: { title_en: "Day by Day", album: "每一天", lang: "粵語" },
    10: { title_en: "Offer Praise", album: "獻上頌讚", lang: "粵語" },
  };
  
  for (const [id, data] of Object.entries(updates)) {
    db.run("UPDATE hymns SET title_en = ?, album = ?, lang = ? WHERE id = ?", [data.title_en, data.album, data.lang, parseInt(id)]);
  }
  
  const updated = db.exec("SELECT id, title, title_en, album, lang FROM hymns ORDER BY id");
  if (updated && updated[0]) {
    console.log("Updated:", JSON.stringify(updated[0].values, null, 2));
  }
  
  // Save
  const out = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(out));
  console.log("✅ Database updated!");
}
main();
