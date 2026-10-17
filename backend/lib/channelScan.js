// lib/channelScan.js — 共用嘅「頻道掃描 + 收錄關卡①②③」邏輯
// TAXONOMY-5D-PLAN.md §8 C3 Commit A:由 growLibrary.js 嘅 discoverFromGroup()
// 抽出嚟,俾 growLibrary.js(discover mode)同 refetchKids.js(兒童 staging
// 重攞)共用同一份 pipeline,唔好 copy-paste 兩份。
//
// 分工(對應收錄關卡,見 growLibrary.js 檔頭註解):
//   ① 搜尋(scanChannelListing)—— 淺層/深層兩級 fallback 攞頻道 listing,
//      dedup 走 caller 傳落嚟嘅 existingIds 同 discover-fail-cache 冷卻緊嘅片。
//   ② 語言 sanity(channelLanguageSanityCheck)—— channel-level 中文字判斷,
//      懷疑錯 handle 就成個頻道今次唔試。
//   ③ 分類/品質篩選 + 死鏈驗證(validateChannelCandidates)—— 片長帶 →
//      isCompilation/isNonWorship → (選擇性)contentGate 標題正面訊號 →
//      resolveAudioUrl,連續 3 次失敗就斷路器收工(同 runDiscoverAll 嘅
//      單一頻道語義一致,唔係 runCurate 嗰種「攞已收錄歌做對照探測」)。
// ④ 寫入邊個表(hymns_all 定 kids_refetch staging)留返俾各自 caller 做 ——
//   growLibrary discover 寫 hymns_all(org=group.org??group.name/kids=
//   priority===4),refetchKids.js 寫 kids_refetch staging(org=group.name/
//   kids=1/lang 要行雙值守衛),兩邊 schema 同規則唔同,冇得共用,亦唔應該
//   夾埋一齊抽,否則呢個 module 會反過嚟拖住兩個 caller 嘅獨立性。
//
// 呢個 module 唔開/唔寫 DB(冇 db 參數)—— 淨係網絡(yt-dlp listing +
// resolveAudioUrl)+ 純函數判斷,寫入邏輯完全留俾 caller 做,咁樣先可以
// 俾兩個 schema 完全唔同嘅 caller 共用。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listChannelVideos, isCompilation, isNonWorship, isInSongDurationBand,
  passesTitlePositiveSignal, isDiscoverCoolingDown, recordDiscoverFailure,
  clearDiscoverFailure, sleep,
} from './hymnDb.js';
import { resolveAudioUrl } from './resolveAudio.js';

const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// ── catalogAllowlist(2026-09-05 ORG-611-CATALOG-REPORT):官網目錄白名單 ──
// 淨係俾 `group.catalogAllowlist` 有設值嘅 group 用(而家得 Church 611 一個,
// 冧唔中其他 org 嘅行為零改變)。檔案格式跟 backfillAlbumFromSopSiteCatalog.js
// 嘅 fetch script 輸出一致(見 fetch-church611-catalog.mjs)。
//
// 點解淨係 OR 條件,唔係取代 contentGate:實測 Church 611 現存 65 首入面,
// 淨係 16 首(24.6%)撞得中官網「611創作詩歌」(原創歌)目錄,其餘 49 首
// (75.4%)係 RAWship/Live Worship 現場敬拜**改編別人嘅歌**(WayMaker/Holy
// Forever/Raise A Hallelujah 呢類),官網目錄本身冧唔到(佢淨列原創歌),
// 但呢批一路都係 Eric 拍板要收嘅內容(97%正面/0%blocklist 已審過)。
// 如果將 catalogAllowlist 做成「淨係目錄有先收」,會即刻踢走 75% 現有內容——
// 呢個唔係目錄對照嘅原意,所以做法係:catalog match ⇒ 額外開一條路(略過
// isCompilation/isNonWorship + contentGate 標題訊號),原本嘅 duration+title
// 路徑完全唔郁,兩條路 OR 埋一齊。
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'album-backfill');
const catalogCache = new Map();

function loadCatalogAllowlist(filename) {
  if (catalogCache.has(filename)) return catalogCache.get(filename);
  let entry = { ytIds: new Set(), titleKeys: new Set() };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    const hasCJK = (s) => /[一-鿿㐀-䶿]/.test(s || '');
    const normalizeZh = (s) => String(s || '').trim().replace(/[禰袮]/g, '祢')
      .replace(/[\s　（）()【】\[\]｜|、,，。.:：!！?？'"“”‘’~～\-—_·・\/]/g, '').toLowerCase();
    const normalizeEn = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const normKey = (s) => (hasCJK(s) ? normalizeZh(s) : normalizeEn(s));
    for (const c of raw) {
      if (c.youtube_id) entry.ytIds.add(c.youtube_id);
      const k = normKey(c.title_matchkey || c.title);
      if (k) entry.titleKeys.add(k);
    }
  } catch (e) {
    // 檔案讀唔到就當「冇白名單」(entry 保持空 set),catalogAllowlist 呢條
    // OR 路徑淨係唔生效,唔會影響原本 duration+title 路徑,亦唔會令個 group
    // 冧唔到片 —— 讀唔到就當冇加成呢個機制之前一樣。
  }
  catalogCache.set(filename, entry);
  return entry;
}

// 標題切候選(唔用 substring——見 backfillAlbumFromSopSiteCatalog.js 同一套
// 教訓):括號/分隔符切開,逐個 normalize 後同白名單完全相等先算撞中。
const CANDIDATE_SUFFIX_RE = /(官方)?(完整版|歌詞版?|中英版|無插電版|acoustic)?\s*(mv|m\/v|official\s*(lyric|music)?\s*video|lyric\s*video|music\s*video|live|現場版|試聽|預告|花絮|rawship(\s*vol\.?\s*\d+)?|live\s*worship|敬拜)\s*$/i;
function catalogCandidates(rawTitle) {
  const raw = String(rawTitle || '').trim();
  if (!raw) return [];
  const out = [raw];
  for (const m of raw.matchAll(/[【\[]([^】\]]+)[】\]]/g)) out.push(m[1]);
  for (const sep of ['｜', '|']) { const i = raw.indexOf(sep); if (i > 0) out.push(raw.slice(0, i)); }
  const extra = [];
  for (const c of out) {
    const s = String(c).replace(CANDIDATE_SUFFIX_RE, '').replace(/[\s|｜/／-]+$/, '').trim();
    if (s) extra.push(s);
  }
  return [...new Set(extra)];
}

function isCatalogMatch(v, catalogAllowlist) {
  const { ytIds, titleKeys } = loadCatalogAllowlist(catalogAllowlist);
  if (v.id && ytIds.has(v.id)) return true;
  const hasCJK = (s) => /[一-鿿㐀-䶿]/.test(s || '');
  const normalizeZh = (s) => String(s || '').trim().replace(/[禰袮]/g, '祢')
    .replace(/[\s　（）()【】\[\]｜|、,，。.:：!！?？'"“”‘’~～\-—_·・\/]/g, '').toLowerCase();
  const normalizeEn = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normKey = (s) => (hasCJK(s) ? normalizeZh(s) : normalizeEn(s));
  for (const cand of catalogCandidates(v.title)) {
    const k = normKey(cand);
    if (k && titleKeys.has(k)) return true;
  }
  return false;
}

// ① 搜尋:淺層(budget*5,最少 30)攞唔到未收錄嘅新片就加深到 200 先放棄。
// existingIds 由 caller 決定「乜嘢叫已存在」——growLibrary 用成個 hymns_all
// 嘅 youtube_id 集合;refetchKids.js 用「hymns_all 減去而家嘅兒童 cohort」
// (見 refetchKids.js 註解,呢個係兩者行為真正分歧嘅地方,唔喺呢個 module)。
export async function scanChannelListing(channel, budget, existingIds, opts = {}) {
  const { log = () => {} } = opts;
  let listing = [], fresh = [];
  for (const depth of [Math.max(budget * 5, 30), 200]) {
    try {
      listing = await listChannelVideos(channel, depth);
    } catch (e) {
      log(`    頻道列表攞唔到:${e?.message || e}`);
      return { listing: [], fresh: [] };
    }
    if (!listing.length) { log('    呢個頻道搵唔到片,可能 handle 舊咗'); return { listing: [], fresh: [] }; }
    fresh = listing.filter((v) => v.id && !existingIds.has(v.id) && !isDiscoverCoolingDown(v.id));
    if (fresh.length > 0) break;
    log(`    淺層(${depth} 條)全部見過,加深搜尋…`);
  }
  return { listing, fresh };
}

// ② channel-level 語言 sanity check:成個 listing 一條中文字都冇就懷疑錯
// handle(見原 growLibrary.js 註解:@singforgod/@redseamusic 兩單事故)。
export function channelLanguageSanityCheck(group, listing, opts = {}) {
  const { log = () => {} } = opts;
  const isChineseGroup = group.lang === '粵語' || group.lang === '國語'
    || (group.lang === '兒童' && group.kidsLang && group.kidsLang !== '英文');
  if (isChineseGroup && listing.length >= 10) {
    const cjkHits = listing.filter((v) => /[一-鿿㐀-䶿]/.test(v.title)).length;
    if (cjkHits === 0) {
      log(`    ⚠ [語言] listing ${listing.length} 條全部冇撞到中文字,懷疑「${group.name}」個 handle 錯咗,今次唔試呢個頻道`);
      return false;
    }
  }
  return true;
}

// ③ 逐條 fresh 候選行分類/品質篩選 + 死鏈驗證。唔做 DB 寫入(④由 caller
// 做),傳返 { candidates, tried, outcomes, circuitBroken }:
//   candidates  — 驗證生存(resolveAudioUrl 攞到)嘅候選,原始 listing 格式
//                 { id, title, duration }
//   tried       — 實際行到死鏈驗證嗰步嘅數目(唔計俾片長/分類/標題關擋咗嗰啲)
//   outcomes    — Map<youtubeId, reason>,俾 caller(refetchKids.js 嘅 K-C
//                 報告)解釋每條候選嘅最終判定,唔使重新行多次同一堆 gate
//                 邏輯。reason 值:'candidate' / 'skip-duration' /
//                 'skip-quality' / 'skip-title-signal' / 'skip-dead-link' /
//                 'not-reached-budget' / 'not-reached-circuit-broken'
//   circuitBroken — 連續 3 次死鏈,呢個頻道今次未行完 fresh 就收工
//
// opts.onCandidate(可選,async):搵到一條生存候選就即刻 call(唔使等成個
// fresh 跑晒先攞到 candidates 陣列)。refetchKids.js 用嚟做「即搵即寫入
// staging」,避免一個頻道 150+ 條先至一次過插(process 中途死咗會冧晒
// 嗰個頻道已經驗證咗嘅嘢);growLibrary.js 唔傳呢個 opt,行為完全冇變。
export async function validateChannelCandidates(group, fresh, budget, opts = {}) {
  const { delayMs = 4000, log = () => {}, onCandidate = null } = opts;
  const candidates = [];
  const outcomes = new Map();
  let tried = 0, streak = 0, circuitBroken = false;

  let i = 0;
  for (; i < fresh.length; i++) {
    const v = fresh[i];
    if (tried >= budget) break;

    // 2a. Layer 1 片長帶 gate(全局,零成本)。
    if (v.duration != null && !isInSongDurationBand(v.duration, group.durationCapSec)) {
      log(`    ⏭ [片長] 「${v.title}」${Math.round(v.duration)}s 出咗 75-${group.durationCapSec || 600}s 帶,跳過`);
      outcomes.set(v.id, 'skip-duration');
      continue;
    }

    // 2b/2c 之前:catalogAllowlist OR 路徑(淨係 group.catalogAllowlist 有
    // 設值先會行到呢度,其他 group 完全唔受影響)。官網目錄親自列咗嘅歌,
    // 當「confirmed 官方原創曲」,略過 2b/2c 呢兩關唔靠標題訊號(理由見
    // 檔頭 catalogAllowlist 註解——目錄本身就係一個比標題正面訊號更強嘅
    // 訊號來源),但 2a 片長帶依然要過(基本 sanity,唔豁免)。
    const catalogMatched = !!group.catalogAllowlist && isCatalogMatch(v, group.catalogAllowlist);
    if (!catalogMatched) {
      // 2b. 分類 / 品質篩選 —— 平嘅一關,喺呢度做完先至值得使錢做死鏈驗證。
      if (isCompilation(v.title) || isNonWorship(v.title, group.name)) {
        log(`    ⏭ [分類] 「${v.title}」睇個標題係合輯/世俗歌,唔驗證直接跳過`);
        outcomes.set(v.id, 'skip-quality');
        continue;
      }

      // 2c. Layer 2 標題正面訊號(選擇性,淨係 contentGate='duration+title' 開)。
      if (group.contentGate === 'duration+title' && !passesTitlePositiveSignal(v.title)) {
        log(`    ⏭ [標題] 「${v.title}」冇撞到歌訊號(♫/lyric/worship/cover等),跳過`);
        outcomes.set(v.id, 'skip-title-signal');
        continue;
      }
    } else {
      log(`    ✓ [目錄] 「${v.title}」撞中官網目錄白名單,略過分類/標題訊號關`);
    }

    tried++;
    log(`    驗證中 [${group.lang}] ${group.name} — ${v.title}`);

    // 3. 死鏈驗證。
    let alive = false;
    try { alive = !!(await resolveAudioUrl(v.id)); } catch (_) {}

    if (!alive) {
      streak++;
      recordDiscoverFailure(v.id); // 累計失敗,夠 3 次冷卻 7 日
      log(`      ✗ 拎唔到音訊,跳過 (連續失敗 ${streak})`);
      outcomes.set(v.id, 'skip-dead-link');
      if (streak >= 3) {
        log('    連續 3 次失敗 —— discover 風險本身已經比 curate 高,呢個團體今次收工唔博。');
        circuitBroken = true;
        i++; // 令下面「剩低嗰啲」嘅 marking loop 由下一條開始,唔重覆呢條
        break;
      }
      if (tried < budget) await sleep(jitter(delayMs));
      continue;
    }
    streak = 0;
    clearDiscoverFailure(v.id); // 拎到就即刻清返舊嘅失敗記錄(反映現況)

    candidates.push(v);
    outcomes.set(v.id, 'candidate');
    if (onCandidate) await onCandidate(v);
    if (tried < budget) await sleep(jitter(delayMs));
  }

  // 冇行到嘅(budget 用晒 / 斷路器提早收工)逐條記低原因,俾 K-C 報告用。
  for (; i < fresh.length; i++) {
    if (!outcomes.has(fresh[i].id)) {
      outcomes.set(fresh[i].id, circuitBroken ? 'not-reached-circuit-broken' : 'not-reached-budget');
    }
  }

  return { candidates, tried, outcomes, circuitBroken };
}
