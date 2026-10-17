#!/usr/bin/env node
// 重新下載 cantonhymn.net sitemap.xml,重建 title→slug 對照 index(俾歌詞複核 routine 用嚟免WebSearch搵歌)
// 用法: node scripts/updateCantonhymnIndex.js
// 輸出: backend/data/lyrics-verify-cache/cantonhymn-title-url-index.tsv
//
// 2026-08-12 更新:除咗 /song/(原曲 parent)之外,加埋 /song-sub/(粵語翻譯版 child)。
// 粵語 cover 嘅歌名絕大部分只會出現喺 song-sub 度,舊版淨係收 /song/ 所以成半搵唔到。
// TSV 欄位: title <TAB> type(parent|child) <TAB> slug <TAB> url

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data', 'lyrics-verify-cache');
const RAW_PATH = path.join(OUT_DIR, 'cantonhymn-sitemap-raw.xml');
const TSV_PATH = path.join(OUT_DIR, 'cantonhymn-title-url-index.tsv');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const xml = await fetchText('https://cantonhymn.net/sitemap.xml');
  fs.writeFileSync(RAW_PATH, xml);

  const seen = new Set();
  const rows = [];
  const counts = { parent: 0, child: 0 };

  for (const [, kind, rawSlug] of xml.matchAll(/<loc>https:\/\/cantonhymn\.net\/(song|song-sub)\/([^<]+)<\/loc>/g)) {
    const slug = rawSlug.replace(/\/$/, '');
    if (!slug) continue;
    const type = kind === 'song' ? 'parent' : 'child';
    const key = `${type}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let title;
    try { title = decodeURIComponent(slug); } catch (e) { title = slug; }
    rows.push(`${title}\t${type}\t${slug}\thttps://cantonhymn.net/${kind}/${slug}/`);
    counts[type] += 1;
  }

  fs.writeFileSync(TSV_PATH, `${rows.join('\n')}\n`);
  console.log(`寫咗 ${rows.length} 條 cantonhymn.net 歌曲 index 落 ${TSV_PATH}(parent 原曲 ${counts.parent} / child 粵語版 ${counts.child})`);
}

main().catch((err) => {
  console.error('updateCantonhymnIndex 失敗:', err.message);
  process.exit(1);
});
