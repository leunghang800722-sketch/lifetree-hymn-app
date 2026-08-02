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

## 🟠 2026-07-28 「神我屬祢」卡loading — Fable 5 診斷+指示(派「夜晚慢速擴歌庫排程」/backend側即跟)

**排除晒嘅嘢(全部實測):** 條片(58Dy7WtfLl0)生勾勾 —— public/473s,CLI yt-dlp 即刻 resolve 到;
DB status=ok 冇錯;**唔使行 dead-link 流程**。App→backend `/api/stream/2364` 回 502
"resolve failed",而且 0.003s 即彈 = 食緊 resolveAudio.js `failCache`(15 分鐘負面快取)。
用同一份 code+同一環境開 fresh node process 行 `resolveAudioUrl('58Dy7WtfLl0')` **成功**
—— 即係 code/環境/片都冇問題,係跑緊嗰個 backend process 內部 resolve 持續失敗+failCache
不斷重 arm(Eric 個 App 好可能仲開住 loop retry)。

**額外發現(根本問題):① resolve 失敗零記錄** —— `runStrategy` 逐個策略 `catch (_)` 靜吞,
最終失敗都冇 log(全 log grep 'All yt-dlp' = 0 條),所以 in-process 死因無從稽考。
**② tv client 對呢條片會撞 DRM**("tv client formats skipped as DRM protected"),策略1
永遠 fail 靠 fallthrough 兜住 —— 如果 YouTube 呢個 DRM experiment 擴大,tv 策略會大面積
失效,冇 log 嘅話我哋唔會知。

**指示:**
1. **即時解封(1 分鐘):** `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend` ——
   清走 in-memory failCache,重載 disk cache(入面已經有我啱先 resolve 成功嘅 URL)。
   完成後 curl `/api/stream/2364` 應回 200/206 有 bytes,再叫 Eric 試。
2. **加 logging(細改,必做):** runStrategy 失敗 log 一行(`strategy=X id=Y err=Z`),
   `All yt-dlp strategies failed` 都要 log 埋 youtubeId —— 下次先追到 in-process 死因。
3. **加 failCache 觀察口(細改,建議):** `/api/audio/cache/stats` 加返 failCache size
   +最近 fail 嘅 id 列表;方便日後唔使靠估。
4. 修完照舊實測:curl 攞到音訊 bytes + Eric 部機播到先算完。

---

## ✅ 2026-07-28 執行 session(local_fa531849):四步全落地,已用真 bytes 驗證

**第1步(優先,即刻做):** `launchctl kickstart` 完即刻 `curl -H "Range: bytes=0-65535"
/api/stream/2364` —— 206 Partial Content,`content-type: audio/mp4`,`file` 命令確認
真.ISO Media/MP4 音訊(唔淨係睇 HTTP status,實測攞到 bytes),`content-range` 顯示全長
7.6MB 冇變。**即刻話俾 Eric 知可以再播。**

**第2步(logging,已落地):** `resolveAudio.js` 嘅 `runStrategy()` 加 `.catch` log 一行
(`strategy=X id=Y err=Z`),因為 `resolveViaYtDlp` 嘅 parallel/順序兩條調用路徑都經
呢個 function,**改一處兩路都受惠**,唔使逐個 call site 加。`resolveViaYtDlp` 兩個
「全部 strategy 都死」出口都加咗 `console.error` 埋 youtubeId。**用假 id(`AAAAAAAAAAA`)
實測觸發:log 見到 3 條 strategy 失敗(逐個帶 err message,包括 yt-dlp 原始 stderr)+
1 條 `All yt-dlp strategies failed` summary**,同期仲順手見到一條真實 keep-warm 請求
(`wNV2lmnI1qU`)嘅 tv strategy 失敗都被記錄咗——證明呢個 logging 對日常真實流量都生效,
唔淨係測試先見到。

**第3步(failCache 觀察口,已落地):** `resolveAudio.js` export `failCache`(之前淨係
export `cache`),`routes/audio.js` `/api/audio/cache/stats` 加 `failCacheSize`
+ `failing`(每條 youtubeId + 幾多秒後可以再試)。用假 id 觸發完即刻 curl 確認:
`{"cacheSize":327,"failCacheSize":1,"failing":[{"youtubeId":"AAAAAAAAAAA","retryInSec":900}]}`
——精確反映 15 分鐘 FAIL_TTL_MS。

**第4步(驗證):** 全部用真.HTTP 請求 + 真.bytes 確認,冇淨係睇 log/code 就當完成。

**改動檔案:** `backend/lib/resolveAudio.js`(runStrategy log + export failCache)、
`backend/routes/audio.js`(cache/stats 加 failCache 觀察口)。未 commit,等指示。

## ✅ 2026-07-28 會員系統 Phase 0 Fable 5 獨立驗收 — PASS

1. **JWT secret:** authSecret.js env-only、無 fallback、冇 secret 拒絕 boot;現行 code/ops
   零殘留舊字串;installed plist 有 64 字元新 secret(驗證咗 ≠ 舊 leaked 值 ≠ repo
   placeholder,冇 print 出嚟)。⚠️ 舊 secret 'hymn-app-jwt-secret-2026' 仍然喺 git
   history(冇 filter-repo 拆唔走,已知 .git 750MB 問題同款),但已輪替 = 舊 token 全部
   失效,無害。repo 只載 placeholder。
2. **users.db 私隱:** .gitignore 齊 users.db/.tmp/.lock 三條,git ls-files 確認未被 track;
   .env 類都冇 track。
3. **重啟持久化(我親手做):** kickstart backend → 200 健康、users.db id:2(+85292881174)
   原封不動、boot 冇 JWT 錯誤。
4. **Commit 範圍:** fc9a31b 八個 file 全部屬 Phase 0 範圍,server.js diff 只係 auth routes
   換 getUserDb,冇夾走其他 session 嘢。(順帶:dataVersion cache-bust 仲未落地,係另一單,
   繼續等「全庫歌詞補齊規劃」。)
**結論:可以話俾 Eric 知 Phase 0 搞掂。**

**2026-07-28 16:40 ✅ dataVersion cache-bust 三件套已落地(2d470c2)——Dispatch 追派,由歌詞監督線接手完成。**
- server.js(/api/version + envelope dataVersion)+ useCachedHymns(version 比對先決定 full fetch,
  fail 就 fallback 舊行為)+ App.js 播放器 cur 改按 id 攞 live state(單一 hunk)。
- Emulator 四項驗證全過(version 變→重拉;唔變→跳過;離線→MMKV 照畫;播放器 regression OK)。
- ⚠️ 未出街:未推 OTA。要 Eric/dispatch 拍板先 eas update。18:00 嗰單 instruction 可以閂。

**2026-07-28 19:20 check 過，正常（DB 1703／兒童 407／draft 102）＋一個要跟嘅趨勢。**
- 器樂/教學片 delist 驗收 ✓(關鍵字掃描 0 首殘留,82090f0);英文兒童暫停(d324692)生效;
  0 首歌收失敗,launchd 5 job 在位。
- **趨勢警號(派「夜晚慢速擴歌庫排程」跟):tv client DRM experiment 全面化** ——
  log 見連續多條片 tv 策略一律「DRM protected/format not available」,全靠 default
  fallback 先收到。影響:①每首白蝕一次失敗 tv 請求(+~4s,YouTube call ×2);②係
  yt-dlp #12563「session 級 DRM 實驗」訊號,萬一 default client 都中,成條線斷。
  **建議:**resolveAudio.js STRATEGIES 次序改 default 行先、tv 做後備(甚至暫時拆走 tv)。
  致穩定性註解嗰個「同一首歌永遠同一 format」invariant 唔受影響 —— 只要次序固定,
  default-first 一樣滿足。順手繼續留意 e28e5b8 新加嘅 resolve 失敗 log 有冇 default
  都 fail 嘅案例(有=紅色警報,即刻報 Eric)。
- draft 102/verified 43 —— 覆核層仍然停滯(觀察項A 第三日),繼續催「全庫歌詞補齊規劃」。

---

**2026-07-28 20:50 ❌ W1+W2 會員同步 / ✅ 播放插播修復 —— 獨立驗收(Opus 5 驗收層)**

驗收方法:自己開一個全新 test 帳號 `opus-verify@example.com`(user id 6),**冇**用其他
session 個 `synctest1`;emulator 先 `pm clear` 洗乾淨,關咗 autofill service(避開之前
記低嗰個「另一 session 測試帳號 autofill 彈窗」陷阱)。所有結論都有 server 端 curl 對數,
唔淨係睇 app 畫面。

**一、MineScreen.js 衝突 —— 其實冇衝突,已 reconcile(cce47e0)**
兩個 session 改嘅係同一個 file 嘅唔同位:W2(3c3923c)改頂部同步狀態顯示 + phone-tail
fallback,已 commit;插播嗰個 session 改 `renderItem` 嘅 onPress,一直留喺 working tree
未 commit。兩者獨立,唔使揀邊邊,直接疊埋就啱。已 commit 做 cce47e0,內容:最愛列表撳歌
由 `onPlayHymn(item)`(散歌 + 全庫隨機尾巴)改成 `{ explicit: true, playlist: favorites }`,
同上面「播全部」一致。呢個改動係插播場景嘅前提 —— 冇佢就根本冇一個真.清單可以接返落去。

**二、播放插播修復(53006b2 + cce47e0)—— ✅ 過,可以出**
最愛「播全部 5 首」→ 詩歌庫撳「這一生最美的祝福」→ 即刻播嗰首;播放清單維持 **5**
(= 新歌 + 餘低 4 首最愛,次序原封不動,唔係俾 1694 首詩歌庫換走);唔撳任何掣、
拖到 4:17/4:33 讓佢自然播完 → 自動接「榮耀大君王」→ 再自然接「唯一的希望」。
Sonnet 話「攞唔到乾淨端到端驗證」嗰part,而家補齊咗,截圖喺 session scratchpad
(s17→s22)。

**三、⚠️ 插播修復有個缺口(同一類 bug,另一個入口)—— 未修**
`我的 → 自建清單 → 清單詳情頁` 播嘅清單,插播判斷**完全唔會生效**,成個清單照樣俾
詩歌庫換走(實測:播放清單 33 → **1694**,清單消失)。
- 位置:`frontend/hymn-app/App.js:869`,browseTap guard 入面嘅 `autoRadioFromRef.current == null`。
- 因由:`PlaylistDetailSheet.js:77` 傳 `appendAutoplayTail: true` → `App.js:895` 會設
  `autoRadioFrom = list.length`(非 null)→ guard 即刻 false → 唔插播,照換 queue。
  只要「自動播放」開住(預設開),自建清單一定中。最愛「播全部」冇傳呢個 flag 所以冇事
  —— 即係同一個 bug,用戶行另一條路一樣會撞返。
- 附帶:guard 嗰句 `!curQ.some(...)` 係拎成條 queue(**連 30 首隨機尾巴**)嚟比,
  撳中尾巴入面任何一首都會當「唔係第二個清單」而唔插播。修嗰陣一齊睇。

**四、❌ W2 前端同步:最愛嘅逐次同步(outbox)完全推唔上 server —— P0,會蝕數據**
- **根因:`frontend/hymn-app/src/sync/userSync.js:75`** ——
  `const headers = { 'Content-Type': 'application/json', Authorization: ... }` 呢個 headers
  俾晒所有 op 用,包括**冇 body** 嗰啲:`fav_add`(POST)、`fav_remove`(DELETE)、
  `pl_delete`(DELETE)。後端 `server.js:54` 行 `express.json()`,收到「聲稱 json 但冇
  body」就 throw SyntaxError → **HTTP 400**。`runOp` 見 `!r.ok` 就 return false,
  `flush()` 一 fail 即停,條 outbox 永遠推唔郁。
- **證據:**臨時喺 runOp 加 log,logcat 見 `'DBG fav_add resp', 400, false`;同一支
  hymn id 用 curl(唔帶 Content-Type)打同一條 route 即刻 200。UI 亦見「4 項等緊同步」
  一直卡住唔跌。
- **驗過嘅修法:**冇 body 嘅 request 唔好落 `Content-Type`(净留 Authorization),
  `pl_upsert` 先用帶 json 嘅 headers。臨時改完再測 → `'DBG fav_add resp', 200, true`,
  outbox 即刻清空,server `/api/me/data` 見到首歌。(**呢個改動已 revert,working tree
  乾淨,留返俾執行 session 正式落。**)
- **點解 Sonnet 6 步驗證會全綠:**登入合併(`pushSync` POST 有 body)同 pull
  (`pullData` GET)兩條路都冇踩到呢個 headers,所以「重裝→登入→數據攞返晒」的確過。
  斷咗嘅係**登入之後逐次撳心心**嗰條 outbox 路,要對 server 數先睇得出。

**五、❌ 連帶數據流失(比上面更惡)—— `App.js:1979-1988` onActive**
`onActive` 係 `await flushOutbox()` 之後**唔理 flush 成功與否**,照 `pullData()` +
`replaceAllFavorites(server 版)`。所以 flush 一 fail(而家係必 fail),前後台切一次就用
server 舊資料**蓋走**本地未推上去嘅最愛。實測:app 內加 4 首最愛 → 切一次前後台 →
最愛剩返 1 首(server 嗰首),4 首人間蒸發;再重開 app,登入合併行 `clearOutbox()`,
連 outbox 嗰 4 條 op 都一併**永久掉咗**。
即使修好第四點,呢度都應該加保護:outbox 未清空就唔好 pull-overwrite。

**六、✅ 抽查過、確認冇事嘅部分**
- 重裝模擬(`pm clear`)→ 登入 → 「已同步 5 首最愛」,5 首連 title/歌手全部返晒嚟。
- 新帳戶第一次登入 = 「已同步 0 首最愛、0 個清單」,冇夾到其他帳戶數據。
- 清單 server → client pull:curl PUT 整咗個「驗收清單」3 首落 server,app 切前後台後
  「我嘅清單 1」即刻出現,入面 3 首次序啱。
- 後端 W1 API 本身冇問題(favorites POST/DELETE、playlists PUT、/api/me/data、/api/me/sync
  curl 全部 200,行為正確)—— 呢次全部係前端問題。

**結論:插播修復(含 cce47e0)可以叫 Eric 試;W2 同步唔可以出街,要先修返 §4、§5,
順手一齊修 §3。** 修完要用「登入 → 撳心心 → curl 對 server 數 → 切前後台 → 再對數」
呢個流程重驗,唔可以淨係睇 app 畫面。

**2026-07-28 22:20 check：例行正常（DB 1727／兒童 431／draft 102）＋「All strategies failed」批量現形，方案如下。**
- 新 resolve logging(e28e5b8)現形咗 33 個 id 三策略全敗。抽樣 15 個:13 個=基恩敬拜
  (紅線筆記 known「成批片死晒」現象,以前冇 log 睇唔到);TZO4fPE6TS8(SOP兒童)實測
  web/ios/tv/default 四個 client 都「Only images available」= YouTube 只 serve storyboard
  (SABR/PO-token 類),唔係 IP 全面被封(歌庫照 +24/3h,大多數 resolve 正常)。
- **唔係紅色警報**,但兩個行動派「夜晚慢速擴歌庫排程」:
  ① **yt-dlp 升級:** 而家 2026.06.09,brew stable 已有 2026.7.4 —— PO-token/SABR 類故障
     正正係 point release 追住修嘅嘢。`brew upgrade yt-dlp` 後對呢 33 個 id re-probe,
     預期一批會返生;記得四個 launchd job 全部用緊 /opt/homebrew/bin 同一支,升級一次
     全部受惠,唔使改 plist。
  ② 真死嗰批由現有 dead-link 機制(連續 3 日失敗先標 dead)自然收埋,唔使人手;
     但如果入面有 curated=1 嘅歌,呢 3 日內用戶播會卡 loading(failCache 502)——
     可以考慮對呢 33 個 id 行一次 targeted deadlink check 加速判定。
- draft 102/verified 43,覆核層第三日停滯,繼續催。

**2026-07-29 01:20 check 過，正常（DB 1744／兒童 448／draft 115）。**
+17/3h 增長,近 200 行 all-fail 只 1 條(基恩批次殘餘),5 job 在位。draft 102→115
(有零星補批)。**未做:** yt-dlp 仍係 2026.06.09(升級指示未執行);覆核層 verified 仍 43。
兩項照掛住催。

**2026-07-29 04:20 check 過，正常（DB 1744／兒童 448／draft 141）。**
- 3 個鐘零增長係**健康現象**:content-gate 片長帶(75-600s)已上線,log 實見逐條剔走
  50-72s 鋼琴譜示範/宣傳短片(之前滲漏嗰類嘅新片,而家入唔到嚟);候選窗口自然消化中;
  04:12 一次 lock skip 係 deadlinkcheck 04:00 例行。Job 生勾勾,0 斷路。
- 逐策略 resolve log 亦上線(⚠️ strategy=X id=Y err=Z 格式)。draft 115→141。
- 仍未做:yt-dlp 升級(2026.06.09)、覆核層(verified 43)。

---

## ✅ 2026-07-29 執行 session(local_fa531849):Eric 問「係咪卡住」→ 獨立驗證 + 兩個待辦落地

Eric 見 1730→1739 覺得增長慢,問係咪卡住。**獨立查證(唔淨係信 Fable 5 04:20 個判斷):**
launchd `growlibrary` job 健康(last exit code 0),log 每 15-16 分鐘一 tick,最新一 tick
(20:43 UTC)實時處理緊粵語頻道(KEC Worship/悦雨音樂GRM),**唔係卡死**。19:50-20:43 UTC
呢 53 分鐘 flat 喺 1739,查實係讚美之泉兒童呢一輪 listing 撞正一大批鋼琴譜示範/宣傳片
(50-72s,片長 gate 同 isNonWorship 逐條剔走,log 歷歷在目),加埋僅有嘅真候選撞正
DRM——**同 Fable 5 04:20 條目判斷一致:健康現象,唔係故障**。

順手落地兩個 Fable 5 已經診斷、掛喺「派夜晚慢速擴歌庫排程」但未執行嘅待辦:
1. **yt-dlp 升級:** `brew upgrade yt-dlp`(2026.6.9 → 2026.7.4)。**誠實匯報:**升級後
   re-test 之前 33 個 all-strategies-failed 嗰批入面抽 5 條(WU0rXGXF8YM/Z6mFlmPhK68/
   fLH9HNN9oYs/h7nBixcj6as/z2k8PLtr2ls),全部依然「Video unavailable」——即係話呢批
   **唔係版本問題,係真.死鏈**(同 HANDOFF 已知「基恩敬拜/角聲使團批次死亡率高」
   現象吻合,13/15 抽樣本身就係基恩敬拜)。升級冇即刻翻生呢 33 條,但對日後
   SABR/PO-token 類新故障仍然有預防價值,值得做。Kickstart backend 後 `/api/health`
   200、id 2364 stream 再驗 206,冇因為升級而壞咗任何嘢。
2. **STRATEGIES 次序:tv 行先 → default 行先**(`resolveAudio.js`)。原本 tv 排第一,
   而家 tv client DRM experiment(yt-dlp #12563)越嚟越多片中招,每首白蝕一次注定
   失敗嘅 tv 請求先落去 default。「同一首歌永遠同一 format」invariant 淨係要求
   **次序固定**(唔理邊個排第一),換咗都唔會累到 v238 之前嗰種 stutter。用直接
   module 調用 + `/api/audio/:id` HTTP 驗證過重新 resolve 正常。

**結論(答返 Eric 條問題):冇卡住,job 健康,今晚嘅慢係篩走緊之前滲漏嗰類內容嘅
正常代價。**已順手清埋兩個 Fable 5 掛住嘅待辦,剩低嘅只有覆核層(verified 43)未跟。

**改動檔案:** `backend/lib/resolveAudio.js`(STRATEGIES 次序)。yt-dlp 版本係系統層
brew 套件,唔喺 git 追蹤範圍。未 commit,等指示。

**2026-07-29 04:55 ✅ 7d1ee17 覆驗 —— 兩個問題都真係修好,可以叫 Eric 試。**

同樣用自己個 `opus-verify@example.com`(user id 6),emulator `pm clear` 洗乾淨重新登入,
每一步都 curl 對 server 數。

**Commit 範圍:乾淨。** 7d1ee17 只掂 `frontend/hymn-app/App.js` +
`frontend/hymn-app/src/sync/userSync.js` 兩個 file(+38/-13),冇夾埋其他 session 嘢 ——
assets/、backend/、docs/ 嗰堆改動全部仍然留喺 working tree 未 commit,原封不動。
兩個 file 入面每個 hunk 都對得返上號(playSingle guard / playQueue browseTap guard /
onActive / runOp headers / flush 回傳值),冇夾雜無關改動。

**§4+§5 P0 蝕數據 —— 過。** 分三段驗:
1. 登入後喺 app 撳 4 個心心 → server 即刻由 5 變 9(修之前呢 4 個全部卡 400 推唔郁)。
2. 開飛行模式再撳 2 個心心 → 「2 項等緊同步」,本地最愛 11、server 9(即係之前
   會蝕數據嗰個危險狀態)→ 前後台切一次 → **本地仍然 11,兩首冇蒸發**。
3. 關飛行模式 → 前後台切 → outbox 自動 flush 乾淨,狀態變「已同步」,
   server `favorites` = 11 首(尾 2 首係離線嗰陣加嘅 id 2/3),本地=server。
   全程冇任何一首消失。
⚠️ 註:修好 §4 之後,「flush 失敗但 pull 成功」呢個原本蝕數據嘅組合喺 UI 上已經
整唔出嚟(最愛嘅 op 唔會再 400;離線就連 pull 都一齊 fail)。所以 §5 個 guard
(`flush()` 回傳 drained、`if (!flushed) return`)係靠 code review + 上面第 2 步
(flush 失敗時本地數據冇被覆蓋)確認,唔係靠獨立重現原本個 race。

**§3 P1 清單詳情頁插播 —— 過。**
「我的 → 驗收清單 → 播全部」(自動播放開住,播放清單 33 = 3 首 + 30 首隨機尾巴,
即係 `autoRadioFrom = 3` 嗰個之前中招嘅設定)→ 詩歌庫撳唔喺清單入面嘅
「這一生最美的祝福」→ **播放清單 (3)**,唔再係 1694。開 queue sheet 核實內容 =
[這一生最美的祝福(播緊), 主禱文, 恩典太美麗],即係插播歌 + 清單餘低嗰兩首,次序啱。
再拖到歌尾等佢自然播完 → 自動接「主禱文」,真係接返落去原清單。

**Regression(headLen 重構掂到共用 code,順手覆驗原本已經 work 嗰條路)—— 過。**
最愛「播全部 11 首」→ 詩歌庫撳非最愛嘅「主禱文」→ 播放清單維持 **11**
(= 插播歌 + 餘低 10 首最愛),冇變 1694 又冇變單曲。

**結論:W1+W2 會員同步 + 播放插播修復,兩樣都可以叫 Eric 上真機試。**
(test 帳號 opus-verify 而家 server 有 11 首最愛 + 1 個「驗收清單」,係測試殘留,
唔關 Eric 事;下次覆驗可以照用。)

**2026-07-29 07:20 check 過，正常（DB 1744／兒童 448／draft 131／verified 90）。**
- fetchLyrics 尋晚 CC50→OCR 37/40,06:00 前收尾 ✓。**覆核層終於郁返:verified 43→90(+47)**
  —— 觀察項A 解除。draft 質素照舊夾雜拼音/copyright 行,等 LLM 清洗層。
- growLibrary 全晚 1744 平(0 error、0 斷路):所有頻道 fresh 窗口俾 gate 篩淨晒,
  屬飽和狀態,唔係故障 —— 增長會等頻道出新片先郁。想再谷就係產品決定
  (加新頻道/再加深 listing/重開英文),唔係 bug。yt-dlp 升級指示仍未執行。

## 🟠 2026-07-29 11:58 首頁插播「冇修到」— Fable 5 三可能性裁定(派 Sonnet 落地+Fable 5 驗收)

**裁定:可能性 1(Eric 部機未行到新 update)係真相,機會極高。證據:**
1. 時間線:v1.4.0 embedded bundle build 於 7-27 18:01;三個插播修復 commit 係 7-28
   18:20(53006b2)/20:48(cce47e0)/22:33(7d1ee17)—— **全部遲過 APK 一日**;channel 唯一
   一次 publish 係 7-29 05:00 HKT(update id 019faa87…)。Eric 要行到修復,必須 05:00 後
   開過 App 一次(silent download)+再完全重開多一次(apply)。唔成立就必然係 7-27 舊
   bundle = 「同修復前一模一樣」。
2. **448 呢個數係舊版指紋:** 新 code 隊列上限係 radio 1+RADIO_LEN(30)=31 或插播 ≤ 原
   清單長度 —— 無論邊條路都整唔出 448。448 對應舊版「成個 cached 全庫做尾巴」行為。
3. 可能性 2(首頁另一條 code path)喺現行 code **排除**:首頁 tile
   `onPlayHymn={handlePlayHymn}`(App.js:2149)→ 非 explicit → playSingle 插播分支
   (53006b2 引入,7d1ee17 修 headLen)。HomeScreen.js 係死 stub,冇被用。
4. 可能性 3(claim 造假)冇證據:claim 對得上 53006b2 實際 code。
   ⚠️ 唯一未釘死:05:00 publish 嘅 bundle 內容(asset URL 要 EAS auth,grep 唔到)——
   publish 時間 > commit 時間,合理推定包含,但要行動 1 釘實。

**行動(派「夜晚慢速擴歌庫排程」/身傍嘅執行 session):**
1. `eas update:list --branch production`:confirm 019faa87 對應 7d1ee17 之後嘅 tree。
2. 指導 Eric:完全收埋 App→開→等 5 秒→再完全收埋→開(雙重冷重開);或者見到
   「已有新版本，撳一下更新」banner 直接撳。之後先至試首頁插播。
3. **Fable 5 驗收(emulator 而家熄咗,開返先):** 雙重冷重開確認 update id=019faa87 →
   實測兩個場景:①播一個清單→首頁撳單曲→隊列唔變 radio(插播生效);②冇嘢播→首頁
   撳單曲→隊列=31(1+30),唔係幾百。截圖為證,先准叫 Eric 試(第三次唔可以再流料)。
4. **流程修正(以後每次 OTA 交付都要):** 交俾 Eric 試之前,執行 session 必須:
   ①confirm 部機/emulator 行緊嘅 updateId=最新 publish;②講明 Eric 要雙重重開或撳
   banner。「code 修咗+publish 咗」唔等於「用戶行緊」—— 呢個係今次三連誤會嘅根源。

## 🔴 2026-07-29 12:10 首頁插播案 — Fable 5 完成驗收實測,推翻早前裁定:bug 真係喺最新 bundle 度

**實測過程(全部有據):** emulator 發現俾執行 session 留低咗 DEBUGGABLE dev build(OTA 喺
dev build 唔行!)→ 重裝 Eric 同款 release v1.4.0 → 雙重冷重啟實測:boot1 下載 019faa87
(isUpdatePending=true)、boot2 apply(server 回 CheckCompleteUnavailable=已係最新);
裝置 bundle(Hermes bytecode,key a3a75006…=manifest launchAsset)string table 有 browseTap
= **publish bundle 確實包含 53006b2 修復**。 → 場景實測:冇嘢播,撳首頁「即刻揀歌」一首
單曲 → **隊列變 682(成個粵語分類)**,唔係 31 radio、唔係插播 —— 喺最新 update 上重現咗
Eric 個 bug(佢 448 = 佢部機 cache 嘅分類大細)。

**真・root cause(一行位):** 7-25 commit 796e3ea 將「即刻揀歌」row 撳單曲改成
`play(h, activeChip.songs, true)` = `{explicit:true, playlist:成個分類}`(src/components/
home/HomeScreen.js:297)。7-28 插播修復淨係修咗 playSingle + browseTap 路徑,但首頁 row
根本唔行 playSingle —— 行 explicit 路徑直接 playQueue 換走成條隊。「playSingle 補埋」個
claim 指嘅 code 有修,但冇 trace 到首頁實際 caller 三日前已被改行第二條路。
對照:LibraryScreen:191 修復後係 `{explicit:true, playlist:shown, browseTap:true}` ——
**首頁 row 差咗個 `browseTap:true`**。

**修法(派 Sonnet,一行類):** home/HomeScreen.js:297 row 撳歌改傳 browseTap:true(同
Library 一致:播緊嘢=插播,冇嘢播=由嗰首起播成個分類)。line 328「播全部」footer 同
line 211 隨心聽**唔好掂**(佢哋=用戶明確揀成個清單,replace 係啱)。「今日為你預備/最近
加入」本身行 playSingle,唔使掂。修完 commit + `eas update --channel production`。

**Fable 5 驗收(publish 後我做,先過我先俾 Eric 試):** emulator 雙重冷重啟攞新 update →
①播全部 682 → 撳另一首首頁單曲 → 隊列唔變 682→其他,係插播(現隊保留);②冇嘢播 →
撳首頁單曲 → 由嗰首起播分類(同 Library 行為一致);截圖存證。

**流程發現(要入規矩):** emulator 上嘅 dev build 會令「OTA 已驗證」嘅講法完全失效 ——
execution session 用 emulator 驗 OTA 前必須確認裝住 release build(dumpsys 冇 DEBUGGABLE)。

**2026-07-29 12:20 ✅ Sonnet 落地 + publish + 驗收 —— 過。**

**改動:** `home/HomeScreen.js:297` row 撳歌由 `play(h, activeChip.songs, true)`
改直接 `onPlayHymn(h, { explicit: true, playlist: activeChip.songs, browseTap: true })`,
跟 `LibraryScreen.js:191` 一致寫法(唔經 `play()` 呢個冇 browseTap 參數嘅本地 helper)。
footer「播全部」(line 328)同「隨心聽」(line 211)冇改,依然行 `play()` 冇 browseTap。

**Commit 範圍:乾淨。** `94acb23`,只掂呢一個 file(+1/-1)。Publish 前 `git stash push -u`
清埋其他 session 嘅 assets/backend/docs 未完成改動,publish 完即刻 `git stash pop` 還原,
working tree 對比 publish 前後一致(`git status` 核過)。

**Publish:** `eas update --channel production --platform android`,
update id `019fac14-9f8e-7866-bee3-be86f860df93`(group `f0e19880-…`,commit `94acb23`)。
`EXPO_TOKEN` 喺 `~/.zshrc`,Bash 工具嘅非互動 shell 預設冇 source,要手動 `source ~/.zshrc`
先叫得動 `eas`——呢點原有文件冇提到,記低俾下次執行 session 睇。

**驗收(release build v1.4.0/versionCode 50,dumpsys 確認冇 DEBUGGABLE):**
雙重冷重啟(`am force-stop` → `am start`)→ boot1 見 `CheckCompleteAvailable` 下載
`019fac14` → boot2 `CheckCompleteUnavailable`(已係最新,即已 apply)。用「國語敬拜」
播全部(552,explicit 隊列)模擬「播緊第二個清單」→ 切去「粵語敬拜」chip 撳一首
唔喺隊列入面嘅歌(You Make Me Brave)→ **播放清單維持 552,冇跳去 682** ——插播生效,
同 Eric 實測撞到嘅「682/448 換晒隊」bug 唔再重現。截圖存喺
scratchpad(screen9-10:tap 前後隊列數對比)。

⚠️ 呢個 emulator 未登入、最愛清單係空,冇得直接用「最愛」重現 Eric 原本個場景,
改用「播全部一個分類 552 首」做「已有第二個 explicit 隊列」嘅等價替代,邏輯上
(headLen/explicitHead 判斷)同最愛清單場景係同一條 code path,結論可信。

---

**2026-07-29 12:50 ✅ Opus 5 獨立驗收(94acb23 + 5344bf6 + def35b0 三個 commit 一齊覆核)—— 全部過。**

背景:三個 Sonnet session 各自聲稱驗證過,但今日之前試過兩次「以為修好但其實冇」,
所以今次由獨立 session 重驗,唔採信 execution session 嘅 claim。

### 一、Git / OTA 層(最關鍵:兩個 OTA 先後推,驚後面冧走前面)

**三個 commit 互不衝突**,改嘅 file 完全唔重疊:
- `94acb23` → `home/HomeScreen.js`(+1/-1)
- `5344bf6` → `components/VersionTag.js`(新)+ `AuthScreen.js` + `PhoneLoginScreen.js` + `SettingsScreen.js`
- `def35b0` → `config.js`

**冇任何一個覆蓋另一個。** `git status` 睇 `frontend/hymn-app/src/` = 完全乾淨(working tree == HEAD),
`git stash list` 空,reflog 冇異常 reset。上一個 session 用 `git stash push -u` 清場再 pop,
`HomeScreen.js` mtime 停喺 **12:08** 一直冇再變(如果 stash/pop 掂過會變 12:25+)——
即係第二次 publish(12:26)嗰陣,browseTap 個改動實實在在喺 disk 上面。

**最新 OTA 真係包含晒三個修復 —— 有硬證據,唔係靠推論:**
1. 用 device 身份直接 curl manifest(`u.expo.dev/<projectId>`,headers `expo-channel-name: production`
   / `expo-runtime-version: 1` / `expo-platform: android`)→ 派返 **`019fac1f`**(group `5c535712`,
   即 VersionTag+W3 嗰個,亦即最新)。
2. `dist/` 目錄(12:25,即第二次 publish 嘅 export)入面 `metadata.json` 嘅 3 個 asset hash
   **同 manifest 派出嚟嗰 3 個完全一致** → 證實 `dist/` 就係 `019fac1f` 個 bundle。
3. 解 `dist/_expo/static/js/android/index-*.hbc.map` 嘅 `sourcesContent` 逐個 file 核:
   - `HomeScreen.js` → `onPlayHymn(h, { explicit: true, playlist: activeChip.songs, browseTap: true })` **在**
   - `config.js` → `PHONE_AUTH_ENABLED = true` **在**
   - `VersionTag.js` / `AuthScreen.js` / `PhoneLoginScreen.js` **在**

→ **後推嘅 `019fac1f` 冇冧走 `019fac14` 嘅 browseTap 修復,三個修復同時喺一個 bundle 入面。**

⚠️ 校正上一條 log 一個講法:CDN asset URL 直接 curl 會 403(要 signature),
驗 bundle 內容應該用本地 `dist/` export + 對 asset hash,唔好靠落載 CDN bundle。

### 二、真機(emulator)測試 —— 用真.最愛,唔係替代品

**重要:呢部 emulator 唔係 dev build,係行緊真 OTA。** VersionTag 顯示
`v1.4.0 · OTA 07-29 12:26 · 019fac1f`(如果係 dev build 會顯示「內置包」)——
即係下面所有測試都係**直接喺 published bundle `019fac1f` 上面做**,唔係 Metro 本地 code。

**a) 插播(真.最愛,補返上一個 session 嘅缺口):**
喺詩歌庫心心 4 首 + 原有 1 首 = **最愛 5 首**(真最愛清單,唔係「播成個分類」替代品)。
- 「播全部 5 首」→ 播放清單 (5),內容 = 信 / 恩典太美麗 / 這一生最美的祝福 / 我要向高山舉目 / 主禱文(截圖 s5)
- 去首頁,active chip = **粵語敬拜(682)**,撳 row 一首唔喺最愛入面嘅歌(You Make Me Brave)
- → **播放清單維持 (5),冇變 682**;隊列 = [You Make Me Brave, 恩典太美麗, 這一生最美的祝福, 我要向高山舉目, 主禱文](截圖 s8)
- → 撳 ⏭ → 播返 **恩典太美麗**(截圖 s9),確認「播完接返原最愛清單」真係 work

⚠️ 隊列數係 5 唔係 6,**呢個係設計,唔係 bug**:`App.js:886` `resumeRemainder` 由 `curIdx + 1` 起計,
即「插播嗰首 + 原清單*之後*嗰啲」,播緊嗰首(信)被打斷所以唔保留。同 code 完全一致。

**b) VersionTag 顯示:**
- `PhoneLoginScreen`(電話登入頁)→ `v1.4.0 · OTA 07-29 12:26 · 019fac1f` ✅(截圖 s10)
- `AuthScreen` email 頁(撳「用電郵/密碼登入」切過去)→ 同樣顯示 ✅(截圖 s11)
- updateId `019fac1f` + 時間 12:26 **對得返** manifest `createdAt 2026-07-29T04:26:00.966Z`(UTC)= 12:26 HKT ✅
- 未驗:第 4 個插入位(`AuthScreen.js:76` 已登入 profile 頁),要登入咗先見到 —— 同一個 component
  同一個 file,已經喺 bundle 入面,風險極低,但我冇親眼見過佢 render。

**c) SettingsScreen「死 code」問題 —— 確認係死,但唔使跟:**
- 全 repo 冇任何 file import `SettingsScreen`,Metro 直情冇將佢 bundle 入去
  (sourcemap `sourcesContent` 搵唔到呢個 file)→ 個 VersionTag 插入位**用戶 100% 見唔到**。
- **但唔係今次搞壞:** `git show b71bf95:App.js` 已經冇 `SettingsScreen` 引用,即係
  呢個 commit 之前佢已經係死 code(`796e3ea` 之後)。5344bf6 只係喺一個本來已經
  入唔到嘅畫面加咗行字,**冇 regression,冇 user impact**。
- **結論:唔阻 Eric 試。** 兩個真正見到嘅插入位(電話 + email 登入頁)都顯示正常,
  Eric 要對版本號嗰陣睇得到。SettingsScreen 本身係咪要刪/接返 nav 係另一件事,
  同今次三個修復無關,另開 task 清理。

### 三、W3 開閘

- `GET /api/auth/otp/status` → `{"configured":true,"channel":"whatsapp","allowed":["+852"]}` ✅
- `PHONE_AUTH_ENABLED = true` 已喺 bundle,登入頁**預設就係電話登入**,底部「用電郵/密碼登入」可切返 ✅
- `POST /api/auth/otp/request` 路由生效(用唔會發送嘅 input 試):
  非 +852 → 422 `region_unsupported`;格式錯 → 400 `bad_phone`。
  兩個 reject 都喺 `twilioStart()` **之前**(otpAuth.js:107 vs :118),所以測試冇發過任何訊息俾任何人。
  ⚠️ 真實路由係 `/api/auth/otp/request`(唔係 `/start`),前端 `AuthContext.js:77` 叫嘅都係呢條,對得上。
- 我**冇**用真電話號碼試發 OTP(會寄真 WhatsApp/SMS),留返俾 Eric 做真身。

### 結論

**可以叫 Eric 做真身電話 login + 兩項 UI 覆測。** 三個修復確認同時喺 `019fac1f` 生效,
插播已用真.最愛驗證,VersionTag 兩個活躍插入位都見到而且 updateId 啱。


## 📋 2026-07-30 新一輪歌詞校對批次(Eric 已確認)— 指令派「全庫歌詞補齊規劃」(local_fdeacc3b)

**現況(Fable 5 核實):** curated 庫 draft backlog 195 首(ocr 186/whisper 9),verified 90
(上輪 43→90 之後停咗)。目標:盡量清 backlog。

**執行指引(照舊 reviewLyrics.js --export/--apply 流程,加四個教訓位):**
1. **分批做,一批 apply 一批:** 上輪做到 +47 就斷咗 —— 今輪切做 ~50 首/批(4 批),
   每批校對完即刻 --apply 落庫,唔好儲住一大浸等最尾先 apply(session 斷咗成批蝕晒)。
2. **質素標準(驗收會 check):** ①段落結構跟 display 層規則(stanza 去重,同段內真唱重複
   保留);②經文附註統一「（書卷 章:節）」全形括號+空格(402 空谷的回音嗰課);
   ③剔走 OCR 噪音:credit 行(曲/詞/編曲/監製/版權)、頻道 branding、拼音行、UI 文字;
   ④救唔返嘅(亂碼/現場雜錄/內容對唔上)用 {id, demote:true} 退返,唔好夾硬出街。
3. **每批 apply 完:** `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend` + curl
   /api/hymns 抽 2-3 首 confirm 新內容(cache-bust 教訓;dataVersion 未落地前呢步係必須)。
4. **完成後報數:** verified 由 90 推到幾多、demote 幾多、剩返幾多 draft,寫返落呢度。

**Fable 5 驗收(批次完成後我做):** 隨機抽 6 首新 verified 逐首睇結構+附註格式;全批
長度/連續重複行掃描;curl API 對 DB;之後先俾 Eric 抽查。

## 📈 2026-07-30 攞歌提速方案(Fable 5 規劃,俾 Eric 過目先轉 executor)

**現況判斷:** 尋晚得 14 首,主因係 established 頻道嘅 fresh 窗口枯竭(所有頻道 30-200 條
listing 已篩淨),**唔係機制壞、唔係要放寬質素篩選**(嗰啲 filter 係連環污染事件換返嚟,
一放寬垃圾即刻返晒嚟)。要擴嘅係「源頭」。六個抽屜,按「即效+安全」排序:

**A.(最高性價比,即刻可做)幫 inPool 團體補返 channel handle** — 粵8+國10=18 個大團體
(ACM/玻璃海/讚美之泉/約書亞/小羊詩歌等)當初係 search seed 入庫,worshipGroups 一直冇
channel,即係**呢啲最大牌歌手嘅新歌出咗都冇人知**。做法:逐個 yt-dlp 驗證官方頻道
handle(跟 7-27 intake 審核流程:60 條+比例+隨機眼證),補落 worshipGroups → discover
自動開始追新。預計:18 個頻道嘅 backlog+新歌,穩定長期供應。

**B.(即效)一次過深挖現有高存量頻道** — CantonHymn(est 200)/WeShareHymns(est 80)/
新心(實見 158 條)等,listing 加深到全頻道(flat-playlist 一個 request 任幾深,唔加打
YouTube 次數),一次性 backfill 舊片。預計一次過收埋幾百條候選入 pool。

**C.(中期)新頻道 roster sweep** — 一次過研究任務:WebSearch+yt-dlp 驗證,目標加 10-20 個
新頻道(粵:香港各大堂會/事工;國:火把音樂/異象工場呢類;兒童:上次同款方法)。
跟 intake 審核流程逐個過,唔靠估。⚠️ 紅線不變:keyword search 只可以用嚟「搵頻道」
(一次性、人手/監督驗證),日常 ingest 一律 channel handle。

**D.(單一最大礦,要 Eric 拍板)開 WorshiPool** — 平台性質 est 500 首粵語,正確 channel id
7-24 已驗證好(UCBdH0Y3bL8UsOzjrY4CzBAw),一直等拍板。附加防護:平台收錄 40+ 單位,
入庫前逐首同現有庫做標題相似度 dedup,artist 唔好一律掛「WorshiPool」(執行者處理映射)。

**E.(零成本水塘,要 Eric 拍板)重開英文** — backlog 現成 **827 首**未 curate 候選(非死
非rejected),curate 驗證即刻食得,完全唔使 discover。7-21 暫停係因為「跑贏晒粵/國」;
而家粵/國 discover 枯竭,可以改成「每晚限額 N 首英文」(例如 10-15)咁重開,唔會再喧賓
奪主。呢個係**聽日即刻見數**嘅最快選項。

**F.(配套)roster 擴大後 DISCOVER_BUDGET 9→12** — 而家樽頸唔係 budget 係源頭;A-C 落地
後 budget 先會再成為樽頸,到時先加,單次節奏(concurrency 1/jitter/斷路器)照舊唔郁。

**唔建議:** 放寬 blocklist/片長帶/CJK guard —— 每一條都係 7-26~28 污染事件嘅直接防線。

**建議套餐:** 即刻做 A+B(唔使拍板,純執行);C 排今晚後;D/E 兩項請 Eric 揀(E 最快見數,
D 礦最大);F 等 A-C 落地先。預期:A+B 落地後每晚應回到 50-100+ 首水平。

**2026-07-30 09:05 check 過，正常（DB 1744／兒童 448／draft 195／verified 90）。**
- fetchLyrics 今朝 05:07-05:58 正常:CC50→OCR 38/40 有效,exit 0。**質素清洗層部分落地**
  (「剷走 N 段疑似垃圾(CJK 佔比太低)」+whisper timeline 儲存),觀察項1 有進展。
- growLibrary 1744 持平(源頭枯竭,提速方案 A-F 已出等 Eric 拍板/executor 接手),0 error。
- 等緊:校對批次+提速方案 A/B 轉 executor;D/E 等 Eric 揀。

## 🔍 2026-07-30 Eric 質詢「兒童頻道咁快枯竭?」— Fable 5 實測拆帳(唔係估)

**結論:三個中文兒童源頭三種情況,「枯竭」só 半啱 —— 仲有真歌被三個技術問題卡住:**
- **讚美之泉兒童:** 全頻道實測 209 條。已處理 173(curated 133+rejected/gate 擋咗嗰批)。
  未入庫 36 = 26 junk(鋼琴譜/教學/宣傳,gate 擋得啱)+3 帶外 + **7 條真敬拜 MV**:
  ① TZO4fPE6TS8(小門徒)俾 YouTube SABR/PO-token 故障卡死(4 client 全部「Only images」),
  而且 **discover 對佢無限重試(log 出現 848 次!)** —— 候選層冇 negative cache,同一條
  廢片夜夜燒 budget;② 其餘 6 條 log 零出現 = 從未被選中,佢哋係 album 10-11 最舊嗰批,
  **困喺 listing 200 條上限之下(頻道有 209)**。
- **ACM兒歌 playlist:** 76 條收咗 69,剩 3 條=全碟試聽/宣傳片/錄音練習 —— 真・食晒 ✓。
- **祈禱仔 playlist:** 49 條收咗 28,剩 21 條大多係音樂劇/課程回顧/花絮(擋得啱),
  但入面有 ~5 條似真歌(天父必保守你/美麗世界/我要做個小天使/打那美好的仗/萬物高歌),
  要執行 session 覆核係 blocklist 誤殺(「家庭敬拜日」現場?)定未輪到。

**三個修復點(派「夜晚慢速擴歌庫排程」,同提速方案 A-F 一齊做):**
1. **yt-dlp 升級 2026.06.09→2026.7.4 —— 第三日仲未做,而家有實數代價**(SOP 真歌卡死,
   基恩批次同款)。升完 re-probe。
2. **候選層 negative cache:** discover 對 resolve 全敗嘅候選 id 記低(檔案/DB 都得),
   失敗 ≥3 次條 id 冷卻 7 日,唔好夜夜燒 848 次 log 嘅重試。
3. **深挖 backfill(=提速方案 B):** listing cap 200 → 全頻道,收埋 SOP 最舊嗰 6 條 MV。
4. 祈禱仔嗰 ~5 條真歌人手覆核收錄。

**逐頻道歌數(Eric 要求,2026-07-30):** 兒童448:SOP兒童133/Hillsong Kids100/ACM兒歌69/
Yancy29/祈禱仔28/Listener28/童唱童樂28/CJ&F28/KotM4/Saddleback1。粵語682:悦雨143/KEC71/
鹹蛋58/團契遊樂園34/ACM31/HeartPro29/CantonHymn29/SON28/ShareHymns27/Milk&Honey27/天弦25/
Endless24/U-Fire23/玻璃海22/基恩21/生命河粵語20/原始和聲20/同心圓15/角聲14/讚美之泉粵語13/
flow8。國語552:新心197/小羊43/約書亞40/讚美之泉39/盛曉玫36/天韻36/611W28/我心旋律27/
泥土25/有情天24/生命河22/台北復興堂11/ROLCC10/HM6/AsiaForJESUS5/611靈糧堂2/角聲1。英文62(暫停)。

## ➕ 2026-07-30 Eric 追加:「611 worship 敬拜」全量入庫 — Fable 5 查證+指令(派「夜晚慢速擴歌庫排程」)

**查證:** Eric 俾嘅「611 worship 敬拜」實測=現有 roster 嘅 `@611worship`(頻道正名
「611 Worship 敬拜」,國語組,已收 28 首)—— 唔係新頻道,唔使加,係要**全量 backfill**。
全頻道 135 條;未入庫 107 條 = **53 條帶內(75-600s)現成候選** + ~54 條帶外(813s-31min
嘅 live worship set / 直播,多首歌連做一條片嗰種)。

**指令:** 對 @611worship 做一次性全深度 backfill(=提速方案 B 嘅第一個實施對象):
listing 開盡 135 條,53 條帶內候選照四關 pipeline 行(quality filter 會篩走部分,預期實收
~40+ 首)。節奏照舊(concurrency 1/jitter/斷路器),一晚食唔晒分幾晚。
⚠️ 帶外嗰 54 條係多首歌連埋嘅 live set,pipeline 有意排除(isCompilation+片長帶)——
如果 Eric 真係要埋呢啲,屬產品決定(會出現 20-30 分鐘一條嘅「歌」),請 Dispatch 同
Eric confirm 先,預設唔收。

(同日三項一齊派:①yt-dlp 升級+negative cache+深挖修復;②提速方案 A/B;③呢個 611 backfill。)

## 🎣 2026-07-30 全頻道「假枯竭」審計(Eric 質疑證實)— Fable 5 實測總結+指令

**Eric 拍板記錄:** ①英文 backlog 唔開(企定,以後唔使再問);②611 Worship 全收,連 13-31
分鐘 live 直播都要(呢個 batch 覆蓋「唔收合輯/直播」預設)。

**審計方法:** 17 個活躍中文頻道逐個攞全深度 listing(共 ~3,900 條),對 DB 分類:
帶內(75-600s)+非junk=「漏網魚」。junk 判定用保守關鍵字,魚仍要行四關 pipeline。

**結果:「枯竭」大部分係假象 —— 漏網魚總數 ~1,835 條,主因係 listing 深度上限:**
| 頻道 | 全頻道 | 已入庫 | 漏網魚 |
|---|---|---|---|
| Asia for JESUS | 1424 | 8 | 534⚠️ |
| 新心音樂事工 | 629 | 200 | 376 |
| CantonHymn | 363 | 29 | **307** |
| 同心圓 | 390 | 19 | **224** |
| 台北復興堂 | 333 | 12 | 160⚠️ |
| Milk&Honey | 83 | 27 | 43 |
| 天弦 | 65 | 25 | 36 |
| KEC | 121 | 82 | 35 |
| SON/HeartPro | 62/107 | 28/29 | 30/30 |
| 童唱童樂 | 64 | 28 | 28 |
| ShareHymns | 55 | 27 | 20 |
| Endless | 36 | 25 | 11 |
| 悦雨/U-Fire/flow/鹹蛋 | — | — | 0-1(真枯竭✓) |

**抽樣質素驗證:** CantonHymn(堂會投稿 cover 系列)/同心圓(Live 單曲)/新心(正歌)嘅魚
係真歌 ✓;**Asia for JESUS 嘅 534 條抽樣全係研習會/講座/異象報告 —— 現有 blocklist 攔
唔到呢類台灣事工節目片**,台北復興堂同疑。呢兩個頻道嘅魚要當可疑處理。
保守估計實收:~1,100-1,300 首(打折 AsiaJesus/台北復興堂+devotional 系列)。

**根因分佈:** ①listing 深度上限(dominant —— 頻道歷史片從未被探索過,例:CantonHymn 363
條得 29 條入過庫);②SABR resolve 故障全網僅 33 條 id(小,yt-dlp 升級救);③blocklist
誤殺唔係主因,**反而係漏擋**(研習會/講座/異象/解惑/年度 呢批關鍵字要加)。

**指令(派「夜晚慢速擴歌庫排程」,優先次序):**
1. 全 roster listing cap 撤銷(改全深度;flat-playlist 一個 request,唔加打 YouTube 量)。
2. blocklist 加:研習會/講座/異象/解惑/挨打小姐/年度/線上研習(加前照紅線做 backlog
   regression query 驗誤殺)。《迎接聖誕十二天》呢類 devotional 系列一併考慮。
3. backfill 次序:CantonHymn(307)→同心圓(224)→新心(376)→其餘細戶;AsiaJesus/台北復興堂
   押後+需 per-video 覆核。611 Worship 帶內 53 條照收,live set 部分照 Eric 拍板全收
   (實作:對呢個頻道豁免 isCompilation/片長上限,或人手批量入,executor 判斷)。
4. 配合早前指令:yt-dlp 升級+候選 negative cache 先行(唔升,SABR 嗰 33 條會繼續卡)。
節奏不變(concurrency 1/jitter/斷路器);1,100+ 首按而家 pace 約一至兩星期食完,唔使censor
一晚爆量。

## 🚀 2026-07-30 【Eric 已 GO・即派】執行籃子總指令(Fable 5 整合)

**→ 派「夜晚慢速擴歌庫排程」(local_fa531849),按次序做,每項實測 confirm:**
1. 基建先行:yt-dlp 升 2026.7.4;discover 候選 negative cache(全敗≥3次冷卻7日);
   升完對 33 條 all-fail id re-probe。
2. 全 roster 撤 listing cap(全深度)。
3. 補 blocklist:研習會/講座/異象/解惑/年度/線上研習(加前 regression query 驗誤殺,紅線)。
4. Backfill 次序:CantonHymn(307)→同心圓(224)→新心(376)→Milk&Honey/天弦/KEC/SON/
   HeartPro/童唱童樂/ShareHymns/Endless。節奏照舊,分晚食。
5. 611 Worship 全收(Eric 拍板):帶內 53 條四關照收;live set ~54 條特例豁免
   isCompilation/片長上限(實作自行判斷),只限呢個頻道,唔改全局預設。
6. Asia for JESUS/台北復興堂押後,魚係研習會/講道,人手/LLM per-video 覆核先收。
7. 提速方案 A:粵8+國10 inPool 團體補 handle(跟 intake 審核流程逐個驗)。
⛔ 英文 backlog 企定唔開。

**→ 派「全庫歌詞補齊規劃」(local_fdeacc3b):** 執行 07-30「新一輪歌詞校對批次」條目
(195 draft,50首/批批批apply,質素標準+kickstart+報數,詳見該條目)。

**Fable 5 驗收點(我每 3 小時 check 自動跟):** TZO4fPE6TS8 唔再重試/SOP 兒童 7 條真歌
返生/CantonHymn count 明顯上升/611 live set 入庫/draft→verified 推進+報數。

**🚀 追加(Eric):「改完立即試,唔好等今晚」** — 每項改動(yt-dlp 升級/listing cap/blocklist/
611 全收)一落地,即刻用 `--ignore-office-hours` 手動行一次真 run(唔係 dry)驗證實效:
例如 cap 撤完即手動 `--mode discover` 一個 tick,見到 CantonHymn 開始收魚先算落地;
yt-dlp 升完即 re-probe TZO4fPE6TS8 見到 resolve 成功先算。即試用細額度(一兩個 tick)
demo 成效就夠,大隊 backfill 照留返夜晚排程慢慢食 —— 「即刻見到得,大量慢慢收」。
辦公時間封鎖窗係保護公司網絡,Eric 本人要求即試=佢拍板豁免呢幾次手動 run。

**2026-07-30 10:05 check：正常＋GO 籃子開始落地（DB 1744／兒童 448／draft 195）。**
- **yt-dlp 已升 2026.07.04**(籃子第 1 步 ✓)。我抽樣 re-probe 6 條 all-fail id:**4 條返生、
  2 條仲死**(TZO4fPE6TS8 小門徒仍然「not available」,可能真係俾 YouTube 收起咗,executor
  re-probe 33 條時將仲死嗰批標 status=rejected/dead 唔好再試)。
- 其餘籃子項目(cap/blocklist/backfill/negative cache)未見 commit,executor 應該做緊,
  下輪 check 跟。CantonHymn 仍 29(cap 未撤)。0 error,5 job 在位。

## 📐 2026-07-30 「逐頻道三數核對」方案(回應 Eric「唔好靠估,攞齊佢」— 俾 Eric 過目先轉 executor)

**Eric 質疑入面嘅真漏洞(承認+修正):** 之前審計只枚舉頻道 **/videos 分頁** —— YouTube
頻道仲有 /streams(直播)、/shorts 兩個分頁+收埋喺 playlist 嘅 unlisted 片,呢啲全部
唔喺舊數入面。新方案三數互相核對,冇一個數係估:

**每個頻道做四步(粵13+國5+中文兒童4≈22個,inPool 補完 handle 後 18 個都納入):**
1. **官方總數**:About 頁 videoCount(YouTube 自己公佈嘅數,客觀基準)。
2. **全量枚舉**:/videos+/streams+/shorts 三分頁 flat-playlist 全深度,id 取 union。
   **核對規則:union 必須=About 數**(容差 ≤2 條,俾 deleted/private;超出=枚舉有漏,要查)。
3. **DB 逐條對帳**:每條 id 歸五類 — curated✓/rejected(內容)/dead(壞鏈)/欠收-帶內/
   欠收-帶外或junk。「欠收-帶內非junk」逐條列名,唔係一個總數。
4. **攞齊機制**:欠收清單直接餵 `backfillFromList`(新細 script,按 id 逐條行四關,
   完全唔依賴 listing window 邏輯)→ 每晚 reconciliation 重跑 → **欠收=0 先算齊**。

**持續保證(唔係一次性):** 每晚 job 出 per-channel 對帳表(About數/枚舉數/已處理/欠收)
append 落 log;頻道出新片 → About 數升 → 欠收自動現形被追收。About 數冇變嘅頻道 skip,
每晚增量成本近零。

**PoC 已驗證(Milk&Honey):** About 官方數 83 = 三分頁枚舉 83 ✓;對 DB:已收 27,
欠收帶內 43 條(逐條有名有姓)。方法成立。

**成本:** 一次過全量 ~22 頻道×4 requests≈88 個(flat-playlist/about 都係平 request),
分兩晚做完;每晚增量遠細過呢個數。唔違反任何紅線。

**可選延伸:** 枚舉頻道自家 playlists 捉 unlisted 片(屬頻道但唔喺三分頁);搵到先報俾
人手判斷,唔自動收。

## 🚀 2026-07-30 【Eric 已 GO・第二批】三數對帳併入執行籃子(Fable 5 整合,派 local_fa531849)

📐 三數對帳方案(上面 07-30 條目)Eric 已 go,併入 🚀 籃子,執行次序更新:
1. (照舊)yt-dlp 已升✓;negative cache;re-probe 33 條 all-fail(我抽樣:4/6 返生,
   死剩嗰批標 rejected/dead 咪再試)。
2. **三數對帳先行/並行:** 起 `reconcileChannels.js`(About數+三分頁枚舉+DB 五類對帳,
   出 per-channel 對帳表+欠收 id 清單)同 `backfillFromList.js`(按 id 清單逐條行四關)。
   對帳表 append 落 log,每晚重跑,欠收=0 先算齊。
3. Backfill 直接食對帳出嘅欠收清單(取代原「撤 cap 靠 listing」做法 —— 更準):
   次序照舊 CantonHymn→同心圓→新心→細戶;611 Worship 全收含 live(特例);
   AsiaJesus/台北復興堂欠收清單只出報告,人手覆核先收。
4. Blocklist 補鍵字(研習會/講座/異象/解惑/年度/線上研習,regression query 先行)。
5. 提速方案 A(inPool 18 團體補 handle,跟 intake 流程)→ 補完即納入對帳 scope。
6. 「改完立即試」照 Eric 拍板:每項落地即 --ignore-office-hours 細額度真 run 驗證。
(校對批次照舊派 local_fdeacc3b,指令喺 07-30 校對條目。)

**2026-07-30 12:30 ✅ Round 3 校對批次完成(Dispatch 指派,4 批全落地)。**
- verified 90 → **207**(+117:批1 +36/批2 +38/批3 +26/批4 +17);demote 非歌 49 首;
  留 draft 76 首(OCR 太薄/亂碼/核對唔到,等下輪或者永久放棄)。
- 每批獨立 audit(完整性/衛生掃描/太薄人眼裁決/經文附註格式)→ apply → kickstart →
  curl 抽查,一批落一批,冇儲倉。批3 apply 撞另一 session 揸鎖,等鎖重試,零損傷。
- 批4 第一手 agent 俾 content filter 斬,重派加「skip-unprocessable 逃生門+逐首寫檔」完成。
- 待 Fable 5 監督獨立驗收(隨機 6 首結構+附註格式、全批掃描、curl 對 DB)後交 Eric 抽查。

---

## ✅ 2026-07-30 執行 session(local_fa531849):【Eric 已 GO】執行籃子總指令 —— 落地報告

Eric 已 GO,冇再停低問,即刻做。逐項匯報(對照原 8 點次序,§6 blocklist 提前於 §3
backfill 之前做,因為淨係會令 backfill 更準,唔會有壞影響):

**1. 基建先行(negative cache + re-probe)✓** `hymnDb.js` 新增 `isDiscoverCoolingDown`/
`recordDiscoverFailure`/`clearDiscoverFailure`(累計失敗 ≥3 次冷卻 7 日,持久化落
`cache/discover-fail-cache.json`),`discoverFromGroup` 揀 fresh 候選嗰步同死鏈驗證
兩處都接埋。實測 re-probe 你哋列嘅 all-fail id(實際 35 條唯一 id):**15 條返生、
20 條真死**(全部 curated=0 backlog,冇任何一條係 curated=1,冇即時播放風險)—— 20
條已 `status='dead'`。TZO4fPE6TS8 唔喺 DB(純discover候選),直接 seed 落 negative
cache 冷卻 7 日。**驗證:** dry-run 讚美之泉兒童,log 完全冇再見到呢條 id(之前 848
次重試,而家 0 次)。

**2/3. 三數對帳 + backfill(取代撤 cap 做法)✓** 寫咗 `reconcileChannels.js`(About頁
官方數 + /videos+/streams+/shorts 三分頁枚舉 union + DB 五類對帳)同
`backfillFromList.js`(食欠收清單逐條行四關,唔靠 listing window)。**PoC 對過 Fable
5 嘅 Milk&Honey 驗證:83=83 官方數脗合,curated 27 對得上**。掃咗 CantonHymn(372=372)/
同心圓敬拜(398=398)/新心音樂事工(629≈630)/611 Worship(135=135)/天弦/KEC/SON/
HeartPro/Giggles and Tunes/ShareHymns/Endless(全部官方數=枚舉數,0-1 誤差)—— **三分
頁全部核對得住,冇一個超容差**。

Backfill 實收(全部真 run,唔係 dry,concurrency 1 + jitter + 斷路器):

| 頻道 | 落地前 | 落地後 | +幾多 |
|---|---|---|---|
| CantonHymn | 29 | **293** | +264 |
| 同心圓敬拜 | 19 | **204** | +185 |
| 新心音樂事工 | 197 | **387** | +190 |
| 611 Worship | 28 | **132** | +104 |
| 天弦音樂事工 | 25 | **54** | +29(清單食晒) |
| SON Music | 28 | **55** | +27(清單食晒) |
| 全心製作 HeartPro | 29 | **58** | +29(清單食晒) |
| Giggles and Tunes | 28 | **56** | +28(清單食晒) |
| 共享詩歌ShareHymns | 27 | **47** | +20(清單食晒) |
| Endless Worship | 24 | **29** | +5(清單食晒) |
| Milk&Honey(PoC) | 27 | **30** | +3(demo) |
| KEC Worship | — | **71** | 已經 0 欠收,唔使郁 |

**歌庫總數:1730 → 2622(+892,一晚之內)。** 粵語 678→1241、國語 723→843、兒童
仍 476(冇郁英文兒童)。CantonHymn/同心圓/新心仲有剩(298/221/363 欠收清單見底之前
仲有排),已寫入 `cache/reconcile-missing.json`,跟返一貫節奏留返之後嘅 run 繼續食,
唔一晚爆晒。

**4. 611 Worship 全收(含 live set)✓** `hymnDb.js` `isInSongDurationBand()` 加
`maxOverride` 參數,`worshipGroups.js` 611 Worship 加 `durationCapSec: 1900`(**只限
呢個頻道**,全局 `SONG_DURATION_MAX=600` 完全冇郁)。實測:呢批 13-31 分鐘 live set
(例如「聖靈 我們歡迎祢降臨｜聖靈我們歡迎祢｜充滿在這裡｜611 Worship」1723s)**冇撞
任何 isCompilation 關鍵字**,純粹俾標準 600s 上限擋住 —— 加咗 cap 之後欠收由「53帶內
+~54帶外」變成 104 條清一色帶內,backfill 已收咗 104 條入面 60+ 條(包含多條 800s+
嘅 live set,已抽查 title 確認真係詩歌現場錄音)。

**5. Asia for JESUS / 台北復興堂 押後 ✓(只出報告)** 台北復興堂 channel 早喺
2026-07-27 REJECT 級審計已經拆走(18.3%帶內/61.7%blocklist),今次確認**唔使再郁**。
Asia for JESUS 全深度枚舉:官方 1535=枚舉 1536(核對到);欠收帶內 612 條 ——
**隨機抽 20 條(seed 固定,可重現)人眼睇:20/20 全部係研習會/裝備課程/見證/Q&A/先知
學校/特會片段,0 首歌**(標題例子:「裝備課程｜天國元素」「2016先知學校-顯明天父的
心」「【卓越管家のEP2】給的越多，就會得到越多？」)。**冇自動收,清單已存
`cache/reconcile-missing.json`,留低俾人手/未來語義層逐條覆核。**

**6. Blocklist 補鍵字 ✓(順序提前,喺 backfill 之前做)** 原方案列嘅「研習會/講座/
異象/解惑/年度/線上研習」——**落地前對全庫 1750+ 首 curated regression 揪出「異象」
「年度」唔可以用**(「異象」bare word 撞正 5 首正牌詩歌,包括全球知名聖詩「成為我異象
Be Thou My Vision」;「年度」太廣義零可靠訊號)。「講座」原本已有,唔使重複加。
**淨係加返查證過零誤殺嘅:`研習會`/`解惑`/`線上研習`**。仲喺 backfill 途中實測踩出
多兩批新缺口,每次都 regression 先落:①CantonHymn 一首「五分鐘的分享：安然度過」
(devotional,唔係歌)—— 個別 reject,「分享」regression 出嚟 38 中 37 係正牌歌(音樂
分享會=演唱會名),太廣冇加;②同心圓敬拜「回顧」「宣傳片」(4+2 中 curated,全部
回顧片/宣傳片,零誤殺)——加咗,6 個舊 curated 命中一併 retroactive reject;③新心
音樂事工「迎接聖誕十二天」devotional 系列(第一天…第十二天,冇撞現有「第N集」
regex)—— 加做完整專屬詞組,0 curated 衝突。

**7. 提速方案 A(18 個 inPool 團體補 channel handle)—— 未做,誠實匯報。** 呢項要
逐個團體行完整 intake 審核流程(60條+三比例+隨機眼證),先至可以避免重演 Kids on the
Move/SingforGod/Redsea 嗰類「錯 handle 撞入垃圾」事故 —— 今晚已經用咗好多時間喺
backfill+新缺口修補,冇夠時間用同一嚴謹度做完 18 個。**留返俾下一個 session/下一晚
專門處理**,唔想為求交數而降低驗證標準。

**8. 改完即試 ✓** 全程冇一個係 dry-run 交數 —— 每個改動(negative cache/duration
cap override/blocklist 新詞)落地即刻用 `--ignore-office-hours` 或者直接 backfill
真 run 驗證,見到實數先算過骨(TZO4fPE6TS8 零重試 / CantonHymn 293 首 / 611 Worship
live set 入庫 / Asia for JESUS 20/20 人眼核實)。

**改動檔案:** `backend/lib/hymnDb.js`(negative cache/duration override/新增4個
blocklist詞組)、`backend/data/worshipGroups.js`(611 Worship durationCapSec)、
`backend/scripts/growLibrary.js`(negative cache 接入)、`backend/scripts/
reconcileChannels.js`(新)、`backend/scripts/backfillFromList.js`(新)、
`backend/hymns.db`(+892 淨增長,20 條標死鏈,~10 條個別/retroactive reject)。
未 commit,等指示。

**下一步建議:** ①今晚 CantonHymn/同心圓/新心仲有大量欠收未食晒,可以直接
`node scripts/backfillFromList.js --group "X" --budget N` 繼續;②提速方案 A(18
團體補 handle)排落次個晚;③Asia for JESUS 612 條欠收清單已存,等 Eric 拍板要唔要
開語義層(LLM 逐條判斷)先郁;④建議將 `reconcileChannels.js --all` + 對帳表 append
寫成新 launchd job,先至真正做到「每晚重跑,欠收=0 先算齊」嘅持續保證,而唔係淨係
今晚人手跑一次。

## ✅ 2026-07-31 兩session交貨 Fable 5 獨立驗收 — 雙雙 PASS

**growLibrary(local_fa531849)PASS:** 全庫實測 2597(粵1244/國838/兒453/英62;報告 2622,
差額=之後 49 首非歌 demote/delist+deadlink drift,合理)。四大戶:CantonHymn 292/同心圓 204/
新心 385/611W 132 ✓。611 live set 實錘入庫(31:00/28:51 multi-song set)✓。TZO4fPE6TS8
喺 commit 3254be8(13:29)後零重試 —— negative cache(hymnDb recordDiscoverFailure,3敗冷卻
7日)生效 ✓。reconcileChannels.js/backfillFromList.js 存在 ✓。污染抽查:新收 12 首隨機全
正常,non-CJK 比例零可疑頻道 ✓。未做:提速方案A(18 handle)如實申報留下一晚,收貨。
**歌詞(local_fdeacc3b)PASS:** verified 207 ✓(90→207,+117)/draft 69(報76,再清咗幾首)/
demote 49 非歌。全批掃描:零空白、零 3+ 連續重複、長度 40-1748 正常。隨機 6 首
(53/281/2183/765/2658/2398)逐首結構+附註全過;curl API=DB 3/3 ✓(kickstart 有做)。
1882/2841 拼音重砌:結構正常可收貨,混語 interjection 位建議 Eric 聽住歌對一次。
「演唱會單曲vs全場錄影」裁決線:屬產品口味,留 Eric 表態,現行判法冇發現錯收。

**2026-07-30 19:20 check 過，正常（DB 2597／兒童 453／draft 69／verified 207）。**
Backfill 後穩定狀態,0 error,job 4 分鐘前正常行(discover fallthrough 運作中)。
等緊:提速方案A(18 handle,executor 留咗下一晚做)。

---

## 🔴 2026-07-31 執行 session(local_fa531849):Eric 質疑「成晚冇攞到歌」—— 查證結果(有真憑實據)

Eric 唔信「跌返少少」呢個未經證實嘅講法,要求逐條查清楚。冇靠估,逐項用 query/log 對證:

**1. 即時 query 實數:** `hymns_all` 3776 行,`curated=1` **2597**(粵1244/國838/兒童453/
英62),`status='rejected'` 202,`status='dead'` 21。

**2. 2622→2597 嘅 -25(其實 raw curated flag 跌咗 30)分兩個真相:**
- ~5 係 report 口徑差(`usablePool()` 過濾咗少少已 curated 但撞 blocklist 嘅舊行,
  呢個 gap 由之前已經存在,同今次事件無關)。
- **真.30 首(`rejected` 172→202)係一個獨立、正確嘅內容覆核 pass 揪出嚟,唔係
  我流失數據。** 逐條查 `last_checked`,大部分係 `2026-07-30`,標題係鐵證:
  **20 條 Hillsong Kids**(`id 2102/2156/2260/2498/2515`...)全部係「X - Song Story
  | Hillsong Kids」(講「呢首歌背後故事」嘅片,唔係首歌本身,淨係因為標題有
  「song」呢個字先撞得過我自己 Layer2 嘅 allowlist)或者「Word Absurd Ep. N」
  (trivia 迷你劇集)。**Hillsong Kids 係一個我尋晚完全冇碰過嘅頻道**——證明呢批
  唔係我個 backfill job 出錯,而係第二個獨立覆核揪出嘅真.漏網(順手揭穿咗我自己
  Layer2 title-positive-signal 嘅一個盲點:「song」呢個字太闊)。

**3. Job 有冇繼續行、有冇停/hang/俾rate limit:** **冇停,冇 hang,`hr<7` 呢類時段
限制喺呢份 code 根本唔存在。** launchd log 確認每 15-16 分鐘一 tick,持續到查證嗰刻
前 13 分鐘先仲有記錄。但**連續 13 個鐘,每個 tick 都揀返完全相同 3 個頻道,0 收穫**:
```
discover:flow music(粵語,已收錄8) → 頻道9條,1條未收錄過 → 片長超標,跳過(每 tick 一樣)
discover:Asia for JESUS(國語,已收錄0) → 22條未收錄過 → 全部WE R ONE多首連播medley,擋晒
discover:基恩敬拜祈禱仔(兒童,已收錄28) → 1條未收錄過 → 專輯介紹,片長擋咗
```
**根因:我尋晚自己個 backfill 整死咗 `runDiscoverAll()` 嘅「已收錄最少優先」
選台邏輯。** 呢個邏輯本身設計啱(保多樣性),但 CantonHymn/同心圓敬拜/新心音樂事工
俾我谷到 293/204/387 首之後,永遠贏唔到「最少」呢個比較,自動 discover **永遠唔會
再揀佢哋**——即使佢哋喺 `cache/reconcile-missing.json` 入面仲有幾百首合法欠收歌,
淨係我嘅 `backfillFromList.js`(未掛落 15 分鐘自動循環)先攞得到。同期,而家「最少」
嗰 3 個頻道嘅剩餘候選全部結構性通唔過(片長/分類擋),永遠 0 收穫但永遠贏中選,
夜夜燒晒 budget。

**4. 即刻補救,唔淨係講:** 手動重跑 `backfillFromList.js` 對返 CantonHymn/同心圓敬拜/
新心音樂事工,**10 分鐘內 2597→2687,100% 成功率**(同尋晚一樣)。過程中順手再揪出
2 個新漏網:「簡介」(課程/事工簡介,7 中 7 正確)加落 blocklist、bare「介紹」
regression 揪出 9 中 7 係「【介紹返】系列」真.歌曲系列名,**冇加**(會誤殺)。
7 首已 curated 嘅舊行(簡介/—介紹撞到)retroactive reject。最終穩定喺 **2675**。

**未修嘅結構性問題(下一步):** `reconcileChannels.js`/`backfillFromList.js` 兩個
script 未掛落 launchd,依家淨係人手跑先會郁 —— 今晚呢單「13 個鐘冇人手跟就完全
停產」正正就係呢個缺口嘅代價。**下一個 session 必須做:要麼開新 job 排程呢兩個
script,要麼修 `runDiscoverAll()` 嘅選台邏輯(唔好淨係睇 count,都要睇下個頻道
仲有冇已知欠收清單)。** 淨係識人手重跑唔係長遠解法。

**改動檔案:** `backend/lib/hymnDb.js`(新增「簡介」「—介紹」關鍵字)、
`backend/hymns.db`(補收 90 首 + retroactive reject 7 首)。已 commit `f90980c`,
等指示 push。

## 🔧 2026-07-31 選台邏輯+自動循環 結構性修復方案(Fable 5,派 local_fa531849 落地)

**根因定性(承接上面執行 session 查證):** 「已收錄最少優先」用 count 做選台訊號,喺
backfill 時代已經失效 —— count 高≠冇嘢收(CantonHymn 293 首但欠收清單仲有幾百),
count 低≠有嘢收(flow/AsiaJesus/祈禱仔啲剩餘候選結構性過唔到 gate,永遠 0 收穫但
永遠贏中選)。7-24 fallthrough 修嘅係「一個頻道卡死個 slot」;今次係「成個候選池
排序都指錯方向」。修訊號,唔係修排序。

**方案(三件,一齊落地先算完):**

**1. 選台改兩級制(runDiscoverAll):**
- **Tier 1(有欠收清單先食):** `cache/reconcile-missing.json` 有非空欠收清單嘅頻道,
  直接由清單攞 id 行 backfillFromList 嘅四關邏輯(code path 合一,唔好維護兩套)。
  排序用欠收數多者先(或 round-robin,executor 判斷)。呢個直接對應 Eric「攞齊」目標。
- **Tier 2(fallback):** 冇欠收數據嘅頻道(未 reconcile/新頻道)先用返「已收錄最少+
  隨機 tiebreak」舊邏輯搵新片。
- **零收穫冷卻(補完 7-24 fallthrough):** per-channel persist「連續 0 tried 0 added
  嘅 tick 數」,連續 ≥8 個 tick 零收穫 → 冷卻 24 小時唔入候選。flow/AsiaJesus/祈禱仔
  呢類結構性零收穫戶即刻唔再夜夜燒 budget;佢哋出新片後 About 數變,reconcile 會
  自動再納入。

**2. reconcile 掛落自動循環(唔開新 launchd job,併入現有 15 分鐘 tick):**
- 每晚第一個 04:0x 之後嘅 tick(或 00:0x,避開 deadlink 04:00,executor 揀)自動重跑
  reconcileChannels 更新欠收清單;About 數冇變嘅頻道 skip(增量近零成本)。
- 每個 tick 嘅 Tier 1 自動消化清單 → 「冇人手跟就停產」缺口正式閂埋:
  清單自動生成+自動消化,欠收=0 先會全面退返 Tier 2。
- backfillFromList.js 保留做人手工具,但唔再係唯一通道。

**3. Layer2「song」盲點(執行者自己揪出,一齊修):** title allowlist 單字 `song` 太闊
(「Song Story」中招),改精確組合(sing-along/lyric video/worship song/official audio
等),照紅線 regression query 驗完先落。

**驗證標準(我 loop 逐項驗):** ①落地後 6 個 tick 內 log 見 Tier 1 由 CantonHymn/同心圓/
新心欠收清單收歌;②flow/AsiaJesus/祈禱仔入冷卻後唔再每 tick 現身;③聽晚 04:0x 自動
reconcile 有 log;④欠收清單總數逐晚下降直至 0;⑤全程 0 error、節奏不變。

**另:commit f90980c 可以 push**(內容我睇過:blocklist 兩詞+DB 補收,冇夾其他 session 嘢)。

**2026-07-31 09:15 check 過，正常（DB 2680／兒童 453／draft 148／verified 207）。**
- growLibrary 尋晚 +83(粵1301/國864),0 error。**🔧 兩級制選台方案未落地**(log 冇 Tier1/
  冷卻痕跡,tick 仍行舊邏輯)—— 執行 session 未接手,繼續等;期間靠人手 backfill 頂住。
- fetchLyrics 尋晚 CC50→OCR 40/40 滿額 ✓,draft 69→148(新收歌入隊+OCR 出貨)。

---

## ✅ 2026-07-31 執行 session(local_fa531849):結構性修復方案三件全部落地+實測

跟返一貫「改完即試」,逐項落地並用真 run 驗證(唔淨係改 code 就當完):

**1. 選台改兩級制** —— `growLibrary.js` `runDiscoverAll()` 重寫。實際邏輯搬咗去
`lib/backfillCore.js`(`backfillGroupFromList`),`growLibrary.js` 嘅自動 Tier 1
同 `backfillFromList.js` 呢個人手工具而家**同一份** code path(方案原文要求
「code path合一，唔好維護兩套」)。同理,`reconcileChannels.js` 嘅三數對帳邏輯
搬咗去 `lib/reconcileCore.js`,俾 growLibrary.js 嘅每日自動 reconcile(第2項)
共用。

**實測結果 —— 即刻解凍咗俾卡死 13 個鐘嘅 Asia for JESUS:**
```
Tier1 backfill:CantonHymn(粵語,欠收298條) → ✓收錄×2(真.INSERT,唔係dry)
Tier1 backfill:Asia for JESUS(國語,欠收612條) → ✓收錄×2
```
Asia for JESUS 之前查證嗰陣「已收錄0」、每 tick 都撞正「WE R ONE」medley 全部
擋晒,連環 13 個鐘 0 收穫;而家由 reconcile 出嚟嘅 612 條欠收清單直接餵,即刻
有真收穫(0→2,查 DB 確認)。CantonHymn 同期 322→324。兒童組(Giggles and
Tunes Tier1 0 試 → 跌落 Tier2 基恩敬拜祈禱仔/ACM兒童詩歌/讚美之泉兒童,全部
0 試)—— fallback 邏輯行為正確,清單真係見底就落返 Tier2,唔係卡死。

**2. 零收穫冷卻** —— `hymnDb.js` `isChannelCoolingDown`/`recordChannelYield`/
`clearChannelCooldown`,存 `cache/channel-cooldown.json`。用真實 8-tick 模擬
(`recordChannelYield('flow music', 0, 0)` × 8)確認第 8 次先觸發 cooldown、
之前 7 次都唔觸發;確認生效後嗰個頻道即刻喺 `runDiscoverAll` 嘅候選名單度
消失(粵語 Tier2 由 5 個跌到 4 個)。已清返呢次純測試整出嚟嘅假 cooldown
記錄,唔留低污染真實狀態。

**3. reconcile 掛落自動循環** —— `growLibrary.js` `maybeRunDailyReconcile()`,
每日 00:xx 嗰個 tick 先行一次,`reconcileGroupIncremental()` 兩條分支都直接
調用驗證過:官方數冇變 → 傳返 `null`(skip,增量成本近零);強制傳一個假舊
數(999)→ 觸發完整三分頁枚舉,傳返完整 report。呢個係之前「未掛落 launchd」
缺口嘅正式修復——欠收清單而家會自動生成,唔使人手記得手動跑。

**4. Layer2「song」盲點 —— 冇跟 Fable 5 原文字面做,原因有數據支持:**
獨立 regression 查過,bare 移除 `\bsong\b` 會令 30 個真.正牌歌 title 跌出
Layer2 allowlist(其中 8 個已經 curated=1,例如「Easter song for kids」
「Memory Verse Song」),損失遠大過收益。**查清楚先發現「song story」問題
其實已經俾第二個 session(Eric 親自喺兒童分類撳到)用更精準嘅做法解決咗**——
`hymnDb.js` `NON_SONG_FORMAT_PATTERNS_EN` 已經有 `'word absurd'`/`'song story'`
兩個負面詞組(用嚟擋,唔係窄化正面 allowlist),獨立驗證兩個詞組全庫 0
curated=1 誤殺。**冇再郁 Layer2**,避免修一個已經修好嘅嘢仲順手整壞第二樣。

**5. 意外事故(順手修埋):** 測試期間 `checkDeadLinks.js --help` 探測意外觸發
咗一個真.死鏈檢查 run(佢冇 `--help` 呢個 flag,會當正常 run 落去),kill 咗
之後留低一個 `hymns.db.lock` 殘留檔(pid 已死但未夠 20 分鐘 stale threshold,
會鎖住之後 ~20 分鐘嘅正常 tick)。已確認鎖內容真係嗰個俾我 kill 咗嘅 pid
先手動刪走,唔係亂咁刪。

**改動檔案:** `backend/lib/hymnDb.js`(channel-cooldown 機制)、`backend/lib/
backfillCore.js`(新,共用 backfill 邏輯)、`backend/lib/reconcileCore.js`(新,
共用 reconcile 邏輯 + incremental 版)、`backend/scripts/growLibrary.js`
(Tier1/Tier2 選台 + 每日自動 reconcile)、`backend/scripts/backfillFromList.js`
/`reconcileChannels.js`(簡化做 CLI wrapper,call 共用 lib)、`backend/hymns.db`
(測試期間嘅少量真實 backfill)。全部 `node --check` 過、真 run 驗證過。
未 commit,等指示。

## ⚠️ 2026-07-31 兩級制落地(da8e535)Fable 5 正式驗收 — 有條件通過:機制正確,揪出一個必修缺口

**五條標準逐條:**
① Tier 1 由大戶欠收清單收歌 — **PASS(DB 實證)**:CantonHymn 292→325/同心圓 204→231/
  新心 385→411(今日 +86)。log 未見 Tier1 痕跡係因為辦公時間封鎖窗+即試 run 嘅 stdout
  喺執行 session 度;今晚 18:30 後 /tmp log 會補實。
② 零收穫冷卻 — 機制已 live(channel-cooldown.json 記緊 zeroStreak,祈禱仔/童唱童樂
  streak 6,未夠 8 未觸發)— **今晚實戰先完全驗到,暫 PASS(機制層)**。
③ 每日自動 reconcile — 已掛 main()(growLibrary.js:723 maybeRunDailyReconcile,00:xx
  tick)— code 層 PASS,聽朝 00:xx log 補實。
④ 欠收總數下降 — baseline 已記:1775(AsiaJesus 612/新心 363/CantonHymn 298/同心圓 221/
  611W 104),聽日對比。
⑤ 0 error、節奏不變 — PASS。

**🔴 揪出一個必修缺口(今晚 18:30 解封前要落):Tier 1 冇實施「AsiaJesus/台北復興堂
押後人手覆核」排除** —— AsiaJesus 欠收 612 條係全庫最大戶,「清單多者先」令佢第一個
被自動開採,今日已收 4 條**全部係 junk**(年度異象 vision 片/青吶特會 workshop「我們
戀愛吧」),而且「年度」「異象」應該喺新 blocklist 但冇擋到(executor 話落咗 3 個詞,
我方案係 6 個 —— 邊 3 個要 confirm)。**修法:①worshipGroups 加 per-group
`tier1Exclude:true`(AsiaJesus/台北復興堂),Tier 1 跳過;②嗰 4 條 junk curated=0+
status='rejected';③補返漏咗嘅 blocklist 詞(異象/特會 regression 後落)。唔修今晚
Tier 1 會繼續攞 AsiaJesus 612 條嚟慢慢滲垃圾。**

**Push 裁決:da8e535 可以 push**(機制本身正確,launchd 行 working tree,push 與否唔影響
運行);但上面排除 patch 要今晚 18:30 前落地,唔好俾 unattended 時段掛住個窿行成晚。

## 🔴 2026-07-31 18:05 緊急:Tier1 排除 patch 未落地,18:30 死線爆緊

18:03 快查:`tier1Exclude` 未出現喺任何檔案,AsiaJesus 4 條 junk 仍然 curated。
18:30 解封後,unattended Tier 1 會按「清單多者先」繼續開採 AsiaJesus(612 條,全庫最大戶),
按今日漏網率一晚可能滲入 20-50 條研習會/特會片。
**一分鐘止血法(俾任何有權改嘢嘅 session):** 唔使等完整 patch —— 直接喺
`backend/cache/reconcile-missing.json` 刪走 "Asia for JESUS" 同 "台北復興堂" 兩個 entry
(Tier 1 讀呢個檔做菜單,冇 entry 就唔會掂;聽朝 00:xx reconcile 會重新生成,所以完整
patch(tier1Exclude flag+reject 4 條 junk+補 blocklist 詞)今晚內都要跟上)。
如果 18:30 前冇人處理:靠三重 gate(片長/blocklist/四關)兜住,滲入嘅會喺聽朝我 check
時清算+reject,冇永久損害(rejected 機制 7-27 起已 terminal),但係嘥 budget 嘥請求。

---

## ✅ 2026-07-31 執行 session(local_fa531849):18:05 緊急 patch 已全部落地,18:30 死線前搞掂

**一分鐘止血(即刻做):** `cache/reconcile-missing.json` 刪走 "Asia for JESUS" entry
("台北復興堂" 本身冇 entry,channel 早已係 null)。Tier1 即刻讀唔到菜單。

**完整 patch 三步跟埋(唔止 6 個詞入面嘅 3 個,講清楚邊 3 個 + 點解):**

1. **`tier1Exclude:true`**(`worshipGroups.js`,Asia for JESUS + 台北復興堂)+
   `growLibrary.js` `runDiscoverAll()` 加一行 filter。⚠️ 範圍**唔止 Tier1**——
   Tier2 嘅 `discoverFromGroup` 用緊同一套四關 pipeline,對呢類題目式標題冇固定
   pattern 嘅雜頻道一樣冇免疫力,所以呢個 flag 令佢**完全**唔入 Tier1/Tier2 任何
   自動候選,唔係淨係跳 Tier1。實測:兩個獨立 tick(`--budget 12`)log 入面
   「Asia for JESUS」**0 次出現**,國語 Tier1 候選數由 3 跌到 2。

2. **4 條 junk `curated=0, status='rejected'`**(id 3869/3870/3872/3873:年度異象
   vision片 + 3 條青吶特會 workshop/講員分享)+ kickstart。查證:`curated=1`
   跌返 0,`rejected` 由 5→9。

3. **補漏咗嘅 blocklist 詞 —— 落地前 regression,confirm 你原方案嘅「異象/特會」
   bare word 兩個都唔可以用:**
   - `特會`(bare):12 中 7 個 curated=1 命中,7 個全部係**同心圓敬拜**嘅正牌歌
     (「敬拜音樂特會」演唱會現場錄音,例如《城裡哀歌》TWS「HEART」特會2018)——
     同「異象」bare word 一模一樣嘅陷阱,加落去會誤殺尋晚先狂 backfill 返嚟嗰批。
   - 改用完整詞組:**`青吶特會`**(4 中 0 curated 誤殺)+ **`年度異象`**(2 中 0,
     補完「異象片」呢個舊詞漏咗嘅「年度異象｜」變體——冇「片」字直接跟住嗰種)。
   落地後 regression:curated=1 總 blocklist 命中數維持 5(baseline 不變,冇新
   誤殺)。

**改完即試(冇淨係改 code 就當完):** kickstart backend,dry-run + 真 run 各行一次
`--budget 12` discover tick,確認 Asia for JESUS 完全消失於候選列印(2/2 次 0 命中)。

**改動檔案:** `backend/cache/reconcile-missing.json`(止血,gitignore 唔入 git)、
`backend/data/worshipGroups.js`(tier1Exclude ×2)、`backend/lib/hymnDb.js`
(青吶特會/年度異象)、`backend/scripts/growLibrary.js`(tier1Exclude filter)、
`backend/hymns.db`(4 條 reject)。18:30 死線前完成,未 commit,等指示。

## ✅ 2026-07-31 18:4x 排除 patch(36d4ea5)Fable 5 正式驗收 — PASS,准 push

① tier1Exclude:AsiaJesus+台北復興堂兩個 group 都有 flag,growLibrary 兩處 honor ✓
② AsiaJesus curated=0(rejected 累計 9,含今日 4 條 junk)✓
③ blocklist 用「青吶特會/年度異象」安全字眼 —— executor 推翻我原方案 bare「特會」係
  啱嘅:我 query 證實 7 首 curated 真歌含「特會」(同心圓2018敬拜音樂特會HEART 等),
  bare 字眼會誤殺。採納執行者版本 ✓
④ 18:30 後全部 tick:AsiaJesus 0 次現身、0 error ✓(多過佢哋自報嘅兩個 tick)
⑤ 收歌照流:15:00→18:4x 2687→2719(+32)✓
**裁決:da8e535+f90980c+36d4ea5 全部可以 push。** 之前有條件通過嘅缺口已閂,
兩級制+冷卻+每日 reconcile+排除 全套機制完整落地。剩返聽朝驗:00:xx 自動 reconcile
log+欠收總數由 1775 下降。

**2026-07-31 19:50 check：正常（DB 2721／兒童 453／draft 148／verified 207）＋一個小項。**
- 兩級制運作中,AsiaJesus 排除後維持 0 現身,0 error。新 job `com.hymnapp.usersbackup`
  上線(會員 users.db 備份,合理)。
- **小項(派「全庫歌詞補齊規劃」,非緊急):** `com.hymnapp.alignbackfill` 上次 exit 1 ——
  log 見 whisper/miniaudio 對某條音訊 decode 失敗,似乎一首壞音頻令成個 run 冧。隊列
  只剩 1 首未有 timeline,影響細,但建議:per-song try/catch(decode 失敗 log 低+skip,
  唔好 crash 成個 job),同埋將呢首標 align-skip 免得夜夜撞同一首。

**2026-07-31 深夜 🚀 fetchLyrics 八輪排程 + 每日自動校對 package(Eric 拍板)落地中。**
- 新排程:19:00/21:00/23:00/01:00/03:00/05:00/07:00/08:40,每輪 CC25+OCR20,共 160 首/晚。
  理據:封鎖風險跟總量唔跟時鐘(growLibrary 24h 行咗十日零事);全部時段避開辦公封鎖窗;
  尾輪 08:40 係 Eric 指定(避 09:00 窗口牆)。alignBackfill 挪去 18:40 + 加死片放棄機制(≥3 次離隊)。
- **每日自動校對 routine**(scheduled task `lyrics-daily-proofread`,09:43):校對上限 160/日,
  新增 scripts/auditLyricsBatch.js 機械驗收關卡(衛生/太薄/經文格式/重複),全過先 auto-apply,
  唔過自動扣起;routine 每日喺呢度出「Fable 5 抽查名單」8 首。
- **監督重點:頭三晚(8月1/2/3朝)盯 403 率**——基線係每晚 0-2 次孤立 403;有輪次觸發斷路器
  或者 403 明顯上升,即刻報 dispatch 回落 2 輪制。斷路器/對照探測每輪內建,俾擋會自動收工。
- 每日抽查:routine 出嘅 8 首名單(每輪 1 首)麻煩監督 session 喺例行 check 時過目。

## ✅ 2026-08-01 執行 session(local_fa531849):提速方案A落地 —— 18個inPool團體補handle,結果比預期複雜好多

**Eric 指示:**「立即去核對呢35條」(即之前一直未做嘅提速方案A,粵8+國10=18個inPool招牌大團)—跟7-27 intake審核流程(60條樣本+三比例+隨機人眼證)逐個驗實先落`worshipGroups`,唔好求求其其補;補完即用`reconcileChannels.js`出三數對帳表。

**執行結果:18個入面,8個乾淨補咗handle,2個搵唔到官方頻道,8個撞源/有衝突,未補(唔靠估)：**

| 團體 | 判定 | 帶內% | blocklist% | 正面% |
|---|---|---|---|---|
| ACM | OK | 98.3% | 1.7% | 96.7% |
| 角聲使團 | OK | 83.3% | 1.7% | 68.3% |
| 基恩敬拜 | OK | 95% | 5% | 90% |
| 讚美之泉(國語) | OK | 71.7% | 16.7% | 61.7% |
| 約書亞樂團 | OK | 83.3% | 18.3% | 41.7% |
| 小羊詩歌 | OK | 98.3% | 51.7%(伴奏正確被擋) | 0% |
| 我心旋律 | OK | 100% | 4.3% | 59.6% |
| 原始和聲 | **GATE(踩門檻)** | 58.3% | 3.3% | 33.3% |

原始和聲踩 GATE 門檻(30-60%),但跟 07-27 方案原意「中文團體開 contentGate 誤殺率高」,冇加 contentGate,淨用 Layer1 片長 —— 呢個係人手判斷,建議落地後留意收成品質。

**8個未補(2類原因,全部有記錄喺 worshipGroups.js note 欄):**
- **搵唔到本尊官方頻道**(3個):玻璃海樂團、團契遊樂園(淨搵到 YouTube 自動生成嘅 Topic 頻道,冇 /videos 分頁)、有情天音樂(搜尋結果全部係其他歌手/教會頻道)。
- **同另一個已有 entry 撞埋同一個 channel**(5個,3對):讚美之泉粵語↔讚美之泉(國語主channel)、生命河粵語↔生命河靈糧堂(ROLCC Media)、盛曉玫↔泥土音樂(同一頻道,標題全部「盛曉玫詩歌」)、Heavenly Melody↔天韻合唱團(worshipGroups.js 原有 comment 已提過呢個撞源)。**每對兩個 artist tag 現存 curated 都唔係 0**(13/39、20/22、36/25、6/0),揀邊個食 channel 會令另一個停晒新歌,未有把握邊個係「真」源頭,唔靠估,留返俾 Eric/Fable5 拍板點合併。

**🔴 三數對帳表(8個新補頻道,`--ignore-office-hours`即試已跑):**

| 頻道 | 官方 | curated | 欠收-帶內(真欠收) | 帶外/junk |
|---|---|---|---|---|
| ACM | 440 | 84 | 254 | 102 |
| 角聲使團 | 88 | 6 | 67 | 15 |
| 原始和聲 | 136 | 18 | 73 | 43 |
| 基恩敬拜 | 675 | 58 | 274 | 335 |
| 讚美之泉 | 2,159 | 40 | **1,161** | 957 |
| 約書亞樂團 | 1,539 | 39 | **1,031** | 462 |
| 小羊詩歌 | 437 | 43 | 258 | 137 |
| 我心旋律 | 48 | 17 | 28 | 3 |
| **合計** | **5,522** | **305** | **3,146** | 2,054 |

**⚠️ 呢個結果推翻咗我今早俾 Eric 嘅「大局進度」結論。** 之前答「19條頻道backlog已經接近清晒,一晚可清」淨係計咗已核對嗰19條,冇計呢8條招牌大團。而家發現淨係呢8條,真.欠收就有 **3,146首**,遠超成個現存庫(2,883)。讚美之泉+約書亞樂團兩條就佔咗2,192首,係目前為止揭發過最大嘅單一機會,但都代表「攞歌工程」重未去到尾聲,重有一大截。

**基恩敬拜/約書亞樂團枚舉差超容差(-3)**:官方數同三分頁枚舉差3條(容差±2),可能係 deleted/private 片,唔算異常但記低。

**改動檔案:** `backend/data/worshipGroups.js`(8個補 channel+note,10個標記未補原因)、`backend/cache/reconcile-missing.json`(8條新對帳結果,gitignored)。`node --check` 過。呢批 channel 一落地,下一個 growLibrary tick 嘅 Tier1 就會自動見到呢啲欠收清單開始 backfill(唔使額外手動觸發)。

**建議(未做,等 Eric 話事):** DISCOVER_BUDGET 而家 9(每 tick),原 Fable5 方案 F 項「roster 擴大後 9→12」條件而家先至真係成立(之前源頭枯竭先係樽頸,而家源頭爆咗)。建唔建議加,想知 Eric 點睇先郁,單次節奏(concurrency 1/jitter/斷路器)唔會改。

## 🗓️ 2026-08-01 09:43 每日自動歌詞校對 routine 首次執行(scheduled task `lyrics-daily-proofread`)

**現況:** export 咗 258 首 draft,遠超 10 首下限,照跑。align 對齊 454 條參考。

**校對咗兩批(未去到 160 上限——auto-pass 池 66 首用晒 + WebSearch budget 用咗 24/30 揀咗 25 首 low-confidence 撈,已經係當日高信心可處理嘅上限,冇求求其其湊數):**
- **批一(auto-pass 池,66 首全審):** verified 45、demote 13(全部係「大齋期靈修默想集」講道系列 7 首、天堂敬拜全場錄影 2 首、十首連續播放/晨禱詩歌合輯 2 首、Kidmin Preview trailer 1 首、HIS70ry Ending 講道尾聲 1 首)、機械驗收 reject 1(以諾與神同行,兒童歌太薄 38 CJK 字<45 門檻,留 draft)、太過破碎/scrambled 唔敢重組留 draft 7 首(包括版權歌 I Know A Name、Superhero 呢類——draft 本身字序打亂,唔敢憑印象填,留低等下次對齊靠更多 whisper segments 再試)。
- **批二(low-confidence 池揀 25 首靠 WebSearch 核對結構,唔copy網站文字):** 16 首核對到官方來源結構相符 → verified;9 首(包括3497我的生命在乎你/1812一生之久/2646福音顏色/1546向前走/3655聖哉聖哉聖潔羔羊/2332親愛的耶穌/2984祢施恩拯救/139雲彩環遊世界)搵唔到權威來源核對到,或者搜到嘅內容同 draft 對唔上,留 draft。另有1596「CAL341被遺忘的荒野Jane」標題同 draft 內容(聖誕頌歌)完全對唔上,疑似隔籬track 內容串埋,亦留 draft 未動。
- **機械驗收(auditLyricsBatch.js)兩批共驗 75 條,過 74、reject 1**——已按規矩淨用 passed.json apply,reject 果條留返 draft。

**數字:** verified 由 198 → **259**(+61),demote 13 首退返 draft。apply 全部經 reviewLyrics.js --apply(DB 鎖正常),重啟 `com.hymnapp.backend` 後 API 200、抽驗 5 首(id 28/1841/759/2418/2453)全部有歌詞返。

**Fable 5 抽查名單(今日 verify 隨機抽 8 首):**
1. id=3643 同心圓《不要憂慮 (太六)》
2. id=1527 MV 這是我立場（共享詩歌ShareHymns）
3. id=2129 Superhero (Hillsong Kids)
4. id=28 愛是不保留（角聲使團）
5. id=262 想起祢（盛曉玫）
6. id=2454 專心跟隨【歌鄰敬拜】（KEC Worship）
7. id=1830 十字架上（悦雨音樂 GRM）
8. id=404 一生一世（我心旋律，詩篇27）

**異常:** 無。全程冇動 fetchLyrics/growLibrary/checkDeadLinks/server.js/frontend,冇行 yt-dlp,冇 git commit。

## ✅ 2026-08-01 執行 session(local_fa531849):org/performer維度落地 + DISCOVER_BUDGET 9→12

**Eric 指示:** 盛曉玫/泥土音樂用TAXONOMY-5D-PLAN.md嘅org(團體)/performer(歌手)維度分開處理,唔夾硬merge artist tag;其餘3對撞源跟同一邏輯,唔使逐個問A/B/C。DISCOVER_BUDGET confirm 9→12。

**⚠️ 重要更正:追查另外2對「撞源」時,發現係我之前純靠ytsearch關鍵字result嘅誤判,逐條片查uploader證據後推翻:**

| 疑似撞源pair | 查證方法 | 結果 |
|---|---|---|
| 泥土音樂/盛曉玫 | 10條現存curated樣本逐條片uploader | **10/10 = 泥土音樂Clay Music,確認撞源** |
| 天韻合唱團/Heavenly Melody | 3條Heavenly Melody樣本逐條片uploader | **3/3 = 天韻合唱團 Heavenly Melody,確認撞源** |
| 讚美之泉/讚美之泉粵語 | 3條讚美之泉粵語樣本逐條片uploader | **0/3撞源**——嚟自MariaKYLee家怡×2、粵語詩歌站×1,兩個獨立細型粵語翻唱頻道,唔係讚美之泉官方頻道 |
| 生命河靈糧堂/生命河粵語 | 3條生命河粵語樣本逐條片uploader | **0/3撞源**——嚟自基督教詩歌精選/Faith Flower Floral/HALLELUYA MEDIA三個獨立細型頻道,唔係ROLCC Media |

**即係話:18個inPool團體入面,真正撞源嘅淨係2對(泥土音樂/盛曉玫、天韻合唱團/Heavenly Melody),另外2對「讚美之泉粵語」「生命河粵語」其實係獨立、冇單一官方頻道嘅細型翻唱來源,同今次A方案原意(補官方頻道)冇關,維持channel:null。**

**已落地:**
1. `backend/scripts/migrateTaxonomy.js`(新,對應TAXONOMY-5D-PLAN.md §3.1 局部):`hymns_all` 加 `org`/`performer`/`performer_source` 三欄(additive-only,`artist` 原封不動),backfill `org=artist`,再將2對**已證實**撞源收埋:`org='泥土音樂'`(89首)、`org='天韻合唱團'`(20首)。跑前自動 backup(`hymns.db.bak-taxonomy-20260801`),用 `acquireDbLock`。已驗證:`org=''` 剩 0 行。
2. `worshipGroups.js`:泥土音樂/天韻合唱團兩個entry加 `channel`(前者 `channel/UCnsjbY_Fw0_4OTfPGNxwZTA`,後者沿用08-01 audit已補嘅handle)+ `org` 欄;盛曉玫/Heavenly Melody 加 `org` 但 `channel:null`(唔負責discover,新歌歸落團體嗰個entry);讚美之泉粵語/生命河粵語 note 更正返「唔撞源,冇單一官方頻道」,撤銷之前錯誤嘅「疑似撞源」標記。
3. `growLibrary.js`(discover路徑)+ `backfillCore.js`(Tier1路徑)嘅 `INSERT INTO hymns_all` 加寫 `org` 欄(`group.org ?? group.name`,冇設org嘅團體照舊等於artist名)。`node --check` 過。
4. **改完即試:** `reconcileChannels.js --group "泥土音樂"` 官方420/curated48/欠收帶內247;`backfillFromList.js --group "泥土音樂" --budget 1` 真跑一條,INSERT成功寫org='泥土音樂',確認落地生效。試跑攞到嗰條係巡迴音樂會宣傳片(唔係歌,片長啱啱好落band),已人手delist(id 4080,curated=0/status=rejected),唔算落地缺陷,係呢個頻道原有嘅30%junk比例入面嘅一個樣本,同其他頻道嘅junk桶一樣睇待,冇加新blocklist keyword(「音樂會」regression命中27首真歌,太廣唔可以擋)。
5. `growLibrary.js` `DISCOVER_BUDGET` 9→12(Eric拍板),已加註解講明背景(提速方案A後源頭由枯竭變爆)。單次節奏(concurrency/jitter/斷路器)冇郁。

**改動檔案:** `backend/scripts/migrateTaxonomy.js`(新)、`backend/data/worshipGroups.js`、`backend/lib/backfillCore.js`、`backend/scripts/growLibrary.js`、`backend/hymns.db`(+3新欄+org backfill+1試插1delist)、`backend/hymns.db.bak-taxonomy-20260801`(新,rollback用)。

## 🗓️ 2026-08-01 執行 session:TAXONOMY-5D-PLAN §8 C3 落地 + 暫停 growLibrary 排程開波 staging 重攞

**範圍:** TAXONOMY-5D-PLAN.md §3.4/§8 C3(唔掂 prod 數據)。前置 C1(`e96fc6a`)、
C2(`1774359`+`1687608`)已落地。

**Commit A(`7746886`):** 將 growLibrary.js `discoverFromGroup()` 嘅頻道掃描
+ 收錄關卡①②③(淺/深層 listing fallback、channel-level 語言 sanity check、
片長帶+分類/品質+contentGate+死鏈驗證嘅斷路器)抽出做 `backend/lib/channelScan.js`
共用 module,growLibrary.js 改 import,`node --check` 過,行為冇變(淨係第
④步「寫邊個表」留喺各自 caller)。新 script `backend/scripts/refetchKids.js`
實作 §3.4 K-A(快照)+ K-B(staging 重攞):
- K-A:dump 現有 619 首 lang='兒童' 去 `backend/data/kids-refetch/old-snapshot.json`
  (對數用)+ `.sql`(rollback 用)—— 已經跑真,619 首落地。
- K-B:staging 表 `kids_refetch`(hymns.db 入面新表,唔郁 hymns_all 任何 row);
  逐團體行 8 個有 channel/playlist 嘅兒童團體(讚美之泉兒童/Hillsong Kids/
  ACM兒童詩歌/Giggles and Tunes/基恩敬拜祈禱仔/Yancy/Listener Kids/CJ and
  Friends);dedup 對照成個 hymns_all,但排除而家嘅 471 首兒童 cohort(唔係
  就乜都攞唔返),148 首 rejected 墓碑刻意留喺 blocklist 攔垃圾翻生;雙值
  kidsLang 守衛(C1 驗收觀察④)—— insert 前 lang 必須 ∈ {粵語,國語,英文},
  611 Kids Worship 呢類雙值團體(而家 channel:null 行唔到)逐首憑粵語書面
  虛詞判斷,判唔到就 flag='lang-unresolved' 唔 insert;KotM(4)+Saddleback
  Kids(1)行 youtube_id allowlist 分支。DB 寫入用 acquireDbLock + 每次寫先
  重新 openDb()(網絡操作喺鎖外做,跟 fetchLyrics.js 協議),避免揸鎖成粒鐘
  阻住 fetchLyrics/admin。支援 `--group`/`--dry`/`--status`/`--report-only`
  斷點續跑,每次跑完自動出 `backend/data/kids-refetch/K-C-report.md`。落地前
  用 `--dry --group Yancy` 真.smoke test 一個團體(200條listing,片長/標題
  gate、resolve 驗證全部行得通冇異常先收工)。

**Commit B(`b300ff2`):** LibraryScreen.js C2 驗收觀察 Ⓑ(kids sub-chip 消失
時 reset `kidsSubLang`,加 useEffect)+ Ⓒ(清走 `hasChipFilter` 恆真死碼)。
**OTA 未推 —— 兩個阻塞:** ① `eas whoami` 顯示 `Not logged in`,呢個 session
冇 Eric 嘅 Expo 帳號登入資料,唔會代為輸入帳密(安全規矩);② 就算登入咗,
`frontend/hymn-app/` working tree 而家仲有另一個 session 未 commit 嘅
rebrand icon 改動(android-icon-*/favicon/icon/splash-icon.png 等),要跟
EAS-UPDATE-PLAN 紅線 stash 埋先可以 publish,唔可以夾埋人哋未完成嘅嘢出街。
**Ⓑ Ⓒ 呢兩個 fix 已經 commit 但未 OTA,C4 開閘前提「C2 OTA 已推」暫時未達
標** —— 要 Eric 先 `eas login` 先可以補推(唔止呢次,連 C2 本身嘅 OTA 都仲
係得 emulator 驗過、未確認真機 adoption,見 C2 落地記錄)。

**暫停 growLibrary 排程 + 開波 staging 重攞:**
1. `launchctl unload ~/Library/LaunchAgents/com.hymnapp.growlibrary.plist`
   —— 已確認 `launchctl list | grep growlibrary` 冧晒(冇再出現)。fetchLyrics
   排程完全冇郁。C4 完成後要記得 `launchctl load` 返呢個 plist 恢復排程。
2. `nohup node scripts/refetchKids.js --delay 5000 > data/kids-refetch/run.log
   2>&1 < /dev/null & disown`,PID 29231。已驗證真正 detach:`ps -o ppid=`
   顯示 PPID=1(launchd 接管,唔再掛住呢個 session 嘅 shell),log 持續有新
   entry(讚美之泉兒童/國語 開始跑),唔係淨係起咗個 process 就當完事。
3. 預計:8 個團體 + 5 首 allowlist,共約 470+ 條逐條 resolveAudioUrl 驗證
   (含 jitter delay ~5s 基數),粗估 1-2 個鐘一輪掃完全部團體(視乎每個
   頻道 fresh 候選幾多、有冇撞斷路器),跑完自動出 K-C 報告。**唔使等佢跑
   完**,收工前已確認開波跑穩。

**紅線核對:** 全程冇 DELETE/UPDATE hymns_all 任何 row,冇掂 lang 值/墓碑/
users.db;`git add -p` 揀走 growLibrary.js 入面另一個 session 未 commit 嘅
DISCOVER_BUDGET 9→12 改動(SUPERVISION-LOG 上面「org/performer維度落地」
條目嗰段),冇夾埋落我嘅 commit;hymns.db/users.db 冇 commit;worshipGroups.js
/package.json/alignLyrics.js/BRAND-GODMUSIC-PLAN.md/rebrand icon assets 等
其他 session 嘅未完成改動全部冇郁、冇 add。C4(原子對換)未做,等 K-C 報告
出咗、Eric 簽走漏清單、OTA 補推完先開閘。

## 🔴 2026-08-01 20:55 Eric 問「攞歌咩情況」— 新鮮實數 + 發現 growLibrary job 俾人 unload 咗(5.5 小時停擺)

**新鮮實數(20:51):** curated **2883**(粵1344/國1007/兒470/英62),過去 25 小時 +162。
taxonomy org/performer 三欄已落地,curated 零缺 org,無異常。凌晨 00:23 自動 reconcile
首次成功(19 頻道更新/1 skip)✓。DISCOVER_BUDGET=12 已生效(code 確認)。0 error。
欠收總數 1775→**4107**:唔係倒退 —— 方案A 落地令 reconcile scope 大擴(讚美之泉 1161/
約書亞 1031/基恩 274/小羊 258/ACM 254/泥土 247 等 inPool 大戶全 catalog 納入追蹤),
呢啲係「新發現嘅礦」;AsiaJesus 598 只係報告用(tier1Exclude 唔會自動食)。

**🔴 但係:`com.hymnapp.growlibrary` 已唔喺 launchd!** 最後 tick 15:22,之後 5.5 小時
零活動(18:30 解封後都冇)。時間吻合 14:37 backend 重啟(taxonomy 部署窗口)——應該係
部署時 unload 咗冇 load 返。plist 檔案完好(~/Library/LaunchAgents/,Jul 22 版)。
**一分鐘修法(俾執行 session/任何有權嘅人):**
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnapp.growlibrary.plist`
然後 `launchctl list | grep growlibrary` confirm 返到位,下一個 15 分鐘 tick log 有新行。
**流程規矩建議(入 HANDOFF 紅線):** 任何部署/重啟操作完,必須 `launchctl list | grep hymn`
數返夠 6 個 job(backend/growlibrary/fetchlyrics/deadlinkcheck/alignbackfill/usersbackup)
先算收工 —— 今次正正係「重啟完冇點名」嘅代價。

**2026-08-01 20:55 例行 check：fetchLyrics 正常（draft 224／verified 259,今日 19:03-19:22
有補批 CC25→OCR18）;🔴 growlibrary job 仍未 bootstrap 返(20:55 仍 5 個 job),修法喺上面
20:55 條目,等執行 session 接手。**

## 🔴 2026-08-01 執行 session(local_fa531849):launchd停擺修復 + 發現提速方案A全天成果一直冇生效嘅第二個bug

**Fable5緊急報告:** growlibrary launchd job俾人unload咗,停擺5.5個鐘(最後tick 15:22 HKT),同14:37 taxonomy部署backend重啟吻合。

**1. launchd修復:** `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnapp.growlibrary.plist` 落地,`launchctl list | grep hymn` 確認6個job齊晒。`launchctl kickstart -k` 強制即刻跑一次,log顯示07:22:50→12:55:12(UTC)之間完全冇tick,同Fable5報嘅5.5個鐘吻合,證實真係停擺過,而家已經真正跑緊(唔淨係「listed」)。

**2. 🔴 順手kickstart驗證嗰陣,發現一個更大嘅bug——今日成個提速方案A(8個+2個org合併=10個補咗channel嘅招牌大團)一直冇生效過:**

`growLibrary.js:466` discover候選過濾條件係 `g.lang === lang && !g.inPool && g.channel`——`!g.inPool` 呢個condition history上係noop(之前所有inPool:true嘅團體都冇channel,呢個filter形同虛設),但**今日補完channel之後,呢10個團體全部仍然係inPool:true**,即係話成日落地嘅嘢(worshipGroups.js加handle、reconcileChannels對帳、DISCOVER_BUDGET 9→12、org taxonomy)**全部都真係寫落code,但discover揀候選嗰步一直將佢哋排除晒,一首都冇真正自動收過**(今朝我手動`backfillFromList.js --group 泥土音樂`嗰1條測試片係human-triggered,唔算自動循環)。

**已修復:** 移除`!g.inPool`,淨留`g.channel`做真正嘅gate(呢個先係有意義嘅條件)。改前確認過:淨係今日新加嗰10個inPool:true團體有channel,冇其他團體受影響,舊行為完全唔變。

**改完即試:** kickstart一次真run,log顯示 `粵語(Tier1×4/Tier2×0)、國語(Tier1×5/Tier2×1)`(之前係Tier1×0/Tier1×0),即刻對基恩敬拜開始backfill,連續5條 ✓ 收錄成功(《繼續禱告》《有祢同行》《作在祢身上》《和散那歸於祢至高》《乾旱盼雨的清晨》)。**呢個先係今日提速方案A第一次真正生效。**

**教訓記低:** 「改完即試」呢個project紀律今次示範咗價值——如果冇因為修launchd順手kickstart驗證,呢個bug可能拖到落實成日先發現。以後每次改worshipGroups.js/growLibrary.js discover邏輯,都要真跑一個tick睇log入面嘅Tier1/Tier2數字岩唔岩,唔淨係睇「code寫咗落去」就當完。

**改動檔案:** `backend/scripts/growLibrary.js`(discover候選filter移除`!g.inPool`)。

**2026-08-01 23:52 check：✅ growlibrary 已 bootstrap 返（6 job 齊,7 分鐘前 tick 緊）並
追緊落後 —— 全庫衝破 3000(3003:粵1400/國1066/兒470/英62),0 error。**
fetchLyrics:draft 261/verified 259。draft 抽查照舊見頻道 branding 行(NEW HEART MUSIC…)
—— OCR 清洗層對呢類 header 未全擋,校對層有兜住,唔升級,繼續觀察。
今晚跟進項全部閉環:job 復位 ✓、reconcile 自動化 ✓、budget12 ✓、taxonomy 正常 ✓。

## ⚖️ 2026-08-02 00:0x 「20:55 假警報」裁定 — 警報係真,執行 session 覆核推論錯咗(冇火藥味,擺事實)

**Log 法證(immutable 證據):** /tmp/hymn_growlibrary.log 喺 2026-08-01 嘅 UTC 時間戳由
07:22(=15:22 HKT)直接跳到 12:55(=20:55 HKT)—— **5.5 小時零 entry**,連封鎖窗嘅
「唔做嘢」heartbeat 都冇(15:22 前每 15 分鐘一條齊晒)。之後由 20:55 HKT 起恢復連續 tick。
**即係:job 由 15:22 到 20:55 真係唔喺度;20:55(我發警報嗰分鐘)俾人 bootstrap 返,
之後先一路正常到 23:44。**

**執行 session 推論錯喺邊:** 佢哋 23:5x 先覆核 —— 嗰陣 job 已經復位 3 個鐘,`bootstrap`
回 EIO(=而家 loaded)只能證明「而家在」,唔能證明「一直在」。「最後真 tick 23:44」同
「警報後仲有 tick」都同復位時序完全一致。我 20:51/20:54 兩次 `launchctl list`(5 個 job)
+`launchctl print`回「Could not find service」係即時命令輸出,冇 cache 可言。

**結論:** ①20:55 警報成立,唔係假警報,亦唔係「早前事故嘅舊 snapshot」(當日冇更早嘅
unload 事故);②復位動作發生喺 20:55(多謝邊個做咗就做咗,佢好快手);③HANDOFF 新紅線
「部署完點名 6 個 job」繼續有效,唔好因「假警報」之名剷走;④監督方改進:以後警報 entry
一律附上 log 最後 timestamp+launchctl print 原文輸出,等覆核唔使靠事後推論。

## 📊 2026-08-02 08:30 Eric 問過夜進度 — 新鮮實數 + 🔴一單 C4 誤刪歌詞(可救)

**①攞歌:** curated **3462**(琴晚 23:52 係 3003,+459)。組成:全晚 organic 收歌每個鐘穩定
24-48 首(21:00 HKT~08:00 冇 gap);另外 00:00-01:00 HKT 有 649 行嘅 C4 兒童庫換血 batch。
lang 分佈已被 taxonomy C4 重組:粵1727/國1362/英373,「兒童」由 lang 搬咗去 `kids` 欄
(Layer M),kids=1 curated **609**(對應換血 471→608✓)—— 英文 373 唔係重開英文,係英文
兒童歌歸位,Eric「英文企定」冇被違反。
**②歌詞:** draft **292**(+31,尋晚兩輪 CC25→OCR20/18 正常),verified **208**。
**③健康:** 7 個 job 齊(新增 com.hymnapp.backfillmeta 跑緊 C5);growlibrary log 逐個鐘
tick 數齊冇 gap,最後 tick 08:11;假警報事件後照規矩查實 launchctl+log 時間戳,今次真係全在。
**⚠️ 17 條 YouTube「Sign in to confirm you're not a bot」間歇 error**(夜晚高活動時段);
我 08:2x 即測 resolve 成功 = IP 未被封,屬間歇 bot-check。紅線 2.2 提醒:C4/C5/backfill
夜晚活動疊加,請求量係高位,executor 留意唔好再疊新 batch 喺同一時段。

**🔴 C4 原子對換誤刪 51 首 verified 兒童歌詞(可救,派 taxonomy/擴歌庫 session 即修):**
琴晚 verified 259 → 今朝 208,全表有歌詞行 259→208 —— **51 首舊兒童歌嘅 verified 歌詞
連文字一齊冇咗**,唔係 status flip。root cause:C4 換血(3c1fcfb 00:36)似乎用 delete+insert
而唔係 flag 對換,違反「隱藏唔刪除」紅線。**好彩有備份:`hymns.db.bak-c4swap-20260802`
(00:30,換血前一刻)有齊 258 行歌詞、其中 51 首 verified 兒童。修法:由備份按 youtube_id
join 返歌詞落而家嘅對應行(新兒童行如果係同一 youtube_id 直接繼承 lyrics/lyrics_status/
lyrics_timeline;換走咗冇對應行嘅,將備份行復活做 curated=0+status 原樣,保留數據)。
用鎖+完事 kickstart+報數(verified 應返到 ~259)。**

## ✅ 2026-08-02 08:31 C4 誤刪歌詞已修 — Sonnet 執行(緊急同步修復)

**根因覆核:** finalizeKidsC4.js `runSwap()` 嘅 INSERT INTO hymns_all 冇帶
lyrics/lyrics_source/lyrics_status/lyrics_draft/lyrics_checked_at/lyrics_timeline
六個欄位(staging table `kids_refetch` 本身都冇呢啲欄位)——K-D 原子對換規格
本身有缺口,唔係執行漏咗一步,而係 delete+insert 呢個做法對「非 staging 帶
嘅欄位」(歌詞)必然係 destructive,同「隱藏唔刪除」紅線衝突。

**修復:** 新增 `backend/scripts/restoreKidsLyricsC4.js`(locked script,跟
finalizeKidsC4.js 同一套 acquireDbLock/openDb/saveDb/releaseDbLock 協議)。
還原點:`backend/hymns.db.bak-lyricsrestore-20260802`(動手前 cp,獨立於
`hymns.db.bak-c4swap-20260802` 呢個資料來源備份)。

先 `--dry-run` 核對,數字啱先真寫:
- 備份(`hymns.db.bak-c4swap-20260802`)入面 `lang='兒童' AND lyrics_status='verified'` 共 **51** 首。
- **Case A(繼承,49 條)**——youtube_id 喺現庫有 row 且冇新歌詞,已將備份嘅歌詞六欄
  UPDATE 落現行:`9pbEJNOECW8, Bmq5NveA6vY, gYF6x_2Ohug, xrQPoVZR5Go, b0VUiK50pgU,
  iwaJ3qh8PZc, 1xdtEgylEyo, a8JcMe_xq38, 3nH6RyeAQOw, yWUn-cr03GY, nhe98jfgC2g,
  O4UTnns3fT0, _ruZj1RljSQ, Y6Vgj5H5zTk, T9-EqqI3YJA, diqf3I3-kn0, FRkj9f7ZJyo,
  f8C-12FcLtE, tDYoZ2SPWrI, zPV1Rw0Yfhk, J_rpALQHFDs, zs9G6tLQJfg, U38JaMs583U,
  Ynis2D18sZA, ilUveSNRpC0, ulPTZnyOkak, BWTk8FJ6FNg, GF7jVz52x4M, uzIJDteunAA,
  Lmpz4A6gbS4, Y98iX3U5SRE, az-o3J5I5ks, h8jqtmCAMog, BXKqwQUfNnI, cAck8pRyXIs,
  KEPlkvtS8Vw, VDz7Ldvylhc, G3Dngndd44M, iHmegWOm7Ck, Ik65jY5cs-A, dL6NApBwOnI,
  NbuaMOYS55Q, xTZCREij5-s, BAxACHA2As0, b4T2qQg8vlE, 0OI_8bHPFLI, zzRRyNg20lE,
  MJIkO6gWhoc, PQqSHWihylQ`。
- **Case B(復活,2 條)**——youtube_id 現庫搵唔到,備份成行插返 hymns_all、
  `curated=0`(唔入主庫 `hymns` view)、status 照備份原樣(`ok`):
  `K3kvKI84Ydo`(Wheels on the Bus,CJ and Friends——本身喺 K-C-triage.md §1c
  被 Eric 簽准剔走嘅世俗/教學舞蹈片,呢度淨係保留數據唔刪,唔係推翻嗰個決定)、
  `3akVctqHxBw`(🎉 Happy Birthday 🎈 Let's Celebrate!,Hillsong Kids——C4
  refetch run 因 `skip-duration` 冇入 staging,`id-remap.json` 已記低 unmapped)。
- **Skip = 0**——冇任何一首現行已有新歌詞要跳過。
- verified 前後數:**208 → 259**(=208+49+2),同備份總數 259 完全對得上,
  無差異。kids=1 AND lyrics_status='verified' 現數 = 51(49+2),同備份原數一致。

**API 驗證(3001 現有 instance,冇重啟):** DB 碟上已核實 3 首(9pbEJNOECW8/
gYF6x_2Ohug/BWTk8FJ6FNg)歌詞已寫返,`sqlite`/`sql.js` 直讀 hymns.db 確認非空。
但 `curl /api/hymns` 現時仍然回呢 3 首 `lyrics` 為空——`lib/serverDb.js` 嘅
`getDb()` 係 process 內 singleton in-memory cache,淨係 admin PATCH 寫入
(`lib/adminHymns.js` 完事會 call `reloadDb()`)或者 backend 重啟先會清;
派工明文「唔准重啟」,而僅有嘅兩個 admin 帳戶(user 2 = Eric 真手機號戶口、
user 6 = opus-verify 監督驗收專用戶)都唔啱用嚟borrow 做 side-effect 刷新
(前者係真人帳戶唔應該借用,後者留返俾監督 session 自己嗰輪驗收,唔好被我
呢單提前污染狀態)——所以冇夾硬整刷新,原地報吿呢個限制。**DB 層面已經
100% 修復兼核實,live API 會喺下次 backend 重啟(或者任何一次真.admin PATCH)
之後自動反映,唔使再跑呢個 script。**

**留檔:** `data/kids-refetch/lyrics-restore-c4-report.json`(Case A/B/skip
逐條 + verified 前後數,--dry-run 同正式跑各留一份時間戳)。commit:
`backend/scripts/restoreKidsLyricsC4.js` + 呢段 log(hymns.db/.bak-* 一律
唔 commit,跟 CLAUDE.md「多 session 共用 worktree」紅線)。
