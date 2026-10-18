# ODELY-OPT Opus ⑤ 獨立驗收（OTA 出街前最後一關）2026-10-18

HEAD = `836bed0`（branch feature/player-rebuild），基線 `d74c483`。只讀 + 跑 harness；冇 git 寫、冇部署/OTA、冇開模擬器、冇讀 secret。
Scratch：`scratchpad/opus-opt5/`（wdcmp.js、adv.js、prev-app/、export-check/）。

## 判詞：🟢 放行

六條 commit 都只改咗報告講嘅嘢，冇多手。紅線檔零 diff。watchdog 常數同函數體逐字一致（比對器有做負控）。六個 harness 全部同預期數一致。M-1/M-2 用對抗測試證實真係修好（舊版負控仍然重現到）。iOS export 成功，bundle 3.76MB，冇郁到 repo。
只有一個低級發現，唔阻 OTA。

## 1. 逐 commit 核

| commit | 檔 | 結論 |
|---|---|---|
| 73e5b4f | App.js +3/-1（守衛 `plan.insertAt === plan.newCurIdx + 1` + 2 行註釋）、OPUS4 報告 | ✅ 只改守衛 |
| fdd88db | 只改 harness-c.js | ✅ |
| c13808d | userSync.js +6（`set(OUTBOX_KEY,'[]')` 喺 corrupt 備份後；`clearOutbox` 加 `delete(PENDING_KEY)`，兩句都包住 try/catch）+ usersync harness (m)(n) | ✅ |
| cb30332 | 6 個 screen，+9/-14 | ✅（詳情見下面） |
| 8c05437 / 836bed0 | 只改 BLUEPRINT.md、IRON-RULES.md、OPUS3 報告、REPORT | ✅ 純文件 |

cb30332 喺 HEAD 嘅 grep 結果：
- 刪 `styles.cover` 嘅 5 個檔（AdminAdd/HymnList/Library/PlaylistDetail/SharedPlaylist）：父 commit 嘅 `styles.cover` 引用數 = 0/0/0/0/0，所以刪之前已經冇人用。MineScreen 冇刪 cover，佢喺 :442 仍然用緊，:530 仲有定義 ✅
- 刪 `Image` 嘅 4 個檔（Library/Mine/PlaylistDetail/SharedPlaylist）：`<Image` 同 `Image.` 都係 0 ✅
- 刪 `effects` import 嘅 4 個檔（AdminAdd/HymnList/Library/SharedPlaylist）：`effects.` 都係 0 ✅。MineScreen 同 PlaylistDetail 保留咗 `effects` import，佢哋仍然用緊 `effects.ctaGlow`/`coverInset` ✅
- HymnListScreen 刪咗 `useState`/`useEffect`：刪完 `useState(`、`useEffect(` 都係 0 ✅

## 2. 紅線總核

- `git diff d74c483 HEAD --stat -- frontend/hymn-app` = 26 檔（+1102/-354）。排除 tools/ 之後剩 16 檔。
- 以下檔案 `git diff --stat` 冇輸出，即零 diff：`src/theme/designSystem.js`、`src/icons/OdeIcon*`、`src/components/OdeIcon*`、`src/components/SheetShell*`、`plugins/`、`patches/`、`package.json`、`package-lock.json`、`app.json`。
- `<BottomSheet` 總數：d74c483 = 8，HEAD = 8。`<BottomSheet|@gorhom/bottom-sheet` 共 9 行，sort 後 `diff` 完全一樣。
- 補充：`react-native.config.js` 有 diff（§② 刪咗 react-native-vector-icons 嘅 dependencies 同 asset 殘留）。呢個檔只影響 native autolink，唔會入 JS bundle。package.json 同 node_modules 都已經冇 vector-icons，所以唔影響 OTA，下次 native build 亦唔會因為呢個多 link 一個 module。
- watchdog 逐字比對（`wdcmp.js` 識跳 string/comment/template 嚟做 brace-matching，抽出完整 `useCallback(...)`，包埋 deps）：

| 項目 | 結果 |
|---|---|
| const MAX_MID_STALL_NUDGES_PER_TRACK / BUFFERING_STUCK_NUDGE_TICKS / BUFFERING_STUCK_SKIP_TICKS / BUFFERED_ADVANCING_CAP_TICKS / HLS_STARTUP_KICK_INTERVAL_TICKS / NATIVE_WD_V2 | SAME ×6 |
| handleStuckTrackEnd（137 行）/ handleMidStreamStall（43）/ handleBufferingStuck（46） | SAME（sha1 45f2d506 / 21652562 / 2629c6e7） |
| 包住 hlsStartupKick 嘅 poll useEffect（350 行，18035 字） | SAME（4b4756b6） |
| 所有提到 hlsStartupKick 嘅行（12 行）、提到 NATIVE_WD_V2 嘅行（25 行） | SAME |

  比對器負控：將 CAP 改成 5 → 報 DIFF；喺 handleBufferingStuck 函數體入面加 `//X` → 報 DIFF。證明比對器真係捉到改動。

## 3. Harness（HEAD，原始尾行）

```
insertnext-harness: 66 passed, 0 failed
H-A: 14 pass / 0 fail
H-B: 26 pass / 0 fail
H-C: 35 pass / 0 fail
→ PREV (9589f60) — 額外負控(只供參考): 26 pass / 4 fail      ← 4 條 fail 全部係 (m)×2 + (n)×2
結果: NEW 30/30;負控 OLD fail 15(必須 > 0 先算負控成立)
結果:全部 5 個場景過          (react-harness)
```
H-C 嘅 (3b)/(3c)/(3d) 都有出現；marker 用 `braceBlock(App.js, 'if (plan.insertAt === plan.newCurIdx + 1) {')` 直接讀 App.js。全部 rc=0。

## 4. M-1 / M-2 對抗重跑（OPUS3 adv.js 原檔 copy）

| | HEAD | 負控 c13808d^ |
|---|---|---|
| T3：主隊 corrupt + flush 5 次 | corrupt keys = **1**，主隊已唔再係 `{bad` | corrupt keys = 5，主隊仍係 `{bad` |
| T3：之後第一次 enqueue | outbox = [fav_add:1]，corrupt keys 仍然係 1 | corrupt keys = 6 |
| T4：clearOutbox 後 | pending=[]，len=0 | pending=[fav_add:42]，len=1 |
| T4：換 token（userB）flush | calls = [] | `POST favorites/42`（推咗上一個帳戶嘅 op） |

M-1 同 M-2 都證實修好。clearOutbox 有 3 個 caller（AuthContext:193、App.js:4338、:4349），全部會受惠。

## 5. OTA bundle 可行性

`npx expo export --platform ios --output-dir scratchpad/opus-opt5/export-check` → rc=0，用咗 7.9 秒（wall）。log 冇 warn，亦冇 error。
- `iOS Bundled 6480ms index.js (1417 modules)`
- `_expo/static/js/ios/index-2fafda4469de9cb32ee066fb828bd4be.hbc` = 3,762,086 bytes（3.8MB），4 個 assets，metadata.json 393B
- 跑之前同之後都做咗 `git status --porcelain --ignored`（排除 node_modules），兩次 diff 一樣，repo 冇變；frontend/hymn-app 工作樹仍然係 clean。
- 冇跑任何 OTA publish 命令。

## 發現

### L-1（低，唔阻 OTA）HymnListScreen 仲有一個冇人用嘅 `Image` import
`src/screens/HymnListScreen.js:18` 嘅 react-native import 入面仲有 `Image,`，但全檔冇任何 `<Image`/`Image.` 用法（cb30332 之前已經係咁，cb30332 冇處理）。只係死碼，冇行為影響。
修法：喺 import list 刪走 `Image,` 呢行。下次清理順手做就得，唔使為佢再驗一輪。

## 未核
- 真機或模擬器 UI 行為（按指示冇開模擬器）。
- logout 嗰下啱啱有 flush 飛緊、用緊記憶體 fallback queue 嘅 race（唔屬 M-1 範圍，冇測）。
- Android export（只跑咗 iOS）。
