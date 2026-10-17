// HLS-EXEC-D123-GATE-20260901 P3 — 單機 gate 用嘅 JS deviceId。
//
// 設計(Fable5 拍板,唔好自行改):app 啟動時由 AsyncStorage 讀
// `odelyDeviceId`,冇就生成一個持久隨機 id(16+ hex)存返。**唔准用任何真實
// 硬件識別碼**——純 app 內隨機,重裝/清 app data 會換新 id(呢個係刻意
// 行為,唔係 bug:Stage D 淨開俾 Eric 一部機,佢裝 build 之後由 client-log
// 撈返個 id 手動填入 live app-version.json 嘅 hlsDeviceIds)。
//
// 呢個 module 出兩個用途:
//   1. App.js HLS boot effect 打 `/api/app-version?d=<deviceId>`(單機 gate);
//   2. logDiag() 每條 client-log 都帶,順手堵「兩部機寫同一份 log 分唔開」
//      舊病(見 memory project-multi-sim-clientlog-contamination)。
//
// `getOrCreateDeviceId()` 嘅核心邏輯特登寫成一個獨立、可以逐字 slice 落
// harness 測嘅 async function(唔靠模組頂層 side effect),`AsyncStorage` 淨係
// 喺呢個 function 嘅頂層 import,測試時用 `new Function('AsyncStorage', ...)`
// 注入 mock,唔使起 RN 環境。
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEVICE_ID_KEY = 'odelyDeviceId';

// 純 app 內隨機,兩段 Math.random 拼,遠超 16 hex 下限(實際 32 hex)。
export function generateDeviceId() {
  const part = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return part() + part() + part() + part();
}

let _deviceIdPromise = null;

// 讀返/生成 deviceId。用一個模組級 promise 記憶結果,同一次 app 生命週期入面
// 唔理幾多個 caller 都 converge 去同一個值(避免兩個 effect 同時 miss cache
// 各自生成、各自寫入 AsyncStorage 嘅 race)。
export function getOrCreateDeviceId() {
  if (!_deviceIdPromise) {
    _deviceIdPromise = (async () => {
      try {
        const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
      } catch (_) {}
      const id = generateDeviceId();
      try { await AsyncStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
      return id;
    })();
  }
  return _deviceIdPromise;
}
