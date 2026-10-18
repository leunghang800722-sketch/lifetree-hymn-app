# ODELY-OPT 階段 ①尾巴 / ③ / ⑤ — Opus 獨立驗收（OPUS3，2026-10-18）

驗收對象：`9589f60`+`3a2f64f`（①尾巴）、`03bde97`+`6ade187`（③）、`2e0558e`（⑤）。
全部喺 `git worktree add --detach … 6ade187`（scratch）跑，唔讀 working tree App.js。冇改 code、冇 git 寫、冇部署、冇開模擬器、冇讀 secret／users.db。

## 判詞
| 階段 | 判詞 |
|---|---|
| ①尾巴 | **有條件過**（M-1、M-2 要喺 OTA 前補；其餘記錄） |
| ③ | **過**（逐字等價成立；只有死碼殘留） |
| ⑤ | **有條件過**（D-1 補一行即可） |

## 證據
1. **Harness（committed sha 6ade187 worktree）**：insertnext 66/0；H-A 14/0；H-B 26/0；react 5/5；usersync NEW 26/26、OLD(d74c483) fail 13、PREV(24e520a) fail 4〔(j)(k×2)(l)〕——同報告一致。
2. **①對抗場景**（自寫 `adv.js`，babel 真 module + mock MMKV，可逐 key throw）：
   - T1 store 全域 getString throw 連 enqueue 3 個 → pending 只剩最後 1 個（readPending 讀錯當 []，覆寫）。
   - T1b 只主 key throw → pending=[add1,remove1]；恢復後主隊 [9,add1,remove1,3]，次序保留、pending 清走 ✅。
   - T2 pending 有 op＋主隊 throw 時 flush → `drained=true`、零 fetch（舊版已係咁，非 regression）；恢復後推返 ✅。
   - T3 主隊 corrupt＋連續 5 次 flush（冇 enqueue）→ 5 條 `sync.outbox.corrupt-<ts>`，主隊仍壞；第一個 enqueue 先治好（之後 6 條）。T3b corrupt 後第一個動作係 enqueue → 主隊 [新 op]、備份原文 ✅。
   - T4 pending 有 op 時 `clearOutbox()`（= 登出／換帳戶）→ pending 仍在，下個帳戶 flush 推出 `POST favorites/42`。
   - T5 flush 重讀 throw 留低已推 pl_upsert，之後 pl_delete → 下次 flush 重推 PUT 收 `stale:true` → stale handler fire（PlaylistsContext.applyServerPlaylist 會將已刪清單 append 返本地）。
   - T6a 合併時 set 成功但 delete throw → 主隊 [remove1, add1, add2]（次序倒轉）。
   - loopGuard detail 最長 ~57 字元，backend `clientLog.js` detail 係 `String().slice(0,400)`；repo 內冇任何 ops script 解析 `outboxLoopGuard`/`outboxReadError` detail 做數字 ✅。
   - (e) `git show 9589f60` 對 `checkAuth`/`reportUnauthorized`/`break`/`_flushing`/`_pendingFlush` 零 +/- 行 ✅。
3. **Backend 冪等**（`backend/routes/me.js`）：fav_add `INSERT OR IGNORE`、fav_remove `DELETE`、pl_delete soft-delete UPDATE → 重推無害；pl_upsert 同版重推 → `existing.updated_at >= valid.updated_at` 回 `{stale:true, server}`（200，唔卡 flush，但有 client 副作用，見 L-2）。fav_add 對已下架 id 回 404 → flush 停（舊有）。限速 60/分鐘回 429 → 停（安全）。
4. **③ 逐字**：6 份 Cover／3 份 Heart 同新組件逐行比對——uri、S6 effect、fallback `musicNote`、`size*iconScale`（HymnList 0.42 照傳，其餘 0.5）、`styles.cover` 值（6 檔原值全部 `{borderRadius:6, backgroundColor:COLORS.cardLight, ...effects.coverInset}`）、hitSlop 10、stopPropagation、`useFavorites()||{}` 缺省、color/filled/size 20 全部相同；Admin 原 size 48 已傳 `size={48}`；唯一行為差 = Admin 多咗 S6 reset（只增唔減）。舊 `Cover`/`Heart` 零殘留引用。
   截圖（PIL，剔頂 160px）：#1–#4 **0 px（閾值 0 都係 0）**；#8 只差進度條＋時間（0:07 vs 0:06），bbox 實際 y1779–1901（報告寫 y1619–1741 係未加返 160 偏移，筆誤）；#9 隊列隨機，第一行一致，屬 App.js 未改版本。
5. **⑤**：13 個 App.js 行號／常數逐個核（@2e0558e，與 6ade187 App.js 相同）全部準確：72–99 註解、91–95 SheetTouchable、3848 `<BottomSheet`、158 `HLS_ENABLED`（4493 由 app-version 寫）、405 progressStore、2199/2210 寫入、1137–1200 預檢、1689/1714/1721/1778/1818/1841 常數值（3/15/30/4/6/2）、2147 sleepPollInterval（1000ms／2500ms）、2480 pollState、1640 理據、1708 前台 10 秒提示、4805 NATIVE_WD_V2。SheetShell 8 個 importer、三個 variant、OdeIcon 24×24/1.75、designSystem token、ops/deploy 四支 script、HANDOFF §2.2/§2.10、JAVA_HOME 路徑全部存在。冇密鑰／IP／電話／chat id。
6. **紅線**：`git diff d74c483 6ade187` 排除 md／截圖後只有 ①②③ 預期檔；icons／theme／plugins／patches／SheetShell／package.json／backend 零 diff；App.js 34 行（②，Opus2 已驗）冇觸及 gorhom／watchdog／HLS／kick／_TICKS／pollState。

## 發現（按嚴重度）
- **M-1（①，要補）`clearOutbox()` 唔清 side buffer。** 登出（AuthContext:193）／換帳戶（App.js 4336/4345 附近）只寫主隊 []；`sync.outbox.pending.v1` 留低，下一個登入者首次 enqueue／flush 會併入並用**佢個 token** 推上去（T4 實證）。觸發要先撞讀錯，機率低，但後果係跨帳戶寫資料。修：`clearOutbox` 加 `store()?.delete(PENDING_KEY)`。
- **M-2（①，要補）corrupt 備份 key 會無限增生。** `readOutboxMerged` 備份後當 [] 但**冇寫返主隊**；pending 空時 flush（每次 onActive）都再備份一次（T3：5 次 flush = 5 條），直到用戶做一個收藏／清單動作。每條＝成份壞 outbox 原文。修：備份後即 `writeOutbox(pending併入後嘅 q)`（或 [ ]）。
- **D-1（⑤，要補）IRON-RULES §三.5「唔准掂 native patch」只列 `patches/`、`withSwiftAudioExStallFix.js`，漏咗 `plugins/withSwiftAudioExStallWatchdog.js`** —— native 死線（前台 10s 偵測＋5s reload ≈15–16s；背景 20s＋8s）正正喺呢支 plugin。AI 照文件讀會當佢唔係紅線。同時建議 BLUEPRINT §六／IRON §三「native 16s」加「前台；背景約 28s」。
- **L-1（①）** `readPending` 讀錯同空唔分：store 全域 throw 時 pending 被最後一個 op 覆寫（T1，丟 n-1 個）。若 MMKV 全壞 set 亦多數 throw，實際增量有限。
- **L-2（①）** 報告「op 對 server 冪等」對 pl_upsert 唔完全成立：重推回 `stale` → `applyServerPlaylist` 用 server 版覆蓋本地；若期間已本地刪除該清單會被 append 返（殭屍清單，直到下次 pull）。要讀錯＋重推＋刪除三件同時先撞。
- **L-3（①）** 合併半失敗（set 成功、delete throw；或 set throw 後有新 op）會令 pending 舊 op 排喺新 op 後面（T6a：add→remove 變 remove→add）。極罕。
- **L-4（①，舊有）** flush 起手主隊讀錯 → `drained=true`（T2），onActive 會照 pull 覆蓋本地；op 冇丟，下次推返。建議日後讀錯回 false。
- **L-5（①）** UI `outboxStore`（useOutboxLength）唔計 pending；`getOutboxLength()` 有計 → 兩個數可以唔同。只影響顯示。
- **L-6（③）死碼（只報告）**：`styles.cover` 定義喺 HymnList／Library／PlaylistDetail／SharedPlaylist／AdminAddHymn 已冇人用（Mine 仍被 `plCover` 用）；`Image` import 喺 HymnList／Library／Mine／PlaylistDetail／SharedPlaylist 冇用；HymnList `useState`/`useEffect` import 冇用。
- **L-7（③/⑤）** App.js 仍有同名本地 `CoverImage`/`FavHeart`（播放器版，冇 S6 reset），同 `src/components/` 撞名，易誤 import；建議 BLUEPRINT 加一句。App.js 版保留理由（getAlbumCoverUrl、style 推 size、hitSlop 12、padding、舊色常數＋App.js 同時被階段④改緊）合理。
- **L-8（⑤）** v117 嘅「overlay 用 `bottom:0` 唔用 `height:SCREEN_HEIGHT`」冇帶入 v2（code 仍係 bottom:0）。
- **N（③）截圖證據天生弱**：純 refactor 前後 0 px，同「兩次用同一個 build」結果一樣；before（09:07–09:08）／after（09:09–09:10）相隔約 1 分鐘，build 產物已清，provenance 無法獨立核實。等價性主要靠上面逐字比對，截圖只屬佐證。#5–#7 未截：三處用同一組件、size 傳值同原本一致（52/52/48）→ 結構上等價，風險低。opus-verify 帳號憑證位置喺 memory 有記（指向 `.claude/settings.local.json`），報告「搵唔到」唔準確；本驗收無權讀 secret、亦唔准開模擬器，所以冇補截；#7 要 admin，opus-verify 是否 admin 未核。

## 執行者 6 點唔確定 —— 逐點答
1. 前台 5s：文件冇寫 5s 數字，冇錯；5s 係 native reload 窗（plugin），見 D-1。
2. native 16s 只靠註解：plugin 原始碼確認前台 10＋5，背景 20＋8 → 補 D-1。
3. SheetShell 用 Modal vs REDESIGN：REDESIGN §6.1.5「Modal 做清單」教訓指播放清單，播放清單仍係 inline gorhom；SheetShell 係其餘面板 → 冇矛盾。
4. 行號漂移：13 個今日全部準；階段④改緊 App.js 會漂，文件已寫「以函數／常數名為主」，可接受。
5. 額外紅線（VPN、401、buildNumber、localhost:3001）：全部同 memory／HANDOFF／CLAUDE.md 一致，冇矛盾。
6. OTA 命令唔寫原文：正確做法（只指 gate script）。

文件質素：Eric 睇「乜嘢／點解／要乜程序」三段式睇得明；AI 角度最大風險就係 D-1 漏列。

## 側效應
- scratch worktree `opus-opt3/wt`（detached 6ade187，用 symlink 借 node_modules）—— 已 `git worktree remove`。
- 唯一寫入 repo 檔：本文件。冇起 process、冇 kill、冇開模擬器。
