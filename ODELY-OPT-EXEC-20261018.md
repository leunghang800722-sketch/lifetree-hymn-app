# Odely 優化 執行單（五階段）2026-10-18

計劃書：`ODELY-OPT-SPEC-PLAN-20261018.md`（Eric 10-18 批核）。基準 HEAD `d74c483`。
流程：每階段 Sonnet 執行 → Opus 獨立驗收（全過先入下一階段）→ 全部完成後一次 OTA（Opus 推前/推後驗收）→ Fable 出前後對比總結。

## 0. 全程紅線（每階段都要喺報告逐條核）
- 🔴 **唔碰**：`@gorhom/bottom-sheet` inline `<BottomSheet>` 結構（App.js:72–99 設計 + 用法）、`src/icons/OdeIcon.js`/`odeIcons.js`、`src/designSystem.js` 色板、HLS／Native／JS watchdog 嘅計時門檻與保護邏輯（`handleStuckTrackEnd`/`handleMidStreamStall`/`handleBufferingStuck`/`sleepPollInterval`/`pollState`/nudge/rescue/`hlsStartupKick`/16s/10s/5s 門檻/`BUFFERED_ADVANCING_CAP_TICKS`）。
- 🔴 **唔做**：3a 移除 pollState；3c 關 `PERF_MARKS_ENABLED`（只加一行 TODO 註解）。
- 🔴 四個 harness 每階段完成都要 **100% pass**（基準 10-18：insertnext 66/66、hls-preflight A 14/14、B 26/26）；react-harness 跑法 `cd frontend/hymn-app/tools/react-harness && node run.js`。
- ⚠️ **react-harness 基準係紅嘅**（10-18 實跑：`prepareSource: 搵唔到預期嘅 MMKV import 行` —— `useCachedHymns.js` 嘅 import 形狀變咗，harness 嘅 sed 規則過時，唔係 app bug）。階段①第一步要先修 `tools/react-harness/lib/prepareSource.js`（只改 sed/定位，**唔准改場景斷言**、唔准改 `useCachedHymns.js` 去遷就 harness），對住基準 `d74c483` 跑到全場景 PASS 先開始 1a/1b；報告記低紅→綠證據。
- 唔部署、唔 OTA、唔 eas、唔 restart；唔掂 backend；唔讀 secret；共用 worktree 只 pathspec commit；唔 `git add -A`/stash/clean；scratch 唔准放 backend/；唔 kill 非自己起嘅 process；只出證據唔判 PASS/FAIL；完成後回覆一次就夠，唔要重發。
- 每個 commit 訊息尾加 harness 指定嘅 Co-Authored-By；報告寫入 `ODELY-OPT-REPORT-20261018.md`（每階段一節）。

## ① 1a outbox lost-update + 1b outbox length store（`src/sync/userSync.js`、`src/hooks/useOutboxLength.js`）
1. `flush()`：`runOp(op)` 成功後**唔好**用閉包 `rest` 覆寫；改為 `const latest = collapse(readOutbox()); const next = latest.filter(x => !sameOp(x, op)); writeOutbox(next); queue = next;`。`sameOp` = `op.op` 相同 + `ts` 相同 + key 相同（`fav_*`→`hymn_id`；`pl_upsert`→`playlist.id`；`pl_delete`→`id`）。如 `latest` 已冇該 op（enqueue 側 collapse 剷走咗，或同 playlist 更新 `ts` 嘅 `pl_upsert` 取代咗）→ 零刪除，照用 `latest`。
2. `break`（fail）路徑原封不動；`_flushing/_pendingFlush` 原封不動；**`checkAuth`/`reportUnauthorized`（401=登出路徑）一字不改**。
3. 1b：`userSync.js` 用 `createExternalStore({ length: 0 })`（`src/hooks/externalStore.js` 已有）；`writeOutbox()` 後 `setState({ length })`；`getOutboxLength()` 保留；`useOutboxLength` 改 `useSyncExternalStore`（React 18+；留意 RN 0.85 用 React 19，`externalStore.js` 已有 `useStore` helper 就用返）。
4. Harness（放 `frontend/hymn-app/tools/usersync-harness/run.js`，babel 轉真 module、mock MMKV、mock fetch 可控延遲）：(a) flush 中 enqueue `fav_add` → **修前**（`git show d74c483:…userSync.js`）op 丟、**修後**保留並喺 pending flush 推出；(b) 連撳兩個心心（兩個 op 飛緊中再 enqueue）；(c) `pl_upsert` 飛緊中同 playlist 再 enqueue 更新 `ts` → 舊 op 完成後**新嗰個保留**；(d) `runOp` fail 中途 enqueue → queue 原封 + 新 op 保留；(e) outbox length store 隨 write 即時變。負控必須有（舊版 FAIL）。
5. 四個 harness 全 pass。Commit：src 一個；harness+報告 §① 一個。

## ② 3b `hymnsById` + 4b `fetchWithTimeout` 合一 + 4c-i `DEVICE_ID` 死碼 + 4c-ii `react-native.config.js`
1. `src/hooks/useCachedHymns.js`：`hymnsStore.setState({hymns})` 嘅每個位同步重建 `hymnsById = new Map(hymns.map(h => [String(h.id), h]))`（module-level，export `getHymnById(id)`）；**`hymnsStore` 嘅 setState 次序/內容一字不改**（react-harness 守住）。`App.js:3636` liveHymn 同 `:1600` `lib.find` 改用 `getHymnById(String(id))`；`hymnsRef` 仍保留（其他地方用）。
2. `fetchWithTimeout` 搬 `src/api.js`（export），`App.js:398` 同 `useCachedHymns.js:13` 改 import；**react-harness 嘅 `prepareSource.js` sed 規則要睇會唔會被新 import 影響**（README「維護紀律」）——如要加 stub 就加，報告寫明。
3. 刪 `App.js:161` `let DEVICE_ID` + `:4493–4496` 嗰個 effect（**保留** `/api/app-version` effect）；全 repo grep 零引用證據。
4. `react-native.config.js`：刪 `dependencies['react-native-vector-icons']` 同 assets 入面 `./node_modules/react-native-vector-icons/Fonts`（保留 `./assets/fonts`）。
5. `src/perfMarks.js:29` 上面加一行 TODO：「第一首歌 step 0+1 after 量度收爐後 flip false（ODELY-OPT-SPEC-PLAN-20261018 §3c）」——**唔改值**。
6. 四個 harness 全 pass；`node --check`/babel parse App.js。Commit 一個 + 報告 §②。

## ③ 4a `CoverImage` / `FavHeart` 抽離（9 個畫面截圖對照）
1. 新 `src/components/CoverImage.js`（props：`youtubeId`, `size`, `style`，內含 S6 `useEffect(() => setFailed(false), [youtubeId])`，fallback `<OdeIcon name="musicNote">` 同現有一樣）；新 `src/components/FavHeart.js`（`useFavorites`、`stopPropagation`、`<OdeIcon>`，支援 `style`）。
2. 替換：`Cover` ×6（Mine/Library/HymnList/PlaylistDetail/SharedPlaylist/AdminAddHymn——Admin 嗰個 `videoId` prop 改接 `youtubeId`，size 48 照傳）、`Heart` ×3（Library/HymnList/HomeScreen）；`App.js:309 CoverImage`／`:367 FavHeart` 播放器版：**只喺視覺／props 完全可對齊先合併**，否則保留並喺報告寫明理由。
3. 截圖對照（iOS 模擬器一部，用現有 Release build 做法；hold 檔 `/tmp/claude-ios-cleanup.hold`；收工清）：9 個位置（首頁行、詩歌庫列、HymnList、我的、清單詳情、分享清單、admin 加歌、播放器封面、播放器心心）改前／改後各一張，放 `ops/perf/screens-20261018/`（唔准放 backend/）；逐張標 PASS/DIFF（只標，唔判）。
4. 四個 harness 全 pass。Commit：components+替換一個；截圖+報告 §③ 一個。

## ④ 2 `insertNextImpl` HLS 預檢 helper（🔴 紅線區，獨立 commit）
1. 由 `App.js:1156–1200` 抽出 `preflightAndSwapNext(song)`（內含：`Platform.OS==='ios' && HLS_ENABLED` 閘、`hlsDowngradedTrackRef` 檢查、`hlsPreflightSeenRef` 去重 + 封頂 200、`toTrack` 判 `.m3u8`、非阻塞 IIFE、`preflightHls(url,{hymnId, ctx})`、`isExplicitHttpFailure`、重讀 native queue 對位、`nativeIdx <= curIdxNow` 唔換、近尾 15 秒唔換、`toTrack(...,{forceProgressive:true})` 熱換、`logDiag('hlsFallback',...)`、`hlsDowngradedTrackRef` set）。**每一條 guard、每個 threshold、每個 beacon 字段一字不改**；`ctx` 參數化（trackChanged 傳 `'next'`，insertNext 傳 `'insertNext'`）。
2. `PlaybackActiveTrackChanged` 原位改為 call helper（行為 byte-level 等價）。
3. `insertNextImpl` 成功路徑（`warmIds([hymn.id])` 之後）：若 `plan.insertAt === curIdx + 1` → `preflightAndSwapNext(hymn)`（fire-and-forget）。
4. **零改動證明**：報告附 `git diff` 逐行標註；用 hls-preflight harness B 既有「次序證據」場景 + 新加 harness C（mock TrackPlayer/preflightHls，驗：trackChanged 路徑 call 參數同舊版一致；insertNext 插 idx+1 → 預檢一次、404 → 熱換 progressive；插 idx+2 → 唔預檢；已 downgraded id → 唔重複；seen 去重）；watchdog 相關函數（§0 清單）`git diff` **零行**。
5. 四個 harness 全 pass。Commit 一個 + 報告 §④。

## ⑤ 重寫 `BLUEPRINT.md` + `HYMN-APP-IRON-RULES.md`
- 頂部：「v2（2026-10）—— 取代 v117（2026-06-01，見 git `0de3b6c`）」。
- 內容（兩份分工：BLUEPRINT = 架構總覽；IRON-RULES = 唔准掂清單）：inline gorhom `<BottomSheet>` + 禁 portal 原因（引 App.js:72–99）；SheetShell 統一殼；OdeIcon 單一來源（禁 Emoji／禁混 vector-icons）；`designSystem.js` 暖光／主色（引實際 token 名，唔抄數值去第二個地方）；`externalStore` 進度隔離（progressStore/hymnsStore）；HLS／Native／JS watchdog 紅線（列函數名 + 門檻 + 「要改先 Opus 論證」）；仍有效：禁 `onLayout` 驅動 native 動畫、APK build 指令；deploy gate／OTA 流程一句指去 `ops/deploy`。
- 唔准喺文件寫入任何密鑰／內網 IP／chat id。Commit 一個 + 報告 §⑤。
