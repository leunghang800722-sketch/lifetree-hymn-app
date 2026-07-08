// 自動化詩歌搜尋 + SQL generator
// Run: node generate_hymns.js
// 搜尋指定團體嘅詩歌，輸出 SQL INSERT 俾 DB

const SEARCH_TERMS = {
  '基恩敬拜': [
    '基恩敬拜 詩歌',
    '基恩敬拜 讚美',
    '基恩敬拜 敬拜',
  ],
  '角聲使團': [
    '角聲使團 詩歌',
    '角聲使團 敬拜',
  ],
  '讚美之泉': [
    '讚美之泉 詩歌',
    '讚美之泉 敬拜',
  ],
  '泥土音樂': [
    '泥土音樂 詩歌',
    '盛曉玫 詩歌',
  ],
};

const KNOWN_HYMNS = {
// 基恩敬拜 - known songs with YouTube IDs
// We'll search via web for each
};

async function main() {
  const { execSync } = require('child_process');
  const https = require('https');

  // Use yt-dlp via exec if available, search YouTube
  function searchYouTube(query) {
    try {
      const result = execSync(`yt-dlp "ytsearch10:${query}" --flat-playlist --print "%(id)s|%(title)s"`, {
        timeout: 15000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      return result.trim().split('\n').filter(Boolean).map(line => {
        const [id, ...titleParts] = line.split('|');
        return { id: id.trim(), title: titleParts.join('|').trim() };
      });
    } catch(e) {
      return [];
    }
  }

  const allResults = {};

  for (const [artist, terms] of Object.entries(SEARCH_TERMS)) {
    console.log(`\n🔍 Searching ${artist}...`);
    const results = [];
    for (const term of terms) {
      console.log(`  Search: ${term}`);
      const r = searchYouTube(term);
      results.push(...r);
    }
    allResults[artist] = results;
  }

  // Output
  for (const [artist, results] of Object.entries(allResults)) {
    console.log(`\n═══════════════════ ${artist} ═══════════════════`);
    console.log(`Found ${results.length} results`);
    results.forEach(r => {
      console.log(`  ${r.id} | ${r.title}`);
    });
  }
}

main().catch(console.error);
