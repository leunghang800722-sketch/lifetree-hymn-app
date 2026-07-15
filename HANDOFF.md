# 詩歌串流 App（生命樹 / Etz Chayim）— 交接文件

> 建立日期：2026-07-15
> 開發者：約拿（AI 助手） x 恒恒（Owner/PM）
> Git 起點：2026-06 初，v100+ 演化至今 v214

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
- 總詩歌數：665 首
- 語言分佈：國語 427 / 粵語 202 / 英文 889（含重複，實際約 665 首 unique）
- API 運行於 port 3001

---

## 三、開發階段 & 已完成功能

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

## 四、已知問題 / Bug / 踩過嘅坑

### 🔴 Critical

#### 1. 665 首詩歌只有 ~15 首可播放（成功率 2.3%）
- **原因**：Database 透過 yt-dlp / yt-dlp Python bindings 批量 scrape，大量 YouTube ID 已失效（deleted/unlisted/region-blocked）或係 playlist/compilation 唔係 single video
- **狀態**：`DEAD_LINKS.md` 記錄咗 47 個已知死 link（基恩敬拜 12 首、讚美之泉 14 首、盛曉玫 12 首等）
- **未修復**：`backend/hymn-check-report.txt` 記錄 665 首中 650 首 HTTP 502 / Timeout，成功率得 2.3%
- **之前嘗試**：
  - E1c：標記死 link（DEAD_LINKS.md）
  - E2：擴庫（scrape 新詩歌加入）
  - YouTube search API 換 ID
  - 最終發現：純靠 YouTube ID 集合式抓取必然大量失效，一次性 cleanup + manual verification 先係正路

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

#### 8. API_BASE hardcoded
- `config.js` 同 `useCachedHymns.js` 用死 URL `https://4e152f1ef2394bdb-94-190-228-145.serveousercontent.com`
- 每次開發者電腦 IP 變就要改（或靠 serveo tunnel）

#### 9. FALLBACK_HYMNS（15 首）vs 真實 hymns（665 首）
- Frontend 用 `STATIC_PLAYLIST` fallback（重複 4 次 = 60 首條目）做 fallback
- 真實 665 首大部分 dead link，display 同 playback quality 要等 cleanup

#### 10. 首頁底部空白
- v203 後 Home 布局已鎖定，但底部留空問題仍有觸及
- 有「**首頁回歸檢查**」規則確保修改唔影響 Home 布局

### 🟢 Low

#### 11. ESLint config 空樁
- `eslint.config.js` 係空樁防 OpenClaw ESLint 崩潰

#### 12. `react-native-youtube-iframe` 仍喺 package.json
- 雖然已拆走 YouTube iframe 播放，但 dependency 未清（唔影響功能）

#### 13. 部分 commited video files
- Git 有 `.gitignore` 排咗 `*.webm *.mkv *.mp4 *.part`，但部分 media 已 commited

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

### 4. 後端部署方案
- **目前**：開發者 MacBook 本地跑 server + serveo tunnel expose
- **選項 A**：Zeabur / Railway 部署（Docker ready，但 yt-dlp 效能問題？）
- **選項 B**：VPS（自行維護）
- **選項 C**：靜態化（預先提取 URL 存 DB，唔用 yt-dlp runtime）
- **未決定**：AUDIO_PROXY_TARGET env var 已預留 proxy 模式，但 deployment 方案未定

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

### Immediate（高優先度）
1. **Database cleanup** — 清理 665 首詩歌的 dead link，只保留可播放的；或者人手重新確認 YouTube ID
2. **歌詞功能** — 將 Database lyrics column 提取到 UI（Modal / overlay 顯示）
3. **後端部署** — 固定部署到 Zeabur / VPS，擺脫 `serveo tunnel` 臨時方案
4. **API_BASE env 化** — 讓 App Build 時可指定 API URL

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
# Backend（MacBook 本地）
cd backend && node server.js

# Frontend（另一個 terminal）
cd frontend/hymn-app && npx expo start
```

### 最新 APK
- v214：`~/Desktop/詩歌App/hymn-app-v214.apk`（81MB）
- GitHub release：`https://github.com/leunghang800722-sketch/lifetree-hymn-app/raw/develop-v211/backend/public/hymn-app-v214.apk`

### 核心文檔
- `BLUEPRINT.md` — 播放器 UI 鐵律（v117 定案）
- `HYMN-APP-IRON-RULES.md` — DOM 順序、差速動畫規範
- `DEAD_LINKS.md` — 已知失效 YouTube ID 清單
- `MEMORY.md`（上一層 workspace）— 版本歷史記錄

### Git Branches
- `main` — 穩定
- `develop-v211` — 最新開發分支（v211-v214）
- `feature/error-handling` — 錯誤處理實驗分支
