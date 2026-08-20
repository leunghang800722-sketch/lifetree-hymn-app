// BATCH5 §7.3-C:記低邊啲 hymn id 俾 /warm 摸過(每日一份),俾 daily cron
// (server.js startDailyWarmCron)揀「噚日+今日」精選預 resolve 用。純 JSON,
// 唔掂 hymns.db,冇 lock 問題(見 feedback-hymnsdb-writes-need-lock.md,呢度
// 完全唔碰嗰個檔)。fs 讀寫 best-effort try/catch,失敗都唔可以累到 /warm
// route 本身(呢度純粹側寫觀察用嘅記錄)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WARM_LOG_PATH = path.join(__dirname, '..', 'data', 'warm-daily.json');
const MAX_IDS_PER_DAY = 50;
const KEEP_DAYS = 3;

// BATCH6 C3:改用本地日(部機 = 香港)。消費者(server.js daily cron)係本地
// 06:30 trigger,record 同 pick 必須同一個曆先對得上;之前用 toISOString()
// (UTC)令 HK 00:00-08:00 嘅記錄跌落前一日格。
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadLog() {
  try {
    const raw = fs.readFileSync(WARM_LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) {
    return {};
  }
}

// 純函數,方便 harness 測——log 係 { "2026-08-19": [id,...] } 形狀,per-day
// dedupe、每日 cap MAX_IDS_PER_DAY、淨係保留最近 KEEP_DAYS 日(舊 key delete 晒)。
export function mergeWarmLog(log, key, ids) {
  const next = { ...log };
  const existing = new Set(next[key] || []);
  for (const id of ids) existing.add(id);
  next[key] = Array.from(existing).slice(0, MAX_IDS_PER_DAY);
  const days = Object.keys(next).sort(); // ISO date string 排序 = 時序排序
  while (days.length > KEEP_DAYS) {
    delete next[days.shift()];
  }
  return next;
}

export function recordWarmIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    // BATCH7 B7-7:req.body.ids 直接嚟自 client JSON,冇保證型別一致——
    // `123`(number)同 `"123"`(string)喺 mergeWarmLog 個 Set dedupe 入面
    // 會當兩個唔同 id,浪費 MAX_IDS_PER_DAY 個位、令 pickWarmCandidates 嘅
    // 「今日為你預備」命中率打折(SECOND-PASS-REVIEW-20260820.md b5)。
    // 統一轉做 Number,唔係合法整數嘅(NaN/浮點/垃圾輸入)直接丟。
    // (id != null && id !== '') 行先:Number(null) === 0、Number('') === 0,
    // 唔擋呢兩個就會將 null/空字串靜靜哋當做合法 id 0 收埋落 log。
    const normalized = ids
      .filter((id) => id != null && id !== '')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    if (!normalized.length) return;
    const log = loadLog();
    const next = mergeWarmLog(log, dateKey(new Date()), normalized);
    fs.writeFileSync(WARM_LOG_PATH, JSON.stringify(next));
  } catch (_) { /* best-effort,寫失敗唔緊要,下次 /warm 再試 */ }
}

// 純函數,方便 harness 測——攞「噚日 ∪ 今日」id,cap 住,噚日優先(嗰批就係
// review C 原文講嘅「今日為你預備」歷史命中)。now 由 caller 傳入方便測試。
export function pickWarmCandidates(log, now, cap) {
  const today = dateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1); // 本地曆,同 dateKey 一致
  const yesterday = dateKey(yesterdayDate);
  const merged = [];
  const seen = new Set();
  for (const id of (log[yesterday] || [])) { if (!seen.has(id)) { seen.add(id); merged.push(id); } }
  for (const id of (log[today] || [])) { if (!seen.has(id)) { seen.add(id); merged.push(id); } }
  return merged.slice(0, cap);
}

export function getWarmCandidates(cap = 40) {
  try {
    return pickWarmCandidates(loadLog(), new Date(), cap);
  } catch (_) {
    return [];
  }
}
