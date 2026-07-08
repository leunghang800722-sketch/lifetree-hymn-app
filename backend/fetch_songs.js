/**
 * 詩歌App v132 - 自動化 YouTube 詩歌抓取 (含 timeout 版)
 *
 * 每個搜尋請求設 8 秒 timeout，防止 yt-search 無回應。
 *
 * 用法：node fetch_songs.js
 */

const ytSearch = require('yt-search');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hymns.db');

// 超時化的搜尋
function searchWithTimeout(query, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    ytSearch({ query, pageStart: 1, pageEnd: 1 })
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openDb() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  return new SQL.Database(buffer);
}

function saveDb(db) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function fmtDur(secs) {
  if (!secs) return '0:00';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

async function find(query) {
  try {
    const r = await searchWithTimeout(query);
    if (!r || !r.videos) return null;
    for (const v of r.videos) {
      if (!v.videoId || !v.duration || !v.duration.seconds) continue;
      const s = v.duration.seconds;
      if (s < 120 || s > 600) continue;
      if (/playlist|精選|串燒|小時|合輯|medley/i.test(v.title)) continue;
      return { vid: v.videoId, dur: fmtDur(s) };
    }
  } catch (_) {}
  return null;
}

const QUERIES = [
  // 讚美之泉 +6
  { artist: '讚美之泉', q: '讚美之泉 我們歡迎君王降臨', title: '我們歡迎君王降臨', cat: '國語' },
  { artist: '讚美之泉', q: '讚美之泉 榮耀大君王', title: '榮耀大君王', cat: '國語' },
  { artist: '讚美之泉', q: '讚美之泉 願祢的國降臨', title: '願祢的國降臨', cat: '國語' },
  { artist: '讚美之泉', q: '讚美之泉 這是耶和華所定日子', title: '這是耶和華所定日子', cat: '國語' },
  { artist: '讚美之泉', q: '讚美之泉 一生愛你', title: '一生愛你', cat: '國語' },
  { artist: '讚美之泉', q: '讚美之泉 我要因耶和華歡欣', title: '我要因耶和華歡欣', cat: '國語' },
  // ACM +15
  { artist: 'ACM', q: 'ACM 神是我這生供應者', title: '神是我這生供應者', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 全是祢的', title: '全是祢的', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 主禱文 全屬於祢', title: '主禱文', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 祢是王 粵語', title: '祢是王', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 得勝者 齊唱敬拜讚美', title: '得勝者', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 一首讚美的詩歌', title: '一首讚美的詩歌', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 同在的神 以馬內利', title: '同在的神－以馬內利', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 我的渴想', title: '我的渴想', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 永活真神', title: '永活真神', cat: '粵語' },
  { artist: 'ACM', q: 'ACM Still I Will Praise', title: 'Still I Will Praise', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 困苦中遇見祢', title: '困苦中遇見祢', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 全因為祢', title: '全因為祢', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 聽我的呼求', title: '聽我的呼求', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 讚美我父', title: '讚美我父', cat: '粵語' },
  { artist: 'ACM', q: 'ACM 尋求神的面', title: '尋求神的面', cat: '粵語' },
  // 約書亞樂團 +20
  { artist: '約書亞樂團', q: '約書亞樂團 我深渴望', title: '我深渴望', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 我渴望看見', title: '我渴望看見', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 榮耀的呼召', title: '榮耀的呼召', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 Open Heaven', title: '天堂敞開·活水湧流', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 大能拯救', title: '大能拯救', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 聖靈來', title: '聖靈來', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 打開天門', title: '打開天門', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 你是我的一切', title: '你是我的一切', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 孤兒的心', title: '孤兒的心', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 抬起我的眼', title: '抬起我的眼', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 恢復敬拜', title: '恢復敬拜', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 相信擁抱', title: '相信擁抱', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 我願降服', title: '我願降服', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 永遠不離開', title: '永遠不離開', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 新的異象新的方向', title: '新的異象新的方向', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 我們是', title: '我們是', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 在耶穌的腳前', title: '在耶穌的腳前', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 我要大聲唱', title: '我要大聲唱', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 永恆盼望', title: '永恆盼望', cat: '國語' },
  { artist: '約書亞樂團', q: '約書亞樂團 我一生追求', title: '我一生追求', cat: '國語' },
  // 玻璃海 +16
  { artist: '玻璃海', q: '玻璃海 如鹿渴慕溪水', title: '如鹿渴慕溪水', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 親眼看見祢', title: '親眼看見祢', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 我要歌頌', title: '我要歌頌', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 愛中不懼怕', title: '愛中不懼怕', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 耶穌我感謝祢', title: '耶穌我感謝祢', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 主我要高舉祢的名', title: '主我要高舉祢的名', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 祢是我的盾牌', title: '祢是我的盾牌', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 一生成為祢的器皿', title: '一生成為祢的器皿', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 來高聲唱', title: '來高聲唱', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 神大愛已經降臨', title: '神大愛已經降臨', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 我神我王', title: '我神我王', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 心中祢是最美', title: '心中祢是最美', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 彩虹 詩歌', title: '彩虹', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 無比的愛', title: '無比的愛', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 到那天', title: '到那天', cat: '粵語' },
  { artist: '玻璃海', q: '玻璃海 更新我的靈', title: '更新我的靈', cat: '粵語' },
  // 基恩敬拜 +7
  { artist: '基恩敬拜', q: '基恩敬拜 我一生要讚美祢', title: '我一生要讚美祢', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 神是我的避難所', title: '神是我的避難所', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 與你一起', title: '與你一起', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 稱頌祢', title: '稱頌祢', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 我要歌頌讚美祢', title: '我要歌頌讚美祢', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 讚美中信心不斷升起', title: '讚美中信心不斷升起', cat: '粵語' },
  { artist: '基恩敬拜', q: '基恩敬拜 尋找', title: '尋找', cat: '粵語' },
  // 角聲使團 +10
  { artist: '角聲使團', q: '角聲使團 誰曾應許', title: '誰曾應許', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 因著信', title: '因著信', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 如鷹展翅', title: '如鷹展翅', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 從今天起', title: '從今天起', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 恩典之路', title: '恩典之路', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 靠著耶穌得勝', title: '靠著耶穌得勝', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 不變的愛', title: '不變的愛', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 唯有耶穌', title: '唯有耶穌', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 主我高舉你的名', title: '主我高舉你的名', cat: '粵語' },
  { artist: '角聲使團', q: '角聲使團 願望', title: '願望', cat: '粵語' },
  // 盛曉玫 +2
  { artist: '盛曉玫', q: '盛曉玫 我不在乎', title: '我不在乎', cat: '國語' },
  { artist: '盛曉玫', q: '盛曉玫 天國的銀行', title: '天國的銀行', cat: '國語' },
];

async function main() {
  console.log('');
  console.log('🌳 ================================================');
  console.log('🌳  詩歌App v132 - 自動化搜尋 (timeout 版)');
  console.log('🌳 ================================================\n');

  const db = await openDb();
  const cr = db.exec('SELECT COUNT(*) as cnt FROM hymns');
  const cnt = cr[0]?.values[0]?.[0] ?? 0;
  console.log(`📊 現有詩歌：${cnt} 首`);
  console.log(`🎯 搜尋目標：${QUERIES.length} 首\n`);

  const existIds = new Set(
    (db.exec('SELECT youtube_id FROM hymns')[0]?.values || []).map(r => r[0])
  );

  const ec = {};
  const ar = db.exec('SELECT artist, COUNT(*) FROM hymns GROUP BY artist');
  if (ar?.[0]) for (const [a, c] of ar[0].values) ec[a] = c;
  console.log('📋 單位現有：');
  for (const [a, c] of Object.entries(ec)) console.log(`  ${a}: ${c}`);
  console.log();

  const results = {};
  let found = 0, skipped = 0, failed = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const { artist, q, title, cat } = QUERIES[i];

    const video = await find(q);
    await sleep(300);

    if (!video) { failed++; continue; }
    if (existIds.has(video.vid)) { skipped++; continue; }
    existIds.add(video.vid);

    if (!results[artist]) results[artist] = [];
    results[artist].push({ title, artist, youtube_id: video.vid, duration: video.dur, category: cat });
    found++;
    if (found <= 30 || i % 10 === 0)
      console.log(`  ✅ [${found}] ${artist} - ${title} (${video.dur})`);
  }

  console.log(`\n✅ 找到: ${found} | ⏭️ 已存在: ${skipped} | ❌ 失敗: ${failed}\n`);

  let totalNew = 0;
  console.log('📊 ===== 結果 =====');
  for (const [artist, songs] of Object.entries(results)) {
    const b4 = ec[artist] || 0;
    console.log(`  ${artist}: +${songs.length} → ${b4 + songs.length} 首`);
    totalNew += songs.length;
  }
  console.log(`\n  總新增: ${totalNew} → 總計: ${cnt + totalNew}\n`);

  if (!totalNew) { saveDb(db); db.close(); console.log('無新歌。'); return; }

  console.log('💾 寫入資料庫...');
  let ins = 0;
  for (const [, songs] of Object.entries(results)) {
    for (const s of songs) {
      try {
        db.run('INSERT INTO hymns (title, artist, category, youtube_id, duration) VALUES (?, ?, ?, ?, ?)',
          [s.title, s.artist, s.category, s.youtube_id, s.duration]);
        ins++;
      } catch (e) { console.log(`  ❌ ${s.title}: ${e.message}`); }
    }
  }
  saveDb(db); db.close();
  console.log(`✅ 寫入 ${ins} 首！資料庫總數: ${cnt + ins}\n`);

  for (const [artist, songs] of Object.entries(results)) {
    if (songs.length) {
      console.log(`--- ${artist} (${songs.length}) ---`);
      songs.forEach((s, i) => console.log(`  ${String(i+1).padStart(2,' ')}. ${s.title} (${s.duration})`));
      console.log();
    }
  }
  console.log('🎉 完成！重啟 Server 載入新資料。');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
