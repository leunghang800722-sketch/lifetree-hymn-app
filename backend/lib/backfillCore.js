// lib/backfillCore.js — 共用嘅「食欠收清單」邏輯 —— 2026-07-31 Fable 5
// 結構性修復方案(SUPERVISION-LOG「選台邏輯+自動循環」條目):`growLibrary.js`
// 嘅自動 Tier 1 同 `backfillFromList.js` 呢個人手工具而家共用**同一份** code
// path,唔好維護兩套(之前嗰單「13個鐘冇增長」事故,根源之一就係呢個攞歌
// 邏輯淨係得人手工具識行,自動循環完全唔知佢存在)。

import { saveDb, isCompilation, isNonWorship, isInSongDurationBand, formatDuration, sleep, isDiscoverCoolingDown, recordDiscoverFailure, clearDiscoverFailure, query } from './hymnDb.js';
import { resolveAudioUrl } from './resolveAudio.js';
import { cleanDisplayTitle } from './displayTitle.js';

const today = () => new Date().toISOString().slice(0, 10);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// 對應收錄關卡②③④(①搜尋已經由 caller 傳落嚟嘅 `list` 完成 —— 嚟自
// reconcileChannels.js 嘅三分頁全深度枚舉,唔靠 listing window)。
//   ② 分類/品質篩選 —— 防禦性重新行(清單可能舊咗,blocklist 可能加咗新詞)
//   ③ 死鏈驗證 —— resolveAudioUrl,同 discover 用一樣嘅斷路器+negative cache
//   ④ 寫入 —— 淨係四關都過咗先 INSERT curated=1
export async function backfillGroupFromList(db, group, list, budget, opts = {}) {
  const { delayMs = 4000, dry = false, log = () => {} } = opts;
  const existing = new Set(query(db, `SELECT youtube_id FROM hymns_all`).map((r) => r.youtube_id));
  let added = 0, tried = 0, skipped = 0, streak = 0;

  for (const v of list) {
    if (tried >= budget) break;
    if (!v.id || existing.has(v.id)) { skipped++; continue; } // discover/curate 可能啱啱先收咗
    if (isDiscoverCoolingDown(v.id)) { skipped++; continue; }
    if (v.duration != null && !isInSongDurationBand(v.duration, group.durationCapSec)) { skipped++; continue; }
    if (isCompilation(v.title) || isNonWorship(v.title, group.name)) { skipped++; continue; }

    tried++;
    log(`  驗證中 [${group.lang}] ${group.name} — ${v.title}`);
    let alive = false;
    try { alive = !!(await resolveAudioUrl(v.id)); } catch (_) {}

    if (!alive) {
      streak++;
      recordDiscoverFailure(v.id);
      log(`    ✗ 拎唔到音訊,跳過 (連續失敗 ${streak})`);
      if (streak >= 3) {
        log('  連續 3 次失敗 —— 呢個頻道今次 backfill 收工唔博。');
        break;
      }
      if (tried < budget) await sleep(jitter(delayMs));
      continue;
    }
    streak = 0;
    clearDiscoverFailure(v.id);

    if (!dry) {
      db.run(
        `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak, duration)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?)`,
        [v.title, cleanDisplayTitle(v.title, group.name), group.name, group.lang, v.id, group.lang, today(), formatDuration(v.duration)]
      );
      saveDb(db);
    }
    added++;
    log(`    ✓ 收錄 (累計 +${added})`);
    if (tried < budget) await sleep(jitter(delayMs));
  }

  log(`  ${group.name}:清單 ${list.length} 條,試咗 ${tried} 條(跳過 ${skipped} 條已存在/冷卻/唔啱格式),收錄 ${added} 首`);
  return { added, tried, skipped };
}
