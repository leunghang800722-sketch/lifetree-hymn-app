# W3 死碼清理第二段 — Opus 5 獨立驗收 2026-09-06

驗收者：Opus 5（獨立，冇改 source、冇 commit、冇部署/restart/OTA）。
對象：`97b3780`（前端 code）、`74b9635`（asset）、`017faf0`（backend lib）、`7922c41`（報告）。Base `6c12310`。
判準：`DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md` §0 紅線 + `DEEP-AUDIT-W3-DEADCODE-REGISTER-20260906.md` §1/§5 Fable 批示。

---

## 0. 結論

**可部署（🟢 GO）**，冇發現任何行為性 regression、冇踩任何紅線、報告嘅數字全部獨立重跑對得上（bundle delta 逐 byte 一致）。
四條問題全部係 P2/P3 級嘅**範圍同方法論**問題，唔阻部署，但有一條（P2-1）建議喺部署前俾 Eric/Fable 知會一聲。

---

## 1. 逐 hunk 核對（§5 對照）

`git diff --shortstat 6c12310..7922c41 -- frontend backend` = **17 files changed, 18(+), 117(-)**，同報告 §7 一致。
三個 code commit 掂過嘅 17 個檔全部喺 §5 批示範圍內嘅檔案（見下），冇夾帶任何其他 session 嘅髒檔（`backend/hymns.db`、`ops/lyrics/*`、`.claude/settings.json` 等 working-tree 髒檔全部冇入 commit）。

| §5「刪」項 | diff 實際做咗 | 判 |
|---|---|---|
| S8 APP-003a `opts.browseTap` 分支 | `App.js` 刪整個 25 行 if block（含 `insertBoundary: 1` 賦值） | ✅ 對應 |
| S8 APP-003b `opts.appendAutoplayTail` 分支 | 刪 11 行 if block；`let finalList = list` / `let autoRadioFrom = opts.autoRadioFrom ?? null` 兩行**保留**（下面 `setAutoRadioFrom`/`setQueue` 仍用） | ✅ 對應，變數冇變孤兒 |
| S8 `useAuth() \|\| {}` ×8 | 8 個檔逐個改 `useAuth()`，位置同證據冊行號逐一對得上 | ✅ 8/8 |
| S2 `elapsedSinceT0` | `perfMarks.js` 刪 3 行；`T0` 同檔其餘用法冇動 | ✅ |
| S3 icon ×8 | `odeIcons.js` 刪 `playSmall`/`chevronLeft`/`nowPlaying`/`bell`/`volume`/`edit`/`sort`/`stop` | ✅ 8/8 |
| S3 asset ×2 | `git rm favicon.png splash-icon.png` | ✅ |
| S6 `presence.js _resetForTest`/`_sizeForTest` | 刪 7 行（含 comment） | ✅ |
| S6 `hymnDb.js COMPILATION_PATTERNS` | 刪 13 行（含 5 行過時 comment）；`isCompilation()` 一個字冇改（diff 入面係 context line） | ✅ |

**超出 §5「刪」表嘅改動（6 處，全部係註解改寫，零 code）**：`App.js:1109`、`App.js:3164`、`HomeScreen.js:224`、`OdeIcon.js:42/49`、`LibraryScreen.js:402`、`PlaylistDetailSheet.js:141-145`。
`HomeScreen.js` 同 `OdeIcon.js` 兩個檔**淨係得註解改動、一行 code 都冇刪**。詳見 §4 P3-2/P3-3。

### 紅線核對（逐條）
| 紅線 | 核法 | 結果 |
|---|---|---|
| HLS 樹一個字唔准刪 | `git diff --name-only` 冇任何 hls 檔；diff 全文 grep `HLS_ENABLED\|isHlsUrl\|hlsFallback\|hlsDowngraded` | ✅ 零命中 |
| `addedToList` 唔准刪 | `odeIcons.js:94` 仍在；s3 重跑 `iconZeroRef = ['addedToList']` | ✅ 仍在 |
| 410 stub 四檔本波唔刪 | `routes/category.js`/`search.js`/`audio.js`/`home.js` 冇喺 diff 出現 | ✅ 冇掂 |
| 唔掂 PlayerProvider 起播/stall/watchdog | 唯一喺 PlayerProvider 內嘅 code 改動係 `playQueue()` 兩個隊列建構分支（`setQueue` 之前），冇掂任何 nudge/kick/watchdog/beacon 計時邏輯。特別核實起播遙測 `App.js:2653 surface: opts.surface \|\| classifyFirstTapSurface(...)` 收到嘅值前後完全一樣 | ✅ 冇掂 |
| `isCompilation()` 唔准掂 | diff 只係 context line；import 後實測 `isCompilation('THE WAY (全碟)')=true`、`isCompilation('Best of Hillsong')=true`、`isCompilation('奇異恩典')=false` | ✅ 行為不變 |
| N-2 `backfillAlbumFrom*Catalog.js` | 冇喺 diff 出現 | ✅ |

---

## 2. 殘留引用獨立 grep（排除 node_modules / logs / ops/perf / ops/lyrics / DEEP-AUDIT 文件）

| symbol | 命中 | 備註 |
|---|---|---|
| `browseTap` | **0**（code） | 只餘 `QUEUE-BEHAVIOR-3-SCENARIOS-PLAN.md` 規格文件（見 P2-1） |
| `appendAutoplayTail` | **0**（code） | 同上 |
| `elapsedSinceT0` | **0** | 只餘 09-02 PERF 舊報告 |
| `_resetForTest` / `_sizeForTest` | **0** | |
| `COMPILATION_PATTERNS` | **2，全部假陽性** | `backend/scripts/backfillAlbumFromMusicBrainzCatalog.js:90/96` 係另一個獨立 local const `EXTRA_COMPILATION_PATTERNS`，**唔係 import**。全 repo（含 `backend/scripts/`）零 importer ✅ |
| `playSmall`/`chevronLeft`/`nowPlaying`/`bell`/`volume` | **0** | |
| `edit`/`sort`/`stop` 作 icon 名 | **0** | 抽晒全前端所有 `icon: '…'` / `name="…"` 字面值做集合比對，8 個被刪名一個都冇出現；三個動態 `name={var}` site（`MineScreen:270 s.icon`、`HomeScreen:71`、`AccountScreen:23`）嘅來源字面值亦全部核過 ✅ |
| `favicon.png` / `splash-icon` | **0** | |
| **`addedToList`** | **1（仍在）** | `odeIcons.js:94` ✅ |

**icon 完整性補驗**（import 真 module 數）：45 個 icon；`f` 有但 `s` 冇嘅剩返 **`play`/`prev`/`next` 3 個** —— 即 `OdeIcon.js` 改寫嘅註解「淨影響 play/prev/next 呢 3 個」係**事實正確**，唔係求其改字。

---

## 3. APP-003 + useAuth 逐項核（§3 要求）

**`handlePlayHymn` 刪前刪後**
```
before: playQueue(list, idx, { appendAutoplayTail: !!opts.appendAutoplayTail, browseTap: !!opts.browseTap, surface: opts.surface });
after : playQueue(list, idx, { surface: opts.surface });
```
- `playQueue()` 全函數只讀 3 個 opts key：`opts.autoRadioFrom`、`opts.insertBoundary`、`opts.surface`（`grep -n 'opts\.' App.js` 全檔核實，2623/2624/2630/2634/2653）。`browseTap`/`appendAutoplayTail` 刪咗之後**冇任何 reader**。
- 8 個 `onPlayHymn(...)` call site 逐個列晒（SharedPlaylistSheet:75、PlaylistDetailSheet:147、LibraryScreen:405、HomeScreen:227/356、MineScreen:289/300、HymnListScreen:83），**opts 只出現過 3 個 key：`explicit`、`playlist`、`surface`**。冇一個傳 `autoRadioFrom`/`insertBoundary`——即舊 code 亦從未 forward 過呢兩個，**新舊完全等價**。
- 被刪 block 用嘅 helper（`buildAutoplayTail`/`getPlayLog`/`getRecentIds`/`autoplayFlavorRef`/`autoplayEnabledRef`）喺 `App.js:2483/2547` 嘅 `playSingle` 路徑仍有真 caller，**冇變 unused import**。

**8 個 `useAuth()`**
- `AuthContext.useAuth()` = `if (!ctx) throw new Error(...)` ⇒ `|| {}` 恆不可達，確認。
- `App.js:4538` provider 巢：`<AuthProvider>` 係**最外層**，包住 `AdminEditHymnProvider→FavoritesProvider→PlaylistsProvider→AddToPlaylistProvider→PlayerProvider→AppContent`。
- 8 個檔嘅 render site 逐個追：`AvatarButton`(App.js:3053 / MineScreen:212 / LibraryScreen:298)、`LibraryScreen`(App.js:4284)、`MineScreen`(App.js:4288)、`HymnListScreen`(App.js:4337)、`PlaylistDetailSheet`/`AddFriendSheet`/`FriendSharesSheet`(MineScreen:483/487/493)、`InviteFriendsSheet`(AccountScreen:142) —— **全部喺 AppContent 之下，即 AuthProvider 之內**。Modal/Sheet 雖然係 native Modal，但仍喺同一 React tree，context 通。
- **冇一個** call site 前後 6 行有 `try`/`catch`（逐檔 awk 掃過）。
- **冇 headless / provider 外 render**：`index.js` 只有 `registerRootComponent(App)` + `TrackPlayer.registerPlaybackService(...)`；`src/track-player-service.js` grep `useAuth` = 0 命中。

---

## 4. 獨立重跑（§4/§5 要求）

| 項目 | 我跑到嘅結果 | 報告聲稱 | 對唔對得上 |
|---|---|---|---|
| `ops/perf/harness/w1/frontend-harness.mjs`（`CLIENT_LOG_DIR_OVERRIDE`→scratch） | **exit 0**，H-F1~H-F5 全過 | 全過 exit 0 | ✅ |
| backend `lib/*.js`(31) + `routes/*.js`(15) 逐個 `import()` | **46/46 ok，0 fail** | 46 個 0 fail | ✅ |
| `presence.js` export 清單 | `MAX_ENTRIES, STALE_MS, getPresenceSnapshot, recordHeartbeat, sweep`；`_resetForTest`/`_sizeForTest` = **false** | 同 | ✅ |
| `hymnDb.js` | `COMPILATION_PATTERNS` = **false**；`isCompilation` = function，3 個 spot check 正確 | 同 | ✅ |
| `s3-icon-asset.mjs` | exit 0；`iconCount 45`、`iconZeroRef ['addedToList']`、`assetCount 10`、`assetZeroRef 0`、正控 `close` **pass** | 45 / 1 / 10 / 0 | ✅ 逐個一致 |
| `s6-backend-lib-exports.mjs` | exit 0；`zeroReference 0`、`internalOnly 33`、正控 `requireAuth` **pass** | 0 / 33 | ✅ |

### Bundle before/after（我獨立重做咗兩次完整 export）
方法：`npx expo export --platform ios --output-dir <scratch>`（**冇 `--dev`**）。
- **before** 喺隔離 `git worktree`（detached @ `6c12310`，node_modules symlink 返主樹）跑，跑完即 `git worktree remove --force` + `prune` 清走。
- **after** 喺主 working tree 跑（已核實 `git status --porcelain frontend/hymn-app` 對 tracked 檔零改動，即 frontend == `7922c41`）。

| | 我量到 | 報告 | 差 |
|---|---|---|---|
| before (`6c12310`) | **3,740,938 B** | 3,740,937 B | +1 |
| after (`017faf0`) | **3,738,047 B** | 3,738,046 B | +1 |
| **delta** | **−2,891 B** | −2,891 B | **0（完全一致）** |

**`--dev` 方法論核實**：`npx expo export --help` 實測 —— `--dev` 條目寫住 `--dev  Configure static files for developing locally using a non-https server`，**冇 `<value>` 參數位**，即係 presence-only boolean。報告指出執行單原文 `--dev false` 會令 `__DEV__=true` 出 9.46MB 非 production bundle，**呢個更正正確**。兩次 export 用同一條修正後命令，方法論一致 ✅。

---

## 5. 問題清單

| # | 嚴重度 | 問題 |
|---|---|---|
| P2-1 | 🟡 P2 | **被刪嘅 `browseTap` 分支，佢自己嘅註解明文寫住「呢個分支照 `appendAutoplayTail` 先例**刻意保留做死碼機關**，第時有 explicit 入口需要插播行為就用得返，唔好順手剷」**。證據冊 §1.1 APP-003a 嘅「歷史」欄只寫「設計咗個 flag 但冇接落 caller」，**由頭到尾冇引用過呢句 in-code 保留指令**，Fable §5 係喺唔知有呢句嘅情況下批「刪」。決定本身唔算錯（零 caller = 真死碼），但要知道成本：`QUEUE-BEHAVIOR-3-SCENARIOS-PLAN.md` §3.3/§3.4/§7 仲完整保留住規格同 `App.js:943-966` 舊行號，git `6c12310` 亦有原文，所以**可以復原**；但第時要接返插播入口，就係「照文件重寫 ~25 行 `headLen`/`explicitHead` 判斷邏輯」，唔係 revert 一個 commit 咁簡單。建議：知會 Eric/Fable 呢一句被 override 咗；如果認同就當補記錄，如果唔認同，`git revert 97b3780` 嘅呢兩個 hunk 成本好低。 |
| P3-2 | 🟢 P3 | **超範圍（純註解）**：`HomeScreen.js`、`OdeIcon.js` 兩個檔嘅改動 **100% 係註解改寫、一行 code 都冇刪**；另加 `App.js`×2、`LibraryScreen.js`×1、`PlaylistDetailSheet.js`×1。§5「刪」表冇任何一項係「改註解」。零 runtime 風險（已逐句核實語意冇改壞，`OdeIcon.js` 嗰句「play/prev/next 3 個」我 import 真 module 數過係事實正確），但確實唔喺批示範圍。 |
| P3-3 | 🟢 P3 | **驗收指標被為咗過驗收而修改**：報告 §1.1 自認呢批註解改寫係「為咗滿足 grep 正控『零命中』」。即係話「`grep browseTap` 零命中」呢個結論，部分係靠改寫量度對象造出嚟，唔純粹係刪 code 嘅結果。已如實披露（唔算隱瞞），但呢個 pattern 唔健康。建議以後將「**code 零引用**」（`--include='*.js'`，唯一驗收指標）同「文件/註解仲有提及」（記錄用，唔應該改）分開兩個指標，唔好為咗一條 grep 去改歷史註解。 |
| P3-4 | 🟢 P3 | **bundle 絕對值差 1 byte**（before 3,740,938 vs 3,740,937；after 3,738,047 vs 3,738,046）。兩邊同樣 +1，**delta 逐 byte 一致 = −2,891**，所以主結論成立；1 byte 屬環境差異（export 路徑長度 / Expo cache），唔影響任何判斷。純記錄，唔使跟進。 |
| P3-5 | 🟢 P3 | **Android Hermes bundle 冇重量**（報告已自認）。改動 100% 係共用 JS（冇任何 `.android.js`/`.ios.js`），兩平台理論上同步減 ~2.9KB，但冇實測。低風險，OTA 兩個 platform 都推就自然驗到。 |
| P3-6 | 🟢 P3 | **`s2`/`s8` 兩隻掃描器由而家開始係「壞咗嘅儀器」**：佢哋嘅內建 positive control 硬編碼咗要搵到 `elapsedSinceT0` / `useAuth() \|\| {}`，而呢兩樣就係本波刪除目標，所以 `s2` exit 1、`s8` `positiveControl.pass:false`。報告解釋合理（我確認唔係 regression），但 **W3 第三波（09-13 410 stub）唔可以再用呢兩隻掃描器嘅 exit code 做通過準則**。建議喺兩個腳本頂加一行「⚠️ 正控樣本已於 09-06 刪除，exit code 失效」。 |

**冇發現**：任何行為改變、任何紅線被掂、任何超範圍嘅 **code** 改動、任何殘留引用、任何 harness/import 失敗、任何數字報大。

---

## 6. 部署風險 + smoke

### 次序（紅線）
1. **先 backend restart，後 OTA**（memory `feedback-no-deploy-during-live-qa` / HLS 波次記錄嘅既定紅線）。
2. Backend restart 要過 deploy gate（per-sha，會夾帶其他 session 未批 commit，要人手 approve）。
3. **⚠️ 唔准喺 Eric 真機 QA 進行緊嗰陣部署**——先查 `deploy.log` 最近 15 分鐘有冇 ota-publish。

### backend restart 風險評估
- `presence.js`：只刪 `_resetForTest`/`_sizeForTest` 兩個 export。**`routes/presence.js:19` 只 import `{ recordHeartbeat, getPresenceSnapshot }`**（已核），全 repo 冇第二個 importer。⇒ **零風險**。
- `hymnDb.js`：只刪 `COMPILATION_PATTERNS` 常數。全 repo（含 `backend/scripts/` 89 個檔、`ops/`）**零 importer**（唯一 grep 命中係另一個獨立 local const `EXTRA_COMPILATION_PATTERNS`）。`isCompilation()` 一個字冇改，spot check 行為一致。⇒ **零風險**。
- 綜合：**backend 呢個 restart 冇行為性風險，可以搭下一次任何 restart 順風車，唔使為佢單獨開一次窗口。**

### restart smoke（最少三條）
```bash
# 1. presence heartbeat 仍 204（routes/presence.js:106）
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/api/presence/heartbeat \
  -H 'Content-Type: application/json' -d '{"deviceId":"smoke-opus-w3","state":"foreground"}'
# 期望：204

# 2. /api/admin/presence 形狀不變（要 admin token）
curl -s localhost:3001/api/admin/presence -H "Authorization: Bearer $ADMIN_TOKEN" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
    console.log(JSON.stringify({top:Object.keys(j).sort(),online:Object.keys(j.online).sort(),
    member0:j.members[0]?Object.keys(j.members[0]).sort():null}))})'
# 期望 top: ["members","now","online"]；online: ["guests","members","total"]
#     member0（如有人在線）: ["durationSec","id","name","onlineSince","state"]

# 3. hymnDb 開機路徑（isCompilation 用喺 library 過濾）
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/hymns
# 期望：200，且歌數同 restart 前一致（isCompilation 冇改 ⇒ 排除清單應該一模一樣）
```

### OTA 後 sim 最少要做嘅一項檢查
**「我的」tab → 開一個自訂清單 → 撳清單入面第二首歌。**
一個動作同時覆蓋三個改動點：
1. `MineScreen`（`useAuth()` 改動點，最密——同時攞 `user`/`isAdmin`/`getToken`）render 唔 crash；
2. `PlaylistDetailSheet`（`useAuth()` 改動點 + 註解改寫檔）render 唔 crash；
3. `handlePlayHymn` 嘅 `explicit + playlist` 分支 → `playQueue(list, idx, { surface })` 呢條**正正係被改嗰行**：應該由撳嗰首開始、照清單次序播、**播晒最後一首就停（唔會接隨機尾巴）**，`⏭` 冇反應係預期。

如果 `AuthProvider` 包唔到任何一個改動點，`useAuth()` 會即刻 `throw` 出紅屏——所以呢一個動作亦係 8 個 `|| {}` 刪除嘅最快 negative check。
（想再穩陣加一項：`播放器全屏 → 播放清單` 睇 `nowPlaying` icon 位——呢個 icon 被刪咗，如果有任何動態引用漏網會 render 空白；不過我已經用「全前端 icon 字面值集合比對」證咗零引用，所以呢項屬 optional。）

---

## 7. 重跑數字總表（有冇唔對）

| 數字 | 報告 | Opus 重跑 | 判 |
|---|---|---|---|
| `git diff --shortstat` | 17 files, 18(+), 117(−) | 17 files, 18(+), 117(−) | ✅ |
| bundle before | 3,740,937 B | 3,740,938 B | ⚠️ +1 B（環境差異） |
| bundle after | 3,738,046 B | 3,738,047 B | ⚠️ +1 B（環境差異） |
| bundle **delta** | −2,891 B | **−2,891 B** | ✅ **逐 byte 一致** |
| s3 `iconCount` | 45 | 45 | ✅ |
| s3 `iconZeroRef` | 1（`addedToList`） | 1（`addedToList`） | ✅ |
| s3 `assetCount` / `assetZeroRef` | 10 / 0 | 10 / 0 | ✅ |
| s6 `zeroReferenceCount` / `internalOnlyCount` | 0 / 33 | 0 / 33 | ✅ |
| backend module import | 46 個 0 fail | 46 個 0 fail | ✅ |
| W1 frontend-harness | exit 0，H-F1~F5 全過 | exit 0，H-F1~F5 全過 | ✅ |
| s3 / s6 正控 | pass | pass | ✅ |
| s2 / s8 正控 | FAIL（預期，樣本被刪） | 同（見 P3-6） | ✅ 解釋成立 |

**冇一個數字報大。** 唯一偏差係 bundle 絕對值 ±1 B，而最重要嗰個數（delta −2,891 B）逐 byte 對到。

---

## 8. 未做 / 做唔到

- 冇重量 Android Hermes bundle（P3-5）。
- 冇跑 W1 backend-harness / W2 那 14 個 harness（報告聲稱全過；我改為用「46 個 module 逐個 `import()` + presence/hymnDb export 清單 + `isCompilation` 行為 spot check」直接驗改動面，覆蓋度對呢兩個檔嚟講足夠）。
- 冇開模擬器（規則禁止）；§6 嘅 sim 檢查係開單，唔係已驗。
- F5 `backend/data/hymns.db` + 6 個 APK 備份仍未刪（要人手 `rm`，§5 已附命令）——確認今日仍在，唔屬本次 commit 範圍。
