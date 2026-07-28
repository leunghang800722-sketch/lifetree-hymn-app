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

**2026-07-26 09:xx 落地 session 覆查「觀察項2」— 真正主因唔係 listing 深度，係 filter 誤殺（local_fa531849）：**
Eric 直接問點解全日 0 增長，逐個排除（唔係封鎖窗、唔係 job 冇 run），查到粵/國/兒童
discover 每個 tick 都準時觸發，但「已收錄最少優先」揀中嘅頻道**大量 0 條試得**，同觀察項2
講嘅「listing 窗口耗盡」表徵一樣。深查落去，真正主因係另一樣，比 listing 深度嚴重好多：
- **`isCompilation()` 嘅 `專輯`/`album`（冇「全」字）誤殺咗 backlog 78 首正常單曲** ——
  「OO Track N of Mini-Album」呢類係「呢首歌出自邊隻碟」嘅正常署名，唔代表條片本身係
  成隻碟。查證：現有 curated 全庫入面「專輯/album」命中數 = **0**（呢個 keyword 由一開始
  已經喺度，即係話呢個 filter 靜靜哋擋咗好耐都未必淨係今日）。已改成淨係擋 `全碟`/`全專輯`
  （加返英文對應 `full album`），regression 對 799 首 curated 做過，0 誤殺；78 首入面
  73 首而家過到（剩低 5 首係真.合輯，繼續正確擋住）。
- **discover 嘅 fallthrough 上限（`attemptsLeft = 3`）冚唔到細候選名單** —— 國語得 5 個
  未吸納團體、兒童得 4 個，3 個試晒都跳唔出個「持續低產 bottom-3」（611靈糧堂/Asia for
  JESUS/台北復興堂；Saddleback/Listener/Hillsong Kids），永遠去唔到健康嘅 611 Worship /
  Kids on the Move。改成「呢個語言有幾多候選就試幾多」，冇上限但都唔會加大 resolve 呼叫量
  （淨係列表 call，攞唔到嘢嘅唔算 resolve）。
- **Listener Kids / Saddleback Kids 個別歌名帶「Compilation/Greatest Hits/1 Hour」**——
  補埋 `full album`/`1 hour`（單數，原本 `hours` 得複數形式）先擋到。

**結果：769 → 799（+30），真實 kickstart 逐輪 confirm 過，粵/國兩個語言由完全停擺變返正常
增長。** 兒童（88 首）而家 4 個團體 30-deep listing 全部 fresh=0，觀察項2 講嘅「加深
listing」呢個方案**對兒童仍然有效、未落地**，建議下一個落地 session 跟。粵/國由於今次
filter fix 令健康頻道(611 Worship/Endless Worship/CantonHymn 等)重新收得，短期內未必再撞
listing 深度樽頸，暫時擱置咗遞進加深呢個方向。

**2026-07-26 09:xx 落地 session 執行兒童組方案（local_fa531849）：**
Fable 5 診斷 + 已驗證嘅 A1/A2/A3/B 全部落地：讚美之泉兒童 channel null→`@StreamofPraiseKids`；
新增 CJ and Friends、Yancy；discoverFromGroup 淺層 fresh=0 先加深到 200。反面清單
（@gofishguys/@amberskyrecords/@orangekidsmusic 404；@hkacm_worship 成人主頻道）全部冇加。
過程中額外實測踩到：Yancy 頻道夾雜訪談片（"Convo about Hosting..."），加咗 `convo`/`interview`
keyword（backlog regression 0 誤殺）。真實 kickstart（唔係 dry run）confirm：兒童 88→94，
歌手數 4→6，全庫 799→841，regression 0 誤殺。CJ and Friends 已驗證會揀中（dry run 2/2 成功）
但真實 run 呢輪未輪到，下一輪隨機 tiebreak 應該會到。

## 🔴 2026-07-26 10:30 Fable 5 check:發現內容污染(P1,live 影響 App)+ 方案(派「夜晚慢速擴歌庫排程」)

**兩個 project 大體極好:** 全庫 863(粵343/國361/兒97/英62),兒童方案落地後 88→97 增長中;
fetchLyrics 尋晚 OCR 20/20 全數達標(05:26 完,窗口內),draft 19→39。

**但質素抽查揪出 P1:兩個粵語團體 handle 指咗去完全唔相干嘅頻道,20 首垃圾已 curated live:**
- `@singforgod`(SingforGod薪火敬拜)實測係**私人家庭片頻道**("my sweet"/"pe doo.m2v"/
  "20060714 180527")→ 已收 7 首垃圾("clever child"/"Karen New Year"/"Bible"等,全標粵語)
- `@redseamusic`(Redsea Music)實測係**巴西葡語翻唱頻道**("Lugar Secreto"/"Bom Bom Pai...
  Tradução")→ 已收 13 首(葡語敬拜,全標粵語)
- 全庫 audit(粵/國 curated 標題含 CJK 檢查):**淨係呢兩個係 100% 非中文**,其餘團體 1-3 首
  非 CJK 屬正常英文歌名。污染 = 恰好 20 首。

**方案(執行 session 落地,注意全部跟 HANDOFF 紅線):**
1. **止血:** worshipGroups.js 兩個 handle → channel: null + note(同 City Harvest 做法):
   SingforGod薪火敬拜 note「2026-07-26 實測 @singforgod 係私人家庭片頻道,錯 handle,待搵正身」;
   Redsea Music note「2026-07-26 實測 @redseamusic 係巴西葡語翻唱頻道,錯 handle,待搵正身」。
2. **清污(隱藏唔刪除):** `UPDATE hymns_all SET curated=0 WHERE artist IN
   ('SingforGod薪火敬拜','Redsea Music') AND curated=1;`(預期 20 行;兩團體 inPool=false,
   冇合法舊歌,全部係壞 handle 入嚟)。用 acquireDbLock,改完 `launchctl kickstart -k
   gui/$(id -u)/com.hymnapp.backend`(紅線 2.4)。
3. **防護(防下一個壞 handle):** discoverFromGroup 對中文團體(粵/國,連中文 kidsLang 兒童)加
   **channel-level** sanity check:listing 30 條入面 **0 條**含 CJK → 成個 channel 當疑似錯
   handle,跳過+log 警告。要 channel-level 唔好 per-video(粵語歌可以有純英文名,per-video 會誤殺)。
4. **一次過 handle 大掃除(平,~15 個 flat-playlist call):** 逐個有 channel 嘅團體 print 頭 3 條
   title 眼睇對唔對辦 —— 呢兩個壞 handle 係 7-20 前未經 yt-dlp 驗證嗰批,可能仲有同類。
   (共享詩歌ShareHymns 嗰 3 首非 CJK 順手睇埋,預期係合法英文名。)
**驗證:** 落地後兩個 artist curated=0;audit query 冇新 100% 非 CJK 團體;App 唔再見嗰 20 首。

**2026-07-26 13:20 check：例行全部正常，但 🔴 P1 未落地（第二次催）。**
- growLibrary 極好:863→968(+105/3h),兒童 97→130(讚美之泉兒童收緊歌,listing 加深生效
  —— 新心音樂事工見到 158 條新片)。冇 block 冇斷路。
- fetchLyrics 正常:draft 維持 39(尋晚 run 已計),下次 04:20。
- **🔴 10:30 個 P1 方案(兩個壞 handle 20 首垃圾清污)三個鐘後仲未有人接:**
  Redsea Music 13 + SingforGod 7 仍然 curated=1 live 喺 App,兩個壞 handle 未拆,
  隨時繼續收垃圾(暫時未見新增,仍然 20 首)。方案全文喺上面 10:30 條目,
  **等 Dispatch 派俾「夜晚慢速擴歌庫排程」session,愈快愈好**。

**2026-07-26 16:20 check：例行全部正常（DB 1075／兒童 166／draft 39）；🔴 P1 六個鐘仍未落地（第三催）。**
- growLibrary:968→1075(+107/3h),兒童 130→166,冇 error。壞 handle 暫時 0 新片
  (fallthrough 跳過,冇再入垃圾),污染凍結喺 20 首但仍然 curated=1 live。
- P1 方案(10:30 條目)繼續等派。落地係細改:拆兩 handle→null、20 首 curated=0、
  kickstart backend,前後 15 分鐘內搞掂。

**2026-07-26 19:20 check：例行全綠（DB 1162／兒童 193／draft 39）；🔴 P1 九個鐘仍未落地（第四催）。**
growLibrary +87/3h 冇 error;fetchLyrics 隊列正常。20 首垃圾照舊 curated=1(冇新增,
壞頻道 0 新片)。P1 方案唔變:SUPERVISION-LOG 07-26 10:30 條目四步,15 分鐘細改。

**2026-07-26 22:20 check：例行全綠（DB 1258／兒童 226／draft 39）；🔴 P1 十二個鐘仍未落地（第五催）。**
growLibrary +96/3h 冇 error;兒童持續增長。垃圾維持 20 首冇新增。方案:07-26 10:30 條目。

**2026-07-27 01:20 check：例行全綠（DB 1350／兒童 256／draft 39）；🔴 P1 約 15 小時仍未落地。**
growLibrary +92/3h 冇 error。垃圾維持 20 首。方案:07-26 10:30 條目。已催五次,
今次唔重複 push(半夜,冇新資訊);預期週一辦公前時段執行 session 返場處理。

**2026-07-27 04:20 check：例行全綠（DB 1424／兒童 286／draft 39）；🔴 P1 仍未落地。**
growLibrary +74/3h 冇 error;checkDeadLinks 04:00 例行跑緊;fetchLyrics 04:20 開波,
07:47 驗收。垃圾維持 20 首。

**2026-07-27 07:20 check：例行全綠（DB 1492／兒童 316／draft 59）；🔴 P1 仍未落地（~21h）。**
- fetchLyrics 連續第三晚滿額:CC 25→OCR 20/20(05:05-05:22 完),draft 39→59。
- 質素抽查(3 首):可辨認但仍然夾雜 credit 文字(曲/詞/編曲/監製)、頻道 branding
  (「SALTED EGG」「NEW HEART MUSIC MINISTRIES」)、OCR 錯字(「監蚁」)。觀察項1 嘅
  清洗方案仍然有效、未落地。**補充發現:**一首「【鋼琴譜示範影片】快快地聽…讚美之泉
  兒童創意鋼琴譜」——教學片混入咗歌庫(SOP Kids 頻道),建議喺質素 filter 加
  `鋼琴譜/示範/tutorial` 關鍵字(跟紅線:落之前 backlog regression query 驗誤殺)。
  呢項可以夾埋觀察項1 一齊派「全庫歌詞補齊規劃」+「夜晚慢速擴歌庫排程」。
- growLibrary +68/3h,兒童 286→316,冇 error。國語呢輪企喺 556(候選窗口暫時清空,正常波動)。

**2026-07-27 15:55 改動記錄(Dispatch 指示,Eric 拍板):fetchLyrics 額度 20→80 首/晚,拆兩個時段。**
- plist 改為 StartCalendarInterval array:**01:00 + 05:00 各一個 slot,每個 CC 50 + OCR 40**
  (每晚合共 CC 100 / OCR 80)。比例維持 5:4,CC≥OCR 餵飽 OCR 隊嘅鐵律不變。
- 時段安全:01:00 slot 預計 ~02:10 完(最壞 ~02:40),離 checkDeadLinks 04:00 有成粒鐘凸;
  05:00 slot 照舊。拆兩段係攤薄住宅 IP 流量 pattern(80 首一口氣要兩個幾鐘)。
- 已 deploy + launchctl reload,launchctl print 確認兩個 calendarinterval 都註冊咗;
  --dry smoke test 通過。commit:plist + HANDOFF 背景 job 表(見 git log)。
- **監督重點(今晚起):**第一晚 80 首係新流量水位,check 嗰陣特別留意 block 探測
  有冇觸發、兩個 slot 各自完成時間、draft 應該日增 ~80(59 → 預期 ~139)。

**2026-07-27 10:20 check：例行全綠（DB 1557／兒童 349／draft 23）；歌詞 verified 10→46 🎉；🔴 P1 仍未清。**
- 有人今朝做咗 draft 覆核:36 首 draft 升咗做 verified(10→46),draft 59→23 —— 
  draft→verified 覆核流程開始行,好事。
- growLibrary +65/3h 冇 error,兒童 349。P1 嗰 20 首垃圾照舊 curated=1,方案(07-26 10:30
  條目)+質素清洗(觀察項1)+鋼琴譜filter(07-27 07:20 補充)三樣繼續等派。

**2026-07-27 落地 session（local_fa531849）：Kids on the Move 全頻道 non-song 清查 + delist**
Eric 截圖揪出 Kids on the Move（詩歌庫篩選見到 84/87 首）「呢一批完全唔係詩歌」。逐條（87首）
人手睇晒，confirm：淨返 4 首明確係歌（有 Lyric Video/♫ 標記：id 2223/2270/2303/2485），其餘
**83 首（95%）係兒童聖經教育／品格節目**——「God's Animal - X | Preschool」動物知識show(~19)、
「Bible Story」/「Parafries」故事集(~15)、「Let's Talk About X」/「What is X?」討論教學(~15)、
角色skit(Eggward等)/Advent devotional/經文解釋/Supercut合輯(~29)。全部 83 首**冇一條**撞到
現有 `isCompilation()` 嘅任何負面關鍵字——之前個 `NON-SONG-CONTENT-REVIEW.md`（keyword 掃）
淨係揪到 17 條，仲明確寫低「~15條 God's Animal 唔肯定,冇放入清單」，證實 keyword-only 掃描
對呢類「題目式/教學式」標題完全冇效。

**已執行（Eric confirm 之後）：**
- 83 首(含糊嘅 5 首都一併 delist，寧緊勿鬆) `curated=0`（reversible），淨返嗰 4 首明確歌
- `worshipGroups.js` Kids on the Move channel 拆走做 null，discover mode 唔會再挖（呢個
  channel 本質係教育節目 source，唔係詩歌台，深挖只會挖多同類內容）
- Regression check：全庫 `isCompilation()` 誤殺 = 0；Kids on the Move 現存 curated 精確 = 4
  （同保留清單完全對得上，冇手民之誤）

**交低俾監督 session 診斷嘅系統性缺口（未落手改架構）：**
`isCompilation()`/`isNonWorship()` 純粹係 **blocklist**（識擋已知負面關鍵字），完全冇「正面
確認呢真係一首歌」呢一步。「What Makes Truth True?」、「Let's Talk About Farming」呢類題目式
標題，同「God's Animal - The Owl | Preschool」呢類教學show標題，天生就唔會撞到任何負面詞。
加新 channel 落 `worshipGroups.js` 前嘅人手抽查，一直都係淨係睇最新嗰幾條標題(spot-check)，
唔夠代表性——Kids on the Move 最初驗證嗰陣抽到嘅頭幾條剛好都係呢類「睇落似正經但其實唔係
歌」嘅題目，所以漏檢咗。建議方向（供監督 session 判斷，未落實）：
① 加新 channel 前用更大樣本(例如 20-30 條,唔止 3-5 條)去估算「song ratio」，低於某個比例
   就淨係揀讀 titleMustMatch 白名單而唔係全開；
② 或者揀正面訊號詞(Lyric/Worship Song/MV/官方 MV 呢類)做輔助判斷，唔淨係睇負面詞；
③ 現有 13 個已加嘅 channel 入面，可能仲有第二個類似 Kids on the Move 嘅「教育為主，偶爾出歌」
   source（Saddleback Kids 都有唔少 "Church at Home" 節目片，已經部分靠 Week N/Episode N
   keyword 擋咗，但未做過同 Kids on the Move 一樣嘅全頻道人手覆核，值得抽時間查）。

## 🔴 2026-07-27 10:40 Fable 5:content filter 架構性缺口 — 完整方案(Eric 指示即刻出,派「夜晚慢速擴歌庫排程」)

**問題(Eric 發現):** Kids on the Move 87 首入面 78 首係聖經教育/品格節目集數,唔係歌。
根因:filter 係純 blocklist(識剔已知壞 keyword),冇「positive confirm 係一首歌」嘅步驟,
題目式標題("What Makes Truth True?")唔撞任何負面詞,全部漏網。(執行 session 已做緊
delist,check 時 KotM curated 已 87→4。)

**設計前提(實測數據,唔好行錯路):** 用 SQL 對全庫做咗「標題正面訊號」審核 —— known-good
中文團體嘅正面關鍵字命中率極低(611 Worship 7%/盛曉玫 17%/有情天 21%,抽樣驗證全部係
正常歌,純歌名標題)。**即係「title positive allowlist」做全局準入會大量誤殺中文歌,
唔可以做主軸。** 語言無關嘅最強訊號係**片長**(歌 2-8 分鐘 vs 節目/講道/晨禱 10-60 分鐘)。

**Q1 方案 — 兩層 song-confirmation(discover 收錄前,語言校準):**
1. **Layer 1(全局,零成本):片長帶 gate。** `listChannelVideos` 嘅 --print 加 `%(duration)s`
   (flat-playlist 本身有 duration,唔加請求)。收錄條件:75s ≤ duration ≤ 600s,
   出界就 log「⏭ [片長]」跳過。同時順手將 duration 寫入 DB(而家 1430 首 curated 空白,
   遲啲 audit 都用得着)。閾值執行者可用 known-good 頻道 listing 抽樣校準。
2. **Layer 2(選擇性):title positive signal。** worshipGroups per-group 新欄位
   `contentGate: 'duration'(default) | 'duration+title'`。設 'duration+title' 嘅頻道,
   過埋片長之後仲要標題命中歌訊號(♫/lyric/song/worship/dance/sing.?along/MV/official/
   cover 等)先收 —— 應用於**全部英文兒童頻道**(佢哋節目集數可以好短,片長攔唔晒;
   而英文歌片標題慣例穩定,allowlist 誤殺率低)。中文頻道唔使 Layer 2(節目=長片,
   Layer 1+現有 blocklist 已夠;實測 allowlist 對中文會誤殺)。

**Q2 方案 — 加 channel 審核流程(寫入 worshipGroups.js 檔頭做規矩):**
新頻道收錄前一律:①攞 60 條(唔係 3 條)`--flat-playlist --print "%(duration)s|%(title)s"`;
②計三個比例:歌片長帶%、blocklist命中%、正面訊號%;③隨機抽 10 條眼睇(唔好淨睇最新
—— 最新嗰批會被當季系列 bias 晒);④門檻:歌帶 ≥60% 正常收;30-60% 收但必須
`contentGate:'duration+title'` + note 記低比例;<30% 係節目台,唔收(Saddleback/611靈糧堂
呢類事後睇就係咁);⑤note 記 audit 日期+三個比例,日後可覆查。建議寫個細 script
`scripts/auditChannel.js` 做①②,一個 channel 一個 flat-playlist call。

**Q3 方案 — 全庫回溯 audit(兩步,派埋「全庫內容覆核」方法):**
1. **機械層:** 用 auditChannel.js 掃晒 ~20 個有 handle 嘅頻道(每個一個 call),出報告排可疑度。
   優先級(按現有證據):英文兒童頻道全部(Listener Kids/CJ and Friends/Yancy/Hillsong Kids
   —— KotM 已中招,同類風險最高)> Asia for JESUS/台北復興堂(known 夾雜)> 中文成人頻道(低危)。
2. **語義層(最強,零 YouTube 請求):** 全庫 curated 標題 by artist 攞晒出嚟,俾一個 LLM session
   逐個判斷「呢個標題似唔似一首歌」——"What Makes Truth True?" 呢類機械 filter 睇唔出,
   LLM 一眼睇出。建議由執行 session 或者「全庫內容覆核」session 做一次過批量覆核,
   可疑清單再人手/延伸驗證,delist 一律 curated=0(隱藏唔刪除)+kickstart。
**驗證:** 落地後 KotM 類節目片 0 首新增;英文兒童頻道試收時 log 見 [片長]/[標題] 兩種跳過;
全庫 audit 報告入 SUPERVISION-LOG;delist 完 App 抽查兒童分類冇節目片。

---

## ✅ 2026-07-27 05:10 執行 session(local_fa531849):Q1-Q3 全數落地 + P1 一併清埋

Eric 確認方案,即刻落地,冇再停低問。逐項匯報:

**Q1 Layer 1(片長 gate)——已落地。**`hymnDb.js` 新增 `listChannelVideos()`(由
growLibrary.js 搬過嚟集中一份)、`isInSongDurationBand()`(75-600s)、
`formatDuration()`。`discoverFromGroup()` 加咗片長 gate,out-of-band 直接
log `[片長]` 跳過,唔使嘥錢做死鏈驗證。**實測效果好強**——dry-run 撞到 Asia
for JESUS/台北復興堂大量 40-80 分鐘嘅研習會/名人講座,片長 gate 喺 blocklist
關鍵字比對之前就擋咗晒,冇一條走漏。順手 backfill:`discoverFromGroup()` 每次
攞 listing 都會用 `existing` 嗰批(之前掉晒唔用)嘅 duration 幫舊歌補空白欄
(免額外 request)。INSERT 新歌時一併寫 duration。

**Q1 Layer 2(標題正面訊號)——已落地。**`hymnDb.js` `passesTitlePositiveSignal()`
(♫/lyric/song/worship/dance/sing along/mv/official/cover)。`worshipGroups.js`
7 個英文兒童團體(Saddleback Kids/Hillsong Kids/Bethel Kids/Listener Kids/Kids
on the Move/CJ and Friends/Yancy)全部加 `contentGate:'duration+title'`。中文
團體**冇加**——跟返方案原意,實測數據已證(611 Worship 7%/盛曉玫 17%/有情天
21% 誤殺率)。用 CJ and Friends 25 條真實 listing 驗證:22/25 正確判斷。

**Q2(auditChannel.js)——已寫好。**`backend/scripts/auditChannel.js`,支援
`--channel`/`--group`/`--all`,攞 N 條(預設 60)計三比例、隨機抽 10 條印出嚟
人手覆核、按門檻(≥60/30-60/<30%)分級判定。

**Q3(全庫回溯)——已跑晒 29 個有 handle 嘅頻道**(比原估「~20 個」多,因為
07-27 12:52 另一個 session 加咗 3 個粵語兒童 playlist 源)。結果:

| 判定 | 頻道 |
|---|---|
| REJECT(<30%,已拆 channel) | Saddleback Kids(13.3%)、台北復興堂(18.3%)、611靈糧堂(5%) |
| GATE(30-60%) | Listener Kids(50%,已有 contentGate)、Asia for JESUS(36.7%,中文,冇加 Layer2,留返俾人手/語義層) |
| OK(≥60%) | 其餘 24 個 |

3 個 REJECT 頻道全部 **0 curated**(discover 從未成功過,同之前「永遠零產出」
嘅診斷吻合),拆 channel 唔涉及刪任何已收錄歌,零風險。完整 60 條 sample 報告
喺執行 session 本機(未存檔,如要覆查可以 `node scripts/auditChannel.js
--group "台北復興堂"` 重新跑)。

**順手清咗嘅 P1(SUPERVISION-LOG 07-26 10:30 條目,拖咗 ~18.5 小時):**
- `curated=0` 咗 20 首垃圾(7 首 SingforGod薪火敬拜 + 13 首 Redsea Music),
  同原本診斷嘅 id/數量完全脗合。
- 兩個 handle 拆走(`@singforgod`/`@redseamusic` → `null`),note 記低。
- **仲順手做埋原本 P1 方案步驟③**(channel-level CJK sanity check,一直未
  落地):`discoverFromGroup()` 加咗語言 sanity check——粵/國/中文兒童團體嘅
  listing 入面一條中文字都冇,就當疑似錯 handle,成個 channel 今次唔試。
  用 regex 喺 flow music/同心圓等健康頻道驗證過冇誤殺。

**額外發現(冇喺今次方案範圍,記低俾之後跟進):** Asia for JESUS 覆核期間見到
「Endless Worship」個頻道有 5 首歌因為標題掛住「XX牧師」(鳴謝/推薦嘉賓,唔係
講道)撞正 `isCompilation()` 嘅「牧師」關鍵字,誤判做「分類」跳過。呢個同
2026-07-24 已經修過嘅「建道神學院」誤殺屬同一類問題(關鍵字太廣),但今次冇喺
方案範圍內單獨驗證/修,留俾下次覆核 `isCompilation()` 關鍵字精準度嗰陣一併睇。

**改動檔案:** `backend/lib/hymnDb.js`(+listChannelVideos/formatDuration/
isInSongDurationBand/passesTitlePositiveSignal)、`backend/scripts/growLibrary.js`
(片長 gate/標題 gate/CJK sanity check/duration backfill,搬走 listChannelVideos)、
`backend/scripts/auditChannel.js`(新)、`backend/data/worshipGroups.js`
(contentGate 7 個 + REJECT 3 個 channel:null + P1 兩個 channel:null)、
`backend/hymns.db`(P1 delist 20 首)、`HANDOFF.md`(§2.9 新增機制文檔 + 狀態
數字更新)。**驗證:**`node --check` 全部過、`--status` 正常、dry-run discover
睇到 [片長]/[分類]/[標題] 三種 skip log 都出現,實測數字全部記喺呢條 entry。

**2026-07-27 18:40 STAGE 3 全批重新驗證完成(Eric 拍板方法+批次)。**
- 方法:whisper 時間軸(medium model,按歌鎖語言)做演唱次序 ground truth + OCR 字面 +
  段落只顯示一次(官方慣例)+ 官方來源只核對唔照抄(紅線 2.0)。
- 結果:verify 33 / demote 26(範圍 59 首 pipeline 歌)。App 而家 43 首有歌詞(33+10 manual)。
  之前出街 35 首:保留 30(內容全面更新)、落架 5(數據不足,寧缺勿錯)。
- 過程插曲(已修):whisper small 語言偵測炒車(17 首 0% match)→ medium+鎖語言+簡繁歸一重跑;
  校對輸出部份太薄 → 逐首同完整版擇優。三次攔截全部發生喺 apply 之前,零壞數據出街。
- 今晚起 01:00/05:00 slot 新歌原生行新方法(OCR 段落級合併+whisper 齊做)。

## ✅ 2026-07-27 歌詞出街批次 Fable 5 驗收(Eric 要求先驗後試)

**範圍:** 43 首 verified(33 新方法 + 10 人手),重點 6 首樣本 + 全批結構掃描(全部 read-only)。

**6 首樣本逐首:** 全部 PASS —— 
48 祂為我開路(段落齊,經文附註（以賽亞書 43:18-19）格式啱)/141 認識你是祢(粵語段落乾淨,
呢首正係 alignLyrics 黃金測試用例)/186 平安(中英對照 style,跟 SOP 官方慣例)/
1533 祢真偉大(經典聖詩結構完美,副歌重複保留正確)/1687 Oh How I Love Jesus(副歌三連
係真唱,設計上同段落內重複唔剔,啱)/2364 神我屬祢(段落+副歌齊整)。

**全批掃描:** 長度 52-853 avg 224,冇空白;連續重複行 check 唯一命中係 1687(上述,合理);
193 唱一首天上的歌 52 字睇落短,查過迦南詩歌呢首本身就係咁(去重後完整),PASS。

**揪到一個小問題(唔阻 Eric 試):** id 402 空谷的回音 經文附註裸寫「詩篇36:9」「羅馬書3:23-24」,
同標準格式「（書卷 章:節）」(48/70 嗰種)唔一致 —— 派「全庫歌詞補齊規劃」session 修:
補（）+ 書卷同章節之間加空格,順手 grep 埋成批 verified 有冇同款(SELECT id FROM hymns_all
WHERE lyrics_status='verified' AND (lyrics LIKE '%書_:%' OR ...) 樣式驗一次)。

**結論:6 首樣本全部驗收通過,可以俾 Eric 開 App 試。** 402 係批次入面另一首嘅 cosmetic
問題,唔使等佢修先試。

## 🔴 2026-07-27 16:50 「認識你是祢」App 顯示舊版 — Fable 5 root cause(派「全庫歌詞補齊規劃」即修)

**三層逐層驗過(全部即時實測,唔係推測):**
- DB `lyrics` 欄(141):✅ 乾淨去重版(284 字,「是祢告訴我…」開頭,段落正確)。
  display layer 寫入 `lyrics`、verification layer 喺 `lyrics_timeline`(whisper timestamps),
  架構冇搞錯欄位。
- Backend API 實測(`curl /api/hymns` 抽 id=141):✅ 而家回緊乾淨版,同 DB 一致。
- **問題喺時序+App cache:** backend 14:33 先重啟(sql.js 開機先讀 DB 入記憶體,紅線 2.4)。
  歌詞 --apply 係朝早做(10:17 check 已見 verified 10→46),即係 **~10:00-14:33 之間
  API 一直服務緊舊記憶體副本**。Eric 部機喺呢段時間開過 App 嘅話,`useCachedHymns`
  會將舊版寫入 MMKV;之後再開 App 即刻先畫 MMKV 舊版,background refresh 先至覆蓋。
  Eric 16:30 見到嘅就係呢份 MMKV 舊版(內容=修復前版本,同佢描述完全吻合)。
- 「已核對」問題確認:執行 session 淨係核對咗 DB 層,冇 kickstart+API 驗證,更加冇 App 端
  —— 正正係紅線 2.4 警告嘅情況。

**修復指令(local_fdeacc3b):**
1. **即時:** 話返俾 Eric 知 —— 完全收埋 App(force quit)再開,喺歌單停 2-3 秒(俾 background
   refresh 行完)再入首歌;應該已經係新版(API 而家係啱嘅)。如果仲係舊版 → 睇第 3 點。
2. **流程修正(必做):** reviewLyrics.js --apply 完結步驟加:①`launchctl kickstart -k
   gui/$(id -u)/com.hymnapp.backend`;②curl /api/hymns 抽改咗嗰啲 id confirm 新內容;
   ③emulator 開 App 截圖實際顯示先算 done。「DB 已核對」以後唔准當 done。
3. **App 端跟進(驗證,可能要修):** check 歌詞畫面攞數據嘅方式 —— 如果 route params/初始
   snapshot 揸住個 hymn object,background refresh 之後個畫面唔會更新,要改做 render 時
   按 id 由 live hymns state 攞。另考慮 API 加 dataVersion/lyrics_updated_at 做 cache-bust。
**Fable 5 驗收方式(修完我做):** curl API 對 43 首 verified 逐首 hash 對 DB;執行 session
  提供 emulator 截圖或我行 emulator check;唔收「DB 已核對」字面交貨。

## 🟠 2026-07-27 17:30 search「神我屬」搵唔到 — root cause + 方案(App 端,派 Dispatch 指定嘅前端 session)

**診斷(實測):** 首歌在庫冇事(id 2364,curated=1/ok/國語)。問題係 title「神**, **我屬祢!
You are My God」有逗號+空格,而 LibraryScreen.js 嘅搜尋(line ~64 `searched` useMemo)係
**原字串 `includes()` 連續比對**,「神我屬」呢個 query 冚唪唥對唔上(歌詞欄「神，我屬祢！」
全形逗號一樣唔中)。SQL 模擬 6 首抽查:其餘 5 首自然字串全部搵到,唯獨呢首 0。
Backend /api/search 嘅 LIKE 都係同款問題,但新 UI 用本地 filter,backend 嗰邊次要。

**方案(LibraryScreen.js,細改):** 比對前兩邊 normalize —— 剩返字母/數字/CJK:
`const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');`
`searched` 入面改做 `norm(h.title).includes(nq)`(nq = norm(query),五個欄同款)。
效能:1500+ 首每次撳鍵都行 5 個 regex 會拖 —— 將每首歌嘅 normalize 結果 memo 埋
(useMemo 對 hymns 陣列預計一次 `_searchBlob = norm(title)+norm(title_en)+norm(artist)+
norm(album)+norm(lyrics)`,之後每次 query 淨係 `includes` 一個字串)。
**驗證:** 搜「神我屬」「神我屬祢」「youaremygod」都應該中 id 2364;
現有 pass 嗰 5 首自然字串照中(regression);中英夾雜 query 唔誤殺。

## 🟠 2026-07-27 18:00 dataVersion cache-bust — 落地 instruction(派「全庫歌詞補齊規劃」local_fdeacc3b)

**背景:** 同類 stale-cache 事故 24 小時內連中兩次(認識你是祢/歌名亂)——都係「DB+API 一早啱,
App 顯示 MMKV 舊 cache」。而家將 cache-bust 由建議升做即刻落地。

**設計(三件套,全部細改):**
1. **Backend(server.js):** boot 載入 DB 嗰陣捕捉 `dataVersion`(建議用 hymns.db 檔案 mtime
   ms + 檔案大小拼串,夠平夠唯一;sql.js 每 boot 讀死一份,所以 per-boot 一個 version 啱晒)。
   加 `GET /api/version` → `{dataVersion}`(超平,唔讀 DB);同時 `/api/hymns` 個 envelope
   加返 `dataVersion` 欄(`{data, dataVersion}`,向後兼容)。
2. **App(src/hooks/useCachedHymns.js):** MMKV 多存一個 `allHymnsVersion`。mount 流程:
   ①照舊即刻畫 cached(UX 唔變);②fetch `/api/version`(細);③version 唔同(或攞唔到
   cached version)→ full fetch `/api/hymns`,寫 MMKV(data+version),setHymns;
   ④version 相同 → 跳過 full fetch(慳咗而家每次開 App 都全量拉嘅流量,順手賺);
   ⑤`/api/version` fail → fallback 返而家嘅無條件 background refresh(唔可以變差)。
3. **Snapshot 修正(16:50 條目第 3 點,一齊做):** 驗證歌詞畫面/播放器係咪揸住 route params
   嘅 hymn snapshot —— 係就改做 render 時按 id 由 live hymns state 攞,否則 refresh 完
   已開畫面照舊。
**驗證(執行 session 要做齊):** ①改一首歌 lyrics → kickstart → App force-quit 重開 →
2-3 秒內見新版;②backend 冇重啟時重開 App → /api/version 相同 → 冇 full fetch(睇 backend
log 請求數);③斷網開 App → 照畫 MMKV cache(offline 唔可以爛);④emulator 截圖交貨。
**檔案衝突提示:** 唔好掂 LibraryScreen.js(search normalize fix 由另一 session 做緊),
server.js/useCachedHymns.js 開工前照紅線 2.1 check git status。

**2026-07-27 19:20 check：正常，清污進行中（DB 1501／兒童 284／draft 26／verified 43）。**
- 全庫 1557→1501(-56):KotM 節目片 delist 生效(兒童 349→284),係預期內嘅淨化,唔係故障。
- P1 部分進行:Redsea 13→7,SingforGod 仍 7 —— 淨返 14 首垃圾,繼續跟。
- 新 launchd job `com.hymnapp.alignbackfill` 出現(歌詞 STAGE 3 對齊回填),下次 check 順眼睇 log。
- growLibrary 0 error 跑緊;fetchLyrics 下次 04:20。

## ✅ 2026-07-27 20:00 EAS Update (OTA) 落地 Fable 5 獨立驗收 — PASS,可以叫 Eric 裝 v1.4.0

**逐項 claim 對獨立證據(唔係齋信摘要):**
1. Wiring ✓ — APK manifest 實測:ENABLED=true/CHECK_ON_LAUNCH=ALWAYS/LAUNCH_WAIT_MS=0(silent
   非阻塞)/EXPO_UPDATE_URL=u.expo.dev/2fc23a2a…;app.json runtimeVersion "1"+production channel。
2. 「真係推送過」✓ — 直接 curl u.expo.dev manifest endpoint(production/rt=1/android):
   有 live update 019fa308-…(createdAt 18:04 HKT,同 commit a0ce3f2 時間吻合)。
3. **我自己喺 emulator 重現咗成個 e2e loop**(唔係齋覆核佢個測試):adb 實裝 v1.4.0 →
   cold start #1 logcat 見 background DownloadComplete(isUpdatePending=true),FATAL 0 →
   force-stop → cold start #2 用已下載 bundle 起,主頁完整 render(截圖,歌數 576/556/62
   同 DB 一致),FATAL 0。channel 上個 update 係正式 1.4.0 bundle,**冇 test-change 垃圾**。
4. APK ✓ — aapt2 實測 versionCode 50 / versionName 1.4.0(上版 49,遞增啱,紅線 2.7)。
5. Banner code ✓ — useUpdates→isUpdatePending 先顯示,撳先 reloadAsync,可 dismiss,標準安全
   pattern。「撳banner唔crash」呢項冇獨立重現(要有更新嘅 update 先觸發到),code review
   +佢哋實測紀錄接受。
**結論:可以叫 Eric 裝 ~/Desktop/詩歌App/hymn-app-v1.4.0.apk(記住先解除安裝舊版先裝,
或者同簽名直接覆蓋亦得——versionCode 50>49 唔會撞降級問題)。裝完之後所有 JS 改動行 OTA。**

## 🔴 2026-07-27 22:30 P0:delist 會被 curate 自動翻生 — 「rejected」狀態缺失(派「夜晚慢速擴歌庫排程」即修)

**實證:** KotM 節目片尋日 delist 到 4 首,今晚 22:12 已翻生到 62 首(log:「God's Animal -
The Bison | Preschool」照樣「驗證中」);Redsea 19:17 得 7,19:32-19:50 log 見 curate 逐首
re-verify,22:17 返到 13。根因:`curated=0` 喺 curate mode 眼中=「未上架 backlog 候選」,
usablePool(growLibrary.js:184)filter 鏈只有 isCompilation/isNonWorship/dead/fail_streak,
**冇任何「內容已判死刑」狀態** —— 所有 delist 過嘅垃圾都會喺之後嘅 run 循環翻生。
呢個係「隱藏唔刪除」機制同 curate backlog 機制嘅根本衝突,唔修,所有清污都係白做。

**方案:**
1. **新 terminal 狀態:** `status='rejected'`(內容性質唔啱,唔係死鏈)。usablePool 加
   `.filter((r) => r.status !== 'rejected')`。checkDeadLinks 只掃 curated=1,唔會掂佢;
   `hymns` view 已有 status!='dead' 條件,要確定 rejected 都唔出街(view 係 curated=1 AND
   status!='dead',rejected 行 curated=0 本身出唔到,OK,但 view 定義順手覆核)。
2. **清污一次過用新狀態重做(用鎖+完事 kickstart):**
   - `UPDATE hymns_all SET curated=0, status='rejected' WHERE artist IN
     ('Redsea Music','SingforGod薪火敬拜');`(兩個 handle 成個頻道錯晒,全 artist 判)
   - KotM:節目片嗰批(delist session 手上有 id 清單;冇嘅話用「title 唔含 ♫/lyric/
     song/video」啲規則重新界定,眼睇 confirm 先執行)同樣 SET rejected。
   - 之前 10:30 P1 講嘅 worshipGroups 拆 handle(@redseamusic/@singforgod → null)**必須
     同步做**,否則 discover 繼續拉新片入 backlog。
3. **驗證:** 改完行兩個 curate cycle(30 分鐘)後 SELECT 三個 artist curated=1 應穩定喺
   0/0/(KotM 淨返真歌數);log 唔應再見呢啲 artist「驗證中」;App 兒童分類抽查冇節目片。
**優先級:P0 —— 今晚唔修,聽朝垃圾全數翻生,之前所有清污等於冇做過。**

---

## ✅ 2026-07-27 23:xx 執行 session(local_fa531849):P0 已落地,兩個 curate cycle 驗證穩定

即刻做,冇等。三步方案全部落地:

1. **`status='rejected'` 終態** —— `usablePool()`([growLibrary.js:184](../backend/scripts/growLibrary.js))
   filter 鏈加 `.filter((r) => r.status !== 'rejected')`。`hymns` view 順手覆核:
   DROP+CREATE 加咗 `AND status != 'rejected'`(原本淨係 `curated=1 AND status!='dead'`,
   雖然理論上 rejected 一律配 curated=0 唔會出街,但加多重保險防手民之誤)。
2. **三個污染源一次過判死**(`acquireDbLock`→`UPDATE`→`saveDb`→`releaseDbLock`):
   - `Redsea Music`(13 首,全 artist)、`SingforGod薪火敬拜`(7 首,全 artist)
     → `curated=0, status='rejected'`。兩個 handle 早喺 P1 落地嗰陣已經拆咗
     (`channel: null`),今次冇再撞。
   - Kids on the Move:用返 07-27 delist 時嘅原 id 清單(83 首,keep 4 首確認歌
     2223/2270/2303/2485)→ 逐 id `status='rejected'`。查證咗成個 artist 而家
     總數仍然係 87(冇新片,discover 早已拆走 channel),87 個 id **同 delist
     嗰陣一模一樣**,冇漏、冇多。
3. **驗證:** 行咗兩個完整 curate cycle(`--budget 30`,每次連自動 discover)。
   結果:cycle 1 後 Redsea 0/SingforGod 0/KotM 4,**同 delist 剛完成嗰刻一樣**;
   cycle 2 log 用 `grep -iE "Redsea|SingforGod|Kids on the Move"` 搵**完全冇
   命中**——三個 artist 而家連喺 log 度「驗證中」都唔會再出現,證明 `usablePool()`
   喺揀候選嗰一步已經完全過濾咗佢哋,唔係「驗到但又拒絕」,係「連試都唔試」。
   最終確認:cycle 2 後仍然 0/0/4,**穩定唔反彈**。

**已 `launchctl kickstart` backend,`/api/health` 確認 200。** 歌庫改咗嘅 duration
backfill(discover 順手做)+ curate 自然增長令總數由 1461 升到 1561(粵 621/國
555/兒童 323/英 62)——呢個增長同今次 P0 修正冇關,係正常夜間擴歌庫。

**改動檔案:** `backend/scripts/growLibrary.js`(usablePool 加 rejected filter)、
`backend/hymns.db`(20+83 首判 rejected、`hymns` view 重建)、`HANDOFF.md`
(§2.4 新增「curated=0 唔算判死刑」硬規矩)。未 commit,等指示 push 定係就咁留低
等執行 session 匯報後 Eric 確認。

**2026-07-28 01:20 check：✅ P0(rejected狀態)驗收通過；例行全綠（DB 1612／兒童 347／draft 35）。**
- P0 三項全落地實證:usablePool 有 rejected filter(:198);Redsea 0 curated/13 rejected、
  SingforGod 0/7、KotM 4(真歌)/83 rejected;兩個壞 handle 已拆(channel:null+note)。
  最後一次垃圾 re-verify 係 22:48(修復前),之後 ~10 個 cycle 零反彈 —— 翻生循環已斷。
- fetchLyrics 有個 01:1x 進行中嘅 run(PID 44244,04:20 排程以外,應係執行 session 手動
  補批;喺 00:00-09:00 窗口內+有鎖,冇問題),draft 26→35。
- growLibrary 0 error;全庫 1612(淨化後回穩),粵 647/國 556/兒 347。

**2026-07-28 04:20 check 過，正常（DB 1667／兒童 372／draft 62）。** rejected 零反彈(4/0/0),
0 error;draft 35→62(補批持續);deadlinkcheck 04:00 例行跑緊,fetchLyrics 04:20 就開。

**2026-07-28 07:20 check 過，正常（DB 1719／兒童 403／draft 102）＋兩個觀察項。**
- fetchLyrics quota 已再加大(CC50+OCR40,plist 確認),尋晚 05:08-05:59 OCR 40/40 滿額,
  窗口內完成。growLibrary +52/3h,0 error;兒童新增粵語頻道(童唱童樂)、ACM兒童改用
  playlist 形式,rejected 零反彈。
- **觀察項A(質素 backlog):** draft 102 但 verified 停喺 43 兩日 —— intake 加速咗但
  draft→verified 覆核層冇跟上;抽查 3 首最新 draft 全部係現場片 OCR 噪音(教會名/器材
  branding/UI字)。建議:①7-25 觀察項1 嘅 OCR 後 LLM 清洗層盡快落地;②或者覆核產能
  跟唔上就考慮 OCR 額度回落,唔好俾垃圾 backlog 越滾越大。派「全庫歌詞補齊規劃」。
- **觀察項B(YouTube 請求量):** OCR 40 首/晚=每晚落 40 條片+CC 50 次 probe,連同
  growLibrary,對紅線 2.2「唔好爆發式打 YouTube」嘅 headroom 收窄緊。而家仍然
  concurrency 1+jitter,未越線,但再加就應該同 Eric 確認風險。

**2026-07-28 10:20 check 過，正常（DB 1747／兒童 431／draft 102）。** 0 error,rejected 零反彈,
5 個 launchd job 在位。觀察項A(verified 停 43,draft backlog 102)未有動靜,繼續跟。

## 🟠 2026-07-28 器樂教學片滲漏 — Fable 5 診斷+方案(派「夜晚慢速擴歌庫排程」)

**Q1 實查:** 讚美之泉兒童 117 首**唔係**全部教學片 —— 實際 38-40 首器樂/教學(小提琴譜/
鋼琴伴奏/示範影片)+ ~2 首宣傳片/專輯預告,其餘 ~77 首係真人唱嘅兒童敬拜 MV(【…】MV -
讚美之泉兒童敬拜讚美 系列)。**淨係 delist 教學嗰批,真 MV 要留返。**

**Q3 全庫掃描(同一組關鍵字):共 62 首滲漏,7 個頻道** —— 讚美之泉兒童 40、KEC Worship 11
(「敬拜鋼琴基礎教學 第N課」成個系列)、鹹蛋 4、新心 3(鋼琴伴奏課程)、Hillsong Kids 2、
Endless 1、泥土 1。眼證抽樣全部係真教學/課程片。

**Q2 偵測層方案:** blocklist 加「器樂/教學/宣傳」關鍵字組(已對全庫 curated 做 regression
query,**同真歌 MV 標記零重疊,冇誤殺**):
中文:`琴譜/樂譜/歌譜/伴奏/教學/示範影片/純音樂/預告/宣傳影片`
英文(lower):`tutorial/instrumental/sheet music/backing track/trailer/karaoke`
落喺 isNonWorship(或新 isInstrumentalOrTutorial)—— 記住兩個位都要用:discover 嘅
passesQuality + curate 嘅 usablePool filter 鏈(hymnDb.js 都有 isNonWorship,改一處兩邊受惠
就最好)。⚠️ 唔好用單字「譜」「示範」(誤殺面太大),用上面完整詞組。

**Q4 清污(照 KotM 做法):** 用鎖 →
`UPDATE hymns_all SET curated=0, status='rejected' WHERE curated=1 AND (title LIKE '%琴譜%'
OR … <上面成組關鍵字>);`(預期 62 行,執行前先 SELECT 齊份清單眼睇一次)→ saveDb →
kickstart backend。**驗證:** 掃描 query 返 0;兩個 curate cycle 後冇反彈(rejected filter
已在,應該穩);App 兒童分類抽查冇「示範影片」;真 MV(~77 首)冇被誤殺(count 對返)。

---

## ✅ 2026-07-28 執行 session(local_fa531849):器樂/教學片滲漏已落地,獨立 regression 覆核過

冇等,即刻做。落地前**冇盲信 Fable 5 份 regression**,自己對成庫 1750 首 curated 獨立
跑多一次 —— 結果 62 首、7 個頻道分佈(讚美之泉兒童40/KEC Worship11/鹹蛋4/新心3/
Hillsong Kids2/Endless1/泥土1)**同 Fable 5 條數完全脗合**。

1. **關鍵字落地:** `hymnDb.js` `isNonWorship()` 加咗 `INSTRUMENTAL_TUTORIAL_PATTERNS_ZH`
   (琴譜/樂譜/歌譜/伴奏/教學/示範影片/純音樂/預告/宣傳影片)同 `_EN`(tutorial/
   instrumental/sheet music/backing track/trailer/karaoke)。呢個 function 本身已經
   俾 `growLibrary.js` 嘅 `usablePool()`(curate 路)同 `passesQuality()`(discover
   路)兩路共用,**改一處自動兩邊生效**,冇再另開新 function。
2. **62 首清污前眼睇:** 用 `isNonWorship()` 本身(唔係另一組獨立字串,避免兩套邏輯
   唔同步)SELECT 咗全部 62 條 title 逐條睇 —— 全部係「XX 示範影片」「敬拜鋼琴基礎
   教學 第N課」「XX 純音樂系列」「鋼琴伴奏課程」「XX 專輯預告/宣傳影片」呢類,**冇
   一條夾雜真 MV**。用鎖 `UPDATE ... SET curated=0, status='rejected'` 逐 id(唔係
   LIKE 批量,更準)→ saveDb → kickstart。
3. **驗證:** rejected 由 103 升到 165(+62,精確)。兩個完整 curate cycle 之後:
   - rejected 總數仍然 165,**冇一條反彈**(直接查返原 62 個 id,curated=1 count=0)。
   - 讚美之泉兒童真 MV 由 77 首(reject 完即刻嘅數)兩個 cycle 之後**自然增長**到
     83 首(discover 攞到新片,**同被 reject 嗰 40 首完全冇關**)——證明真 MV 冇被
     連坐誤殺,反而仲可以繼續增長。KEC Worship 71 首都全部係 blocked-by-duration/
     isCompilation 嘅其他篩選,冇再撞到新嘅教學片。

**額外發現(冇喺方案範圍,記低唔即刻改):** cycle1 discover 讚美之泉兒童攞到一條
「【家長學生見證】讚美之泉兒童敬拜創意學校」(id 2833)——學生/家長見證片,唔係歌,
但都冇撞到今次任何一個關鍵字(見證/宣傳學校呢類同「教學/伴奏」係唔同詞彙)。同
之前 Endless Worship「牧師」誤殺屬同一類「新 edge case 陸續有嚟」——`isNonWorship`
/`isCompilation` 呢個純 blocklist 架構嘅共同限制,唔喺今次方案範圍,留俾下次關鍵字
精準度 pass 或者 Q3 提過嘅語義層一齊睇。

**改動檔案:** `backend/lib/hymnDb.js`(isNonWorship 加關鍵字組)、`backend/hymns.db`
(62 首 rejected)。未 commit,等指示。
