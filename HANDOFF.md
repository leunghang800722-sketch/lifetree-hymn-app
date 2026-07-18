# 詩歌串流 App（生命樹 / Etz Chayim）— 交接文件

> 建立日期：2026-07-15
> 最後更新：2026-07-18（v229:bottom sheet 真根因 = z-order,已還原 gorhom 真手勢,待覆測）
> 開發者：約拿（AI 助手） x 恒恒（Owner/PM）
> Git 起點：2026-06 初，v100+ 演化至今 v214；Phase 1-3 由 v215 做到 v226（versionCode 21）

---

## ⚡ 快速上手（新接手先睇呢段）

**而家喺邊：** Phase 1(播放核心)✅ + Phase 2(死鏈檢測/150首試版庫)✅ 都真機驗過;
**Phase 3(介面重整)已完成,build 驗過,但個 bottom-sheet 手勢仲**未真機試**(見「三之四」)。

- **分支**：`feature/player-rebuild`（由 `develop-v211` 開出）—— 未 merge 返 develop-v211
- **最新 APK**：`~/Desktop/詩歌App/hymn-app-v229.apk`（**versionCode 24 / versionName 1.1.3**）—— bottom sheet 真手勢還原(真根因係 z-order,唔關 reanimated 事),詳情見「三之六」。舊 apk（v223–v228）已搬去 `~/Desktop/詩歌App/舊版本_勿裝/`,**裝新 apk 前記得先解除安裝舊 App**(同簽名可覆蓋,但為咗清乾淨 state 建議 uninstall)。
- **API 固定 URL：`https://api.god-music.com`** ✅（2026-07-17 起，唔會再變）
- ✅ **backend + tunnel 而家係 launchd 自動管理，唔使人手開**（2026-07-17 起，見「七、開機自動啟動」）
  - 登入之後自動行；死咗會自動拉返起（實測 kill -9 兩個，~2 秒內自動復活）
- ✅ **條 URL 已經固定咗**：`https://api.god-music.com`，唔使改 config、唔使 rebuild、唔使重裝 APK
- ⚠️ 但 backend 仍然係跑喺**呢部 Mac** 度：**部機要開住、有網、而且要登入咗**，App 先用到

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

## 三之二、【新規劃書】Phase 1：播放核心重建（v215–v225）✅ 完成

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
| 3 | Shuffle 真洗牌、唔重複、唔打斷 | ✅ PASS（v220 修好；v225 加咗「已隨機排序」提示，見下） |
| 4 | 播放頁清單順序 = 實際播放順序 | ✅ PASS |
| 5 | 通知欄 next/previous 同 App 內一致 | ✅ PASS |
| 6 | 死鏈自動跳下一首、唔 crash | ✅ PASS（原本約 22 秒；已加 failure cache，撞返同一條死 link 由 6.5 秒 → 0.001 秒） |
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

### ⚠️ 「Shuffle 好似冇隨機」—— 唔係 bug，唔好again再查
被報咗**三次**「shuffle 撳完撳 next 都係順序播」，三次都係**誤會**。實測證據（v224 instrumented）：
洗牌後 native queue = `[6, 61, 1083, 687, 862]`，Eric 聽到 **id 61（耶穌在我裡面）**；
如果真係順序播應該係 **id 7（榮耀神羔羊）**。兩首唔同歌 → 確認係隨機。

**點解會誤會**：洗完牌之後，**播放清單顯示嘅就係洗咗牌嗰個新順序**，所以下一首必然「就喺現正播嗰首下面」，
睇落就好似順住個 list 播。**但個 list 本身就係洗過㗎喇**（同 Spotify 一樣）。
👉 驗證方法：**睇個清單嘅順序有冇變**（洗完應該係 6→61→1083…，唔再係 6→7→8），
唔好用「next 有冇跳離個 list」嚟判斷。
👉 v225 起播放清單頂會顯示 **「🔀 已隨機排序」**，一眼睇得出。

### Debug 心法（慳返好多來回）
- **睇唔到手機 logcat** → 可以喺 backend 加一個 log sink endpoint，App 用 fire-and-forget fetch 報返 on-device 狀態返嚟。
  Phase 1 就係靠 `TrackPlayer.getQueue()` 讀返個**真實 native queue** 報返 backend，先證實到 shuffle 到底有冇生效。
- **versionName 每個 build 都係 `1.1.1`，分唔到版本** → 測試期間喺 App 顯示一個 `BUILD_TAG` 常數，
  一眼 confirm 部機跑緊邊個 bundle。（Phase 1 試過因為版本混淆白行咗幾轉。）
  呢兩樣嘢完事後已經清走，需要時去 git log 搵返（commit `2b8d2e8`）。

---

## 三之三、【新規劃書】Phase 2:死鏈檢測 + 試版歌庫 ✅(部署部分放棄)

> 2026-07-17。分支同上。

### ❌ 「雲端部署」呢part**實測後放棄咗**,唔好再試
**googlevideo 個音源 URL 綁死咗「邊個 IP resolve 就只准邊個 IP 攞」。** 實測(唔係估):
Mac(185.219.141.202)resolve 一條 URL,同一刻由 Zeabur(172.104.39.181)攞同一條:

| | 結果 |
|---|---|
| Mac(URL 入面 `ip=` 嗰個) | **206**,有 data,冇 redirect |
| Zeabur(第二個 IP) | **302 → 403**,0 byte(而且 redirect 目標仲係帶住 `ip=185.219.141.202`) |

➡️ 即係話「雲端 server + Mac 做 resolve」**行唔通** —— 每一個音訊 byte 都仍然要經 Mac 出。
呢個唔會慳到「唔靠 Mac」,只會將唔穩陣嗰part由「成個server」縮細做「resolve + 成條音訊水管」,
仲要多一個 hop。**Eric 決定:維持 Mac + named tunnel。**
(版權問題 Eric 決定等有用戶量(目標1000人)先傾,所以「預先落載儲存」個方案而家唔做。)

### ✅ 自動死鏈檢測
- `backend/scripts/checkDeadLinks.js` + launchd `com.hymnapp.deadlinkcheck`(**每晚 04:00**)
- **故意行得好慢**:concurrency **1**、每首隔 **3秒**、每晚 **150首**(~8分鐘),約 10 晚行完成個庫再循環
  👉 **唔可以改快**。部 Mac 出去嘅 IP 係全世界唯一仲 serve 到 YouTube 嘅 IP（⚠️ 注意:嗰個係 **NordVPN** 個 IP,唔係住宅 IP,見「七、頻寬同容量」）(Zeabur 已封死),
  一旦呢個 IP 都俾人 flag,成個 App 冇得救。
- **🔑 連續 3 日失敗先標記死鏈,任何一次成功即刻清零**
  呢條規則直接嚟自舊個 `hymn-check-report`「650/665 死、2.3% 可播」嘅假數據 ——
  嗰 650 個入面 **592 個係 Timeout**,係佢自己撞爆 rate limit 整出嚟,誤導咗成個 project 好耐。
  **失敗唔係證據,成功先係。**(實測:strike 1/2 唔標記,strike 3 先標記;成功會 revive)
- **隱藏唔刪除**:用 `status` 欄,資料原封不動留喺 `hymns_all`

### ✅ 試版歌庫:150 首
**45 粵語 / 75 國語 / 30 英文 = 30%/50%/20%**(Eric 指定),38 個歌手,**每一首都實測 resolve 到先收錄**。

排除規則:重複 youtube_id(208組)、合輯(133)、非敬拜內容(23)、死鏈。

**⚠️ 冇 popularity 可以排序**:`like_count` / `view_count` / `featured` **全部 1518 行都係 0**,
所以**唔可能**按熱門度揀。改用**歌手 round-robin** 換取多樣性 —— 呢個係現有數據下唯一嘅質素槓桿。

**第一次揀完之後發現 12% 垃圾(靠睇 acceptance 輸出先捉到,唔係靠 pass/fail 數字):**
- 11 首其實係**合輯**(「精选…赞美诗歌15首（二）」、「小羊诗歌 精选20首」)—— 佢哋**播得到**,所以任何播放測試都捉唔到
- 6 首係**世俗流行舞蹈片**:歌手「Grace Wu詩歌」其實係 **K-pop 舞蹈教學頻道**(23首入面22首係 Aespa/Doja Cat/Bruno Mars/BTS),得個名似詩歌
兩樣都已經加咗 filter 重揀,而家 **0 合輯、0 世俗**。

### 🔑 `hymns` 而家係一個 VIEW,唔係 table
```
hymns_all  = 真table(1518行,全部資料)          ← 寫入用呢個
hymns      = VIEW:curated=1 AND status!='dead'  ← 讀取(App/API 用呢個,得150行)
```
點解咁做:有 ~20 個 `SELECT ... FROM hymns` 散落 server.js / home.js / category.js / search.js,
漏改一個就會漏一首死歌出去。**而且後果比想像嚴重** —— App.js `handlePlayHymn` 係
`Math.max(0, list.findIndex(...))` 對住 `/api/hymns`,所以一首「首頁見到但唔喺 /api/hymns 入面」嘅歌
會 findIndex 返 -1 → 變 index 0 → **靜靜哋播錯另一首歌**。用 view 就由根本上唔可能出現呢種唔一致。
- **讀 → `hymns`;寫 → `hymns_all`**(view 唔寫得)。維護腳本全部指住 `hymns_all`。
- 改完 DB 要 `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend` 令 server 重新載入
  (sql.js 開機先讀一次入記憶體)

### 驗收 ✅
隨機抽 20 首(經真實 `api.god-music.com`)→ **20/20 播到**。

### 常用指令
```bash
node scripts/checkDeadLinks.js --limit 150 --delay 3000   # 手動行一次死鏈檢測
node scripts/checkDeadLinks.js --ids 6,11 --delay 500     # 只查指定歌
node scripts/curateLibrary.js --target 150 --cap 10 --dry # 試揀(唔寫入)
tail -f /tmp/hymn_deadlink.log                            # 每晚檢測 log
```

### ⚠️ 取捨位 / 未解決
- **粵語得 8 個歌手**(187首)。45首粵語 = 平均每個歌手 5.6 首,所以 artist cap 6 會餓死佢(得40/45),
  要 cap 10 先填得滿。**限制係個歌庫本身,唔係個 cap。** 想粵語再多樣化 → 要加新粵語歌手入庫。
- **`sql.js` 寫入完全冇 persist**:server 開機讀一次入記憶體,**從來冇寫返落 disk**。
  即係話**用戶註冊功能其實係壞嘅**(開咗 account,backend 一 restart 就冇咗)。
  ⚠️ 呢個係既有 bug,唔喺 Phase 2 範圍,**未修**。維護腳本自己 export() 寫檔所以冇事。
- Zeabur 個 service **Eric 話唔使刪**,佢自己會設定唔續約。

---

## 三之四、【新規劃書】Phase 3:介面重整 ✅(2026-07-18)

> 分支同上。APK:`hymn-app-v227.apk`(versionCode 22)。真機測試:**未做**(見下)。

### 做咗乜
| 項目 | 做法 |
|------|------|
| **統一色板** | 清走 Spotify 綠 #1ED760,全 App 一套「生命樹」色板(深林綠 #0B0F0E / 生命綠 #3DB389 / 暖金 #E8B86D)。`designSystem.js` 做唯一來源,`constants/theme.js` 改成相容層指返佢。App.js 五個本地色常數 + 134 個散落 hex 全部改指色板 → App.js 零寫死 hex,live code 零 Spotify 綠。金色只留俾金句/精選。 |
| **四 tab** | 六格(首頁/搜尋/分類/清單/最愛/播放)→ **四格(首頁/搜尋/詩歌庫/我的)**。搜尋+分類合併;清單+最愛+帳戶合併入「我的」;播放唔佔格(撳 mini player 展開)。tab 圖標改向量,active 用生命綠。 |
| **首頁四區塊** | 十個(大部分假數據)→ **四個真嘢**:每日金句 / 繼續收聽 / 精選清單 / 最近加入。 |
| **繼續收聽** | 新加:最後播嗰首存 MMKV(`src/lastPlayed.js`,獨立 module 免 circular import),`playQueue()` 寫入。 |
| **精選清單** | DB 冇 playlist 定義,喺 150 首試版庫用語言+關鍵字即場砌(粵語敬拜/國語敬拜/English/安靜靈修),唔夠 3 首就唔顯示。 |
| **歌詞頁** | 接返真 DB `lyrics` 欄(`/api/hymns` 而家有回傳,150 首入面得 10 首有歌詞)。冇歌詞 = 歌詞 pill 灰咗 disabled + 顯示「暫無歌詞」,唔呃人。 |
| **播放頁 action bar** | 4 粒獨立膠囊 pill,順序 **最愛/歌詞/分享/清單**(Eric 指定)。向量圖標。最愛反映着燈狀態、分享用原生 Share sheet。 |
| **播放清單手勢** | 改用 **@gorhom/bottom-sheet**(`BottomSheetModal` + `BottomSheetFlatList`),向上滑彈出/向下滑收起。唔再用自製 PanResponder(v179-v189 同 FlatList 撞 scroll 嘅老問題,BottomSheetFlatList 由庫本身協調就冇咗)。 |
| **Emoji 清走** | §5.4:tab、封面 fallback、mini player、播放清單文字嘅 🏠🔍📚📋❤️🎵🌳 全部換向量圖標。live UI 零 Emoji。 |

### ⚙️ Opus 驗收手尾兩點(v227,versionCode 22)
獨立 Opus session 驗完 Phase 3 核心冇 regression,但點出兩個手尾,已補:
1. **仲有兩個 live 畫面漏咗 Emoji**:上面嗰輪清 Emoji 漏咗 `SearchScreen.js`(搜尋 tab:🔍🕒↗🎵✕)同 `AuthScreen.js`(✝️)。兩個都係 live code。已全部換向量圖標(MaterialIcons / MaterialCommunityIcons `cross`),兩個 file 順手補返之前冇 import 嘅 `MaterialIcons` + 色板。**用真正 emit 出嚟嘅 bundle 核實**(唔淨止 grep source):🔍/🕒/🎵/✝️/🔀/🔁 喺 reachable Hermes bundle 全部 0。其餘 grep 到嘅 Emoji 全部喺**唔喺 import graph 嘅死 code**(舊 CategoriesScreen / WebPlayerScreen / home/* row 等),留返 legacy 一次過清。
2. **action bar「清單」pill 之前仲開緊舊 sheet**:「清單」開嘅係舊嗰個自製 PanResponder + Animated Modal(`setShowPlaylistSheet`),仲帶住一個舊 bug —— 同一個 `sheetPanY` node 拖曳用 `useNativeDriver:false`、放手用 `:true`,會 warn 兼有機會整壞動畫。已轉做 gorhom `BottomSheetModal` + `BottomSheetFlatList`(同 queue sheet 一致),加 `enableDynamicSizing={false}`(gorhom v5 default `true` 對住 virtualized list 會度錯高度、有機會塌成一條)。PanResponder 至此完全冇用,已由 import 移走。
3. queue sheet 嗰個 `enableDynamicSizing={false}`(App.js ~990)本 worktree 已經有,同 reviewer 未 commit 嗰行一致,唔使再補。

### ⚠️ reanimated 4 —— 一個高風險 native 升級,已驗證 build 得
- @gorhom/bottom-sheet 要 `react-native-reanimated`。SDK 56 pin **reanimated 4.3.1**,
  呢個 major version 要埋 **`react-native-worklets` 0.8.3** + 唔同嘅 babel plugin。
- 新加咗 `babel.config.js`(之前**冇**),用 `babel-preset-expo` + `react-native-worklets/plugin`。
- **點解要特別小心**:reanimated 4 好新,native 升級一撚錯成個 build 就冧。所以落 commit 之前
  **分三關驗**:①`expo export` 裝完 bundle 到(681 modules)②wire 完 sheet 再 bundle(1229 modules)
  ③`gradlew assembleRelease` **native build 成功**(3m45s,`libreanimated.so`/`libworklets.so`/
  `libgesturehandler.so` 四個 ABI 都入咗 APK)。三關全過先 ship。
- 🔴 **但我 test 唔到手勢** —— 呢個環境冇 emulator/device。**build 係驗證咗,但個 bottom sheet
  「滑起上嚟順唔順」一定要 Eric 真機試。** 如果手勢有問題,係 runtime 唔係 build 問題。

### 驗收(§7:搵未用過嘅朋友試,唔使教都行到主流程)—— 未做
要 Eric 真機行一次。重點試:
1. 四個 tab 撳落去都有嘢、mini player 撳到展開播放頁
2. 首頁四區塊、「繼續收聽」有冇記到上次
3. **播放清單向上滑彈出/向下滑收起順唔順**(reanimated 手勢,最需要驗)
4. action bar 四粒掣、歌詞頁(揀一首有歌詞嘅 vs 冇歌詞嘅)
5. 成個 App 冇 Spotify 綠、冇 Emoji

### legacy 未清(唔阻 build)
- 舊 tab 畫面 `CategoryScreen.js` / `PlaylistScreen.js` / `FavoritesScreen.js` 冇再 import,檔案仲喺度。
- `src/screens/PlayerScreen.js` 本身有 syntax error(**Phase 3 之前已經壞**,冇 import,Metro 唔 bundle)。
- 呢啲留返 Phase 3 收尾或者之後一次過清。

---

## 三之五、Eric 真機測試 3-bug 修正（v228,versionCode 23,2026-07-18）

> Phase 3 之前一直冇 device / emulator,所以 code review 冧唔到嘅 runtime bug 到 Eric 真機
> 試 v227 先浮面。呢個 build 修咗嗰 3 個,全部係「真機先見到」嗰種。

### Bug 1 & 2:兩個 bottom sheet 撳唔開(播放頁「清單」pill + 底部「播放清單」欄)
- **病徵**:撳落去完全冇反應,sheet 彈唔出。
- **v228 當時嘅判斷(❌ 後來證實係錯):**以為係「reanimated 4.3.1 + gorhom 5.2.14
  唔夾,`.present()` set 咗 state 但冇 animate」,所以兩個 sheet 都改返 native `<Modal>`,
  犧牲咗手勢。**真正根因見下面「三之六」。呢段保留落嚟做記錄,唔好照抄。**

### Bug 2b:action bar「最愛」掣撳落去冇反應(歌詞/分享有)
- **根因**:`FavoritesContext.toggleFavorite` 舊版第一句係 `const s = getStorage(); if(!s) return;`
  —— MMKV 喺 release JSI 出事(本 App 已知問題,見四之 MMKV)時 `getStorage()` 返 null,
  成個 toggle **靜靜哋 no-op**,個心永遠唔着燈。歌詞(local state)、分享(native)唔使 storage
  所以冇事 —— 啱啱好對到 Eric「淨係最愛冇反應」。
- **修法**:先 `setFavorites`(記憶體 state 一定即刻更新、個心即刻着燈),持久化改成
  **盡力而為**(MMKV 掛咗就 try/catch 跳過,唔阻 UI)。即係就算 storage 死咗,揀最愛嘅
  即時反應都一定 work,最多係唔記得低。

### Bug 3:封面圖有黑邊 / letterboxing(播放頁大封面 + 首頁「最近加入」卡)
- **根因**:所有封面用緊 YouTube `hqdefault.jpg` —— 佢係 **4:3(480×360)**,YouTube 會將
  16:9 影片 **baked 咗上下兩條黑邊**入張圖。封面容器係正方形 `cover` 裁剪,裁走咗左右之後,
  嗰兩條黑 bar 仲喺頂同底 → 就係 Eric 見到嘅黑邊。
- **修法**:改用 **16:9 冇黑邊**嘅 thumbnail。
  - 一般縮圖(list / 卡 / mini player / TrackPlayer artwork)→ `mqdefault.jpg`(320×180,一定有)。
  - 播放頁大封面 → 新 `<BigCover>`:先試 `maxresdefault.jpg`(1280×720 高清 16:9),
    404 就 `onError` 降返 `mqdefault`,再唔得先向量 fallback。全部 `resizeMode: cover`。
  - 改咗 shared `src/utils/albumCover.js` + App.js helper + 各 live 畫面嘅 inline 複本
    (Library/Mine/Search/home HomeScreen/DailyQuoteCard)。dead 舊畫面冇郁。

### 驗證(冇 device,盡量 build-time 驗)
- 3 個改動 file babel 過;`expo export` 全 bundle 乾淨(冇 error,gorhom import 已移走)。
- native build `assembleRelease` 成功、簽名一致。
- 🔴 **手勢/彈出/黑邊嘅實際觀感一定要 Eric 真機覆測**(見下面覆測清單)。

### v228 覆測清單(Eric)
1. 播放頁撳「清單」pill → 加入到清單 sheet **彈到出嚟**、撳最愛/清單有反應、撳空白位收到。
2. 播放頁撳底部「播放清單 (N)」→ 佇列 sheet **彈到出嚟**、撳歌會跳、可以滾。
3. action bar「最愛」→ 個心**即刻着燈/熄燈**(撳完再入返播放頁睇下記唔記得)。
4. 播放頁大封面 + 首頁「最近加入」卡 → **冇黑邊**、圖填滿。
5. 裝之前**先解除安裝舊 App**(舊 apk 已搬去 `舊版本_勿裝/`)。

---

## 三之六、bottom sheet 真根因 + 手勢版還原（v229,versionCode 24,2026-07-18）

> Eric 唔收貨 v228 嗰個「撳先彈」嘅 static modal,要求一定要有 YouTube Music 果種
> 向上滑彈出 / 向下滑收起。重新徹底 diagnose 之後,**證實 v228 嘅根因判斷係錯嘅**。

### 真根因:唔關 reanimated 事,係 **z-order**

版本組合完全冇問題,全部就係 Expo SDK 56 `bundledNativeModules.json` 欽定嗰套:

| 套件 | 裝住 | SDK 56 指定 |
|---|---|---|
| react-native-reanimated | 4.3.1 | **4.3.1** ✅ |
| react-native-worklets | 0.8.3 | **0.8.3** ✅ |
| react-native-gesture-handler | 2.31.2 | ~2.31.1 ✅ |
| react-native | 0.85.3 | reanimated peer 要 `0.81 - 0.85` ✅ |

babel worklets plugin 都係行緊嘅 —— export 出嚟個 bundle grep 到 **34 個 `__workletHash`**。
即係話 reanimated 由頭到尾都正常,個 sheet **其實有 present、有 animate**。

問題喺 `<BottomSheetModal>` **唔會喺原地 render**,佢 portal 去 `<BottomSheetModalProvider>`。
睇 gorhom 5.2.14 source(`BottomSheetModalProvider.tsx`):

```jsx
<BottomSheetHostingContainer ... />          {/* absoluteFill,冇 zIndex,排第一 */}
<PortalProvider rootHostName={hostName}>{children}</PortalProvider>
```

而我哋成個 App 都喺 `{children}` 入面,**包括 `olStyles.overlay`**:

```js
overlay: { position:'absolute', top:0,left:0,right:0,bottom:0,
           backgroundColor: MAIN_BG_COLOR,   // ← 不透明
           zIndex: 999 }                     // ← 蓋過一切
```

RN 入面 zIndex 999 一定畫喺 zIndex 0 之上 → **個 sheet 係喺塊不透明全螢幕播放器底下
animate 緊,用家永遠見唔到**。表徵就係「撳咗完全冇反應」。
亦解釋到點解 native `<Modal>` 一改就掂 —— native Modal 係獨立 Android window,一定喺最面。

### 修法:改用 **inline `<BottomSheet>`**(唔經 portal)

`<BottomSheet>`(default export)係喺原地 render 嘅。擺喺 `FullScreenPlayerOverlay`
個 container **最後一個 child** → 天然畫喺 overlay 內容之上,冇晒跨層 z-order 問題,
而手勢引擎同 `<BottomSheetModal>` 完全一樣 → **向上滑彈出 / 向下滑收起照有**。

要點:
- `index={-1}` 起手收埋;開 = `ref.snapToIndex(0)`,收 = `ref.close()`。**用 ref 唔用 state**,
  咁用家用手勢拖走個 sheet 嗰陣唔會同 React state 唔同步。
- **唔可以加返 `BottomSheetModalProvider`** —— 加返就走返 portal 路,個 bug 即刻返嚟。
  App.js 檔頭同 `export default function App()` 都寫咗警告。
- `snapPoints` 提咗去 module 層(`QUEUE_SNAP_POINTS` / `ADD_SNAP_POINTS`)。每次 render
  開新 array 會令 gorhom 重算 layout、拖到一半彈返。
- `enableDynamicSizing={false}` 保留(v5 default `true` 對住 virtualized list 會度錯高度)。
- 清單用 `BottomSheetFlatList`:由 gorhom 協調手勢同 scroll,滾到頂再向下拖先收 sheet。
  **呢個就係點解唔可以自己寫 PanResponder**(v179–v189 撞 scroll 嗰個老坑)。
- sheet **入面**啲掣用 gorhom 嘅 `TouchableOpacity`(import 做 `SheetTouchable`)。
  RN 內置嗰個用舊 responder 系統,喺 gesture-handler 手勢區內喺 Android 會俾 pan
  搶咗 touch,撳落去時好時壞。
- Android 返回鍵:有 sheet 開緊就收 sheet,唔好收埋成個播放器(`BackHandler` + `onChange`)。

### 驗證到邊
- `expo export` 乾淨;`assembleRelease` BUILD SUCCESSFUL;
- 拆返個 release APK 入面條 bundle 確認到 gorhom 真係入咗(`BottomSheetHostingContainer`)
  同 worklets 有編譯(`__workletHash`)。
- ⚠️ **手勢本身冇喺真機/emulator 試過**(呢個環境冇 device)。診斷係 source-level 推理,
  但今次係讀住 gorhom 5.2.14 個 source 確認咗 render 次序同 style,唔係估。

### v229 覆測清單(Eric)
1. 播放頁撳底部「播放清單 (N)」→ sheet **滑上嚟**;**向下滑可以收起**;可以滾;撳歌會跳。
2. 播放頁撳「清單」pill → 加入到清單 sheet 同樣**滑上滑落**。
3. sheet 開住嗰陣撳 Android **返回鍵 → 只收 sheet**,唔會連播放頁一齊收埋。
4. sheet 開住撳上面暗咗嗰忽(backdrop)→ 收起。
5. sheet 收埋之後,下面啲掣(播放/上一首/下一首)**照撳得**(backdrop 冇擋住)。
6. 裝之前**先解除安裝舊 App**(v228 已搬去 `舊版本_勿裝/`)。

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

#### 15. 死鏈跳歌慢（原本約 22 秒）— 🟢 已大幅改善
- ✅ `resolveAudio.js` 加咗 **failure cache（15 分鐘）**：撞返同一條死 link 唔使再行足 3 個 yt-dlp strategy。
  實測 hymn 11：**第一次 6.52 秒 → 之後 0.001 秒**。連環跳死 link 而家近乎即時。
- 仲有得再快嘅話：**第一次**撞一條未見過嘅死 link 仍然要 ~6.5 秒（3 個 strategy 各自行到 fail）。
  想再縮就要調 `STRATEGIES` 嘅 timeout（而家每個 30 秒上限）或者減少 strategy 數量 —— 未做。
- 治本仍然係 Phase 2 嘅歌庫 cleanup（清走死 link）。

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

### 4. 後端部署方案 —— 🟡 **止咗血，但未真正上雲**
- **目前**：開發者 MacBook 本地跑 server + cloudflared **named（永久）** tunnel expose，
  固定 URL `https://api.god-music.com`
- ✅ **2026-07-17 已解決「URL 每次都變」呢個日常痛點**（買咗 god-music.com + named tunnel，見「七、開發筆記」）
  → tunnel 重開唔使再改 config / rebuild / 重裝
- ❌ **但根本問題未解決**：backend 仍然係跑喺**一部屋企嘅 Mac** 度 —— 部機閂咗／冇網，成個 App 就死。
  呢個唔係「部署」，只係「有個固定門牌嘅家用伺服器」。真正上雲仲要面對下面個 IP 封鎖問題。
- 🔺 **2026-07 實測結論（重要，會影響選型）**：
  - **Zeabur 個 IP 已經俾 YouTube 封咗** —— 唔係「yt-dlp 冇裝好」（之前嘅假設係錯嘅）。
    喺 Zeabur container 內部直接跑 yt-dlp（版本 2026.07.04，裝好晒），
    對 5 條唔同影片 **5/5 全部** 中：`Sign in to confirm you're not a bot`。
    即係 **datacenter IP 信譽封鎖**，唔係用得密先封 → **換 region / 開新 project 好可能都係一樣中招**。
  - 所以「Docker ready 就可以擺上 Zeabur」呢個假設**已經唔成立**。
  - 🔺 **2026-07-17 追加實測：`--extractor-args "youtube:player_client=..."` 呢個免費解法試過，唔 work，唔好再試。**
    喺 Zeabur container 內部掃咗 **8 個 client**（android / ios / tv / web / mweb / android_vr /
    web_embedded / tv_embedded），**8/8 全部**照撞 `Sign in to confirm you're not a bot`。
    對照組：同一條指令、同一條片、同一個 yt-dlp 版本，喺 MacBook 跑 `android_vr` **成功攞到 URL**。
    → 證實個 block 係**純 IP 信譽**，喺 bot check 嗰層就擋，**換邊個 player_client 都冇用**。
    （註：Mac 上面 android/ios/tv/web 會報 `Requested format is not available`，
    嗰個係另一回事 —— 冇 JS runtime 令部分 format 攞唔到，**唔係** bot block，唔好撈亂。）
- **選項 A**：Zeabur / Railway → ⚠️ 要先解決 IP 封鎖先講（見下面 mitigation）
- **選項 B**：VPS（自行維護）→ 一樣要**事先驗證**嗰個 IP 冇俾 YouTube 封（用上面同一個測試）
- **選項 C**：靜態化（預先提取 URL 存 DB）→ 但 googlevideo URL 會過期，做唔到長期
- **選項 D**：用戶自己上載歌 → **唯一唔使賭 YouTube IP 狀態**嘅方案，長遠最穩
- **選項 E（而家行緊）**：家用 Mac + named tunnel。冇 IP 問題 ⚠️ 但**唔係因為住宅 IP** ——
  實情係部 Mac 行緊 **NordVPN**,出口 IP 係 PacketHub/NordVPN(美國西雅圖),只不過嗰條 IP 未被封。
  URL 固定，成本只係個 domain。**代價：部 Mac 要 24/7 開住**，唔 scale，唔算真正部署。
- Mitigation 方向（未跟進）：yt-dlp 用 cookies、住宅／rotating proxy（要持續畀錢 + 維護）
- `AUDIO_PROXY_TARGET` env var 已預留 proxy 模式
  （⚠️ Zeabur 個 service 而家仲設緊呢個，指向一條**已死**嘅 localtunnel `smart-vans-design.loca.lt`，
  即係嗰個 Zeabur service 而家實質係壞緊嘅 —— 唔用就記得執走／唔好當佢 work）

> 💡 **值得留意嘅組合技**：`AUDIO_PROXY_TARGET` 本身就係為咗「雲端 server 唔 resolve，
> 轉發返屋企部機 resolve」而設。即係話，將來如果要上雲又想避開 IP 封鎖，
> 可以雲端行 server（穩定、24/7）＋ 部 Mac 淨係做 yt-dlp resolve（靠 NordVPN 出口 IP 未被封）。
> ⚠️ 但見「三之三」:googlevideo URL 綁 IP,所以音訊 byte 一樣要經 Mac 出,呢招慳唔到幾多。
> 呢個係現有 code 已經支援嘅路，只係要 Eric 決定值唔值得咁複雜。

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
cd backend && nohup node server.js > /tmp/hymn_backend.log 2>&1 & disown
#    開機會背景 pre-cache 一小批（~30-50 首，唔阻住用）。其餘歌播嗰陣先即時 resolve。
#    ⚠️ 唔好改返做「開機掃晒成 1518 首」——嗰種爆發式打法就係搞到 Zeabur 個 IP 俾 YouTube 封嘅原因，
#       而家部 Mac 出去嗰個 IP(NordVPN,唔係住宅)係成個 App 唯一能用嘅 IP，唔值得去賭。

# 2. Tunnel（手機要行呢步先連到）
nohup cloudflared tunnel run hymn-api > /tmp/hymn_tunnel.log 2>&1 & disown
#    ✅ 固定 URL：https://api.god-music.com（唔會變，唔使改 config、唔使 rebuild）
#    config 喺 ~/.cloudflared/config.yml，已經指死 localhost:3001

# 3. Frontend dev（如果唔係要出 APK）
cd frontend/hymn-app && npx expo start
```

### ⚠️ 兩個 process 都要 keep 住行，唔係 App 就死
**症狀**：App 主頁淨係得「見證分享」、播放清單 (0)、player 得個紫色音符 placeholder
= **連唔到 backend**。（同「tunnel URL 過時」嘅症狀一模一樣，好易撈亂。）

**一步分辨**：
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.god-music.com/api/hymns
```
- **530** = Cloudflare 話「搵唔到 origin」→ **tunnel 冇行緊**（或者 backend 冇行緊）
- **200** = backend 冇問題，去第二度搵原因
- **DNS 唔使懷疑**：`dig +short api.god-music.com` 應該有 Cloudflare IP（104.21.x / 172.67.x）。
  DNS 一早 propagate 好晒，唔會係佢問題。

**逐個 check**：
```bash
lsof -ti :3001                      # backend 有冇行緊
pgrep -fl "cloudflared tunnel run"  # tunnel 有冇行緊
```

**⚠️ 一定要用 `nohup ... & disown`**：淨係用 `&` 開嘅 process 會喺個 shell session 完咗之後
俾人收掉（曾經就係咁死咗，搞到以為又係 tunnel URL 出事）。
開完之後 `ps -o ppid= -p <pid>` 應該係 **1**，即係已經 detach 咗。
（註：`setsid` 係 Linux 嘅嘢，**macOS 冇**，唔好用。）

**想一勞永逸唔使記住開**（未做，要 sudo）：
`sudo cloudflared service install` 可以裝做 launchd daemon，開機自動行。
Backend 都可以寫個 launchd plist 做同樣嘢。要 Eric 自己入密碼。

### 頻寬同容量:最多同時幾多人聽?(2026-07-17 實測)

#### 🚨 首先:部 Mac 行緊 **NordVPN**,唔係直駁住宅寬頻
公網 IP `185.219.141.202` = **PacketHub S.A.(NordVPN),美國西雅圖**。
(cloudflared 連嘅都係 `sea01/sea06/sea09` 西雅圖節點,對得上。)
**成個 App 靠緊呢條 NordVPN 出口 IP 未被 YouTube 封。** 之前文件寫「住宅 IP」係**錯**嘅,已更正。

⚠️ **最大隱藏風險**:NordVPN 一旦斷線 / 自動換節點 / 換 IP,新 IP **有機會係已經被 YouTube 封嘅**,
咁就會變成「同 Zeabur 一樣」——即刻冇歌聽。呢個係目前架構**最脆弱**嘅一環,而且**唔喺我哋控制範圍**。
👉 建議:NordVPN 揀「固定 IP / 專用 IP」或者至少鎖死一個 server,唔好用自動切換。

#### 實測數字
| 項目 | 實測 |
|---|---|
| 上傳(樽頸) | **136.8 Mbps** |
| 下載 | 225.8 Mbps |
| 機器 | M2 Pro,10 core,16GB |
| backend 閒置 | 84 MB RSS,~0% CPU |
| cloudflared | 47 MB RSS,~0.7% CPU |
| yt-dlp resolve 一次 | 2.1 秒,**87 MB RAM**,0.35s CPU |
| 30 條同時串流 | 30/30 成功 |

#### 計算(128 kbps 一個聽眾)
一個聽眾同時食:**128 kbps 上傳**(Mac→CF→電話)+ 128 kbps 下載(googlevideo→Mac)。上傳先爆。

- 理論:136.8 Mbps ÷ 0.128 = **~1,068 人**
- 扣 VPN + QUIC + TLS + HTTP 封裝開銷(~25-30%)→ **~750-800 人**

**但頻寬根本唔係真樽頸。**

#### 真樽頸(由嚴重到唔嚴重)
1. **🔴 yt-dlp resolve 風暴** —— 最尖嗰個。cache miss 時每首**唔同**歌開一個 yt-dlp process:
   2.1 秒、**87MB RAM**。50 個人同時開 50 首**未 cache** 嘅歌 → 50 × 87MB ≈ **4.3GB RAM** + CPU 尖峰。
   in-flight dedup 只擋到「同一首歌」,擋唔到「50 首唔同歌」。
   平時 150 首 curated + 4-5 小時 cache,miss 好少;但 **backend 一重開 + 一堆人同時用** 就會撞。
   👉 緩解:開機 pre-cache 由 30 首加到成 150 首(150 × ~2.5s ÷ concurrency 2 ≈ 3 分鐘),
      咁 cache 就長期暖住。**未做,值得做。**
2. **🟠 Cloudflare 免費方案 ToS** —— Cloudflare 一向唔鍾意免費方案拎嚟大量派音訊/影片。
   人多咗有機會俾佢限流或者叫你升級。呢個係**政策風險,唔係技術風險**,唔會有 error message 預警。
3. **🟡 Node.js 單線程** —— 串流係 I/O bound(純 pipe),幾百條並發都應付到。實測 30 條 30/30 成功,
   backend 幾乎 0% CPU。**唔係近期樽頸。**
4. **🟢 googlevideo 每條 stream 自己 throttle** —— 實測每條約 0.8 Mbps,已經係 128kbps 嘅 6 倍,夠用。

#### 建議數字
| | 人數 | 講法 |
|---|---|---|
| 理論(頻寬) | ~800-1,000 | 數學上限,冇意義 |
| 實際安全 | **30-50 人同時** | ✅ 建議唔好超過 |
| 開始有風險 | 100+ | yt-dlp 風暴 + Cloudflare ToS |

⚠️ **同 Eric 個 1000 用戶目標對返數**:音樂 App 嘅同時在線通常係總用戶嘅 **5-10%**,
即係 **1000 用戶 ≈ 50-100 人同時** —— **啱啱好踩到呢個 setup 嘅上限**。
即係話「1000 用戶」嗰陣,呢個架構就係頂唔頂得住嘅臨界點,到時就要認真傾版權/授權同真正嘅部署方案。

### 開機自動啟動（2026-07-17 已設定好）✅

兩個 process 都交咗俾 launchd，**唔使再人手開**：

| Service | plist | 做乜 |
|---|---|---|
| `com.hymnapp.backend` | `~/Library/LaunchAgents/com.hymnapp.backend.plist` | 行 `node server.js` |
| `com.cloudflare.cloudflared` | `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist` | 行 `cloudflared tunnel run hymn-api` |

兩個都 `RunAtLoad` + `KeepAlive`，即係**登入就自動行，死咗會自動拉返起**。
**實測**：`kill -9` 兩個 process → **~2 秒內自動復活**（PID 變咗，證明係新開唔係冇死過），
之後 `api.god-music.com` 嘅 health / hymns / stream 全部照樣 200。

**常用指令**（唔使 sudo）：
```bash
launchctl list | grep -iE "cloudflare|hymnapp"      # 睇兩個仲喺唔喺度（第 2 欄係 exit code）
launchctl unload ~/Library/LaunchAgents/com.hymnapp.backend.plist   # 停
launchctl load -w ~/Library/LaunchAgents/com.hymnapp.backend.plist  # 開
tail -f /tmp/hymn_backend.log                                       # backend log
tail -f ~/Library/Logs/com.cloudflare.cloudflared.err.log           # tunnel log
```

#### ⚠️ 兩個坑（改嗰陣一定要記住）

1. **backend plist 一定要自己 set `PATH`**
   launchd 預設 PATH 係 `/usr/bin:/bin:/usr/sbin:/sbin`，**冇 `/opt/homebrew/bin`**。
   但 backend 要 exec `yt-dlp`（喺 `/opt/homebrew/bin`）。唔 set 嘅話 server 會**照開得成功**，
   但**每一首歌 resolve 都會失敗**（command not found）→ App 連到 backend 但永遠冇聲，超難查。
   plist 入面 `EnvironmentVariables` 已經 set 咗。

2. **`cloudflared service install` 整出嚟嗰個 plist 係壞嘅，一定要手改**
   佢 generate 出嚟嘅 `ProgramArguments` **淨係得個 binary，冇任何參數**。
   Named tunnel 咁行唔通 —— 淨行 `cloudflared` 只會 print
   「use `cloudflared tunnel run` to start tunnel hymn-api」然後 exit 1，
   launchd 就會不停 crash-loop，`api.god-music.com` 一路 530。
   已經手動加返 `--config ... tunnel run hymn-api`。
   **如果將來再行一次 `cloudflared service install`，佢會覆蓋返個 plist，要記得再加返啲參數。**

#### ⚠️ LaunchAgent = 「登入之後」先行，唔係「開機就行」
`cloudflared service install` 自己都有 warn：user launch agent 只會喺**用戶登入咗**之後行。
即係話部 Mac 重開之後**停喺登入畫面嘅話，兩個都唔會行**。
- 想真係「開機就行」→ 部 Mac 要開 **自動登入**（系統設定 → 使用者與群組 → 自動登入），
  咁開機自動登入之後兩個 agent 就會跟住行。
- 另一條路係裝做 **LaunchDaemon**（要 sudo，開機即行、唔使登入），
  但 cloudflared 嘅憑證喺 `~/.cloudflared/`，daemon 行緊 root 會搵唔到，要搬 config 同 credentials
  去 `/etc/cloudflared/` 先得 —— 較麻煩，未做。

### Cloudflare named tunnel 設定（2026-07-17 已做好，記錄低以防要重做）
- Domain：**god-music.com**（Eric 喺 Cloudflare Registrar 買，DNS 喺 Cloudflare）
- Tunnel 名：**hymn-api**，ID `d662c971-6a08-48e7-b97b-0448fc76dea8`
- DNS：`api.god-music.com` → CNAME 指向條 tunnel
- 憑證：`~/.cloudflared/cert.pem` + `~/.cloudflared/<tunnel-id>.json`
  ⚠️ **呢兩個檔案係機密，唔好 commit 入 repo**（`.cloudflared/` 喺 home directory，唔喺 repo 入面，安全）
- 設定檔：`~/.cloudflared/config.yml`（ingress: api.god-music.com → http://localhost:3001）
- 要重做嘅話：`cloudflared tunnel login`（要人手喺瀏覽器撳 Authorize）→
  `cloudflared tunnel create hymn-api` → `cloudflared tunnel route dns hymn-api api.god-music.com`
- **想部機開機自動行 tunnel**（唔使記住開）：可以行 `cloudflared service install`（未做）

### 最新 APK
> ⚠️ **只信呢一段。** 判斷邊個至新，**睇 `versionCode`（大 = 新），唔好睇檔案名嘅 vXXX**。
> versionName 全部 build 都係 `1.1.1`，分唔到。

- **✅ 而家應該裝呢個：`~/Desktop/詩歌App/hymn-app-v225.apk`（versionCode 20）**
  —— Phase 1 + 獨立驗收 4 項修正 + 播放清單「已隨機排序」提示
- 舊嘅（唔好裝，Android 都會拒絕降級）：
  - v223（versionCode 18）— 斷路器／failure cache／narrow pre-cache／queueRef sync
  - v222（versionCode 17）— 轉用固定 URL `api.god-music.com`
  - v221（versionCode 16）— Phase 1 完成、清走 debug instrumentation
  - v220（versionCode 15）— shuffle 修好
- Desktop 個資料夾入面仲有 v212–v231 等舊 APK。**嗰啲 v2xx 檔案名同 versionCode 冇對應關係**
  （v231 個 versionCode 得 4，比而家細），**唔好靠檔案名認新舊**。
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
- **`feature/player-rebuild` — ⭐ Phase 1 成果（v215–v225），最新，未 merge 返 develop-v211**
- `release-v219` — ⚠️ **v215–v231 嘅真正 source 喺呢度**（Boaz/OpenClaw 嗰個 clone 做嘅），
  同 `feature/player-rebuild` 係**兩條獨立線**，未合併
- `experimental/unmerged-actionbar-ui` — 一份來源不明、未 merge 嘅 action bar UI 改動，
  同已出街嘅 v231 設計唔同，保存低等 UI 方向拍板先決定去留
- `feature/error-handling` — 錯誤處理實驗分支

### ⚠️ 兩個 clone 嘅陷阱（好易搞錯）
- `/Users/macbookpro/.openclaw/workspace/hymn-app` — 呢個（Phase 1 喺度做）
- `/Users/macbookpro/Desktop/lifetree-hymn-app` — 另一個 clone，`release-v219` 分支有 v215–v231 嘅 source
- 兩邊都指向同一個 GitHub repo。**開工前先 `git branch --show-current` 同 `git log --oneline -5` 確認自己喺邊。**
