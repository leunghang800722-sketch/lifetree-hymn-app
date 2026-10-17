# 純音樂 Phase 2 範圍總結(交 Dispatch review,未派工)

日期:2026-08-23
來源正本:`INSTRUMENTAL-CATEGORY-PLAN-20260821.md` §3 / §8 / §9
前置:Phase 1 已完成(commit `b805a3d` + `711497e`,`instrumental` 欄已落 DB,view 已重建,65 首已回標)
狀態:**✅ 2026-08-23 已落實並 commit(`a0a3865`)+ backend 已過 deploy gate restart。⏳ OTA 未推(見 §8)。**
四條拍板全部到齊:①「唔撞」(語言 tab 剔、兒童 tab 唔剔)②13 首英文「包埋」③3a duration gate 併入 ④Add 畫面唔做。
下面 §1-§7 係派工前嘅調查原稿(所有 file:line 係當日實查),§8 係執行同驗收結果。

---

## §1 文件寫嘅 Phase 2 = 六件事

規劃書 §9 原文:

```
Phase 2  前端 + API  ── A 線,1 個班,可同 Phase 3 並行
  2a. server SELECT + 兼容墊
  2b. LibraryScreen tab + filter
  2c. HomeScreen chip
  2d. admin 表單×2
  2e. 歌詞面板文案
  2f. OTA(行 deploy gate)
```

**唔喺 Phase 2 入面**(講清楚,免得派工時滑落去):

- ❌ 新歌入庫 / YouTube playlist discover / 白名單 / whisper 驗證 → **全部係 Phase 4**
- ❌ 避免掹錯時代曲嘅篩選機制(blacklist 反轉、duration band)→ **Phase 4 嘅 4b**
- ❌ `displayTitle.js` 「1 小時」lookahead 補丁 → **Phase 4 嘅 4a**
- ❌ 串流長檔應對 → Phase 3(P0)同 Phase 5(P1 全套)
- ❌ 英文 org 第二波 → Phase 6

即係話 Phase 2 **純粹係「將已經喺庫入面嘅 65 首露返出嚟俾用戶見到」**,唔會多一首新歌入庫。

---

## §2 逐項現況實查(⚠️ 文件有三處行號/位置已經 stale)

### 2a. server SELECT + 兼容墊 —— backend

- `backend/server.js:209` 條 SELECT 現況:`... org, performer, kids FROM hymns` —— **冇 `instrumental`**(Phase 1 執行指引明文叫佢唔好加,留返 Phase 2)。
- `server.js:216-219` 兼容墊現況:`h.real_lang = h.lang; if (h.kids) h.lang = '兒童';`
- 規劃書 §3.2 建議:**唔好**學 kids 咁將 lang 改寫做「純音樂」(舊 client 冇呢個 tab,改咗反而邊個 tab 都搵唔到)。實查證實呢個判斷啱:`LibraryScreen` 嘅 `LANGS` 舊版本冇「純音樂」,強制改 lang 會令 65 首喺舊 client 人間蒸發。
- ⚠️ **新發現(文件冇寫)**:`useCachedHymns.js:133` 有 `canSkip` —— `dataVersion` 一樣就唔 refetch。`dataVersion = hymns.db mtime + size`(`serverDb.js:23-28`)。即係**淨係加 SELECT 欄、DB 冇郁,已經 OTA 咗嘅 client 唔會即刻攞到 `instrumental` 欄**,個新 tab 會暫時空、chip 因為「夠 3 首先出現」gate 唔會現身。歌詞班日日寫 DB,實務上幾個鐘內自愈,但**驗收嗰陣唔好因為「見唔到 tab」就以為 code 錯**;要驗就清 App data 或者等 DB 有寫入。

### 2b. LibraryScreen tab + filter —— 前端

- `frontend/hymn-app/src/screens/LibraryScreen.js:21` `LANGS = ['全部','粵語','國語','英文','兒童']` ✅ 同文件一致。
- filter 鏈實際喺 `:158-185`(`searched` useMemo),`kidsBase` 喺 `:134`。文件講嘅 `kidsBase` 三件套樣板齊全,照抄可行。
- 文件 §3.3 #2 留低咗一個未決定:「現有四個語言 tab 要唔要剔走 instrumental」—— **建議剔**,但呢個牽涉「兒童」tab,見 §4 政策衝突。

### 2c. HomeScreen chip —— ⚠️ 文件行號已經 stale,而且撞正今日先落地嘅嘢

- 文件寫 `HomeScreen.js:57-64` `CHIP_DEFS`。**實查:已經唔喺度。** 今日(8-23)`e43dde0` Phase 2.5 W2 將 `CHIP_DEFS` / `CHIP_PAGE_SIZE` / `buildChips` / `resolveActiveChip` 抽咗去 **`frontend/hymn-app/src/utils/homeChips.js`**,`HomeScreen.js:131` 淨係 `buildChips(hymns)`。
- `quiet` chip 現喺 `homeChips.js:18-19`,regex 同文件 §8.1 描述一致 ✅。
- `MIN_CHIP_SONGS = 3` gate 喺 `homeChips.js:26,32` ✅;fallback `chips.find(...) || chips[0]` 喺 `homeChips.js:38` 同 `HomeScreen.js:135` ✅ —— **剷走 `quiet` 唔會 crash 舊用戶**,文件呢個結論仍然成立。
- 🔴 **最重要發現**:`homeChips.js` 而家**同時係開機本地預載器嘅唯一出處**(`App.js:49-50` import,`App.js:3274-3277` `resolveActiveChip(...)` → `dailyPick(chip.songs, chip.id, 4)` → `chipHeadId` → `App.js:3303` `prefetchAudio(pid)`,iOS only)。詳見 §3。

### 2d. admin 表單×2

- `AdminEditHymnSheet.js:55` form 有 `kids: false`、`:100-101` diff 邏輯、`:186-189` `<Switch>` —— **有現成 kids 樣板可以照抄**。
- `AdminAddHymnScreen.js` **冇 kids 開關**,`:217` 係由 `category/lang === '兒童'` 自動推。純音樂**冇對應嘅自動推導來源**(唔可以由 lang 推,lang 保持真語言)。
  → **建議收窄範圍**:Add 畫面唔加 instrumental UI(Phase 4 入庫走 script 落 flag,admin 手動加歌本來就唔會加器樂);淨係 Edit sheet 加一個 Switch。呢個係要 Dispatch 拍嘅細範圍決定。
- `backend/lib/adminHymns.js:26` `EDITABLE_FIELDS` 現況 `[... 'kids']`,要加 `'instrumental'` —— backend 改動,**要 restart**。

### 2e. 歌詞面板文案

- 實際位置 `App.js:2877`:`<Text ...>暫無歌詞</Text>`(唔喺任何 component 檔,喺 App.js 個 Modal 入面)。改做「純音樂 · 無歌詞」之類,一行 conditional。
- 順帶:`odeIcons.js:25` 註解講嘅「冇歌詞時 icon opacity 0.4」係 icon 層,唔使改。

### 2f. OTA + deploy gate

- Backend 有改動(SELECT 欄 + EDITABLE_FIELDS)→ **要 backend restart,要行 deploy gate**。
- 前端純 JS → **OTA 得,零新 native build**(見 §5)。

---

## §3 🔴 Phase 2 同 Phase 3 嘅硬耦合(文件寫「可並行」,實查係「唔可以」)

規劃書 §9 寫「Phase 2 / 3 互不依賴可齊行」。**呢句喺 Phase 2.5 W2 落地之後已經唔成立。**

實查鏈條:

1. 加「純音樂」chip 落 `homeChips.js` → 佢自動變成開機預載器嘅候選(`App.js:3274`)。
2. 用戶一揀咗個 chip(MMKV `home.chip.v1`),下次開 App 就會 `prefetchAudio(chipHead[0])` —— **全檔落載入 JS heap**。
3. `src/audioPrefetch.js:37` `DOWNLOAD_TIMEOUT_MS = 90 * 1000`,`:296` `await response.arrayBuffer()`,`:303` `new Uint8Array(buf)`。**冇任何 duration gate**(grep 過,`duration` 呢個字喺成個檔零命中)。
4. 而 65 首入面有兩首長片:

| id | 長度 | 估體積 | 標題 |
|---|---|---|---|
| 739 | **57:58** | ~57MB | 《Amazing Piano 2》基恩敬拜鋼琴靈修音樂 |
| 4820 | **25:48** | ~25MB | Piano Lullabies (Great I AM) / Hillsong Kids |

  90 秒內落 57MB 要 650KB/s。落唔切 → abort → **每次開 App 重試一次,每次白燒幾十 MB**(`audioPrefetch` 冇失敗記憶),加 jetsam 風險。

**結論**:`Phase 3 嘅 3a`(`prefetchAudio()` duration gate,>10 分鐘唔做全檔預載)由「可並行」升級做 **Phase 2c 嘅硬前置**,或者最低限度同一個 OTA 批一齊出。3a 本身係 `audioPrefetch.js` 一個 duration parse + early return,好細,唔值得為咗趕而分開。

> 補充:呢兩首長片今日已經喺庫入面播緊,唔係新風險 —— 但佢哋而家**冇入口**(藏喺國語/兒童 tab 幾千首中間)。Phase 2 個 chip + tab 正正就係俾佢哋一個高流量入口,而且 chip head 會被**自動預載**。呢個係 Phase 2 自己製造出嚟嘅新曝光。

---

## §4 政策決定點樣套落 Phase 2(衝突① 已拍板,衝突② 未拍板)

| # | Eric 拍板 | 對 Phase 2 嘅實際意思 |
|---|---|---|
| Q1 | 英文 org **唔收住**(只管 Phase 4 新入庫) | ✅ 已釐清:Phase 1 回標嗰 **13 首英文**(全部 Hillsong Kids)**照露**,Eric 2026-08-23 拍板「包埋」。Phase 2 **唔加任何 lang 條件**,tab/chip 直接讀 `instrumental===1`,一視同仁 |
| Q2 | 新歌 **10 分鐘上限**;存量回標唔受此限 | Phase 2 唔入新歌,所以個 10 分鐘閘用唔著;但存量嗰兩首長片會出街 → 就係 §3 個問題 |
| Q3 | **伴奏/karaoke 唔收** | Phase 4 blacklist 事,Phase 2 零影響 |
| Q4 | 詩歌庫加 tab;首頁「安靜靈修」chip **改做**「純音樂」(取代,唔係並存);用新 id `instrumental` 唔好翻用 `quiet` | **呢條就係 2b + 2c 本身**。§8.1 分析(fallback 唔 crash、≥3 首 gate、dailyPick salt)實查全部仍然成立,只係檔案位置搬咗 |
| Q5 | 過渡期舊 client 接受 | 支持「唔改寫 lang」嘅兼容墊做法(2a) |
| Q6 | whisper 實錘自動落 flag,擦邊要 Eric 過目 | Phase 1 已執行(65 落 flag,221 擦邊唔寫)。Phase 2 只露 65 首 —— **即係個 tab 一開波係 65 首,唔係 286 首** |

### ✅ 衝突① —— 已拍板(2026-08-23):13 首英文「包埋」

65 首分佈實查:**國語 50 / 英文 13 / 粵語 2**。13 首英文全部係 **Hillsong Kids**,而且 **13 首全部 `kids=1`**。

**Eric 拍板:包埋 —— 照露出嚟,唔使因為語言另外做特殊處理。**

落到 code 嘅實際意思(執行指引要照抄呢三句):

1. **`LibraryScreen` 純音樂 tab 嘅 filter 就係 `h.instrumental === 1`,一個 lang 條件都唔加。** 唔准寫 `&& h.lang !== '英文'` 或者 `&& h.real_lang !== '英文'` 呢類「暫時收埋」寫法。
2. **`homeChips.js` 嘅 `instrumental` chip `match` 同樣淨係 `h.instrumental === 1`。** 個 chip 池 = 全 65 首,`dailyPick` 由 65 首入面抽,英文歌照抽得中。
3. **Phase 4 唔受影響。** Q1「英文 org 唔收住」仍然管住新入庫嗰條線 —— 呢次拍板只係講「已經喺庫、已經回標嘅存量照露」,唔係開返英文 org 收錄。兩件事唔好撈埋。

⚠️ **注意:呢個拍板唔解決衝突②。** 「包埋」講嘅係「純音樂 tab **要唔要有**呢 13 首」(答:要);衝突② 問嘅係「呢 13 首**仲使唔使同時留喺兒童 tab**」——係另一個問題,仍然等拍板。

### ⚠️ 衝突② —— 「純音樂 tab 剔走其他 tab」撞正兒童

規劃書 §3.3 #2 建議「四個語言 tab 剔走 instrumental,唔好一首歌兩邊出」。但:

- 13 首 instrumental **同時係 kids=1**,server 兼容墊會將佢哋 `lang` 改寫做「兒童」。
- 一剔,**兒童 tab 由 653 跌到 640**(-2%),首頁「兒童詩歌」chip 個池同步縮。
- 唔剔,呢 13 首兩邊都出。

三個選項(要 Dispatch 拍):
- **(a) 全剔**:最乾淨,一首歌一個家。兒童 tab -13。
- **(b) 只剔語言 tab,兒童 tab 唔剔**:兒童內容完整性優先(家長搵兒童歌唔應該少咗鋼琴搖籃曲)。代價係 13 首兩邊出。
- **(c) 完全唔剔**:65 首兩邊出,tab 之間變「view」唔係「分區」。

我嘅建議係 **(b)** —— 兒童係「受眾」維度,純音樂係「形式」維度,兩者本來就正交(kids × instrumental 就係 Hillsong Kids 鋼琴搖籃曲呢個真實產品);而語言 tab 同純音樂就真係互斥(器樂冇語言)。但呢個係品味決定,唔應該我自己拍。

### ⚠️ 觀感注意 —— 粵語得 2 首

Eric 自己係粵語用戶。新 tab 入面粵語只有 2 首(國語 50)。首頁 chip 換咗之後,佢撳「純音樂」見到成版國語,可能會覺得「呢個分類唔關我事」。唔係 bug,但派工前值得知,Phase 4 首波要留意補粵語 org。

---

## §5 前端 / backend / native 判斷

| 層 | 要唔要改 | 內容 |
|---|---|---|
| **Backend** | ✅ 要 | `server.js:209` SELECT 加欄、`server.js:216-219` 兼容墊加一句、`adminHymns.js:26` `EDITABLE_FIELDS` 加 `'instrumental'`。**要 restart + 行 deploy gate** |
| **前端 JS** | ✅ 要 | `LibraryScreen.js`(LANGS + filter 分支)、`utils/homeChips.js`(chip 換走)、`AdminEditHymnSheet.js`(Switch)、`App.js:2877`(文案)、[建議一齊做] `audioPrefetch.js`(duration gate) |
| **Native build** | ❌ **唔使** | 全部係 JS。冇新 native module、冇新 permission、冇 `app.json` 改動、冇新 icon/asset。`<Switch>` 係 RN 內置(admin sheet 已經 import 緊)。**純 OTA 出得**,Android / iOS 都係 |
| **DB / migration** | ❌ 唔使 | Phase 1 已做完(欄 + view 都驗過) |

**部署節奏**:backend restart 同 OTA 有先後 —— **先 restart backend(出欄),再 OTA**。反過嚟嘅話,OTA 咗嘅 client 收到冇 `instrumental` 欄嘅 payload,個 tab 會空、chip 唔出現,加上 §2a 個 `dataVersion` skip,可能要等幾個鐘先自愈。

---

## §6 工作量估算

| 項 | 檔案數 | 估算 | 難度 |
|---|---|---|---|
| 2a server SELECT + 墊 | 1 | 15 分鐘 | 極低(照抄 kids) |
| 2b LibraryScreen tab + filter | 1 | 30-45 分鐘 | 低,但要諗清楚 §4 衝突② 點寫 |
| 2c HomeScreen chip | 1(`utils/homeChips.js`) | 15 分鐘 | 極低(得一個 array entry) |
| 2d admin | 2(Edit sheet + adminHymns.js) | 30 分鐘 | 低(照抄 kids Switch);Add 畫面建議唔做 |
| 2e 文案 | 1(App.js) | 10 分鐘 | 極低 |
| **3a duration gate(建議併入)** | 1(`audioPrefetch.js`) | 20 分鐘 | 低 |
| 驗收(模擬器雙機:tab/chip/預載/admin/舊 cache) | — | 1-1.5 鐘 | 中 |
| restart(deploy gate)+ OTA | — | 30 分鐘 | 低,但要避開 Eric 真機 QA 窗口 |

**總計:一個 Sonnet5 班,約 3-4 個鐘(含驗收)。** 改動總量約 **6 個檔、100 行以下**。

**風險等級**:比 Phase 1 高一級,但唔係因為改動複雜 —— 係因為:
1. 出街欄位改動 + backend restart(Phase 1 完全冇掂呢兩樣);
2. 動咗 `homeChips.js` —— 呢個檔琴日先變成「首頁 + 開機預載器共用嘅單一出處」,改佢有預載副作用(§3);
3. 剷 `quiet` chip 係**用戶可見嘅功能移除**(雖然 Eric Q4 已經拍板取代)。

三樣都可以用「OTA 可即刻 rollback」兜返。

---

## §7 派工前要拍嘅事 —— 1 件已拍,3 件未拍

| # | 事項 | 狀態 |
|---|---|---|
| ~~①~~ | ~~13 首英文(Hillsong Kids)照露定暫時收埋?~~ | ✅ **2026-08-23 Eric 拍板:包埋,照露,唔做語言特殊處理**(見 §4 衝突①) |
| ② | 純音樂 tab 剔唔剔走其他 tab? | ⏳ 未拍。我建議 (b)「語言 tab 剔、兒童 tab 唔剔」 |
| ③ | 3a duration gate 併唔併入 Phase 2? | ⏳ 未拍。我建議**併**(§3 嘅預載耦合),否則 chip 一出就有 iOS 用戶每次開 App 白燒幾十 MB 嘅風險窗口 |
| ④ | AdminAddHymnScreen 做唔做? | ⏳ 未拍。我建議唔做(冇自動推導來源,Phase 4 走 script) |

**②③④ 仍然全部未拍 → 未准落 code。** 三件齊咗先出 `INSTRUMENTAL-PHASE2-EXEC` 執行指引交 Sonnet5。

三件裡面 ② 係最影響 `2b` 點寫嘅一條(filter 鏈要唔要 `&& h.instrumental !== 1`、要唔要對 `kidsBase` 開例外);③ 影響改動檔案清單(多一個 `audioPrefetch.js`)同風險等級;④ 只影響 `2d` 嘅範圍大細。

---

## §8 執行 + 驗收結果(2026-08-23)

### 8.1 四條拍板點樣落地

| # | 拍板 | 落地位置 |
|---|---|---|
| ① | 「唔撞」 | 語言 tab/chip 加 `&& h.instrumental !== 1`;**兒童分支刻意冇加**(`kidsBase` 原封不動),code 入面有明文註解講點解 |
| ② | 13 首英文「包埋」 | 純音樂 tab/chip 個 filter 就係 `h.instrumental === 1`,**一個 lang 條件都冇** |
| ③ | 3a 併入 | `audioPrefetch.js` 加 `MAX_PREFETCH_SECONDS = 600` + `setDurationIndex()`,閘擺喺 `prefetch()` 唯一收口位 |
| ④ | Add 畫面唔做 | `AdminAddHymnScreen` 零改動;POST route 都刻意唔收 instrumental(有註解講明係決定④,唔係漏) |

### 8.2 改咗嘅檔(commit `a0a3865`,8 個)

| 檔 | 改乜 |
|---|---|
| `backend/server.js` | SELECT 加 `instrumental`;兼容墊加註解講明**刻意冇** lang 改寫 |
| `backend/lib/adminHymns.js` | `EDITABLE_FIELDS` 加 `'instrumental'` |
| `backend/routes/admin.js` | `validateKidsField` → `validateIntFlagField` + `INT_FLAG_FIELDS = {kids, instrumental}` |
| `frontend/.../LibraryScreen.js` | `LANGS` 加「純音樂」(擺最尾)+ `instrumentalBase` + filter 鏈四分支 |
| `frontend/.../utils/homeChips.js` | `quiet` 剷走 → `instrumental` chip;三個語言 chip 加剔器樂條件 |
| `frontend/.../audioPrefetch.js` | `parseDurationSec()` / `setDurationIndex()` / >10 分鐘閘 |
| `frontend/.../App.js` | import + 灌 duration index + 歌詞面板空狀態文案 |
| `frontend/.../AdminEditHymnSheet.js` | 「純音樂」Switch(可同「兒童詩歌」同時開) |

### 8.3 驗收(全部行真 code / 真數據,唔係抄一份邏輯)

harness 放 scratchpad(**唔准入 `backend/`,會擋 deploy gate**),babel 轉譯真 module + stub `react-native`/`expo-file-system`/`config.js`,餵真 `hymns.db` 6040 行;`/api/hymns` 條 SELECT 係由 `server.js` 讀返出嚟跑,唔係手抄。

| 組 | 結果 |
|---|---|
| 2a server SELECT + 兼容墊 | 6/6 ✅(lang 冇被改寫、13 首 kids 器樂照樣行 kids 墊) |
| 2b LibraryScreen filter | 16/16 ✅(國語 3654→3604、粵語 1649→1647、英文 83 不變、**兒童 653 不變**、純音樂 65 含 13 英文) |
| 2c homeChips | 9/9 ✅(`quiet` 冇咗、舊用戶 saved `quiet` fallback 返 cantonese 唔 crash) |
| 3a 長檔閘 | 9/9 ✅(#739 57:58 / #4820 25:48 零落載,短歌照落) |
| 2d admin(lib 層) | 6/6 ✅(真行 `updateHymn()` 1→0→1,收爐核對還原) |
| 2d admin(route 層) | 11/11 ✅(真 router 掛喺 throwaway app;2/'yes' → 400、0 收得、kids 舊行為冇壞) |
| 預載耦合 | 3/3 ✅(長片就算被 chip 抽中做 head 都唔會全檔預載) |
| **合計** | **60/60 pass,0 fail** |

**舊 cache 回歸**:payload 冇 `instrumental` 欄嗰陣,三個語言 tab 數字同改動前一模一樣(3654/1649/83),純音樂 tab 空但唔爆。

**Live 驗證**(backend restart 之後打真 `/api/hymns`):6040 首、有 `instrumental` 欄、65 首 =1、出街 lang = 粵語2/國語50/兒童13、real_lang = 粵語2/國語50/英文13、冇一首被改寫做「純音樂」。

**Bundle 預檢**:`expo export` iOS + Android 兩邊各行一次,**兩邊都 exit 0**(3.6MB hbc)。byte-scan 兩個 bundle:「純音樂」1、「純音樂 · 無歌詞」1、**「安靜靈修」0**(確認 chip 真係換走咗)。

### 8.4 部署狀態

- ✅ **backend 已 restart**:`approve.sh backend a0a3865` → `backend-restart.sh` 全過 gate,health check 200。
  **夾帶檢查結果:乾淨。** 由上次批准嘅 `711497e` 到 `a0a3865` 之間有 4 個 commit,但**只有我呢個掂到 backend code**(其餘三個純前端);`backend/data/worshipGroups.js` 嗰個未 commit 改動 mtime 係 8-08、屬 `backend/data/` 豁免區,而且跑緊嘅 backend 一早已經載緊佢,唔係新嘢。
- ⏳ **OTA 未推 —— 等拍板**。原因唔係 code 未 ready(bundle 預檢兩平台都過),係**夾帶規模**:上次批准嘅 OTA sha 係 `9f078d0`(8-19),到而家已經積咗 **47 個前端 commit**。推一次 = 47 個一齊出街,唔係得純音樂呢一個。詳見下面。

### 8.5 ⏳ OTA 夾帶盤點(要 Dispatch / Eric 拍板先推)

`approved.json` 嘅 `ota.sha` = `9f078d0`(2026-08-19 批)。`git log 9f078d0..HEAD -- frontend/` = **47 個 commit**,推 OTA 會一次過出晒,入面至少有三批性質好唔同嘅嘢:

1. **本來就等緊一齊出嘅**:`e43dde0` Phase 2.5 W1-W4(開機預載 5 首)一直壓住,等 `df60084`(P1-1 閂三處臨時 beacon)——兩個而家都 in。
2. **今日先落地、我未驗過嘅**:`08972af`(另一個 session 15:07 commit 嘅 theme 兩層收乾 + 前端零碎)、`5785d2c`(開返 `nextTrackMs` 上報)。我嘅 bundle 預檢證到佢哋 **build 得**,但冇驗過行為。
3. **8-19 到 8-22 嘅一大批**:鍵盤收唔返、已下架最愛、playQueue generation counter 等等。

我唔會自己 `approve.sh ota` —— 呢個 gate 存在嘅意義就係唔俾一個 session 順手推走另外 46 個 commit。要推嘅話:

```bash
ops/deploy/approve.sh ota $(git rev-parse HEAD) --confirm
```

(佢會先印晒 47 條俾你逐條睇,`--confirm` 先寫入),然後

```bash
ops/deploy/ota-publish.sh "純音樂 tab/chip + 長檔預載閘(Phase 2 + 3a)"
```

**在 OTA 推之前,呢個 Phase 2 對用戶零可見影響** —— backend 雖然出咗 `instrumental` 欄,但冇任何已上線嘅 client 識讀佢。即係話「hold OTA」係零成本,唔會留低半生熟狀態。

---

*調查:Opus 5,2026-08-23。所有 file:line 同數字係當日實查 `hymn-app` working tree + `backend/hymns.db` readonly query,唔係照抄規劃書。*
