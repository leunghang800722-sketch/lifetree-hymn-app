// hooks/usePresenceHeartbeat.js — Admin「在線」頁(ADMIN-PRESENCE-EXEC-20260905 §3)
//
// App 每 60 秒 POST /api/presence/heartbeat;淨係「App 前台」或「背景播緊
// 歌」先送,背景冇播就 clearInterval(§1)。App 變 active 嗰刻即刻送一個。
// 有 token 就帶 Authorization(會員),冇就係訪客——deviceId 一定帶,俾
// backend 分辨「同一部機」。
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

export default function usePresenceHeartbeat({ token, isPlaying }) {
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const intervalRef = useRef(null);

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

    const sub = AppState.addEventListener('change', (nextState) => {
      const wasActive = AppState.currentState === 'active';
      if (nextState === 'active' && !wasActive) sendHeartbeat(); // 變 active 即刻送一個
      evaluate();
    });

    // mount 嗰刻(通常就係 active)都要即刻評估一次 + 送第一個心跳。
    evaluate();
    if (AppState.currentState === 'active') sendHeartbeat();

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
}
