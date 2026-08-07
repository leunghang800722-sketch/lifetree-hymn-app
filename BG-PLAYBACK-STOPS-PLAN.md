# 背景/鎖屏播放「3-4 首之後自動停」診斷 + 修復規劃(2026-08-07)

> Eric 報告:「呢 2 日聽歌開住 app 聽完全無問題，但如果按 home 鍵退出咗 app 聽同鎖電話
> 屏幕聽，大約聽到 3 至 4 首歌就會自動停咗。」
> 本文件係**診斷結論 + 規劃**,未改任何 code、未部署任何嘢。

---

## 0. TL;DR

**「3-4 首」唔係巧合,係兩個寫死嘅數字啱啱好夾埋:**

| 數字 | 出處 | 效果 |
|---|---|---|
| **4** | `App.js:1092` — `warmIds(finalList.slice(startIndex+1, startIndex+4))` | 起播嗰刻淨係預熱**而家嗰首 + 之後 3 首** = 頭 4 首保證 warm |
| **3** | `App.js:709-714` — `errorSkipCountRef >= 3` → `TrackPlayer.pause()` + Alert | 連續 3 首載入失敗 → **App 自己叫停播放** |

即係:**第 5 首開始係冷歌**(要即場 yt-dlp resolve),而冷歌實測要 3–5.6 秒先出到第一個
byte,ExoPlayer 總共得 8 秒 timeout。背景/鎖屏之下網絡 headroom 一冇(Wi-Fi power save /
流動網絡 RRC idle / Doze),第 5、6、7 首連續 timeout → 撞到個 3 次熔斷器 → **`pause()`**。
Alert 喺背景彈唔到俾人睇,所以 Eric 淨係見到「自動停咗」。

**點解偏偏係呢 2 日先出現:**詩歌庫 8 日內由 1,744 首暴漲到 **6,196 首**(8/1 加 1023、
8/2 加 810、8/3 加 596、8/4 加 620、8/5 加 647),但 URL cache 得 **427 條(7%)**,
warmColdBacklog 每日淨係暖 150 首、上限 1800。**自動播放隨機尾巴而家 93% 係冷歌。**
以前庫細,尾巴多數撞到 warm 歌,所以睇唔出;而家幾乎首首都要即場 resolve。

**同 `830066e` / `09a5fa1` 兩個 FGS patch 冇關係**(已排除,見 §3)。

---

## 1. 證據(全部實測,唔係推論)

### 1.1 預熱窗口得 3 首,而且係一次性、唔會滾動

`warmIds()` 全個 codebase 得 **2 個 caller**:
- `App.js:1092` — `playQueue()` 起播之後,warm `startIndex+1 … startIndex+3`(3 首)
- `App.js:2322` — 開 App 一次性 warm「今日為你預備」6 首

**`PlaybackActiveTrackChanged` 入面完全冇 warm**(`App.js:650-680`)。即係播到第 4 首之後
再冇任何預熱,第 5 首起全部要 ExoPlayer 即場等 backend cold resolve。

### 1.2 熔斷器係 App 入面唯一一段會自己叫停播放嘅碼

```js
// App.js:707-715
errorSkipCountRef.current += 1;
if (errorSkipCountRef.current >= 3) {
  await TrackPlayer.pause().catch(() => {});
  Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
  errorSkipCountRef.current = 0;
  return;
}
```
計數器只有喺 `PlaybackState` 真係報 `Playing` 先歸零(`App.js:637`),所以要**連續 3 首**
失敗先觸發。每首失敗嘅成本 = 8s timeout + `TrackPlayer.retry()` 再 8s ≈ 16s,
即係熔斷喺 ~1 分鐘內完成 —— 用戶感覺就係「聽咗幾首,突然停咗」。

### 1.3 詩歌庫撳一首歌 = 1 首明確 + 30 首全庫隨機

`playSingle()`(`App.js:901-940`)→ 自動播放開住 → `buildAutoplayTail(..., RADIO_LEN=30)`
由 **全庫 uniform/加權抽樣**(`src/utils/autoplay.js:86`)。DB 睇返:6196 首全部
`curated=1` / `status='ok'`,**冇任何過濾**,所以尾巴 = 全庫隨機。

### 1.4 全庫 93% 係冷歌,而且仲惡化緊

| | 數字 |
|---|---|
| 詩歌庫總數 | **6,196**(backend 記憶體副本 5,408,見 §5 附註) |
| `resolve-cache.json` 未過期 URL | **427** |
| 覆蓋率 | **6.9%** |
| `warmColdBacklog` 速度 | 每 90 秒 1 首、每日上限 **150**、總量封頂 **1800** |
| 追平需時 | 以 150/日 計要 **38 日**,而且封頂 1800 = 永遠追唔到 6196 |

而且兩個 keep-warm timer 都有 `if (anyStreaming()) return;`(`server.js:262, 329`)——
**Eric 一路聽歌,warm job 就完全唔行**。聽得越耐,cache 越凍。

### 1.5 冷歌實測延遲(2026-08-07,喺 backend 本機直接量)

隨機抽 20 首(模擬自動播放尾巴),`GET /api/stream/:id` 唔帶 Range(同 ExoPlayer 第一個
request 一樣):

| 結果 | 數目 | TTFB |
|---|---|---|
| 200 成功 | 17 | 0.6s(warm)/ **3.1–5.6s(冷)** |
| 502 resolve 失敗 | 1 | 12.0s |
| 404(backend 記憶體副本未有呢首,見 §5) | 2 | — |

**冷歌典型 3–5.6 秒,ExoPlayer 得 8 秒 budget** → 前台 headroom 只得 2.4–4.9 秒,
背景/鎖屏網絡一慢就即刻爆。硬失敗率 ~6%(1/18)。

### 1.6 Backend log 對呢個失敗模式完全盲

`/tmp/hymn_backend.log` 由 8/5 09:00 重啟到而家:**0 條 `stream upstream bad status`、
0 條 403、1 條 resolve failed**。但呢個唔代表冇事 —— `routes/stream.js:106` 寫明:

```js
if (controller.signal.aborted) throw e; // 客戶端自己走咗,唔使 retry/log
```

**ExoPlayer 8 秒 timeout 走人 = client abort = 一個字都唔會 log。** 加上成個 log 冇
timestamp,即係我哋而家對「Eric 部機幾時、邊首歌、幾耐 timeout」係 100% 飛盲。
呢個係要即刻補嘅觀測缺口(§4 Fix D)。

---

## 2. 完整因果鏈

```
詩歌庫 8 日內 1744 → 6196 首(album backfill / growLibrary)
        │
        ▼
URL cache 停留喺 427 條(warm job 150/日 + 封頂 1800 + 聽歌時完全唔行)
        │
        ▼
自動播放 30 首隨機尾巴 ≈ 93% 冷歌  ← 以前庫細嗰陣多數撞到 warm,所以睇唔出
        │
        ▼
warmIds 淨係暖到第 4 首 ── 頭 3-4 首照播,冇問題 ✅
        │
        ▼
第 5 首起:cold resolve 3-5.6s(前台夠鐘)vs ExoPlayer 8s budget
        │
        ├─ 前台:headroom 夠 → 播到 → Eric 話「開住 app 聽完全無問題」✅
        │
        └─ 背景/鎖屏:Wi-Fi power save / RRC idle / Doze 食晒 headroom
                 → 第 5、6、7 首連續 timeout
                 → errorSkipCountRef 去到 3
                 → TrackPlayer.pause() + Alert(背景彈唔到)
                 → 「大約聽到 3 至 4 首歌就會自動停咗」❌
```

---

## 3. 已排除嘅嫌疑(唔使再查)

| 嫌疑 | 排除理由 |
|---|---|
| `830066e` / `09a5fa1` 嘅 FGS patch 引入 regression | Patch A/B/C 邏輯睇過,做嘅嘢同「載入下一首」零交集 |
| FGS 錯誤餵咗個熔斷器 | `ForegroundServiceStartNotAllowedException` 出嘅係 **`player-error`** event(`MusicEvents.kt:56`),而 App.js 聽嘅係 **`playback-error`**(`Event.PlaybackError`)。**兩個唔同 event,收唔到。** |
| AndroidManifest 缺 FGS 宣告 / WAKE_LOCK | merged manifest(release + debug)兩邊都有 `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_MEDIA_PLAYBACK`、`WAKE_LOCK`、`foregroundServiceType="mediaPlayback"` ✅ |
| YouTube 403 爆發(9ecc296 嗰單) | 呢 2 日 backend log 0 條 403 |
| 隊列播完就停(queue 尾) | 尾巴有 30 首,3-4 首唔會到尾 |

---

## 4. 修復方案(按性價比排,全部未做)

### Fix A —— 滾動預熱(**最高性價比,OTA 推得,零 native**)
`PlaybackActiveTrackChanged` 每次換歌就 `warmIds(queue.slice(idx+1, idx+4))`。
一改就由「只暖頭 4 首」變成「永遠暖住前面 3 首」,直接剷走個「第 5 首懸崖」。
`/api/stream/warm` 本身即回 202、背景單線程 resolve,唔會加重 backend。
- 風險:近零。`warmIds` 已經有 10 條上限同 fire-and-forget catch。
- ⚠️ 要留意 `warm` 端點會 `resolveAudioUrl` + `preVerifyUrl`,而 keep-warm 兩個 timer
  有 `anyStreaming()` guard 但 `/warm` 冇 —— 呢個係啱嘅(用戶主動要嗰幾首優先),
  但要確認唔會同串流爭 CPU(單線程、每次最多 3 首,應該冇問題,實測驗證)。

### Fix B —— 熔斷器唔應該喺背景靜靜哋 `pause()`
兩個問題:
1. **3 次太敏感**:30 首隨機尾巴 + 6% 硬失敗率,撞到連續 3 首壞歌唔算罕見。
2. **背景彈 Alert 等於冇彈**:用戶淨係見到「停咗」,冇任何解釋,亦冇得復原。

建議:`AppState.currentState !== 'active'` 嗰陣**唔好 `pause()`**,繼續跳(門檻放寬到
例如 8-10 次)並記低狀態,等返前台先出一次提示。前台行為維持而家咁(Eric 拍板過)。

### Fix C —— 自動播放尾巴唔好抽「從未 resolve 成功過」嘅歌
Backend 已經有 `failCache`(死鏈記憶)同 resolve cache。開個輕量端點俾 App 拎
「已知 warm / 已知死」名單,`buildAutoplayTail` 抽樣時**壓低未驗證歌嘅權重**。
中期做,唔急,但係長遠正路 —— 4000 首新歌根本冇人驗過播唔播到。

### Fix D —— 補返 observability(**建議即刻做,因為佢係下一輪嘅眼睛**)
`routes/stream.js` 每個 `/api/stream/:id` 都 log 一行,帶 **timestamp**:
`id / warm|cold / resolve_ms / ttfb_ms / status / client_aborted`。
特別係 **client abort 要 log**(而家係唯一一個明文唔 log 嘅分支,偏偏就係 ExoPlayer
timeout 嘅指紋)。純 backend、純新增 log、零行為改動。
有咗佢,Eric 下次再撞一次,我哋就即刻睇到「幾點幾分、邊 3 首、幾秒 abort」。

### Fix E —— backend 側 cold path 提速(較大工程,等 A-D 之後先評估)
- `CACHE_SIZE_CEILING=1800` 已經細過庫存 6196(同 7/29 嗰個 300 vs 1744 一模一樣嘅
  bug 重演)。要重新諗:唔係盲加大(refresh 額度養唔起),而係**只暖「用戶真係會撞到」
  嗰批**(featured / 最近加 / 播放記錄)。
- keep-warm 嘅 `anyStreaming()` 全域 guard 太辣:Eric 一日聽幾個鐘,warm job 就等於停擺
  幾個鐘。可以改成「唔暖正播緊嗰首」而唔係「有人聽歌就乜都唔暖」。

---

## 5. 順手揪到、唔屬呢單嘢嘅問題(記低,唔喺呢次範圍)

1. **backend 記憶體副本落後**:API 報 5,408 首,disk `hymns.db` 有 6,196 首。
   backend 由 8/5 09:00 冇重啟過,期間加咗 ~870 首,App 完全見唔到。
2. **AndroidManifest 冇 deep link intent-filter**:`android/app/src/main/AndroidManifest.xml`
   入面完全冇 `VIEW`/`BROWSABLE` intent filter,即係 MEMBERSHIP-PHASE3 分享清單嘅 deep
   link 喺而家部 APK 上面**唔會 work**(STREAM-403-FGS-CRASH-PLAN §2.3 早就警告過呢個陷阱)。
3. **`setupPlayer` 冇開 `autoHandleInterruptions`** → `handleAudioFocus = false`,
   App 從來冇 request 過 audio focus。同今次個 bug 冇直接關係,但係唔正路。

---

## 6. 仲欠咩資料先可以 100% 落釘

因果鏈入面「冷歌 → timeout」係實測嘅;**「究竟邊個機制真係令佢停」有兩個候選,
要 Eric 一句答案就分得開**:

| 問 Eric | 答案 A | 答案 B |
|---|---|---|
| **停咗之後,通知欄嗰張播放卡仲喺唔喺度?** | 仲喺度、變咗暫停 → **熔斷器 `pause()`**(§2 主線,Fix A+B 直接醫) | 完全冇咗 → service/process 俾系統殺咗,要另外查電池優化 |
| **返返 app 嗰陣,有冇彈過一個白色視窗寫「播放中斷 — 連續幾首歌都載入唔到」?** | 有 → **實錘熔斷器** | 冇 → 熔斷器有觸發但 Alert 掉咗,或者係另一個機制 |

另外三條輔助題(唔係 blocker,但會幫手收窄):
3. 停嗰陣係用 **Wi-Fi 定 4G/5G**?
4. 部機**咩牌子型號**?有冇幫 God Music 開咗「不受電池優化限制 / 允許背景活動」?
5. 佢通常係**喺詩歌庫撳一首歌**(= 1 首 + 30 首隨機尾巴)定係**播一個清單**?
   「自動播放」個掣係開定關?

**點解唔喺 emulator 重現:** emulator 重現唔到呢個 bug 嘅關鍵條件 —— 熄屏之後嘅
Wi-Fi power save、流動網絡 RRC idle、OEM 電池優化。喺 emulator 跑 15 分鐘背景播放
只會全部成功,得出一個假嘅「修好咗」。所以呢一輪冇跑 emulator,改為**直接量度
backend 冷路徑嘅真實延遲**(§1.5)—— 嗰組數字先係決定性嘅。

---

## 7. 建議次序

1. **問 Eric §6 嗰兩條題**(即刻,零成本)。
2. **Fix D**(backend log,純新增)—— 過 deploy gate 之後重啟 backend,即刻有眼睛。
3. **Fix A**(滾動預熱)—— 一個 OTA 就推得,唔使出 APK,直接剷走「第 5 首懸崖」。
4. **Fix B**(熔斷器背景行為)—— 同 Fix A 同一個 OTA。
5. Fix C / E —— 睇 Fix D 收返嚟嘅真數據先決定郁邊樣。

⚠️ Fix A/B 係 JS,OTA 推得;冇任何一項要出新 APK。
⚠️ backend 重啟 + OTA 都要行 DEPLOY-GATE(等 Eric 批)。
