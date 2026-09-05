# W3 死碼清理報告 — 第二段執行 2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。範圍 = `DEEP-AUDIT-W3-DEADCODE-REGISTER-20260906.md` §5 批示「刪」項，
不含「要人手」兩行（F5 `backend/data/hymns.db` + 7 個 APK 備份，sandbox 擋住 `rm`，留低等 Eric/Dispatch
喺 Terminal 用 §5 已附嘅人手命令清）。

Before = `6c12310`（W3 證據冊 Fable 批示 commit）。三個 commit：
`97b3780`（前端 code）、`74b9635`（前端 asset）、`017faf0`（backend lib）。

---

## 1. 逐項刪咗乜

### 1.1 前端死分支（S8，commit `97b3780`）

| ID | 檔:行 | 刪咗乜 |
|---|---|---|
| APP-003a | `App.js:2639`（舊行號）`if (opts.browseTap) { ... }` | 整個 25 行 if block + 上面 10 行解釋分支嘅過時 comment 一併刪。8 個 `onPlayHymn(...)` call site 全部核過冇一個傳 `browseTap`。 |
| APP-003b | `App.js:2675`（舊行號）`if (opts.appendAutoplayTail && autoplayEnabledRef.current) { ... }` | 整個 11 行 if block + 上面 9 行 comment 一併刪，保留 `let finalList = list; let autoRadioFrom = opts.autoRadioFrom ?? null;` 兩行（下面 `setAutoRadioFrom`/`setQueue` 仍要用）。 |
| — | `App.js:4257`（舊行號）自認「PlaylistDetailSheet.js 刪咗」嗰段 comment | 連帶 `handlePlayHymn()` 嘅 `playQueue(list, idx, { appendAutoplayTail: ..., browseTap: ..., surface: ... })` call 一併簡化做 `playQueue(list, idx, { surface: opts.surface })`（呢兩個 flag 而家喺 `playQueueImpl` 度已經冇分支讀，pass-through 本身變埋死碼）。 |
| — | `LibraryScreen.js`/`HomeScreen.js`/`App.js:1112`/`App.js:3167` 四處提及 `browseTap`/`appendAutoplayTail` 嘅歷史註解 | 為咗滿足 grep 正控「零命中」，逐句改寫措辭去走個 flag 名，唔改任何邏輯意思。 |
| AVATAR-001 | `AvatarButton.js:19`、`InviteFriendsSheet.js:21`、`FriendSharesSheet.js:14`、`MineScreen.js:50`、`AddFriendSheet.js:14`、`LibraryScreen.js:268`、`PlaylistDetailSheet.js:47`、`HymnListScreen.js:80` | 8 處 `useAuth() || {}` 全部改做 `useAuth()`（`AuthContext.useAuth()` 冇 ctx 一定 `throw`，fallback 恆不可達）。 |

### 1.2 前端 export（S2，commit `97b3780`）

| ID | 檔:行 | 刪咗乜 |
|---|---|---|
| PERF-01 | `perfMarks.js:67` | `export function elapsedSinceT0() { return Date.now() - T0; }` 整個刪。`T0` 本身喺同檔其餘 3 處仲有用,冇變孤兒常數。 |

### 1.3 前端 icon（S3，commit `97b3780`）

`odeIcons.js` 刪 8 個零引用 icon 定義（連埋各自 note comment）：`playSmall`、`chevronLeft`、`nowPlaying`、`bell`、`volume`、`edit`、`sort`、`stop`。`addedToList` **冇郁**（產品缺口，等 D-3）。`OdeIcon.js` 兩句提及 `playSmall` 嘅歷史 comment 同步改寫（"play/playSmall/prev/next 淨係有 f 冇 s" → "play/prev/next 淨係有 f 冇 s"），邏輯完全冇變（`play`/`prev`/`next` 依然係實際受影響嗰 3 個 icon）。

### 1.4 前端 asset（S3，commit `74b9635`）

`git rm frontend/hymn-app/assets/favicon.png frontend/hymn-app/assets/splash-icon.png`。刪前 grep `app.json`（冇 `web`/`splash` config key）+ 全 code（零引用）確認。實測 `expo export` 前後兩次 Assets 清單都冇呢兩個檔（Metro 本身從來冇 bundle 過，證實刪除對 JS bundle 冇任何副作用，純慳 git 樹 ~300KB）。

### 1.5 backend lib（S6，commit `017faf0`）

| ID | 檔:行 | 刪咗乜 |
|---|---|---|
| LIB-02/03 | `presence.js:139-145` | `_resetForTest()`/`_sizeForTest()` 兩個 export + 上面「harness/測試專用」comment 整段刪（09-05 新鮮死碼，harness 從未接）。 |
| LIB-01 | `hymnDb.js:41-52` | `COMPILATION_PATTERNS` 常數 + 上面 5 行已過時 comment 一併刪（已被 `isCompilation()` 內嵌清單取代）。**`isCompilation()` 本身一個字冇改**。 |

---

## 2. Before/after 表

| 指標 | Before（`6c12310`） | After（`017faf0`） | 差 |
|---|---|---|---|
| `git diff --shortstat` | — | 17 files changed, 18(+), 117(-) | **淨減 99 行** |
| 前端 bundle（iOS Hermes bytecode，`expo export --platform ios`，冇 `--dev`） | 3,740,937 B | 3,738,046 B | **-2,891 B** |
| deadcode s2 `zeroReferenceCount`（前端） | 1 | 0 | -1(`elapsedSinceT0` 消失,`NOT_FOUND`) |
| deadcode s2 `internalOnlyCount`（前端） | 10 | 10 | 0（`useAuth` 仍判 `USED`） |
| deadcode s3 `iconCount` | 53 | 45 | -8 |
| deadcode s3 `iconZeroRef` | 9 項（8 死 + `addedToList`） | 1 項（`addedToList`） | -8 |
| deadcode s3 `assetCount` | 12 | 10 | -2 |
| deadcode s3 `assetZeroRef` | 2 項 | 0 | -2 |
| deadcode s6 `zeroReferenceCount`（backend lib） | 3 | 0 | -3 |
| deadcode s6 `internalOnlyCount`（backend lib） | 33 | 33 | 0（冇動 export-but-internal） |
| deadcode s8 findings | 3 組全部 `anyCallerPasses*=false` / 8 fallback site | 3 組 `branchDefinitionLines`/`fallbackSites` 全空 | 分支/fallback 定義本身喺 repo 消失 |

**⚠️ 執行單 §2 引用嘅「1C before = 3,740,962 B」係另一個 HEAD 抓嘅參考值**（本次 6c12310 抓到 3,740,937 B，相差 25 bytes，屬 HEAD 之間細微改動，唔係量度誤差——同一個 HEAD 內 before/after 對照先係本報告嘅主結論）。

**⚠️ 命令修正**：執行單寫嘅 `npx expo export --platform ios --dev false` 喺呢個 Expo CLI 版本(`expo export --help` 確認)`--dev` 係**presence-only boolean flag**，冇 `--dev <value>` 語法——`--dev false` 會令 `--dev` 被判存在(`__DEV__=true`)、"false" 淪落做未知位置參數,出嚟嗰份 bundle 係 9.46MB 嘅**非 production**版(`__DEV__=true`,冇 minify/bytecode)。改用冇 `--dev` 嘅 `npx expo export --platform ios --output-dir <dir>`(預設 minify+Hermes bytecode 開),先攞到同 1C 參考值同一數量級嘅 3.7MB production bundle。Before/after 兩次都用呢個改正咗嘅命令,方法論一致。

Android Hermes bytecode(1B before = 3,704,740 B)本波冇改 Android 專屬檔案,冇重新出 Android bundle(前端改動係共用 JS,理論上兩平台同步減,但冇實測驗證,如實記錄呢個缺口)。

---

## 3. `node --check` + module import

- 全部 17 個改動檔 `node --check` 過(exit 0)。⚠️**局限**:前端 `.js` 檔(App.js 同 8 個 screen/component 檔)含 JSX + `import` 語句,`node --check` 喺呢個 Node 版本(v26.0.0)對「`import` + JSX 組合」嘅檔案唔會真正拋 syntax error(用一個刻意壞嘅 JSX 片段 + import 頭做負控,證實會靜靜 exit 0),所以呢類檔嘅真正語法驗證要睇下面 §4 嘅 `frontend-harness.mjs`(babel 真 transform + 執行)先算數,`node --check` 淨係對 backend 兩個純 ESM 檔(`presence.js`/`hymnDb.js`,`type:"module"`,冇 JSX)有實質意義。
- backend 31 個 `lib/*.js` + 15 個 `routes/*.js`(**唔含 `server.js`**)逐個 `import()`,全部 46 個 module 0 fail(`JWT_SECRET` 用 session-local dummy 值餵 `authSecret.js` 開機檢查,冇動真 env)。`presence.js`/`hymnDb.js` 個別 `import()` 確認 `_resetForTest`/`_sizeForTest`/`COMPILATION_PATTERNS` 唔再喺 export 清單,`isCompilation`/`recordHeartbeat`/`getPresenceSnapshot` 等仍在。

---

## 4. Harness 結果

- **W1 frontend-harness.mjs**:H-F1~H-F5 全過,exit 0。同刪碼前一次跑(headSha `6c12310`)diff 淨係 timestamp/deviceId/sessionId(harness 內部隨機值)有變,事件結構、payload 形狀完全一致。
- **W1 backend-harness.mjs**:H-B1~H-B7 全過,exit 0,`nodeCheck`/`importCheck` 兩張表全 `status:0`/`ok:true`。用 `HARNESS_SCRATCH_DIR` 指去 scratchpad,冇寫真 `backend/logs`。
- **W2 全部 14 個 harness**(`b3-harness.mjs` 四個 mode `invites/share/presence/clientlog`、`b3-loginratelimit-harness.mjs` old/new、`b3-otp-*`、`hc1~hc5`、`hd-dotenv-harness.mjs`):全部 exit 0。`loginratelimit` old/new 兩次輸出逐行 diff 完全一致(`loginRateLimit.js` 本身冇改,屬預期)。`b3-harness presence` mode 直接練到 `lib/presence.js`(`recordHeartbeat`/`getPresenceSnapshot`),行為冇變(429 節流照觸發)。全部用 `CLIENT_LOG_DIR_OVERRIDE` 指去 scratchpad,`find backend/logs -newermt "2026-09-06 00:00:00"` 核實真 `backend/logs` 嘅新 mtime 全部嚟自 Eric 部機自己行緊嘅 `server.js`(`:3001` port 佔用中),唔係本次測試寫入。

---

## 5. deadcode 掃描器正控

- `s2-unused-exports.mjs`/`s8-dead-branch.mjs` 重跑後**自身內建嘅 positive control 變 FAIL**(`s2` exit 1、`s8` `positiveControl.pass:false`)。呢個係**預期行為,唔係 regression**:兩個掃描器嘅 positive control 硬編碼咗要搵到 `elapsedSinceT0`(判 `ZERO_REFERENCE`)/`useAuth() || {}` fallback(要 count > 0)嚟自證掃描邏輯冇壞——而家呢兩樣嘢已經俾我哋刪咗,搵唔到先至啱。`s2` 輸出 `elapsedSinceT0: "NOT_FOUND"`(消失)、`useAuth: "USED"`(冇變)佐證;`s8` 輸出 `avatarFallbackSiteCount: 0`、兩個 `branchDefinitionLines: []`。呢兩個掃描器本身冇改壞,只係佢哋設計嗰陣嘅正控樣本剛好就係本波刪除目標,冇時間/冇必要改返個正控樣本(掃描器係一次性審計工具,唔係長駐 CI)。
- `s3-icon-asset.mjs`/`s6-backend-lib-exports.mjs` 正控（`close`=USED / `requireAuthDefault`=USED）依然 PASS。
- 四個掃描器嘅候選數變化見 §2 表,`grep -rn "browseTap\|appendAutoplayTail\|elapsedSinceT0\|_resetForTest\|COMPILATION_PATTERNS\|playSmall\|chevronLeft" frontend/hymn-app/src frontend/hymn-app/App.js backend/lib backend/routes` **零命中**(`addedToList` 仍在,獨立 grep 確認)。

---

## 6. 做唔到 / 未做嘅嘢

- F5(`backend/data/hymns.db`,0 bytes)同 7 個 APK 備份(`app.apk.bak-*`/`hymn-app-v21*.apk`)**冇刪**——按執行單分工,呢兩項要人手 `rm`(sandbox 擋住),§5 證據冊已附命令,等 Eric/Dispatch 喺 Terminal 行:
  ```bash
  rm -f backend/data/hymns.db backend/public/app.apk.bak-1.5.0-20260808-070853 backend/public/app.apk.bak-v1.1.0-20260808 backend/public/hymn-app-v212.apk backend/public/hymn-app-v213.apk backend/public/hymn-app-v214.apk backend/public/hymn-app-v215.apk
  ```
- Android Hermes bytecode bundle 冇重新量(見 §2 備註)。
- 執行單原文 `--dev false` 命令喺呢個 Expo CLI 版本語意唔啱(見 §2 警告),本報告用修正後嘅命令,方法論同 1C 參考值(3,740,962 B)對得上,但本身唔係逐字跟執行單原句。
- S2/S8 掃描器內建 positive control 因為刪碼而變 FAIL(§5 已解釋原因),冇去改返掃描器本身嘅正控樣本(超出「刪死碼」呢個任務範圍)。

---

## 7. Commit

| Commit | 範圍 | 檔案數 | 行數 |
|---|---|---|---|
| `97b3780` | 前端 code(死分支/export/icon/useAuth) | 13 | +18/-97 |
| `74b9635` | 前端 asset(favicon/splash-icon) | 2 | binary |
| `017faf0` | backend lib(presence/hymnDb) | 2 | -20 |

`git diff --shortstat 6c12310..HEAD` = **17 files changed, 18 insertions(+), 117 deletions(-)**,淨減 **99 行**。
