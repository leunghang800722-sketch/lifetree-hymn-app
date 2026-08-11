#!/usr/bin/env node
// fetchACMCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md ACM 版(仿約書亞樂團
// Phase B 做法,但資料源唔同)。
//
// 背景:試過 ACM 官網(hkacm.org)兩條路都行唔通——
//   1) 官網「詩歌搜尋」/網上商店(WooCommerce)淨係逐首歌嘅歌譜 PDF 產品,
//      category 係「ACM詩歌歌譜PDF下載附加計劃」呢類年度加購包,唔係按專輯
//      分類;產品 description 一律空,冇 track list。
//   2) 官網掛嘅《ACM 歌曲目錄》PDF 淨係成堆歌名嘅 grid 版面(俾「詩歌搜尋」
//      用嘅 index),欄與欄之間冇專輯標籤,結構上斷估唔到邊首歌屬邊隻專輯。
// 兩條路都冚檔冧檔,唔夾硬用。
//
// 改用 ACM 官方 YouTube channel(HKACM Official,worshipGroups.js 已有
// channel/UCIGCKTWZFjtQB-zGylKGiXg)嘅 playlist membership 做資料源——即
// ALBUM-BACKFILL-ACCEL-PLAN.md 嘅 Phase A 手法(repo 已有generic
// backfillAlbumFromPlaylists.js 做呢件事,但佢個 classifyPlaylist() regex
// 認唔到 ACM 嘅命名格式「《專輯名》HKACM 齊唱敬拜讚美NN」,66 個 playlist
// 淨自動認中 2 個)。呢度唔改動 generic 果個 script,自己起一個淨用喺 ACM、
// 帶人手覆核過嘅白名單(ALBUM_PLAYLISTS),準確過再嘗試撞 regex。
//
// 用 youtube_id 做 exact match(唔係 fuzzy 撞歌名)——比 Joshua 個 title-based
// catalog 更準,唔會有中英分拆/normalize 嘅灰色地帶。
//
// Usage:
//   node scripts/fetchACMCatalog.js
//
// 純網絡爬 playlist member,唔碰 DB。輸出
// data/album-backfill/acm-catalog.json,格式:
//   [{ youtube_id, video_title, album, playlist_id, playlist_title }, ...]

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'acm-catalog.json');
const DELAY_MS = 3000;
const MEMBER_COUNT_WARN_THRESHOLD = 40; // 齊唱兒歌/敬拜讚美系列有時去到20幾首,門檻放寬過joshua

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// ── 人手覆核過嘅白名單(2026-08-11,由 backfillAlbumFromPlaylists.js
//    --discover --org ACM 嘅 66 個 playlist 逐個睇 title 揀出嚟)───────────
// 剔走嘅理由(唔入呢個表):演唱會/音樂會/籌款直播(《ACM齊唱金歌曲管弦夜》
// 籌款音樂會、30/40週年音樂會、感恩晚宴)、比賽/課程/專訪(唱歌比賽、詩歌
// 創作大賽、暑期聖經班、傳承使命專訪、課程簡介)、cover/伴奏/純音樂類
// (Drum Cover、樂隊系列、鋼琴伴奏版、純音樂系列、詩班分部示範)、主題精選
// 合輯(最新敬拜詩歌、齊唱新歌系列、聖誕主題詩歌、預苦期復活期詩歌、抗疫
// 詩歌推介、大使命/詩篇23篇/主禱文系列、好聽現代粵語敬拜詩歌、疫流敬拜)、
// 舊版《齊唱敬拜讚美》系列合輯 PLE6A780625589014B(01-04 冚埋一齊,單首歌
// 屬邊一隻淨係靠呢個 playlist 分唔到)、名稱太含糊嘅(請聽我的誓言、絲絃
// 樂章、在乎你系列、YME青少年系列、《經典重製》系列——呢個係翻唱舊詩歌
// 嘅 MV 系列,唔係原創專輯,錄落去會將舊歌錯配做「經典重製」呢個假專輯名)。
const ALBUM_PLAYLISTS = [
  { playlist_id: 'PLKztYP2DMa7h8sF9I4WUs3Dm8NU8T52ij', album: 'REBIRTH', note: 'ACM 40周年創作專輯' },
  { playlist_id: 'PLKztYP2DMa7h0rvr0963TMu4ztpBqdxHW', album: '站立得穩', note: '新專輯 Live Session' },
  { playlist_id: 'PLKztYP2DMa7hqUEwERmMGilONwH-NcfOV', album: '站立得穩', note: 'HKACM 齊唱敬拜讚美15' },
  { playlist_id: 'PLKztYP2DMa7jg0lT65nvyK5BIwojyVDxO', album: 'THE WAY', note: 'HKACM齊唱敬拜讚美16' },
  { playlist_id: 'PLKztYP2DMa7iB8SuNTgo1z6K2ITBer4iN', album: '黑暗中的盼望', note: 'HKACM 齊唱敬拜讚美14' },
  { playlist_id: 'PLKztYP2DMa7gU_pmgngRoY7z4zoHdMgwy', album: '傳承使命', note: 'HKACM 齊唱敬拜讚美13' },
  { playlist_id: 'PLKztYP2DMa7gKIAZMZ97VqmR-DSUYp_Du', album: '牧我一生', note: 'HKACM 齊唱敬拜讚美12' },
  { playlist_id: 'PLKztYP2DMa7jnxIhVnzyQ040LH54iyZlk', album: '全是祢的', note: 'HKACM 齊唱敬拜讚美11' },
  { playlist_id: 'PL2E4C8D348A8A9DE3', album: '錫安城', note: 'HKACM 齊唱敬拜讚美10' },
  { playlist_id: 'PLKztYP2DMa7i_7ihd75nWLArVUuIT9pxo', album: '我願意', note: 'HKACM 齊唱敬拜讚美09' },
  { playlist_id: 'PLKztYP2DMa7jOPd94pNXzK3VTAgO23w0b', album: '得勝者', note: 'HKACM 齊唱敬拜讚美08' },
  { playlist_id: 'PLKztYP2DMa7igh8DvlZnigRgJ_W0IDZ2j', album: '敬拜Crossover', note: 'HKACM 齊唱敬拜讚美07' },
  { playlist_id: 'PLKztYP2DMa7hRlQVIMXLKj2w6G-VtqwHF', album: '同在的神─以馬內利', note: 'HKACM 齊唱敬拜讚美06' },
  { playlist_id: 'PLKztYP2DMa7gglAMFVcafgucSE2AMWKgN', album: '和平之君', note: 'HKACM 齊唱敬拜讚美05' },
  { playlist_id: 'PLKztYP2DMa7gVUSfYha7ZOnWmN0jRjusD', album: '齊唱兒歌5', note: '' },
  { playlist_id: 'PLKztYP2DMa7gnnzBLGBzS0vC6aIHxgv0a', album: '齊唱兒歌2', note: '' },
  { playlist_id: 'PLKztYP2DMa7hBgizSIzdXsJ4ivFWlR5cr', album: '齊唱兒歌1', note: '' },
  { playlist_id: 'PLKztYP2DMa7gVXNi4TtzFtjIsNzD0SDk2', album: '齊唱兒歌3', note: '' },
  { playlist_id: 'PLKztYP2DMa7jrLqNT39Iunm-d0u76d9gY', album: '齊唱兒歌4', note: '小小敬拜者(大衛篇)' },
  { playlist_id: 'PLKztYP2DMa7gTr1gTsR_LAEW6dyLQSp9j', album: '齊唱兒歌2020', note: '' },
  { playlist_id: 'PLKztYP2DMa7gxbcdVCPIdllxLL9jpgy8-', album: '有故事的歌', note: '系列合輯,冇分開個別冊數' },
];

async function fetchFlatJson(url) {
  const { stdout } = await execFile(
    'yt-dlp',
    ['-J', '--flat-playlist', '--skip-download', url],
    { timeout: 90000, maxBuffer: 30 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function main() {
  log(`ACM 專輯 playlist 白名單:${ALBUM_PLAYLISTS.length} 個`);
  const out = [];
  let ok = 0;
  for (let i = 0; i < ALBUM_PLAYLISTS.length; i++) {
    const { playlist_id, album, note } = ALBUM_PLAYLISTS[i];
    process.stdout.write(`[${i + 1}/${ALBUM_PLAYLISTS.length}] ${playlist_id} → ${album}${note ? `(${note})` : ''} ... `);
    try {
      const j = await fetchFlatJson(`https://www.youtube.com/playlist?list=${playlist_id}`);
      const entries = (j.entries || []).filter((e) => e && e.id);
      const warn = entries.length > MEMBER_COUNT_WARN_THRESHOLD ? ' ⚠️member數偏多,人手覆核吓' : '';
      console.log(`${entries.length} 首${warn}`);
      if (entries.length) ok++;
      for (const e of entries) {
        out.push({ youtube_id: e.id, video_title: e.title || '', album, playlist_id, playlist_title: j.title || '' });
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    if (i < ALBUM_PLAYLISTS.length - 1) await sleep(jitter(DELAY_MS));
  }

  log(`成功攞到 member 嘅 playlist:${ok}/${ALBUM_PLAYLISTS.length},總 track(未去重):${out.length}`);
  if (out.length < 50) {
    console.error(`track 總數(${out.length})過少,懷疑 yt-dlp 攞失敗咗一大截,收工唔寫檔`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchACMCatalog 出錯:', e); process.exit(1); });
