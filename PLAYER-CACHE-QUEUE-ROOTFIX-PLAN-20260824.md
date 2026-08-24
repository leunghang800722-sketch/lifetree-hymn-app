# 播放隊列 × 本地快取 state 不一致 —— 根治規劃(2026-08-24)

> 狀態:✅ **已拍板、已落地、已驗收**(2026-08-24,詳見 §12)。§11 四條全部有答案:
> ①成套照落;②pin 窗口 Eric 揀「闊啲」= **curIdx−3**;③E1 事故重演改動前後各行一次(已做);④一單過同一 session 做晒(已做)。
> 事故:iOS 真機聽完第 1、2 首之後播唔到(production,2026-08-24)
> 根因 session:`local_066ce8dc-2075-472d-8c67-e0db57052ba3`(本規劃已用 code 逐點獨立實證,唔係齋抄)
> 前議「60→200 快速止血」已被 Eric 否決;本文件係正式根治方案。

---

## §0 TL;DR

成單嘢嘅**真根因唔係「60 個檔太少」**,係一條被違反咗嘅 invariant:

> **TrackPlayer 隊列揸住 `file://` 參照嘅檔,喺隊列仲參照緊佢期間,唔准被任何人剷走;
> 而萬一真係俾人剷咗(或者 iOS 系統自己清 Caches),播放層必須識得自己跌返落
> stream URL 繼續播,唔准跳歌、更加唔准連鎖卡死。**

而家 codebase 兩邊都冇做到:剷嗰邊(`prune()`)唔知隊列參照緊乜;撞爛嗰邊
(`PlaybackError` handler)雖然剷咗壞檔,但 `TrackPlayer.retry()` reload 嘅仲係
隊列入面嗰條死 `file://` URL,必然二次爆錯落 skip。

根治 = 起**兩條互相獨立嘅防線**,任何一條齋做都足以消滅呢單事故,兩條齊上先算根治:

| 防線 | 一句講晒 | 主要改動位 |
|---|---|---|
| **A. 防剷(queue-aware pin)** | `prune()` 剷檔前問 App.js「隊列而家參照緊邊啲 id」,pin 住嘅唔准剷;取代 12 格 `touchedThisSession` 做主保護 | `audioPrefetch.js` `prune()` + 新 `setPinProvider()`;`App.js` 註冊 provider |
| **B. 自癒(broken-file fallback)** | 播緊 `file://` 撞 `PlaybackError` → 剷壞檔之後,用 `TrackPlayer.load()` 將**播緊嗰首**熱換做 stream URL 再播,唔再 `retry()` 條死 URL | `App.js` PlaybackError handler |
| **B′. 自癒前置(build-time 驗檔)** | `getLocalUri()` 回 URI 前 sync check 個檔真係存在;唔存在就即場剔 index、回 null(caller 自然攞 stream URL) | `audioPrefetch.js` `getLocalUri()` |

常數(`MAX_FILES=60` / `MAX_TOTAL_BYTES=300MB` / `TOUCHED_MAX=12`)**一律唔郁**:
根治之後呢啲數字變成純粹嘅容量調校,幾細都唔會再整跛播放。

---

## §1 根因鏈(五步,全部已對住 code 實證)

1. **`file://` 喺建隊列嗰刻燒死** —— [App.js:134](frontend/hymn-app/App.js:134) `toTrack()`:
   `getLocalUri()` 命中就將 `file://` 絕對路徑寫入 track object,之後
   `TrackPlayer.add()` 交咗俾 native,JS 層冇任何後續機制去追「呢條 URL 指住嘅檔仲喺唔喺度」。
2. **`prune()` 對隊列一無所知** —— [audioPrefetch.js:481](frontend/hymn-app/src/audioPrefetch.js:481):
   每次落載成功都行一次,爆 cap(60 檔/300MB)就照 mtime 由舊到新剷,唯一擋箭牌係
   `touchedThisSession`。
3. **Phase 2.5(e43dde0)開機預載 5 首** —— [App.js:3334](frontend/hymn-app/App.js:3334):
   連環 5 次落載 = 連環 5 次 `prune()`,令「爆 cap 剷檔」由罕見變成日常。
4. **`touchedThisSession` 得 12 格** —— [audioPrefetch.js:235](frontend/hymn-app/src/audioPrefetch.js:235):
   固定 12 格 LRU,隊列長過 12 首(常態:playSingle 隨機尾巴、幾百首清單)就冚唔住。
   **任何固定數字都係同一個結構缺陷**——隊列長度冇上限,呢個先係「擴大常數」救唔到嘅原因。
5. **爛檔冇 fallback,retry 撞死同一條 URL** —— [App.js:1075-1091](frontend/hymn-app/App.js:1075):
   撞 `PlaybackError` 時如果 active URL 係 `file:` 開頭,`invalidateAudioCache()` 會剷檔剔
   index——**但隊列入面條死 URL 一個字都冇改**。跟住 `TrackPlayer.retry()` 叫 native
   reload **同一條死 URL**,必然再爆,落 skip 分支跳歌。跳到落一首如果又係被剷咗嘅
   file-backed entry,就連環爆錯連環跳(→§6 連鎖卡死)。

**點解係「第 1、2 首之後」爆:** 建隊列嗰刻頭幾首啱啱 `getLocalUri()` 命中、有份入
`touchedThisSession`;隊列後面嘅 file-backed entries(琴日/前日落載低嘅)就冇位企,
開機預載 5 首一衝,佢哋個檔就被 LRU 剷走——隊列播到第 3 首起就撞死 URL。

---

## §2 設計原則

1. **一條 invariant,兩條防線,互相獨立**(§0 表)。防線 A 令事故「基本上唔會發生」,
   防線 B 令「就算發生咗」(iOS 自己清 Caches、將來邊個改壞 prune、任何未預見路徑)
   用戶感知都只係「呢首歌 load 慢咗一秒」,唔係跳歌/卡死。單靠 A 唔得(cover 唔到
   系統清 Caches);單靠 B 唔得(每次 fallback 都係一次可避免嘅 error-cycle + 網絡延遲)。
2. **唔改隊列建立嘅基本設計**(即係答咗任務書 Q3):`toTrack()` 燒 `file://` 呢個
   eager-resolve 做法**保留**。真・lazy resolve(播嗰刻先決定 URL)喺 RNTP 嘅架構下
   要起 local HTTP proxy server 先做到,拒絕理由見 §7。eager-resolve 本身唔係錯,
   錯在冇人維護佢個 lifetime——A+B 補返呢個 lifetime 管理,設計就企得穩。
3. **Android 零改動**:所有新機關跟現有慣例行 `Platform.OS === 'ios'` gate,
   `audioPrefetch.js` 喺 Android 繼續全 no-op。
4. **純 JS,OTA 可達**:唔掂 native,runtime 5 一條 OTA 推得晒。

---

## §3 防線 A —— queue-aware pin(取代 12 格名單做主保護)

### 3.1 機制

`audioPrefetch.js` 新增:

```
let pinProvider = null;
export function setPinProvider(fn) { pinProvider = (typeof fn === 'function') ? fn : null; }
```

`prune()` 開波時攞一次 pin set(**唔准喺 loop 入面逐個檔問**,一次 snapshot 就夠):

```
let pinned = null;
try { pinned = pinProvider ? pinProvider() : null; } catch (_) { pinned = null; }
// loop 入面:
if (pinned && pinned.has(idFromFinalName(name))) continue;   // 新:隊列參照緊,唔准剷
if (touchedThisSession.has(idFromFinalName(name))) continue; // 舊:保留做第二層
```

`App.js` 喺而家 `initAudioCache()` 嗰個 effect([App.js:558](frontend/hymn-app/App.js:558))度註冊:

```
setPinProvider(() => {
  const q = queueRef.current || [];
  const from = Math.max(0, (currentQueueIndexRef.current ?? 0) - 1);
  return new Set(q.slice(from).map((s) => String(s.id)));
});
```

即係:**pin = 隊列由「上一首」起到隊尾嘅所有 id**。

### 3.2 點解係呢個範圍(唔係成條隊列、亦唔係「file-backed entries 先」)

- **點解唔 pin 成條隊列:** 已播完嗰截都 pin 嘅話,長清單(實測有 476 首)聽一晚,
  滾動預載(每次轉歌落載下 2 首)會令「已播 + 已 pin」嘅檔越積越多,`prune()`
  一個都剷唔到 → cache 無上限增長(理論上限 = 隊列長 × 8MB ≈ 幾 GB)。唔得。
- **點解 curIdx−1 起:** 「上一首」係用戶撳 ⏮ 嘅即時目標,pin 埋佢消滅最常見嘅
  倒退場景;再舊嘅(curIdx−2 之前)交俾防線 B 自癒——用戶真係撳幾下 ⏮ 撞到被剷
  嘅檔,代價只係嗰首歌行返 stream,唔係跳歌。
- **有界性論證(呢個 plan 企唔企到就睇呢段):** pin set 大細 = 隊列剩餘長度,
  但 `prune()` 只會對**已經喺 cache 目錄入面**嘅檔 check pin,所以「被 pin 而又
  真係佔住格」嘅檔數 ≤ cache 現有檔數(cap 60 + 落載中 overshoot)。最壞情況
  (60 個 cache 檔全部啱好排喺播放位置前面)`prune()` 呢一輪一個都剷唔到,cache
  短暫企喺 ~60–65 檔——**唔會再升**:滾動預載每落一首新嘅,播放位置同時向前行,
  舊嗰啲跌出 curIdx−1 窗口就變返可剷。呢個「短暫超 cap,自然回落」係接受得嘅
  (同而家 `touchedThisSession` 註解講明嘅行為一致),300MB 上限最壞 overshoot
  幾十 MB,冇 jetsam 風險。
- **點解唔淨係 pin「真係 file-backed 嘅 entries」:** 要咁做就要喺 `toTrack()` 逐次
  記賬(邊個 entry 用咗 file://)、喺 reset/removeUpcomingTracks/熱換全部同步呢本賬,
  多咗一份要永遠對得上 native 隊列嘅 shadow state——正正係今次爆鑊嗰類 state 不一致
  嘅溫床。over-pin(隊列有份但其實 stream-backed 嘅 id 都 pin 埋)嘅代價已喺上面
  證明有界,換嚟零記賬、零 race,值。

### 3.3 `touchedThisSession` 去留

**保留,降級做第二層**:佢仲冚緊一個 pin provider 冚唔到嘅窗口——「啱啱落載完、
`notifyComplete` 熱換仲未行完、隊列 entry 仲未變 file://」嗰幾百毫秒。12 格對呢個
用途綽綽有餘。註解要改寫,講明佢唔再係主保護。

### 3.4 防禦性細節

- provider throw / 未註冊 → `pinned = null`,`prune()` 行為退化返而家咁(唔准炸)。
- id 型別:隊列係 number、cache 檔名係 string,provider 出口統一 `String()`(上面 code 已含)。
- `setPinProvider` 本身純 JS 冇 native 依賴,Android call 咗都無害(prune iOS-only)。

---

## §4 防線 B —— 爛 `file://` 自癒(跌返 stream 繼續播)

### 4.1 而家條路(錯)

[App.js:1075-1091](frontend/hymn-app/App.js:1075):撞 error → 見到 active URL 係
`file:` → `invalidateAudioCache(curId)`(剷檔剔 index)→ 落到共用 retry 分支 →
`TrackPlayer.retry()` → native reload **隊列入面嗰條原封不動嘅死 file:// URL** →
必然二次爆 → skip 跳歌。

### 4.2 改法

`PlaybackError` handler 入面,file:// 分支唔再共用 `retry()`,自成一條「換 URL 重播」路:

```
if (Platform.OS === 'ios' && curId != null && activeUrl 係 file: 開頭) {
  invalidateAudioCache(curId);            // 照舊:剷壞檔 + 剔 index
  retriedTrackRef.current = curId;        // 呢次熱換當佢係「已 retry」:stream 版再爆先至跳歌
  const freshTrack = toTrack(curSong);    // index 已剔 → 必然係 stream URL
  await TrackPlayer.load(freshTrack);     // RNTP 4.1.2 有(trackPlayer.d.ts:45):原位換走播緊嗰首
  await TrackPlayer.play();
  logDiag('localFallback', { hymnId: curId, position: diagProgress?.position, ... }, { always: true });
  return;
}
```

- **`TrackPlayer.load(track)`** 係 RNTP v4 官方「替換 current track」API,唔郁隊列
  其他 entries、唔 reset、唔跳 index。執行期要包 try/catch:萬一 `load()` 喺我哋
  版本行為有出入(執行嗰陣要喺模擬器實證一次),fallback 路線係
  `remove(curIdx)+add(freshTrack,curIdx)+skip(curIdx)` 三步(同現有熱換 [App.js:580](frontend/hymn-app/App.js:580) 同款)。
- `retriedTrackRef = curId` 令語義變成:**file:// 爆 → 免費換 stream 重播一次;
  stream 版都爆 → 先至入而家嘅 skip/熔斷流程**。網絡歌(本身 stream-backed)嘅
  retry/skip/熔斷邏輯一行都唔改。
- JS 隊列(`queueRef`)存嘅係 song object 唔係 track object,唔使同步改嘢;native
  隊列嗰個 entry 由 `load()` 原位換咗做 stream 版,以後 repeat/prev 返嚟都係好 URL。

### 4.3 使唔使順手掃埋隊列其他 entries?

**唔使。** Pin(防線 A)保證咗「隊列前方」嘅檔唔會被 prune 剷;唯二漏網係
(a) iOS 系統清 Caches、(b) curIdx−2 之前嘅舊 entries——兩種情況嗰啲 entry 遲早
都係經「播佢 → 爆一次 → 4.2 自癒」呢條路返嚟,每首代價一個 error-cycle(用戶感知
≈ load 慢一秒)。為咗慳呢一秒去做「invalidate 通知 → 全隊列反向熱換」會引入
remove/add 同 native auto-advance 嘅 race(現有熱換要 15 秒護欄嗰隻),風險大過收益。

### 4.4 防線 B′ —— `getLocalUri()` 出貨前驗檔

[audioPrefetch.js:245](frontend/hymn-app/src/audioPrefetch.js:245) `getLocalUri()`
而家淨係查 in-memory index。改成回 URI 之前 sync 驗一次(expo-file-system 新 API
嘅 `File#exists` 係 sync property,建隊列嗰刻用得):

```
const uri = index.get(String(songId)) || null;
if (!uri) return null;
try {
  const { File } = getFS();
  const f = new File(getCacheDir(), `${songId}${FINAL_SUFFIX}`);
  if (!f.exists) {           // 檔已唔喺度(系統清咗/外部剷咗)
    index.delete(String(songId));
    diagFail(songId, 'cacheStale');   // 低量診斷,睇下真機幾常見
    return null;
  }
} catch (_) { /* 驗唔到就當有,交防線 B 兜 */ }
```

效果:**建隊列嗰刻**就唔會再燒一條指住空氣嘅 file:// 入 native 隊列——index 同
disk 之間嘅 stale 窗口喺入口截咗。成本 = 每個 index 命中一次 stat syscall(µs 級,
每次建隊列最多幾十次),可以接受。

---

## §5 隊列建立設計本身(任務書 Q3 嘅正面回答)

`toTrack()` 燒死 `file://` 係咪風險根源?——**係「風險根源之一半」**:燒死本身冇問題
(eager resolve 係 RNTP 架構下最自然嘅做法),問題係燒死咗之後**冇人負責條 URL 嘅
生命週期**。三個候選架構比較:

| 架構 | 做法 | 判 |
|---|---|---|
| ① 真 lazy resolve | App 內起 local HTTP proxy(隊列全部指 `http://127.0.0.1:PORT/track/:id`,proxy 播嗰刻決定讀本地檔定上游 stream) | **拒絕**:引入常駐 socket server(背景 suspend/resume 生命週期、port 衝突、App Store 審查面)、iOS 背景播放下 proxy 被 suspend 就全滅——為咗個 cache 問題換入一整族新故障模式 |
| ② 隊列永遠 stream URL,唔用本地檔 | 剷成個 Phase 2 | **拒絕**:直接掟走已量度嘅轉歌延遲收益(16.2s→~2.9s 嗰條線嘅 iOS 半邊),因噎廢食 |
| ③ eager resolve + lifetime 管理(A+B+B′) | 本規劃 | **採納**:保留全部性能收益,補返缺失嗰塊 lifetime 契約,改動面細、全 JS、可 OTA |

---

## §6 連鎖卡死(任務書 Q4)—— 分析 + 決定

兩個候選機制(嚟自 `local_066ce8dc`):

- **候選 (a) 連環跳到 JS 被 suspend**:code 有旁證——[App.js:1832-1841](frontend/hymn-app/App.js:1832)
  記錄過同構事故(id=2015 死 URL 俾 native 退避重試 21 次、燒 86 秒,背景 Doze 下
  JS watchdog 全滅)。連環死 file:// 每首要行「load 失敗→error→retry 同一條死 URL→
  再 error→skip」全套,背景下 JS 隨時中途被 suspend,卡死面貌完全吻合。
- **候選 (b) 熱換 remove 錯 item**:熱換([App.js:561-587](frontend/hymn-app/App.js:561))
  有 `idx <= curIdx` 護欄 + 尾 15 秒護欄,而且爆錯嗰段時間冇新落載完成事件嘅話,
  熱換根本唔會行。可能性低,但無 log 排除唔到。

**決定:唔為呢個未實錘症狀寫任何投機性防禦 code。** 理由:防線 A+B 落地後,
「連環死 file://」呢個唯一已知觸發器唔存在——最壞情況(檔真係冇咗)而家係
「一次 error → 原位換 stream → 繼續播」,連 skip 都唔會發生,遑論連環 skip。
候選 (b) 如果真係存在,佢係另一單 bug,要靠證據唔係靠估。

**但要補平時關住、出事先有用嘅低量取證 log**(全部 `always: true`,每單事故得幾條,
唔會噪):

1. `localFallback`(§4.2)—— 邊首、position、觸發時 appState;
2. `cacheStale`(§4.4)—— 建隊列撞到 index 有檔冇;
3. `pruneSkipPinned` —— `prune()` 一輪入面因 pin 而跳過嘅檔數 >0 先報一條
   (證明防線 A 真係喺真機出過手,亦係「pin 範圍係咪太闊」嘅實數來源)。

呢三條齊,萬一連鎖卡死再現,一條 log timeline 就分得開 (a)/(b)/第三種。

---

## §7 唔採納嘅方案(同點解)

1. **擴大常數(60→200 / 12→50)** —— Eric 已否決;結構上任何固定數都會被
   「隊列長度冇上限」打爆,只係將事故推遲同變罕見,root cause 原封不動。
2. **Local HTTP proxy 真 lazy resolve** —— 見 §5①。
3. **invalidate 時全隊列反向熱換** —— 見 §4.3,race 風險大過慳嗰一秒。
4. **prune 前 `TrackPlayer.getQueue()` 直接問 native** —— `prune()` 而家係 sync
   函數兼喺 module 深處,轉 async 要動成條 call chain;native round-trip 每次落載
   都行一次亦冇必要。JS 側 `queueRef` 本身就係隊列嘅 source of truth(§3.5 慣例),
  provider 讀佢係零成本又夠準。

---

## §8 改動清單(俾執行 session 用)

### `frontend/hymn-app/src/audioPrefetch.js`(~+50 行)
| # | 位置 | 改動 |
|---|---|---|
| A1 | module scope | 新增 `pinProvider` + `export setPinProvider()` |
| A2 | `prune()` | 開波 snapshot pin set;loop 加 `pinned.has()` skip;統計 skip 數,>0 出 `pruneSkipPinned` diag(用現有 `diagFail` 通道或並排新 helper) |
| A3 | `touchedThisSession` 註解 | 改寫:降級第二層,主保護係 pin |
| B′1 | `getLocalUri()` | sync `File#exists` 驗檔,stale 就剔 index + `diagFail('cacheStale')` + 回 null |

### `frontend/hymn-app/App.js`(~+35 行)
| # | 位置 | 改動 |
|---|---|---|
| A4 | [initAudioCache effect](frontend/hymn-app/App.js:558) | import + 註冊 `setPinProvider`(§3.1 嗰段 code) |
| B1 | [PlaybackError handler file:// 分支](frontend/hymn-app/App.js:1075) | 由「invalidate 然後跌落共用 retry」改成「invalidate + `retriedTrackRef=curId` + `toTrack` 重砌 + `TrackPlayer.load()` + `play()` + `localFallback` diag + return」;`load()` throw 就行 remove/add/skip 後備,再唔得先落原有 skip 分支 |

**唔准掂**:網絡歌 retry/skip/熔斷門檻(前台 3 / 背景 6,Eric 拍板)、熱換邏輯、
Phase 2.5 讓路機制、所有常數。Android 全程零觸碰(新 code 全部 iOS gate 或天然 no-op)。

---

## §9 回歸測試

### 9.1 Node harness(babel 轉真 module 餵 mock FS —— 沿用 Phase 2 驗收嗰套做法)

mock `expo-file-system`(in-memory dir)+ `Platform.OS='ios'`,直接行真 `audioPrefetch.js`:

| # | 場景 | 期望 |
|---|---|---|
| H1 | 61 檔爆 cap,pin 住最舊 5 個 | 剷嘅係第 6 舊起,pin 5 個全存活 |
| H2 | 全部檔都 pin | 一個唔剷、唔 throw、唔死 loop(接受短暫超 cap) |
| H3 | provider throw / 未註冊 | 行為 == 而家(淨係 touched 保護) |
| H4 | pin set 收窄(模擬播放位置前進)後再 prune | 跌出窗口嘅檔變返可剷 |
| H5 | `getLocalUri()` 撞 index 有、disk 冇 | 回 null + index 已剔 + 唔 throw |
| H6 | `invalidate()` 後 `getLocalUri()` | null;再 `prefetch()` 同一 id 會重新排隊 |
| H7 | 現有行為回歸:touched 保護、LRU 次序、300MB 條件 | 不變 |

### 9.2 iOS 模擬器 E2E(dev build,runtime 5;cache 用「種 cache」法直接寫入 container)

| # | 場景 | 步驟 | 期望 |
|---|---|---|---|
| E1 | **復刻原事故** | 種 60 個舊 mtime 檔(id 對應一條 >12 首、頭幾首 file-backed 嘅隊列)→ 開 app 觸發開機預載 5 首 → 連播 3 首 | 隊列參照嘅檔一個冇少(ls container 對數);零 `PlaybackError`;第 3 首照播 |
| E2 | **自癒路** | 播緊隊列,繞過 app 直接剷走「下一首」個 `.m4a` → 等 auto-advance | 恰好一次 `PlaybackError` → `localFallback` diag → 該首以 stream 繼續播;冇跳歌、冇卡死、隊列 index 冇亂 |
| E3 | **自癒後 stream 都死** | E2 基礎上令 backend 對該 id 回 404 | 行返原有 retry→skip→熔斷流程(門檻 3/6 不變) |
| E4 | **長清單有界性** | 476 首清單連環 skip 30 次(滾動預載一路落) | cache 檔數恆 ≤ 65;`pruneSkipPinned` 有數但回落 |
| E5 | **熱換回歸** | 標準 Phase 2 場景:落載完成 → 熱換 → 播 file:// | 照舊 work,pin 唔阻熱換 |
| E6 | **Android 回歸** | emulator 行同一 bundle | module 全 no-op、隊列全 stream URL、無 log 噪音(⚠️共用 emulator 先驗 DEBUGGABLE) |

### 9.3 驗收判準

- E1 係事故重演劇本:**改動前行一次(灰):應該爆;改動後行:必須全綠**——正反兩面
  都有先算實證咗因果,唔係齋見「新版冇事」。
- 種 cache / 對數用 simulator container 路徑直接 ls + 對 diag log,唔加任何臨時 app 內 log。

---

## §10 部署與風險

- **純 JS 改動** → iOS 行 runtime 5 OTA;跟現有 EAS update 流程(publish 前清場紅線:
  只 stash 指定 file,唔夾其他 session 嘅 working tree;過 deploy gate)。
- **Android**:同一 bundle 但全部路徑 gate 死,行為零改動;照過 E6 影響面驗證。
- **Rollback**:ota-rollback.sh 兩步式(已落地 5cc6dd0),萬一真機出事十分鐘內回上一 group。
- **風險點**:`TrackPlayer.load()` 喺 4.1.2 嘅實際行為(執行時第一步就喺模擬器單測佢,
  唔啱就直接用 remove/add/skip 後備方案,規劃已備);`File#exists` sync 成本(µs 級,
  E1/E4 順手觀察建隊列耗時冇 regression)。

## §11 拍板結果(Eric,2026-08-24)

1. **成套方案照落** ✅
2. Pin 窗口:Eric 揀「闊啲」→ **`curIdx−3`**(唔係原建議嘅 −1)✅
3. E1 事故重演:**做**(改動前後各一次)✅
4. 派工:**一單過同一 session** ✅

---

## §12 執行 + 驗收記錄(2026-08-24,同一 session 落地)

### 12.1 改動(全部已 commit)

- [audioPrefetch.js](frontend/hymn-app/src/audioPrefetch.js):`setPinProvider()` + `prune()` pin snapshot/skip + `pruneSkipPinned` diag(A);`getLocalUri()` sync `File#exists` 驗檔 + `cacheStale` diag(B′);`touchedThisSession` 註解降級。
- [App.js](frontend/hymn-app/App.js):pin provider 註冊(窗口 `curIdx−3` → 隊尾,ref 現讀);PlaybackError file:// 分支由「invalidate→共用 retry()」改成「invalidate→`retriedTrackRef=curId`→`TrackPlayer.load(toTrack(song))` 原位換 stream→play,load() 唔得行 remove/add/skip 後備」+ `localFallback` diag(B)。
- 常數(60/300MB/12)零改動;Android 零改動(全 iOS gate,E6 實測)。

### 12.2 Node harness:**22/22 全過**

babel 轉真 module + in-memory expo-file-system mock(scratchpad `harness/run.cjs`)。
H1 pin尊重 / H2 全pin唔剷唔炸 / H3 provider throw退化舊行為 / H4 窗口收窄變返可剷+touched保護新落載 / H5 stale index剔除+diag / H6 invalidate後可重新落載 / H7 LRU次序+touched+300MB回歸——全綠。

### 12.3 模擬器 E2E(iPhone 17 sim,dev build + metro,「種cache」法 60 檔)

**E1 事故重演(改動前 vs 改動後,同一劇本)**——劇本:favorites 70 首「播全部」,#2/#3 唔種令滾動預載觸發 prune,#4/#5 種做全場最舊 mtime 做受害者:

| | 改動前 | 改動後 |
|---|---|---|
| prune 剷隊列參照緊嘅檔 | ✅ 兩次都剷咗 #4(32)/#5(33) | ❌ **pin 擋住**(`pruneSkipPinned=1`×2),fillers 代死 |
| 之後播 #5(33) | `source=stream ms=7460`(即播變 7.5s stall + 救援落載白做) | **`source=local ms=334`**(即播) |
| PlaybackError | 模擬器上呢劇本冇引爆(見 12.5 residual);真機有(當日 03:33Z hymnId=3 雙發 willRetry=true→false 現場) | 零 |

⚠️ 改動前重演有一個重要實測發現:去到死 track 嗰刻 [App.js trackChanged 嘅 `cancelAudioPrefetch(curId)` backstop](frontend/hymn-app/App.js:1008) 會**殺埋佢自己嘅救援 re-download**(backend log 實錘 `id=32 aborted=true`)——即係事故鏈仲多一環自我鎖死,root fix 前呢個 backstop 令「補鑊」都做唔到。

**E2 自癒**:播緊隊列,繞過 app 手動剷「下一首」個 .m4a → auto/skip 過去 →
`05:33:17.859 PlaybackError id=35 willRetry=true` → `05:33:17.860 localFallback id=35` → `05:33:23 nextTrackMs id=35 source=stream`——**同一首歌以 stream 續播,冇跳歌**。✅

**E3 自癒後 stream 都死 → 跳歌 handoff**:E4 期間 live 引爆咗一次(`id=43 localFallback → 即刻第二次 PlaybackError willRetry=false → 行原有 skip 路`),鏈冇卡死。✅(原計劃搵「上架但 stream 死」嘅歌,dl-dead-reset 名單 6 首抽測全部 206 復活,冇現成死歌;live 引爆已覆蓋同一 code path。)

**E4 長隊列有界性**:15 連跳入未快取區,cache 檔數恆 ≤65(尾水 53);仲順手實測咗「壞快取檔大清洗」:7 首垃圾 file-backed track 逐首「error→localFallback→stream 續播」,invalidate 剷走晒啲壞檔,全程零卡死。✅

**E5 熱換回歸**:pin 生效下 onPrefetchComplete 熱換照常(30 落載→熱換→`source=local ms=336`)。✅

**E6 Android 回歸**:emulator(debug APK + 同一 metro bundle)開 app / 建隊列(單曲+30尾巴)/ 播歌 / 跳歌全正常,全 stream 路徑,module no-op。✅

### 12.4 順手實錘嘅新事實(影響日後判讀)

1. **`nextTrackMs` 嘅 `source` 欄可以直接當「entry 係 file:// 定 stream」嘅判官**(讀 native `getActiveTrack().url`)——追呢類問題唔使加 log。
2. 隊列面板撳歌 = `TrackPlayer.skip(idx)`(唔 rebuild);「隊列未建之前」被 prune 剷嘅檔,B′ 會令 build 時直接燒 stream URL,零 state 不一致(E1-post 入面 32 就係呢條路:active chip 頭換咗做未種嘅 2548,開機預載喺建隊列前觸發咗一次 prune)。
3. 真機事故指紋:client-log 搵 `PlaybackError` 兩連發(`willRetry=true` 跟住 `false`)= 死 URL retry 撞死;root fix 後呢個指紋應該絕跡,取而代之係 `localFallback`。

### 12.5 Residual(唔擋收貨,記低)

- **模擬器上有一條未完全追到嘅 native 行為**:死 file:// entry 喺某啲時序下唔出 PlaybackError、AVPlayer 自己以 stream URL 打 206 完成播放(6.2s stall)——邊個喺 native 層換咗 URL 未追到底(SwiftAudioEx `recreateAVPlayer` retry 一路係疑犯)。呢個行為**間歇性**(E2/E4 同一劇本就正常出 PlaybackError),而且無論邊條路,root fix 都令佢冇得發生(檔根本唔會俾人剷/entry 根本唔會 stale)。真機出過 error 風暴係事實,防線 B 有真機事故做依據。
- E4 中段有幾下 mis-tap 令隊列被換過(LogBox toast 食咗 tap),bounded-cache 結論唔受影響(反而多咗 queue 替換場景);測試賬戶 favorites 有兩次誤觸已即場還原。

### 12.6 部署狀態

- 純 JS,**未推 OTA**——等 Eric 決定推線時間(跟 §10 流程:清場紅線 + deploy gate + ota-rollback 兜底)。
- 模擬器 E1/E2/E4 種嘅測試 cache 已清,iOS sim/Android emulator/metro 已全部熄。
