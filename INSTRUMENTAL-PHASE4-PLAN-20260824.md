# 純音樂 Phase 4 執行規劃(新歌入庫首波 · 中文 org)

日期:2026-08-24
上游:`INSTRUMENTAL-CATEGORY-PLAN-20260821.md` §9 Phase 4(C+E 線)
狀態:**規劃階段,等 Dispatch 過目後先派工**
前置:Phase 1(65 首回標)、Phase 2(tab/chip/OTA 已推)、Phase 3b(長檔 warm)全部已上線

---

## §0 五條拍板(Eric 2026-08-24)同佢哋嘅執行含意

| # | 拍板 | 執行含意 |
|---|---|---|
| **P1** | 器樂線 duration **維持 120 秒下限**,唔放寬 | `isInSongDurationBand` 加 `minOverride`,器樂線傳 `[120, 600]` |
| **P2** | 213 首擦邊點處理 **交返俾我哋決定** | 見 §1 —— **決定咗做,而且擺喺 4c 前面**,理由喺 §1 |
| **P3** | discover **同** 官網目錄 **兩條線都做** | 4c 拆做 4c-A(channel playlist)+ 4c-B(官網 catalog) |
| **P4** | 白名單由我哋簽,Eric 事後抽驗 | 簽名紀律寫死喺 §5.2;apply report 要做到「一眼可抽驗」 |
| **P5** | 新歌入庫即刻 `curated=1` 上架 | **apply run 就係最終把關**,冇下游 review → 品質閘全部前移,見 §4 |

> **P5 嘅設計後果(貫穿成份文件)**:因為冇 Eric review 呢一層,所有「唔肯定」一律**唔入庫**,唔係「入咗再算」。寧可 4c 產出得十幾首,都唔可以放一首有人聲/世俗歌入純音樂 tab。§4 個五重閘就係為呢條而砌。

---

## §1 P2 決定:213 首擦邊 —— **做,而且排喺 4c 前面**(新增 Phase 1.5)

### 1.1 決定

開一個 **Phase 1.5「擦邊回收」**,排喺 4a/4b 之後、4c 之前。**唔係清尾巴,係 4c 嘅技術前置。**

### 1.2 點解 —— 三個理由,第三個係決定性

**理由一:呢批唔係「判唔到」,係「判定式睇漏咗一種靜音指紋」。**

我逐條分析咗 `backend/data/instrumental/scan-20260823.json` 個 `soft` 陣列(實數 **221** 首,report 寫 213 係扣咗後來補入 `knownAdded` 嗰 8 首)。分因:

| 首數 | 原因 |
|---|---|
| 68 | whisper 佔位符型全程靜,但歌名/專輯冇器樂訊號(得一條證據) |
| 35 | `duration` 解唔到(null)→ 計唔到 coverage |
| 28 | whisper 實錘靜,但 `lyrics_status='draft'`(唔喺複核線隊列中間抽歌) |
| 17 | whisper 冇任何段落 |
| **~70** | **whisper 靜但係「幻覺型」** —— unique 行係 `詞曲李宗盛編曲李宗盛` / `詩歌歌詞的錄音` / `watertrickling` / `gentlepianomusic` 呢類 |

嗰 ~70 首「幻覺型」入面,有兩類係**我哋自己造出嚟嘅、可以識別嘅指紋**:

- **A 類 · prompt 迴響**:`詩歌歌詞的錄音` / `粵語或國語敬拜讚美詩歌` —— 呢個**逐字就係 `lib/whisperTranscribe.js:31` 個 `ZH_INITIAL_PROMPT`**(「以下是詩歌歌詞的錄音,粵語或國語敬拜詩歌。」)。whisper 完全聽唔到人聲嗰陣會直接吐返 initial prompt。呢個唔可能係真歌詞。
- **B 類 · credits loop 幻覺**:`詞曲李宗盛` / `陳零九` / `韋禮安` / `張淑莉` —— memory `project-lyrics-r1-2026-08-22-night.md` 已經實錘過呢條 vein。

**實測精度**(我喺 scan JSON 上跑咗 per-class 測試):

| 指紋類 | soft 命中 | **vocal 命中(假陽性)** | observe 命中 |
|---|---|---|---|
| A · prompt 迴響 | 16 | **0** | 53 |
| B · credits 幻覺 | 36 | **0** | 85 |
| C · 音效描述(`watertrickling`/`gentlepianomusic`) | 3 | **2** ⚠️ | 0 |
| D · `[MUSICPLAYING]` 系 | 102 | **60** ⚠️ | 548 |
| E · `you` / `Thankyou` | 12 | **3** ⚠️ | 28 |

A/B 兩類喺「whisper 標到人聲」嗰 215 首入面**零命中**;C/D/E 有大量假陽性(佢哋喺有人聲嘅歌度同真歌詞行**並存**),所以 C/D/E **淨係可以做白名單成員,唔可以做通行證**。

**理由二:🔴 但 A/B 都唔可以單獨判死 —— observe 入面有 138 首命中。**

`observe`(807 首 verified 但 whisper 全程靜)入面,A 類命中 53、B 類命中 85。呢批係**有 OCR verified 歌詞、確定有人聲**嘅歌。即係:

> **「whisper 吐 A/B 幻覺」= whisper 聽唔到人聲,唔等於冇人聲。**

呢個係 Phase 1「兩條獨立證據」紀律嘅直接再確認。Phase 1.5 **一定要保留元資料證據呢條腿**,唔可以因為指紋乾淨就放行。呢條同時係 §4 嘅基礎 —— 4c 嘅新歌一樣會吐 A/B 幻覺,一樣唔可以當音訊實錘。

**理由三(決定性):唔做 Phase 1.5,4c 嘅 whisper 閘會用緊一條睇漏咗 A/B 嘅判定式,新歌會被大面積誤拒。**

Phase 1 個判定式只認 `MUSIC_PLACEHOLDERS`(`scanInstrumentalCandidates.mjs:95`)。4c 落新歌之後跑 whisper,真器樂片一樣會吐「詞曲李宗盛」——用舊判定式一律變 `soft`,4c 產出會接近零,而且白燒晒 whisper 機時(每首 2-6 分鐘)。**Phase 1.5 就係喺零 YouTube request、有 6040 首 ground truth 嘅環境下校準 4c 個閘。** 存量回標係副產品,校準先係主產品。

### 1.3 Phase 1.5 範圍同預期產出

- 擴充 `scanInstrumentalCandidates.mjs` 嘅靜音白名單:`MUSIC_PLACEHOLDERS` ∪ **A 類** ∪ **B 類**(A/B 另開一個 `HALLUCINATED_SILENCE` set,report 要分開數,唔好混淆兩者)。
- 判定規則**唔放鬆**:仍然要 `titleEvidence.ok`(元資料證據)+ `coverage ≥ 0.85` + `vocalMarks 空` + 非 `verified` + 非 `draft` + `lyrics` 欄空 + 唔中 Q3 blacklist。
- **重新跑全庫掃描**(唔准喺 `scan-20260823.json` 上面計)—— 個 JSON 嘅 `sample` 欄最多只存 3 行,`uniqSegs ≥ 4` 嗰批睇唔到全部 unique 行,喺舊 JSON 上判會出錯。
- `duration IS NULL` 嗰 35 首:順手用現成 metadata backfill 補返 duration 再入判定(memory `project-lyrics-r1b-2026-08-23-evening` 記過 `duration IS NULL` 令 shortOk 死 79 首,同一個病)。
- `lyrics_status='draft'` 嗰 28 首:**照舊唔掂**,唔喺複核線隊列中間抽歌。
- **預期產出:14–25 首**回標(我喺舊 JSON 上模擬「兩條證據齊 + cov≥0.85 + 非 draft」得 14 首,重掃 + 補 duration 之後會多啲)。名單頭尾大概係 #739 / #754 / #3989 / #4164 / #4977 / #5690 / #5699 / #5806 / #5807 / #5812 / #5923 / #5925 / #5983 / #5988 / #6033 呢批。
- 產出物:`backend/data/instrumental/scan-20260824*.json` + report + `applyInstrumentalFlags.mjs` 重跑(現成、冪等)。

**工作量:半日,零 YouTube request,零掹錯世俗歌風險。**

---

## §2 任務清單

```
T0  基線快照 + 分支                                      10 分鐘
T1  4a  displayTitle「小時」lookahead 補丁 + dry-run       30 分鐘   ← 純 code
T2  4b  五個 code 缺口修完(gate config + INSERT 欄 + …)   半日     ← 純 code,唔掂 DB 資料
T3  Phase 1.5  擦邊回收(§1)                             半日     ← 零網絡
── 以上全部零 YouTube request、零新歌 ───────────────────────
T4  4c-0  貨源盤點(discover + 官網,read-only)            半日
T5  4c-A  channel playlist discover → 簽白名單             半日
T6  4c-B  官網 catalog 線(P3)                            半日
T7  4c-V  whisper 五重驗證(逐首,可過夜)                 1–2 晚機時
T8  4c-P  apply 入庫(locked write,唯一寫 DB 嘅一步)      1 小時
T9  4d  regenerateDisplayTitles dry-run + 上架驗收 + 部署   半日
```

**硬停位**:T4–T8 之間每一步都要**停低出 report 俾 Dispatch 睇**,唔准一條龍跑到底。T8 係唯一會 INSERT 新歌嘅一步。

---

## §3 五個 code 缺口點修(T2)

### 3.1 🔴 `backfillAlbumFromPlaylists.js --apply` 唔會入新歌 → **唔改佢,另開新 script**

實查 `scripts/backfillAlbumFromPlaylists.js:415-430`:apply mode 係 `SELECT id, album, album_source FROM hymns_all WHERE youtube_id = ?` 然後 **UPDATE album**,搵唔到就 `writeStats.notFound++`。佢係專輯名回填器,唔係 ingester。

**做法**:
- **`--discover` 半邊照抄**(佢真係現成好用:`fetchFlatJson` 列 playlist、member_count、`matched_in_db`、衝突偵測、stale-check)。
- **`--apply` 半邊唔掂佢**(佢仲要繼續服務 album backfill 線)。新開 `backend/scripts/ingestInstrumental.mjs`,設計見 §5。

### 3.2 🔴 三條 INSERT 路徑冇寫 `instrumental`

| 檔案 | 現況 | 做法 |
|---|---|---|
| `lib/backfillCore.js:55` | 寫 `kids`,冇 `instrumental` | 加 `instrumental` 欄,值由 `group.instrumental ?? 0`(預設 0,行為零變化) |
| `scripts/growLibrary.js:434` | 同上 | 同上 |
| `lib/adminHymns.js:177` | 同上;`EDITABLE_FIELDS:26` 有 `instrumental`(即係 admin 加完歌要再手動改一次) | 加 `instrumental` 欄,由 admin 表單傳入(預設 0) |

⚠️ 三條都要**明確寫 `0` 做預設**,唔可以靠 column default —— 免得將來邊個改咗 default 就靜靜哋轉晒。

### 3.3 🟠 `isNonWorship` 加 line context

現況:`lib/hymnDb.js:260` `isNonWorship(title = '', artist = '')`,**9 個 caller**:
`scripts/auditChannel.js:55,66`、`scripts/growLibrary.js:233`、`scripts/curateLibrary.js:62`、`lib/channelScan.js:107`、`lib/reconcileCore.js:128`、`lib/backfillCore.js:29`、`routes/admin.js:273`。

**做法**:加**第三個 optional 參數** `isNonWorship(title, artist, opts = {})`,唔郁前兩個位置參數 → **9 個 caller 一個都唔使改,行為零變化**。

```
opts.line === 'instrumental' 時:
  · 豁免:純音樂 / instrumental / 演奏        ← 呢啲喺器樂線係標題本身
  · 保留:琴譜 / 樂譜 / 歌譜 / 教學 / 示範影片 / 預告 / 宣傳影片
          tutorial / sheet music / trailer
  · 保留(§8 Q3 拍板唔收):伴奏 / karaoke / backing track / 卡拉OK
  · 額外加(器樂線專用 exclude,§4.1 Layer 2):
    時代曲 / 老歌 / 流行曲 / 懷舊 / 金曲 / 輕音樂 / 冥想 / 瑜伽 /
    助眠 / 白噪音 / 純鋼琴教學 / 鋼琴譜
```

⚠️ **完整詞組紀律**(`hymnDb.js:203-207`):2+ 字,唔用單字。新 pattern 一定要跑**全庫 curated regression**(對 6040 首 title 跑一次,列晒新中招嘅,人眼掃)—— bare「見證」誤殺 9/10 嘅前科。器樂線嗰批新 exclude 只喺 `line:'instrumental'` 生效,理論上唔會郁主庫,但 regression 仍然照跑做保險。

### 3.4 🟠 `isInSongDurationBand` 加 min override

現況:`lib/hymnDb.js:353` `isInSongDurationBand(seconds, maxOverride)`,只有 max。6 個 caller。

**做法**:改做 `isInSongDurationBand(seconds, maxOverride, minOverride)` —— 第三個參數 optional,**6 個 caller 零改動**。器樂線傳 `(sec, 600, 120)`。

> P1 拍板 120 秒下限已經比主庫嘅 75 秒**嚴**,即係器樂線唔會收到主庫收唔到嘅短片,方向安全。

### 3.5 🟠 `DATA_DIR` 參數化

`backfillAlbumFromPlaylists.js:47` 硬編碼 `data/album-backfill`。新 script `ingestInstrumental.mjs` 自己用 `data/instrumental/`,**唔改舊 script 個常數**(改咗會令 album 線讀唔返自己啲白名單)。共用嘅只係 discover 邏輯 —— 抽做 `lib/playlistDiscover.js` 共用 module,兩邊各自傳 `dataDir`。

---

## §4 🔴 4c 嘅五重驗證閘(P5 之下嘅品質核心)

因為 P5 冇 Eric review,呢五重就係全部把關。**任何一重唔過 = 唔入庫**,唔設「人手翻案」快速通道(翻案要 Eric 抽驗時自己講)。

### 閘 1 · 結構閘(零成本,喺攞歌之前)
- 只行 **官方 channel 嘅 playlist**(§4.1 Layer 1)。**零關鍵字搜尋** —— 唔准用 `ytsearch`、唔准用「純音樂」呢類 query。呢條係「掹錯時代曲」嘅唯一根治法(§10 風險 #1)。
- playlist 必須**本身有器樂訊號**(標題含 `演奏 / 純音樂 / Instrumental / 弦樂 / String Quartet / 安靜系列 / 鋼琴 / Piano / 靈修音樂 / soaking` 呢類),而唔係「簽咗就算」。白名單新增一個 **required** 欄 `instrumental_signal`,冇填唔准 apply(照抄現有 `proposed_album` 冇填就 skip 嘅紀律)。
- org 必須喺 §5.1 六個中文 org 白名單內。

### 閘 2 · 標題/片長閘(零成本)
- `isNonWorship(title, org, {line:'instrumental'})` 唔中(§3.3)
- `isCompilation(title)` 唔中
- `isInSongDurationBand(sec, 600, 120)` 過(P1)
- `youtube_id` 未喺 `hymns_all`(任何 status,包括 dead/uncurated)

### 閘 3 · 🆕 YouTube auto-caption 交叉閘(實測驗證過,規劃書冇呢條)
**一個 `yt-dlp --list-subs --skip-download` metadata call(~5-10 秒),喺落片之前跑。**

我實測咗四條片:

| 片 | 類型 | auto-caption |
|---|---|---|
| #3989 大提琴演奏 | 器樂 | **冇** |
| #4163 台北青少年弦樂團 | 器樂 | **冇** |
| #2 這一生最美的祝福 | 有人聲 verified | **有**(en-US + 幾百個翻譯) |
| #4 主禱文 | 有人聲 verified | 冇(只有 live_chat) |

→ **單向可靠**:`有 auto-caption = 硬拒`(YouTube ASR 係同 whisper **完全獨立**嘅第二個引擎,佢聽到嘢即係有人聲);`冇 auto-caption ≠ 冇人聲`(#4 就係反例),所以**唔准當正面證據**。
→ 好處:呢個閘喺**落片之前**擋走一批,慳返 whisper 機時。

### 閘 4 · whisper 雙 pass 閘(主閘)
落 **audio-only**(`yt-dlp -f bestaudio`,唔使好似 fetchLyrics 咁落成條片)→ `ffmpeg -vn -ar 16000 -ac 1` → wav。

**兩個 pass 都要跑**:
- **Pass ZH**:`-l zh` + 現有 `ZH_INITIAL_PROMPT`
- **Pass EN**:`-l en`

> 🔴 **必修**:`lib/whisperTranscribe.js:71-80` 個垃圾過濾器,喺 `lang==='zh'` 時會將 CJK 佔比 <30% 嘅段全剷,`>50%` 就回 `{segs:[], failed:true}`。**純器樂片嘅 `[MUSIC]` 段 CJK = 0%,會被剷到一條唔剩、`failed:true`** —— 即係我哋要嘅證據啱啱好被過濾器食晒,而且同「真失敗」分唔開。
> **做法**:加一個 optional `{ keepRawSegs = false }`,預設 `false` = 現有行為**一模一樣**(歌詞線零影響),器樂線傳 `true` 攞回 `rawSegs`。唔准改預設值。

**判定**(兩個 pass 各自算,兩個都要過):
```
硬拒 ①  任何 pass 出現 vocalMark
        (沿用 scanInstrumentalCandidates.mjs:103 個 VOCAL_MARK_RE:
         sing/speech/speak/vocal/applau/cheer/laugh/audience/foreign/
         nonenglish/chant/choir/humming/narrat/talking/crowd)
硬拒 ②  去除白名單(MUSIC_PLACEHOLDERS ∪ A 類 ∪ B 類,Phase 1.5 校準)後
        仲有任何剩餘文字行
硬拒 ③  coverage < 0.85
        (coverage = max(seg.t1) / duration;duration 用 yt-dlp 攞到嘅
         **真秒數**,唔准用 DB 個 TEXT "m:ss" 欄)
硬拒 ④  兩個 pass 結論唔一致 → 唔入庫,落人手 report
```

> ⚠️ **A/B 幻覺唔算正面證據**(§1.2 理由二):佢哋只證明「whisper 聽唔到人聲」。所以閘 4 過咗**淨係代表音訊證據成立**,第二條獨立證據係閘 1 嘅器樂 playlist 簽名。兩條腿缺一不可 —— 同 Phase 1 一致。

### 閘 5 · playlist 一致性閘(零成本)
同一個 approved playlist 入面,如果 **≥80% member 過晒閘 4、但個別幾首唔過** → 唔過嗰幾首多數係專輯附送嘅人聲原版,**照拒**(本來就會拒),同時**喺 report 標出嚟**。
反過來,如果一個 playlist **<50% member 過閘** → 呢個 playlist 大機會根本唔係器樂專輯(簽錯咗)→ **成個 playlist 唔 apply**,退返去重簽。

---

## §5 `ingestInstrumental.mjs` 設計(T5–T8)

### 5.1 四段式(唔係兩段式)

`backfillAlbumFromPlaylists.js` 係兩段(discover / apply),因為佢唔使落片。器樂線要 whisper,慢、可中斷、要重跑,所以**驗證獨立一段**:

| mode | 做乜 | 寫 DB? | 網絡 |
|---|---|---|---|
| `--discover --org <name>` | 列 channel 全部 playlist、自動標器樂訊號、算 `matched_in_db`、寫 `data/instrumental/<org>-playlists.json` + report | ❌ | yt-dlp flat |
| `--verify --org <name> [--limit N]` | 讀白名單 `approved:true` → fresh member → 閘 1/2/3 → 落 audio → 閘 4 → 寫 `<org>-verify.json` + report | ❌ | yt-dlp + whisper |
| `--apply --org <name> [--dry]` | 讀 verify.json 入面 `verdict:'instrumental'` 嗰批 → 閘 5 → **locked INSERT** | ✅ | ❌(零網絡) |
| `--report --org <name>` | 出 Eric 抽驗用嘅 markdown(YouTube 連結 + 判定理據) | ❌ | ❌ |

### 5.2 簽白名單紀律(P4:我哋簽)

- discover 出嘅 JSON 每項要填:`approved`(bool)、`instrumental_signal`(字串,寫低係邊個字眼令你判佢器樂)、`proposed_album`、`signed_by`、`signed_at`。
- **`instrumental_signal` 空 = 唔准 approve**(script 硬 skip + 報錯,照抄 `proposed_album` 現有紀律)。
- **有疑問一律唔簽**。簽名嘅唯一標準係「playlist 標題**自己**講明係器樂專輯」,唔准靠推測、唔准靠「睇落似」。
- 保留 `backfillAlbumFromPlaylists.js` 個 **stale-check**:apply 時 fresh member 數 > 簽名時 `member_count` → 成個 playlist skip,叫人重新 discover。
- 保留 **fetch-fail abort**:有任何 playlist 攞 member 失敗 → 乜都唔寫。

### 5.3 apply 嘅 INSERT(P5:即刻上架)

鎖內零網絡(所有 yt-dlp/whisper 喺 `--verify` 做晒),照 `backfillCore.js:55` 個 pattern:

```sql
INSERT INTO hymns_all
  (title, display_title, artist, category, youtube_id, lang,
   curated, status, last_checked, fail_streak, duration,
   org, kids, instrumental, album, album_source,
   lyrics_status, lyrics_source)
VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, 0, 1, ?, 'playlist',
        'unavailable', 'instrumental')
```

- `curated=1` + `status='ok'` = 即刻上架(P5)
- `instrumental=1`、`kids=0`
- `lyrics_status='unavailable'` + `lyrics_source='instrumental'` = §4.3 三重保險,歌詞班唔會撈返
- `display_title` 由 `cleanDisplayTitle(title, org)` 出(4a 個補丁要**先落地**)
- `album` 由簽名時嘅 `proposed_album` 落,`album_source='playlist'`
- `lang` 跟 org 嘅 `group.lang`
- ⚠️ 全程 `acquireDbLock` / `releaseDbLock` + `saveDb`,慢工序唔揸鎖(memory `feedback-hymnsdb-writes-need-lock`)
- ⚠️ **冪等**:INSERT 前再查一次 `youtube_id` 存唔存在(verify 同 apply 之間可能有第二條線收咗)
- ⚠️ **每次 apply 之前**先 `cp hymns.db hymns.db.bak-instrumental-p4-<date>`

### 5.4 唔准做嘅嘢(硬紅線)

- ❌ 唔准用任何**關鍵字搜尋**攞歌(`ytsearch`/`--match-title` 之類一律唔准)
- ❌ 唔准入 §5.1 六個中文 org 以外嘅 org(英文 org 係 Phase 6,§8 Q1 拍板唔收住)
- ❌ 唔准入 **>10 分鐘** 嘅歌(§8 Q2;長檔要等 Phase 5 D 線 P1 全套)
- ❌ 唔准 UPDATE / DELETE 任何**現有**行(4c 淨係 INSERT 新歌;要改現有歌係 Phase 1.5 嘅事)
- ❌ 唔准掂 `verified` / `draft` 嘅歌詞資料
- ❌ 唔准掂 Cloudflare / DNS / cert / token(memory `feedback-subagent-no-cloudflare-api`)
- ❌ scratch script 唔准放 `backend/` 根目錄(會令 `backend-restart.sh` 過唔到 dirty-check);正式 script 放 `backend/scripts/`,而且**要 commit 咗先 restart backend**

---

## §6 貨源盤點(T4)—— P3 兩條線都做

### 6.1 線 A:channel playlist discover

`backend/data/album-backfill/` 已經有四個 org 嘅 2026-08-04 snapshot。我掃咗器樂關鍵字:

| Org | 器樂 playlist | members | 已喺庫 | **淨新增** |
|---|---|---|---|---|
| 讚美之泉 | 5 條(安靜系列 Instrumental ×3、弦樂四重奏、Come Away With Me) | 36 | 31 | **~5** |
| 約書亞樂團 | ~0 | — | — | — |
| 新心音樂事工 | 0 | — | — | — |
| 基恩敬拜 | 0 | — | — | — |

→ **規劃書 §5.3 估「中文首波 150-400 首」睇落偏樂觀。** 但呢個 snapshot 有兩個限制:(a) 8/4 影,舊咗三星期;(b) 係為 album backfill 而做,當時**器樂 playlist 係故意唔簽**,所以覆蓋率未必齊。**T4 要重新 discover 一次先落結論。**

仲未 discover 過嘅:**小羊詩歌**、**天韻合唱團**(兩個都有 channel,`worshipGroups.js` 有齊)。

### 6.2 線 B:官網 catalog(P3 新開)

⚠️ **規劃書 §4.1 講「官網 catalog 補充:『安靜敬拜/靈修系列』就喺入面」—— 實查唔成立。**

`backend/data/album-backfill/sop-site-catalog.json` 有 805 條 track / **60 隻 distinct 專輯**,我逐個掃過,**零隻**專輯名帶器樂訊號(全部係人聲專輯:這是我們的敬拜 / 深愛耶穌 / 恩典之路 …)。`fetchSopSiteCatalog.js:23` 只 scrape `https://sop.org/music/` 呢個 index。

→ T4 要做嘅係:**read-only 睇返 sop.org 有冇獨立嘅器樂/演奏專輯區**(現有 scrape 覆蓋唔到),同樣做約書亞、新心嘅官網。呢一步**零 DB 寫入、零入庫**,純情報。有貨先開 `fetchSopInstrumentalCatalog.js`(照 `fetch*/backfill*` fetch-write 分離骨架)。

### 6.3 T4 停位

T4 做完出一份**貨源盤點 report**:每個 org 實際有幾多條器樂 playlist、幾多 member、幾多已喺庫、**淨新增預估**。**停低俾 Dispatch 睇,先決定做幾多個 org**(如果總淨新增得二三十首,做兩個 org 就夠,唔使六個都行)。

---

## §7 4a / 4d 細節

### 4a(T1)
`lib/displayTitle.js:503`:
```js
.replace(/^\s*\d{1,3}\s+(?!分鐘|分鍾)(?=[一-鿿぀-ヿ])/, '')
```
→ negative lookahead 加 `小時|小时`:`(?!分鐘|分鍾|小時|小时)`
- 「1 小時純音樂」(有空格)而家會被食咗個「1」變「小時純音樂」;「1小時」(黐埋)唔中呢條規則,本來就安全。
- 驗:`node scripts/regenerateDisplayTitles.js --dry-run --diff-csv=/tmp/....csv`,**diff 應該係空**(庫入面而家冇「N 小時」開頭嘅歌)—— 空 diff 就係啱,證明補丁唔會誤傷存量。

### 4d(T9)
- 4c apply 完再跑一次 `regenerateDisplayTitles.js --dry-run --diff-csv=…`,**人眼掃晒 diff** 先真跑。
- 上架驗收:live `GET /api/hymns` 見到新歌、`instrumental=1`、喺「純音樂」tab 出、首頁「純音樂」chip 見到、歌詞面板出 unavailable 文案。
- backend restart 行 `ops/deploy/backend-restart.sh`(要先 commit,dirty-check)。
- ⚠️ 唔好喺 Eric 真機 QA 進行緊嗰陣部署(memory `feedback-no-deploy-during-live-qa`)。
- 前端**唔使 OTA**(Phase 2 已推,新歌純資料)。

---

## §8 自驗 checklist

**T1–T3(零網絡段)**
- [ ] `displayTitle` 補丁後 `regenerateDisplayTitles --dry-run` diff 為空
- [ ] `isNonWorship` / `isInSongDurationBand` 改完,**9 + 6 個 caller 逐個確認冇改過**,行為零變化
- [ ] 新 blacklist pattern 跑全庫 6040 首 curated regression,新中招名單人眼掃過
- [ ] 三條 INSERT 路徑加 `instrumental` 後,跑一次現有 growLibrary `--dry` 確認冇 regression
- [ ] `whisperTranscribe.js` 加 `keepRawSegs` 後,**預設路徑輸出同改之前 byte-identical**(揀 3 首歌對數)
- [ ] Phase 1.5 重掃:A/B 指紋喺 `vocal` 類假陽性仍然 = 0;report 分開數 placeholder vs 幻覺型
- [ ] Phase 1.5 回標名單逐首對得返「歌名/專輯器樂訊號」係咩

**T4–T8(涉及網絡/入庫段)**
- [ ] discover 全程零關鍵字搜尋(grep script 確認冇 `ytsearch`)
- [ ] 每個 approved playlist 都有 `instrumental_signal` 同 `signed_by`
- [ ] verify report:每首列齊「auto-caption 有/冇、pass ZH 結果、pass EN 結果、coverage、判定」
- [ ] 被拒嘅歌**逐首有理由**,拒收率合理(拒收率 >50% = 白名單簽錯,要退返 T5)
- [ ] apply `--dry` 先跑,人眼核 INSERT 內容
- [ ] apply 前 `hymns.db` 有 backup
- [ ] apply 後:新歌數 = verify 通過數;`SELECT COUNT(*) FROM hymns_all WHERE instrumental=1` 對得上
- [ ] apply 後查:冇任何**現有**行俾改過(`git`-style 對數:apply 前後 `SELECT COUNT(*), SUM(curated), SUM(instrumental)`)
- [ ] 出 Eric 抽驗 report(YouTube 連結 + 判定理據,一眼可 click 去聽)

---

## §9 風險同對策

| # | 風險 | 對策 |
|---|---|---|
| 1 | **掹錯時代曲/世俗歌** | 結構性根治:零關鍵字搜尋 + 只行官方 channel 器樂 playlist + org 白名單。呢個風險喺閘 1 已經接近清零 |
| 2 | **器樂 playlist 混咗人聲 bonus track**(P5 之下最實在嘅風險) | 閘 3(auto-caption 硬拒)+ 閘 4(雙 pass whisper)+ 閘 5(playlist 一致性)。仍然唔係零 —— 「非華語人聲 + 冇 auto-caption + whisper 兩 pass 都交白卷」會漏網。**呢個係已知殘餘風險,靠 Eric 事後抽驗兜底**(P4) |
| 3 | whisper 對真器樂吐 A/B 幻覺 → 誤拒 | Phase 1.5 校準白名單(§1 理由三)。方向仍然係單向嚴格:誤拒 = 少收幾首,誤收 = 污染 tab |
| 4 | 新 blacklist pattern 誤殺主庫 | `opts.line` 設計令新 pattern **只喺器樂線生效**;仍然照跑全庫 regression |
| 5 | 產出遠低過預期(可能得二三十首) | T4 停位先出實數再決定投入(§6.3)。**唔准為咗湊數放寬閘** |
| 6 | DB 併發覆寫 | 全程 locked script、鎖內零網絡、fresh `openDb`;apply 前 backup |
| 7 | 新 script 未 commit 令 backend restart 過唔到 gate | T9 之前確認 `git status --porcelain -- backend/` 乾淨(除運行時豁免目錄) |
| 8 | 多 session 共用 worktree 撞 commit | 用 `git commit -- <pathspec>`,唔准 `git add -A`(memory `feedback-concurrent-git-add-collision`) |

---

## §10 冇打算做 / 明確排除

- ❌ 英文 org(Bethel / Elevation / Hillsong instrumental)—— §8 Q1 拍板唔收住,係 Phase 6
- ❌ >10 分鐘長檔 —— §8 Q2,係 Phase 5(要 D 線 P1 全套先)
- ❌ 伴奏 / karaoke / backing track —— §8 Q3 拍板唔收
- ❌ CantonHymn 等 aggregator —— 冇官方 catalog,7% album 命中率前科
- ❌ `soft` 入面 28 首 `lyrics_status='draft'` —— 唔喺複核線隊列中間抽歌
- ❌ `observe` 807 首 verified —— report 明文「唔准動」

---

*規劃:Opus 5,2026-08-24。所有 file:line、指紋精度數字、auto-caption 實測、貨源實數係當日實查/實跑。*
