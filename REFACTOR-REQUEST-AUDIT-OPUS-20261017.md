# 「全面重構 P0→P2」需求獨立審計（Opus，純只讀，2026-10-17）

範圍：逐項核對 Eric 經 Dispatch 送嚟嘅需求 vs repo 現況（branch feature/player-rebuild，HEAD fee16c4）。
冇改 code、冇 git 寫、冇 restart/OTA。

## 0. 總結

- 需求嘅描述同 **v1.0.0 baseline commit `0de3b6c`（2026-07-08）** 逐點吻合：嗰版 App.js 先有 `prefetchNextTrack`(3 hits)、`shuffleHistoryRef`(8)、`CATEGORIES`(2)、`API_BASE='http://192.168.30.45:3001'`；server.js 先有 `execSync` + `--get-url`/`--print-json` 兩次 call；`SettingsScreen` 寫死 `192.168.50.244:3000`。**現況呢啲全部唔存在**。
- 17 項之中：**已修 12**、**刻意唔同（已拍板）3**、**部分成立（細尾巴）2**、**照做會倒退 4**（同上面有重疊）。冇一項係「仲成立而且大件」。
- 真正值得做嘅只係兩三粒 UI 文字 glyph 同（可選）兩個細 dedupe，全部純 JS/OTA 級，唔掂 PlayerProvider。

## 1. 逐項表

| 項 | 狀態 | 證據 |
|---|---|---|
| P0-1a 播放清單用 `<Modal>` 要還原雙電梯 | **前提錯 + 照做會倒退** | 全屏播放器清單係 inline gorhom `<BottomSheet>`（App.js:3865，`QUEUE_SNAP_POINTS` 常駐 collapsed + 88%），唔係 Modal。歷程：v229 inline sheet（App.js:72-89 註解）→ v231 常駐 handle → v237 拖曳排序 `fdd9f29`(07-20)。REDESIGN-PLAN §3.4:193（Eric 07 拍板）明文「唔用返自製 PanResponder…改用 `@gorhom/bottom-sheet`，黃金差速數值只保留做設計 spec」；HANDOFF §2.6:154-160「唔好自己寫 PanResponder 做 sheet（v179–v189 長期掙扎）」。播放頁剩低嘅 `<Modal>` 只有歌詞（App.js:4007），屬設計。 |
| P0-1b Emoji→MaterialIcons；播放鍵 64；綠點 | **刻意唔同（已拍板）+ 部分成立** | ODE-REBRAND R2 已將全 App icon 由 MaterialIcons 換成 `OdeIcon`（react-native-svg，src/icons/OdeIcon.js:1-5 明文禁混用 vector-icons/emoji），package.json 已冇 `@expo/vector-icons`。播放鍵 68×68 `GLOW_COLOR`（App.js:4161；Ode 色板取代 BLUEPRINT 白底黑 icon / Spotify 綠）。Active 點已有：`ctrlActiveDot`（App.js:4142，shuffle:3813 / repeat:3849）。殘留 glyph 見 §B。 |
| P0-2a `/api/audio` execSync 兩次 yt-dlp | **已修** | resolve 已抽去 lib/resolveAudio.js（`f1121ee` 07-15），`promisify(exec)` 非同步（:7,:16）、單次 `--get-url`（:216-217）；backend 全庫 `execSync` 0 hit。`/api/audio/:youtubeId` 本身已 410（routes/audio.js:34，`ebe29ba` 09-02，前端零 consumer）。 |
| P0-2b preCache 冇 concurrency，要 pool 3–4 | **已有 pool；照做會倒退** | server.js:762-808 已係 worker pool，`PRECACHE_CONCURRENCY = 2 // was 4`，註解 :760-761 記錄「1518 首 × concurrency 4」爆發式流量曾 ban IP。加返 3–4 = 撞 bot-check（memory 10-14/10-15 串流事故根因就係 IP/bot-check）。 |
| P0-3a sql.js statement 冇 free | **已修（今日 fee16c4 補完最後兩個）** | backend 所有 `.prepare(` 都有對應 `.free()`（server.js 6/6、routes/friends 7/7、invites 10/10…）。⚠️ backend pid 69120 由 10-15 17:14 行到而家，**今日 fix 未 live**，要下次正常 restart 先生效（影響細：只喺 dataVersion 變、cache miss 先漏一個 stmt）。 |
| P0-3b /api/hymns 漏 lyrics/category/album/title_en | **已修** | server.js:574-576 column list 有 lyrics/album/title_en/org/performer/kids/instrumental；`?lite=1` 刻意剷 lyrics、改由 `/api/hymns/lyrics`（server.js:651）+ 前端 `getLyricsById`（useCachedHymns.js:206）補返。`category` 欄已被五維分類取代（TAXONOMY-5D）。 |
| P0-4 首頁 CATEGORIES（平安/讚美）filter 0 首 | **已修** | 全前端 grep `CATEGORIES`/`平安` 0 hit。首頁 chip 改 src/utils/homeChips.js:46-52（粵/國/English/兒童/純音樂，按 lang/instrumental/album），`MIN_CHIP_SONGS=3` 唔夠 3 首唔出 chip（:54-60）。 |
| P1-5 PlayerProvider 每秒 setState progress；pollState 重複 | **已修（progress）/ 刻意保留（pollState）** | O1-B1/B2（`7278cc2`、`3855e40` 08-19）進度改 `progressStore` external store（App.js:422-423,2216,2227），唔再經 context。pollState 2 秒 poll（App.js:2497-2510）係 native event 唔 fire 嘅安全網（App.js:1652-1660 註解），同值 setState React 會 bail out；屬 PlayerProvider/watchdog 紅線，唔應郁。 |
| P1-6a HomeScreen ScrollView+map 百幾首 | **已唔成立** | 首頁每 chip 最多 4×5=20 首（HomeScreen.js:53-54,166）、今日 6、最近 12（:209）；SongCard 已 memo。長清單（詩歌庫）本身係 FlatList（LibraryScreen.js:363）。 |
| P1-6b fetchWithTimeout 冇 clearTimeout | **已修** | `7b1da09`（08-19，O7）改 AbortController + `finally clearTimeout`（App.js:398-406；useCachedHymns.js:13-21）。（細尾巴：兩份一樣嘅實作，可 dedupe。） |
| P1-6c 啟動重複 fetch /api/hymns | **已修** | `c9bd715`（08-19，O2）useCachedHymns 改 module-level singleton，`refreshKicked` guard（useCachedHymns.js:267）。 |
| P1-6d prefetchNextTrack / shuffleHistoryRef 唔同步 | **已唔存在** | 兩個 symbol 現 App.js 0 hit（只喺 `0de3b6c` 有）。shuffle/插入同步已由 Play Next 工程處理（`1330a65` B2：shuffle 開住插入同步 `originalQueueRef`，App.js:2693-2710；Opus 三輪覆核 `790da25`）。 |
| P1-7 API_BASE 三處寫死不同 port | **已修** | 全前端只有 src/config.js:13 一處定義（`https://api.odemusics.com`），7 個檔 import。SettingsScreen.js 已刪（`d7023b4`）。改讀 `EXPO_PUBLIC_API_BASE` 唔建議：env 喺 build/OTA 時 inline，publish 環境漏設會令全員打錯 host。 |
| P2-8 backend 舊 CJS script / FK / writeFileSync | **已修（script）/ 刻意唔同（writeFileSync、FK）** | db.js/seed.js/bulk_insert_hymns.js/fetch_songs.js/fix_missing.js/generate_hymns.js/update_db.js 全部喺 `5baf3e1`（09-02 Stage 3 S3-2）刪咗。`writeFileSync` 剩低係 tmp+rename 原子寫（hymnDb.js:28、userDb.js:123）同 `flag:'wx'` 鎖檔（hymnDb.js:629）——同步係刻意，配合 hymns.db 寫鎖紀律；改 async 有開 race 窗風險。`PRAGMA foreign_keys=ON`：hymns.db 有 2 個 REFERENCES 表，貿然開可能令現有 orphan row 寫入失敗，冇實際收益。 |
| P2-9a 刪 5 個 App.js 備份 | **已修** | 4 個喺 `d8b7f04`（09-02 S3-1），`trackplayer-backup`（其實係 v131）今日 `fee16c4`。全 repo 零引用。 |
| P2-9b App.js 單檔 / TabBar 唔切換 / 孤兒 code | **部分成立（只剩單檔）** | 孤兒：WebPlayerScreen/AudioContext/MiniPlayer.js 已喺 `e9c5f18`（08-19 D1+D2，24 檔）刪。TabBar 正常：App.js:3381 `onTabChange` → :4614 `setActiveTab`。`getAlbumCoverUrl` 只得 App.js:135 一份；但 thumbnail URL 字串仲有 8 份 inline Thumb（Home/Library/Mine/HymnList/PlaylistDetail/SharedPlaylist/AdminAdd×2）。App.js 4966 行屬實，但拆檔係 PHASE1-PLAYER-REBUILD:146 刻意押後，而且大部分係 PlayerProvider（紅線）。 |
| P2-9c 移除 react-native-video/youtube-iframe/webview | **已修** | `788b10b`（08-19 D7）。package.json 0 hit，src/App.js `WebView` 0 hit。 |
| P2-10 .gitignore 加 *.db/*.sqlite/*bak* | **已修（刻意縮窄）；照原文做會出事** | 見 §C。 |

## A. BLUEPRINT.md / HYMN-APP-IRON-RULES.md 地位

- 兩份係 v117（06-01）/ 05-30 嘅 PanResponder 年代文件，`0de3b6c` 之後冇再改過。
- 被以下已拍板文件局部取代：
  - REDESIGN-PLAN.md（07-15 Eric 拍板第 8 章）：保留「動畫寫死數值、禁 Emoji 做圖標」嘅精神，但 §3.4:193 指定清單改 gorhom bottom sheet、「黃金差速數值只做設計 spec」；§336 甚至將「Modal 做清單」列為鐵律教訓——同需求「Modal 違反鐵律」正正相反。
  - HANDOFF.md §2.6（唔准自寫 PanResponder sheet、唔准加返 BottomSheetModalProvider、inline BottomSheet 做 overlay 最後一個 child）；HANDOFF:472 已將 BLUEPRINT.md 標為「舊文件」。
  - ODE-REBRAND / ODELY：色板（`glow #EFE4D2` 取代 Spotify 綠）、`OdeIcon` 取代 MaterialIcons。
  - SHEETSHELL-EXEC-20260906（Eric 09-06 拍板方案 A）：8 個 App 層 Modal 面板統一用 `SheetShell`。
- 仍然有效嘅部分：唔准 onLayout/動態值驅動 native driver 動畫；APK build 指令。
- **照做 P0-1a 會倒退**：
  1. v229–v237 gorhom queue sheet：向上滑出/向下滑收、常駐 collapsed handle（v231 修「兩條 bar」）、DraggableFlatList 拖曳排序（`fdd9f29`）、Android 返回鍵收 sheet。
  2. Play Next（`790da25` 等，Opus 三輪 OTA 驗收）：「即將播放」分隔線/radio divider 喺呢個 sheet 入面 render，headLen/insertBoundary 語義綁死喺而家嘅 list 結構。
  3. 隊列三場景（QUEUE-BEHAVIOR-3-SCENARIOS §7 十三條 emulator 驗收）同隊列 UX 四項修正（RN backdrop 唔可以 absoluteFillObject 等教訓）。
  4. 重新引入 PanResponder 撞 FlatList scroll 嘅老病（v179–v189），同 BottomSheet z-order 嘅 v228 病。
  - SheetShell 8 面板本身唔受 P0-1a 直接影響（佢哋唔係播放清單），但 P0-1a 嘅邏輯（「Modal 違反鐵律」）如果泛化，就會連 SheetShell 呢個 09-06 拍板方案都推翻。

## B. Icon 現況

- `OdeIcon`（react-native-svg、24×24、stroke 1.75）係向量圖標——完全符合「禁 Emoji、用向量圖標」嘅精神；只係唔係 BLUEPRINT 點名嗰個庫。換返 MaterialIcons = 倒退 Ode rebrand R2（嗰次要出新 APK 先換到），兼要重新加依賴。
- 掃 App.js + src 非註解 code 嘅 symbol/emoji glyph，真係當 icon 用嘅殘留得 **2 處**：
  1. src/screens/AdminAddHymnScreen.js:334 `⚠️ {w}`（admin-only 警告 banner；odeIcons 冇 warning icon，最簡單係刪 emoji，banner 本身已有樣式）。
  2. src/screens/PlaylistDetailSheet.js:218 empty hint「撳 ≡♪ 加歌入嚟」——指嘅 icon 已經唔係 ≡♪（播放頁 pill 而家係 `queue` icon + 「清單」字，App.js:3775-3776），文字過時，應改「撳『清單』掣」。
- 唔算殘留：InviteFriendsSheet.js:18 邀請訊息內文 🎵（係分享出去嘅文字內容，唔係 UI icon）；`⋯`（AdminAddHymnScreen:289）同 `…` 係標點；`·` 係分隔符；`→` 喺註解/邀請文案。
- 播放鍵：68×68、`GLOW_COLOR` 底、`TEXT_ON_GLOW` icon（App.js:3819-3821,4161）。（nit：docs/design-ode/ODE-HANDOFF.md:90 寫「主掣 76dp」，同 68 唔一致；68 自 baseline 已存在，未見拍板改 76，唔建議郁。）
- Active 綠點：已有（`ctrlActiveDot` 4×4 GLOW 色，shuffle 開 / repeat>0 顯示），repeat-one 疊「1」badge（Eric 08-25 拍板 A/B）。

## C. 今日三個細修（fee16c4）逐行核

1. **server.js 兩個 `stmt.free()`**（:580、:661）：位置喺 `while(step)` 收完之後、之後冇再用 `stmt`；`db` 係 `getDb()` 共用 handle，free statement 唔影響 db。✅ 正確。細 nit：`step()` 中途 throw 會跳過 free（冇 try/finally），但只係例外路徑，可接受。⚠️ 未 live（backend pid 69120 起於 10-15 17:14），要下次正常 restart；唔急，唔值得專登 restart（restart 會清 presence Map 等 in-memory 狀態）。
2. **刪 `App.js.trackplayer-backup`**：內容係 v131（有 MaterialIcons/CONTROLS_LIFT/sheetOpacity），全 repo 零 import/引用（Metro 唔 resolve 呢個副檔名）；THIRD-PASS-REVIEW:94 曾誤記「該版本已不存在」，今日先真刪。git history 保留。✅ 零風險。
3. **.gitignore 加 `*.sqlite *.sqlite3 *.db-journal *.db-wal *.db-shm *.bak *.bak.* *.fullbak *.backup`**：
   - `git ls-files -ci --exclude-standard` 對新 pattern = **0 個 tracked 檔受影響**。
   - `backend/hymns.db` `git check-ignore` 冇命中 → nightly-db-sync.mjs（`git add -- backend/hymns.db` 精確 pathspec，:183）照常。佢自己嘅備份叫 `hymns.db.bak-gitsync-*`，唔中 `*.bak`（而且唔經 git add）。✅ dbautosync 冇影響。
   - 新增被忽略嘅 untracked 檔：工作樹只得 `backend/logs/metrics/ops-metrics.json.bak` 一個（本身已屬 logs）。
   - 冇用 `*bak*` 係啱嘅：會中 tracked 嘅 `backend/scripts/backupUsersDb.js`、`ops/launchd/com.hymnapp.usersbackup.plist`、`ops/perf/baseline-20260902/1a-a4-tracked-backups.log`（新檔 / rename 會靜靜唔入 git）。冇加 `*.db` 亦啱。
   - 觀察：repo 實際備份命名慣例係 `*.bak-YYYYMMDD`，新 pattern 唔 cover；但現有 `backend/users.db.bak*`（:97）、`*.mjs.bak-*`（:101）已 cover 主要嗰批。可接受，唔使再加。
   - 另見：`backend/data/hymns.db`（0 byte，09-01，untracked）係殘留空檔，可刪（唔關今次）。

## D. 建議精簡執行清單（全部 JS-only / OTA 級，唔掂 PlayerProvider）

| # | 動作 | 風險 | 備註 |
|---|---|---|---|
| 1 | PlaylistDetailSheet.js:218 hint 改「喺播放頁撳『清單』掣或者喺最愛度加歌入嚟」 | 極低（純文案） | 跟下次 OTA 一齊出，唔使專登推 |
| 2 | AdminAddHymnScreen.js:334 刪 `⚠️ `（或者用 `OdeIcon`，但冇 warning icon，唔建議為此加新 icon） | 極低，admin-only | 同上 |
| 3 | （可選）抽 `ytThumb(id, quality)` 去 src/utils，取代 8 份 inline URL；`fetchWithTimeout` 兩份合一 | 低；純重構，收益細 | 可以唔做；做就要過 harness/模擬器睇封面 |
| 4 | server.js free fix 隨下次正常 backend restart 生效 | 低 | 唔好專登 restart；守「唔准喺 Eric 真機 QA 期間部署」同 restart 後睇 401 分佈 |

**唔建議做**：P0-1a（倒退 gorhom sheet/Play Next/隊列三場景）、P0-1b 換 MaterialIcons（倒退 Ode R2、要 native build）、P0-2b pool 3–4（IP ban 風險）、P1-5 拆 pollState（watchdog 紅線）、P1-7 EXPO_PUBLIC_API_BASE（OTA env 誤設風險、已單一來源）、P2-8 async writeFileSync / FK ON（鎖/數據風險）、P2-9b 拆 App.js（PlayerProvider 紅線、Phase 3 押後）。

建議回覆 Eric：呢份需求係按 07-08 v1.0.0 baseline 寫，九成已喺 7–10 月做完或者被佢自己拍板嘅方案取代；淨低兩粒文案級 glyph 可以跟下次 OTA 順手執。
