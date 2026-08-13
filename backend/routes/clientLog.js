// routes/clientLog.js — STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇(2026-08-13)
// 「鎖屏播25分鐘之後停」查到一半:client 端 watchdog 決策嗰刻嘅 state(position/
// duration/appState/repeatMode)冇任何地方存低,TestFlight build 冇人拎住 Xcode
// 駁住部機,console.warn 全部飛咗——下次撞到都係一樣飛盲。
//
// 呢度加一個極簡、無認證(watchdog 觸發嗰刻好可能已經冇好网络,唔應該再要求
// 一個完整 authed request 先俾過)嘅 fire-and-forget beacon,淨係 append 一行
// log 落 backend 已有嘅 stdout(同 [stream] log 走同一條管——已經證明呢條管
// 好用,唔另起爐灶)。刻意唔存 DB、唔查 users.db 對身份——呢個係診斷用嘅
// observability helper,唔係業務 API。
import { Router } from 'express';

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
        detail: String(b.detail || '').slice(0, 120),
      };
      logLine(safe);
    } catch (_) {
      // 診斷 beacon 本身唔可以拖累/整壞任何嘢——壞咗就靜靜哋算。
    }
    res.status(204).end();
  });

  app.use('/api/client-log', router);
}
