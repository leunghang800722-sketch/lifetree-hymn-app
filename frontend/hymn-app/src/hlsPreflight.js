// src/hlsPreflight.js — HLS-PREFLIGHT-EXEC-20260907 §1.1
//
// 背景:Eric 09-07 07:04/07:05 兩次跳歌嘅根源鏈係 googlevideo 檔頭 403(一分鐘
// 節流窗)→ backend `/api/stream/:id.m3u8` 重試 14 秒先回 404 → App 要等
// PlaybackError 先降級去 progressive → 嗰段等嘅時間撞正 native 16 秒看門狗,
// 睇落係「跳歌」。呢個 module 想令 App 喺 `TrackPlayer.add()` 之前,自己去
// 「摸一摸」個 `.m3u8` playlist 攞唔攞到,攞唔到就即刻用 progressive URL,
// 唔使等 native 出事先反應。
//
// 🔴 紅線(§0):呢個 module 完全獨立、純函式 + fetch,唔碰任何 watchdog /
// stall / nudge / rescue / hlsStartupKick 邏輯,亦唔負責「幾時要 call」——
// call 唔 call、call完點做全部由 App.js 決定,呢度淨係答「呢條 playlist URL
// 攞唔攞到」。
//
// 鐵律(同 clientLog.js/logDiag 一致):永遠唔 throw、唔重試 —— 診斷/預檢
// 本身唔可以拖累播放決策以外的任何嘢。

import { sendClientLog } from './clientLog.js';

// preflightHls(url, opts) → Promise<{ ok, status, ms, reason }>
//   ok     — true = 2xx 且 body 頭幾百 byte 見到 `#EXTM3U`
//   status — HTTP status(攞到嘅話),攞唔到(timeout/network)就 null
//   ms     — 由發出 request 到有結果嘅耗時
//   reason — !ok 先有意義:`status:<n>` / `timeout` / `network` / `not-m3u8`
//
// opts:
//   timeoutMs — 預設 5000(§1.1 spec)
//   hymnId    — beacon 用,冇傳就 null
//   ctx       — beacon 用,`start`(playQueue 起播)或 `next`(滾動預熱),
//               冇傳就 'start'
export async function preflightHls(url, opts = {}) {
  const { timeoutMs = 5000, hymnId = null, ctx = 'start' } = opts;
  const t0 = Date.now();
  let result;
  let controller;
  let timer;
  try {
    controller = new AbortController();
    timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs);
    let res;
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal });
    } catch (e) {
      const ms = Date.now() - t0;
      const isAbort = e && (e.name === 'AbortError' || String(e.message || '').toLowerCase().includes('abort'));
      result = { ok: false, status: null, ms, reason: isAbort ? 'timeout' : 'network' };
      return result;
    }
    const ms = Date.now() - t0;
    if (!res || !res.ok) {
      result = { ok: false, status: res ? res.status : null, ms, reason: `status:${res ? res.status : 'unknown'}` };
      // 唔使個 body 拖住條連線——攞唔到就算數,唔理個 body。
      try { await res?.body?.cancel?.(); } catch (_) {}
      return result;
    }
    // 唔使讀晒份 playlist:HLS playlist 本身好細(18-66 條 segment 行,實測
    // 通常幾百 bytes 到幾 KB),`#EXTM3U` 一定喺開頭幾個 byte,`res.text()`
    // 讀嘅就係呢個細檔,唔會拖到「額外延遲 ≈ 一次 RTT」呢個目標(§1.2)。
    let text = '';
    try { text = await res.text(); } catch (_) { text = ''; }
    const head = text.slice(0, 500);
    if (head.indexOf('#EXTM3U') !== -1) {
      result = { ok: true, status: res.status, ms: Date.now() - t0, reason: null };
    } else {
      result = { ok: false, status: res.status, ms: Date.now() - t0, reason: 'not-m3u8' };
    }
    return result;
  } catch (e) {
    // 保底:上面已經逐段 try/catch,呢層純粹確保呢個 function 真係「永不 throw」。
    result = { ok: false, status: null, ms: Date.now() - t0, reason: 'network' };
    return result;
  } finally {
    try { if (timer) clearTimeout(timer); } catch (_) {}
    try {
      sendClientLog('hlsPreflight', {
        hymnId,
        detail: `ok=${result?.ok ? 1 : 0} status=${result && result.status != null ? result.status : '-'} ms=${result ? result.ms : -1} reason=${result && result.reason ? result.reason : 'ok'} ctx=${ctx}`,
      });
    } catch (_) {}
  }
}
