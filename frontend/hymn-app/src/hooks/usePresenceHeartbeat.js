// hooks/usePresenceHeartbeat.js — Admin「在線」頁(ADMIN-PRESENCE-EXEC-20260905 §3,
// 2026-09-05 Opus 5 驗收 P1/P2/P4 修復)
//
// App 每 60 秒 POST /api/presence/heartbeat;淨係「App 前台」或「背景播緊
// 歌」先送,背景冇播就 clearInterval(§1)。App 變 active 嗰刻即刻送一個
// (P1,唔靠 AppState.currentState/wasActive 比較)。有 token 就帶
// Authorization(會員),冇就係訪客——deviceId 一定帶,俾 backend 分辨
// 「同一部機」。token 由 null↔有值轉變(登入/登出)即刻補送一個心跳
// (P2/P4),唔使等落一次 60 秒 interval 先變返啱嘅身份。
//
// deviceId 唔靠 caller 傳入:`getOrCreateDeviceId()`(src/deviceId.js)本身
// 就係一個 module 級記憶 promise,設計俾任何 caller 隨時攞、自動 converge
// 去同一個值(見該檔頂部註解),同 App.js:4139 嗰個獨立 useEffect 唔會撞。
// 呢度直接 call 一次,唔使 AppContent 額外開 state/effect 先傳落嚟——維持
// 「AppContent 掛一行」嘅要求(執行單§3),亦唔使掂 PlayerProvider。
//
// 全部行為 try/catch,失敗靜默(同 postHeartbeat() 本身一致嘅診斷 beacon
// 態度,一個心跳失敗唔可以拖累 app)。
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { postHeartbeat } from '../api';
import { getOrCreateDeviceId } from '../deviceId';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const ACTIVE_SEND_DEDUP_MS = 5000; // 防「變 active」連環觸發(P1);Opus2 N2:100ms 太短,一分鐘切 40 次前後台會自己燒晒 IP 配額,5 秒內只送一次

export default function usePresenceHeartbeat({ token, isPlaying }) {
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const intervalRef = useRef(null);
  const lastActiveSendRef = useRef(0);

  const sendHeartbeat = useRef(async () => {
    try {
      const isActive = AppState.currentState === 'active';
      // 冇 active 就要睇緊播緊歌(背景播放)先送;兩者都冇就係「背景 + 冇播」,
      // caller(下面 evaluate())本身唔會喺呢個狀態開 interval,但呢個
      // guard 留低做多一層保險(例如 interval 喺清之前最後一 tick 撞入嚟)。
      const isBgPlaying = !isActive && isPlayingRef.current;
      if (!isActive && !isBgPlaying) return;
      const deviceId = await getOrCreateDeviceId();
      await postHeartbeat(tokenRef.current, deviceId, isActive ? 'fg' : 'bg-playing');
    } catch (_) {
      // 靜默——心跳失敗唔可以影響任何嘢
    }
  }).current;

  useEffect(() => {
    const clearIntervalIfAny = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const ensureInterval = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };
    // 開/停 interval 嘅判斷淨係睇「而家仲需唔需要送心跳」,唔理邊個觸發
    // (前後台切換 / isPlaying 轉變都經呢個共用判斷)。
    const evaluate = () => {
      const isActive = AppState.currentState === 'active';
      if (isActive || isPlayingRef.current) ensureInterval();
      else clearIntervalIfAny();
    };

    // P1(Opus 5 驗收 3d FAIL 已修):唔再靠 AppState.currentState 同
    // wasActive 比較——RN 喺呢個 listener 跑之前已經自己更新咗
    // currentState(module init 個內部 listener 一定排喺 app code 後來
    // addEventListener 之前),令 `nextState === 'active' && !wasActive`
    // 結構上永遠 false(見 ADMIN-PRESENCE-OPUS-20260905.md §3d 根因、負控
    // F5 實測)。改為直接信 handler 收到嗰個 nextState 本身;guard 唔係
    // 防「已經 active」,淨係防 100ms 內連環觸發送兩次。
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastActiveSendRef.current >= ACTIVE_SEND_DEDUP_MS) {
          lastActiveSendRef.current = now;
          sendHeartbeat(); // 變 active 即刻送一個
        }
      }
      evaluate();
    });

    // mount 嗰刻(通常就係 active)都要即刻評估一次 + 送第一個心跳。
    evaluate();
    if (AppState.currentState === 'active') {
      lastActiveSendRef.current = Date.now();
      sendHeartbeat();
    }

    return () => {
      sub.remove();
      clearIntervalIfAny();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isPlaying 轉變(背景播緊歌 → 停播)要即刻重新評估要唔要開/停 interval,
  // 唔等落一次 AppState change 先反應(用戶背景聽歌聽到尾,停咗就應該即刻
  // 停心跳)。
  useEffect(() => {
    const isActive = AppState.currentState === 'active';
    if (isActive || isPlaying) {
      if (!intervalRef.current) intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isPlaying, sendHeartbeat]);

  // P2/P4(Opus 5 驗收 2b′ FAIL 已修):token 由 null → 有值(登入,可能係
  // 冷開機 AsyncStorage 讀值遲過呢個 hook mount)或由有值 → null(登出),
  // 都即刻補送一個心跳,唔等落一次 60 秒 interval 先變返啱嘅 member/guest
  // 身份。sendHeartbeat() 內部本身有 isActive/isBgPlaying guard,呢度唔使
  // 再判斷一次前後台狀態。prevTokenRef 初值同 token 一樣,所以 mount 嗰次
  // 唔會誤觸發多送一個(mount 個心跳已經由上面 effect1 負責)。
  const prevTokenRef = useRef(token);
  useEffect(() => {
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = token;
    if (prevToken === token) return;
    sendHeartbeat();
  }, [token, sendHeartbeat]);
}
