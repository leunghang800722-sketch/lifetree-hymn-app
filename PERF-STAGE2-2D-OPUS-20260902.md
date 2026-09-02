# PERF-STAGE2-2D-OPUS-20260902 — Opus 5 獨立驗收：前端 A-6 client

驗收者：Opus 5（獨立，唔改 source / 唔 commit / 唔部署 / 唔 restart / 冇開模擬器）。
對象：`PERF-STAGE2-2D-20260902.md`、commit `bda9f9e`（儀器）+ `d375f9a`（A-6 client）、
backend 合約 `8d7a2d4`、raw `ops/perf/stage2-20260902/2d-*`（含 4 張截圖）。

驗收手段：讀碼（逐條路徑窮舉）、raw 逐個數核對、**對 live 3001（未 restart 嘅舊 backend）
做唯讀 GET 探測**（呢個係本次最有價值嘅新證據，直接答咗兼容矩陣兩格）、bytes 模型重算。

---

## 0. 一句判詞

**核心改動正確、bytes 收益真實、兼容矩陣四格全部安全（我實測，唔係推論）——
可以 OTA，但要先修一行（§1.2 MMKV 版本號一致性）。**
另外報告 §3 對 `home` mark 嘅解讀係**錯嘅**（唔止係「雜訊蓋過」），而真正量到效果嘅欄
（`a1b` 125→35ms）報告冇提；我喺 §3.2 補返，結論係**收益比報告講嘅更硬**。

| # | 項 | 判 |
|---|---|---|
| 1 | useCachedHymns 新流程正確性 | **PASS（六個子項），一個 FAIL（§1.2）** |
| 2 | MMKV 寫入時序（被殺） | **PASS**（成功路徑結構上安全）；失敗路徑見 §1.2 |
| 3 | A/B 方法 | **PASS（byte-verify/交錯/轉錄全對）+ 三個保留**（`home` 解讀錯、S2 冇交錯、beacon 截斷） |
| 4 | 正控 | **PASS**（歌詞搜尋截圖係真正控，強過 pill）；一個未覆蓋（§4.3） |
| 5 | 兼容矩陣 | **四格全 PASS（實測）** |
| 6 | OTA 出街 | **可以出，但先修 §1.2 嗰一行**；「restart 排喺 OTA 前」呢條紅線 **喺呢個改動唔成立** |

---

## 1. useCachedHymns 新流程正確性

### 1.1 lite→setState→lyrics→merge→setState→MMKV —— **PASS**

`src/hooks/useCachedHymns.js:248-301` 逐行核過，次序同報告 §1.1 一致，冇漏：

- `:250` `fetchPrimaryHymnsWithRetry()` → `:256` `setState({hymns: primary.hymns})` → `:257`
  `!hadCache` 即收 `loading:false`（唔等 lyrics）。**正確**：`HomeScreen.js:275` 個 `hasData`
  一有 6405 首就轉走 spinner。
- `:267-296` 背景 `fetchLyricsMap()` → `mergeLyrics()` → `setState` → MMKV 寫合併版。
- `mergeLyrics`（`:162-164`）用 `hymns.map(h => ({...h, ...}))`——**新 array + 新 object**，
  identity 真係變咗。

**一個報告冇講、但要記低嘅成本**：identity 一變，冷開一次會令 `[hymns]` 嗰批 memo **行兩次**
（`LibraryScreen.js:105` blobIndex 6405 條、`:139-144` InteractionManager 預起歌詞索引（第一次
必然起一個**空**索引）、`HomeScreen.js:146/196/207` chips/todayPicks/recent）。
**冇量過**，2B D-1 數字（secChips 3ms、secToday 15ms、LibraryScreen render 174-186ms）暗示
量級係幾十 ms，唔係 blocker，但唔可以當零。

**畫面唔會跳**（我獨立核實）：merge 前後只有 `lyrics` 欄唔同，而
`dailyPick`/`dailyPickBalanced`/`hasAlbum`/`featured`/`id` 全部唔讀 `lyrics`，
所以第二次 memo 出嘅 todayPicks/pages/recent **同第一次逐個相同**，用戶唔會見到首頁內容
喺 250ms 後靜靜換過。呢點報告冇論證，但成立。

### 1.2 lyrics fail 唔寫 `allHymnsVersion` 嘅語義 —— **FAIL（唯一必修，一行）**

報告 §1.1(4) 同 source `:286-295` 嘅講法係：
> 失敗就照存 lite 版落 MMKV 但**唔寫** `allHymnsVersion`，逼落次開 App 再試。

**呢個推論唔成立。** 「唔寫」≠「清走」。`allHymnsVersion` **仍然攞住上一次成功嗰個舊值**，
而 `:246` 個 gate 係：

```js
const canSkip = hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion;
```

失敗之後 MMKV 變成一對**互相矛盾**嘅值：`allHymns` = lite-only（**成個 array 冇 lyrics 呢個
key**），`allHymnsVersion` = 一個描述緊「full 資料集」嘅舊 version。下次開 App 只要
`serverVersion === cachedVersion`，`canSkip` 就會 **true**，直接 skip 網絡，
**用戶會用一份永久冇歌詞嘅 cache**——歌詞 pill 全庫灰、詩歌庫歌詞搜尋全滅——
而且**唔會自己好返**，要等 `hymns.db` 嘅 dataVersion 再變（或者重裝）先解得開。

**可達路徑（唔使幻想，兩條）**：

| 入 refresh 嘅原因 | 失敗後下次開 App | 結果 |
|---|---|---|
| (d) `serverVersion !== cachedVersion`（DB 真係改咗） | 舊 version 仍然對唔上 | ✅ 會重試，如報告所講 |
| **(b) `serverVersion == null`**（`/api/version` 8s timeout / 非 200 / 網絡閃斷）→ `canSkip` 必 false → 入 refresh → lite 成功 → lyrics 失敗 | 下次 `/api/version` 好返，回嘅係**同一個** dataVersion = `cachedVersion` | 🔴 **`canSkip=true`，永久 lite-only** |
| (a) `hadCache=false` 但 `cachedVersion` 有值（`allHymns` 空/未寫但 version 在） | 同上 | 🔴 同樣 sticky |

即係話：**只要「`/api/version` 掛一次」同「lyrics fetch 掛一次」發生喺同一次開機**，
就中招。呢兩件事喺慢網/tunnel 環境係**正相關**（同一段爛網），唔係獨立事件——
概率比「兩個獨立小概率相乘」高好多。

呢個病種同 SUPERVISION-LOG 2026-07-27 兩單「DB/API 一早啱，App 顯示 MMKV 舊 cache」
**係同一家族**（source `:178-184` 嗰段註解就係為咗防呢件事而寫），而 `canSkip` 呢個 gate
本身就係嗰單事故嘅產物。而家新代碼親手製造咗一個 gate 判斷唔到嘅不一致狀態。

**修法（一行，零風險）**：`src/storage.js` 出嘅係原生 `MMKV` instance，有 `.delete()`。
喺 `:292-294` 個 fail 分支加：

```js
if (s) {
  s.set('allHymns', JSON.stringify(primary.hymns));
  s.delete('allHymnsVersion');   // ← 令「逼落次再試」呢個語義真係成立
}
```

（更保守嘅另一個選擇：fail 嗰陣**乜都唔寫**，保住上一次嗰份**有歌詞**嘅舊 cache——
「舊但齊」通常好過「新但冇歌詞」。兩者揀邊個由 Eric/Fable 5.1 拍板，但**唔可以維持現狀**。）

**呢個係我唯一列做「出街前必修」嘅項。**

### 1.3 兩個 fetch dataVersion 唔同 —— **PASS**

`:275-277` 只 `note('lyrVerMismatch',1)`、照用 lite 嗰個 dataVersion 合併，同執行單原文
要求一致。語義上安全：兩份都係同一個 DB 嘅快照，lyrics 只會多咗/少咗個別歌，
合併後 `lyricsMap[h.id] ?? ''` 對唔上就係空字串，唔會出「A 歌配 B 歌歌詞」。
**唯一小瑕疵**：MMKV 寫入嗰個 `allHymnsVersion` 用 lite 嘅 version，
即係 cache 標住「V_lite」但入面 lyrics 其實係 V_lyr——下次 `canSkip` 會信 V_lite。
影響輕微（最多係個別歌詞遲一個 version 更新），可接受，但同 §1.2 係同一個根：
**`allHymnsVersion` 而家唔再係「呢份 cache 完整性」嘅誠實標籤。**

### 1.4 `hasOwnProperty('lyrics')` 舊 backend fallback —— **PASS（我實測，唔係推論）**

我對 **live 3001（到而家仍然未 restart，即真·舊 backend）** 做咗唯讀 GET：

```
GET http://localhost:3001/api/hymns?lite=1
  → 200, n=6405, dataVersion=1788274394187.32-61054976
  → keys[0] = [id,title,display_title,artist,youtube_id,lang,duration,lyrics,
               tags,view_count,created_at,album,title_en,org,performer,kids,
               instrumental,real_lang]
  → 'lyrics' in data[0]  = True
  → 非空 lyrics 數 = 5387
GET http://localhost:3001/api/hymns/lyrics
  → 404 (text/html, 155 B)
```

- 舊 backend 對 `?lite=1` **照回 full**（唔係 404、唔係 400），`hymns[0]` **有** `lyrics` key
  → `finalizePrimaryResult` 判 `isFull=true` → **完全唔會打 `/api/hymns/lyrics`** → 行為同今日
  一模一樣。**fallback 設計成立，實測確認。**
- 新 backend lite 分支 `hasLyricsKey=False`（`2d-harness-bytes.log` 直接印咗）——
  兩邊判別條件真係互斥，唔係靠運氣。
- `5387` 三處對得上（live DB 非空 lyrics 數 = harness map key 數 = `8d7a2d4` commit message）。

**`hymns.length===0` 嘅退化**：`isFull=false`，但外層 `:252` `length>0` 唔成立 → 唔會寫 MMKV、
`:297` 收 loading。**安全**。

### 1.5 `/api/hymns/lyrics` 404 路徑 —— **PASS**

`:143` `if (!r.ok) return {map:null}` → fail 分支。實測舊 backend 真係 404（見上）。
Route 註冊次序（`8d7a2d4`：`/api/hymns/lyrics` 喺 `/api/hymns` 之後、且 backend 冇
`/api/hymns/:id`）我核過，冇 route shadow 風險——**呢個係重要嘅**，因為如果舊 backend 有
`/api/hymns/:id`，佢會回 200 + 一個唔係 map 嘅 body，`:152` 就會判 `map={}`（**當成功**）、
`:280` `merged=1`、然後**寫 `allHymnsVersion`** → 即刻變成「永久冇歌詞」嘅硬事故。
今日冇呢條 route 所以安全，但 `:152` 個「`body.data` 唔係 object 就當 `{}` 成功」係一個
**寬鬆到危險**嘅解析。建議（非 blocker）改成：`data` 唔係 object，或者 key 數 = 0，
一律當 fail。

### 1.6 `notifyHymnsChanged` —— **PASS（一致）**

`:189-203` 完全冇改，仍然行 `fetchAllHymns()`（全量含 lyrics）→ 寫 full array + version。
判 **一致**：呢條路寫入嘅 cache 係**完整**嘅（有 lyrics），同冷開成功路徑寫嘅 merged 版
語義相同，唔會製造 §1.2 嗰種不一致。唯一形狀差異：冷開 merged 版對「冇歌詞」嗰 1,018 首寫
`lyrics: ''`，admin 路徑寫 `lyrics: null`——全部 consumer（`App.js:3422` `!!lyricsText`、
`LibraryScreen.js:123` `if (h.lyrics)`）都係 truthiness，**兩者等價**。PASS。
（成本：admin 改一首歌仍然要成個 1.47MB full payload。唔喺 2D 範圍，記低。）

### 1.7 race：lite 已畫、用戶已撳播 —— **PASS，覆蓋完整**

`grep -rn "\.lyrics" App.js src/` 全庫只有 **3 個真 consumer**：

| 位置 | 用途 | 覆蓋 |
|---|---|---|
| `App.js:3302` `formatLyrics(cur.lyrics \|\| getLyricsById(cur.id))` | 歌詞 pill 灰唔灰 | ✅ 已補 |
| `App.js:3349` `formatLyricsStanzas(...)` | 歌詞 modal 內容 | ✅ 已補 |
| `LibraryScreen.js:123` `if (h.lyrics)` | 歌詞搜尋索引 | ✅ 靠 identity 重建（`:127`），merge 出新 array 必然觸發 |

**冇漏 call site。** 另外 `App.js:3291-3293` `liveHymn = player.hymns.find(id)` ——
merge 之後 `cur` 自動變成合併版 object，所以 fallback 真係只喺 ~250ms 窗口用到，
同註解講嘅一致。窗口關閉之後 `lyricsMapStore`（成個 2.7MB map）仍然常駐 memory 一世
——**多咗一份 lyrics 副本**（merged array 一份 + map 一份，raw ~2.7MB）。
唔係 blocker（RN heap 食得起），但值得記：可以喺 merge 完 `lyricsMapStore = {}` 放走。

### 1.8 LibraryScreen 歌詞索引 identity 重建 —— **PASS**

`LibraryScreen.js:120-131` `lyricsIndexRef.current.src !== list` 用嘅係 **array reference**，
`mergeLyrics` 出新 array 必然唔等。**截圖 `2d-02` 係呢一項嘅直接實證**（見 §4.1）。

---

## 2. MMKV 寫入時序（合併版寫入前被殺）—— **PASS**

問題：「合併版寫入前 App 被殺，下次開會唔會讀到 lite-only cache 而永遠冇歌詞？」

**成功路徑答案：唔會，結構上唔可能。** 冷開成功路徑 `:263-266` / `:282-285` **只喺
merge（或 isFull）完成之後**先掂 MMKV。喺 lite 畫咗但 lyrics 未到嗰 ~250ms 窗口入面被殺，
MMKV 仍然係**上一次嗰對完整值**（或者新裝時兩個 key 都冇）——下次開機讀到嘅一定係
「有歌詞嘅舊 cache」或者「冇 cache」，**唔會**係 lite-only。

兩個 key 之間被殺（`allHymns`=merged 已寫、`allHymnsVersion` 未寫）：cache 內容係**齊**嘅，
最壞只係下次多做一次 refresh。**無害。**

**唯一會令 lite-only 落 MMKV 嘅係 §1.2 嗰條明文 fail 分支**——即係話呢一項嘅風險
100% 集中喺 §1.2，修咗 §1.2 就等於呢一項全綠。

---

## 3. A/B 方法

### 3.1 機械面 —— **PASS（逐項核過）**

| 檢查 | 結果 |
|---|---|
| 10 cycle byte-verify | ✅ 實際 **12/12**（5 cold + 1 seed × 2 build）`match=YES`；BEFORE 3,720,425 / AFTER 3,725,276，兩個 build byte 級唔同 |
| 真交錯 | ✅ `host_ts` 排序 = B(4343) A(4673) B(5003) A(5343) B(5673) A(6003) B(6333) A(6663) B(7003) A(7333)，**真 BABABABABA** |
| BEFORE/AFTER 都對 3002 harness | ✅ 兩個 build 都改咗 `API_BASE`；`config.js` 全 git 歷史 `-S "3002"` **零命中**，冇 commit 過 |
| harness bytes 正控 | ✅ full 5,567,648/1,474,227、lite 2,839,533/371,984、lyrics 2,702,660/992,859 —— 同 `8d7a2d4` 既有證據**分毫不差** |
| 數字轉錄 | ✅ §3 表 30 格、§4 表 24 格我逐格對返 raw beacon，**一個錯都冇**；median 全部重算正確 |
| BEFORE 選 `1bc45d8` 對唔對 | ✅ `8a2e729..1bc45d8` 之間 frontend 只改咗 `deviceId.js`（−6 行，Stage 3 S3-5），解釋到 bundle −91B，**兩個 arm 共享，唔係混淆變數** |
| 執行者唔判 PASS/FAIL | ✅ 全份守住，甚至主動寫低對自己不利嘅 +22ms |

### 3.2 🔴 `home` mark +22ms 嘅解讀 —— **報告錯，但錯喺保守嗰邊**

報告 §3 寫 `home` 係「**首屏有內容**，performance.now() 量」，L2/L4 講「loopback 冇能力
重現效應」「雜訊蓋過」。**兩句都唔啱。**

`src/components/home/HomeScreen.js:266-269`：

```js
React.useEffect(() => {
  requestAnimationFrame(() => { requestAnimationFrame(() => { mark('home'); }); });
}, []);
```

- deps `[]` = **mount 一次**；`mark()`（`perfMarks.js:35`）**write-once**；
  而 HomeScreen 喺 `hasData=false` 嗰陣已經 mount 咗（`:271-282` 返 spinner）。
- 所以 `home` 量嘅係「**HomeScreen 第一幀（spinner 都算）**」，同 hymns payload **完全無關**。
- 而且係 `Date.now() - T0`，**唔係** `performance.now()`。

**raw 自己證實**：BEFORE run1 `home=246`，但 `verMs=127` + `hymnsMs=177`，
`/api/version` 都未 resolve（≈277ms）`home` 就已經打咗。AFTER 同理（`home=253` vs
merge 完成 ≈634ms）。**兩個 arm 嘅 `home` 都喺資料到之前 fire。**

**含義（三條，都重要）**：
1. 「+22ms 係咪 regression」呢條問題**唔存在**——呢個 mark 結構上量唔到呢個改動，
   正負都冇意義。報告 L4 講「唔可信」係啱嘅結論，但理由講錯咗。
2. L2 講「真網環境先量到 `home` 改善」——**錯**。`home` 喺任何網絡環境都唔會郁，
   因為佢喺 mount 嗰刻就寫死咗。**如果照住 L2 去真機重做一次，會白做。**
3. 冷開路徑目前**冇任何 mark 量「spinner → 有內容」**（`cacheReady` 喺冷開係 `-`）。
   下一手要量首屏收益，要**新加一個 mark**（例如 `hasData` 第一次轉 true 嗰刻）。

### 3.3 ✅ 但係 loopback **真係量到咗** —— 報告漏咗自己最強嗰個數

報告話 loopback「冇能力驗證呢個效應」。**唔啱。** `a1b`（= `hTtfb1→hBody1`，
純 body 傳輸段）擺明量到：

| | a1b（body 傳輸） | 中位數 |
|---|---|---|
| BEFORE（full） | 125, 126, 121, 124, 133 | **125 ms** |
| AFTER（lite） | 35, 33, 35, 36, 36 | **35 ms** |

**實測比 0.280 vs 預測 gzip wire 比 371,984/1,474,227 = 0.252。** 兩者相差 3 個百分點
（差額 = 每 response 嘅固定 JS/framing 開銷）。

**呢個係本次驗收最有價值嘅一條**：佢實證咗「**body 時間 ∝ wire gzip bytes**」呢個外推模型
喺呢個 stack 上係啱嘅——而模型啱，就代表可以拎去慢網外推，唔再係口頭推論。

**用 2B D-1 嘅真 tunnel 數（`PERF-STAGE2-2B-20260902.md` §1.1，ttfb 524-553ms、
body 3,170/6,154/6,009ms 傳 1,474,227B ⇒ 240-465 KB/s）代入：**

| | BEFORE（實測） | AFTER（外推 ×0.252） |
|---|---|---|
| 首屏可畫（hymnsEnd） | 3,748 / 6,703 / 6,570 ms（median **6,570**） | ≈ 1,363 / 2,087 / 2,063 ms（median **≈2,060**） |
| 歌詞齊（背景） | 同上 | +ttfb ~530 + 2,135-4,145 ⇒ ≈ **4.7-6.8 s** |
| 開機首屏 wire bytes | 1,474,227 B | **371,984 B（−74.8%）** |
| **總** wire bytes | 1,474,227 B | 1,364,843 B（**−7.4%，唔係 regression**） |

**估算收益：真機/tunnel 首屏由 ~6.6s 快到 ~2.1s，約 −4.5 秒**；歌詞喺背景大約喺舊版本來
就會完成嗰個時間點先到齊。**冇 bytes 代價**（拆開之後總 gzip 反而細咗 7.4%）。

保守修正：小 transfer 食唔盡 TCP ramp，實際 lite 可能慢過線性模型 → 收益偏向**細過** 4.5s。
多咗一個 round-trip（+~530ms ttfb）但喺背景，唔影響首屏。

### 3.4 🔴 beacon 已經**真係截斷咗**（2B 警告嘅嘢發生咗）

2B Opus §8 第 2 點寫過：「AFTER 版最長 detail = 276/300 …… **下次加欄之前要先減欄**」。
2D 加咗 4 個欄、**一個都冇減**。實測（我逐條量 `detail` 長度）：

| | 長度 | 完整？ |
|---|---|---|
| S1 BEFORE ×5 | 273 | ✅ 收尾 `api/client-log:7)` |
| **S1 AFTER ×5** | **300（爆頂）** | 🔴 **全部截斷**，收尾變 `api/home:1,`，`api/client-log:7)` 冇咗 |
| S2 warm | 253 / 290 | ✅ |

今次影響有限（四個關鍵欄擺喺 `fetch=` 前面，全部生還）。**但真機一撞 retry**
（`a2t/a2b/a2p` 由 `-` 變真數，≈ +15-20 字）**就會食入 `fetch=` 更深**，
而「有 retry」正正係最想睇 `fetch=` 嗰個場景。

**建議（P1，OTA 前後都得，唔係 blocker）**：剷走 `liteMs`。佢自己 commit message 都認
「係 `hymnsMs` 嘅別名（同一個 span）」——raw 亦證實逐 run 完全相等（69=69, 73=73, 70=70）。
**一個零資訊嘅欄，佔緊 ~10 字。**

### 3.5 S2 冇交錯 —— 報告冇聲明

`host_ts`：B-seed(8563) → B-warm 1/2/3(8713/8993/9263) → A-seed(9553) → A-warm 1/2/3。
**係前後兩塊，唔係交錯。** 報告 §2 開宗明義話跟 2B §4.2 嗰套（交錯），§4 冇講自己例外。
影響：S2 嗰個 `home` 403→425 (+22ms) 有**未控制嘅時間序混淆**（機器越跑越熱/背景 job）。
結論唔變（S2 本來就係「確認熱開零變化」，而 `mmkvRead`/`parse` 17→18 / 19→19 支持咗），
但**呢句要寫入報告**。

### 3.6 順帶解決咗報告嘅 L5（seed 15 秒夠唔夠）

報告 L5 擔心 seed 只等 15s，可能寫咗未合併嘅 lite-only cache 落 MMKV，冇直接驗證。
**間接但夠硬嘅證據喺 raw 入面**：warm run 嘅 `parse` BEFORE 19ms vs AFTER 19ms、
`mmkvRead` 17 vs 18。如果 AFTER 個 cache 真係 lite-only，
字元數會少 36.5%（2,323,605 vs 3,657,734），`JSON.parse` **唔可能**同 full 一樣係 19ms。
**⇒ seed 確實寫咗合併版，L5 可以收窄成「冇直接讀 MMKV 核對，但 parse 時間排除咗 lite-only」。**

---

## 4. 正控

### 4.1 歌詞搜尋截圖 —— **PASS，而且係本次最強嘅正控**

`2d-02-lyrics-search-hit.png` 我親眼睇過：搜尋框 `Cover me with Your hand`、
詩歌庫標題「**1 首**」、唯一命中「Through It All / Hillsong Worship · 英文」。
呢句唔喺標題出現，所以**必然**行咗 `LibraryScreen.js:123` 嗰條 lyrics 索引 →
**同時證明三件事**：(a) merge 真係入咗真歌詞；(b) `lyricsIndexRef` 靠 identity 重建成功；
(c) `blobIndex` 主輪冇誤中。**比 pill 截圖強一個量級。**

### 4.2 `n=6405`（S1 10/10、S2 6/6）、5,387 key —— **PASS**
`5387` 三個獨立來源對得上（live 3001 實測非空 lyrics 數 = harness map key 數 = commit 記錄）。

### 4.3 pill 非灰截圖 + 「冇揭開 modal」（L3）—— **夠，但要講清楚佢證唔到乜**

`2d-03` 我睇過：「歌詞」pill 同「最愛/分享/清單」三個常開 pill 同一亮度，冇 `opacity:0.45`。
`hasLyrics = !!lyricsText`（`App.js:3422`）⇒ `formatLyrics()` 出咗非空字串。
配合 §4.1 嗰張（同一首歌、同一個 build、同一份 merged array），**「歌詞去咗邊」呢條問題
已經答完**，L3 撳唔到 modal（idb 對 `GestureHandlerRootView` 失效，工具限制）**可以接受**。

**但要誠實講一句報告冇講嘅**：`2d-03` 影嘅時間（17:13）merge 一早完成，所以佢行嘅係
`cur.lyrics`，**唔係** `getLyricsById()` fallback。⇒ **`getLyricsById` 呢條新路徑
（`d375f9a` 唯一嘅 App.js 行為改動）零覆蓋**——冇截圖、冇 harness、冇 log。
嚴重性低（3 行純函數、失敗後果只係 250ms 窗口內 pill 灰咗），但唔可以講「已驗證」。

---

## 5. 舊/新 client × 舊/新 backend 兼容矩陣（逐格判，全部有證）

| | **舊 backend（live 3001，未 restart）** | **新 backend（已 restart，含 C-1..C-6）** |
|---|---|---|
| **舊 client**（未收 OTA） | ⬜ 現狀。`GET /api/hymns` → full。 | ✅ **PASS**。新 backend 預設分支 SQL/object 形狀/cache 變量逐字不變（`8d7a2d4` diff 我核過），2C byte-for-byte 正控。舊 client 完全唔知有 `?lite=1`。 |
| **新 client**（收咗 OTA） | ✅ **PASS（我實測）**。`?lite=1` → 舊 server **忽略 query、回 full 200**，`hymns[0]` 有 `lyrics` key → `isFull=1` → **完全唔打 `/api/hymns/lyrics`**（嗰條實測 404）→ 直接寫 full + version。**行為/bytes 同今日一模一樣**，淨係多咗一個 `liteIsFull=1` note。 | ✅ **PASS**。10/10 cold cycle `merged=1`、`n=6405`、歌詞搜尋截圖正控。**唯一保留 = §1.2**（lyrics 失敗時嘅 MMKV 不一致），呢格唔完美。 |

**restart 中途切換**（新 client 撞正 backend restart）：
- lite 由舊拿到（full）→ `isFull` 短路，之後 backend 點變都唔關事。✅
- lite 由新拿到（lite）→ 中途 rollback 返舊 → `/api/hymns/lyrics` 404 → fail 分支 →
  lite-only cache（**§1.2 修咗就會下次自動重試**；唔修就有 sticky 風險）。⚠️
- 兩條都唔會出「歌詞配錯歌」或者 crash。

**Backend memory 附註**（唔喺 2D 範圍，記低俾 Fable 5.1）：新 backend 而家常駐三份 JSON 字串
cache（5.57 + 2.84 + 2.70 = **11.1MB**，未計 C-5 加嘅預壓縮 gz buffer），比之前 5.57MB 多一倍。
喺 Eric 部 Mac 上跑，值得知。

---

## 6. OTA 出街判定

### 6.1 判：**可以出，但先修 §1.2 嗰一行**

理由：
1. **兼容矩陣四格全部安全**，其中最關鍵嗰格（新 client × 未 restart 舊 backend）我**實測**過，
   唔係讀碼推論。
2. **bytes 收益真實**（首屏 1.47MB → 372KB，−74.8%），而且總 bytes 反而細咗 7.4%。
3. **外推模型有實證支撐**（§3.3 `a1b` 125→35，比值 0.280 vs 預測 0.252），
   唔係「應該會快啲」嘅口頭推論。
4. **紅線唔適用**（見 §6.2）。
5. **§1.2 係一行修改、零風險、可以同 OTA 一齊出。** 唔修就係明知帶住一個
   「用戶可能永久冇歌詞、唔會自癒」嘅狀態出街——而呢個 App 已經因為同類 MMKV 不一致
   食過兩單事故。

### 6.2 「backend restart 要排喺 OTA 前」呢條紅線 —— **喺呢個改動唔成立**

嗰條紅線出自 HLS 個案（`.m3u8` 撞未更新嘅 `stream.js` 出 400，**冇 fallback**）。
2D 有**實測有效**嘅 fallback：舊 backend 回 full → `isFull` 短路 → 新 client 完全唔碰
新 route。**所以 OTA 可以行喺 restart 之前，兩個次序都安全。**

不過我建議嘅次序仍然係 **restart 先、OTA 後**——唔係因為安全，係因為**收益**：
restart 之前出 OTA，全部用戶行 `isFull` 路徑，**一分鐘收益都攞唔到**，
同時仲會令真機 beacon 全部係 `liteIsFull=1`（拎唔到 `lyrMs`/`merged` 嘅真機分佈）。

### 6.3 出街前必補 / 建議補

| 級 | 項 | 出街前？ |
|---|---|---|
| **P0** | §1.2 `s.delete('allHymnsVersion')`（或者 fail 時乜都唔寫） | **必須** |
| P1 | §3.4 剷走 `liteMs`（零資訊、令 beacon 爆 300 截斷） | 建議一齊出 |
| P1 | §1.5 `fetchLyricsMap` 個 `map={}` 兜底改嚴（key 數 0 當 fail） | 建議一齊出 |
| **P1（真機）** | **§6.4 新風險：背景 993KB 歌詞落載同第一首歌搶上行** | **要拍板/監察** |
| P2 | §3.2 加一個「首屏有內容」mark（`hasData` 第一次 true）；報告 §3/L2/L4 要按 §3.2 改寫 | 下一輪 |
| P2 | §3.5 報告補一句「S2 冇交錯」；§3.6 收窄 L5 | 下一輪 |
| P2 | §1.7 merge 完放走 `lyricsMapStore`（慳 2.7MB heap） | 下一輪 |
| P2 | §4.3 `getLyricsById` 零覆蓋，記入限制章 | 下一輪 |

### 6.4 🟠 我獨立發現嘅新風險：歌詞背景落載 vs 第一首歌起播

**改動前**：1.47MB 一次過落，落完先畫到嘢——用戶喺呢段時間**撳唔到播**。
**改動後**：~2 秒就畫到、用戶即刻可以撳播，但**背景仲有 993KB 歌詞落緊**
（tunnel 240-465 KB/s ⇒ **2.1-4.1 秒**）。

即係話 A-6 **將 993KB 背景流量搬咗入「第一首歌起播」嗰個窗口**——而呢個窗口
正正係呢個 project 最脆弱、有成疊事故史嘅地方（0.65MB/s 上行樽頸、build 16 前台
watchdog 10s/5s 門檻假陽性、pos=0 load storm）。音訊本身需要 ~350-500 KB/s。

**呢個唔係反對出街**（總 bytes 冇加、而且用戶提早咗 4.5 秒有得撳，本身係贏），
但係一個**未量過嘅新交互**，而且撞正歷史上最易出事嗰條線。

建議二選一：
- (a) 出街前加一個小 guard：`fetchLyricsMap()` 用 `InteractionManager.runAfterInteractions`
  再延幾秒，或者 player 唔喺 loading 狀態先落；或者
- (b) 照出，但 **Eric 真機第一晚要專登睇「第一首歌起播」嘅 beacon**（`nextTrackMs`、
  `nativeStall`、`wd=` rescue），同 build 16/17 嘅基準對數。

我傾向 **(b) + 明文記低**——(a) 會加新時序邏輯，而新時序邏輯喺呢個 codebase
歷史上出事率唔低；而 (b) 有現成儀器。**呢個要 Eric / Fable 5.1 拍板，唔係我決定。**

---

## 7. 我自己嘅限制

- **冇開模擬器**（2E 獨佔），所以 §1.2 嘅 sticky 情境係**代碼路徑論證 + 行號**，
  唔係實機重現。論證我認為封閉（`:246` gate + `:286-295` fail 分支只寫一個 key），
  但如果要 100% 實錘，要一個「/api/version 掛 + lyrics 掛」嘅雙故障注入測試。
- 對 live 3001 做咗 **3 個唯讀 GET**（health / hymns?lite=1 / hymns/lyrics）。
  無寫入、無 restart。副作用只係 populate 咗 backend 個 `hymnsResponseCache`（同 app
  日常請求一樣）。
- §3.3 嘅真網外推用 2B D-1 三個 run（n=3，跨度 3.2-6.2s 好闊），係**估算**唔係實測；
  我已經標明保守方向。
- 截圖我睇咗 4 張入面 2 張（`2d-02`/`2d-03`，即有爭議嗰兩張）；`2d-00`/`2d-01` 冇開。
- backend C-5/C-6（`0519814`/`feb0060`）唔喺我範圍，只喺 §5 提咗 memory 佔用。
- 驗收期間見到 2E agent 已經喺 working tree 將 E-1（`Promise.race` abort）**同時**應用到
  `fetchHymnsTwoStage` **同** `fetchLyricsMap`（`:147-153`，未 commit）——
  即係 2D 新加嘅 lyrics fetch **冇**遺留 2B §2.6 嗰個「`text()` 永遠唔 settle」缺陷。
  ✅ 呢點我確認咗，唔使 2D 補。
