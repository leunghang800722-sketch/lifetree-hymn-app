import { useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';
import { API_BASE } from '../config.js';
import { createExternalStore } from './externalStore.js';

let storage = null;
function getStorage() {
  if (!storage) {
    try { storage = new MMKV(); } catch (e) { console.warn('MMKV init:', e); }
  }
  return storage;
}

// BATCH5 O7:改用 AbortController——舊嘅 Promise.race 逾時之後底層 fetch
// 連線唔會斷,慢網下會同 retry(fetchAllHymnsWithRetry)疊住背景繼續拉多
// 幾份全量。而家逾時會真 abort 底層 fetch,throw 嘅係 AbortError(唔再
// 係自製 Error)——呢度全部 caller(fetchAllHymns/fetchVersion)已核實
// 只 catch 完回 null/空,冇人讀 error message,語義安全。
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchAllHymns() {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/hymns`);
    if (!r.ok) return { hymns: [], dataVersion: null };
    const body = await r.json();
    const d = body?.data || body;
    return { hymns: Array.isArray(d) ? d : [], dataVersion: body?.dataVersion ?? null };
  } catch (e) {
    return { hymns: [], dataVersion: null };
  }
}

// 開機第一次揸全量歌單:冷網絡(DNS/TLS 握手)偶爾要幾秒,單試一次逾時就當
// 「攞唔到」太進取——會令冇 cache 嘅開機(新裝 / 清咗 data)一撞板就閃「網絡
// 斷咗」,但其實得返嗰一嘢request慢咗,唔係真係冇網。失敗先重試多一次先真係
// 當攞唔到。
async function fetchAllHymnsWithRetry() {
  const first = await fetchAllHymns();
  if (first.hymns.length > 0) return first;
  return fetchAllHymns();
}

// dataVersion cache-bust(SUPERVISION-LOG 2026-07-27 18:00)—— 24 小時內兩單
// 「DB/API 一早啱,App 顯示 MMKV 舊 cache」事故都係因為:開 App 一路都係
// 「照畫 cache + 背景全量 refresh」,冇辦法知 cache 係咪已經過時,亦冇壓力
// 逼佢一定要 refresh。而家用 /api/version(超平,唔讀 DB)嚟判斷:
// version 唔同(或者根本冇存過 version)先做全量 fetch;相同就跳過,慳返
// 每次開 App 都全量拉嘅流量。/api/version 攞唔到(斷網/舊 backend 未部署呢個
// endpoint)就 fallback 返舊行為 —— 無條件背景 refresh,唔可以行為變差。
async function fetchVersion() {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/version`);
    if (!r.ok) return null;
    const body = await r.json();
    return body?.dataVersion ?? null;
  } catch (e) {
    return null;
  }
}

// O1-O2-REPLAN-20260819.md §2.2 —— 呢個 hook 舊版每個 mount instance 都有
// 自己嗰份 useState + useEffect,獨立行足一次 refresh()(MMKV JSON.parse 幾
// MB + /api/version + 可能全量 /api/hymns),App.js 同 MineScreen.js 兩邊各自
// mount 一次,即係開機成套流程行足兩次。舊版(c9bd715)試過改做「module-level
// singleton state + useState 影一份 snapshot + useEffect 補訂閱」嚟慳呢個
// 重複,但呢個 pattern 喺 render 同 effect 之間有窗口:child 喺 parent 訂閱
// 到之前就同步 broadcast 咗,parent 永久錯過(P0,已 revert)。而家改用 React
// 內建 useSyncExternalStore(uSES)—— 佢嘅 mount effect 內部規定咗要對比
// 「render 嗰刻讀到嘅 snapshot」同「而家 store 嘅 snapshot」,唔同就強制
// re-render,呢個窗口喺 React 承諾嘅行為入面已經冚咗。
//
// `refreshKicked` 保證成套 MMKV read + network refresh 全 app 生命週期淨係
// 行一次(第一個掛嘅 hook instance 觸發);之後 mount 嘅 instance 只係加入
// store 訂閱,唔會重複整套流程。
const hymnsStore = createExternalStore({ hymns: null, loading: true });

let refreshKicked = false;

// Admin 寫入完成即刻刷新用(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)——admin API
// response 已經帶埋新 dataVersion,唔使再問一次 /api/version。改完自己部機即時
// 見到;其他裝置跟現有 pull-on-open 機制下次開 app 見到)。
export function notifyHymnsChanged(serverDataVersion) {
  (async () => {
    const s = getStorage();
    const cachedVersion = s ? s.getString('allHymnsVersion') : null;
    if (serverDataVersion != null && cachedVersion === serverDataVersion) return; // 冇改
    const { hymns: fresh, dataVersion } = await fetchAllHymns();
    if (fresh && fresh.length > 0) {
      if (s) {
        s.set('allHymns', JSON.stringify(fresh));
        s.set('allHymnsVersion', dataVersion ?? serverDataVersion ?? '');
      }
      hymnsStore.setState({ hymns: fresh });
    }
  })().catch(() => {});
}

function kickRefreshOnce() {
  if (refreshKicked) return; // singleton 已經有第一個 instance 行緊/行完
  refreshKicked = true;

  const s = getStorage();

  // Try MMKV cache first (non-blocking — even if MMKV fails, we show content)
  let cachedVersion = null;
  let hadCache = false;
  if (s) {
    try {
      const cached = s.getString('allHymns');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hymnsStore.setState({ hymns: parsed });
          hymnsStore.setState({ loading: false });
          hadCache = true;
        }
      }
      cachedVersion = s.getString('allHymnsVersion') || null;
    } catch (e) {}
  }
  // 冇 cache(新裝 / 清咗 data)就唔可以即刻收 loading——首頁淨係睇
  // hymns.length 嚟判斷「網絡斷咗」(HomeScreen.js),loading 一早收咗
  // 會令個「攞緊緊」窗口睇落好似「已經攞完 = 冇網」,喺網絡正常都會
  // 閃一嘢錯誤畫面。要等第一次網絡攞到結果(成功或者真係失敗)先收。

  async function refresh() {
    const serverVersion = await fetchVersion();

    // 冇 cache 嘅時候一定要做一次全量 fetch,唔可以因為 version 啱就 skip
    // ——嗰個 skip 係「慳流量」用嘅,前提係已經有嘢喺畫面度顯示緊。
    const canSkip = hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion;
    if (!canSkip) {
      const { hymns: fresh, dataVersion } = await fetchAllHymnsWithRetry();
      if (fresh && fresh.length > 0) {
        if (s) {
          s.set('allHymns', JSON.stringify(fresh));
          s.set('allHymnsVersion', dataVersion ?? serverVersion ?? '');
        }
        hymnsStore.setState({ hymns: fresh });
      }
    }
    if (!hadCache) hymnsStore.setState({ loading: false });
  }

  refresh().catch(() => { if (!hadCache) hymnsStore.setState({ loading: false }); });
}

export const useCachedHymns = () => {
  const { hymns, loading } = hymnsStore.useStore();
  useEffect(() => { kickRefreshOnce(); }, []); // 第一個 mount 嘅 instance kick
  return { hymns: hymns || [], loading }; // API 對外完全不變
};
