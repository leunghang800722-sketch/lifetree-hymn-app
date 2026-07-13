#!/usr/bin/env node
/**
 * hymn-check.js — 批量檢查詩歌可播放性
 *
 * 用法：
 *   node backend/check_hymns.js                    # 用 settings 預設 server URL
 *   node backend/check_hymns.js http://localhost:3001  # 指定 server
 *   node backend/check_hymns.js http://192.168.30.45:3001
 *
 * 輸出：hymn-check-report.txt
 */

const https = require('https');
const http = require('http');

// ---- Config ----
const DB_PATH = __dirname + '/hymns.db';
const SERVER_URL = process.argv[2] || 'http://192.168.30.45:3001';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 6;
const REPORT_FILE = __dirname + '/hymn-check-report.txt';

// ---- DB (read-only, bundled) ----
let hymns = [];

try {
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  initSqlJs().then(SQL => {
    const buf = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buf);
    const rows = db.exec("SELECT id, title, artist, youtube_id FROM hymns ORDER BY id");
    if (rows.length > 0) {
      hymns = rows[0].values.map(row => ({
        id: row[0],
        title: row[1],
        artist: row[2] || '',
        youtube_id: row[3],
      }));
    }
    db.close();
    runChecks();
  }).catch(err => {
    console.error('Failed to load sql.js:', err.message);
    console.error('Run: npm install sql.js');
    process.exit(1);
  });
} catch (e) {
  console.error('sql.js not available. Run: npm install sql.js');
  console.error('Or run with backend:', e.message);
  process.exit(1);
}

// ---- Check logic ----
function fetchUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function checkHymn(hymn) {
  const { id, title, artist, youtube_id } = hymn;
  const url = `${SERVER_URL}/api/audio/${youtube_id}`;
  const start = Date.now();

  try {
    const result = await fetchUrl(url, TIMEOUT_MS);

    if (result.status !== 200) {
      return { ...hymn, status: 'FAIL', error: `HTTP ${result.status}` };
    }

    let data;
    try { data = JSON.parse(result.data); } catch (e) {
      return { ...hymn, status: 'FAIL', error: 'Invalid JSON response' };
    }

    if (!data || !data.url) {
      return { ...hymn, status: 'FAIL', error: 'Empty URL in response' };
    }

    if (typeof data.url !== 'string' || !data.url.startsWith('http')) {
      return { ...hymn, status: 'FAIL', error: 'Invalid URL format' };
    }

    const elapsed = Date.now() - start;
    return { ...hymn, status: 'OK', elapsed: `${elapsed}ms` };

  } catch (e) {
    return { ...hymn, status: 'FAIL', error: e.message || 'Unknown error' };
  }
}

async function runChecks() {
  console.log(`\n📋 詩歌可播放性檢查`);
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   Hymns: ${hymns.length} total`);
  console.log(`   Concurrency: ${CONCURRENCY}\n`);

  const results = [];
  let completed = 0;

  // Batch with concurrency limit
  for (let i = 0; i < hymns.length; i += CONCURRENCY) {
    const batch = hymns.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(h => checkHymn(h)));

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        results.push({ ...batch[j], status: 'FAIL', error: r.reason?.message || 'Unknown' });
      }
      completed++;
      const hymn = batch[j];
      const lastResult = results[results.length - 1];
      const statusChar = lastResult.status === 'OK' ? '✅' : '❌';
      process.stdout.write(`\r   [${completed}/${hymns.length}] ${statusChar} ${hymn.title.slice(0, 20).padEnd(20)}`);
    }
  }

  process.stdout.write('\n\n');

  // ---- Generate report ----
  const ok = results.filter(r => r.status === 'OK');
  const fail = results.filter(r => r.status === 'FAIL');

  const lines = [];
  lines.push('╔══════════════════════════════════════════════╗');
  lines.push('║   詩歌可播放性檢查報告                       ║');
  lines.push('╚══════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`檢查時間: ${new Date().toISOString()}`);
  lines.push(`後端伺服器: ${SERVER_URL}`);
  lines.push(`總詩歌數: ${hymns.length}`);
  lines.push(`✅ 可播放: ${ok.length}`);
  lines.push(`❌ 失效: ${fail.length}`);
  if (fail.length > 0) lines.push(`⚠️  成功率: ${((ok.length / hymns.length) * 100).toFixed(1)}%`);
  lines.push('');

  if (ok.length > 0) {
    lines.push('─── ✅ 可播放的詩歌 ───');
    ok.forEach(r => {
      lines.push(`  [${r.id}] ${r.title} — ${r.artist || 'N/A'} (${r.youtube_id}) [${r.elapsed}]`);
    });
    lines.push('');
  }

  if (fail.length > 0) {
    lines.push('─── ❌ 失效的詩歌 ───');
    fail.forEach(r => {
      lines.push(`  [${r.id}] ${r.title} — ${r.artist || 'N/A'} (${r.youtube_id})`);
      lines.push(`       原因: ${r.error}`);
    });
    lines.push('');
    lines.push('⚠️  建議修復方案：');
    lines.push('  1. 在 YouTube 手動搜尋失效詩歌的替代影片');
    lines.push('  2. 使用 `backend/update_hymn_link.js` 更新 youtube_id');
    lines.push('  3. 重新執行此腳本確認修復');
  }

  const report = lines.join('\n');
  require('fs').writeFileSync(REPORT_FILE, report, 'utf8');

  console.log(report);
  console.log(`\n📄 完整報告已儲存至: ${REPORT_FILE}`);
  process.exit(0);
}
