#!/usr/bin/env node
/**
 * batch_scrape.js — 批量爬取所有設定嘅詩歌頻道
 *
 * 用法：
 *   export YOUTUBE_API_KEY="xxx"
 *   node tools/batch_scrape.js          # 爬取所有頻道
 *   node tools/batch_scrape.js --lang=zh-cn  # 只爬國語
 *   node tools/batch_scrape.js --import      # 爬完即匯入 database
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TOOLS_DIR = __dirname;
const CHANNELS_FILE = path.join(TOOLS_DIR, 'channels.json');
const API_KEY = process.env.YOUTUBE_API_KEY || '';

// ---- 頻道設定 ----
const DEFAULT_CHANNELS = {
  "粵語": [
    { id: "UCe7BEwSGeZZV6U0Jm6rXqkg", name: "ACM 香港" },
    { id: "UCqFgXVm5VFP3Tk43m4x_hfA", name: "玻璃海" },
    { id: "UCvW1hPhBxsDiZ8G5ONKX1Wg", name: "讚美之泉粵語" },
    { id: "UCd6VpSMENqO7YhRFMXBkGvg", name: "生命河粵語" },
  ],
  "國語": [
    { id: "UC6P3GdOIKcD3ixN_yAoQYFg", name: "讚美之泉 (Stream of Praise)" },
    { id: "UCLm7Y7J2Y4a4mMYXHYTr5Tg", name: "約書亞樂團 (Joshua Band)" },
    { id: "UCpJFtHgIf8UqM-gm4ZAl6qw", name: "盛曉玫 (Amy Sand)" },
    { id: "UCY46P3Y5GKYfB-VHq7i3T5A", name: "天韻詩歌" },
    { id: "UC-VWzNnSlJfInHhb8gA1Tzw", name: "泥土音樂" },
    { id: "UCbkNit6qMnPHR_CYkOGAMsQ", name: "生命河靈糧堂" },
  ],
  "英文": [
    { id: "UCz6A-Q7dHnyhMUZatxryPBg", name: "Hillsong Worship" },
    { id: "UCjvQNfVukH0sCBpJh76uV3w", name: "Bethel Music" },
    { id: "UCk1Ql6oDcLqWqbcfK1e82bA", name: "Jesus Culture" },
    { id: "UC0P9w95HvQO6XBWZS9k2m4g", name: "Elevation Worship" },
    { id: "UCdI6lJ_nJ_zliW1VK_w9ZkQ", name: "Chris Tomlin" },
    { id: "UCOyEXwRq_Q6tFSlnOGJPGvw", name: "Passion" },
    { id: "UC-l05vTzvo7J8Gglz6nX9RQ", name: "Kari Jobe" },
    { id: "UCs5b2YJYLxFMIDI7v4YFiAA", name: "Matt Redman" },
  ],
};

// ---- 主程式 ----
function main() {
  if (!API_KEY) {
    console.error('❌ 設定 YOUTUBE_API_KEY 環境變數:');
    console.error('   export YOUTUBE_API_KEY="你的 Key"');
    process.exit(1);
  }

  // 載入或建立頻道設定
  let channels;
  if (fs.existsSync(CHANNELS_FILE)) {
    channels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    console.log(`📋 已載入頻道設定: ${CHANNELS_FILE}`);
  } else {
    channels = DEFAULT_CHANNELS;
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(DEFAULT_CHANNELS, null, 2));
    console.log(`📋 已建立預設頻道設定: ${CHANNELS_FILE}`);
  }

  const langFilter = process.argv.find(a => a.startsWith('--lang='));
  const langTarget = langFilter ? langFilter.split('=')[1] : null;
  const shouldImport = process.argv.includes('--import');

  let totalChannels = 0;
  let totalHymns = 0;
  const savedFiles = [];

  for (const [lang, channelList] of Object.entries(channels)) {
    if (langTarget && !lang.includes(langTarget) && !lang.startsWith(langTarget)) continue;

    console.log(`\n🎶 === ${lang} (${channelList.length} 個頻道) ===`);

    for (const ch of channelList) {
      totalChannels++;
      const langKey = lang === '粵語' ? 'zh-yue' : lang === '國語' ? 'zh-cn' : 'en';
      const outputFile = path.join(TOOLS_DIR, `${ch.id}_${langKey}.json`);

      console.log(`\n📡 [${totalChannels}] ${ch.name} (${ch.id})`);

      try {
        const result = execSync(
          `node "${path.join(TOOLS_DIR, 'scrape_channel.js')}" "${ch.id}" --lang=${langKey} --max=150`,
          { cwd: path.dirname(TOOLS_DIR), timeout: 30000, env: { ...process.env } }
        ).toString();
        console.log(result);
        if (fs.existsSync(outputFile)) {
          const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
          totalHymns += data.length;
          savedFiles.push(outputFile);
        }
      } catch (err) {
        console.error(`   ⚠️  爬取失敗: ${err.message}`);
      }
    }
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 爬取完成！`);
  console.log(`   已掃描: ${totalChannels} 個頻道`);
  console.log(`   已收集: ${totalHymns} 首詩歌`);
  console.log(`   檔案:   ${savedFiles.length} 個`);
  console.log(`═══════════════════════════════════\n`);

  if (shouldImport) {
    console.log('📥 --import 模式：準備匯入資料庫...\n');
    execSync(`node "${path.join(TOOLS_DIR, 'import_hymns.js')}"`, {
      cwd: path.dirname(TOOLS_DIR),
      stdio: 'inherit',
    });
  }
}

main();
