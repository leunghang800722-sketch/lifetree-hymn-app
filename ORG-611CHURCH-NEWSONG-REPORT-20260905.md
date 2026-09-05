# Church 611 + 新歌敬拜 NewSong Worship 加入追蹤名單 + 首次入庫（2026-09-05）

Eric 拍板:兩個新頻道加入 `backend/data/worshipGroups.js` 長期追蹤名單，並即刻做一次針對性 scan 入庫。

## 0. 兩個目標頻道確認

| Eric 提供 | yt-dlp 實測 handle | 頻道自我介紹 | 目標片是否喺呢個頻道 |
|---|---|---|---|
| Church 611（611靈糧堂）channel_id `UC9J6hGYkSx-iwrkB7buW5jQ` | `@Church611tv` | 「611 Bread of Life Christian Church」 | ✅ `weq_Ubvc8wI`《我心所倚靠》RAWship vol.1，434s，2023-11-25 上載，uploader_id=@Church611tv |
| 新歌敬拜 NewSong Worship channel_id `UCdWojs2vazAcIaYUzquRJnA` | `@新歌敬拜NewsongWorship` | 新歌敬拜 NewSong Worship | ✅ `KWuqjQpyG8Q` 我心所依靠，295s，uploader_id=@新歌敬拜NewsongWorship |

⚠️ **命名衝突警告**：`worshipGroups.js` 原本已有一條 `611靈糧堂` entry（`channel: null`，2026-07-24 搵到但 2026-07-27 audit 確認係「台北611靈糧堂」，帶內5%/blocklist95%，REJECT 級，已拆走 channel）。呢個 Church 611（@Church611tv）**唔係同一個頻道**——數字完全唔同（見下面§1），頻道 About page 自我介紹亦係「611 Bread of Life Christian Church」而唔係「台北611靈糧堂」。三個 entry（611靈糧堂[REJECT]／611 Worship／Church 611）**分開三條**，冇合併，已喺 code comment 明確交代避免將來搞亂。

## 1. 頻道體檢（auditChannel 方法，depth=60，隨機抽 10 條眼證）

### Church 611（@Church611tv）

| 指標 | 數值 | 判定 |
|---|---|---|
| 帶內（75-600s）% | 26.7% | REJECT（<30%） |
| blocklist 命中% | 23.3% | — |
| 標題正面訊號% | 5% | — |

主頻道日常大量上載：主日講道（`Sunday Sermon`/`ANEW Sermon`）、611 Testimony 見證系列、EP 紀錄片系列「611, My Beloved」。純 REJECT 級不適合全收。

**但**頻道入面有獨立的「RAWship」現場敬拜歌系列（片長 14-35 分鐘一條片，連做多首歌，格式同已追蹤嘅「611 Worship」一樣）。深度 300 條掃描找到 37 條 RAWship/Live Worship 系列：
- 帶內（1900s cap）：36/37 = 97%
- blocklist 命中：0/37 = 0%
- 標題正面訊號：36/37 = 97%

**揀嘅門檻同理由**：`durationCapSec: 1900` + `contentGate: 'duration+title'` 兩層一齊開。全庫 300 條深度模擬呢兩層合共淨過 **39/300** 條，其中 37 條=RAWship/Live Worship 系列，另外 2-3 條為疑似大型敬拜活動錄影（`COUNTDOWN 2025 WORSHIP NIGHT`、`雅歌 Song of Songs` 等），未逐條人耳核實，容忍度內。

⚠️ 呢個做法係**中文團體慣例（唔開 contentGate，因為誤殺率高）嘅例外**——呢個頻道嘅敬拜歌系列標題慣例帶「Live Worship / RAWship」英文字眼，經模擬驗證誤殺率低先開。代價：結構上會漏收頻道入面純中文標題（冇英文字眼）嘅敬拜歌，換嚟嘅係主頻道大量講道/見證零漏網。若 Eric 想追求 recall 而非 precision，可以考慮日後放寬。

**lang 判斷**：粵語。理據——頻道字幕用 `zh-HK`（非 `zh-CN`）、繁體中文；「611 Testimony」見證系列標題普遍標明講者用「Cantonese/Mandarin」「Cantonese/English」雙語（以粵語為主）。⚠️ 呢個係推斷，未聽真人 audio 驗證發音，Eric 如覺得判錯請話我知改。

### 新歌敬拜 NewSong Worship（@新歌敬拜NewsongWorship）

| 指標 | 數值 | 判定 |
|---|---|---|
| 帶內（75-600s）% | 77.6% | OK（≥60%） |
| blocklist 命中% | 6.9% | — |
| 標題正面訊號% | 94.8% | — |

depth=58 已接近成個頻道全部片（頻道規模細，總共約 58-60 條）。內容幾乎全部係經文詩歌 MV（簡體字，標準國語詩歌格式，附經文出處），少量「一小時祷告默想」合輯／「官方伴奏卡拉OK」版本已由現有 blocklist（合輯/精选/伴奏/卡拉OK）擋走。OK 級，**唔使開 contentGate**，Layer1 片長 + 現有 blocklist 已經夠準。

**lang 判斷**：國語（簡體字，標準普通話詩歌用詞，冇疑慮）。

## 2. worshipGroups.js 新增 entry（已 commit）

commit `a1ccd17`（分支 `feature/player-rebuild`），**只 stage 咗自己嗰段 28 行新增**（另一個 session 未 commit 嘅 61 行改動完整保留喺 working tree，用 `git apply --cached` 加逐個 hunk 隔離 + `git diff --cached --stat` 核對 + 冇帶 pathspec 嘅 `git commit` 完成，過程見下面§5）。

```js
{ name: 'Church 611', aliases: ['Church 611', 'Church611tv', '611 Bread of Life Christian Church'],
  lang: '粵語', priority: 1, inPool: false, channel: '@Church611tv', est: 45,
  durationCapSec: 1900, contentGate: 'duration+title',
  note: '2026-09-05 Eric拍板新增,淨收RAWship現場敬拜歌系列...' }

{ name: '新歌敬拜 NewSong Worship', aliases: ['新歌敬拜', 'NewSong Worship', 'Newsong Worship'],
  lang: '國語', priority: 2, inPool: false, channel: '@新歌敬拜NewsongWorship', est: 45,
  note: '2026-09-05 Eric拍板新增,audit OK級...' }
```

## 3. 入庫結果

用 `scanChannelListing` + `channelLanguageSanityCheck` + `validateChannelCandidates`（`backend/lib/channelScan.js`，同 growLibrary.js discover 完全同一份 pipeline）寫嘅一次性 scratchpad script，DB 寫入全程經 `acquireDbLock('ingest-611-newsong')` → `openDb`/`saveDb`。兩個 org **順序**做（concurrency=1），組間再 sleep 3-5 秒。

| Org | 頻道 listing | fresh(未收錄) | 試咗(tried) | **收錄(added)** | 死鏈 |
|---|---|---|---|---|---|
| Church 611 | 400(depth 400) | 400 | 53 | **53** | 0 |
| 新歌敬拜 NewSong Worship | 58(depth 58,幾乎全頻道) | 58 | 43 | **43** | 0 |

outcomes breakdown(正控——證明過濾邏輯有實際攔到嘢,唔係得個講字):

- Church 611:`skip-title-signal` 191(絕大部份係 611 Testimony 見證/EP 紀錄片,標題冇撞到 worship/live 等正面詞)、`skip-duration` 120(主日講道/ANEW Sermon 動輒 3000-8000s,遠超 1900s cap)、`skip-quality` 36(isCompilation/isNonWorship blocklist,例如「主崇劇」「入會禮」「Kingdom Artists Stage Play」)、`candidate` 53。
- 新歌敬拜 NewSong Worship:`skip-duration` 13(「一小时XX默想/精选」類 46-63 分鐘合輯)、`skip-quality` 2(伴奏/卡拉OK 版本)、`candidate` 43。

⚠️ **Eric 點名嘅 `weq_Ubvc8wI`《我心所倚靠》RAWship vol.1 喺主 scan 入面漏咗**——2023-11-25 上載,Church 611 係高頻主日講道頻道(depth 400 都掃唔到咁舊嘅片,scanChannelListing 嘅深度 fallback 喺 fresh 非空時唔會再加深)。已用 `backfillGroupFromList()`(同 growLibrary discover / backfillFromList.js 人手工具共用嘅同一段 code)明確補一條(quality gate 全過:isCompilation=false/isNonWorship=false/inBand(1900)=true/positiveSignal=true),已入庫。

**總計新增 97 首**(Church 611 54 首含補收嗰條 + NewSong Worship 43 首)。

## 4. 核實(全過)

- [x] `sqlite3 hymns.db`:`Church 611`=54 首、`新歌敬拜 NewSong Worship`=43 首
- [x] `weq_Ubvc8wI` → curated=1 / status=ok / lang=粵語 / org=Church 611 / duration=7:14
      `KWuqjQpyG8Q` → curated=1 / status=ok / lang=國語 / org=新歌敬拜 NewSong Worship / duration=4:56
- [x] `/api/version` dataVersion:入庫前 `1788575145024.8743-61054976` → 入庫後 `1788597976021.0852-61054976`(冇 restart,`maybeReload` 自動生效)
- [x] `/api/hymns?lite=1`(6505 首):兩個 youtube_id 都搵到,`org` 篩計數 Church 611=54、新歌敬拜=43,同 DB 一致
- [x] 抽 5 首(`UzzxgxEGauU`/`DI5zjDXd72I`/`CIJgf6qE_Zs`/`iRq37a6XKt8`/`GeZdSwZK9t8`)`yt-dlp --get-url -f bestaudio`,全部 5 條攞到有效 googlevideo URL(冇落載)

## 5. Git 隔離操作證據

```
git diff --stat -- backend/data/worshipGroups.js   # 起手:61 insertions/18 deletions(另一session)
git diff --cached --stat                            # 空(冇任何嘢已staged)
# 編輯後三個hunk,前兩個係另一session原有,第三個係我新增(entirely +28行)
git apply --cached --check my.diff                  # 0
git apply --cached my.diff
git diff --cached --stat                             # 只得 worshipGroups.js,+28
git commit -m "..."                                  # 冇帶pathspec
git diff HEAD -- backend/data/worshipGroups.js       # 剩返2個hunk,同commit前完全一樣
```

## 6. 自動擴庫確認

兩個新 entry `priority` 分別為 1（Church 611）／2（新歌敬拜），`ACTIVE_GROUPS = GROUPS.filter(g => g.priority <= 4)` 已包含。growLibrary.js 下一輪 discover tick（每 15 分鐘）會自動將呢兩個團體納入 Tier2（首次冇 reconcile-missing 記錄）候選池，同其他未吸納團體一齊輪流攞 budget。

## 7. 要 Eric 判嘅嘢

1. **Church 611 主頻道歌片比例低（26.7%）**——而家用「durationCapSec:1900 + contentGate:duration+title」雙層鎖定 RAWship 系列。呢個做法結構上會漏收純中文標題（冇 Live Worship/RAWship 英文字眼）嘅敬拜歌。如果 Eric 想要更高 recall（要求人手/未來語義層逐條覆核），可以考慮加 `tier1Exclude: true`（同 Asia for JESUS/台北復興堂做法一樣）令 discover 唔自動食呢個頻道，淨係留俾人手 backfill。**目前已用自動 gate，並未加 tier1Exclude**——如果 Eric 想更保守，話我知。
2. Church 611 嘅 lang 判「粵語」係推斷（未聽真人 audio），如果實際係國語為主，麻煩話我知改 entry。
3. 命名衝突：舊有「611靈糧堂」（REJECT）entry 保留唔郁,新entry 用「Church 611」呢個名避免混淆——如果 Eric 有更好嘅正式中文名想用,可以再改。
