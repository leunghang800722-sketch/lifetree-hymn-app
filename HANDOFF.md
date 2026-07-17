# 詩歌串流 App（生命樹 / Etz Chayim）— 交接文件

> 建立日期：2026-07-15
> 最後更新：2026-07-17（Phase 1 播放核心重建完成）
> 開發者：約拿（AI 助手） x 恒恒（Owner/PM）
> Git 起點：2026-06 初，v100+ 演化至今 v214；Phase 1 由 v215 做到 v221

---

## ⚡ 快速上手（新接手先睇呢段）

**而家喺邊：** Phase 1（播放核心重建）**已完成並喺真機驗證通過**。
詳情見 `PHASE1-PLAYER-REBUILD.md`（技術方案）同下面「Phase 1 完成報告」。

- **分支**：`feature/player-rebuild`（由 `develop-v211` 開出）—— 未 merge 返 develop-v211
- **最新 APK**：`~/Desktop/詩歌App/hymn-app-v221.apk`（versionCode 16）
- **要跑起個 App 要做兩件事**：
  1. 開 backend：`cd backend && node server.js`
  2. 開 tunnel：`cloudflared tunnel --url http://localhost:3001`，
     **攞條新 URL 貼入 `frontend/hymn-app/src/config.js` 嘅 `API_BASE`，再 rebuild APK**
- ⚠️ **每次 tunnel 重開 URL 都會變** → 一定要改 config + rebuild + 重裝，
  呢個係 Phase 2「揀正式伺服器」未解決之前嘅硬傷（見「已知限制」）

---

## 一、專案概覽與目標

### 做咩嘅？
一個基督教詩歌串流 Android App，代號「**生命樹**」（Etz Chayim），專門播放 YouTube 上嘅粵語/國語/英文詩歌，支援**背景播放**同**通知欄控制**。

### 目標用戶
- 香港/台灣基督徒，想聽詩歌但唔想開住 YouTube 畫面
- 想有一個專注詩歌嘅平台，有收藏、分類、清單功能

### App 品牌
- 名稱：生命樹
- 品牌字：Etz Chayim
- 主色調：黑色底 + Spotify 綠 (#1ED760) accent
- UI 風格：YouTube Music 風格（扁條 mini player、fullscreen overlay、night mode）

---

## 二、技術棧

### 前端（React Native / Expo）

| 層面 | 技術 |
|------|------|
| Framework | Expo v56.0.8（React Native 0.85.3） |
| 播放引擎 | `react-native-track-player` v4.1.2（唯一引擎，已移除 expo-av） |
| 路由/導航 | `@react-navigation/native` v7 + native-stack + bottom-tabs |
| 動畫 | React Native `Animated`（Native Driver） |
| 圖標 | `@expo/vector-icons/MaterialIcons` |
| 本地緩存 | `react-native-mmkv` v2.12.2（JSI-based KV store） |
| 手勢 | `react-native-gesture-handler` |
| 儲存 | `@react-native-async-storage/async-storage`（token） |
| 安全區域 | `react-native-safe-area-context` |
| Build | Expo dev client / `expo run:android` / Gradle release |
| 播放清單 Modal | React Native `<Modal animationType="slide">` |

### 後端（Node.js）

| 層面 | 技術 |
|------|------|
| Runtime | Node.js v18+（ES Modules） |
| Server | Express v4 |
| 資料庫 | SQLite via `sql.js`（純 JS，免 compile） |
| Audio 提取 | `yt-dlp`（Python CLI，YouTube -> direct audio URL） |
| Auth | bcryptjs + jsonwebtoken |
| 部署 | Docker（Alpine + node:18 + yt-dlp） |
| 平台 | 自託管 VPS / 免費雲（serveo tunnel） |

### 資料庫結構（hymns.db）

```sql
CREATE TABLE hymns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT,
  category TEXT DEFAULT '粵語',
  youtube_id TEXT NOT NULL,
  duration TEXT,
  lyrics TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  title_en TEXT DEFAULT '',
  album TEXT DEFAULT '',
  lang TEXT DEFAULT '粵語',
  tags TEXT,
  featured INTEGER DEFAULT 0,
  release_date TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE playlist_hymns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  hymn_id INTEGER NOT NULL,
  position INTEGER DEFAULT 0,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (hymn_id) REFERENCES hymns(id)
);
```

### 詩歌數據統計
- 🔺 **2026-07 實測更正：DB 實際有 1518 首**（唔係 665）。`/api/hymns` 直接數出嚟嘅。
  「665」呢個數字係舊嘅，之後 E2 擴庫加咗好多，文件一直冇更新。
- ⚠️ 入面**有重複**：例如 id 900 同 id 1117 係同一條 `youtube_id`（DB id 本身唯一，但 youtube_id 會撞）
- 由首頁撳一首歌播 → queue 就係成個 1518 首歌庫，所以播放清單會顯示「(1518)」，**呢個係正常，唔係 bug**
- API 運行於 port 3001

---

## 三、開發階段 & 已完成功能

> ⚠️ **注意兩套「Phase」編號唔同嘢**：
> 下面「Phase 0–5」係 **v100–v214 嘅歷史**（舊編號）。
> `REDESIGN-PLAN.md` / `PHASE1-PLAYER-REBUILD.md` 講嘅「Phase 1／Phase 2」係**新規劃書嘅編號**，
> 同下面呢個「Phase 1：啟動效能優化」**完全冇關係**。新規劃書嘅 Phase 1 成果見「三之二」。

### Phase 0：MVP（v100-v150）
- ✅ 基礎 app 框架（React Native + Expo）
- ✅ YouTube 音訊提取（yt-dlp backend）
- ✅ 播放清單顯示、基本播放控制
- ✅ 大量詩歌 database（665 首）
- ✅ 移除 expo-av、統一 TrackPlayer 為唯一播放引擎
- ✅ 背景播放（通知欄控制）
- ✅ JIT Queue（播完一首自動 fetch 下一首，非全部預載）
- ✅ 背景預載 next track（gapless）

### Phase 1：啟動效能優化（v211）
- ✅ TrackPlayer 延遲初始化（lazy init，唔 mount 即 setup）
- ✅ MMKV 緩存詩歌列表（useCachedHymns hook）
- ✅ Skeleton loading component
- ✅ 第一個歌 URL 背景 warm-up

### Phase 2：會員 + 最愛 + 清單（v211-v212）
- ✅ 會員系統（註冊/登入/Token）backend + frontend
- ✅ AuthScreen UI（email/password）
- ✅ FavoritesContext（MMKV 持久化最愛）
- ✅ PlaylistsContext / PlaylistContext
- ✅ Bottom Sheet 加入清單
- ✅ A/B 播放分離（audio/video mode detection）

### Phase 3：播放器 UI 大修（v212-v213）
- ✅ 物理抽屜動畫（Animated.View slide-up）
- ✅ FullScreenPlayerOverlay 全屏播放器
- ✅ 封面 equalizer animation
- ✅ 進度條（可點擊 seek）
- ✅ Shuffle（公平算法，shuffleHistoryRef 防止重複）
- ✅ Repeat 三態（Off / All / One）
- ✅ 使用 Modal 代替自製 Bottom Sheet（Native Modal 100% scroll）

### Phase 4：首頁 10 區塊（v213）
- ✅ HomeScreen 10 sections（每日精選、每日金句、作者推薦、新作品、種類推薦、喜好推薦、共鳴詩、詩句榜、民謠分享、綜合榜）
- ✅ 推薦大熱歌曲（hot song carousel，4 頁 × 4 首 = 16 首）
- ✅ 見證分享區塊（YouTube 嵌入方向）
- ✅ Mini player 扁條 style（YT Music 風格）
- ✅ 黑色底色、生命樹品牌 header

### Phase 5：播放器 UI 精修（v214）
- ✅ Action bar 現代 pill 風格（4 顆獨立丸按鈕：最愛/歌詞/分享/清單）
- ✅ Bottom Sheet PanResponder swipe-to-dismiss
- ✅ 深灰底色 CARD_BG (#1A1A1A) + pill (#2C2C2C)
- ✅ 所有播放控制圖標正確顯示

### 其他
- ✅ Dockerfile（Zeabur 部署 readiness）
- ✅ APK build pipeline（Gradle assembleRelease）
- ✅ 每次 build 自動 copy APK 到 Desktop
- ✅ serveo tunnel expose backend
- ✅ 多層 yt-dlp 提取 strategy（3 種 fallback）

---

## 三之二、【新規劃書】Phase 1：播放核心重建（v215–v221）✅ 完成

> 方案：`PHASE1-PLAYER-REBUILD.md`　分支：`feature/player-rebuild`　真機驗證：2026-07-16/17
> （呢個係 `REDESIGN-PLAN.md` 嘅 Phase 1，同上面「Phase 1：啟動效能優化」係兩件事）

### 做咗乜（一句話）
**撳播放嗰刻將成個清單交俾 TrackPlayer 原生 queue**，next/previous/repeat/背景自動下一首全部交返原生處理，
App 端唔再有「臨場喺 JS 度計下一首」嘅邏輯（呢個正正係以前背景 loop 同通知欄 next 廢咗嘅元兇）。
為咗做到呢點，backend 加咗 `/api/stream/:hymnId` 俾每首歌一個穩定 URL。

### 驗收結果（真機，Eric 測）

| # | 項目 | 結果 |
|---|------|------|
| 1 | 播 ≥5 首、熄芒放低，連續自動接落去 | ✅ PASS |
| 2 | Repeat 三態（Off / All / One） | ✅ PASS |
| 3 | Shuffle 真洗牌、唔重複、唔打斷 | ✅ PASS（v220 修好） |
| 4 | 播放頁清單順序 = 實際播放順序 | ✅ PASS |
| 5 | 通知欄 next/previous 同 App 內一致 | ✅ PASS |
| 6 | 死鏈自動跳下一首、唔 crash | ✅ PASS（約 22 秒，偏慢，見下） |
| 7 | 背景播放 | ⚠️ 播到，但約 30 分鐘後會停（**用戶決定唔跟進**，見下） |

### 新增／改動嘅檔案

| 檔案 | 做乜 |
|------|------|
| `backend/lib/resolveAudio.js`（新） | 共用 yt-dlp resolver：async exec（唔再 block event loop）、in-flight dedup、TTL 跟 googlevideo `expire=` 參數 |
| `backend/routes/stream.js`（新） | `/api/stream/:hymnId` 串流 proxy，用 **DB id**（唔係 youtube_id）做 key |
| `backend/routes/audio.js` | 改用共用 resolver（舊 `/api/audio/:ytid` 保留運作） |
| `backend/server.js` | mount stream route；pre-cache 改用 resolver |
| `frontend/hymn-app/App.js` | `playQueue()`／`toTrack()`／`queue` state；斬走 JIT queue；native next/prev；shuffle 重寫；PlaybackError 斷路器 |
| `frontend/hymn-app/src/config.js` | API_BASE 收歸一處（`App.js` 同 `useCachedHymns.js` 之前各有一份寫死 URL） |

### ⚠️ 三個「踩過先知」嘅坑（新接手一定要睇，唔好行返轉頭）

1. **googlevideo 會嚴重 throttle 冇 Range header 嘅請求**
   ExoPlayer 第一個請求係**冇 Range header** 嘅。實測：冇 Range → **~17 KB/s**（播唔到，永遠「載入中」）；
   有 `Range: bytes=0-` → **~1.5 MB/s**。
   👉 `stream.js` **一定要永遠向上游送 Range**（client 冇送就自己補 `bytes=0-`），
   冇 client Range 時要將上游 206 當返 200 回覆 client。**唔好「原封轉發」client 個 Range。**

2. **串流 pipe 一定要有 error handler**
   ExoPlayer 播緊會不停開／閂 range 連線。閂線時 `controller.abort()` 會令 web-stream 報錯；
   冇 `body.on('error')` 就會變成 process 層 uncaughtException + 令 client 連線半死 → 又係「永遠載入中」。

3. **1500+ 首嘅 native queue 唔可以原地重排**
   `TrackPlayer.remove([~1500 個 index])` 同 `removeUpcomingTracks()` 喺呢個 scale **會靜靜哋失敗**，
   結果係「shuffle icon 著咗但實際順播」。
   👉 Shuffle 用 `reset()` + `add()` 成個重建（`add()` 大量 track 係 OK 嘅，playQueue 本身就係咁）。
   重建之後 **`play()` 一定要擺最後**（`reset()` 會停播；`play()` 之後即刻 `seekTo()` 會令 player 卡喺 paused 0:00）。
   代價：撳 shuffle 會有 ~1-2 秒 re-buffer，換返 shuffle 真係 work。

### Debug 心法（慳返好多來回）
- **睇唔到手機 logcat** → 可以喺 backend 加一個 log sink endpoint，App 用 fire-and-forget fetch 報返 on-device 狀態返嚟。
  Phase 1 就係靠 `TrackPlayer.getQueue()` 讀返個**真實 native queue** 報返 backend，先證實到 shuffle 到底有冇生效。
- **versionName 每個 build 都係 `1.1.1`，分唔到版本** → 測試期間喺 App 顯示一個 `BUILD_TAG` 常數，
  一眼 confirm 部機跑緊邊個 bundle。（Phase 1 試過因為版本混淆白行咗幾轉。）
  呢兩樣嘢完事後已經清走，需要時去 git log 搵返（commit `2b8d2e8`）。

---

## 四、已知問題 / Bug / 踩過嘅坑

### 🔴 Critical

#### 1. 死鏈問題 —— ⚠️ 舊嘅「2.3% 成功率」數字唔可信，要重驗
- **原因**：Database 透過 yt-dlp 批量 scrape，部分 YouTube ID 已失效（deleted/unlisted/region-blocked）或係 playlist/compilation 唔係 single video
- **狀態**：`DEAD_LINKS.md` 記錄咗 47 個已知死 link
- **🔺 2026-07 更正**：`backend/hymn-check-report.txt` 嗰個「650/665 失效、成功率 2.3%」**唔可信**。
  拆返個 report：650 個「失效」入面 **592 個（91%）係 Timeout**，真正 HTTP error 得 57 個。
  嗰次係一次過連續驗 665 首，好可能係自己撞到 rate limit / throttle，唔代表真係死咗咁多。
  **落任何 cleanup 決定之前，一定要用慢啲、有 rate limit 嘅方式重驗一次。**
  （實測 Phase 1 期間，隨機抽播都成功率幾高，死鏈遠少過 97%。）
- **⚠️ 真實歌數係 1518 首，唔係 665**（DB 實況；當中仲有重複，例如 id 900 同 1117 係同一條 youtube_id）
- **之前嘗試**：E1c 標記死 link、E2 擴庫、YouTube search API 換 ID

#### 2. MMKV JSI Warning（v212-v214）
- **問題**：Release build 出 JSI warning/error（`react-native-mmkv` v2.12.2 NitroModules 相容問題）
- **嘗試過**：
  - 降級 v2.12.2（由 v3.x 降返）
  - Lazy init MMKV + try-catch 包圍（已實作）
  - Warning 仍存在但唔會 crash app

#### 3. Bottom Sheet 滾動衝突（v179-v189 長期掙扎）
- **已解決**：最終用 Native `<Modal>` 代替自製 `Animated.View + PanResponder` drawer
- **歷史教訓**：Android `overflow: hidden` + `translateY` 必定 clip FlatList；PanResponder 與 FlatList scroll 永遠衝突
- **解決方案記錄於**：`HYMN-APP-IRON-RULES.md` 與 `BLUEPRINT.md`

#### 4. TrackPlayer setupPlayer duplicate crash
- **問題**：`setupPlayer()` 重複調用拋出 "already initialized" error
- **已修復**：`playerReadyRef` / `playerInitRef` guard + try-catch 靜默吞 error

#### 5. Empty URL crash（v183）
- **問題**：Backend fallback 回傳 200 但 `url=""` → TrackPlayer crash
- **已修復**：Backend 永不回傳空 URL（check cached.url validity；fallback 失敗回 502）；Frontend URL 驗證 guard

### 🟡 Medium

#### 6. 歌詞功能未實作
- Frontend 有 lyrics button / pill 但只係 `alert('歌詞')`
- Database 有 lyrics column（部分歌曲有歌詞），但無 UI 提取展示

#### 7. 見證分享區塊內容
- 有 UI（TestimonyCarousel）但未有實際 YouTube 嵌入 / 串流
- 目標片源：恩雨之聲、星火飛騰

#### 8. API_BASE hardcoded — ⚠️ 部分改善，但**根本問題仍在**
- ✅ Phase 1 已收歸一處：得 `src/config.js` 一個源頭（之前 `App.js` 同 `useCachedHymns.js` 各有一份寫死 URL）
- ❌ **仍然係 build 時寫死**：tunnel 一死／重開，URL 就變 → 要改 config + rebuild + 重裝 APK
- **呢個係而家最日常嘅痛點**，等 Phase 2 揀定正式伺服器（或者用固定 domain 嘅 named tunnel）先解決到

#### 9. FALLBACK_HYMNS（15 首）
- ✅ Phase 1 已刪走 `STATIC_PLAYLIST`（嗰啲 +1000/+2000/+3000 嘅假 id 對 `/api/stream` 一定 404）
- 而家 fallback 淨返原本 15 首真 id（1–15），只喺 server 攞唔到歌庫時做顯示用

#### 10. 首頁底部空白
- v203 後 Home 布局已鎖定，但底部留空問題仍有觸及
- 有「**首頁回歸檢查**」規則確保修改唔影響 Home 布局

### 🟢 Low

#### 11. ESLint config 空樁
- 🔺 **更正**：實際 check 過，repo 入面**根本冇任何 eslint config 檔案**（連空樁都冇），呢條記錄過時

#### 12. `react-native-youtube-iframe` 仍喺 package.json
- 雖然已拆走 YouTube iframe 播放，但 dependency 未清（唔影響功能）

#### 13. 部分 commited video files
- 🔺 **更正**：實際 check 過，repo **冇 track 任何** mkv/webm/mp4/part，`.gitignore` 生效緊，呢條記錄過時
- ⚠️ 但**專案根目錄有幾條大型影片檔**（本機、未 commit，加埋 700MB+），會拖慢呢個資料夾嘅 git 操作，建議搬走

#### 14. 背景播放約 30 分鐘後停 —— **用戶決定唔跟進**
- 查過：AndroidManifest **完全正確**（`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + `WAKE_LOCK`，
  `MusicService` 有 `foregroundServiceType="mediaPlayback"`）；RNTP `appKilledPlaybackBehavior` 已設 `ContinuePlayback`
- ⚠️ 順帶發現：舊 code 嘅 `updateOptions({ notificationChannel: {...importance: 1} })`
  **根本唔係 RNTP v4 嘅合法選項**，一直被靜靜哋忽略（唔關佢事，但唔好以為 set 咗嘢）
- **結論：唔係 code bug**，~30 分鐘嘅 timing 係手機 battery optimization / Doze 殺 background app 嘅典型特徵
  （港版／國產 Android 對背景媒體 app 特別狼）
- **想試嘅話**（唔使改 code、唔使重 build）：手機 → 設定 → 應用程式 → 呢個 App → 電池 → 揀「無限制」/ 關省電優化
- Eric 已決定暫時唔跟進

#### 15. 死鏈跳歌要等約 22 秒（偏慢）
- 功能正常（會自動跳、唔卡死、唔 crash），但等太耐
- 未跟進；可以睇下 `resolveAudio.js` 嘅 yt-dlp timeout（而家每個 strategy 30 秒 × 3 個 strategy）同前端 retry 策略

---

## 五、未解決決定 / 設計爭議

### 1. Audio Mode vs Video Mode
- **Audio mode**：TrackPlayer 背景播放（已實現，主流方案）
- **Video mode**：YouTube app / inline WebView 播放（未實現）
- **爭議**：App 名稱「詩歌App」但唔播片；部分詩歌 MV 有畫面但只拎 audio
- **當前決定**：一律用 audio mode；future 可加 mode flag 區分

### 2. YouTube 版權與合法性
- 目前架構係：先由 yt-dlp 提取 YouTube 音訊 URL → 實時串流
- 沒有下載離線功能
- 法律風險：yt-dlp / YouTube ToS 灰色地帶
- **未決定**：是否需要改為直接 webview 播 YouTube（降低法律風險但失去背景播放）

### 3. Database cleanup strategy
- 665 首詩歌大部分 dead link
- **選項 A**：人手逐首確認 + 換新 YouTube ID（高成本）
- **選項 B**：批量移除死 link 只留 15-50 首有效（損失內容）
- **選項 C**：用 YouTube Data API v3 定期驗證 ID 有效性
- **當前**：未有決定，保留全部 665 首等 cleanup

### 4. 後端部署方案 —— 🔴 **最高優先，而家最痛**
- **目前**：開發者 MacBook 本地跑 server + cloudflared **臨時** tunnel expose
- 🔺 **2026-07 實測結論（重要，會影響選型）**：
  - **Zeabur 個 IP 已經俾 YouTube 封咗** —— 唔係「yt-dlp 冇裝好」（之前嘅假設係錯嘅）。
    喺 Zeabur container 內部直接跑 yt-dlp（版本 2026.07.04，裝好晒），
    對 5 條唔同影片 **5/5 全部** 中：`Sign in to confirm you're not a bot`。
    即係 **datacenter IP 信譽封鎖**，唔係用得密先封 → **換 region / 開新 project 好可能都係一樣中招**。
  - 所以「Docker ready 就可以擺上 Zeabur」呢個假設**已經唔成立**。
- **選項 A**：Zeabur / Railway → ⚠️ 要先解決 IP 封鎖先講（見下面 mitigation）
- **選項 B**：VPS（自行維護）→ 一樣要**事先驗證**嗰個 IP 冇俾 YouTube 封（用上面同一個測試）
- **選項 C**：靜態化（預先提取 URL 存 DB）→ 但 googlevideo URL 會過期，做唔到長期
- **選項 D**：用戶自己上載歌 → **唯一唔使賭 YouTube IP 狀態**嘅方案，長遠最穩
- Mitigation 方向（未跟進）：yt-dlp 用 cookies、住宅／rotating proxy（要持續畀錢 + 維護）
- **⚠️ 另一個獨立但同樣痛嘅問題**：`API_BASE` 係 build 時寫死。臨時 tunnel 一死，URL 就變，
  要改 config + rebuild + 重裝 APK。**就算未搞掂 IP 問題，都值得先攞一個固定 domain 嘅 named tunnel 止血。**
- `AUDIO_PROXY_TARGET` env var 已預留 proxy 模式（Zeabur 個 service 而家就係設緊呢個，指向一條**已死**嘅 localtunnel）

### 5. 生命樹品牌方向
- 恒恒想用「Etz Chayim」希伯來文品牌
- 首頁 header 已有生命樹 + 通知 + 頭像 UI
- 功能上係一個詩歌播放器，品牌定位未完全定型

### 6. API Response Format 不一致
- Backend `/api/hymns` 回傳 `{ data: [...] }`
- Home routes 直接回傳 array
- Frontend `fetchHymns()` 用 `json.success` check（但部分 route 冇 success field）
- 需要統一 error handling pattern

---

## 六、下一步建議

> Phase 1（播放核心）已完成，見「三之二」。以下係 Phase 2 之後嘅嘢。

### Immediate（高優先度）
1. **🔴 後端部署 + 固定 URL** — 而家最痛。兩個獨立問題要一齊解：
   (a) **Zeabur IP 已俾 YouTube 封**（已實測確認，見「五、4」）→ 揀邊間雲之前**一定要先驗個 IP**；
   (b) **API_BASE build 時寫死** → tunnel 一死就要 rebuild + 重裝。就算 (a) 未搞掂，
   都值得先攞個固定 domain 嘅 named tunnel 止血。
2. **⚠️ 重驗死鏈（唔好信舊報告）** — 舊嗰個「2.3% 成功率」數字唔可信（591/650 係 Timeout，疑似自己撞 rate limit）。
   用慢啲、有 rate limit 嘅方式重驗，先再決定 cleanup 策略。真實歌數係 **1518** 首（唔係 665），仲有重複。
3. **歌詞功能** — 將 Database lyrics column 提取到 UI（Modal / overlay 顯示）
4. **考慮用戶自己上載歌** — 唯一唔使賭 YouTube IP 狀態嘅後備線（Eric 未拍板做唔做）

### Short-term（中優先度）
5. **見證分享 content fill** — 連接恩雨之聲 / 星火飛騰 YouTube playlist
6. **MMKV warning fix** — 或考慮換 `@react-native-async-storage/async-storage` 做 cache
7. **搜尋增強** — 當前搜尋只靠 backend SQL LIKE，可加 full-text search
8. **播放清單編輯** — 拖拽排序、批量操作

### Long-term（低優先度）
9. **Video mode** — 為 MV/見證等有畫面內容加入 YouTube inline player
10. **離線下載** — 預先下載詩歌離線播放
11. **iOS 支援** — 目前只 build Android release；iOS 需要 Apple Developer account 同 certificate
12. **Multi-language UI** — 繁中/簡中/英文介面切換
13. **Social features** — 分享詩歌、一鍵發布到社交平台

---

## 七、開發筆記

### Build APK 指令
```bash
cd frontend/hymn-app/android
ANDROID_HOME=$HOME/Library/Android/sdk \
JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home \
./gradlew assembleRelease
```
每次 build 完自動 copy：
```bash
cp android/app/build/outputs/apk/release/app-release.apk ~/Desktop/詩歌App/hymn-app-v{版本}.apk
```

### 啟動開發環境
```bash
# 1. Backend（MacBook 本地）
cd backend && node server.js
#    開機會背景 pre-cache 成 1518 首歌嘅 audio URL（幾分鐘，唔阻住用）

# 2. Tunnel（另一個 terminal）—— 手機要行呢步先連到
cloudflared tunnel --url http://localhost:3001
#    ⚠️ 佢會 print 一條全新 random URL，要貼返入 frontend/hymn-app/src/config.js
#       嘅 API_BASE，然後 rebuild APK。每次重開 tunnel 都要做一次（見「五、4」）

# 3. Frontend dev（如果唔係要出 APK）
cd frontend/hymn-app && npx expo start
```

### 最新 APK
- **v221：`~/Desktop/詩歌App/hymn-app-v221.apk`（versionCode 16）← Phase 1 完成、乾淨版**
- ⚠️ **APK 唔好再 commit 入 repo**：`backend/public/*.apk` 已經 `git rm --cached` 咗，`*.apk` 喺 `.gitignore` 入面。
  舊 APK 反覆 commit 令 `.git` 脹到 **750MB**。以後用 GitHub Releases 放 APK。
  （歷史 blob 未清理 —— 要清就要 `git filter-repo` 改寫 history + force push 全部分支，
  會逼所有 clone 重新 clone，屬高風險操作，未做，要做前先同所有人講掂。）

### ⚠️ versionCode 一定要遞增
- Android **拒絕安裝 versionCode 比現有低嘅 APK**，而且好多手機淨係彈一句「套件似乎無效」，
  唔會話你知係降級問題（Phase 1 就係咁白行咗一轉）。
- `develop-v211` 個 build.gradle 停留喺 v214 年代嘅 `versionCode 3`，但 Eric 部機裝緊 v231（code 4）→ 一裝就話無效。
- **每次出新 build 都要 bump `android/app/build.gradle` 個 `versionCode`。** 而家係 **16**。
- versionName 一直都係 `1.1.1`，**分唔到版本**，唔好靠佢認 build。

### 核心文檔
- `PHASE1-PLAYER-REBUILD.md` — **Phase 1 技術方案（已完成，見「三之二」）**
- `REDESIGN-PLAN.md` — 整體重新規劃書（Eric 已拍板）
- `BLUEPRINT.md` — 播放器 UI 鐵律（v117 定案）
- `HYMN-APP-IRON-RULES.md` — DOM 順序、差速動畫規範
- `DEAD_LINKS.md` — 已知失效 YouTube ID 清單（⚠️ 但整體死鏈率數字要重驗，見「四、1」）

### Git Branches
- `main` — 得最初一個 baseline commit，同 develop-v211 完全脫節
- `develop-v211` — v211–v214 + HANDOFF
- **`feature/player-rebuild` — ⭐ Phase 1 成果（v215–v221），最新，未 merge 返 develop-v211**
- `release-v219` — ⚠️ **v215–v231 嘅真正 source 喺呢度**（Boaz/OpenClaw 嗰個 clone 做嘅），
  同 `feature/player-rebuild` 係**兩條獨立線**，未合併
- `experimental/unmerged-actionbar-ui` — 一份來源不明、未 merge 嘅 action bar UI 改動，
  同已出街嘅 v231 設計唔同，保存低等 UI 方向拍板先決定去留
- `feature/error-handling` — 錯誤處理實驗分支

### ⚠️ 兩個 clone 嘅陷阱（好易搞錯）
- `/Users/macbookpro/.openclaw/workspace/hymn-app` — 呢個（Phase 1 喺度做）
- `/Users/macbookpro/Desktop/lifetree-hymn-app` — 另一個 clone，`release-v219` 分支有 v215–v231 嘅 source
- 兩邊都指向同一個 GitHub repo。**開工前先 `git branch --show-current` 同 `git log --oneline -5` 確認自己喺邊。**
