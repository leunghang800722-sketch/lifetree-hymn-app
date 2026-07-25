# Fable 5 監督記錄（growLibrary 擴歌庫 + fetchLyrics 歌詞入庫）

> 由 HANDOFF.md §十 搬出嚟嘅**滾動 log**(2026-07-25 起獨立成檔)。
> **監督 session 之後 append 落呢度,唔好再寫返入 HANDOFF.md** —— 呢類定期
> check-in 記錄會令主文件無限膨脹,主文件淨係留「而家點」同「唔好行返轉頭」。
> 落地嗰個結論如果係一條**新嘅永久規矩**(唔止係今次嘅診斷),先另外寫返入
> HANDOFF.md 嘅紅線章節。

---

## 十、Fable 5 監督記錄（growLibrary 擴歌庫）

> 2026-07-24 起，Eric 指定開一個 Fable 5 session 長期監督 growLibrary，
> 每 3 個鐘 check 一次（辦公時間 Mon-Sat 10:30-18:30 跳過）。
> ⚠️ 分工（2026-07-24 同日修正）：Fable 5 淨係「監督＋診斷＋開方案」，**唔落手改 code**；
> 方案 send 俾「夜晚慢速擴歌庫排程」Sonnet session（local_fa531849-cb75-4f5f-b75f-bf338f1ac858）
> 落地實測，搵唔到就記錄喺呢度等 Dispatch 安排。
> （下面 11:20 嗰次係分工修正**之前**做嘅，改動已交返俾 Sonnet session 覆核接手。）

### 2026-07-24 11:20 第一次 check —— 發現並修復「discover slot 卡死」問題

**現況總結：** DB 539 首（粵185/國283/英62/兒9）。launchd job 正常每 15 分鐘行，
辦公時間封鎖窗運作正確（今朝 10:30 起正確跳過）。今朝 08:00-10:24 增長正常（~20-33 首/小時）。

**發現嘅問題（今晚 18:30 解封後必定重演尋晚成晚停擺）：**
尋晚 7-23 23:24 至今朝 08:00，discover 三個語言 slot **全部**俾零產出頻道霸死，成晚 0 首：
- 根因：`runDiscoverAll` 嘅「已收錄最少優先」規則對**永遠零產出**嘅頻道冇免疫力 ——
  404 handle / 全講道頻道 / listing 攞晒嘅頻道，count 永遠最細，永遠贏個 slot。
- 粵語 slot：`@worshipool`、`@gyro_ufireband` 兩個 404 handle 輪流霸位
- 國語 slot：台北611靈糧堂（幾乎全講道，篩走晒）
- 兒童 slot：Saddleback Kids（近 30 條片全部係兒童節目/講道，全篩走）
- 另外 curate pool 已耗盡（粵 0 / 國 0 可揀），所以 discover 係唯一增長引擎，卡死 = 全停。

**已落地嘅修復（全部實測 confirm）：**
1. `worshipGroups.js`：U-Fire GYRO 壞 handle → 改用已驗證嘅 `channel/UCX96y8yd_kRVwxWTQxrjhRA`
   （實測 list 到 Gyro Worship 敬拜歌）。
2. `worshipGroups.js`：WorshiPool 壞 handle 拆走（channel: null）。已搵到正身
   `UCBdH0Y3bL8UsOzjrY4CzBAw`（記咗喺註解），但原註明「平台性質要人手審視先好開」，
   所以等 Eric 拍板先填返。
3. `growLibrary.js` `runDiscoverAll`：加 fallthrough —— 一個頻道連一條都試唔到
   （listing 失敗/冇新片/全部俾分類篩走，即 budget 一啖未使），即場跳去同語言
   下一個「已收錄最少」團體，每語言每 run 最多試 3 個頻道。有真.試過先算用咗
   slot，所以唔會加大對 YouTube 嘅實際請求量。
   實測（--dry --ignore-office-hours budget 3）：Saddleback 試唔到 → 自動跳去
   Kids on the Move → 成功收錄 1 首。兒童 slot 由此解鎖。

**注意：** 兩個檔案嘅修改**未 commit**（同日早上「夜晚慢速擴歌庫」session 喺同一批檔案
有未 commit 改動，唔想夾埋人哋嘅 commit）。launchd 直接跑 working tree，修復已即時生效。

**監督機制：** 本 session 已設 3 小時一次嘅自我喚醒（cron 47 分 */3 小時，辦公時間
自動跳過唔查）。Session-only 排程，7 日後過期；如果發現監督斷咗，要重開 Fable 5
監督 session。

### 2026-07-24 ~11:25 落地 session 覆核 + commit(local_fa531849)

收到 Fable 5 交接 message,逐項獨立驗證(冇照單全收):
- **U-Fire GYRO Band 新 handle**:自己再用 yt-dlp 對比新舊兩個 handle
  ——舊 `@gyro_ufireband` 確認 404,新 `channel/UCX96y8yd_kRVwxWTQxrjhRA`
  確認有真.敬拜歌內容(「主的喜樂是我力量」「按時」等)。
- **fallthrough 邏輯**:冇淨係信 Fable 5 份報告,自己額外跑咗 5 輪獨立
  `--dry` 測試 ——611靈糧堂/Saddleback Kids 每輪都準確「試咗0條→跳去
  下一個」,三個語言每輪都出到歌,零異常。
- **WorshiPool 確認冇被誤開**(`channel: null`),**`hymnDb.js` 確認未被
  呢批改動掂過**(我自己嗰批 filter 修復完整保留)。
- syntax check + `--test-office-hours` 自測 12 case 全過,DB 冇殘留 lock。

**結論:認可,已 commit(`efad6e0`)。** 逐個檔案 add(冇用 `git add -A`),
只加 growLibrary 相關嘅 11 個檔案,其他 session 嘅 untracked 文件
(AUTOPLAY-MIX-PLAN.md 等 + `memory/`)冇夾埋。

以後合作模式已知悉:Fable 5 每 3 個鐘監督診斷、開方案 send message 過嚟,
我負責落地執行 + 實測 + commit。

### 2026-07-24 11:40 監督範圍擴大：夾埋 fetchLyrics（歌詞入庫夜晚隊列）

Eric 指示歌詞 project 都納入同一個 3 小時 check loop。執行 session：「全庫歌詞補齊規劃」
（local_fdeacc3b-f13f-454c-88cb-d9dbf9658197）。分工同 growLibrary 一樣：Fable 5 淨係診斷開方案。

**Baseline（2026-07-24 11:40，read-only 查證）：**
- launchd `com.hymnapp.fetchlyrics` 每晚 04:20 一次；**已確認載入新 args（CC 25 + OCR 20）**，
  唔使擔心「改咗 plist 冇 reload」。
- 今朝 04:20 嗰次仲係 STAGE 1 舊 code：淨係 CC 層，12 首全部 cc:miss，0 命中
  （同已知「CC 命中率 ~0%」吻合），冇行 OCR。
- DB 歌詞現況：curated 649 首入面 638 首未有歌詞；lyrics_status = none 1678 / draft 1 / verified 10；
  lyrics_source = manual 10 / ocr 1（嗰 1 首 ocr 應該係執行 session 今日測試）。
- cc:miss 存貨而家係 0 —— 係已知 P0 嘅後遺（之前三晚 36 個標記俾無鎖寫入冚咗，
  1e5cb11 已修，檔頭註明唔使人手補救）。**唔係問題**：STAGE 2 設計係同一個 run 入面
  CC 層先行（產 ~25 個新 cc:miss）→ OCR 層即晚食，CC 25 > OCR 20 唔會斷糧。
- **今晚（07-25）04:20 係第一次 STAGE 2 + 新 quota 壓測**。07-25 朝早 ~06:47 / ~09:47
  兩次 check 要特別確認：兩層跑晒、OCR 實收幾多、質素抽查（lyrics_draft 內容係咪正常）、
  有冇撞 block、09:00 前收唔收到尾。

**2026-07-25 01:20 check 過，正常（DB 709 首／歌詞 draft 1 首）。**
- growLibrary:好轉得緊要 —— 尋日 539 → 709(+170),fallthrough 修復實戰生效(log 見到
  零產出頻道即場跳、budget 傳落去;Hillsong Kids 收 3 首;兒童 9 → 84)。launchd 四個 job 都在。
- fetchLyrics:未到 04:20 未開波。尋朝 12 個 cc:miss 標記唔見咗 —— 查過**唔係新問題**:
  尋朝嗰次 run 係 P0 修復(1e5cb11, 12:32 先 commit)之前嘅舊 code 行嘅,無鎖寫入俾日間
  growLibrary 冚咗係預期,檔頭注明 self-healing(source 變返空自動重入 CC 隊)。
  而家 writeLyricsRow 寫入路徑(攞鎖→重開最新 DB→UPDATE 一行→save→放鎖)驗過係啱。
- 觀察項(未係問題):國語 discover 有時三個候選頻道嘅近 30 條片全部俾分類篩走(試 0),
  --playlist-end 30 窗口慢慢耗盡,日後增速自然放緩屬正常,唔好誤判做故障。
- 今晚 04:20 STAGE 2 + CC25/OCR20 第一次壓測,下兩次 check(~03:47 / ~06:47)重點跟進。

**2026-07-25 04:20 check 過，正常（DB 739 首／歌詞 draft 1 首，壓測開波前）。**
- growLibrary:709 → 739,每 15 分鐘 run 穩定 +2-3 首(~11/小時)。國語/兒童 slot 嘅
  30 條 listing 窗口暫時耗盡(fallthrough 三個候選都試 0 係頻道冇糧,唔係卡死),
  粵語仲有糧照收。屬之前注明嘅自然放緩,唔係故障。
- checkDeadLinks 04:00 例行跑緊(limit 150,~20 分鐘),04:12 growLibrary 攞唔到鎖跳過
  一次係設計內互斥。預計 ~04:25 前放鎖,fetchLyrics 04:20 壓測開波頭幾首最多等陣鎖,
  writeLyricsRow 有 5 分鐘 retry,冇風險。
- 下次 check(~07:47)睇壓測結果:兩層跑晒未、OCR 實收、質素抽查。

### 🔴 2026-07-25 07:30 壓測失敗:兩個 P0 bug,方案如下,等 Dispatch 派俾執行 session
（send_message 喺 unattended turn 用唔到，所以記錄喺度。growLibrary 本身正常:739→769,~10/小時。）

**現象：** 04:20 CC25+OCR20 第一次壓測 —— CC 層正常標咗 25 個 cc:miss；OCR 層 04:23:19
「冇更多 cc:miss 嘅歌等 OCR」即刻收工，一首都冇做；而家 DB 入面 25 個標記全部消失
（lyrics_source 得返 空758/manual10/ocr1）。唔修聽晚 04:20 一模一樣重演，歌詞產出永遠 0。

**Bug 1 — fetchLyrics.js OCR 層用 stale snapshot 揀候選（派「全庫歌詞補齊規劃」session）**
- 根因：`main()`（line 492）開波攞一個 04:20:00 in-memory snapshot；CC 層啲 cc:miss 經
  `writeLyricsRow`（自己 fresh connection）寫落碟，stale snapshot 見唔到；line 508
  `runOcr(db, ...)` 傳入 stale snapshot → `pickOcrCandidates`（line 416）查到 0。
  「同 run CC 產糧 → OCR 食糧」設計從來冇 work 過。檔頭「揀候選用開頭 snapshot 就得」
  嗰句對 OCR 層唔成立，因為 OCR 嘅糧係同 run CC 啱啱寫嘅。
- 修法（細改）：`runOcr()` 開頭重新 `db = await openDb()` 先揀候選（改喺 runOcr 入面，
  一次 cover line 501/508 兩個 call site）。讀唔使攞鎖。
- 驗證：手動細額度行（--cc-budget 2 --ocr-budget 1，或手動 UPDATE 一首做 cc:miss 淨行
  OCR mode），確認 OCR 見到並處理；聽朝 04:20 log OCR 實收應 >0。

**Bug 2 — checkDeadLinks.js 揸鎖 25 分鐘＋stale 舊副本 final write 冚人標記（派「夜晚慢速擴歌庫排程」session）**
- 時序實證：checkDeadLinks 04:00 攞鎖揸住成個 run（--limit 150×3s ≈ 25 分鐘，line 38
  acquire → line 107 saveDb 先放）；hymnDb `LOCK_STALE_MS`=20 分鐘 → 04:20 fetchLyrics
  writeLyricsRow 當死鎖搶咗（所以寫到 25 個標記）；checkDeadLinks ~04:25 用 04:00 嘅
  in-memory 舊副本 final `saveDb(db)`，冇驗證自己仲係咪鎖主 → 標記全冚（log:
  「[2026-07-24] wrote hymns.db」）。呢個係 fetchLyrics P0 同款問題,今次輪到 checkDeadLinks。
- 修法（跟返 fetchLyrics P0 確立咗嘅 pattern）：慢工序唔准揸鎖 —— 無鎖 read snapshot
  揀 150 首候選 → probe 晒（慢，無鎖，結果collect喺記憶體）→ acquireDbLock →
  fresh openDb → 按 id 逐行 UPDATE（status/last_checked/fail_streak）→ saveDb →
  release。鎖窗由 ~25 分鐘縮到 <1 秒，stale-steal 唔會再觸發，last-writer-wins 消失。
- 可選加固：saveDb 前驗 token 仲係咪自己（hymnDb 可以 export 一個 ownership check）；
  LOCK_STALE_MS 唔使郁（pattern 修正後根本唔會揸咁耐）。
- 驗證：手動細 --limit 行一次，中途由第二個 process 寫個 test marker，confirm final
  write 冇冚走佢；聽朝 04:20-04:25 window 過後 cc:miss 標記應該仲喺 DB。

**優先次序：** Bug 1 唔修 = OCR 永遠 0；Bug 2 唔修 = 標記日日俾冚、仲有機會冚埋第啲
writer 嘅嘢。兩個都係細改，建議今日內落地，聽朝 04:20 壓測第二次自動驗收（我會 check）。

**2026-07-25 10:25 check：兩個 P0 已落地生效 ✅；新增兩個非緊急觀察項＋方案（見下）。**
- 兩個 P0 今朝已修（7bfe055 stale-steal 搶生鎖＋OCR stale snapshot；742485e 鎖 2 小時硬上限），
  執行 session 仲補行咗 OCR：draft 1 → 19（ocr 16＋whisper 3），cc:miss 存貨 7。壓測目標達成。
  修法方向同我開嘅方案唔同（鎖端 fix 而非 checkDeadLinks 重構）但覆蓋咗觀察到嘅失效模式：
  搶唔到生鎖 → 冇 mid-run 寫入 → deadlink 尾段 stale write 冇嘢可冚。收貨。
- growLibrary job 本身正常（launchd 在位、log 無 error、fallthrough 正常）。

**觀察項 1 — OCR 質素參差（派「全庫歌詞補齊規劃」session，非緊急但要早過 backlog 谷大先處理）：**
抽 4 首最新 draft：1 首乾淨（迦南詩歌），3 首有嚴重垃圾 —— 字認錯（「基恩敬拜」→「蒸恩敬拜」、
「恩典」→「息典/悬典」）、OCR 碎片（"ctitceorship"）、仲捕捉埋 YouTube UI 文字（「訂閱/已訂閱」）
入 draft。建議方案（任擇，執行 session 判斷）：① 抽 frame 時避開頭尾（訂閱 overlay 通常喺
開頭/結尾）；② OCR 後加一步平價 LLM 清洗/重組（cc 層本身有 draft→verified 流程，喺入 draft
前清一次可以慳好多人手）；③ OCR 出字低於信心閾值就直接撞 whisper（而家係「唔夠字先撞」）。
驗收標準：連續一晚 20 首 draft 抽查 ≥8 成係可讀歌詞、無 UI 文字。

**觀察項 2 — growLibrary 飽和天花板（派「夜晚慢速擴歌庫排程」session）：**
07-25 07:04 起增長 0（停喺 769）。所有語言嘅 discover 候選頻道「最新 30 條」窗口全部耗盡
（fallthrough 正常試晒 3 個候選都係 0 條合格）——唔係 bug，係 listChannelVideos 嘅
`Math.max(budget*5, 30)` 淨係攞到頻道最新嗰 30 條，舊片永遠掂唔到。方案建議：
① 對「fresh=0 或全篩走」嘅頻道自動加深 listing（30 → 100 → 200 遞進，--flat-playlist
一個 request 就攞到，成本極低）；② 同步考慮幫 inPool:true 嗰批團體（ACM/玻璃海/讚美之泉等）
重行 search import 補 curate pool（而家粵/國 0 首可揀）。唔急（辦公時間封鎖窗到 18:30，
之前都冇得 run），但今晚 18:30 前唔落地嘅話今晚增長會係 0。
