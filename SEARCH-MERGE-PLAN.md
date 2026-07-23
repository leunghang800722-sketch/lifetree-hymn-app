# SEARCH-MERGE-PLAN — 搜尋合併入詩歌庫

> Eric 指示(2026-07-23):「其實可以將搜尋放入詩歌庫裡合併一頁」「直接將搜尋欄放到上面」。
> 即係:刪走獨立「搜尋」分頁,個搜尋欄直接擺喺「詩歌庫」頁最上面。
> 呢份係規劃文件,俾 execution session(Sonnet)跟住實作。已核對過現有代碼,
> 所有行號/檔名以本文件寫成當日為準,實作時如對唔上就以「搵到嘅實際代碼」為準。

---

## 0. 一頁總覽(TL;DR)

| 決定 | 結論 |
|---|---|
| 底部 nav | 4 格減到 3 格:首頁 / 詩歌庫 / 我的 |
| 搜尋欄位置 | 「詩歌庫」大標題**之下**、語言 chip **之上**;固定唔郁(pinned),唔跟 list scroll |
| 搜尋行為 | **本地即時 filter**(live search),唔打 backend API,唔使撳搜尋掣 |
| 搜尋範圍 | 歌名 + 英文歌名 + 歌手 + 歌詞 + 專輯(一個框搜晒,唔再有「歌名/歌手/歌詞/專輯」維度 chip) |
| 同 chip 互動 | 搜尋同語言 chip / 歌手 chip 係 **AND** 關係,打字時 chip 照顯示照有效 |
| Backend | 一行改動:`/api/hymns` SELECT 加 `album, title_en` 兩個欄位 |
| 舊搜尋頁 | `SearchScreen.js` / `searchApi.js` 唔再 import,檔案留低等 Phase 3 一齊清(跟 App.js:1028 現有慣例);backend `routes/search.js` 保留唔郁 |

---

## 1. 現況(已核對代碼)

### 1.1 Tab 系統
- App.js 用**自家 tab bar**,唔係 react-navigation tab navigator:
  - `TAB_CONFIG`(App.js ~979-984):Home / Search / Library / Mine 四項。
  - 四個 screen 全部 keep-mount,靠 `display: activeTab === 'X' ? 'flex' : 'none'` 收埋(App.js ~1721-1736)。
  - `activeTab` state 默認 `'Home'`(App.js ~1633)。
- **已確認冇任何 deep link、冇任何其他代碼 `setActiveTab('Search')`** — 全 App 對 Search tab 嘅引用只有三處:`TAB_CONFIG` 一行、`import SearchScreen` 一行、screenWrap 一嚿(App.js 1726-1730)。刪起上嚟好乾淨。

### 1.2 SearchScreen(src/screens/SearchScreen.js,395 行)
- 每下 keystroke 打 backend `/api/search/*`(其實已經係 live,但行網絡、冇 debounce)。
- 有五個維度 chip(全部/歌名/歌手/歌詞/專輯)、最近搜尋(AsyncStorage key `search_recent_v2`)、「發掘詩歌」卡、「你可能會喜歡」建議。
- 呢啲「空狀態填充內容」喺合併後**全部唔要**:詩歌庫嘅默認狀態就係全庫 list 本身,冇「空搜尋頁」呢回事。

### 1.3 LibraryScreen(src/screens/LibraryScreen.js,146 行)
- Props:`hymns`(client 內存全庫,來自 `useCachedHymns` MMKV cache)、`onPlayHymn`。
- 結構:固定 header 區(標題「詩歌庫」+「N 首」+ 語言 chip 一行 + 歌手 chip 一行)+ 落面先係 FlatList。**即係 header 區本身已經係 pinned,唔跟 list scroll** — 搜尋欄插入 header 區就自動 pinned,唔使額外 sticky 邏輯。
- 語言/歌手 filter 全部本地 `useMemo` filter,零網絡。

### 1.4 數據
- `/api/hymns`(backend/server.js ~84)已回傳 `id, title, artist, youtube_id, lang, duration, lyrics, tags, view_count, created_at` — **lyrics 已經喺 client 內存**。
- 但**未有 `album` 同 `title_en`**(DB 有呢兩個欄,SELECT 冇拣)。
- 全庫而家 339 首,本地 filter 零壓力。

---

## 2. 決定一:底部 nav 4 → 3

```
改前: [首頁] [搜尋] [詩歌庫] [我的]
改後: [首頁] [詩歌庫] [我的]
```

- `TAB_CONFIG` 刪 `Search` 一項。三個 tab 會自動平分闊度(`item: { flex: 1 }`),唔使改樣式。
- 刪 App.js 嘅 `import SearchScreen`(~1024)同成嚿 Search screenWrap(~1726-1730)。
- `activeTab` 默認值係 `'Home'`,唔受影響。
- TabBar 上面嗰段 §2.2 註解(App.js ~972-978)要順手更新:寫明「搜尋已併入詩歌庫(2026-07)」,免得下手誤會四 tab 係現行設計。

## 3. 決定二:搜尋欄位置同樣式

### 3.1 位置:標題之下、語言 chip 之上

```
┌────────────────────────────┐
│ 詩歌庫                      │  ← 大標題照舊(頁面身份)
│ 339 首                      │  ← 總數照舊;有搜尋/filter 時變結果數
│ ┌──────────────────────┐   │
│ │ 🔍 搜尋歌名、歌手、歌詞、專輯│   │  ← 新搜尋欄(pinned)
│ └──────────────────────┘   │
│ (全部)(粵語)(國語)(英文)      │  ← 語言 chip 照舊
│ (全部歌手)(ACM)(讚美之泉)...  │  ← 歌手 chip 照舊
├────────────────────────────┤
│ ♪ 歌 1                     │  ← FlatList(唯一 scroll 區)
│ ♪ 歌 2                     │
└────────────────────────────┘
```

**點解係標題之下而唔係最頂?**
1. 全 App 每個 tab 都係「大標題喺最頂 + 狀態列 inset」嘅 pattern(REDESIGN-PLAN 定落);搜尋欄擺到標題之上會撞狀態列 inset 處理,而且成頁冇咗身份標識。
2. Spotify / Apple Music / YT Music 嘅 Library 頁都係「標題先、搜尋欄後」。
3. Eric 話「放到上面」係相對「原本冇/喺另一頁」而言 — 擺喺 header 區之內、list 之上,已經完全滿足「最上面」;實際效果係一入詩歌庫頁,唔使 scroll 就見到、就撳到。

### 3.2 樣式:pinned(唔跟 scroll)

- 直接插入 LibraryScreen 現有嘅固定 header 區(即 `<Text style={styles.count}>` 之後、`chipRow` 之前),**自動就係 pinned**,唔使 SectionList sticky header 呢啲重型嘢。
- 外觀重用 SearchScreen 現成樣式語言:淺色藥丸形(`#E8E8E8`、borderRadius 24、高 48)、左邊 `search` icon、focus 時綠框(`#3DB389` 2px)、有字時右邊出 ✕ 清除掣。placeholder 照舊:「搜尋歌名、歌手、歌詞、專輯」。
- 鍵盤:TextInput `returnKeyType="search"`,撳 return 淨係收鍵盤(結果已經即時出咗)。list `keyboardShouldPersistTaps="handled"` + `onScrollBeginDrag` 收鍵盤,咁樣打完字碌 list 唔會俾鍵盤阻住。

## 4. 決定三:搜尋行為

### 4.1 本地即時 filter(唔打 API)

- **live search**:打一隻字即刻 filter,唔使撳掣。339 首本地 `useMemo` filter 係微秒級,**唔使 debounce、唔使 loading state、離線(MMKV cache)照用得**。呢個係揀本地而唔係 backend API 嘅主因;順便慳咗 tunnel 一程 round-trip(PERF plan 嘅精神)。
- 舊 SearchScreen 嘅五個維度 chip(全部/歌名/歌手/歌詞/專輯)**唔要**:一個框全維度搜晒(Spotify 做法)。詩歌庫頁已經有兩行 chip,再加一行維度 chip 會迫爆個 header。

### 4.2 匹配邏輯

```js
// 概念代碼 — 實作時放喺 LibraryScreen 嘅 useMemo 鏈入面
const q = query.trim().toLowerCase();
const matched = q === '' ? base : base.filter(h =>
  (h.title    || '').toLowerCase().includes(q) ||
  (h.title_en || '').toLowerCase().includes(q) ||
  (h.artist   || '').toLowerCase().includes(q) ||
  (h.album    || '').toLowerCase().includes(q) ||
  (h.lyrics   || '').toLowerCase().includes(q)
);
```

- `toLowerCase` 令英文唔分大小寫;中文唔受影響。繁簡轉換**唔做**(超出範圍,庫入面標題本身繁體為主)。
- 每個欄位都要 `|| ''` 兜底:離線舊 cache 可能未有 `album`/`title_en`(見 §5)。
- 歌詞匹配唔顯示 snippet(v1 從簡);想加「歌詞符合」小 tag 係 optional nice-to-have,唔阻 ship。

### 4.3 同語言/歌手 chip 嘅互動:AND,chip 照留

- Filter 鏈:`全庫 → 語言 chip → 歌手 chip → 搜尋字串`,三層 AND。打緊字時兩行 chip **照顯示、照有效** — 用戶可以「粵語 + 打『恩典』」咁夾住用,呢個正正係合併頁先做到嘅嘢,係 feature 唔係 bug。
- 「N 首」數字跟最終結果數(而家已經係跟 filter 後嘅 `shown.length`,行為不變)。
- 歌手 chip 個計數 base 建議跟埋搜尋字串重算(即 chip 上嘅數字反映「呢個歌手喺當前搜尋結果入面有幾多首」),同而家「跟語言重算」嘅邏輯一致。
- **空結果狀態**:搜嘢搵唔到時,現有「冇歌」empty state 加返上下文:「搵唔到『xxx』」+ 副行「試下其他關鍵字」;如果當時有 chip filter 生效,加多個「清除篩選」掣(一撳重置語言/歌手 chip,保留搜尋字串)— 免得用戶唔知係 chip 累事。

## 5. Backend 一行改動

`backend/server.js` ~L95 嘅 SELECT 加兩個欄位:

```sql
SELECT id, title, artist, youtube_id, lang, duration, lyrics, tags,
       view_count, created_at, album, title_en
FROM hymns ORDER BY id
```

- `album`/`title_en` 本身已喺 DB schema(`hymns` view = `hymns_all` WHERE curated),純粹 SELECT 冇拣。
- Payload 增量極細(339 首 × 兩個短字串)。
- **Cache 過渡**:`useCachedHymns` 每次開 App 都背景 refresh 兼覆寫 MMKV,所以新欄位一次上網後就有;唔使 bump cache key。過渡期(舊 cache + 未 refresh)靠 §4.2 嘅 `|| ''` 兜住 — 即係最壞情況係「頭一次開 App 未上到網時,搜專輯名暫時搜唔到」,可接受。

## 6. 舊嘢清理 checklist

| 項目 | 處理 |
|---|---|
| App.js `TAB_CONFIG` Search 項 | 刪 |
| App.js `import SearchScreen`(~1024) | 刪 |
| App.js Search screenWrap(~1726-1730) | 刪成嚿 |
| App.js ~972-978 tab 註解 | 更新做三 tab,註明搜尋併咗入詩歌庫 |
| `src/screens/SearchScreen.js` | **唔刪檔案**,唔再被 import — 跟 App.js:1028 現有慣例(legacy screens 留到 Phase 3 一次過清) |
| `src/services/searchApi.js` | 同上,變 unreferenced,留低等 Phase 3 |
| backend `routes/search.js` + `/api/search` mount | **保留唔郁**(冇壞處,第日做進階搜尋可能用返) |
| AsyncStorage `search_recent_v2` | 唔使清,自然閒置(最近搜尋功能唔搬過嚟) |
| 「發掘詩歌」/「你可能會喜歡」 | 唔搬 — 佢哋係舊空白搜尋頁嘅填充物;首頁 discovery(HOME-DISCOVERY-REDESIGN)先係做呢樣嘢嘅地方 |
| Deep link / 其他 route | 已核對:**冇**任何嘢指去 Search tab,冇嘢要改 |

## 7. 實作步驟(俾 execution session)

1. **Backend**:server.js SELECT 加 `album, title_en`;重啟 backend,`curl /api/hymns | head` 核對兩個欄位出咗。
2. **LibraryScreen.js**:
   - 加 `query` state + 搜尋欄 UI(§3 位置/樣式)。
   - filter 鏈加搜尋層(§4.2),歌手 chip 計數 base 跟埋 query。
   - 空結果狀態(§4.3)。
   - 鍵盤處理(§3.2)。
3. **App.js**:刪 Search 三處 + 更新註解(§6 頭四行)。
4. **驗證**(裝機實測,唔係 curl 完就算):
   - [ ] 底部得三個 tab,平分闊度,冇黑條遮擋(v232 嗰單嘢唔好回歸)。
   - [ ] 詩歌庫頁:搜尋欄喺標題下、chip 上;scroll list 時搜尋欄唔郁。
   - [ ] 打「恩典」即時出結果,唔使撳掣;清空即還原全庫。
   - [ ] 英文唔分大小寫(打「way」搵到《THE WAY》專輯歌)。
   - [ ] 「粵語」chip + 搜尋字串夾住用,結果係交集,「N 首」數字啱。
   - [ ] 搜一段歌詞內文(揀首有 lyrics 嘅歌試)搵得到。
   - [ ] 搜唔到嘢時 empty state 有搜尋字串上下文;有 chip 時「清除篩選」掣正常。
   - [ ] 撳結果播歌 = 單曲 + 隨機接續(`handlePlayHymn` 默認路徑,唔使改)。
   - [ ] 飛行模式開 App(有舊 cache):詩歌庫照顯示,搜尋唔 crash(`|| ''` 兜底生效)。

## 8. 風險/注意

- **多 session 共用 worktree**:出 build 前核對 working tree,唔好 `git add -A`(見 memory)。
- LibraryScreen 係 keep-mount,搜尋 state 會跨 tab 保留 — 呢個係想要嘅行為(切去首頁再返嚟,搜尋字串仲喺度),唔使特登清。
- 打字每個 keystroke 會經 `useMemo` 重算 artist 計數 + filter,339 首完全冇問題;第日庫過千先需要諗 debounce,唔使而家做。
