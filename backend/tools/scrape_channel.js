#!/usr/bin/env node
/**
 * scrape_channel.js — 爬取 YouTube 頻道詩歌
 *
 * 用法：
 *   export YOUTUBE_API_KEY="xxx"
 *   node tools/scrape_channel.js UC... [--lang=zh-yue|zh-cn|en] [--max=50]
 *
 * 預設語言：zh-cn（國語）
 * 輸出：backend/<channelId>_<lang>.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const LANG_MAP = { 'zh-yue': '粵語', 'zh-cn': '國語', 'en': '英文' };

if (!API_KEY) {
  console.error('❌ 需要設定 YOUTUBE_API_KEY 環境變數');
  console.error('   export YOUTUBE_API_KEY="你的 API Key"');
  process.exit(1);
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

async function fetchAllVideos(channelId, maxResults = 50) {
  let videos = [];
  let pageToken = '';
  const baseUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=snippet&order=date&maxResults=50&type=video`;

  while (videos.length < maxResults) {
    const url = baseUrl + (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await fetchJSON(url);
    if (data.error) throw new Error(data.error.message);
    videos = videos.concat(data.items || []);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return videos.slice(0, maxResults);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node tools/scrape_channel.js <channel_id> [--lang=zh-yue|zh-cn|en] [--max=50]');
    console.log('\n常用詩歌頻道 ID：');
    console.log('  UC6P3GdOIKcD3...  讚美之泉 (Stream of Praise)');
    console.log('  UCLm7Y...        約書亞樂團 (Joshua Band)');
    console.log('  UC...            Hillsong Worship');
    console.log('  UC...            Bethel Music');
    console.log('  UC...            Elevation Worship');
    console.log('  UC...            Passion');
    console.log('  UC...            Chris Tomlin');
    console.log('  UC...            Jesus Culture');
    process.exit(1);
  }

  const channelId = args[0];
  const langArg = args.find(a => a.startsWith('--lang='));
  const maxArg = args.find(a => a.startsWith('--max='));
  const lang = langArg ? langArg.split('=')[1] : 'zh-cn';
  const maxResults = maxArg ? parseInt(maxArg.split('=')[1]) : 50;
  const langName = LANG_MAP[lang] || lang;

  console.log(`\n🎵 正在爬取頻道: ${channelId}`);
  console.log(`   語言: ${langName}`);
  console.log(`   上限: ${maxResults} 首\n`);

  try {
    const videos = await fetchAllVideos(channelId, maxResults);
    console.log(`✅ 找到 ${videos.length} 個影片\n`);

    const hymns = videos
      .filter(v => v.snippet && v.id && v.id.videoId)
      .map(v => ({
        title: v.snippet.title,
        artist: v.snippet.channelTitle,
        youtube_id: v.id.videoId,
        language: langName,
        category: '詩歌',
        published_at: v.snippet.publishedAt,
        description: (v.snippet.description || '').slice(0, 200),
      }));

    const outputFile = path.join(__dirname, `../tools/${channelId}_${lang}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(hymns, null, 2));
    console.log(`✅ 已儲存: ${outputFile}\n`);

    // 摘要
    console.log(`📊 摘要:`);
    console.log(`   總數: ${hymns.length}`);
    console.log(`   檔案: tools/${channelId}_${lang}.json\n`);

    if (hymns.length > 0) {
      console.log('📋 前 10 首：');
      hymns.slice(0, 10).forEach((h, i) => {
        console.log(`  ${(i+1).toString().padStart(2)}. ${h.title.slice(0, 40).padEnd(42)} [${h.youtube_id}]`);
      });
    }

  } catch (err) {
    console.error('❌ 錯誤:', err.message);
    process.exit(1);
  }
}

main();
