# ODELY-OPT §④ Opus 獨立驗收（1c5297f + f73951a）— 2026-10-18

## 判詞：🟡 有條件放行
- trackChanged 路徑 + watchdog：**零行為改動，放行**（token 級證明，見 §1、§2）。
- insertNext 新路徑：安全（唔會影響插入成功路徑、唔會換錯歌），但守衛 `plan.insertAt === curIdx + 1` **漏咗「搬位（dup 喺 curIdx 前面）」個案**（見 §4 F1）。唔係安全問題（漏咗就等同改動前，靠現有 PlaybackError／handleStuckTrackEnd 兜底），但同 SPEC-PLAN §2「搬位（moved=1）同樣適用」唔符。條件：一個 token 修正（`curIdx` → `plan.newCurIdx`）或 Eric 接受覆蓋窄咗；harness-c (3)「插 idx+2」場景結構上不可達，應改為搬位場景。

## 1. Diff 結構
`git diff 6ade187 1c5297f -U0`：**正好三個 hunk** — `@@ -555,0 +556,70`（helper）、`@@ -1134,67 +1204,2`（trackChanged）、`@@ -2703,0 +2709,6`（insertNextImpl）。
`git diff 6ade187 f73951a --stat`：只有 App.js / harness-c.js / ODELY-OPT-REPORT。`src/`、`package.json` 零 diff（gorhom / OdeIcon / designSystem 零 diff）。

**Token 級比較**（剝註解、剝空白，舊 inline old:1140–1200 vs helper new:565–624；old 407 tokens / new 393）。差異只有三處：
1. 刪 `const nextSong = queueRef.current[idx + 1];`（改由參數入）。
2. `{ hymnId: nextSong.id, ctx: 'next' }` → `{ hymnId: nextSong.id, ctx }`（shorthand）。
3. beacon detail `ctx=next` → `ctx=${ctx}`。
其餘 guard 次序、`> 200` 封頂、`- 15`、`hlsDowngradedTrackRef` 兩處檢查位置、`nativeIdx <= curIdxNow`、`forceProgressive:true`、`logDiag('hlsFallback',{appState,hymnId,detail},{always:true})`、`remove`→`add`→set ref 次序：**逐 token 一致**。

唯一語義細節：`queueRef.current[idx + 1]` 而家喺 Platform/HLS 閘之前求值（Android 都讀一次）——純陣列讀，`queueRef.current` 上一行已經 `.slice()` 過，必定係陣列，無副作用。

`useCallback(..., [])`：閉包用到嘅全部係 refs（`hlsDowngradedTrackRef`:549、`hlsPreflightSeenRef`:555、`currentQueueIndexRef`:500、`appStateRef`:533）或 module 級（`HLS_ENABLED` `let`:158、`toTrack`:164、`logDiag`:286、`preflightHls/isExplicitHttpFailure` import:35、`TrackPlayer`、`Platform`）。無 state 捕捉，`[]` 正確。

## 2. Watchdog 零 diff 證據
逐段 `diff` old vs new：`old[1..555]==new[1..555]`、`old[556..1133]==new[626..1203]`、`old[1201..2703]==new[1206..2708]`、`old[2704..4940]==new[2715..4951]` 全部 IDENT。
- 全部 watchdog 符號都喺 IDENT 段：`MAX_MID_STALL_NUDGES_PER_TRACK` 1694、`slowLoadNoticeRef` 1717、`BUFFERING_STUCK_*` 1719/1726、`BUFFERED_ADVANCING_CAP_TICKS` 1783、`BACKWARD_SEEK_GRACE_TICKS` 1823、`hlsStartupKick*Ref` 1844/1845、`handleStuckTrackEnd` 1859、`handleMidStreamStall` 2003、`handleBufferingStuck` 2052、`sleepPollInterval` 2152、`pollState` 2485、`NATIVE_WD_V2` 4816、`retriedTrackRef` 544。
- PlaybackActiveTrackChanged handler（new 1115 起）：除 1204–1205 兩行外全部喺 IDENT 段（rolling warm `warmIds(nextIds)` 1197–1202、downgraded reset、nativeSkipAttributed、insertBoundary、prefetchAudio 等全部原封）。

## 3. Harness（committed f73951a，`git worktree` 去 scratch 跑，跑完已 remove）
| harness | 結果 |
|---|---|
| hls-preflight A | 14/14 |
| hls-preflight B | 26/26 |
| hls-preflight C | 29/29 |
| insertnext | 66/66（910 exhaustive） |
| usersync | NEW 26/26，負控 OLD 13 fail |
| react-harness | 5/5 |

harness-c 方法核實：helper／守衛／call 行由 **committed App.js 原文** brace-match 抽出，babel 轉碼 + `new Function` 注入 mock；舊版由 `git show 6ade187` 抽；`preflightHls` 係真 module。唔係複製品。限制：`toTrack` 係 mock；`plan` 係手砌，冇經真 `computeInsertNext`（所以 F1 冇被捉到）。

Adversarial（自寫，同一抽段法，scratch `adv.js`）：
- A1 preflight 期間第二次 insertNext 將原歌推去 idx2 → 用 id 對位熱換 idx2，冇掂新 idx1 ✅
- A1b preflight 期間歌被移走 → 唔換 ✅
- A2 `toTrack` 回 progressive URL → 零 fetch 零呼叫 ✅
- A3 preflightHls 同步 throw／async reject／getQueue throw／toTrack 同步 throw → 唔 throw 出守衛、零 unhandledRejection、零 swap ✅
- A4 真 `computeInsertNext`：cur=[1,2,3] 播緊 idx1，插 id1（dup 喺前）→ `insertAt=1,newCurIdx=0`，id1 確係下一首，但守衛 `1 === 1+1` false → **零預檢** ❌（= F1）
- A5 掃 91 個真 plan：`insertAt === newCurIdx+1` 永遠成立（0 例外）；守衛 miss 35/91（全部係 dup 喺 curIdx 前）。

## 4. 發現
- **F1 🟡** `App.js:2712` `plan.insertAt === curIdx + 1`：`insertNextCore` 結構上 `insertAt` 永遠 = `newCurIdx + 1`（永遠係下一首），所以呢個守衛實際語義係「唔係搬位自前面」。漏咗 Play Next「重播啱啱播完嗰首」（insertNextCore 註解自己講係最典型用法）。修法：`plan.insertAt === plan.newCurIdx + 1`（或直接無條件 call）。執行者照 EXEC §④.3 字面做，偏差源自 EXEC 本身；SPEC-PLAN §2 要求搬位同樣適用。
- **F2 🟢** harness-c (3)「插 idx+2 零預檢」測緊一個 production 不可達嘅 plan；應換成真 `computeInsertNext` 搬位場景（修 F1 後做正控）。
- 報告 §④「偏離：無」、「helper body 逐行一致」屬實。

## 5. 側效應／風險
- Eric／Joy（iOS + HLS 名單）：每次 Play Next 插入（非搬位自前）多一次 `.m3u8` playlist GET（同 trackChanged 共用 `hlsPreflightSeenRef`，同 id 一 session 一次）；4xx/5xx 時提早換 progressive 並出 `hlsFallback via=preflight ctx=insertNext` beacon。尾 15 秒唔換、已 current 唔換。本地檔（file://）零 fetch。
- 非 HLS／Android 用戶：helper 第一句閘即退，零 fetch 零 TrackPlayer 呼叫；只多一次陣列讀。
- watchdog／native 互動：helper 唔掂任何 watchdog ref/tick；熱換用 remove+add 同既有 trackChanged 路徑完全同一機制。
