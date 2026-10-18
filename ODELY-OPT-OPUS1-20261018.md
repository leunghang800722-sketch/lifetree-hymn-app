# ODELY-OPT 階段① 獨立驗收（Opus）2026-10-18

對象：b6b98e3（react-harness 基準修）、0c4fab4（userSync 1a/1b）、3c03c47（usersync-harness + 報告）。
自寫 adversarial harness：scratchpad `opus-opt1/adv.js`（babel 真 module，NEW vs 負控 d74c483，fetch 次數設 60 上限防死循環）。

## 判詞：有條件過

1a 主修（飛行期間 enqueue 唔再被閉包快照蓋走）成立，負控成立；但新寫法引入兩個**舊版冇嘅**失敗模式（M1/M2），OTA 前要先補。

## 證據
1. diff 逐行：`opKey` 對應 fav_*→hymn_id / pl_upsert→playlist.id / pl_delete→id 正確；`checkAuth`/`reportUnauthorized`/`break`/`_flushing`/`_pendingFlush` 零改動（diff 只有 context）。uSES：`externalStore.useStore = useSyncExternalStore(subscribe,getSnapshot)`，snapshot 只喺 setState 換 ref，React 19.2.3 / RN 0.85.3 安全。
2. adversarial（NEW / OLD）：
   | 場景 | NEW | OLD |
   |---|---|---|
   | 飛行中連 enqueue 5 個唔同 op（含 pl_upsert/pl_delete/fav_remove） | PASS 6 個按序推、outbox 空 | FAIL 只推 1 |
   | 飛緊 pl_upsert 再 enqueue 同 playlist 兩次（ts 遞增） | PASS 推 [v1,v3] | FAIL 只推 v1 |
   | fav add/remove/add 同 hymn 唔同 ts | PASS POST,DELETE,POST | FAIL 只 POST |
   | 同一毫秒 pl_upsert 取代飛緊嗰個 | **FAIL v2 丟** | FAIL |
   | 同一毫秒 fav add→remove→add | **FAIL 最後 add 丟** | （丟晒） |
   | runOp fail + pending flush | PASS 補跑一次、outbox 保留 | PASS |
   | 401 | PASS reportUnauthorized 一次、outbox 保留 | PASS |
   | MMKV set 持續 throw，3 個 op | **FAIL 1,2,1,2… 撞 60 次上限（死循環）** | PASS 3 次完 |
   | 飛行中 getString 一次 throw（readOutbox→[]） | **FAIL op2/op3 被清走** | PASS 保留 |
   | 飛行中 clearOutbox（登出/換帳戶） | PASS 唔復活 | FAIL 復活並推 op2 |
   | 飛行中新 op 之後 fail → drained | PASS false、op 保留 | （N/A） |
3. react-harness：b6b98e3 scenarios 只改 notifyHymnsChanged 嘅 fetch mock 加 `text()`，斷言零改。把**修前** harness（b6b98e3~1）同修後 harness 各自對 c9bd715 源碼跑：輸出逐字相同——killerPath FAIL、versionChanged FAIL（parent 卡 loading:true）。⇒ versionChanged 紅係舊版本身 bug（同一個 broadcast 窗口），**唔係**今次修改引入嘅假陽性。修後 harness 對 HEAD 5/5。
4. 重跑全綠：react 5/5、insertnext 66/0、H-A 14/0、H-B 26/0、usersync NEW 14/14（OLD fail 6）。
5. `git diff d74c483 HEAD --stat` 12 檔＝userSync/useOutboxLength/react-harness/usersync-harness/報告/執行單；gorhom/OdeIcon/designSystem/watchdog/backend/App.js 零；`.tmp/` 有 .gitignore、零 tracked；src/tools working tree 乾淨。
6. caller：FavoritesContext/PlaylistsContext 照 fire-and-forget；`drained` 語義收緊（飛行期間新 op 都要推完先 true）對 App.js onActive「drain 先 pull 覆蓋」更安全；PlaylistDetailSheet 嘅 `getOutboxLength()` 照讀 MMKV，冇變。

## 發現（按嚴重度）
- **M1（中，regression）** MMKV `set` 持續 throw 且 outbox ≥2 個：`writeOutbox` 吞錯，下一輪 `readOutbox()` 讀返舊持久化內容（已推嘅 op 仲喺度），只剔今輪嗰個 → 兩個 op 輪流無限重推（每輪一個網絡請求，冇終止條件）。舊版用記憶體 `rest` 一定終止。
- **M2（中低，regression）** 飛行期間 `readOutbox()` 回 `[]`（getString throw 或 JSON 壞）→ `next=[]` → `writeOutbox([])` 清走所有未推 op。舊版保留。
- **L1（低，非 regression，修法未完全）** 身份靠 `ts` 毫秒；同一毫秒同 key 同 op 嘅新 op 會被當成剛推完嗰個剔走。現行 caller 全部係人手撳，實際機率近零。
- **L2（低）** `outboxStore` 喺 module import 時 `readOutbox()`，MMKV 初始化提早到 import 期（有 try/catch，失敗只會 store 初始 0）；set 失敗時 store 長度會同持久化值唔一致（只影響 AccountScreen 顯示）。
- 建議修（細）：flush 內保留本輪已推 op 清單 `done`，`next = latest.filter(x => !done.some(d => sameOp(x,d)))`（醫 M1）；readOutbox 分清「讀錯」同「真空」，讀錯就退返 `queue.slice(1)`（醫 M2）；enqueue 加 `seq` 單調計數入身份（醫 L1）。

## 側效應
- 正面：飛行中 clearOutbox（登出/換帳戶）唔再被舊快照復活推上 server。
- 同一 flush 內持續推飛行期間新 op：每輪都 await 網絡，唔會 CPU 死循環；enqueue 停咗就停。
