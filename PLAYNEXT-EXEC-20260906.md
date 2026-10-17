# Play Next（下一首播放）執行單 2026-09-06

Eric 需求：任何一首歌可以直接插入現正播放嘅 queue，位置 = 現正播放嗰首之後（第二位）；再加一首又係插第二位，之前嗰首推落第三（後插先播）。
Eric 已接受三個 default：① 歌已喺後面即將播放清單 → **搬上嚟做下一首**，唔重複；② 冇歌播緊 → **當即刻播**（等同 playSingle）；③ 入口只喺「加入到清單」sheet 頂加一行「⏭ 下一首播放」。
流程：Fable 規劃 → Sonnet 執行 → Opus 驗收 → OTA。基準 HEAD `ce3af1c`（SheetShell 已落地，AddToPlaylistSheet 已換殼）。

## 0. 紅線
- 🔴 唔掂 PlayerProvider 起播/stall/watchdog/nudge/rescue 任何邏輯（App.js 嗰啲 `handleMidStreamStall`/`handleBufferingStuck`/watchdog tick/threshold）。
- 🔴 唔改 `playQueue()` 語義（佢係「重建成個 queue 並起播」）；Play Next 係**新函式** `insertNext(hymn)`，唔經 playQueue，唔中斷播放。
- 🔴 queueRef / setQueue / native queue 三者要同步（memory §3.5 教訓：索引對唔上會顯示錯歌名）；`autoRadioFromRef`/`insertBoundaryRef` 同 state 一齊改。
- 🔴 唔擴大本地音訊副本；prefetch 照舊滾動窗口（`queueRef.current.slice(idx+1, idx+4)`）自然會暖到新歌，唔另加預載。
- 🔴 唔掂 SheetShell 殼；AddToPlaylistSheet 只加一行。

## 1. 實作
### 1.1 PlayerProvider：`insertNext(hymn)`（App.js，放喺 `playSingle` 附近，掛入 context value）
1. 冇 queue / 冇 current track（`queueRef.current.length === 0` 或 player idle）→ `return playSingle(hymn)`。
2. `curIdx = currentQueueIndexRef.current`；`cur = queueRef.current`。
3. 如果 `hymn.id` 已經係 `cur[curIdx]`（播緊）→ toast「播緊呢首」，return。
4. **去重搬位**：喺 `cur.slice(curIdx+1)` 搵同 id；有 → 由舊位刪走（JS + `TrackPlayer.remove(oldIdx)`）；記低 `removedIdx`。
5. 插入位 `insertAt = curIdx + 1`：JS `newQ = [...cur.slice(0,insertAt), hymn, ...cur.slice(insertAt)]`（如 step 4 刪咗舊位，用刪後嘅陣列）；native `await TrackPlayer.add(toTrack(hymn), insertAt)`。
6. 邊界調整：`autoRadioFrom`：if `!= null && autoRadioFrom >= insertAt` → `+1`（step 4 刪走嘅舊位如果 `< autoRadioFrom` 要 `-1`）；`insertBoundary`：同樣規則（有值且 ≥ insertAt → +1）。**先 ref 後 state**（同 playQueue 做法）。
7. `queueRef.current = newQ; setQueue(newQ)`；`currentQueueIndexRef` 唔變（插喺後面）。
8. toast「已加到下一首播放」。
9. 全程 try/catch；失敗要 rollback JS 陣列（native 已 add 成功而 JS 失敗嘅情況要對返 native queue：用 `TrackPlayer.getQueue()` 重讀對位）。
10. **核** native 換 URL 機制（App.js ~663/1242/1285 `TrackPlayer.add(freshTrack, idx)` swap）：佢哋用嘅 idx 係咪即時由 `queueRef`/`currentQueueIndexRef` 計——插入後索引 +1 唔會令佢哋換錯首；如果有用「快照 idx」嘅 async path，要加 guard（比對 track id 先 swap）。**寫入報告**。
11. Repeat / shuffle：repeat-one 模式插入後行為 = 照插（用戶主動）；shuffle 模式如果會重排 queue（`toggleShuffle` 讀 queueRef）→ 插入嘅歌係 head 部分，核 shuffle 唔會亂咗佢嘅位（唔要求完美，寫低行為）。
12. 記一條 beacon：`sendClientLog('playNext', { hymnId, detail: 'moved=<0|1> at=<insertAt> qlen=<n>' })`（用 W1 嘅 `src/clientLog.js`，唔經 logDiag 閘）。

### 1.2 AddToPlaylistSheet（只 add mode）
- 列表頂加一行「⏭ 下一首播放」（icon 用現有 `nowPlaying`? 已刪——用 `skipNext`/`play` 現有 icon，唔准新畫 icon 除非 odeIcons 冇合用），只喺 `queue.length > 0 && 有 current track` 先顯示；撳 → `insertNext(target)` → `close()`。
- 分隔線同現有清單行視覺一致；唔改 create/rename mode。

### 1.3 Queue UI
- 播放清單 sheet（gorhom）已用 `insertBoundary` 畫「即將播放」線：插入後 boundary +1 應該令線仍然畫喺正確位。**核實**：插播歌（playSingle 場景）+ Play Next 混合時線嘅位置；如果 Play Next 場景根本冇 boundary（`insertBoundary == null`）就唔畫線——可接受，寫低。

## 2. 驗證（執行者出證據）
| 項 | 證據 |
|---|---|
| H1 harness（babel 真 module 或抽取 `insertNext` 純函式部分做 unit）| 情境：(a) 空 queue → playSingle 被 call；(b) 正常插入 curIdx=2, len=6 → newQ 長度 7、位置 3 係新歌、autoRadioFrom 4→5、insertBoundary null 不變；(c) 連插兩首 → 次序 [cur, B, A, ...]；(d) 歌已喺 index 5 → 搬到 3、長度不變、autoRadioFrom 唔變（刪一加一）；(e) 歌已喺 autoRadioFrom 之前（head）→ 搬位 + autoRadioFrom 不變；(f) 播緊嗰首 → 唔改、toast；(g) native add throw → JS 唔變 |
| H2 靜態 | `grep -n "insertNext"` 出現喺 context value + AddToPlaylistSheet；watchdog/stall 函式零 diff（`git diff` 唔准掂 `handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog` 相關行——逐行核） |
| H3 sim smoke（iOS 一次；唔准 AVD）| 播一首（有自動尾巴）→ 詩歌庫 → 另一首撳「加入到清單」→「下一首播放」→ 開播放清單 sheet 截圖：新歌喺第二位、播緊嗰首冇斷（position 繼續行）；撳 ⏭ → 播到新歌；再插一首 → 第二位、舊嗰首第三；插已喺後面嘅歌 → 搬上嚟唔重複；歌名/封面顯示正確（索引同步正控） |
| H4 beacon | backend jsonl 見 `playNext` row 帶五欄 |

## 3. 交付
Commit（pathspec）：App.js 一個、AddToPlaylistSheet 一個、harness + 報告 `PLAYNEXT-REPORT-20260906.md` 一個。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。唔部署。
