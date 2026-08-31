// routes/clientLog.js — STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇(2026-08-13)
// 「鎖屏播25分鐘之後停」查到一半:client 端 watchdog 決策嗰刻嘅 state(position/
// duration/appState/repeatMode)冇任何地方存低,TestFlight build 冇人拎住 Xcode
// 駁住部機,console.warn 全部飛咗——下次撞到都係一樣飛盲。
//
// 呢度加一個極簡、無認證(watchdog 觸發嗰刻好可能已經冇好网络,唔應該再要求
// 一個完整 authed request 先俾過)嘅 fire-and-forget beacon,淨係 append 一行
// log 落 backend 已有嘅 stdout(同 [stream] log 走同一條管——已經證明呢條管
// 好用,唔另起爐灶)。唔查 users.db 對身份——呢個係診斷用嘅 observability
// helper,唔係業務 API。
//
// 2026-08-17 補:stdout 經 launchd 轉去 /tmp/hymn_backend.log,而 macOS 開機
// 會清 /tmp——8/15-17 三日數據因為一次整機重啟全部蒸發,冇第二份底。而家
// 除咗 stdout(即時 tail 用)之外,再多寫一份持久化落 backend/logs/client-log/
// (lib/clientLogStore.js,同 admin-audit.log 一樣嘅豁免目錄,唔會俾 /tmp
// 清走影響),有 rotation + size 上限,保證至少 14 日資料唔清。
import { Router } from 'express';
import { appendClientLog } from '../lib/clientLogStore.js';

function logLine(fields) {
  console.log(`[client-log] ${new Date().toISOString()} ${Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`);
}

export default function clientLogRoutes(app) {
  const router = Router();

  router.post('/', (req, res) => {
    try {
      const b = req.body || {};
      // 白名單 + 截斷:呢個 endpoint 冇認證,唔信任何 client 傳嚟嘅字串長度/類型。
      const safe = {
        event: String(b.event || '').slice(0, 64),
        clientTs: String(b.clientTs || '').slice(0, 40),
        appState: String(b.appState || '').slice(0, 20),
        hymnId: Number.isFinite(b.hymnId) ? b.hymnId : null,
        position: Number.isFinite(b.position) ? Math.round(b.position * 100) / 100 : null,
        duration: Number.isFinite(b.duration) ? Math.round(b.duration * 100) / 100 : null,
        trackState: String(b.trackState ?? '').slice(0, 20),
        repeatMode: Number.isFinite(b.repeatMode) ? b.repeatMode : null,
        errorSkipCount: Number.isFinite(b.errorSkipCount) ? b.errorSkipCount : null,
        // STARTUP-ROOTFIX-EXEC-BC-20260831 §2.4:native `beacon()` 嘅 detail
        // 加咗 loadedSec=/f=/etaSec=/bytesXfer=/likelyKeepUp=/sinceUseful= 六個
        // 新欄位之後,實測(見交付報告)worst case ~178 字,舊 120 上限會靜靜
        // truncate 埋新欄位——即係今次成個驗收要睇嘅數會憑空冇咗。300 留返
        // 充裕 headroom。
        detail: String(b.detail || '').slice(0, 300),
        // NATIVE-STALL-PROGRESS-PREDICATE-PLAN-20260831 v4 §4-3:JS logDiag()
        // 而家每條都帶 platform,等以後唔使再靠 ua= 反查對號分兩部機。
        platform: String(b.platform || '').slice(0, 10),
      };
      logLine(safe);
      appendClientLog(safe); // 持久化底(backend/logs/client-log/),唔會俾 /tmp 清走影響
    } catch (_) {
      // 診斷 beacon 本身唔可以拖累/整壞任何嘢——壞咗就靜靜哋算。
    }
    res.status(204).end();
  });

  app.use('/api/client-log', router);
}
