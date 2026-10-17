# Admin「在線」頁 —— Opus 5 獨立驗收 2026-09-05

對 `ADMIN-PRESENCE-EXEC-20260905.md`(規格)+ `ADMIN-PRESENCE-REPORT-20260905.md`
(Sonnet 證據表)+ commits `44e7e19 / d50be30 / 05e3e9a / 2ed3658`。

**全部證據由我自己重做一次**,冇引用 Sonnet 嘅數。用咗四個 harness + 一次
模擬器 end-to-end:

| harness | 用途 |
|---|---|
| `opus-presence-harness.mjs`(port 3099) | backend 11 組 case(C1-C11),真 `lib/presence.js` + `routes/presence.js` + 真 `requireAuth/requireAdmin` + 真 `getUserDb()` |
| `opus-wallclock.mjs` | 真 wall-clock 246 秒(唔傳假 `t`)驗 180 秒 session 重置 |
| `opus-hook-harness.mjs` | `usePresenceHeartbeat.js` 真 module(只換 4 條 import + `export default` 一行,逐條 assert 換得中)+ 手寫 hook runtime + 假 timer |
| `opus-mountorder-harness.mjs`(port 3098) | 量 `app.use('/api/admin', …)` 掛載次序嘅副作用 |
| iOS Release 模擬器 iPhone 17 `E0416618…` | chip / sheet / 非 admin / 30 秒刷新,配 harness backend(3002) |

鐵律遵守:冇改 source(兩個臨時 patch 已 `git checkout --` 還原,`git status
--porcelain` 對嗰兩個檔回空)、冇 commit、冇部署、冇 restart 3001、冇掂
hymns.db、`backend/users.db` sha256 前後一樣
(`f0b0056a24e27ea57f00dd498ecdf81f668e8a864d34bdfe0d649bfc3fae5d16`)、冇 import
server.js。模擬器單機 + hold 檔,收工 `shutdown all` + 殺 idb_companion,
`booted:0 idb:0 sim:0 devtools:0`。

---

## 判定總表

| # | 項目 | 判定 |
|---|---|---|
| 1a | heartbeat 濫用面(flood 撐爆 5000) | **有保留** |
| 1b | deviceId 長度/字元白名單 | **有保留(低)** |
| 1c | body 大細 | **PASS**(+ 一個低度 log noise 保留) |
| 1d | token 無效當訪客 / `last_seen_at` 唔會被錯更新 | **PASS** |
| 1e | `requireAuth` + `requireAdmin` 次序 | **PASS**(+ 掛載次序副作用,低) |
| 1f | 回應洩唔洩漏電話全號 | **PASS** |
| 2a | 同 deviceId 登入前後 dedup | **PASS** |
| 2b | 登出之後雙計 | **FAIL(輕微,≤180 秒)** |
| 2b′ | **冷開機頭 60 秒會員被當訪客**(新發現) | **FAIL(輕微,≤60 秒)** |
| 2c | 180 秒 session 重置(真 wall-clock) | **PASS** |
| 2d | `durationSec` 計法 | **有保留**(firstSeen→now,唔係 →lastSeen) |
| 2e | sweep 時機 | **PASS** |
| 2f | 5000 上限 LRU | **PASS**(邏輯啱,但就係 1a 個攻擊面) |
| 3a | 背景冇播停心跳 / clearInterval 冇 leak | **PASS** |
| 3b | AppContent 只加一行,冇改其他 | **PASS** |
| 3c | 會唔會隨 PlayerCtx re-render 重設 interval | **PASS**(冇風暴) |
| 3d | **「變 active 即刻送一個」** | **FAIL** |
| 3e | chip 只 admin 見 | **PASS** |
| 3f | sheet 30 秒刷新 / 下拉 / 空狀態 / 時長格式 | **PASS 但有保留**(每 30 秒閃 spinner) |
| 3g | unmount 清 timer | **PASS** |
| 4 | Eric 五條拍板 | ①②③④⑤ 全 **PASS**(①④ 各有一個保留,見下) |
| 5 | A-3 access log 排除 heartbeat | **PASS** |
| 6 | 部署影響 | **PASS**(restart 一定要排喺 OTA 之前) |
| 7 | 模擬器 end-to-end | **PASS** |

---

## 1. 安全

### 1a 濫用面 —— 有保留(唯一一條我認為值得喺 backend 補嘅)

`POST /api/presence/heartbeat` 冇 auth、冇任何 per-IP 節流,`app.use(cors())`
(server.js:39)開晒任何 origin。`recordHeartbeat()` 每個新 deviceId 開一條
entry,`evictOldestIfFull()`(presence.js:34-45)一滿就剷 **lastSeen 最舊嗰條**。

真用戶 60 秒先一個心跳,即係佢哋嘅 `lastSeen` 隨時舊過攻擊者啱啱寫入嗰批
→ **真用戶會排喺前面被剷**。實測(C8/C8b):

```
[C8 灌 5200 個唔同 deviceId]   size=5000 snapshot_guests=5000
[C8b flood 之後再打真訪客心跳]  flood後size=5000  再打victim後guests=5000
```

即係 admin 個頁會見到「訪客 5000」,真人一個都唔喺入面。

**嚴重度評估**:記憶體有 5000 上限(唔會 OOM)、restart 清零、唔會蝕任何
持久化數據、唔影響播放。純粹係「Eric 睇到嘅數變垃圾」。所以我判**有保留、
唔係上線 blocker**,但建議補一條好簡單嘅嘢:訪客 entry 獨立上限(例如
guest 最多 2000),或者抄 `requireAdmin` 現成嗰個 Map 做 per-IP 60/min。

### 1b deviceId 白名單 —— 有保留(低)

routes/presence.js:61 `String(b.deviceId || '').slice(0, 40)` —— 有截斷,
**冇字元白名單**(規格 §2 講「body 欄位長度白名單(照 clientLog.js 做法)」,
clientLog.js 本身都係淨做截斷,所以係一致嘅)。實測(C7)灌
`<script>alert(1)</script>\n\r` + 200 字母 + 一個 object + 300 字母共 4 條,
出到 `guests=3` —— 因為兩條長 deviceId 截到 40 字之後撞埋同一條 key。

風險評估:`getPresenceSnapshot()`(presence.js:96-102)**完全冇回 deviceId**,
所以任何惡意字串都入唔到 admin UI,冇 XSS/注入面。真 deviceId 係 32 hex
(`src/deviceId.js:23-26`),永遠唔會撞 40 字截斷。判低度。

### 1c body 大細 —— PASS

`app.use(express.json())`(server.js:40)預設 100kb,route 冇自己再收窄。
實測:90KB body → `204`;200KB → `413`。

一個低度保留:`PayloadTooLargeError` 冇 error middleware 接,會喺 stderr
噴成個 stack。呢個 endpoint 又啱啱被 A-3 排除咗 access log,所以佢係
「平時零 log、一被打就噴 stack」。同 client-log 一樣係既有姿勢,唔算新病。

### 1d token 無效 → 當訪客,`last_seen_at` 唔會被錯更新 —— PASS

`tryAuthenticate()`(routes/presence.js:33-55)`jwt.verify` 一 throw 就
`return null`,個 `UPDATE users SET last_seen_at`(:49)喺 verify **之後**,
所以錯 token 根本行唔到嗰行。實測:

```
[C4 無效 token]  online={"total":1,"members":0,"guests":1}  lastSeen 不變
[C4c token 簽啱但 user 已刪]  {"total":1,"members":0,"guests":1}
[C4b 有效 token 心跳]  last_seen_at 更新咗 → 2026-09-05T08:06:35.531Z
```

C4b 個更新只落 sql.js in-memory(presence route 冇 call `saveUserDb()`),
同 `requireAuth.js:33-35` 現有做法一模一樣,唔算新行為。

### 1e requireAuth + requireAdmin 次序 —— PASS,附一個掛載次序副作用

`app.get('/api/admin/presence', requireAuth, requireAdmin, …)`
(routes/presence.js:71)次序啱:`requireAdmin.js:25` 讀 `req.user.role`,
就係 `requireAuth.js:29-37` 啱啱由 DB SELECT 返嚟嗰個(唔信 token payload)。

```
[C5a 冇 token]401  [C5b 非 admin]403  [C5c 亂 token]401  [C5d admin]200
```

**副作用**:server.js:175 `adminRoutes(app)` 做咗
`app.use('/api/admin', requireAuth, requireAdmin, router)`(admin.js:394),
排喺 `presenceRoutes(app)`(:180)之前。admin.js 個 router 冇 catch-all,
所以會 fall through(而家 `/api/admin/invites` 已經係咁行緊),但
**requireAuth / requireAdmin 會跑兩次**。實測(用一個空 Router 精確重現
嗰個掛載形狀,唔 import admin.js 以免拉 hymns.db):

```
一個 /api/admin/presence request → status=200,掛載層 requireAuth 跑咗 1 次(route 自己嗰個另計,即實際 2 次)
連打 40 次:第 31 次就 429 —— 60/min 上限如果只數一次應該第 61 次先中
```

後果:每次讀快照 2 次 DB SELECT + 2 次 `last_seen_at` UPDATE;
`requireAdmin` 有效限速由 60/min 變 30/min。sheet 30 秒刷新一次 = 2/min
(記 4),距離 30 好遠,**唔影響使用**。純記錄。

### 1f 電話全號 —— PASS

`maskPhoneMiddle()`(routes/presence.js:21-28)實測:

```
+85261234567(12)→+852****4567 | 61234567(8)→61****67 | 85261234567(11)→852****4567 | 1234567(7)→*******
```

中間四位真係遮到,短過 8 字全遮。冇任何路徑回全號。

再加一層:今日 users 表 16 個帳戶**全部有 username**
(`2:Leung Eric … 22:Joy`),而 `otpAuth.js:316-318` 註冊一定寫
`trimmedUsername`,所以 `row.username || maskPhoneMiddle(row.phone)` 呢條
fallback 實際上今日行唔到。冇樣本可以真跑,已用公式對數代替。

---

## 2. 正確性

### 2a 同 deviceId 登入前後 dedup —— PASS

```
[C2] before={"total":1,"members":0,"guests":1}  after={"total":1,"members":1,"guests":0}
```

`recordHeartbeat()`(presence.js:65-67)member 心跳一入嚟就
`store.delete('g:'+deviceId)`。模擬器實測都對得上:App 冷開機打咗一個訪客
心跳,60 秒後打埋 authed 嗰個,sheet 個「訪客」冇由 3 變 4。

### 2b 登出之後雙計 —— FAIL(輕微)

登出之後 token 冇咗,同一部機下一個心跳變返訪客,開一條新 `g:<deviceId>`;
但舊嗰條 `m:<userId>` 要等 180 秒 stale 先消失。實測:

```
[C3 登出後即刻]  {"total":2,"members":1,"guests":1}
```

一部機、一個人,數成 2。最多 180 秒。

### 2b′ 冷開機頭 60 秒,登入咗嘅會員被當訪客 —— FAIL(輕微,新發現)

`usePresenceHeartbeat` mount 嗰刻即刻送第一個心跳
(usePresenceHeartbeat.js:72),但 `AuthContext` 個 token 係
`AsyncStorage.getItem()` 之後先 `setToken()`(AuthContext.js:17-29)——
**hook 快過佢**。而 hook 唔會因為 token 一變就補送一個(effect1 deps 係
`[]`,effect2 deps 係 `[isPlaying, sendHeartbeat]`,兩個都唔睇 token),
所以要等落一次 interval tick(≤60 秒)先變會員。

模擬器 harness backend 兩次冷開機、兩次都係咁(log 逐行):

```
[hb-raw] {"deviceId":"784fc0f3…","state":"fg"} auth=no      ← launch 即刻
[hb-raw] {"deviceId":"784fc0f3…","state":"fg"} auth=yes     ← 60 秒之後
[hb-raw] {"deviceId":"784fc0f3…","state":"fg"} auth=yes
[hb-raw] {"deviceId":"784fc0f3…","state":"fg"} auth=no      ← 第二次 launch,一樣
```

後果:每個會員每次開 App,「訪客」多一、「會員」少一,最多 60 秒。
好彩 2a 個 dedup 會喺第一個 authed 心跳到嗰刻自動清返舊 guest entry,
所以唔會拖到 180 秒。但 admin 開呢個頁通常就係啱啱開完 App —— 
**呢條同 3d 加埋,就係「開頁頭一分鐘個數唔可信」**。

### 2c 180 秒 session 重置(真 wall-clock)—— PASS

Sonnet 自己列咗做缺口(佢只用假 `t`)。我用真 `Date.now()` 跑咗 246 秒:

```
T+0     durationSec=0            onlineSince=08:07:44
T+60    durationSec=60  size=1   onlineSince 冇變(同一 session)
T+179   online total=1  size=1   ← 距上次心跳 119 秒 < 180,仲在線
T+244   online total=0  size=0   ← 距上次心跳 184 秒 > 180,被 sweep 剷走
T+246   durationSec=2   onlineSince=08:11:48  ← 新 session,唔係累加到 244
```

`recordHeartbeat()` 靠「sweep 已經剷咗 → 見唔到 existing → firstSeen 重置」
呢個間接寫法(presence.js:57-70)喺真時鐘下行為正確。

### 2d durationSec 計法 —— 有保留

presence.js:101 `Math.round((t - entry.firstSeen)/1000)` —— 係
**firstSeen → now**,唔係 firstSeen → lastSeen。實測:

```
[C9] t0 心跳、t0+60s 心跳、t0+230s 讀快照 → durationSec=230(唔係 60)
wall-clock T+179 讀到 durationSec=179,但上次心跳係 T+60
```

後果:用戶已經冇咗心跳(關咗 App / 冇網),喺被 sweep 剷走之前嗰最多 180 秒,
佢仲會喺個名單度、個時長仲會照行。規格 §1「連續在線 = 由 session 第一個
心跳起計」冇明講量到邊,兩個讀法都講得通,但 **firstSeen→lastSeen 更誠實**
(「佢在線咗 X 分鐘」而唔係「佢在線咗 X 分鐘,其中最後 3 分鐘我唔知佢仲喺唔喺」)。
建議改。

### 2e sweep 時機 —— PASS

冇背景 timer;`sweep()` 喺 `recordHeartbeat()`(:58)同
`getPresenceSnapshot()`(:88)頭一行。冇流量就唔 sweep,但 store 有 5000
硬上限兜底,唔會無限漲。設計合理,唔使加 timer。

### 2f 5000 上限 LRU —— PASS

`evictOldestIfFull()` 用 `store.size < MAX_ENTRIES` 做 early return,即係
size 去到 5000 就開始剷,插完仲係 5000。C8 灌 5200 條實測 `size=5000`。
邏輯啱。(佢就係 1a 個攻擊面,但呢個係「有上限」本身嘅代價,唔係 bug。)

---

## 3. 前端

### 3a / 3g 心跳條件 + timer 生命週期 —— PASS

真 module harness(只換 import 行)結果:

```
[F1 mount(active)]        1 個,{"token":"TOK","deviceId":"dev-abc","state":"fg"}
[F2 前台行 120 秒]         共 3 個
[F3 背景 + 冇播,行 180 秒]  0 個心跳,仲有 0 個 timer      ← clearInterval 生效
[F6 背景播歌]              [{"token":null,"deviceId":"dev-abc","state":"bg-playing"}]
[F8 unmount]              timer 1→0, AppState listener 1→0
[F8b unmount 後行 120 秒]  0 個心跳                      ← 冇 leak
```

effect2(:84-92)冇自己嘅 cleanup,但同 effect1 共用 `intervalRef`,
unmount 由 effect1 個 cleanup(:74-77)一次過清晒,所以冇 leak(F8/F8b 實證)。

### 3b AppContent 只加一行 —— PASS

`git show 05e3e9a -- App.js` 得 2 行改動:一條 import(:59)+ 一行呼叫
(:3947)。`debugPlaying` 唔係新嘢 —— App.js:3904 早就有嘅
`usePlayer()` destructure(`isPlaying: debugPlaying`),PlayerProvider
一個字冇改。

### 3c re-render 風暴 —— PASS

`sendHeartbeat` 係 `useRef(async () => {…}).current`(:30-43)—— **恆定引用**,
所以 effect2 個 `[isPlaying, sendHeartbeat]` 實際只睇 `isPlaying`(boolean)。
`usePlayer()` 每次 render 換 context object 都唔會令 deps 變。而且 effect2
個 body 係 `if (!intervalRef.current) …`,就算跑都唔會 clear-then-recreate。

```
[F7 連續 20 次 re-render(token 每次變)]  before=[4] after=[4] timer數=1
[F7b isPlaying toggle 10 次]              timer數 ≤1,冇累積
```

### 3d 「App 變 active 嗰刻即刻送一個」—— FAIL

規格 §1 明文要求。實測**冇送**:

```
[F4 背景→前台嗰刻]      0 個
[F4b 返前台後 59 秒內]   0 個
[F4c 返前台後 61 秒]     1 個   ← 要等 interval 第一 tick
```

(F4c 就係呢個量度嘅正控:同一條 `postHeartbeat` 儀器、同一個「返咗前台」
狀態,一 tick 就量到,證明 F4 個 0 唔係收唔到。)

**根因係一個雙重鎖**:

1. `usePresenceHeartbeat.js:65` `const wasActive = AppState.currentState === 'active';`
   —— RN 喺 listener 跑之前已經更新咗 `currentState`。實證:
   `react-native/Libraries/AppState/AppState.js:87-91` 個「更新 currentState」
   listener 係喺 `AppStateImpl` constructor 註冊(module init),一定排喺 app
   code 後來 `addEventListener('change', …)`(:113-127)之前。所以
   `nextState === 'active'` 嗰刻 `wasActive` 已經係 `true`,
   `nextState === 'active' && !wasActive` 永遠 false。
2. 就算掉轉(currentState 遲更新),`sendHeartbeat` 自己第 32-37 行個
   `isActive` guard 一樣會 early return。我特登跑咗呢個負控,一樣係 0:

```
[F5 負控(假設 currentState 遲更新)]  0 個
```

即係無論 RN 點行,呢個「即刻送一個」**結構上都送唔出**。

**修法**(純 JS,OTA-able):listener 唔好靠 `AppState.currentState` 判斷,
直接用 handler 收到嗰個 `nextState`,再俾 `sendHeartbeat(nextState)` 用,
唔好再喺入面重新讀一次 `AppState.currentState`。順手可以一併解 2b′
(token 一變就補送一個)。

### 3e chip 只 admin 見 —— PASS

見 §7 截圖 3(admin:好友 / URL加歌 / 已下架 / **在線**)vs 截圖 6
(member:得 最愛 / 我嘅清單 / 好友,chip 行短到唔使 scroll)。
`MineScreen.js:256-260` `...(isAdmin ? [...] : [])`,
`isAdmin = user?.role === 'admin'`(AuthContext.js:152)。
API 側另有 requireAdmin 兜底(C5b 403)。

### 3f sheet 30 秒刷新 / 下拉 / 空狀態 / 時長格式 —— PASS 但有保留

功能齊:`AUTO_REFRESH_MS = 30*1000`(:13)、`RefreshControl`(:92-94)、
`ListEmptyComponent`「暫時冇人在線」(:111-116)、
`formatDuration()`「X 小時 Y 分 / Y 分鐘」(:16-22)。`loadSeq` ref(:30-43)
處理咗 out-of-order response。`keyExtractor` 用 `item.id`(唯一)。
`item.name` 唔會 null(presence.js:98 有 `會員 #<id>` 兜底)。

**保留**:自動刷新行 `load(false)` → `setLoading(true)`(:34)→ :81
`loading ? <ActivityIndicator/> : <FlatList/>` —— **每 30 秒成個名單變返
spinner**。本機 localhost 太快睇唔到,我喺 harness 個 admin route 加咗 4 秒
人工延遲重現(截圖 5):三個數字 tile 留住舊值,下面成段名單消失變一粒
spinner,個 sheet 仲縮埋。production 經 Cloudflare tunnel RTT 幾百 ms,
即係每 30 秒閃一下。建議加一個 `silent` 參數,自動刷新唔郁 `loading`。

### 3g postHeartbeat 冇 timeout —— 有保留(低)

`api.js` 個 `postHeartbeat` 用裸 `fetch`,冇 `AbortController` / timeout。
網絡壞嗰陣 pending request 會慢慢累積(每 60 秒一個)。有 try/catch,
唔會 crash。低度。

---

## 4. Eric 五條拍板

| 拍板 | 判定 | 說明 |
|---|---|---|
| ① 前台 / 背景分開標示 | **PASS** | 截圖 4:Hang 個 glow 底「背景播放」tag、Leung Eric / opus-verify「前台」。保留:入咗背景要等落一 tick(≤60 秒)個 tag 先轉,因為 state 係跟最後一個心跳。 |
| ② 訪客只數字 | **PASS** | `getPresenceSnapshot()` 只計 `guestCount`,`members[]` 只放 `kind==='member'`。回應 key 得 `id,name,state,onlineSince,durationSec`(C1b 實測),完全冇 guest 明細、冇 deviceId。 |
| ③ 唔顯示聽緊邊首歌 | **PASS** | 由 client body(`{deviceId,state}`)→ store entry → snapshot → sheet,成條鏈冇任何 hymn 欄。 |
| ④ 連續在線 | **PASS** | 180 秒重置真 wall-clock 驗過(2c)。保留:2d 個 firstSeen→now 令數字最多偏大 180 秒。 |
| ⑤ 無歷史 | **PASS** | 純 `new Map()`(presence.js:20),零持久化,restart 清零(規格 §2 明文接受)。 |

---

## 5. A-3 access log 排除 —— PASS

server.js:83 加咗 `|| p === '/api/presence/heartbeat'`,而且係喺 byte
記帳 wrapper **之前**就 `return next()`,即係成套 log 都跳過。

harness 原樣抄嗰條 predicate 實測:

```
[C10] heartbeat後=0行, admin後=1行 [[access] GET /api/admin/presence 200]
```

**負控(對照組)**:打一次而家 live 嗰個未 restart 嘅 3001(佢冇呢句),
`/tmp/hymn_backend.log` 即刻多咗一行:

```
[access] 2026-09-05T08:12:50.713Z POST /api/presence/heartbeat 404 20ms 162b
```

一邊有一邊冇,證明係新加嗰句喺度做嘢,唔係「本身就唔 log」。

---

## 6. 部署影響

- **要 restart**:`presenceRoutes(app)` 喺 boot 註冊(server.js:180),
  唔 restart 兩條 route 都唔存在 → deploy gate 要 approve 新 sha。
- **restart 必須排喺 OTA 之前**。實測 live 舊 backend:
  `POST /api/presence/heartbeat` → **404**。前端側係安全嘅
  (`postHeartbeat` 冇睇 `res.ok`、冇 `.json()`,純 `await fetch` 之後乜都唔做,
  外面仲有 try/catch),即係**靜默,唔會影響 app**。
  但舊 backend **冇 A-3 排除**,所以每部機每 60 秒會喺
  `/tmp/hymn_backend.log` 落一行 `[access] … 404`(上面對照組實錘)。
  倒轉次序唔會整壞嘢,但會洗 log。→ 跟返 memory 嗰條紅線:**restart 先,OTA 後**。
  另外 OTA 先出嘅話,admin 撳「在線」會見「讀取失敗,遲啲再試」(:85)。
- **舊 client × 新 backend:零影響**。commit 冇改任何現有 route;server.js
  只加咗一條 import、一行 `presenceRoutes(app)`、同 access-log predicate 加一個
  exact-match clause(`p === '/api/presence/heartbeat'`,唔係 `startsWith`,
  唔會誤中任何現有路徑)。
- **成本**:每部機每 60 秒一個 <200 byte POST。會員嗰個心跳每次會做一次
  JWT verify + 一次 sql.js SELECT + 一次 UPDATE(sql.js 係同步 WASM)。
  今日 16 個帳戶完全冇壓力;真係去到過千部機同時在線先要諗(嗰陣可以
  改成「member 心跳唔使每次都撞 DB」)。記低,唔係而家要做。

---

## 7. 模擬器 end-to-end(我自己重做)

iPhone 17 `E0416618-B662-41D2-A253-5260FA0CF556`(單機、hold 檔在場)。
Release build `xcodebuild -workspace Odely.xcworkspace -scheme Odely
-configuration Release -sdk iphonesimulator`,EXIT=0、`error:` 0 條。
`Claude_Code_iOS_Simulator` tool 喺 dispatched session 用唔到(同 Sonnet
一樣),改用 `xcrun simctl` + `idb`。

驗收帳號:同 Sonnet 一樣搵唔到 `opus-verify` 明文密碼,亦冇 production
`JWT_SECRET`。用執行單 §4 容許嘅代替法 —— `config.js` 臨時指去
`localhost:3002` harness backend、`AuthContext` 臨時由 harness 攞一個假身份。
**兩個檔已還原,`git status --porcelain` 對嗰兩個檔回空,`OPUS-TEMP` grep 到 0。**
(我比 Sonnet 多做一步:身份由 `/api/_opus/whoami` 攞,寫喺
`/tmp/opus-presence-role`,所以切 admin ↔ member 唔使 rebuild,relaunch 就得。)
bundle 內核實過 `http://localhost:3002` / `/api/_opus/whoami` /
`/api/admin/presence` / `anon_0_postHeartbeat` 全部喺 `main.jsbundle` 入面。

| 截圖 | 內容 |
|---|---|
| `opus-01-boot.png` | 開機正常,右上頭像「O」(admin 已登入)。Home 顯示「網絡好似斷咗」——預期,harness 冇 `/api/hymns`。證明新 hook 冇令 App crash。 |
| `opus-02-mine.png` | 「我的」頁,chip 行見到 最愛 / 我嘅清單 / 好友 / **URL加歌** |
| `opus-03-chips.png` | chip 行掃到底:好友 / URL加歌 / 已下架 / **在線** ← 新 chip |
| `opus-04-sheet.png` | 撳「在線」彈出 sheet:**總在線 6 / 會員 3 / 訪客 3**;`H Hang · 6 分鐘 · [背景播放]`、`L Leung Eric · 6 分鐘 · [前台]`、`O opus-verify · 0 分鐘 · [前台]`。當中 opus-verify **就係部模擬器自己**——由真 hook 打真心跳、經真 route、由真 sheet 畫返出嚟,三層 round trip。 |
| `opus-05-refresh-spinner.png` | 30 秒自動刷新嗰刻(harness 加咗 4 秒人工延遲)——三個數字留住,下面成段名單變一粒 spinner。即 3f 個保留。 |
| `opus-06-nonadmin.png` | 切做 member(`synctest1`,頭像「S」)relaunch:chip 行**得 最愛 / 我嘅清單 / 好友**,URL加歌 / 已下架 / 在線 三粒 admin chip 全部唔見。 |

截圖全部喺 scratchpad。

收工:`booted:0 idb:0 sim:0 devtools:0`,hold 檔已刪。

---

## 上線判定

**backend 側:可以 restart(approve 新 sha)。** 冇 blocker —— auth 次序啱、
無效 token 唔會污染 `last_seen_at`、冇洩漏電話、A-3 排除生效、對舊 client
零影響、唔碰任何 DB schema。

**frontend 側:建議修完三條純 JS 先 OTA**(全部唔使出 build,OTA 就得):

| 優先 | 要修乜 | 點解 |
|---|---|---|
| **必修** | **3d** 返前台唔送即時心跳 + **2b′** 冷開機頭 60 秒當訪客 | 兩條疊埋 = 「開 App / 返 App 之後最多 60 秒,個數係錯嘅」。而 admin 撳開呢個頁,九成就係啱啱開完 App 嗰陣。呢一頁全部價值就係嗰三個數,唔准喺最常見嗰個時刻錯。**同一個修法可以一次過解兩條**:AppState listener 用 handler 收到嗰個 `nextState`(唔好再讀 `AppState.currentState`)去 call `sendHeartbeat(nextState)`;再加一個 `useEffect(…, [token])` 一變就補送一個。 |
| 建議 | **3f** 30 秒刷新閃 spinner | 加個 `silent` 參數,自動刷新唔郁 `loading`。改動好細。 |
| 建議 | **2d** `durationSec` 改用 `lastSeen − firstSeen` | 一行(presence.js:101),令「在線幾耐」唔會喺人走咗之後仲照行 180 秒。 |

**可以第二版再算**:1a flood 節流(guest 上限或 per-IP)、1b deviceId 字元
白名單、2b 登出 180 秒雙計、1e 掛載次序令 requireAuth 跑兩次、3g heartbeat
timeout。呢五條全部唔會整壞任何嘢,只係令數字更靚 / 更難俾人玩。

**次序**:`backend restart(新 sha)` → 修上面三條 → `OTA`。倒轉會洗 log
(見 §6 實測)。
