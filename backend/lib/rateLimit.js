// backend/lib/rateLimit.js — 共用節流 helper（DEEP-AUDIT W2 §C6 第一步：純機械抽取）
//
// 根源（DEEP-AUDIT-ROOTCAUSE-20260906.md §C6）：`invites.js`/`share.js` 有一個
// 寫得啱嘅 per-IP sweep-on-threshold 節流範本，但佢係手抄擴散嘅——抄漏咗嘅
// route 就完全冇節流（CLOG-1 就係咁樣出事）。呢個檔案抽出嗰個範本俾之後
// 加嘅 route 有得直接用，唔使再手抄一次。
//
// ⚠️ 呢次抽取本身係**純機械**——`invites.js`/`share.js`/`presence.js`/
// `clientLog.js` 改用 makeLimiter() 之後，每個 route 嘅 max/windowMs 數字
// 一個都冇變（見 DEEP-AUDIT-W2-REPORT-20260906.md §2 H-B 逐個 harness 對照）。
//
// makeLimiter() 額外加咗 `maxEntries` 硬頂（揀最舊 entry 踢走）——呢個係
// C7「有 sweep-on-threshold 但冇格數硬頂」缺口嘅根治（presence.js 本身已經
// 有呢招，即 HEARTBEAT_RATE_MAP_MAX；invites.js/share.js/clientLog.js 之前
// 冇）。屬於「新加嘅安全網」，唔係「改咗邊個 route 嘅節流門檻」——B3 嘅
// harness 測試序列（同一 key 打 max+1、幾個唔同 key 各一次、過窗再打）
// 遠遠踫唔到呢條上限，唔會影響 before/after 布林序列比較。

/**
 * @param {object} opts
 * @param {string} opts.name          純用嚟 log/debug 識別，冇業務含義
 * @param {(req: any) => string} opts.keyOf  由 request 揀 key（例如 clientIp(req) 或 req.user.id）
 * @param {number} opts.max           窗口入面准嘅次數（第 max+1 次先 limited，同 invites.js `rec.count > max` 一致）
 * @param {number} opts.windowMs      窗口長度（由第一次擊中嗰刻起計，唔係 sliding window）
 * @param {number} [opts.sweepAt=5000]     Map size 大過呢個數,先行一次全表過期掃
 * @param {number} [opts.maxEntries=5000]  格數硬頂,掃完仲爆就踢最舊 entry(插入順序)
 * @returns {{ name: string, check: (req:any)=>boolean, size: ()=>number, reset: ()=>void }}
 */
export function makeLimiter({ name, keyOf, max, windowMs, sweepAt = 5000, maxEntries = 5000 }) {
  const hits = new Map(); // key -> { count, windowStart }

  function sweepExpired(now) {
    for (const [k, rec] of hits) {
      if (now - rec.windowStart > windowMs) hits.delete(k);
    }
  }

  function evictOverflow() {
    while (hits.size > maxEntries) {
      const oldestKey = hits.keys().next().value;
      if (oldestKey === undefined) break;
      hits.delete(oldestKey);
    }
  }

  function check(req) {
    const key = keyOf(req);
    const now = Date.now();
    if (hits.size > sweepAt) sweepExpired(now);
    const rec = hits.get(key);
    let limited;
    if (!rec || now - rec.windowStart > windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      limited = false;
    } else {
      rec.count++;
      limited = rec.count > max;
    }
    evictOverflow();
    return limited;
  }

  function size() { return hits.size; }
  function reset() { hits.clear(); }

  return { name, check, size, reset };
}

// ── 予「自己有 bespoke 決策邏輯，但底層 Map 冇 sweep/上限」嘅 caller 用 ──
//
// `lib/loginRateLimit.js` 嘅 perIp 限速（fail-count,唔係全部 request 都計)、
// `routes/otpAuth.js` 嘅 perPhone/perIp/global（cooldown + day-cap,唔係
// sliding window)、`routes/friends.js` 嘅 day-cap byUser（日曆日重置）—— 呢
// 三種決策邏輯同 makeLimiter() 嘅「count 全部 request、window 由第一擊起計」
// 語意本質上唔同，唔可以直接逼佢哋用 check(req)（逼咗會改咗行為，違反
// DEEP-AUDIT-W2-EXEC §1 Commit B 紅線「threshold 一個數字都唔准變」）。
//
// 呢個 helper 淨係幫佢哋現有嗰個 Map 加返「大到某個閾值先掃一次過期 entry
// + 格數硬頂」，同 makeLimiter() 用緊嘅一樣字眼、一樣語意，但完全唔逼佢哋
// 嘅決策 function 改形狀——`isLocked`/`recordFail`/`checkRate`/day-cap
// 呢啲函數嘅輸入輸出，call 之前同之後逐 bit 一樣。
/**
 * @param {Map<any, any>} map
 * @param {object} opts
 * @param {number} [opts.sweepAt=5000]
 * @param {number} [opts.maxEntries=5000]
 * @param {(rec:any, now:number)=>boolean} opts.isExpired
 */
export function sweepOnThreshold(map, { sweepAt = 5000, maxEntries = 5000, isExpired }) {
  const now = Date.now();
  if (map.size > sweepAt) {
    for (const [k, rec] of map) {
      if (isExpired(rec, now)) map.delete(k);
    }
  }
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}
