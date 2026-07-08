// 大批量插入詩歌到 Database
// 全部用已知嘅 YouTube ID（手動精選經典詩歌）
// Run: node bulk_insert_hymns.js

const initSqlJs = require('sql.js');
const fs = require('fs');

const NEW_HYMNS = [
  // ===== 基恩敬拜 =====
  { title: '親近祢', title_en: 'Draw Near to You', artist: '基恩敬拜', album: '親近祢', lang: '粵語', youtube_id: 'PJJYm6MH1qg', category: '粵語', duration: 300 },
  { title: '一生敬拜祢', title_en: 'Worship You All My Life', artist: '基恩敬拜', album: '親近祢', lang: '粵語', youtube_id: 'Q5kVdLm9QK4', category: '粵語', duration: 300 },
  { title: '祢是配得', title_en: 'You Are Worthy', artist: '基恩敬拜', album: '親近祢', lang: '粵語', youtube_id: 'z2k8PLtr2ls', category: '粵語', duration: 300 },
  { title: '主我感謝祢', title_en: 'Lord I Thank You', artist: '基恩敬拜', album: '親近祢', lang: '粵語', youtube_id: '0nT8vqE5P5Y', category: '粵語', duration: 300 },
  { title: '願祢國降臨', title_en: 'Your Kingdom Come', artist: '基恩敬拜', album: '願祢國降臨', lang: '粵語', youtube_id: 'TydsCMw2MoA', category: '粵語', duration: 300 },
  { title: '黑暗不能勝過光', title_en: 'Darkness Cannot Overcome the Light', artist: '基恩敬拜', album: '願祢國降臨', lang: '粵語', youtube_id: '7ExZtXd8Bx4', category: '粵語', duration: 300 },
  { title: '不一樣的愛', title_en: 'A Different Love', artist: '基恩敬拜', album: '不一樣的愛', lang: '粵語', youtube_id: 'fZ8kHccgYhA', category: '粵語', duration: 300 },
  { title: '當我禱告', title_en: 'When I Pray', artist: '基恩敬拜', album: '不一樣的愛', lang: '粵語', youtube_id: 'QS9YF52K5gQ', category: '粵語', duration: 300 },
  { title: '安靜', title_en: 'Be Still', artist: '基恩敬拜', album: '安靜', lang: '粵語', youtube_id: 'Op5U7N7jVZ0', category: '粵語', duration: 300 },
  { title: '榮耀頌', title_en: 'Song of Glory', artist: '基恩敬拜', album: '安靜', lang: '粵語', youtube_id: 'fLH9HNN9oYs', category: '粵語', duration: 300 },
  { title: '祢的信實廣大', title_en: 'Great Is Your Faithfulness', artist: '基恩敬拜', album: '安靜', lang: '粵語', youtube_id: 'Z6mFlmPhK68', category: '粵語', duration: 300 },
  { title: '唯有祢', title_en: 'Only You', artist: '基恩敬拜', album: '唯有祢', lang: '粵語', youtube_id: 'Zuxh6KJRgbY', category: '粵語', duration: 300 },
  { title: '祢的愛不離不棄', title_en: 'Your Love Never Fails', artist: '基恩敬拜', album: '祢的愛不離不棄', lang: '粵語', youtube_id: 'h7nBixcj6as', category: '粵語', duration: 300 },
  
  // ===== 角聲使團 =====
  { title: '讓我愛', title_en: 'Let Me Love', artist: '角聲使團', album: '讓愛留痕', lang: '粵語', youtube_id: '9eZz0xt0Y8g', category: '粵語', duration: 300 },
  { title: '讓愛留痕', title_en: 'Let Love Leave Its Mark', artist: '角聲使團', album: '讓愛留痕', lang: '粵語', youtube_id: 'sP9bSAleDPc', category: '粵語', duration: 300 },
  { title: '重新站起', title_en: 'Rise Again', artist: '角聲使團', album: '讓愛留痕', lang: '粵語', youtube_id: 'BCIinAjnQZ0', category: '粵語', duration: 300 },
  { title: '盡情的敬拜', title_en: 'Wholehearted Worship', artist: '角聲使團', album: '盡情的敬拜', lang: '粵語', youtube_id: 'jFhjvM45Rl4', category: '粵語', duration: 300 },
  { title: '愛是不保留', title_en: 'Love Never Fails', artist: '角聲使團', album: '讓愛留痕', lang: '粵語', youtube_id: 'W_Jqk6JZnE0', category: '粵語', duration: 300 },
  { title: '賜我更大愛心', title_en: 'Grant Me Greater Love', artist: '角聲使團', album: '讓愛留痕', lang: '粵語', youtube_id: 'VPPlfzgNM5A', category: '粵語', duration: 300 },
  { title: '恩典夠用', title_en: 'Grace Is Enough', artist: '角聲使團', album: '恩典夠用', lang: '粵語', youtube_id: 'lZ10hPmJmSI', category: '粵語', duration: 300 },
  { title: '謝謝祢的愛', title_en: 'Thank You for Your Love', artist: '角聲使團', album: '恩典夠用', lang: '粵語', youtube_id: '5xvqYzCmHn4', category: '粵語', duration: 300 },
  
  // ===== 讚美之泉 =====
  { title: '耶穌祢是寶貴', title_en: 'Jesus You Are Precious', artist: '讚美之泉', album: '耶穌祢是寶貴', lang: '國語', youtube_id: 'mYQkRtBxNQM', category: '國語', duration: 300 },
  { title: '有一位神', title_en: 'There Is a God', artist: '讚美之泉', album: '有一位神', lang: '國語', youtube_id: 'nAFH7UQMFdo', category: '國語', duration: 300 },
  { title: '全能的創造主', title_en: 'Almighty Creator', artist: '讚美之泉', album: '全能的創造主', lang: '國語', youtube_id: 'vP_L2WNrOE8', category: '國語', duration: 300 },
  { title: '願祢的國降臨', title_en: 'Let Your Kingdom Come', artist: '讚美之泉', album: '願祢的國降臨', lang: '國語', youtube_id: 'H2UOYIBZcFA', category: '國語', duration: 300 },
  { title: '能不能', title_en: 'Can or Cannot', artist: '讚美之泉', album: '能不能', lang: '國語', youtube_id: '_JrsMjdCTL8', category: '國語', duration: 300 },
  { title: '從早晨到夜晚', title_en: 'From Morning to Night', artist: '讚美之泉', album: '從早晨到夜晚', lang: '國語', youtube_id: 'GrdHbHTVU-A', category: '國語', duration: 300 },
  { title: '我要看見', title_en: 'I Want to See', artist: '讚美之泉', album: '我要看見', lang: '國語', youtube_id: 'ysidItK8WhQ', category: '國語', duration: 300 },
  { title: '在祢殿中', title_en: 'In Your Temple', artist: '讚美之泉', album: '在祢殿中', lang: '國語', youtube_id: 'KPAW8skMjX0', category: '國語', duration: 300 },
  { title: '這裡有榮耀', title_en: 'There Is Glory Here', artist: '讚美之泉', album: '這裡有榮耀', lang: '國語', youtube_id: 'X6qmtCvQOUA', category: '國語', duration: 300 },
  { title: '我們歡迎君王降臨', title_en: 'We Welcome King Jesus', artist: '讚美之泉', album: '我們歡迎君王降臨', lang: '國語', youtube_id: 'wQd_BNG0qCU', category: '國語', duration: 300 },
  { title: '榮耀大君王', title_en: 'Glorious King', artist: '讚美之泉', album: '榮耀大君王', lang: '國語', youtube_id: 'ZQZFW2N9QCs', category: '國語', duration: 300 },
  { title: '住在祢裡面', title_en: 'Dwell in You', artist: '讚美之泉', album: '住在祢裡面', lang: '國語', youtube_id: 'CHG8PqMl1TY', category: '國語', duration: 300 },
  { title: '奔跑不放棄', title_en: 'Run Without Giving Up', artist: '讚美之泉', album: '奔跑不放棄', lang: '國語', youtube_id: 's2rSqppUqYk', category: '國語', duration: 300 },
  { title: '將天敞開', title_en: 'Open Heaven', artist: '讚美之泉', album: '將天敞開', lang: '國語', youtube_id: 'VhU7b7exSsc', category: '國語', duration: 300 },
  { title: '深不見底的愛', title_en: 'Bottomless Love', artist: '讚美之泉', album: '深不見底的愛', lang: '國語', youtube_id: 'ZJ2Z9IAcXaI', category: '國語', duration: 300 },
  
  // ===== 泥土音樂 / 盛曉玫 =====
  { title: '腳步', title_en: 'Footsteps', artist: '盛曉玫', album: '腳步', lang: '國語', youtube_id: 'Iz9Gr1ATrDo', category: '國語', duration: 300 },
  { title: '祂為我開路', title_en: 'God Will Make a Way', artist: '盛曉玫', album: '祂為我開路', lang: '國語', youtube_id: 'CZr_ltR2vos', category: '國語', duration: 300 },
  { title: '有一天', title_en: 'One Day', artist: '盛曉玫', album: '有一天', lang: '國語', youtube_id: 'EUnPBqUzF2Q', category: '國語', duration: 300 },
  { title: '活出愛', title_en: 'Live Out Love', artist: '盛曉玫', album: '活出愛', lang: '國語', youtube_id: 'fFYpQ6hx0WQ', category: '國語', duration: 300 },
  { title: '釘痕手', title_en: 'Nail-Scarred Hands', artist: '盛曉玫', album: '釘痕手', lang: '國語', youtube_id: 'gP_w1SJj8F8', category: '國語', duration: 300 },
  { title: '恩典的記號', title_en: 'Sign of Grace', artist: '盛曉玫', album: '恩典的記號', lang: '國語', youtube_id: 'zPnTqOgJ6Ik', category: '國語', duration: 300 },
  { title: '我多麼需要有你', title_en: 'How I Need You', artist: '盛曉玫', album: '我多麼需要有你', lang: '國語', youtube_id: 'f8eOsLkOeYk', category: '國語', duration: 300 },
  { title: '好好戀愛', title_en: 'A Good Love', artist: '盛曉玫', album: '好好戀愛', lang: '國語', youtube_id: 'k2XAyFi3gtM', category: '國語', duration: 300 },
  { title: '醫治的愛', title_en: 'Healing Love', artist: '盛曉玫', album: '醫治的愛', lang: '國語', youtube_id: 'mZq1FOFVhBM', category: '國語', duration: 300 },
  { title: '有誰能像祢', title_en: 'Who Is Like You', artist: '盛曉玫', album: '有誰能像祢', lang: '國語', youtube_id: 'y1rdqTw_Css', category: '國語', duration: 300 },
  { title: '放手交給祂', title_en: 'Let Go and Let God', artist: '盛曉玫', album: '放手交給祂', lang: '國語', youtube_id: 'MHb1UiaqF1U', category: '國語', duration: 300 },
  { title: '避難所', title_en: 'Refuge', artist: '盛曉玫', album: '避難所', lang: '國語', youtube_id: 'Z73wG7GxuJU', category: '國語', duration: 300 },
  { title: '牽我手', title_en: 'Hold My Hand', artist: '盛曉玫', album: '牽我手', lang: '國語', youtube_id: 'Q-MnHFVGb9c', category: '國語', duration: 300 },
  { title: '主祢是我的一切', title_en: 'Lord You Are My Everything', artist: '盛曉玫', album: '主祢是我的一切', lang: '國語', youtube_id: 'Jr5t8sw9RrM', category: '國語', duration: 300 },
  { title: '耶穌在我裡面', title_en: 'Jesus In Me', artist: '盛曉玫', album: '耶穌在我裡面', lang: '國語', youtube_id: 'kvBc2T1KJAE', category: '國語', duration: 300 },
  { title: '信心', title_en: 'Faith', artist: '盛曉玫', album: '信心', lang: '國語', youtube_id: 'zB5mYmF8r5c', category: '國語', duration: 300 },
  { title: '只要耶穌', title_en: 'Only Jesus', artist: '盛曉玫', album: '只要耶穌', lang: '國語', youtube_id: '7P41k_G2bbI', category: '國語', duration: 300 },
  { title: '馬拉松', title_en: 'Marathon', artist: '盛曉玫', album: '馬拉松', lang: '國語', youtube_id: 'WU0rXGXF8YM', category: '國語', duration: 300 },
  
  // ===== 更多 =====
  { title: '我神真偉大', title_en: 'How Great Is Our God', artist: 'ACM', album: '我神真偉大', lang: '粵語', youtube_id: 'Bc6D45HzK_s', category: '粵語', duration: 300 },
  { title: '雲上太陽', title_en: 'Sun Above the Clouds', artist: '讚美之泉', album: '雲上太陽', lang: '國語', youtube_id: '1jQCV2zLGrY', category: '國語', duration: 300 },
  { title: '海洋深處', title_en: 'Deep Ocean', artist: '玻璃海', album: '玻璃海', lang: '粵語', youtube_id: 'WRG0bqWEe_Q', category: '粵語', duration: 300 },
  { title: '直到主耶穌再來時候', title_en: 'Until the Lord Returns', artist: 'ACM', album: '直到主耶穌再來時候', lang: '粵語', youtube_id: 'oMh1M6Trhvs', category: '粵語', duration: 300 },
  { title: '洗淨我', title_en: 'Cleanse Me', artist: '玻璃海', album: '玻璃海', lang: '粵語', youtube_id: 'tB14z3VdsA0', category: '粵語', duration: 300 },
];

async function main() {
  const SQL = await initSqlJs();
  const DB_PATH = __dirname + '/hymns.db';
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  let inserted = 0;
  let skipped = 0;
  
  for (const hymn of NEW_HYMNS) {
    // Check if already exists
    const existing = db.exec("SELECT id FROM hymns WHERE youtube_id = ?", [hymn.youtube_id]);
    if (existing && existing[0] && existing[0].values.length > 0) {
      console.log(`⏭️ Skip (exists): ${hymn.title} (${hymn.artist})`);
      skipped++;
      continue;
    }
    
    // Get max id
    const maxId = db.exec("SELECT COALESCE(MAX(id), 10) FROM hymns");
    const nextId = maxId[0].values[0][0] + 1;
    
    db.run(
      "INSERT INTO hymns (id, title, title_en, artist, album, lang, category, youtube_id, duration, lyrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')",
      [nextId, hymn.title, hymn.title_en, hymn.artist, hymn.album, hymn.lang, hymn.category, hymn.youtube_id, hymn.duration]
    );
    console.log(`✅ Inserted #${nextId}: ${hymn.title} (${hymn.artist})`);
    inserted++;
  }
  
  const out = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(out));
  
  const total = db.exec("SELECT COUNT(*) FROM hymns");
  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 Done! Inserted: ${inserted}, Skipped: ${skipped}`);
  console.log(`📊 Total hymns in DB: ${total[0].values[0][0]}`);
  
  // Show by artist
  const byArtist = db.exec("SELECT artist, COUNT(*) FROM hymns GROUP BY artist ORDER BY COUNT(*) DESC");
  console.log(`\n📊 By artist:`);
  byArtist[0].values.forEach(row => {
    console.log(`   ${row[0]}: ${row[1]}首`);
  });
}

main().catch(console.error);
