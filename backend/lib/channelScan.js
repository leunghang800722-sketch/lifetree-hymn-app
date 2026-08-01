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

import {
  listChannelVideos, isCompilation, isNonWorship, isInSongDurationBand,
  passesTitlePositiveSignal, isDiscoverCoolingDown, recordDiscoverFailure,
  clearDiscoverFailure, sleep,
} from './hymnDb.js';
import { resolveAudioUrl } from './resolveAudio.js';

const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

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
export async function validateChannelCandidates(group, fresh, budget, opts = {}) {
  const { delayMs = 4000, log = () => {} } = opts;
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
