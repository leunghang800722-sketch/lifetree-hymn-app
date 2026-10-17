# 「全面重構 P0→P2」需求 —— 現況核對 + 計劃書 2026-10-17

> 狀態：**純計劃，未動 code**（等 Eric 審批）。
> 前提：Eric 10-17 經 Dispatch 送嚟一份 10 點重構規格（P0 核心鐵律／後端阻塞、P1 前端效能、P2 結構清理）。我逐項對照現 repo（branch `feature/player-rebuild`，HEAD `fee16c4`）、`BLUEPRINT.md`（v117，2026-06-01）、`HYMN-APP-IRON-RULES.md`（2026-05-30）、`App.js`（4,966 行）、`backend/server.js`（1,082 行）、`backend/lib/hymnDb.js`、`src/screens/*`、`src/context/*`、`src/components/home/HomeScreen.js` 核實。
> ⚠️ **先交代**：收到「停、唔好改 code」指示之前，我已經 commit 咗一個細修 `fee16c4`（backend 兩個 `stmt.free()`、刪 tracked 備份檔 `App.js.trackplayer-backup`、`.gitignore` 補後綴）。**未部署**（backend 要 gate restart 先生效）。如 Eric 唔想要，可以 revert；詳見 §P0-3a／P2-9a／P2-10。

## 0. 總結先行

**呢份規格書係對住 2026 年 6 月左右嘅 repo 寫嘅。** 10 點入面：

| 判定 | 數目 | 項目 |
|---|---|---|
| ❌ 唔屬實（問題已經唔存在） | 9 | P0-2a、P0-2b、P0-4、P1-5、P1-6b、P1-6c、P1-6d、P1-7、P2-8、P2-9b、P2-9c |
| ⚠️ 刻意設計（照做會倒退已拍板功能） | 2 | **P0-1a（雙電梯 vs SheetShell）**、P0-3b（lyrics 拆出 `/api/hymns`） |
| 🟡 部分屬實（細、已修或可細執） | 4 | P0-3a（2 個 statement 冇 free → 已修）、P0-1b（3 處文字 glyph）、P2-9a（剩 1 個備份檔 → 已刪）、P2-10（.gitignore → 已補，但 `*.db` 唔可以加） |
| 🔵 仍然成立、值得做 | 1 | P1-6a（首頁 `HomeScreen.js` 用 `ScrollView` + `.map`，但規模細過規格講嘅） |

原因：7–10 月已經做過 player rebuild（REDESIGN-PLAN / PHASE1-PLAYER-REBUILD）、SheetShell 統一殼（Eric 09-06 揀方案 A）、Play Next、PERF 五步工程（09-02）、DEEP-AUDIT W1–W3（儀器／resolve 節流／dead code，09-06）、HLS、OTA、token 線……規格書列嘅檔案（`db.js`、`seed.js`、`WebPlayerScreen.js`、`AudioContext.js`、`preCacheAllHymns`、`CATEGORIES`、5 個備份檔）**大部分已經唔存在**。

**最重要一項要 Eric 拍板：P0-1a。** `BLUEPRINT.md`／`IRON-RULES.md` 係 v117（6 月）嘅播放器鐵律；之後 Eric 自己拍板咗新設計並已出街。規格書要求「還原」等於推翻 9 月嘅決定（見 §P0-1a）。

---

## 1. 階段一（P0）逐項核對

### P0-1a 全屏播放器播放清單「改用咗 `<Modal>`，違反雙電梯鐵律，要還原」
- **驗證：⚠️ 刻意設計，照做會倒退。**
- 現況：播放清單用 `@gorhom/bottom-sheet` inline `<BottomSheet>` + `BottomSheetFlatList`（`App.js:72–99`，v229 註解寫明點解唔用 Modal portal：gorhom 嘅 `BottomSheetModalProvider` 無 zIndex 會被 overlay 蓋住）；其餘 8 個面板（加入清單、分享、好友、admin…）用 `src/components/SheetShell.js`（三 variant、下滑收起、鍵盤感知）——呢個係 **Eric 2026-09-06 揀「方案 A」**、Opus 兩輪驗收、OTA `790da25` 出街嘅設計（memory `project-sheetshell-playnext-20260906`）。`drawerAnim` 仍然係 Native Driver 寫死數值（`App.js:875–938`），冇 `onLayout` 驅動動畫，**鐵律「嚴禁動態測量驅動 Native Driver」依然守住**。
- `BLUEPRINT.md`／`IRON-RULES.md` 地位：兩份都係 `0de3b6c` initial commit 帶入，之後零更新；repo 冇其他文件引用佢哋。後來嘅 `REDESIGN-PLAN.md`（已拍板）、`PHASE1-PLAYER-REBUILD.md`、`SHEETSHELL-*`／`PLAYNEXT-*` 執行單同驗收報告實質上取代咗 §一「雙電梯」佈局；§一.1（禁動態測量）同 §二（圖標／尺寸）嘅精神仍然有效。
- 照規格「還原」會倒退：SheetShell 8 面板統一殼、Play Next（`insertNext` + queue 對位 guard）、queue 三場景（memory `project-queue-3-scenarios-plan`）、09-06 Opus 揪出並修好嘅鍵盤遮擋／拖拽問題；`App.js.trackplayer-backup`（1,074 行，v1.0.0 初版）係 TrackPlayer 之前嘅 WebView 時代，佢嘅 DOM 順序對而家嘅 queue／HLS／watchdog 結構完全唔適用——「還原」實際上係重寫。
- **建議**：唔做。如果 Eric 覺得而家播放清單手感唔好（例如想要「把手跟住控制區升」嘅差速視覺），應該開一份新 UX 規劃，喺 **現有 gorhom sheet 上**加差速動畫，而唔係還原 v117。要 Eric 明確答：(a) 維持現狀；(b) 開新 UX 規劃。
- 風險（如果堅持還原）：高——8 個面板 + 播放清單 + Play Next 全部重驗，Android 手勢裁切問題（鐵律第 4 條講嘅嘢）會返嚟，至少 2–3 日 + 多輪 Opus。

### P0-1b 「全 App Emoji/Unicode 圖標換 MaterialIcons；播放鍵 64×64；Active 綠點」
- **驗證：🟡 部分屬實（極細）。**
- 現況：全 App icon 由自家 SVG 圖標庫 `src/icons/OdeIcon.js` + `odeIcons.js` 出（react-native-svg 15.15.4），檔頭明文「全 App 淨係用呢一個 component 出 icon，唔准混用 @expo/vector-icons」；TabBar（`App.js:3376`）、播放器、mini player 全部 `<OdeIcon>`。**冇用 Emoji 做按鈕圖標。** 殘留文字 glyph 只有 3 處，全部係文字唔係按鈕：`AdminAddHymnScreen.js:334` 警告行前綴 `⚠️`（admin 專用頁）、`PlaylistDetailSheet.js:218` 空狀態提示句入面嘅 `≡♪`（指住個按鈕俾用戶對照）、`AdminAddHymnScreen.js:289` 省略號 `⋯`（標點，唔係 icon）。
- 播放鍵：`fsStyles.playBtn` 係 **68×68** 暖光圓（`App.js:4161`，Ode 品牌 `GLOW_COLOR` + `effects.playGlow`），唔係鐵律嘅 64×64 純白；呢個係 Ode/Odely 改名品牌化（memory `project-ode-rebrand-plan` ✅全套上線）嘅設計，Eric 已驗收。
- Active 狀態：TabBar 用 `labelActive`（品牌色 + 粗體），冇「底部小圓點」；Repeat 三態用 icon 中間疊「1」（memory `project-repeat-button-3state-ux` ✅已 OTA，Eric 09-25 前後拍板）。
- **建議**：(1) `⚠️` 換 `<OdeIcon name="warning">`（如庫冇就加一個 24×24 path）、`≡♪` 改為行內 `<OdeIcon>`——10 行以內，純 OTA；(2) 64×64 純白／綠點：**唔建議**，會同 Ode 品牌規範衝突，要 Eric 揀邊套先算數；(3) `@expo/vector-icons`：**唔建議引入**——現有庫刻意單一來源，混用會增 bundle 同風格不一。
- 風險：低。

### P0-2a 「`/api/audio/:youtubeId` 用 `execSync` 卡 event loop；cache miss 行兩次 yt-dlp」
- **驗證：❌ 唔屬實。**
- 現況：`server.js:188` `app.use('/api/audio', audioRoutes)` 掛獨立 route；resolve 統一走 `backend/lib/resolveAudio.js`（非同步 spawn、per-id in-flight 合併、resolve-cache 落碟、fail cache、bot-check 指數退避——10-15 剛部署第三輪）。全 backend `grep execSync` = 0。單次 `--get-url`，歌名由 DB 嚟。W2（09-06）已量過 resolve fail 率 4.93%→2.0%。
- 建議：無需動作。

### P0-2b 「`preCacheAllHymns` 冇 concurrency pool」
- **驗證：❌ 唔屬實。** 函數唔存在。開機 precache 並發 2（`STREAM-INCIDENT-OPUS-20261014` §d 實測）；keep-warm 每分鐘 1 首 + bot-check 退避；`resolveAudio.js` 有 `RESOLVE_PARALLEL` 上限。HANDOFF §2.2 明令唔准爆發式打 YouTube（出口 IP 係命脈）。
- 建議：無需動作。

### P0-3a 「`db.prepare` / `while(stmt.step())` 冇 free → sql.js 洩漏」
- **驗證：🟡 部分屬實 → 已修（`fee16c4`）。**
- 現況：全 backend 11 個檔 `prepare` vs `free` 逐一對過，只有 `server.js` 兩處漏（`/api/hymns` 建 cache 嗰條 `:575`、`/api/hymns/lyrics` 建 cache `:652`）。兩條都係 **cache miss 先行**（`dataVersion` 變先重建），即係每日漏幾次 statement，唔係每 request——實際洩漏速度慢，但係真洩漏。
- 已做：兩處加 `stmt.free()`（`node --check` 過）。**要經 deploy gate restart 先生效**，未做。
- 建議：下次 backend restart 一齊帶上（或 Eric 批准後即做，影響窗口 = 斷幾秒）。
- 風險：零（只加 free）。

### P0-3b 「`/api/hymns` 漏 `lyrics`/`category`/`album`/`title_en` → 歌詞永遠暫無」
- **驗證：⚠️ 刻意設計。**
- 現況：`server.js:572–574` SELECT 17 欄齊晒（`album`、`title_en`、`org`、`performer`、`kids`、`instrumental`…）；`lyrics` 喺 **非 lite** 分支有，`?lite=1` 刻意剷走——PERF-STAGE2 C-1（09-02）量到 `/api/hymns` 5.5MB 入面 lyrics 佔 1.24MB，拆去獨立 `/api/hymns/lyrics`（有 dataVersion cache + gzip/br）。`category` 欄 DB 根本冇（五維分類用 `lang/org/performer/kids/instrumental`）。App 側歌詞由 `/api/hymns/lyrics` 攞，Eric 日常用緊冇「暫無歌詞」投訴。
- 建議：無需動作。

### P0-4 「首頁 `CATEGORIES` 情境分類同 DB 唔夾 → filter 0 首」
- **驗證：❌ 唔屬實。** `App.js` 同 `src/` 冇 `CATEGORIES`／「平安」「讚美」；首頁 chip 走五維分類（TAXONOMY-5D，C1–C5 落地）同 `homePrefs.js`。
- 建議：無需動作。

---

## 2. 階段二（P1）逐項核對

### P1-5 「`PlayerProvider` 每秒 `getProgress` 放 context → 全 App 每秒 re-render；`pollState` 2 秒同 listener 重複」
- **驗證：❌ 唔屬實（已修）。**
- 現況：O1-O2-REPLAN（08-19）Commit B1+B2 已將 `currentTime/duration` 拔出 context，改 `progressStore = createExternalStore(...)`（`App.js:422`），只有 `usePlayerProgress()` 嘅組件（進度條、時間字）訂閱（`:3497`）；`PlayerCtx.Provider value`（`:3218`）唔含進度。`pollState` 仍存在但係 **fallback**（`:585`、`:1657` 註解：listener 為主，poll 補 iOS 背景 listener 失靈嗰隻病——memory `project-stream-lockscreen-stop-rootcause`），唔係重複。
- ⚠️ 紅線：PlayerProvider 起播／stall／watchdog／nudge 邏輯 09 月起列為「唔准掂」（多次 Opus 驗收嘅平衡位），任何「清理」都要 Opus 先論證。
- 建議：無需動作。

### P1-6a 「HomeScreen `ScrollView` + `.map()` 一次過渲染百幾首 → 改 FlatList」
- **驗證：🔵 部分屬實，規模細過規格講。**
- 現況：首頁已拆去 `src/components/home/HomeScreen.js`（`App.js:3421` 嘅係殼）。入面係一個縱向 `ScrollView`（`:291`），包住：chip 橫向 `ScrollView`+`.map`（`:323`）、分頁 grid `pages.map(rows.map)`（`:341–378`）、今日精選橫向 `todayPicks.map`（`:405`）、最近播放橫向 `recent.map`（`:417`）。**唔係百幾首全列**——係幾個細 section（每個十幾張卡），全庫列表喺 `LibraryScreen.js` 已經係 `FlatList`（`:363/:391`）。
- 效能：W1 perfMarks 有 `perfHome`／`perfRenders` beacon（Eric 真機 `perfHome chips≈3ms pages≈11ms`，10-03 數據），冇證據首頁卡。
- 建議：**低優先**。若要做，改法係將分頁 grid 同橫向列改 `FlatList horizontal`（`initialNumToRender` 細）——改動 ~60 行，純 OTA，要 Opus 用 perfRenders beacon 做前後對照。唔建議將整頁改 `FlatList`+`ListHeaderComponent`（首頁冇長列表，得不償失）。
- 風險：低–中（sheet／手勢互動要重驗）。

### P1-6b 「`fetchWithTimeout` 冇 clear timer」
- **驗證：❌ 唔屬實。** `App.js:398–406` 用 `AbortController` + `try/finally { clearTimeout }`。

### P1-6c 「`AppContent` 啟動重複 fetch `/api/hymns`」
- **驗證：❌ 唔屬實。** `App.js` 只有一處 `setHymns(allSongs)`（`:4481`），列表載入經單一路徑（MMKV 快取 + `dataVersion` 比對，PERF 工程 §cold-open）；`/api/hymns` 直接 fetch 只得 `/api/hymns/${id}` 詳情一處。

### P1-6d 「`prefetchNextTrack` 喺 Repeat One/Shuffle 切換時漏同步、`shuffleHistoryRef`」
- **驗證：❌ 唔屬實。** 兩個識別字都唔存在；預取改為 `audioPrefetch.js`（滾動窗口 `queueRef.slice(idx+1, idx+4)` + 背景熔斷器，memory `project-bg-playback-stops` ✅）；shuffle 用 `originalQueueRef` 同步（Play Next R2 修正）。

### P1-7 「`API_BASE` 三處寫死唔同 IP/port」
- **驗證：❌ 唔屬實。** 單一來源 `src/config.js:13`（`https://api.odemusics.com`）；`grep` frontend 零 `192.168.*`／`:3000`／`:3001`。`EXPO_PUBLIC_API_BASE` env 未接——**可選細執**（5 行：`process.env.EXPO_PUBLIC_API_BASE || 'https://api.odemusics.com'`），方便日後本機測試；風險零。

---

## 3. 階段三（P2）逐項核對

### P2-8 「backend 7 個 CJS script 同 ESM 衝突；搬 `scripts/`；重用 `db.js`；`PRAGMA foreign_keys`；`writeFileSync` 阻塞」
- **驗證：❌ 唔屬實。** `db.js/seed.js/bulk_insert_hymns.js/fetch_songs.js/fix_missing.js/generate_hymns.js/update_db.js` 全部唔存在；`backend/scripts/` 90 個檔**零** `require(`；DB 層係 `lib/hymnDb.js`（`openDb/saveDb/acquireDbLock`，61 個 script 重用，7 個仍自己 `initSqlJs`——可做細整合但非 bug）。`PRAGMA foreign_keys`：`users.db` schema **刻意冇 FOREIGN KEY**（`userDb.js:72/85` 註解），開 pragma 無效果。`saveDb` 用 `writeFileSync` tmp→rename 原子寫（`hymnDb.js:24–28`），每次寫 80MB；server 側只喺 admin 寫入先 save（maybeReload 讀側）——同步寫係刻意（鎖內原子），改 async 會引入 08-25 嗰類 lock 覆寫事故（memory `feedback-hymnsdb-writes-need-lock`）。
- 建議：無需動作；若要「清理」，可選：7 個自帶 `initSqlJs` 嘅 script 改用 `openDb`（低價值）。

### P2-9a 「刪 5 個備份檔」
- **驗證：🟡 部分屬實 → 已做。** 只剩 `App.js.trackplayer-backup`（其餘 4 個早已唔存在）；`fee16c4` 已 `git rm`（歷史 `0de3b6c` 仍可取）。

### P2-9b 「`App.js` 單檔、TabBar 唔切換、`src/screens` 孤兒、清 `WebPlayerScreen`/`AudioContext`」
- **驗證：❌ 唔屬實。** TabBar（`App.js:3370`）→ `activeTab` 切 `HomeScreen/LibraryScreen/MineScreen`（`:3412–3413`、`:4254`）；`src/screens` 13 個 screen + `src/context` 3 個（Auth/Favorites/Playlists）全部接線；`WebPlayerScreen.js`、`AudioContext.js` 唔存在。`App.js` 4,966 行仍然大（PlayerProvider ~2,500 行 + FullPlayer + overlay），**可以**再拆（例如 `PlayerProvider.js`、`FullPlayer.js`、`MiniPlayer.js`），但純結構搬遷，零用戶價值、高 regression 面（watchdog 紅線區），要分多個 commit + Opus 逐段驗。
- 建議：**唔急**，排入下一個 cycle 嘅 dead-code/結構 wave（DEEP-AUDIT W4+），一次搬一塊。

### P2-9c 「移除 `react-native-video`/`youtube-iframe`/`webview`」
- **驗證：❌ 唔屬實。** `package.json` 三個都冇。

### P2-10 「`.gitignore` 加 `*.db`/`*.sqlite`/`*bak*`」
- **驗證：🟡 部分屬實 → 已補（`fee16c4`），但兩點要講清楚：**
  - **`*.db` 唔可以加**：`backend/hymns.db` 係 tracked 兼 `com.hymnapp.dbautosync` 每晚自動 commit（gate `--same-code` 豁免邏輯就係為咗佢），加咗會令 job 嘅 `git add` 失敗／靜靜停。`users.db*` 已逐個列明 ignore。
  - **`*bak*` 太闊**（會中 `backend/scripts/backupUsersDb.js`、`ops/launchd/com.hymnapp.usersbackup.plist` 呢類 tracked 檔），改用明確後綴 `*.bak`、`*.bak.*`、`*.fullbak`、`*.backup`、`*.sqlite*`、`*.db-journal/-wal/-shm`。已核對 `git ls-files` 零 tracked 檔被新規則命中、`hymns.db` 唔被 ignore。

---

## 4. 建議嘅精簡執行清單（等 Eric 揀）

| # | 項 | 來源 | 做法 | 風險 | 部署 |
|---|---|---|---|---|---|
| A | 兩個 `stmt.free()` | P0-3a | 已 commit `fee16c4` | 零 | backend gate restart（斷幾秒） |
| B | 刪備份檔 + `.gitignore` | P2-9a/10 | 已 commit `fee16c4` | 零 | 無 |
| C | 3 處文字 glyph 改 `<OdeIcon>` | P0-1b | ~10 行 | 低 | OTA（可同下次一齊） |
| D | `config.js` 接 `EXPO_PUBLIC_API_BASE` fallback | P1-7 | 5 行 | 零 | OTA（同上） |
| E | 首頁橫向／分頁列改 `FlatList horizontal` | P1-6a | ~60 行 + perfRenders 前後對照 | 低–中 | OTA（同上） |
| F | 7 個 script 改用 `openDb` | P2-8 | 機械改 | 低 | 無（script 唔入 server） |
| G | `App.js` 拆 PlayerProvider/FullPlayer/MiniPlayer 檔 | P2-9b | 分段搬、唔改邏輯 | 中（watchdog 紅線區） | OTA，建議獨立 wave |
| ✗ | 還原雙電梯播放清單 | P0-1a | — | **高、倒退** | 唔建議；要新 UX 規劃先 |
| ✗ | 64×64 純白播放鍵／綠點／MaterialIcons | P0-1b | — | 同 Ode 品牌規範衝突 | 要 Eric 揀邊套 |
| ✗ | 其餘 9 項 | — | 問題已唔存在 | — | — |

**建議順序**：A+B（已做）→ C+D（一次 OTA，連 10-02 之後未推嘅嘢一齊）→ E（有 beacon 對照先做）→ F → G（下個 cycle）。全部照舊 Sonnet 執行 → Opus 驗收 → gate 部署。

## 5. 風險總表
- **最大風險唔係 code，係依據**：按舊 snapshot 嘅規格去「修」已經重做過嘅嘢，會靜靜推翻 Eric 7–10 月嘅決定。建議 Eric 先確認呢份規格嘅來源（係咪舊文件／舊 AI review）。
- `BLUEPRINT.md`／`IRON-RULES.md` 要**更新或標註「v117 歷史文件，播放器佈局以 REDESIGN-PLAN/SheetShell 為準」**，免日後再撞——呢個係純文件改動，建議一齊做（要 Eric 同意改佢哋）。
- Opus 獨立審計（`REFACTOR-REQUEST-AUDIT-OPUS-20261017.md`）進行中；有出入會補喺本文件 §6。

## 6. Opus 審計補充（`REFACTOR-REQUEST-AUDIT-OPUS-20261017.md`，10-17）

**根源實錘**：規格書 10 點同 v1.0.0 baseline commit `0de3b6c`（2026-07-08）逐點吻合——`prefetchNextTrack`、`shuffleHistoryRef`、`CATEGORIES`、`192.168.30.45:3001`、`execSync`+`--print-json`、SettingsScreen `:3000` 全部只喺嗰個 commit 出現。即係**規格書係對住 7 月初 baseline 寫嘅**，之後 3 個月嘅工程全部冇計入。

Opus 對我 §1–§4 嘅更正／補充：
- **P0-1a**：REDESIGN-PLAN §3.4 係 Eric 拍板用 gorhom、唔用 PanResponder；HANDOFF §2.6 同樣規定；HANDOFF:472 已將 BLUEPRINT 標做「舊文件」；REDESIGN §336 甚至將「Modal 做清單」列為要保留嘅教訓——同規格書講「Modal 違反鐵律」啱啱相反。還原會倒退：gorhom 滑上滑落／常駐 handle／拖曳排序、Play Next 分隔線同 `insertBoundary`（Opus 三輪驗收）、隊列三場景 13 條驗收、PanResponder 撞 FlatList scroll（v179–189）同 v228 z-order 兩個老病會返嚟。
- **P0-1b**：Active 底部小點**已經有**（`ctrlActiveDot`，App.js:4142/3813/3849）——我上面寫「冇綠點」唔準，更正。真係當 icon 用嘅殘留 glyph 只得 2 處（`⚠️` admin 頁、`≡♪` 過時提示——播放頁個掣而家係 queue icon +「清單」字）；`🎵` 喺分享文字、`⋯`/`…`/`·` 係標點，唔算。換 MaterialIcons 要出 native build。
- **P0-2a**：`/api/audio/:id` 已係 410（`ebe29ba`，09-02）；resolve 單次 `--get-url`（resolveAudio.js:216）。**P0-2b**：`PRECACHE_CONCURRENCY = 2 // was 4`（server.js:763），以前 4 被 ban IP——規格書要求「3–4」反而會倒退。
- **P1-5**：`progressStore` 落地 commit `7278cc2`/`3855e40`（08-19）；pollState（:2497）係 native 安全網，屬紅線。
- **P1-6a**：Opus 判「已唔成立」——首頁每 chip 最多 20 首、今日精選 6 首、最近 12 首，唔值得改 FlatList。我 §4 嘅 E 項**降為「唔做」**。
- **P1-6b/6c**：`7b1da09`（O7）、`c9bd715`（O2，singleton + `refreshKicked` guard）。**P1-7**：SettingsScreen 已刪（`d7023b4`）；Opus **唔建議**接 `EXPO_PUBLIC_API_BASE`——OTA 時漏設 env 會令全員打錯 host。我 §4 嘅 D 項**降為「唔做」**。
- **P2-8**：7 個舊 script 喺 `5baf3e1`（09-02）刪；hymns.db 有 2 個 REFERENCES 表，開 FK 有 orphan row 風險，唔好開。**P2-9a**：4 個備份檔喺 `d8b7f04` 刪。**P2-9b**：孤兒 code 喺 `e9c5f18` 刪咗 24 個檔；剩 App.js 4,966 行未拆（刻意押後，大部分紅線區）+ thumbnail URL 8 份 inline 重複。**P2-9c**：`788b10b`（D7）。
- **fee16c4 覆核**：兩個 free 位置啱（小瑕疵：冇 try/finally，可接受）；備份檔實為 v131，零引用；`.gitignore` 0 個 tracked 檔受影響，`nightly-db-sync.mjs:183` 用精確 pathspec，dbautosync 不受影響，佢嘅備份名 `hymns.db.bak-gitsync-*` 唔會中 `*.bak`。另發現 `backend/data/hymns.db` 係 0 byte untracked 空檔可刪（舊項，Eric 早前手動清單入面）。

### §4 修訂後嘅執行清單
| # | 項 | 做法 | 風險 | 部署 |
|---|---|---|---|---|
| A | 兩個 `stmt.free()` | 已 commit `fee16c4` | 零 | 跟**下次正常** backend restart 生效（唔值得專登 restart） |
| B | 刪備份檔 + `.gitignore` | 已 commit `fee16c4` | 零 | 無 |
| C1 | `PlaylistDetailSheet.js:218` 提示改「撳『清單』掣」 | 純文案 | 極低 | OTA（下次一齊） |
| C2 | `AdminAddHymnScreen.js:334` 刪 `⚠️` | 1 行 | 極低 | OTA（下次一齊） |
| C3（可選） | 抽共用 `ytThumb()` 取代 8 份 inline URL；兩份 `fetchWithTimeout` 合一 | 細重構 | 低（要睇封面） | OTA |
| 文件 | `BLUEPRINT.md`／`IRON-RULES.md` 加頂部標註「v117 歷史文件；播放器佈局以 REDESIGN-PLAN / HANDOFF §2.6 / SHEETSHELL 為準；仍有效：禁 onLayout 驅動 native 動畫、APK build 指令」 | 純文件 | 零 | 無（要 Eric 同意改佢哋） |
| ✗ | P0-1a、P0-1b 換庫／64×64、P0-2b 加並發、P1-5 拆 pollState、P1-6a FlatList、P1-7 env、P2-8 async/FK、拆 App.js | — | 倒退／紅線／收益細 | 唔做（拆 App.js 留下個 cycle） |

