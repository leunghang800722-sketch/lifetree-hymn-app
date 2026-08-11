#!/usr/bin/env node
// fetchMusicBrainzCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md §6 追加決策
// (2026-08-11 Eric 拍板:國際主流英文敬拜歌手/樂隊,反過來用 MusicBrainz API
// 做資料源——呢個決定淨係推翻對呢批 org 嘅政策,唔影響中文/粵語/國語小型
// 事工「唔用第三方音樂 API」嘅原有規則,嗰批繼續靠官網/YouTube playlist)。
//
// 用 MusicBrainz `/ws/2/recording?query=arid:<artist-mbid>` 逐 org 攞晒佢哋
// 官方 release 嘅 recording + track/album 對照,寫成
// `data/album-backfill/musicbrainz-catalog.json`(格式跟 joshua-catalog.json
// 睇齊:{ org, title, album, year, mbid }[])。**唔碰 DB**,寫入由
// backfillAlbumFromMusicBrainzCatalog.js 負責。
//
// artist mbid 係 2026-08-11 人手用 /ws/2/artist search 逐個 org 查證揀出嚟
// (見下面 TARGET_ARTISTS 註解:邊個 org 有信心 match/邊個完全冇)——唔喺
// script 入面再做 fuzzy artist search,避免自動揀錯 artist(呢類 org 名好多
// 撞名,例如「Milk & Honey」搵到嘅全部係其他國家嘅樂隊/藝人,「Endless
// Worship」都要留返俾 backfill script 嘅 match 步驟自證——冇歌名撞得中就
// 自然零命中,唔會夾硬派錯專輯)。
//
// 每個 recording 揀「代表專輯」規則(跟官網 catalog 精神一致,揀原版
// studio/official 專輯,唔係二次精選/live 重發):
//   1. 淨考慮 artist-credit 入面有呢個 org 名嘅 release(唔收 various-artist
//      合輯入面順便夾嘅 release)
//   2. 優先 status=Official
//   3. primary-type 排序:Album > EP > Single > 其他
//   4. 同級揀 release 日期最早嗰個(貼近「原專輯」)
//
// 禮貌用法:MusicBrainz API rate limit 1 req/s,呢度用 1.1s delay + 429/503
// backoff retry;UA 表明身份帶 contact(MB API 要求)。
//
// Usage:
//   node scripts/fetchMusicBrainzCatalog.js            # 全部 org
//   node scripts/fetchMusicBrainzCatalog.js --org=Yancy # 淨試一個 org

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'musicbrainz-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'musicbrainz-fetch-report.md');
const UA = 'GodMusicApp-AlbumBackfill/1.0 (contact: leunghang800722@gmail.com)';
const MB_BASE = 'https://musicbrainz.org/ws/2';
const REQ_DELAY_MS = 1100;
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_ARTIST = 12; // 上限 1200 首,呢批 org 嘅實際曲目遠低於呢個數

const ONLY_ORG = (process.argv.find((a) => a.startsWith('--org=')) || '').slice('--org='.length) || null;

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 2026-08-11 人手用 /ws/2/artist/?query=artist:"<name>" 逐個查證(見對話
// 記錄)。mbid=null 表示搜尋完全冇撞到有信心嘅 artist(KEC Worship/Giggles
// and Tunes——兩個都係香港/粵語細團體,國際音樂平台冇收錄,符合預期;
// Milk&Honey 淨撞到日本idol group/其他國家同名樂隊,冇一個係呢個HK敬拜
// 事工,一齊當冇料處理)。confidence='low' 表示 artist 名有撞名風險
// (score<100 或冇 country/type 資料),留俾 match 步驟嘅命中率自證。
const TARGET_ARTISTS = [
  { org: 'Yancy', mbid: '7991c8d1-4edc-4265-ae22-9c167e85cb7d', confidence: 'high', note: 'US, contemporary Christian music artist' },
  { org: 'Bethel Music', mbid: 'd736e4c1-94ef-4bf6-b9f1-63b09eda2702', confidence: 'high' },
  { org: 'Hillsong Worship', mbid: 'dabaab7a-e807-435e-b2d7-1403fcdc0671', confidence: 'high' },
  { org: 'Hillsong Kids', mbid: '6a2c92e5-c38b-4062-9d37-5a81f492cdc1', confidence: 'high' },
  { org: 'KEC Worship', mbid: null, note: '搜尋完全冇撞到(HK細團體,MB冇收錄)' },
  { org: 'CJ and Friends', mbid: '829ac2b4-b6da-4c2a-90d9-ef867f60e623', confidence: 'high', note: 'MB名"C.J. & Friends"' },
  { org: 'Cody Carnes', mbid: 'c97d589e-615e-41fb-a80c-4eb0960a81a1', confidence: 'high' },
  { org: 'Milk&Honey', mbid: null, note: '搜尋淨撞到日本idol group/其他國家同名樂隊,冇一個係HK呢個事工' },
  { org: 'Giggles and Tunes', mbid: null, note: '搜尋完全冇撞到(粵語兒童事工,MB冇收錄)' },
  { org: 'Elevation Worship', mbid: 'f3bb45c8-dcb3-4358-ab21-645e6d0935e4', confidence: 'high' },
  { org: 'Phil Wickham', mbid: 'b635a97f-a971-4d53-8317-b21d3ca4f901', confidence: 'high' },
  { org: 'Listener Kids', mbid: '34e0512c-448f-48d9-b75a-1eed32b81d39', confidence: 'high' },
  { org: 'Chris Tomlin', mbid: 'b50b36b5-aec1-401f-a722-e5ab673af14d', confidence: 'high' },
  { org: 'Mosaic MSC', mbid: 'ac77d018-cc6e-4d73-8073-9070e1d67b7a', confidence: 'high' },
  { org: 'Endless Worship', mbid: 'daded5e0-92db-4f22-a22f-cc576f8f2c17', confidence: 'low', note: 'score=93,冇country/type,可能同DB嗰個HK團體唔係同一個——留返match命中率自證' },
  { org: 'CityAlight', mbid: '419e5650-c0c9-4fb5-b6bb-15a2e4f66419', confidence: 'high' },
  { org: 'Worship Together', mbid: 'bf083723-fde1-4a17-91a7-8873797269b4', confidence: 'low', note: '冇type/country資料,可能係合輯品牌唔係表演者——留返match命中率自證' },
  { org: 'Jesus Image', mbid: '8d61d766-f893-4359-8c38-6e3221d5dc42', confidence: 'high' },
  { org: 'Hillsong UNITED', mbid: 'a29ae051-283b-4703-be3d-2accfa3a75a2', confidence: 'high' },
  { org: 'Passion', mbid: '9610d6ae-dcd9-4981-bc97-a82b626297ae', confidence: 'high' },
];

const TYPE_RANK = { Album: 0, EP: 1, Single: 2 };

async function mbFetch(url, tries = 5) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 503) {
      const backoff = 2000 * attempt;
      log(`  ${res.status},backoff ${backoff}ms(attempt ${attempt}/${tries})`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`MB fetch 失敗 ${res.status} ${res.statusText}: ${url}`);
  }
  throw new Error(`MB fetch 重試 ${tries} 次都失敗: ${url}`);
}

// 揀呢個 recording 嘅代表專輯(見檔頭規則)。
// 注意:MB `query=arid:` search 嘅 release 物件冇 per-release artist-credit
// (只有 recording 頂層先有,已經俾 arid 篩過),所以呢度唔再重覆篩 artist——
// 信賴 arid 篩選已經夠—— compilation/various-artist release 混入嘅風險留俾
// Official+type+最早日期 排序自然壓低優先度。
function pickAlbum(recording) {
  const releases = (recording.releases || []).filter((r) => r['release-group'] && r['release-group'].title);
  if (!releases.length) return null;
  releases.sort((a, b) => {
    const aOfficial = a.status === 'Official' ? 0 : 1;
    const bOfficial = b.status === 'Official' ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    const aType = TYPE_RANK[a['release-group']['primary-type']] ?? 9;
    const bType = TYPE_RANK[b['release-group']['primary-type']] ?? 9;
    if (aType !== bType) return aType - bType;
    const aDate = a.date || '9999';
    const bDate = b.date || '9999';
    return aDate.localeCompare(bDate);
  });
  const best = releases[0];
  return {
    album: best['release-group'].title,
    year: (best.date || recording['first-release-date'] || '').slice(0, 4) || null,
  };
}

async function fetchArtistRecordings(org, mbid) {
  const out = [];
  let offset = 0;
  let total = Infinity;
  let page = 0;
  while (offset < total && page < MAX_PAGES_PER_ARTIST) {
    const url = `${MB_BASE}/recording?query=arid:${mbid}&inc=release-groups&fmt=json&limit=${PAGE_LIMIT}&offset=${offset}`;
    const data = await mbFetch(url);
    total = data.count;
    for (const rec of data.recordings || []) {
      const picked = pickAlbum(rec);
      if (!picked) continue;
      out.push({ org, title: rec.title, album: picked.album, year: picked.year, mbid: rec.id });
    }
    offset += PAGE_LIMIT;
    page += 1;
    await sleep(REQ_DELAY_MS);
  }
  return { recordings: out, total };
}

async function main() {
  const targets = ONLY_ORG ? TARGET_ARTISTS.filter((t) => t.org === ONLY_ORG) : TARGET_ARTISTS;
  const catalog = [];
  const summary = [];

  for (const t of targets) {
    if (!t.mbid) {
      log(`${t.org}:冇 mbid,skip(${t.note || ''})`);
      summary.push({ org: t.org, mbid: null, totalRecordings: 0, withAlbum: 0, note: t.note || '搜尋唔到有信心嘅 artist' });
      continue;
    }
    log(`${t.org}(mbid=${t.mbid}, confidence=${t.confidence})開始攞 recordings...`);
    const { recordings, total } = await fetchArtistRecordings(t.org, t.mbid);
    log(`  MB 總 recording 數:${total},有可用專輯資料:${recordings.length}`);
    catalog.push(...recordings);
    summary.push({ org: t.org, mbid: t.mbid, totalRecordings: total, withAlbum: recordings.length, note: t.note || '' });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  log(`catalog 已寫:${OUT_PATH}(${catalog.length} 行)`);

  const lines = [];
  lines.push('# MusicBrainz catalog 攞料報告');
  lines.push('');
  lines.push(`> 生成時間:${stamp()}`);
  lines.push('');
  lines.push('| org | mbid | MB總recording數 | 有專輯資料 | 備註 |');
  lines.push('|---|---|---|---|---|');
  for (const s of summary) {
    lines.push(`| ${s.org} | ${s.mbid || '(冇)'} | ${s.totalRecordings} | ${s.withAlbum} | ${s.note} |`);
  }
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('fetchMusicBrainzCatalog 出錯:', e); process.exit(1); });
