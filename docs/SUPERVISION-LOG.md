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
