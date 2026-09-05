// lib/presence.js — Admin「在線」頁(ADMIN-PRESENCE-EXEC-20260905 §2)
//
// 純記憶體 Map,唔碰 hymns.db / users.db 任何 schema。第一版接受 restart
// 就清零(§2 明文)。
//
// key:帶 token 嘅心跳(會員)以 `m:<userId>` 為 key;冇 token(訪客)以
// `g:<deviceId>` 為 key——同一 deviceId 登入前後唔會重複計:一登入,
// recordHeartbeat() 就會刪走嗰個 deviceId 之前留低嘅 guest entry(§1
// 「同一部機」)。
//
// 「連續在線」= 由 session 第一個心跳(firstSeen)起計,中斷 >180 秒
// (STALE_MS)就當新 session:sweep() 每次讀寫都先行,已經幫手剷咗嗰啲
// 斷咗線嘅 entry,所以 recordHeartbeat() 見到 store 度已經冇返嗰條(即
// 上次心跳距今 >180 秒)就自然當一個新 entry(firstSeen 重置),唔使
// 額外再判斷一次「距離上次幾耐」。

export const STALE_MS = 180 * 1000; // 180 秒 = 在線 / 連續在線 中斷門檻
export const MAX_ENTRIES = 5000; // 上限,超過就剷最舊(以 lastSeen 排)

const store = new Map();

function nowMs() {
  return Date.now();
}

// 剷 >STALE_MS 冇心跳嘅 entry。GET /api/admin/presence 同每次心跳之前都會
// call 一次(冇另開 setInterval——請求量本身就低頻,唔使背景 timer)。
export function sweep(t = nowMs()) {
  for (const [key, entry] of store) {
    if (t - entry.lastSeen > STALE_MS) store.delete(key);
  }
}

function evictOldestIfFull() {
  if (store.size < MAX_ENTRIES) return;
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [key, entry] of store) {
    if (entry.lastSeen < oldestTs) {
      oldestTs = entry.lastSeen;
      oldestKey = key;
    }
  }
  if (oldestKey != null) store.delete(oldestKey);
}

// state 白名單:'fg'(前台)| 'bg-playing'(背景播緊歌),其餘一律當 'fg'。
function normalizeState(state) {
  return state === 'bg-playing' ? 'bg-playing' : 'fg';
}

/**
 * 記一次心跳。
 * @param {{ userId?: number|null, deviceId?: string|null, state?: string }} params
 * @returns {boolean} 是否記錄成功(userId 同 deviceId 都冇就唔記,回 false)
 */
export function recordHeartbeat({ userId = null, deviceId = null, state } = {}, t = nowMs()) {
  sweep(t);
  const isMember = userId != null;
  if (!isMember && !deviceId) return false; // 兩者都冇——冇嘢好記
  const key = isMember ? `m:${userId}` : `g:${deviceId}`;

  // 同一部機登入前後唔重複計(§1):member 心跳一入嚟,就順手清走呢個
  // deviceId 之前留低嘅 guest entry。
  if (isMember && deviceId) {
    store.delete(`g:${deviceId}`);
  }

  const existing = store.get(key);
  const firstSeen = existing ? existing.firstSeen : t; // sweep() 已行過,existing 存在即代表未斷線
  if (!existing) evictOldestIfFull();
  store.set(key, {
    kind: isMember ? 'member' : 'guest',
    userId: isMember ? userId : null,
    deviceId: deviceId || null,
    state: normalizeState(state),
    firstSeen,
    lastSeen: t,
  });
  return true;
}

/**
 * 讀返 admin 頁要嘅快照。`resolveMemberName(userId)` 由 caller 傳入
 * (route 層負責查 users 表攞名/電話,presence.js 本身唔識 users schema)。
 */
export function getPresenceSnapshot(resolveMemberName, t = nowMs()) {
  sweep(t);
  const members = [];
  let guestCount = 0;
  for (const entry of store.values()) {
    if (entry.kind === 'guest') {
      guestCount++;
      continue;
    }
    members.push({
      id: entry.userId,
      name: (resolveMemberName && resolveMemberName(entry.userId)) || `會員 #${entry.userId}`,
      state: entry.state,
      onlineSince: new Date(entry.firstSeen).toISOString(),
      durationSec: Math.max(0, Math.round((t - entry.firstSeen) / 1000)),
    });
  }
  members.sort((a, b) => b.durationSec - a.durationSec);
  return {
    now: new Date(t).toISOString(),
    online: { total: members.length + guestCount, members: members.length, guests: guestCount },
    members,
  };
}

// harness/測試專用:清空、量 size,唔喺 route 用到。
export function _resetForTest() {
  store.clear();
}
export function _sizeForTest() {
  return store.size;
}
