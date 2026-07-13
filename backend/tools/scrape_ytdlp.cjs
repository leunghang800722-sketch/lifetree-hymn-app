#!/usr/bin/env node
/**
 * scrape_ytdlp.js — 用 yt-dlp 批量搜集詩歌（v2）
 *
 * 用法：
 *   node tools/scrape_ytdlp.js                   # 搜尋所有詩歌
 *   node tools/scrape_ytdlp.js --lang=粵語       # 只搜粵語
 *   node tools/scrape_ytdlp.js --test            # 小規模測試（只搜 3 個團體）
 *   node tools/scrape_ytdlp.js --import          # 搜完即匯入 database
 *
 * 唔使 YouTube API Key！直接用 yt-dlp search
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TOOLS_DIR = __dirname;
const OUTPUT_DIR = path.join(TOOLS_DIR, 'scraped');

// ---- 搜尋設定 ----
// 每個團體可獨立設定 maxResults
// Big = 80-100, Medium = 40-60, Small = 20-30
const SEARCH_CONFIG = {
  "粵語": {
    groups: [
      { name: "基恩敬拜", terms: ["基恩敬拜 詩歌", "基恩敬拜 讚美", "基恩敬拜 敬拜"], max: 50 },
      { name: "ACM", terms: ["ACM 詩歌", "ACM 粵語詩歌", "ACM 敬拜"], max: 40 },
      { name: "玻璃海", terms: ["玻璃海 詩歌", "玻璃海 敬拜"], max: 30 },
      { name: "團契遊樂園", terms: ["團契遊樂園 詩歌"], max: 30 },
      { name: "角聲使團", terms: ["角聲使團 詩歌", "角聲使團 敬拜"], max: 30 },
      { name: "原始和聲", terms: ["原始和聲 詩歌"], max: 20 },
      { name: "讚美之泉粵語", terms: ["讚美之泉 粵語 詩歌", "讚美之泉 粵語 敬拜"], max: 60 },
      { name: "生命河粵語", terms: ["生命河 粵語 詩歌", "生命河 粵語 敬拜"], max: 40 },
    ]
  },
  "國語": {
    groups: [
      { name: "讚美之泉", terms: ["讚美之泉 詩歌", "讚美之泉 敬拜", "讚美之泉 讚美"], max: 100 },
      { name: "約書亞樂團", terms: ["約書亞樂團 詩歌", "約書亞樂團 敬拜", "約書亞樂團 讚美"], max: 80 },
      { name: "盛曉玫", terms: ["盛曉玫 詩歌", "盛曉玫 讚美", "泥土音樂"], max: 60 },
      { name: "天韻詩歌", terms: ["天韻詩歌 詩歌", "天韻詩歌 讚美"], max: 50 },
      { name: "生命河靈糧堂", terms: ["生命河靈糧堂 詩歌", "生命河靈糧堂 敬拜"], max: 60 },
      { name: "小羊詩歌", terms: ["小羊詩歌 敬拜", "小羊詩歌 讚美"], max: 40 },
      { name: "有情天音樂", terms: ["有情天音樂 詩歌"], max: 30 },
      { name: "我心旋律", terms: ["我心旋律 詩歌", "我心旋律 敬拜"], max: 40 },
    ]
  },
  "英文": {
    groups: [
      { name: "Hillsong Worship", terms: ["Hillsong Worship", "Hillsong United praise"], max: 100 },
      { name: "Bethel Music", terms: ["Bethel Music worship", "Bethel Music song"], max: 80 },
      { name: "Jesus Culture", terms: ["Jesus Culture worship", "Jesus Culture song"], max: 60 },
      { name: "Elevation Worship", terms: ["Elevation Worship", "Elevation worship song"], max: 60 },
      { name: "Passion", terms: ["Passion worship", "Passion music"], max: 50 },
      { name: "Chris Tomlin", terms: ["Chris Tomlin worship", "Chris Tomlin song"], max: 50 },
      { name: "Kari Jobe", terms: ["Kari Jobe worship", "Kari Jobe song"], max: 30 },
      { name: "Matt Redman", terms: ["Matt Redman worship", "Matt Redman praise"], max: 30 },
    ]
  }
};

// ---- 工具函數 ----
function searchWithYtDlp(query, maxResults) {
  try {
    const output = execSync(
      `yt-dlp "ytsearch${maxResults}:${query}" --flat-playlist --print "%(id)s|%(title)s" 2>/dev/null`,
      { timeout: 30000, encoding: 'utf8' }
    );
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [id, ...titleParts] = line.split('|');
      return { youtube_id: id, title: titleParts.join('|') };
    });
  } catch (e) {
    return [];
  }
}

function cleanTitle(title) {
  return title
    .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbfa-zA-Z\-\–\—\.\,\!\?\&\'\\\/\(\)\[\]【】「」\（\）]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

function isUseful(title) {
  const lower = title.toLowerCase();
  // Skip medley（3+ / 或 +）
  if ((title.match(/\//g) || []).length >= 3) return false;
  if ((title.match(/\+/g) || []).length >= 3) return false;

  // Skip 合集/精選/mix
  const skipWords = ['精選', '合集', 'medley', '串燒',
    '2小時', '1小時', '小時', '小時敬拜',
    '30首', '40首', '50首', '100首', 'top',
    'playlist', 'live stream', 'stream',
    'karaoke', 'instrumental', '伴奏', '卡拉ok',
    'tutorial', '教學', 'cover by', '翻唱',
    'lyrics video', 'lyric video', '歌詞版',
    'guitar', 'piano', '結他', '鋼琴', '靈修音樂',
    'purely music', '純音樂', '純結他', '純鋼琴',
    '演奏', 'instrument', 'harp', '豎琴',
    'sax', 'saxophone', '色士風',
    'collection', 'best of', 'morning worship',
    'evening worship', '精選集', '熱門', '主題曲'];
  for (const w of skipWords) {
    if (lower.includes(w)) return false;
  }
  // Must not be too short
  if (title.replace(/[\[\]【】\(\)「」《》\-–\—\s]/g, '').length < 4) return false;
  return true;
}

function normalizeTitle(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    .replace(/(official|lyrics|mv|audio|hd|4k|1080p)/g, '')
    .trim();
}

// ---- 主程式 ----
function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const langFilter = process.argv.find(a => a.startsWith('--lang='));
  const langTarget = langFilter ? langFilter.split('=')[1] : null;
  const delayArg = process.argv.find(a => a.startsWith('--delay='));
  const delayMs = delayArg ? parseInt(delayArg.split('=')[1]) * 1000 : 0;
  const shouldImport = process.argv.includes('--import');
  const isTest = process.argv.includes('--test');

  console.log('\n🎵 詩歌批量搜集器 (yt-dlp v2)');
  console.log('═══════════════════════════\n');

  let allHymns = [];
  let seenIds = new Set();
  const dedupMap = new Map(); // normalized title → id

  for (const [lang, config] of Object.entries(SEARCH_CONFIG)) {
    if (langTarget && !lang.includes(langTarget)) continue;

    console.log(`\n🎶 [${lang}] (${config.groups.length} 個團體)`);

    for (const group of config.groups) {
      // Test mode: only do first group of each language
      if (isTest && config.groups.indexOf(group) > 0) continue;

      const resultsPerTerm = Math.ceil(group.max / group.terms.length);
      console.log(`\n  📀 ${group.name} (目標 ${group.max} 首, 每 term ${resultsPerTerm} 個)...`);

      for (const term of group.terms) {
        process.stdout.write(`    🔍 "${term}"... `);
        const results = searchWithYtDlp(term, resultsPerTerm);
        console.log(`${results.length} 個結果`);
        if (delayMs > 0) {
          const wait = delayMs + Math.floor(Math.random() * 3000);
          console.log(`    ⏳ 等待 ${(wait/1000).toFixed(0)}s 避免 block...`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
        }

        for (const h of results) {
          if (!h.youtube_id || seenIds.has(h.youtube_id)) continue;
          if (!isUseful(h.title)) continue;

          const nTitle = normalizeTitle(h.title);
          // Dedup by normalized title within same group
          if (dedupMap.has(nTitle)) continue;

          seenIds.add(h.youtube_id);
          dedupMap.set(nTitle, h.youtube_id);
          allHymns.push({
            title: cleanTitle(h.title),
            artist: group.name,
            youtube_id: h.youtube_id,
            language: lang,
            category: '詩歌',
          });
        }
      }

      if (isTest) {
        console.log(`  ⏸️  測試模式 — 只搜頭 1 個團體`);
        break;
      }
    }
  }

  // Save
  const outputFile = path.join(OUTPUT_DIR, `all_hymns_${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(allHymns, null, 2));

  // Summary
  console.log(`\n═══════════════════════════════════`);
  if (isTest) console.log(`🧪 測試模式`);
  console.log(`📊 結果:`);
  console.log(`   收集: ${allHymns.length} 首詩歌`);
  console.log(`   去重: ${dedupMap.size} 個獨特標題`);
  console.log(`   檔案: tools/scraped/${path.basename(outputFile)}`);
  console.log(`═══════════════════════════════════\n`);

  const byLang = {};
  for (const h of allHymns) byLang[h.language] = (byLang[h.language] || 0) + 1;
  for (const [lang, count] of Object.entries(byLang))
    console.log(`  ${lang}: ${count} 首`);

  console.log('\n📋 樣本（每語言頭 5 首）：');
  for (const lang of Object.keys(byLang)) {
    console.log(`\n  [${lang}]`);
    allHymns.filter(h => h.language === lang).slice(0, 5).forEach(h =>
      console.log(`    • ${h.title.slice(0, 40).padEnd(42)} [${h.youtube_id}]`));
  }

  if (shouldImport) {
    console.log('\n📥 匯入 database...\n');
    execSync(`node "${path.join(TOOLS_DIR, 'import_hymns.js')}" --backup --dedup "${outputFile}"`, {
      stdio: 'inherit', cwd: path.dirname(TOOLS_DIR),
    });
  }

  console.log('');
}

main();
