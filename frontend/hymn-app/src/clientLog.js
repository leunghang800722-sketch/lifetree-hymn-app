// src/clientLog.js — DEEP-AUDIT-W1-EXEC-20260906 F1
//
// 背景(DEEP-AUDIT-ROOTCAUSE-20260906 §C1「遙測儀器碎片化」):呢個 codebase
// 有四套互不相干嘅 client-log 送信實作(App.js logDiag() / src/perfMarks.js /
// src/track-player-service.js / src/audioPrefetch.js),各自喺唔同時間長出嚟,
// 只有頭兩套帶 platform/deviceId,另外兩套乜都冇帶。結果係 1E 真機報告嘅
// 幾條「已知限制」全部源自呢度(帶 platform 嘅 row 淨係 37%、44 個測試
// deviceId 要人手剔、A-6 冇 before/after 切分維度)。
//
// 呢個 module 係單一送信層,四套實作全部收斂用佢——原有嘅閘邏輯(DIAG_ENABLED
// / always、perfMarks 自己嘅排程/detail 組裝)全部留喺 caller 度,呢度**只做
// 送信 + 強制注入公共欄位**,唔理業務邏輯。
//
// 強制注入(每條 event 保證齊):
//   platform   — Platform.OS
//   deviceId   — src/deviceId.js 現有 getter(app 內隨機,非硬件識別碼)
//   appVersion — expo-constants app.json 版本號
//   updateId   — expo-updates Updates.updateId(冇 embed updates config /
//                __DEV__ 就 'dev';有 updates config 但仲未收到過 update
//                就 'embedded')——令之後每一波 OTA 都自動有 before/after
//                切分維度(1E §3.2 冇 before 嗰個結構性問題由呢度解)。
//   sessionId  — module load(= 一次冷開)生成一次嘅 16-hex 隨機 id,令同一次
//                開機嘅 event 可以歸組,唔使再靠時間戳夾(見 memory
//                project-multi-sim-clientlog-contamination 嘅教訓)。
//
// 鐵律(同 App.js 原 logDiag()/perfMarks.js 一致):fire-and-forget,永遠唔
// await、唔 throw、唔重試——診斷本身唔可以拖累/整壞播放。

import { Platform } from 'react-native';
import { API_BASE } from './config.js';
import { getOrCreateDeviceId } from './deviceId.js';

// 兩段 Math.random 拼,16 hex(64-bit,夠用),同 deviceId.js generateDeviceId() 手法一致但
// 完全獨立(唔可以撈亂——deviceId 係跨 app 生命週期持久,sessionId 淨係呢次
// 冷開)。
function genSessionId() {
  const part = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return part() + part();
}

// module load 一次過生成——即係每次冷開(bundle 重新 evaluate)先會換新值。
const SESSION_ID = genSessionId();

let _deviceIdPromise = null;
function resolveDeviceId() {
  if (!_deviceIdPromise) {
    _deviceIdPromise = getOrCreateDeviceId().catch(() => null);
  }
  return _deviceIdPromise;
}

let _appVersion; // undefined = 未計過,計過之後可以係字串
function resolveAppVersion() {
  if (_appVersion !== undefined) return _appVersion;
  try {
    // guarded require(唔用 top-level import)——同 App.js 對 expo-application
    // 嘅做法一致,避免呢個模組本身喺任何冇 expo-constants native module 嘅
    // 環境(例如 headless registerPlaybackService context)直接 throw。
    // eslint-disable-next-line global-require
    const Constants = require('expo-constants').default;
    _appVersion = String((Constants && Constants.expoConfig && Constants.expoConfig.version) || 'unknown');
  } catch (_) {
    _appVersion = 'unknown';
  }
  return _appVersion;
}

let _updateId; // undefined = 未計過
function resolveUpdateId() {
  if (_updateId !== undefined) return _updateId;
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      _updateId = 'dev';
    } else {
      // eslint-disable-next-line global-require
      const Updates = require('expo-updates');
      // 冇 embed updates config(例如 dev client/未配置 runtimeVersion)嗰陣
      // Updates.updateId 本身就係 undefined/null——當 'dev' 處理(F1 spec)。
      _updateId = Updates && Updates.updateId ? String(Updates.updateId) : 'embedded';
    }
  } catch (_) {
    _updateId = 'dev';
  }
  return _updateId;
}

// event: string
// fields: object —— caller 自己嘅 payload(例如 hymnId/detail/appState/
//         trackState),同強制注入欄位合併(caller 唔准用同名 key 覆蓋強制
//         注入嘅五個欄位,但冇強制檢查——遵守呢個慣例係 caller 責任)
// opts: 保留俾 caller 傳送信相關選項(現時未有任何行為分支依賴呢個參數;
//       DIAG_ENABLED/always 呢類閘邏輯留喺 caller 自己度判斷,唔喺呢度)
export function sendClientLog(event, fields = {}, opts = {}) {
  try {
    resolveDeviceId()
      .then((deviceId) => {
        try {
          const body = {
            event,
            clientTs: new Date().toISOString(),
            platform: Platform.OS,
            deviceId: deviceId || null,
            appVersion: resolveAppVersion(),
            updateId: resolveUpdateId(),
            sessionId: SESSION_ID,
            ...fields,
          };
          fetch(`${API_BASE}/api/client-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => {});
        } catch (_) {}
      })
      .catch(() => {});
  } catch (_) {}
}
