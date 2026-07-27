# God Music（詩歌串流 App）— 交接文件

> 最後更新：2026-07-25 ｜ Owner/PM：Eric ｜ 開發：Claude sessions（多個並行）
>
> 呢份文件淨係講**兩樣嘢**：而家係咩狀態、同埋**唔好行返轉頭嘅硬規矩**。
> 逐個版本嘅 bug 診斷過程 / 覆測清單 / 決策經過 → [`docs/HISTORY.md`](docs/HISTORY.md)。

---

## 一、而家係咩狀態

| | |
|---|---|
| App | Android 詩歌串流，背景播放 + 通知欄控制。原名「生命樹 / Etz Chayim」，**已改名 God Music**（`BRAND-GODMUSIC-PLAN.md`，icon/wordmark/splash 已換） |
| 最新版本 | **versionName 1.3.8 / versionCode 49**（commit `f7a249e`）。APK 喺 `~/Desktop/詩歌App/` |
| 分支 | `feature/player-rebuild`（未 merge 返 `develop-v211`） |
| 後端 | 跑喺 **Eric 部 Mac**，`https://api.god-music.com`（Cloudflare named tunnel，固定 URL）。backend + tunnel 由 launchd 自動管理，登入就行、死咗自動起返 |
| 歌庫 | `hymns_all` 2175+ 首，**curated 1561 首**（粵 621 / 國 555 / 兒童 323 / 英 62）。歌詞：verified 10、draft 19、未有 740 |
| 背景 job | growLibrary（每 15 分鐘擴歌庫）、checkDeadLinks（每晚 04:00）、fetchLyrics（每晚 **01:00 + 05:00 兩個時段**，各 CC 50 + OCR 40，2026-07-27 Eric 拍板 80 首/晚拆半） |
| 前端 stack | Expo SDK 56 / RN 0.85.3、react-native-track-player v4、@gorhom/bottom-sheet + reanimated 4、MMKV |
| 後端 stack | Node 18 ESM + Express 4、SQLite via `sql.js`、`yt-dlp` |

**最痛嘅結構性問題（未解決）：** backend 跑喺一部屋企／公司嘅 Mac，機閂咗或者冇網 = 成個 App 死。
真正上雲行唔通，原因見下面「YouTube IP」。

---

## 二、🔴 紅線：呢啲全部係撞過板先知，唔好行返轉頭

### 2.0 歌詞來源版權規矩（Eric 2026-07-27 拍板，永久適用）

App 顯示嘅歌詞文字，**一定要嚟自 App 自己由條片度攞返嚟嘅內容**——
OCR 條片嘅畫面字幕、或者 whisper 聽譯條片嘅音軌。

- **唔可以照抄/大段複製第三方歌詞網站**（讚美之泉官網、mulanci、jgospel、
  CantonHymn 呢類）嘅文字落 DB 做「最終顯示版」。
- 第三方/官方歌詞來源**只可以用嚟核對驗證**：confirm 自己 OCR/whisper
  重組出嚟嘅結構/次序/字眼啱唔啱。逐隻字修正 OCR 認錯字（改返做實際
  唱緊嗰隻字）屬核對範圍；成段搬字過紙唔屬於。
- 適用於 2026-07 呢次 method upgrade（whisper 時間軸+OCR 對齊），
  以及**以後任何歌詞相關工作**。

### 2.1 多 session 共用同一個 worktree（最容易出事）

呢個 repo 隨時有 2-3 個 Claude session 同時改緊嘢。2026-07-18 就試過一個 session
`git commit -a` 掃走咗另一個 session 未 commit 嘅嘢，兩邊都唔知最終狀態係咩。

- **唔好 `git add -A` / `git commit -a`。** 逐個 file 列明自己改嗰啲。
- Commit 完即刻 `git show --stat HEAD` 核對，確認冇夾到人哋嘢、亦冇俾人夾走。
- 出 build 之前 `git status` 睇下唔屬於自己嗰啲 file，唔好將人哋做到一半嘅嘢 build 入 APK。
- 已經 push 咗就唔好改寫歷史（共享分支）。
- 同一個 file（尤其 `App.js`）**一次只准一方郁**。
- ⚠️ **有兩個 clone**：`~/.openclaw/workspace/hymn-app`（主要）同 `~/Desktop/lifetree-hymn-app`。
  開工前 `git branch --show-current` 確認自己喺邊。

### 2.2 YouTube IP —— 成個 App 嘅命脈，最高危

部 Mac 出去嗰條 IP（NordVPN，**唔係住宅 IP**）係目前**唯一仲 serve 到 YouTube** 嘅出口。
Zeabur 嘅 datacenter IP **已經被封死**（實測 5/5 全部 `Sign in to confirm you're not a bot`）。
呢條 IP 一旦被 flag，成個 App 冇得救。所以：

- **唔好爆發式打 YouTube。** 死鏈檢測特登好慢（concurrency 1、每首隔 3 秒、每晚 150 首），
  **唔可以改快**。growLibrary 同樣：concurrency 1 + jitter + 斷路器。
- **唔好開機 pre-cache 成個庫。** 「開機掃晒成個庫」正正就係搞到 Zeabur 個 IP 俾封嘅打法。
- **雲端部署行唔通，唔好再試。** googlevideo 個音源 URL 綁死「邊個 IP resolve 就只准邊個 IP 攞」——
  Mac resolve 完由第二個 IP 攞：**302 → 403、0 byte**。即係雲端 server 都要每一個 byte 經 Mac 出，
  慳唔到嘢仲多個 hop。Eric 已拍板：維持 Mac + named tunnel。
- **`--extractor-args "youtube:player_client=..."` 唔 work，唔好再試。** 8 個 client 全部照撞 bot check ——
  個 block 係純 IP 信譽，喺 bot check 嗰層就擋。
- **discover 一定要用 channel handle，唔好用關鍵字搜尋**（關鍵字會扒一大堆唔相干嘅片，嘥額度兼易撞 block）。
- ⚠️ **最大隱藏風險**：NordVPN 一旦斷線 / 自動換節點，新 IP 有機會係已被封嘅 → 即刻冇歌聽。
  應該鎖死一個 server 或者用專用 IP。

### 2.3 串流（`backend/routes/stream.js` = 紅線檔案）

- **一定要永遠向上游送 Range header。** ExoPlayer 第一個請求係冇 Range 嘅；冇 Range → **~17 KB/s**
  （播唔到，永遠「載入中」），有 `Range: bytes=0-` → **~1.5 MB/s**。client 冇送就自己補，
  然後將上游 206 當返 200 覆客。**唔好「原封轉發」client 個 Range。**
- **pipe 一定要有 `body.on('error')`。** ExoPlayer 會不停開／閂 range 連線，`controller.abort()`
  會令 web-stream 報錯 → 冇 handler 就變 process 層 uncaughtException + client 半死連線。
- **容量上限：同時 30-50 人**（唔好超過）。樽頸唔係頻寬（實測上傳 136 Mbps ≈ 800 人），
  係 **yt-dlp resolve 風暴**：cache miss 時每首唔同歌開一個 process，2.1 秒 × **87MB RAM**。
  in-flight dedup 擋到「同一首歌」，擋唔到「50 首唔同歌」。

### 2.4 資料庫

- **讀 `hymns`（VIEW：curated=1 AND status!='dead'）／寫 `hymns_all`（真 table）。**
  用 view 係因為有 ~20 處 `SELECT FROM hymns` 散落各 route，漏改一個就會漏死歌出去；
  而且 `handlePlayHymn` 用 `findIndex` 對 `/api/hymns`，一首「首頁見到但唔喺 API 入面」嘅歌會
  findIndex 返 -1 → 變 index 0 → **靜靜哋播錯另一首歌**。
- 改完 DB 要 `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend`（sql.js 開機先讀一次入記憶體）。
- **DB 寫入鎖（`backend/lib/hymnDb.js`）三條規矩**（三次事故換返嚟）：
  1. `releaseDbLock(token)` 一定要 token 對得上先刪 lockfile，唔啱就 no-op（唔好刪走第二個 process 合法持有嘅鎖）。
  2. **慢工序唔准揸住個鎖**：無鎖 read → 慢慢 probe（結果放記憶體）→ 攞鎖 → **重開 fresh DB** → 逐行 UPDATE → save → 放鎖。
     checkDeadLinks 以前揸鎖 25 分鐘，觸發 stale-steal，final write 冚走咗第二個 process 啱啱寫嘅嘢。
  3. **唔好用開頭嗰個 in-memory snapshot 做最後寫入或者揀候選**。fetchLyrics 個 OCR 層就係咁：
     同一個 run 入面 CC 層寫落碟嘅 cc:miss，OCR 層用 stale snapshot 見唔到 → 永遠 0 產出。
- **死鏈：連續 3 日失敗先標記，任何一次成功即刻清零。** 舊個 `hymn-check-report`
  「650/665 死、2.3% 可播」入面 **592 個係 Timeout**（自己撞爆 rate limit 整出嚟嘅假數據），
  誤導咗成個 project 好耐。**失敗唔係證據，成功先係。**
- **隱藏唔刪除**：死鏈／非詩歌內容一律 `curated=0` 或者 `status`，資料原封留喺 `hymns_all`，reversible。
- **淨係 `curated=0` 唔算「判死刑」，會翻生。** 2026-07-27 22:30 P0：curate mode
  眼中 `curated=0` = 「未上架 backlog 候選」，會逐晚 re-verify、驗到又 `curated=1`
  返。實測 Kids on the Move 節目片 delist 到 4 首、一晚翻生到 74；Redsea
  Music／SingforGod薪火敬拜兩個壞 handle 全 artist 100% 翻生。**內容性質判死
  （唔係死鏈）一定要 `status='rejected'`**（`usablePool()` 同 `hymns` view
  都已經過濾呢個狀態），淨係 `curated=0` 唔夠。
- **候選次序唔可以用固定次序。** ①用 `id` 順序 → 低 id 係最早爬嗰批、死亡率高好多，一度以為
  成個團體死晒（改隨機之後 0/6 → 5/6）。②打和 tiebreak 用固定 priority → 同一個團體永遠霸住個 slot。
  兩次都係同一種坑：**打和要 `Math.random()`，唔好靠 stable sort 嘅次序。**
- 斷路器**唔可以淨係數連續失敗** —— 要攞一首已收錄、驗過 work 嘅歌做**對照探測**，
  對照拎到就繼續行（唔係俾 block，只係撞到一批死片）。
- **`isCompilation()` 嘅關鍵字唔可以太闊。** `專輯`/`album`（冇「全」字）曾經誤殺
  backlog **78 首**正常單曲（「OO Track N of Mini-Album」呢類係「呢首歌出自邊隻碟」嘅
  正常署名，唔代表條片本身係成隻碟；同一原因 `學院` 誤殺過一首歌名順帶提到「XX神學院」
  嘅正常詩歌）。淨係擋真正嘅整隻碟訊號（`全碟`/`全專輯`/`Full Album`），加新關鍵字之前
  一定要 `SELECT ... WHERE curated=0 AND title LIKE '%關鍵字%'` 對成個 backlog 查一次先落。

### 2.5 launchd 背景 job

- **任何會行到 `yt-dlp` 嘅 job（直接或者經 `resolveAudioUrl`），plist 一定要自己 set
  `EnvironmentVariables/PATH`**（launchd 預設冇 `/opt/homebrew/bin`）。唔 set 嘅話 job 會「成功」行完但
  每次都 command-not-found，睇落同「YouTube 封咗我哋」一模一樣 —— growLibrary 就係咁連續 9 次收錄 0 首。
  裝新 job 之前逐項核對 `ops/launchd/README.md`，唔好淨係抄現有 plist 個形狀。
- **時間唔好撞**：`deadlinkcheck` 04:00、`fetchlyrics` 04:20，兩個都打 YouTube。
  growLibrary 每 15 分鐘一次（`StartInterval=900`），分鐘用 `:07` 唔用 `:00`。
- **辦公時間封鎖窗**：growLibrary 星期一至六 10:30-18:30 唔做嘢（部 Mac 喺公司，唔好拖慢公司網絡）。
  `--ignore-office-hours` 係手動測試用嘅 override。
- **`cloudflared service install` 整出嚟嗰個 plist 係壞嘅** —— `ProgramArguments` 淨係得個 binary、冇參數，
  named tunnel 咁行唔通，launchd 會 crash-loop、`api.god-music.com` 一路 530。已手加返
  `--config ... tunnel run hymn-api`；**再行一次 install 會覆蓋返，記得補**。
- LaunchAgent = **登入之後**先行，唔係開機就行。部 Mac 停喺登入畫面 = 兩個都唔會行。

### 2.6 前端

- **唔可以加返 `BottomSheetModalProvider`。** `<BottomSheetModal>` 會 portal 去 provider 個
  `absoluteFill` container（冇 zIndex），而我哋個播放器 overlay 係 `zIndex: 999` 不透明全螢幕
  → sheet 喺佢底下 animate，用家永遠見唔到，表徵係「撳咗完全冇反應」。
  **用 inline `<BottomSheet>`，擺喺 overlay container 最後一個 child。**（App.js 檔頭有警告）
- **唔好自己寫 PanResponder 做 sheet。** PanResponder 同 FlatList scroll 永遠衝突（v179–v189 長期掙扎），
  用 `BottomSheetFlatList` 由 gorhom 協調就冇事。sheet **入面**啲掣要用 gorhom 嘅 `TouchableOpacity`，
  RN 內置嗰個喺手勢區內會俾 pan 搶咗 touch。
- `snapPoints` 要放 module 層常數 —— 每次 render 開新 array 會令 gorhom 重算 layout、拖到一半彈返。
  `enableDynamicSizing={false}`（v5 default `true` 對住 virtualized list 會度錯高度）。
- **封面唔好用 `hqdefault.jpg`** —— 佢係 4:3，YouTube 將 16:9 影片 baked 咗上下黑邊入張圖，
  正方形裁剪之後黑邊仲喺度。用 `mqdefault`（一定有）或者 `maxresdefault` + onError 降級。
- **Shuffle 要 `reset()` + `add()` 成個重建**，唔可以原地重排 —— `remove([~1500 個 index])` 喺呢個
  scale 會**靜靜哋失敗**（shuffle icon 著咗但實際順播）。重建之後 **`play()` 一定要擺最後**
  （`play()` 之後即刻 `seekTo()` 會卡喺 paused 0:00）。
- **播放語義 default 係「單曲 + 自動隨機接續」**，要跟清單次序就要 caller 明確傳 `opts.explicit`。
  咁樣任何未標明嘅新入口都自動係 Eric 要嘅行為，唔會漏。
- **MMKV 可能返 null**（release JSI 已知問題）→ 持久化一律 best-effort：先 `setState` 令 UI 即刻反應，
  再 try/catch 寫 storage。以前 `if(!storage) return;` 令個「最愛」掣靜靜哋 no-op。
- **`android:allowBackup="false"` 唔好開返。** Android Auto Backup 會喺重裝時還原一個舊 snapshot，
  夾硬冚走用戶清單啲歌（Eric 中過招，`187f5db`）。
- 動畫鐵律（DOM 順序、差速平移、唔准用 onLayout 驅動 native 動畫）→ `HYMN-APP-IRON-RULES.md`。

### 2.7 出 build

- **`versionCode` 一定要遞增。** Android 拒絕安裝低 versionCode 嘅 APK，而且好多手機淨係彈
  「套件似乎無效」，唔會話你知係降級 —— 曾經因為咁白行咗幾轉。
- **判斷邊個 APK 至新睇 `versionCode`，唔好睇檔案名嘅 vXXX**（兩者冇對應關係）。
- **APK 唔好 commit 入 repo**（`*.apk` 已喺 `.gitignore`）。舊 APK 反覆 commit 令 `.git` 脹到 750MB，
  歷史 blob 未清（要清就要 `git filter-repo` + force push，高風險，未做）。
- Build 完 copy 去 `~/Desktop/詩歌App/hymn-app-v{版本}.apk`。指令喺 `HYMN-APP-IRON-RULES.md`。

### 2.8 唔好再查嘅嘢（查過，係誤會）

- **「Shuffle 好似冇隨機」** —— 報咗三次，三次都係誤會。洗完牌之後**播放清單顯示嘅就係新順序**，
  所以下一首必然喺現正播嗰首下面，睇落似順播。驗證要**睇清單順序有冇變**，唔係睇 next 有冇跳出 list。
  （清單頂有「🔀 已隨機排序」標示。）
- **「冇更多合資格候選」** —— 係 curate **backlog** 見底（原本 1153 首未收錄嗰批食晒），
  唔係全庫見底。粵/國新歌而家幾乎全靠 discover。
- **歌庫增長放緩／某個 slot 試 0 條** —— 通常係 `--flat-playlist` 只攞到頻道最新 30 條，窗口耗盡，
  唔係故障。
- **背景播放 ~30 分鐘後停** —— 唔係 code bug（Manifest / RNTP 設定查過全對），係手機
  battery optimization / Doze。解法係喺手機設定將 App 電池設做「無限制」。Eric 已決定唔跟進。

### 2.9 discover mode 收錄關卡（2026-07-27 Fable 5 方案，Kids on the Move 事故之後）

Kids on the Move 事故（87 首入面 83 首係兒童聖經教育節目，唔係歌，冇一條撞到
`isCompilation()` 嘅負面關鍵字）揭發咗純 blocklist 設計嘅根本缺口。而家 discover
mode 一定要順序捱以下幾關（`growLibrary.js` `discoverFromGroup()`，缺一不可）：

1. **Layer 1 片長帶 gate（全局，零成本）** —— `hymnDb.js` `isInSongDurationBand()`，
   75-600 秒帶外一律 log `[片長]` 跳過。`listChannelVideos()` 嘅 flat-playlist 本身
   就帶 `%(duration)s`，唔加額外 request；順手 backfill 舊歌空白嘅 `duration` 欄
   （見同一個 function 入面嘅 backfill 段）。
2. **分類/品質篩選**（原有）—— `isCompilation()` / `isNonWorship()`。
3. **Layer 2 標題正面訊號（選擇性，per-group `contentGate:'duration+title'`）** ——
   `hymnDb.js` `passesTitlePositiveSignal()`（♫/lyric/worship/dance/sing along/mv/
   official/cover）。**淨係全部英文兒童頻道開**（`worshipGroups.js` 逐個
   `kidsLang:'英文'` 團體已設）——實測全局 allowlist 對中文歌誤殺率好高（611
   Worship 7%/盛曉玫 17%/有情天 21%），**唔可以加落中文團體**。
4. **語言 sanity check（channel-level，中文團體）** —— `discoverFromGroup()` 入面：
   粵/國/中文兒童團體嘅 listing 入面**一條都冇中文字** → 當疑似錯 handle，成個
   channel 今次唔試（P1 事故：`@singforgod`/`@redseamusic` 兩個壞 handle 撞入 20
   首垃圾，全部誤標粵語但內容係私人家庭片/巴西葡語翻唱，已 curated=0 清走）。
5. **死鏈驗證**（原有）→ 寫入(帶埋 duration)。

**新頻道 / 覆核舊頻道流程** —— `scripts/auditChannel.js`：攞 60 條 duration+title，
計三個比例（歌片長帶% / blocklist 命中% / 標題正面訊號%），隨機（唔淨係最新）抽
10 條俾人眼睇。門檻：**≥60% 正常收；30-60% GATE（英文兒童頻道先可以加
`contentGate:'duration+title'`，中文頻道留俾人手/未來語義層覆核）；<30% REJECT，
拆走 channel**。2026-07-27 全庫回溯 29 個有 handle 嘅頻道，REJECT 咗 3 個（全部
0 curated，discover 從未成功過，拆咗 channel）：Saddleback Kids（13.3%）、
台北復興堂（18.3%）、611靈糧堂（5%）。

**尚未做嘅（Eric 拍板「之後再講」）**：語義層 —— 用 LLM 逐個判斷 curated 標題似
唔似歌名，補機械 filter（片長/blocklist/標題 allowlist）都睇唔出嘅 edge case。

### 2.10 EAS Update（OTA，2026-07-27 落地）

跟 `EAS-UPDATE-PLAN.md` 落地：`expo-updates` 已裝，`app.json` 加咗
`runtimeVersion: "1"`（明文 string，唔用 policy）、`updates.url`、
`requestHeaders.expo-channel-name: "production"`；`android/app/src/main/AndroidManifest.xml`
同 `res/values/strings.xml`（後者冇入 git，`/android` 大部分 gitignore，
淨係 `build.gradle`/`AndroidManifest.xml` 兩個 file 例外係 force-add）已手改對齊。
EAS 專案：`@god-music-team/hymn-app`，`EXPO_TOKEN` 已寫入 `~/.zshrc`（任何 terminal
自動有得用 `eas` 指令，唔使 `eas login`）。

- **日常推 OTA**：`cd frontend/hymn-app && git status`（清場，見 §2.1）→
  `eas update --channel production --platform android --message "..."`。
  一定要帶 `--platform android`（唔帶預設 all platforms 會連 web 一齊 export，
  而 web bundle 因為 `react-native-track-player` 嘅 web backend 缺
  `shaka-player` peer dep 會 export 失敗）。
- **OTA 定出新 APK？** 跟 `EAS-UPDATE-PLAN.md` §四嗰張表。灰色地帶一律當
  native（出 APK + bump `app.json` 同 `android/app/build.gradle` 兩處
  `versionCode`/`version(Name)`）。
- 🔴 **每次都要 `git status` 清場先 publish**——`eas update` 係 export 當刻
  working tree。2026-07-27 落地嗰陣，共用 worktree 有另一個 session 未
  commit 嘅 icon/wordmark rebrand 改動,兩次 publish 前都用
  `git stash push -- <指定 file>`（唔係 `git stash` 全部）擋開,publish
  完即刻 `git stash pop` 還原,先冇夾埋人哋未完成嘅嘢。
- **驗證流程**（emulator，release build，v1.4.0 已行過一次全套）：
  1. `adb uninstall` 舊版 → `adb install -r` 新 release APK → 冷啟動一次
     （背景 check+download，睇 logcat `dev.expo.updates` 有冇
     `DownloadComplete` / `isUpdatePending=true`）。
  2. `eas update` 推一個小改動 → app 冷啟動一次（背景下載完）→ 唔郁佢 →
     再冷啟動一次先會見到新內容生效（`isUpdatePending` 落返 `false`）。
     或者中途撳 banner 即刻 `Updates.reloadAsync()`。
  3. 撞過嘅坑：
     - 第一次 build 冧咗 `OutOfMemoryError: Metaspace`（`android/gradle.properties`
       原本 `-Xmx2048m -XX:MaxMetaspaceSize=512m` 加咗 expo-updates 之後唔夠,
       已加大做 `-Xmx4096m -XX:MaxMetaspaceSize=1024m`）。daemon 死咗之後 client
       process 會卡住唔會自己退出,`ps`/daemon log 對唔上先發現,唔係真係卡建置。
     - `UpdateBanner` 一定要喺 `AppContent` 入面、`<TabBar>` 之前用**正常 flow**
       render（唔好 `position:absolute`）——TabBar 本身冇自己 absolute 定位,
       absolute banner 會疊喺佢上面遮住個掣(第一版試過遮咗「詩歌庫」)。
     - `useInsets()`（`useSafeAreaInsets`）要喺 `<SafeAreaProvider>` 底下先有值,
       唔可以擺去 `GestureHandlerRootView` 呢層(擺錯咗會即刻 crash：
       `No safe area value available`)。
- **banner 邏輯**：`Updates.useUpdates()` 只喺 `!__DEV__` 先 render（debug
  build 冇 embed updates config,expo-updates 停用）。

---

## 三、架構速覽

```
backend/
  server.js              Express，開機 pre-cache 一小批（唔好改做掃全庫）
  routes/stream.js       🔴 紅線：/api/stream/:hymnId，Range header 邏輯喺呢度
  routes/audio.js        舊 /api/audio/:ytid，仲 work
  lib/resolveAudio.js    共用 yt-dlp resolver：async exec、in-flight dedup、failure cache 15 分鐘
  lib/hymnDb.js          DB 鎖（token）、isCompilation()/isNonWorship() 品質 filter
  data/worshipGroups.js  63 個團體 + channel handle（runner 用）
  scripts/growLibrary.js      擴歌庫：curate + discover、斷路器、辦公時間封鎖窗
  scripts/checkDeadLinks.js   每晚 150 首死鏈檢測
  scripts/fetchLyrics.js      歌詞：CC 層 → OCR/whisper 層
frontend/hymn-app/
  App.js                 🔴 播放核心：playQueue/playSingle/shuffle/queue sheet。多 session 唔好同時郁
  src/config.js          API_BASE 唯一來源
ops/launchd/             五個 plist 嘅版本控制副本 + README checklist
```

**四關收錄關卡**（Eric 明確要求，兩個 mode 都要跟）：搜尋 → 分類/品質篩選 → 死鏈驗證 → 先寫入 DB。
「攞到個 YouTube ID」唔算完成。

---

## 四、未解決 / 等 Eric 拍板

| 題目 | 狀態 |
|---|---|
| **後端真正上雲** | 行唔通（見 §2.2）。長遠出路：用戶自己上載歌，或者接受一直靠部 Mac |
| **YouTube 版權** | Eric 決定等有用戶量（目標 1000 人）先傾。⚠️ 1000 用戶 ≈ 50-100 人同時 = 啱啱好踩到呢個 setup 上限 |
| **歌詞版權路線** | `LYRICS-PIPELINE-PLAN.md` 出咗 A/B/C 三條路，未揀。實測 CC 字幕命中率極低，主力要 OCR |
| **OCR 歌詞質素參差** | 抽查 4 首：1 首乾淨、3 首有認錯字／YouTube UI 文字混入。方案見 `docs/SUPERVISION-LOG.md` |
| **`sql.js` 寫入唔 persist** | server 開機讀一次入記憶體、從來冇寫返落 disk → **用戶註冊功能實質係壞嘅**（restart 就冇咗）。維護腳本自己 `export()` 所以冇事 |
| **The Altar / 兒童合集團體** | 搵唔到官方 channel，等 Eric 提供連結 |
| **API response format 不一致** | `/api/hymns` 返 `{data:[...]}`、home routes 直接返 array |
| **語義層(LLM 逐個判斷 curated 標題似唔似歌名)** | 2026-07-27 已解決機械層缺口(見下段)，Fable 5 方案仲提到一個更強嘅語義層，用 LLM 補機械 filter(片長/blocklist/標題 allowlist)都睇唔出嘅 edge case。Eric 拍板「呢步可以之後再講」，未排期。|

---

## 五、文件地圖

| 文件 | 係咩 |
|---|---|
| **`docs/HISTORY.md`** | 📜 舊 HANDOFF 全文歸檔（1500 行）：逐個版本嘅 bug 診斷、覆測清單、決策經過。**唯讀，唔好更新** |
| **`docs/SUPERVISION-LOG.md`** | Fable 5 監督 growLibrary/fetchLyrics 嘅滾動記錄。**監督 session append 落呢度，唔好寫返入 HANDOFF** |
| `HYMN-APP-IRON-RULES.md` | 播放器動畫鐵律 + build 指令（PINNED） |
| `APP-AUDIT-OPUS5.md` | 2026-07-25 全面體檢報告 + 修復狀態附錄 |
| `BRAND-GODMUSIC-PLAN.md` | 改名 God Music + logo（已拍板執行） |
| `LIBRARY-EXPANSION-PLAN.md` | 擴歌庫規劃 |
| `LYRICS-PIPELINE-PLAN.md` | 歌詞入庫方案（等拍板） |
| `EAS-UPDATE-PLAN.md` | OTA 更新機制實作計劃（Eric 已拍板要做，等 Sonnet 落地；⚠️ 內有共用 worktree publish 紅線） |
| `hymn-groups-database.md` | 團體完整資料（**人睇**；加新團體先改呢度，再落 `worshipGroups.js`） |
| `REDESIGN-PLAN.md` / `PHASE1-PLAYER-REBUILD.md` / `HOME-DISCOVERY-*.md` / `MYPAGE-PLAYLIST-MANAGE-PLAN.md` / `SEARCH-MERGE-PLAN.md` / `AUTOPLAY-MIX-PLAN.md` / `PERF-FAST-START-PLAN.md` / `PHONE-AUTH-PLAN.md` | 各功能規劃書 |
| `BLUEPRINT.md` / `DEAD_LINKS.md` | 舊文件（死鏈率數字唔可信，見 §2.4） |

---

## 六、日常指令

```bash
# 後端狀態（530 = tunnel/backend 冇行；200 = 正常）
curl -s -o /dev/null -w "%{http_code}\n" https://api.god-music.com/api/hymns
launchctl list | grep -iE "cloudflare|hymnapp"

# 歌庫進度 / log
node backend/scripts/growLibrary.js --status
tail -f /tmp/hymn_growlibrary.log /tmp/hymn_deadlink.log /tmp/hymn_backend.log

# 改完 DB 要 reload backend
launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend
```

### ✅ 2026-07-25→26 兒童組增長卡死 — 已落地(local_fa531849)

**診斷(Fable 5):** 兒童組 88 首後停——13 個團體得 4 個有 channel,3 個高產嘅已食盡
「最新 30 條」listing 窗口,中文兒童團體 channel 全部 null。

**已落地(A1/A2/A3/B 全做,反面清單全部冇加):**
- 「讚美之泉兒童」channel: null → `@StreamofPraiseKids`(已驗證,官方獨立兒童頻道)
- 新增「CJ and Friends」`@cjandfriends`、「Yancy」`@yancynotnancy`(兩個都已驗證)
- `discoverFromGroup` 淺層(30)fresh=0 先加深到 200 先放棄,平時淺層夠嘅頻道唔使加大請求
- Yancy 實測踩到多一個漏洞:訪談片("Convo about Hosting..." / "Interview with...")
  唔係歌,加咗 `convo`/`interview` keyword(backlog regression 0 誤殺)
- C(per-group titleMustMatch)未做,留返日後

**驗收結果(真實 kickstart,唔係 dry run):** 兒童 88 → 94(+6,新增 Yancy 3 首 + 讚美之泉
兒童 3 首,CJ and Friends 已驗證會揀中但呢輪未輪到),全庫 799 → 841。歌手數由 4 個 → 6 個。
Regression check 對全庫 841 首,0 誤殺。
