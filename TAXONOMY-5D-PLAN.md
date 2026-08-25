# 五維分類規劃 —— 團體/歌手/語言/文字/專輯(TAXONOMY-5D-PLAN)

> 2026-08-01 Fable 5 出稿;同日 Eric 拍板(見 §7),v2 按拍板結果改寫:
> 兒童類別由「原地補語言標籤」改做「**全部 delete、重新攞一次、攞嗰陣即場分類**」,
> 並且**而家就做,唔等 OTA 鋪開**(Eric 已知舊 app 兒童 tab 空窗風險,拍板照做;
> 本方案用 staging+原子對換將空窗壓到接近零,見 §3.4)。
>
> 流程:Sonnet 按 §8 執行清單分 commit 落地 → Opus 5 逐 commit 驗收。

---

## §1 現況診斷(2026-08-01 實測)

### 1.1 Schema 現況(`hymns_all`,4073 首,curated 2883 首)

| Eric 要嘅維度 | 現有欄位 | 實況 |
|---|---|---|
| 團體(廠牌/頻道/事工) | `artist` | **掛羊頭賣狗肉**:growLibrary 插入時寫 `group.name`(worshipGroups 團體名),所以 artist 欄而家裝嘅其實係「團體」,唔係歌手 |
| 歌手(實際演唱者) | **冇** | 完全冇呢個概念 |
| 語言(粵/國) | `lang` | 有,但**混入咗「兒童」**(619 首 lang='兒童'——兒童係分類唔係語言,呢批歌嘅真實語言冇記低) |
| 文字(中/英) | **冇** | 冇獨立欄;由 lang 推導(拍板 ✓) |
| 專輯 | `album` | 欄位存在,但得 69/4073 首有值 |

另外:`category` 係歷史遺留(詩歌/粵語/國語/兒童 四種值混雜),UI 實際用 `lang`;
`tags` 欄 4073 首全空,從未用過。

### 1.2 受影響嘅現存邏輯

**Backend:**
- `routes/search.js` — LIKE 搜 title/display_title/artist/lyrics/album(legacy,前端已改本地搜尋)
- `routes/category.js` `/artist`、`routes/home.js` `/featured-artist` — GROUP BY artist
- `scripts/growLibrary.js` — artist 多樣性配額(ARTIST_CAP)、失敗冷板凳都係按 artist 計;
  **dedup 喺 :391:`SELECT youtube_id FROM hymns_all`——任何 row(包括 rejected)都會攔住
  同一條片再入庫**,呢點係兒童重攞方案嘅命脈(§3.4)
- `lib/adminHymns.js` — `EDITABLE_FIELDS` 有 artist/category/lang/album
- `server.js` `/hymns` — 明文 SELECT 欄位清單(加新欄要記得改呢度)
- `hymns` view 係 `SELECT *`,新欄自動流入,唔使改

**Frontend:**
- `LibraryScreen.js` — 語言 chips(`h.lang === lang`)+ 歌手 chips(按 artist 分組計數)+
  `_searchBlob`(title/display_title/title_en/artist/album/lyrics)
- 行副標題 `{item.artist} · {item.lang}`(LibraryScreen/HymnListScreen 等多處)
- `AdminEditHymnSheet.js` — 編輯欄位對應 EDITABLE_FIELDS

**用戶數據引用(delete 會斷):**
- `users.db` `favorites(user_id, hymn_id)` — 實查有 **5 個心心**指住兒童歌(user 2)
- `users.db` `playlists.songs_json` — user 2 有個「兒童詩歌」清單 8 首,entries 係
  `{id, title, artist, youtube_id, lang}`(**有 youtube_id,可以憑佢 remap**)
- `hymns.db` `playlist_hymns` — 實查 0 rows,唔使理

### 1.3 撞源實例(呢單嘢嘅起因)

> ⚠️ 2026-08-01 更正(C1 落地時):原稿列嘅三組「撞源」有兩組係 ytsearch
> 關鍵字結果嘅誤判。執行 session(local_fa531849)逐條片查 uploader 證據後:
> - **確認撞源**:泥土音樂/盛曉玫(10/10 條 uploader=泥土音樂Clay Music)、
>   **天韻合唱團/Heavenly Melody**(3/3,原稿冇列,新發現)
> - **推翻**:讚美之泉粵語(0/3——其實嚟自 MariaKYLee家怡/粵語詩歌站等獨立
>   細型翻唱頻道)、生命河粵語(0/3——基督教詩歌精選等獨立頻道,唔係 ROLCC)
>   ——呢兩個係「冇單一官方頻道嘅翻唱合集 artist」,**維持獨立 org,唔合併**
> 詳見 docs/SUPERVISION-LOG.md「org/performer維度落地」條目。

- **泥土音樂**(45 首,curated 25)同**盛曉玫**(44 首,curated 36)——同一頻道
  「泥土音樂Clay Music」,原本喺 worshipGroups.js 係兩條 entry、DB 係兩個 artist 值
- 教訓:單一 artist 欄逼住啲人用「另開 artist tag」嚟表達語言/子系列,
  org/performer/lang 三個維度分開後唔再需要;但**邊啲 tag 真係同一頻道要逐條片
  驗證,唔可以靠搜尋結果估**(今次兩組誤判就係咁嚟)。

### 1.4 資料來源實測(關鍵假設驗證)

用 yt-dlp 抽驗泥土音樂《腳步》(Iz9Gr1ATrDo):

- 結構化欄位 `artist`/`album`/`track` 全部 **None**(官方頻道自傳片唔係
  YouTube Music Topic 曲目,冇呢啲欄)
- **但 title 有**:「腳步 Footsteps **盛曉玫 Amy Sand** 泥土音樂**專輯 3:脚步**」
- **description 有**:「Album (專輯): 脚步」「詞曲:盛曉玫」

結論:專輯/歌手資料**攞得到,但要 parse title + description**,唔同團體格式唔同,
所以要 regex 分層 + AI 兜底(見 §3.2)。

---

## §2 目標 Schema(方案)

### 2.1 原則:只加唔改(additive-only)

`artist` 欄**原封不動**。理由:
1. 舊 APK / 離線 cache 讀 `artist`,一改就斷
2. growLibrary/backfill/admin 一堆邏輯掛住佢,一次過改晒風險大
3. rollback 變成「唔用新欄」咁簡單

```sql
ALTER TABLE hymns_all ADD COLUMN org TEXT DEFAULT '';              -- 團體/廠牌/頻道
ALTER TABLE hymns_all ADD COLUMN performer TEXT DEFAULT '';        -- 實際演唱者
ALTER TABLE hymns_all ADD COLUMN performer_source TEXT DEFAULT ''; -- 來源審計
ALTER TABLE hymns_all ADD COLUMN kids INTEGER DEFAULT 0;           -- 兒童分類(唔再係語言)
```

### 2.2 五維定義(Eric 拍板後定案)

| 維度 | 欄位 | 規則 |
|---|---|---|
| **團體** | `org` | UI 顯示名就叫「團體」(拍板 ✓)。canonical 名跟 `worshipGroups.js` 嘅 `GROUPS.name`。一個 YouTube 頻道對應一個 org |
| **歌手** | `performer` | 實際演唱者。多人用「、」分隔;純音樂/無人聲寫特別值 **「純音樂」**;搵唔到留空 `''`,UI fallback 顯示 org |
| **語言** | `lang` | 淨返三個值:粵語/國語/英文。兒童歌都要有真語言(§3.4) |
| **文字** | (推導,唔加欄) | 粵語/國語→中文,英文→英文(拍板 ✓)。UI/API 層一個 function;第日出現例外(例:台語)先升級做欄位 |
| **專輯** | `album` | 沿用現有欄,由 backfill 補值(§3.3) |

`performer_source` 值:`description` / `title` / `ai` / `manual`——邊層推斷返嚟就標邊層,
方便抽查 AI 嗰批準確率;admin 人手改過(manual)嘅永不被 backfill 重寫。

### 2.3 唔郁嘅嘢

- `category` 欄:原封不動(歷史遺留,冇 UI 用佢做 truth),唔好順手清
- `tags` 欄:留空,唔用
- `hymns` view:`SELECT *` 自動兼容,唔使改
- 團契遊樂園 34 首(lang='粵語',實質係兒童向內容但一直喺粵語 tab)——今次唔郁,
  留返做 followup 同 Eric 斷佢應唔應該 kids=1

---

## §3 Migration + Backfill

### 3.1 org 一次過填(零風險)【已落地 — 實況同原稿有出入,以下係修正後記錄】

而家 `artist` 裝嘅**就係**團體名,所以:

```sql
UPDATE hymns_all SET org = artist WHERE org = '';
```

之後撞源 tag 收埋(改 org,artist 照舊唔郁)——**實際落地係已驗證嘅兩對**
(§1.3 更正:原稿另外兩組係誤判,唔合併):

```sql
UPDATE hymns_all SET org = '泥土音樂'   WHERE artist IN ('盛曉玫','泥土音樂');
UPDATE hymns_all SET org = '天韻合唱團' WHERE artist IN ('Heavenly Melody','天韻合唱團');
```

讚美之泉粵語/生命河粵語維持獨立 org(佢哋根本唔係官方頻道嘅歌,係翻唱合集
tag),worshipGroups.js 兩條 entry 嘅「疑似撞源」note 已更正、維持 channel:null。

`worshipGroups.js` 實際做法(比原稿「合併 entry」更好,保留返 discover 語義):
泥土音樂/天韻合唱團兩條 entry 補返已驗證 channel + 加 `org` 欄;盛曉玫/
Heavenly Melody 條 entry 加 `org` 指向團體、`channel:null`(唔負責 discover,
新歌一律由團體條 entry 收)。INSERT 寫 `group.org ?? group.name`。

### 3.2 performer 分層推斷(waterfall)

新 script `backend/scripts/backfillMeta.js`,跟 fetchLyrics 嘅夜晚 budget 模式,
每首歌行一次 `yt-dlp -J` 攞 title+description:

1. **Layer D(description)**:regex 搵「主唱/演唱/獻唱/Vocal(s)/Singer/Sung by」行
   → `performer_source='description'`
2. **Layer T(title)**:title 對照已知歌手 seed 名單(人手起,例:盛曉玫/Amy Sand)
   → `performer_source='title'`
3. **Layer A(AI)**:D/T 落空嘅批量俾 Claude 推斷(幾十首一個 request)。有把握先填,
   標 `performer_source='ai'`;判斷係純音樂就寫「純音樂」
4. **搵唔到**:留空,UI fallback 顯示 org,唔好估

**Pilot 先行**:第一批淨做泥土音樂 89 首(45+44),Eric/Opus 5 人眼抽查
(預期大部分 title 有「盛曉玫」直接命中 Layer T;客席/純音樂靠 D/A 層),
確認準確先開全庫(~4000 首,每晚 160 首節奏 ~25 晚,唔趕,UI 有 fallback)。

### 3.3 album 順手補

backfillMeta.js 同一次 yt-dlp call 順手 parse description 嘅「Album (專輯): XXX」/
「專輯:XXX」行、title 嘅「專輯 N:XXX」pattern。冇就留空——**唔准 AI 估專輯名**
(專輯係事實資料,估錯好核突)。現有 69 首已填嘅唔重寫。

### 3.4 兒童:全部 delete + 重新攞 + 攞嗰陣即場分類(Eric 拍板版)

> Eric 拍板推翻咗 v1「原地加語言標籤」:兒童現存內容全部唔要,由源頭重攞一次,
> 收錄嗰刻就判斷並記低真語言,唔准再塞「兒童」落 lang。**而家就做,唔等。**

#### 3.4.1 現存 619 首 lang='兒童' 嘅真實構成(實查)

| 類別 | 數量 | 處置 |
|---|---|---|
| curated=1 status=ok(app 兒童 tab 見到嘅) | **470** | delete + 重攞 |
| curated=0 status=ok(pool 剩渣,Hillsong 1 首) | 1 | 一齊 delete |
| curated=0 **status=rejected**(歷次人手清走嘅非歌垃圾:Kids on the Move 83 / 讚美之泉兒童 45 / Hillsong Kids 20) | **148** | **絕對唔delete——係墓碑/blocklist**。dedup 靠「youtube_id 已存在就唔入」(growLibrary.js:391),剷咗墓碑=垃圾翻生,2026-07-27/30 兩輪人手清理白做 |

#### 3.4.2 470 首嘅源頭覆蓋(重攞可行性實查)

10 個有 curated 歌嘅兒童團體,worshipGroups.js **已有 `kidsLang` 逐團體真語言**:

| 團體 | 首數 | 源 | kidsLang |
|---|---|---|---|
| 讚美之泉兒童 | 135 | @StreamofPraiseKids ✓ | 國語 |
| Hillsong Kids | 82 | @hillsongkids ✓ | 英文 |
| ACM兒童詩歌 | 69 | 官方 playlist ✓ | 粵語 |
| Giggles and Tunes | 56 | 官方 playlist ✓ | 粵語 |
| 基恩敬拜祈禱仔 | 38 | 官方 playlist ✓ | 粵語 |
| Yancy | 29 | @yancynotnancy ✓ | 英文 |
| Listener Kids | 28 | @listenerkids ✓ | 英文 |
| CJ and Friends | 28 | @cjandfriends ✓ | 英文 |
| Kids on the Move | 4 | **channel 已拆**(節目台) | 英文 |
| Saddleback Kids | 1 | **channel 已拆**(REJECT 級) | 英文 |

即係 465/470 可以由頻道/playlist 重攞;**KotM+Saddleback 嗰 5 首**係當日人手逐條
驗過先留低嘅真歌,channel 係刻意拆走唔准再挖——呢 5 首用「**逐條 youtube_id
allowlist 重驗**」方式重攞(照行 yt-dlp 驗證+重新插入,只係唔經頻道掃描),
唔會走漏,亦唔會重開垃圾閘。

#### 3.4.3 流程:staging 重攞 → 對數 → 原子對換(將空窗壓到秒級)

Eric 已接受「舊 app 兒童 tab 空窗」風險,但方案設計上唔使真係捱呢個窗:
**重攞唔係「delete 咗先慢慢攞」,而係「攞晒入 staging、對完數、一個 transaction
換血」**。App(新舊版都係)喺換血嗰一刻之前一直見到舊兒童庫,之後即刻見到新庫。

- **K-A 快照**:dump 現有 619 首(id/youtube_id/title/artist/curated/status)去
  `backend/data/kids-refetch/old-snapshot.json` + `.sql`(rollback 用)
- **K-B staging 重攞**:新 script `backend/scripts/refetchKids.js`:
  - 建 staging 表 `kids_refetch`(schema 同 hymns_all 主欄位一致)
  - 逐團體行返 growLibrary 嘅整套關卡:listChannelVideos → isCompilation/
    isNonWorship → 片長帶 → 英文團體加 contentGate(duration+title)→
    verifyPlayable(resolveAudioUrl)→ 先寫入 staging
    (需要將 growLibrary.js 呢幾個 function 抽做 `lib/` 共用 module,唔好 copy-paste)
  - **收錄嗰刻定 lang**:單語言團體直接用 `group.kidsLang`;每條片加一層 sanity
    check(英文團體撞到全 CJK title / 粵語團體撞到全英文 title → 標 `flag` 俾
    AI/人手斷,唔好死跟)。`kids=1`、`org=group.name`、`artist=group.name`(餵舊欄)
  - dedup 對照**成個 hymns_all**(148 個墓碑會自動攔住垃圾)+ staging 自身
  - KotM/Saddleback 5 首行 allowlist 分支:逐條 id 直接 yt-dlp 驗證 + 入 staging
  - 即刻開波(Eric:而家就做):staging 唔掂 prod 數據,日頭都跑得,用返
    jitter delay;**跑之前暫停 growLibrary 夜晚排程**(兩邊夾住打 YouTube 會
    加大 403/block 風險——NordVPN 出口 IP 嗰單嘢記憶猶新),fetchLyrics 照舊。
    470 條每條要 resolve 驗證,預 1-2 日分幾轆跑完
- **K-C 對數報告**(delete 之前出,直接答「重疊/走漏幾多」):
  `old-snapshot` vs `kids_refetch` 按 youtube_id 對:
  - ✅ 重攞返(預期絕大多數)
  - ➕ 新收(頻道有新片/上次漏)
  - ⚠️ **走漏清單**(舊有新冇:死鏈/被關卡篩走/片被刪),逐條列 title+原因,
    **俾 Eric 過目簽名先准入 K-D**——佢話唔要嘅咪由佢流失,話要嘅加入 allowlist 重驗
- **K-D 原子對換**(一個 transaction,秒級):
  1. `DELETE FROM hymns_all WHERE lang='兒童' AND status != 'rejected'`(471 首;
     墓碑留低)
  2. staging 471±α 首 INSERT 入 hymns_all(真 lang + kids=1 + org)
  3. **remap 用戶引用**:憑 youtube_id 對照舊 id→新 id,更新 users.db 嘅
     favorites(5 個心心)同 playlists.songs_json(兒童詩歌清單 8 首,entries
     本身有 youtube_id);mapping 寫落 `kids-refetch/id-remap.json` 留底
  4. 換血後跑 §6.3 驗證 SQL
- **K-E 舊 app 緩解**(Eric 接受風險,但呢兩樣嘢平到冇理由唔做):
  1. **server 兼容墊**:`/hymns` 出 JSON 時 `lang = (kids ? '兒童' : lang)`,
     另加新欄 `real_lang` 出真語言——舊 client(filter `h.lang==='兒童'`)
     **完全唔會斷,零空窗**;新 client 兒童 tab 讀 `kids===1`,語言顯示用
     `real_lang ?? lang`。墊喺 OTA adoption 接近 100% 之後先拆(另開 followup)
  2. client 改動(兒童 tab 讀 kids、副標題用 real_lang)夾入 §4 嘅 OTA 一齊推,
     K-B 跑緊嗰一兩日 OTA 已經鋪緊,唔阻換血時機

#### 3.4.4 兒童 tab 空窗結論

有咗 K-E 兼容墊 + K-D 原子對換:新舊 client 都冇空窗,「而家就做」同「唔整死
舊 app」兩樣都攞到。唯一真空窗係 K-D 嗰一個 transaction(<1 秒)。

### 3.5 新歌入庫配合(⚠️ 有三個 INSERT 位,唔係淨係 growLibrary)

新歌寫入 hymns_all 嘅路徑實查有三條,**C1 三條都要改**:

1. `scripts/growLibrary.js` :497(discover mode)
2. `lib/backfillCore.js` :52(Tier 1 自動 backfill / backfillFromList 人手工具共用)
3. `lib/adminHymns.js` :136(admin paste-link 加歌嘅 fresh-INSERT)

三條路徑統一規則:
- INSERT 即時填 `org`(= group.name;admin 路徑 = admin 填嘅團體)、
  `kids`(= priority 4 團體先係 1)
- `artist` 照寫 group.name(舊欄繼續餵,保相容)
- 兒童團體收新歌:lang 寫 `group.kidsLang`(唔准再寫「兒童」落 lang);
  合併咗嘅雙語團體(讚美之泉/生命河)lang 逐首判斷
- `performer`/`album` **收錄嗰刻唔填**,留空等 backfillMeta 夜晚自動補。
  理由:收錄關卡嘅 yt-dlp call 係 `--get-url`(resolveAudio.js:127),手上根本
  冇 description;要即時填就每首多一次 `yt-dlp -J`,discover/backfill 額度直接
  加倍,唔值(NordVPN 403 前科)。backfillMeta 排程模式本身係「掃
  `performer_source=''` 嘅歌」,新歌自動排入下一晚——即係新歌嘅歌手/專輯
  **最多遲一日**自動補齊,期間 UI fallback 顯示團體,唔會爛

---

## §4 UI 方案(詩歌庫)

### 4.1 鐵律/Design system 核對

- `HYMN-APP-IRON-RULES.md` 五條全部係播放器動畫/DOM 順序/build 規矩——本改動
  完全唔掂播放器,無衝突
- 跟現有 designSystem:`COLORS`/`TYPOGRAPHY`,列表歌名 18pt(§5.3),
  fallback 用向量圖標唔用 emoji(§5.4)

### 4.2 Phase 4a(隨 K-E 同一個 OTA 推)

- 語言 chips 照舊五粒(全部/粵語/國語/英文/兒童):「兒童」chip 改讀
  `h.kids === 1 || h.lang === '兒童'`(兼容新舊數據);粵/國/英 tab 照 filter
  `h.lang`(server 兼容墊令 kids 歌嘅 `lang` 對外仍係「兒童」,即係兒童歌唔會
  湧入語言 tab,維持現有 UX;真語言用 `real_lang` 做顯示/搜尋)
- **兒童 tab 內再分語言(2026-08-01 Eric 補充拍板)**:揀咗「兒童」chip 時,
  下面插一行語言 sub-chips(全部/粵語/國語/英文),filter 用 `real_lang`,
  同團體 chips AND 夾用(例:兒童 → 粵語 → ACM兒童詩歌)。sub-chips **按實際
  數據動態生成**(邊種語言有歌先出邊粒,連計數)——咁樣 C4 換血前(舊數據
  real_lang 仲係「兒童」)sub-chips 自動唔會出,換血後三粒自動現身,唔使再
  推多次 OTA 就位;樣式照抄語言 chips 現有款,唔另起爐灶
- 第二行 chips 由「歌手」改做**「團體」**(拍板 ✓;data source `artist` → `org`,
  計數邏輯照舊)。用戶見到嘅變化=盛曉玫/泥土音樂兩粒 chip 合併做一粒
- 行副標題:有 performer 顯示 `performer · org`(例:「盛曉玫 · 泥土音樂」),
  冇就照舊 `org · (real_lang ?? lang)`
- `_searchBlob` 加 `norm(h.performer)`——chip 合併後搜「盛曉玫」唔可以倒退

### 4.3 Phase 4b:歌手/專輯進階篩選 sheet(拍板 ✓ 要做)

- chips 行尾加一粒「篩選」icon 掣 → bottom sheet:**歌手**/**專輯**兩組
  (團體揀咗邊個就淨 show 嗰個團體嘅歌手/專輯;冇值嘅維度自動隱藏個組)
- 排喺 backfillMeta 全庫跑起碼過半之後先出——覆蓋率太低個 sheet 會顯得成個庫
  「乜都冇」;出稿前另出一頁 UI spec 俾 Eric 過目
- backdrop 記住教訓:RN 唔可以用 absoluteFillObject 做 backdrop(QUEUE-UX-4FIXES 踩過)

### 4.4 Backend API

- `server.js` `/hymns` SELECT 加 `org, performer, album(已有), kids`,
  serialize 加 `real_lang` 兼容墊(§3.4 K-E)
- `routes/category.js` `/artist`、`home.js` `/featured-artist` 改 GROUP BY org
- `EDITABLE_FIELDS` + AdminEditHymnSheet 加 org/performer/album;admin 改
  performer 時寫 `performer_source='manual'`

---

## §5 Phase 總覽

| Phase | 內容 | 風險 | 卡邊度 |
|---|---|---|---|
| **P1** | schema + org backfill + worshipGroups 合併 + growLibrary INSERT + API 加欄+兼容墊 + admin 欄 | 低 | 即做 |
| **P2** | client OTA:兒童 tab 讀 kids、團體 chips、副標題、searchBlob | 低 | P1 後即推 |
| **P3** | 兒童 staging 重攞(K-A~K-C)→ Eric 簽走漏清單 → 原子對換+remap(K-D) | 中 | K-C 報告要 Eric 過目 |
| **P4** | backfillMeta.js:泥土音樂 89 首 pilot → 人眼抽查 → 全庫夜晚跑 | 中 | pilot 抽查 |
| **P5** | 篩選 bottom sheet(歌手/專輯) | 中 | P4 覆蓋率過半 |

P1→P2 連住做;P3 staging 即刻開波(Eric:而家就做),同 P1/P2 並行冇衝突
(staging 唔掂 prod);K-D 對換一齊等埋 P1 落地(要 kids/org 欄)+ K-C 簽名。

---

## §6 Rollback + 驗證

### 6.1 動手前

- `cp backend/hymns.db backend/hymns.db.bak-taxonomy-$(date +%Y%m%d)` +
  `cp backend/users.db backend/users.db.bak-taxonomy-$(date +%Y%m%d)`(K-D 會改
  favorites/playlists,兩個 db 都要 backup),保留到成個計劃驗收完
- migration script 要 idempotent(`PRAGMA table_info` 查完先 ALTER)——hymns.db
  同時被夜晚 job 寫緊
- K-B 開波前**暫停 growLibrary 排程**,K-D 完成後恢復
- ⚠️ 多 session 共用 worktree 規矩照舊:唔好 `git add -A`,commit 前核對 working tree

### 6.2 Rollback 路線

- P1/P2/P4/P5:artist/lang 原欄未郁,rollback = revert code commit,新欄留喺 DB
  唔阻地球轉
- P4 推斷錯得多:`UPDATE hymns_all SET performer='', performer_source='' WHERE
  performer_source='ai'`——按 source 逐層清,manual 唔會誤殺
- **P3(K-D)係唯一 delete 現有數據嘅動作**,rollback 材料齊備:
  `old-snapshot.sql`(重插舊 471 首)+ `id-remap.json`(favorites/playlists
  反向 remap)+ 兩個 .bak db。rollback 步驟:一個 transaction 內 delete kids=1
  新 rows → 重插 snapshot → 反向 remap 用戶引用

### 6.3 驗證 checklist(Opus 5,逐 Phase)

**P1 後(SQL)【已按 §1.3 更正修訂】:**
- [ ] `SELECT COUNT(*) FROM hymns_all WHERE org=''` = 0
- [ ] 盛曉玫+泥土音樂 org 全部='泥土音樂'(90 首:89+1 條執行 session 試插
      已 delist 嘅樣本);天韻合唱團+Heavenly Melody org 全部='天韻合唱團'(20 首);
      artist 欄同 .bak 逐行對比一隻字冇改過
- [ ] 讚美之泉粵語/生命河粵語**維持獨立 org**(唔應該被合併)
- [ ] kids=1 = 619(含 148 首 rejected 墓碑,墓碑 status 冇被郁)
- [ ] `/hymns` API response 有 org/performer/kids/real_lang,舊欄 json 冇變樣
      (兒童歌 lang 照出「兒童」,real_lang 墊呢刻係 no-op)

**P2 後(emulator,⚠️ 開波先驗 DEBUGGABLE):**
- [ ] 團體 chips 冇「盛曉玫」,「泥土音樂」計數=兩者之和;搜「盛曉玫」照中歌
- [ ] 兒童 tab 照舊有 470 首(呢刻仲未換血,讀 lang='兒童' 兼容分支)
- [ ] 副標題、admin long-press 改 org/performer/album 即時反映
- [ ] regression:插播/隊列/最愛/加清單照常

**P3 K-C 報告(換血前):**
- [ ] 對數三清單(重攞返/新收/走漏)數目夾埋合理,走漏清單逐條有原因
- [ ] staging 零垃圾翻生:`SELECT COUNT(*) FROM kids_refetch WHERE youtube_id IN
      (SELECT youtube_id FROM hymns_all WHERE status='rejected')` = 0
- [ ] staging lang 分佈同 §3.4.2 kidsLang 表對得上;sanity flag 清單已人手斷晒
- [ ] **Eric 簽名**先准 K-D

**P2 後追加(C4 換血完先驗到):**
- [ ] 兒童 tab 入面出現粵語/國語/英文 sub-chips(動態生成),計數同 §3.4.2
      kidsLang 分佈對得上;揀「粵語」+「ACM兒童詩歌」AND 夾用正常

**P3 K-D 後(SQL + emulator):**
- [ ] `lang='兒童'` 淨返 148 首墓碑(status='rejected'),curated 兒童 = 0
- [ ] `kids=1` 總數 = staging 收錄數;三語言分佈合理
- [ ] user 2 嘅 5 個心心 + 兒童詩歌清單 8 首全部 remap 完照常有效(emulator 用
      opus-verify 帳號類推驗證,唔好掂 user 2 真帳號)
- [ ] **舊版 client**(裝 release APK 嗰個 emulator)兒童 tab 照有歌(兼容墊生效)
- [ ] 新 client 兒童 tab = 新庫;粵/國/英 tab 冇兒童歌湧入
- [ ] 全庫 `COUNT(*)` 對數:4073 − 471 + staging 收錄數

**P4 pilot 後:**
- [ ] 泥土音樂 89 首 performer 覆蓋率報告;抽 10 首人眼對 YouTube;
      performer_source 分層數目合理

---

## §7 拍板記錄(2026-08-01 Eric)

1. 第二行 chips 叫**「團體」** ✓
2. 文字(中/英)**用推導唔加欄** ✓(已向 Eric 解釋清楚做法)
3. 兒童類別:**推翻原地 reclassify,全部 delete + 重攞 + 攞嗰陣即場分類,而家就做**
   (Eric 已知悉舊 app 空窗風險並拍板;方案用 staging+原子對換+server 兼容墊
   將實際空窗壓到接近零,見 §3.4)
4. **要**歌手/專輯進階篩選介面 ✓(§4.3,等覆蓋率)

同日補充拍板:
5. 新歌歌手/專輯**隔晚自動補**嘅做法 OK ✓(§3.5,org/kids/真語言就即時填)
6. **兒童 tab 入面要再分粵語/國語/英文**(UI 層,唔係淨係後台有欄)✓(§4.2 sub-chips,C2 落地)

---

## §8 執行清單(交 Sonnet,每個 commit 獨立、順序做)

> 規矩:唔好 `git add -A`;每個 commit 完成後停低等 Opus 5 驗收先開下一個
> (C3 staging 跑數據嗰段唔使等,見備註)。

- [x] **C1 — schema + org(P1)** ✅ 已落地 `e96fc6a`,Opus 5 驗收 14/14 PASS
  (2026-08-01;artist/lang 逐行對 backup 零改動、墓碑 148 完好、API 全量對比
  零變樣、撞源更正 6/6 uploader 抽查企穩)。驗收另揪出 5 項唔阻路觀察,
  已分插:①②③(admin relist 冚 org/打甩 kids/org placeholder 文案)→ C2;
  ④(611 Kids 雙值 kidsLang 守衛)→ C3;⑤(天韻詩歌 41 首同天韻合唱團
  aliases 長期分裂)→ C7。原始範圍存檔:
  `backend/scripts/migrateTaxonomy.js`(idempotent ALTER ×4 + org backfill 三條
  UPDATE,行之前自動 cp 兩個 .bak);worshipGroups.js 三組 entry 合併;
  **三個 INSERT 位**(growLibrary:497 / backfillCore:52 / adminHymns:136,見 §3.5)
  全部即時填 org/kids、兒童團體 lang 寫 kidsLang;server.js /hymns SELECT 加欄 +
  real_lang 兼容墊;adminHymns EDITABLE_FIELDS + AdminEditHymnSheet 加
  org/performer/album(manual source 規則)。**先跑 migration 後 commit code。**
  呢步落地後,黎緊每晚新攞嘅歌就即時分好 org/kids/真語言入庫(§3.5)。
- [x] **C2 — client OTA(P2 + §4.2)+ C1 驗收觀察 ①②③** ✅ 已落地 `1774359`+
  `1687608`,OTA 已 publish(update group `fa9278b3-…`),Opus 5 驗收 10/11 PASS
  (2026-08-01)。唯一未驗項:**OTA 實際落地**(emulator 係 debug build 唔食 OTA,
  驗收環境冇 Expo credentials)——要 Eric 真機開 app 確認(見到「盛曉玫」chip
  消失/泥土音樂計數合併=已落地)。驗收另揪出四項觀察,已分插:
  Ⓐ 團體 chips 換 filter 後保留 scroll offset(舊有行為非 regression)→ C6 順手修;
  Ⓑ 揀緊嘅 kids sub-chip 因數據變動消失時 kidsSubLang 唔會 reset,變隱形篩選
  → **C4 前必修**(C4 換血正正會觸發),已加入 C3 範圍;
  Ⓒ hasChipFilter 一句死碼 → 隨Ⓑ順手清;
  Ⓓ 貼連結**全新加歌**嘅 org 仍 fallback artist(觀察①只 cover relist),
  admin 新加盛曉玫歌會開出未合併 org → C7。
  另:驗收實測咗 sub-chips 動態機制真係跑得通(kids+國語樣本即彈「國語 1」)。
  原始範圍存檔:
  LibraryScreen:兒童 tab 讀 `kids===1||lang==='兒童'`、**兒童 tab 內語言
  sub-chips(real_lang,動態生成,Eric 補充拍板)**、第二行 chips 改 org
  (顯示名「團體」)、副標題 performer/org/real_lang、searchBlob 加 performer。
  Backend 補丁(可獨立 commit):adminHymns relist/UPDATE 分支**已有 org 就唔
  覆蓋**(觀察①);`kids` 升做顯式 editable 欄位+admin sheet 開關,唔准再由
  `lang==='兒童'` 推(觀察②,C4 換血後 lang 係真語言,靠推會打甩 flag);
  org placeholder 文案同「後端唔准空」行為對齊(觀察③)。
  照 EAS-UPDATE-PLAN 清場紅線 publish OTA。
- [x] **C3 — refetchKids.js(P3 前半,唔掂 prod)+ C1 驗收觀察 ④ + C2 驗收觀察 ⒷⒸ(前端小修+補 OTA,C4 開閘前提)**
  ✅ code 已落地(`7746886`+`b300ff2`+`776c43a`+`fb46ebe`);staging run 已跑完
  (2026-08-01):舊 471 → 重攞返 395 / 走漏 76 / 新收 222,staging 共 617;
  K-C-report.md 已生成。growLibrary 排程已 `launchctl unload`(C4 後要 load 返)。
  ⚠️ **Fable 5 覆核發現新收有非歌污染**(Yancy 清談/推廣 38、西語標錯英文 6、
  CJ 世俗舞蹈 7,共 51 條)+ 走漏入面有 36 條真歌係誤殺——已出
  `backend/data/kids-refetch/K-C-triage.md` 交 Eric 簽(剔走/救返/Lullaby 純音樂
  三個決定),**取代淨簽走漏嘅原安排**。contentGate 英文負面訊號修正記入 C7(§4 of triage)。
  **未完項:ⒷⒸ 修正嘅補 OTA 出唔到——`eas` CLI 冇登入,要 Eric 行 `eas login`**
  (安全規則:Claude 唔可以代入 credentials)。
  ⚠️ 更正 C3 session 一個誤判:佢話「C2 原本嗰個 OTA 都未出到」——**唔啱**,
  已用 EAS 公開 manifest endpoint(唔使登入)獨立驗證 production channel 最新
  update = `019fbbfe-7dee-7740-848f-ff2e94d69a37`(2026-08-01 06:24 UTC),
  同 C2 報告完全脗合,C2 OTA 係真落地。SUPERVISION-LOG C3 條目嘅呢句要打折扣。
  原始範圍存檔:
  抽 growLibrary 關卡 functions 出 `lib/`;refetchKids.js(staging 表、逐團體
  重攞、kidsLang+sanity flag、KotM/Saddleback 5 首 allowlist、dedup 對全表);
  雙值 kidsLang 守衛(觀察④:611 Kids 係 '粵語/國語',INSERT 前 validate lang
  必須 ∈ {粵語,國語,英文},雙值團體逐首判斷,判唔到就 flag 唔准亂寫);
  跑之前暫停 growLibrary 排程;跑完出 K-C 對數報告(md 檔落
  `backend/data/kids-refetch/`)。*commit code 唔使等跑完,報告出咗先叫完成。*
- [x] **C4 — 原子對換(P3 後半)** ✅ 2026-08-02 Eric 首肯 triage 四項後執行,
  落地 `3c1fcfb`,Opus 5 驗收 **17/17 PASS 零補救**:兒童庫 471→608
  (粵163/國134/英311),148 墓碑逐行對 backup 零改動,剔走 58 條(triage §1a
  標題數錯 38/51,id 清單 45+6+7=58 先係準,Opus 逐條核實零誤殺)全部冇翻生,
  救返 49/49(含讚美之泉兒童 6 條「頻道搵唔到」級,實測播到),Lullaby 13 條
  performer='純音樂'。user 2 心心 4 remap+1 按拍板消失、清單 6 remap 零孤兒。
  swap transaction 原子性(BEGIN/COMMIT+tmp+rename)驗過;+157 條新 row 稽核
  =growLibrary 正常收錄非 swap 副作用。emulator:sub-chips 首次現身(163/134/311
  逐粒對上),AND 夾用正常,主 tab 零湧入。growLibrary 排程已恢復。
  ⚠️ **事後發現 spec 缺口(2026-08-02 監督 session 揪出,已修)**:K-D 換血規格
  列嘅繼承欄位冇包歌詞六欄,staging 表照 spec 冇帶 → 51 首舊兒童歌 verified
  歌詞陪葬(全庫 259→208)。修復 `84b8f57`(restoreKidsLyricsC4.js,locked
  script):由 bak-c4swap 按 youtube_id 繼承返 49 首落現行、2 首被剔走嘅復活做
  curated=0(隱藏唔刪除,唔推翻 triage 決定),verified 復返 259 準確歸位,
  backend kickstart 後 API 實證 3 首見歌詞。教訓:**日後任何 delete+insert
  對換,繼承欄位清單要由「而家 schema 全部欄」出發逐個剔,唔係由「諗到嘅」
  逐個加**;Opus 驗收單同樣要包埋歌詞/計數類旁系欄位。
  原始 gate 記錄:
  (2026-08-02 修訂:Ⓑ 補 OTA 由硬 gate 降級——sub-chips 換血前根本唔存在,
  冇用戶可能揀住,隱形篩選 bug 喺 C4 嗰刻觸發唔到,只有換血後數據再變先會中;
  補 OTA 等 Eric `eas login` 就推,唔阻 C4。C2 主 OTA 已證實落地 ✓。
  Piano Lullaby 13 條 Fable 5 建議:**收**,performer='純音樂'——Eric 原始需求
  本身指明歌手可以係「無人聲/純音樂」+ 呢 13 條係現有庫內容,唔收=主動剷嘢。)
  簽名後次序(K-C-triage 尾段):①staging 剔走 51 條 ②救返 36(+13 如收 Lullaby)
  allowlist 重驗 ③重生成 K-C-report 簽名版 → 先至行 swap transaction
  (delete 471 非墓碑 → insert staging → remap users.db 心心/清單 → 寫
  id-remap.json);恢復 growLibrary 排程;跑 §6.3 K-D 驗證 SQL。
- [x] **C5 — backfillMeta.js(P4)** ✅ **正式收貨**(2026-08-02):pilot `20f5520`
  + C5b 硬條件修正 `96ffe2c`,Opus 兩輪驗收過。泥土 cohort 最終:metadata 12/
  description 22/title 46/空 5(80/85=94%),album 65/85;3 條客席錯標已修正實證。
  夜晚排程 com.hymnapp.backfillmeta 已 load(17:30/晚)。C5c 收尾已落地
  `896fe56`(報告檔改 /tmp、pilot 審計報告 byte-identical 恢復、org-strip 三重
  兜底實測、limit 300、兩個 plist 補入 ops/launchd、星期日碰撞註解修正);
  C5c 屬 Opus 收貨時嘅非阻塞 followup,驗證併入 C6 pre-flight 一齊做。
  全庫 4096 條未掃:300/晚 ≈ 14 晚一轉,覆蓋率過半 ≈ 7 晚(C6 gate);
  Layer A 仍 stub 等 claude login。⚠️ 夜晚 job 監督:backfillMeta 應併入
  Fable 5 現有 growLibrary/fetchLyrics 三小時 supervision 圈(經 Dispatch 知會)。
  pilot 記錄:
  泥土音樂 85 首(原稿寫 89,status='ok' filter 實得 85),覆蓋率 D 19/T 49/
  空 17(80%),album 63/85(74%,零 AI 估)。D 層正確抽到客席主唱(郭小晗/
  蔡美玲/楊宗璜),同盛曉玫分得開——原始問題嘅直接解答。途中修咗兩個 album/
  performer regex bug。**Layer A 一次都未跑過:`claude -p` CLI 未登入
  (Not logged in),要 Eric 喺部 Mac 行 `claude` login 先開到 AI 層**;17 首
  留空係規格容許(UI fallback org)。Layer T 局限記錄:1206 歌譜教學/1199 訪談/
  258/260/261 組曲呢類非歌 row 都攞咗 performer(curation 範疇,等 Opus 意見)。
  Opus 5 抽查結論(2026-08-02):**通過但有條件**——D 層 19/19 精準(實抓 55 條
  片核)、album 63/63 可追溯零重寫、越界零;但開全庫排程前三個硬條件(C5b):
  ①`DESC_PERFORMER_RE` 加「歌手」(+和聲/領唱),reset 857/886/1194 重跑
  (「歌手 (Singer):」寫法漏網,3 條客席錯標盛曉玫,6.1% 錯標率唔准帶入全庫)
  ②候選輪換+每晚 budget 預設(死症會塞住 ORDER BY id 隊頭,排程永遠掃唔完)
  ③寫入改逐條即寫(唔准成晚積到最尾先寫)。
  順手做:**Layer M 結構化欄位**(實測 12 條 Topic 上載有 artist/album/track,
  留空 17→5,放 D 層之前)、多人分隔符 normalize「、」、專輯異體字(脚步/腳步)。
  Layer T 非歌誤標 Opus 意見:唔阻 P4,但 **C6 前必清**——全庫 run 順手出
  suspected-nonsong 清單交 Eric 簽(同 K-C triage 同款);另發現 cohort 有 21 條
  重複 youtube_id(全庫同樣有),C6 前要 dedup,已入 C7。原始範圍存檔:
  waterfall 三層 + album parse + manual 保護;先淨跑泥土音樂 89 首 pilot,
  出覆蓋率報告等抽查;過咗先加入夜晚排程全庫跑(同 fetchLyrics 錯開時段)。
  排程模式掃 `performer_source=''`——現有 4000 首清完之後呢個排程照留低,
  自動接住每晚新收嘅歌(新歌 performer/album 最多遲一日補齊,§3.5)。
  **C5b(三個硬條件+順手項)已落地(2026-08-02)**:①`DESC_PERFORMER_RE` 加
  「歌手/和聲/領唱」,reset 857/886/1194 重跑,3 條全部改標啱客席主唱
  (857/1194→郭小晗 Raven Guo,886→蔡美玲 Sandra Tsai,經 Layer D)。
  ②加 `last_meta_attempt` 欄(idempotent ALTER),候選改
  `ORDER BY last_meta_attempt IS NOT NULL, last_meta_attempt ASC`,`--limit`
  預設 160。③D/T/M 命中逐條即寫(每條跟 acquireDbLock 節奏),Layer A batch
  結果批完即補寫(唔留到 run 尾)。順手項全做:Layer M 結構化欄位(放 D 之前,
  yt-dlp JSON `artist`/`album` 有值直用,org 名清走)——17 條留空重跑,12 條
  Topic 式上載(id 1287-1298 等)全部經 Layer M 補中,留空 17→5(剩 54/941/
  967/1201/1207,967/1207 係「錄影花絮」已入 suspected-nonsong.md);多人
  分隔符 normalize「、」(`&`/`&amp;`/`feat.`/`,`→「、」,現有 4 條 1032/
  1051/1196/1212 已 UPDATE);專輯異體字 canonical(脚步→腳步,現有 267/271
  已 UPDATE);suspected-nonsong side-output 已接線(`backend/data/
  suspected-nonsong.md`,唔改 DB);dry-run log 誤導已修(清楚標示模擬計數)。
  ⚠️ 過程中揪出一個操作教訓:原本用 `sqlite3` CLI 直接 UPDATE 呢 9 條做
  one-off 修正,俾一個並行行緊嘅排程(用 hymnDb.js acquireDbLock 合作鎖)
  嘅 saveDb() 全檔案覆寫靜靜哋 revert 咗——sqlite3 CLI 唔知呢個鎖嘅存在。
  改用同一套 acquireDbLock 嘅小 node script 重做先真正落地生根,教訓:
  **一係唔好用 sqlite3 CLI 直接改 hymns.db,一係改完即刻確認冇被覆蓄
  (呢個 DB 冇 WAL,但仍然會俾第二個 lock-respecting writer 嘅 in-memory
  快照蓋走)**。夜晚排程已開(`com.hymnapp.backfillmeta`,17:30,
  同 fetchLyrics 8 輪錯開),`--limit 160` 掃全庫。
- [ ] **C6 — 篩選 sheet(P5)⛔ 卡三樣:P4 覆蓋率過半 + suspected-nonsong
  清單 Eric 簽完清完 + 重複 youtube_id dedup 完**(後兩樣唔清,歌手/專輯 chip
  會計埋教學片/訪談/組曲同重複條目——user-visible 垃圾)
  出 UI spec 俾 Eric 過目先動工;bottom sheet 歌手/專輯兩組;backdrop 唔用
  absoluteFillObject。
- [ ] **C7 — 收尾 followups(另開,唔阻主線)**
  OTA adoption 近 100% 後拆 real_lang 兼容墊;團契遊樂園 34 首 kids 歸屬問 Eric;
  routes/category.js `/artist`、home.js featured-artist 轉 org;
  天韻詩歌(41 首)同天韻合唱團(20 首)係咪同一事工要逐條片驗證(§1.3 教訓:
  唔准靠搜尋結果估);**全庫重複 youtube_id dedup**(C5 抽查發現泥土 cohort
  85 條有 21 條重複、全庫 208 組 pre-existing,C6 前要清);contentGate 英文
  負面訊號(K-C-triage §4);941/1201「算命與聖經預言」講道片人手斷。

每個 commit message 引用本文件對應章節;Opus 5 驗收用 §6.3 對應段落。
