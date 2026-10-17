# Admin「在線」頁 —— Opus 5 第二輪獨立驗收(P1-P7 修正覆核)2026-09-05

覆核對象:`ADMIN-PRESENCE-REPORT-20260905.md` §P + commits
`57a17d8` / `cf83149` / `e18ed8c` / `73dce96`,對應上一輪
`ADMIN-PRESENCE-OPUS-20260905.md` 嘅 **2 條 FAIL + 5 條保留**。

**全部證據由我自己重跑**,冇引用 Sonnet §P 嗰張表任何一個數。三個新 harness,
全部真 module、全部有正控 / 負控 / 對照組:

| harness | 用途 |
|---|---|
| `o2-backend.mjs`(port 3099/3097) | 真 `lib/presence.js` + `routes/presence.js` + 真 `requireAuth`/`requireAdmin` + 真 `getUserDb()`,重現 `server.js` 掛載次序(`app.use('/api/admin', requireAuth, requireAdmin, Router)` 先、`presenceRoutes(app)` 後)。20 個 case |
| `o2-hook.mjs` | 真 `usePresenceHeartbeat.js`(只換 4 條 import + `export default` 一行,逐條 assert 換得中,再 assert 冇 import/export 殘留)+ 手寫 hook runtime + 假 timer + 假 AppState(**兩種語義**:RN 真實嘅「先更新 currentState」同負控「遲更新」)。16 個 case |
| `o2-sheet.mjs` | 真 `AdminPresenceSheet.js`(babel 淨轉 JSX→createElement + commonjs,零 logic 改動)+ 手寫 React runtime(useState/useEffect/useCallback/useRef + re-render)。**新舊兩個版本同一支 harness 對跑**(對照組 = `73dce96^`) |
| `o2-deviceid.mjs` | 真 `src/deviceId.js` 嘅 `generateDeviceId()` × 200,000 對 backend 個正則 |
| `o2-nat.mjs` | per-IP 節流喺 NAT 後面嘅離散事件模擬 |

**鐵律遵守**:冇改任何 source(`git status --porcelain` 對
`presence.js` / `routes/presence.js` / `usePresenceHeartbeat.js` /
`AdminPresenceSheet.js` / `server.js` / `api.js` / `deviceId.js` 全部回空)、
冇 commit、冇部署、冇 restart 3001、冇掂 hymns.db、
`backend/users.db` sha256 前後一樣
(`93d4681e24cca67f18551e823c9636ea79a8b4993c4b7b14c012d152ebc7dc48`)、
harness backend 已關。
**今輪冇開模擬器**(`booted:0 idb:0 sim:0 devtools:0`,全程零),理由見 §9。
註:`backend/hymns.db` sha 有變,但係 live backend(pid 1101)自己一路寫緊
(mtime 距我讀嗰刻 3 秒),我三個 harness 一次都冇 import `hymnDb.js`。

---

## 判定總表

| # | 上一輪判定 | 修法 commit | 今輪覆核 |
|---|---|---|---|
| P1 | 3d **FAIL**(返前台唔送即時心跳) | `e18ed8c` | **PASS** |
| P2 | 2b′ **FAIL**(冷開機頭 60 秒會員當訪客) | `e18ed8c` | **PASS** |
| P3 | 3f 保留(30 秒刷新閃 spinner) | `73dce96` | **PASS**(對照組實錘舊版真係閃)+ **一條新保留**(錯誤路徑) |
| P4 | 2b **FAIL**(登出後 180 秒雙計) | `e18ed8c` + `57a17d8` | **PASS**(誤剷風險已逐個場景測,見 §4) |
| P5 | 1a/1b 保留(flood / deviceId 白名單) | `cf83149` + `57a17d8` | **機制 PASS,數值唔合理 —— 30/min 太窄,建議改** |
| P6 | 2d 保留(`durationSec` 計法) | `57a17d8` | **PASS** |
| P7 | 1e 保留(`requireAdmin` 跑兩次) | `cf83149` | **PASS**(31 次無 429,第 61 次先 429;fail-closed 已驗) |

**新增保留 7 條**(全部唔係 blocker,詳見 §8):N1 節流數值 / N2 P1×P5 互動 /
N3 silent 刷新失敗仍然炒名單 / N4 節流 Map 冇上限 / N5 偽造 deviceId 可令會員
隱形 / N6 同機兩個會員接力登入仍雙計 ≤180 秒 / N7 `durationSec` 變咗 60 秒
一格。

---

## 1. P1 —— App 變 active 即刻送(真 module + 假 AppState)

`o2-hook.mjs`,同一支儀器、同一個 `postHeartbeat` 探針:

```
✓ P1-a mount(active)即刻送 1 個      [{"token":"TOK","deviceId":"a1b2…","state":"fg","at":1000000}]
✓ P1-b 入背景冇送(負控)              0 個
✓ P1-c 返前台即刻送 1 個              [{… "state":"fg","at":1000200}]   ← 唔使等 interval
✓ P1-d 100ms 內連環變 active 只送 1 個  0 個(上次 active 距今 50ms)
✓ P1-e 超過 100ms 再變 active 送到     1 個   ← 正控:證明 dedup 冇食晒
✓ P1-f 負控(假設 currentState 遲更新) 0 個
```

**P1-c 對比上一輪嘅 F4(修之前係 0 個)—— 呢條 FAIL 真係醫好咗。**
P1-d / P1-e 一對係 dedup 嘅正負控:100ms 內攔得住,101ms 就過得到,即個
guard 唔係「乜都唔送」。

**修法依賴一個前提,我獨立核實過**:新 code 唔再比較 `wasActive`,但
`sendHeartbeat()` 內部第 37 行仲有 `AppState.currentState === 'active'` 呢個
guard。P1-f 負控實測:如果 RN 遲更新 `currentState`,呢個修法一樣送唔出。
所以要證明個前提成立 —— 我直接讀返
`node_modules/react-native/Libraries/AppState/AppState.js:81-90`:

```js
emitter.addListener('appStateDidChange', appStateData => {
  eventUpdated = true;
  this.currentState = appStateData.app_state;   // ← 喺 AppStateImpl constructor 註冊
});
```

呢條 listener 喺 module init(`AppStateImpl` constructor)註冊,`addEventListener`
(:113-127)係 app code 之後先行,EventEmitter 按註冊次序 dispatch →
**app listener 跑嗰刻 `currentState` 一定已經係 `'active'`**。前提成立,P1 PASS。
(Sonnet §P 張 `verify-07-foreground-return.png` 真機截圖同呢個結論一致,
但我唔靠佢做主證據。)

## 2. P2 —— token null→值即補送

```
✓ P2-a 冷開機 mount(token 未 resolve)  1 個訪客心跳 token=null
✓ P2-b token null→'TOK' 即刻補送        1 個 token='TOK'    ← 唔使等 60 秒
✓ P2-c token 冇變嘅 re-render × 2        0 個(負控,冇假觸發)
✓ P2-d token 換新值(rotation)           1 個(記錄,非 bug)
```

`prevTokenRef = useRef(token)` 初值同 token 一樣,所以 mount 嗰次唔會多送
(P2-a 只有 1 個,唔係 2 個)—— 呢個係 Sonnet 註解入面聲稱嘅行為,實測成立。

## 3. P3 —— silent refresh 唔閃(**新舊對照組**)

同一支 harness 跑兩個版本,唯一分別係 source:

| case | `73dce96^`(舊) | HEAD(新) |
|---|---|---|
| 首次載入 | ActivityIndicator | ActivityIndicator |
| 30 秒自動刷新 **in-flight** | **ActivityIndicator**(名單消失) | **FlatList**(名單留住) |
| in-flight 嗰刻嘅數字 / 行數 | 數字=6,3,3 但 **rows=n/a**(FlatList 根本唔喺 tree) | 數字=6,3,3 **rows=1**(舊值留住) |
| 新資料到 | 數字=9,4,5 rows=2 | 數字=9,4,5 rows=2 |
| 下拉刷新 | refreshing=true,列表唔消失 | 同 |
| unmount | timer=0 | timer=0 |

舊版兩條 FAIL、新版全 PASS —— **對照組實錘咗個病同個藥都真**,唔係「本身就
唔閃」。

**N3 新保留**:silent 刷新**失敗**嗰陣,`load()` 頭嗰句 `setErr(false)` 之後
`.catch(() => setErr(true))` 照跑,**兩個版本都一樣**會令成個名單消失、變
「讀取失敗,遲啲再試」。即係手上明明有好資料,一次網絡閃失就炒晒 —— 同 P3
想醫嗰個病同一類,只係喺錯誤路徑漏咗。建議:`mode === 'silent'` 唔好 `setErr`
(或者連錯兩次先報)。純 OTA、幾行。

## 4. P4 —— 反向 dedup(重點:會唔會誤剷真會員)

`o2-backend.mjs`,四個場景逐個試:

```
✓ P4-a 會員心跳                     {"total":1,"members":1,"guests":0}
✓ P4-b 登出後訪客心跳(即刻)         {"total":1,"members":0,"guests":1}   ← 舊行為係 total=2
✓ P4-c 機A登出,機B會員唔受影響       {"total":2,"members":1,"guests":1} members=[6]
✓ P4-d 同 deviceId 訪客心跳 → 剷走該機會員   members=0
✓ P4-e 同機兩個會員接力登入          members=[4,6](兩條都仲喺度)
```

**答你條問題:唔會誤剷「另一個」真會員 —— P4-c 實證。** 反向 dedup 條件係
`e.kind==='member' && e.deviceId === deviceId`,只認同一個 deviceId;
deviceId 係 per-install 隨機 32 hex(§5 實證),兩部真機唔會撞。

兩個要記低嘅副作用:

- **N5**:P4-d 反過來睇 = 任何人只要**知道**某部機個 deviceId,就可以用一個
  冇 auth 嘅訪客心跳令嗰個會員喺 admin 頁消失。deviceId 唔會出現喺任何 API
  回應(`getPresenceSnapshot()` 冇呢個欄,R-1f 實測回應 keys 得
  `id,name,state,onlineSince,durationSec`),32 hex 亦爆唔到(per-IP 30/min),
  後果純粹係「Eric 少睇到一個人」。**低度,唔係 blocker**。
- **N6**:同一部機兩個會員接力登入(A 登出→B 登入,中間冇夾一個訪客心跳),
  A 條 member entry 仍然要等 180 秒 stale。P4-e 實測 `members=[4,6]`。
  P4 只醫「member→guest」,冇醫「member→member」。真實世界罕見(要兩個人共用
  同一部機同一個 install),而且 hook 登出嗰刻其實會送一個訪客心跳(P4-f 實測)
  —— 即係真 App 行嘅路徑會經過訪客一步,所以呢條實際上撞唔到。記錄。

Hook 側配套亦驗咗:

```
✓ P4-f 登出(token 有值→null)即刻補送訪客心跳   1 個 token=null
```

## 5. P5 —— per-IP 節流 + deviceId 正則 + 訪客優先剷

### 5a deviceId 正則 vs 真 deviceId —— **配得啱**

真 `generateDeviceId()`(`src/deviceId.js:23-26`)= 四段
`Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,'0')` 拼埋。
跑 200,000 次:**長度全部 32、全部細楷 hex、0 條唔配
`^[0-9a-f]{8,40}$`**。全 repo 只有 `src/deviceId.js` 一處寫
`odelyDeviceId`(grep 過 `src/` + `App.js`),所以 AsyncStorage 讀返嘅舊值
亦一定係同一格式。**配。**

順帶:大楷 hex / UUID 帶 dash 會被拒(當冇帶 deviceId → 訪客記唔到)。今日
冇任何 client 送呢兩種格式,但如果將來有人改 generator(例如轉
`crypto.randomUUID()`,有 dash),**訪客會靜靜消失**。建議喺 `deviceId.js`
加一句註解指返呢條 backend 正則,或者正則放寬到接受 dash。記錄。

```
✓ P5-a 灌 7 種 deviceId → 只有「真 32 hex」同「40 個 a」入到(guests=2)
```

### 5b per-IP 節流機制 —— PASS

```
✓ P5-b 同一 IP 連打 33 次 → 第 31 次 429(codes[28..32]=204,204,429,429,429)
✓ P5-c 429 唔會入 Map(guests=30)
✓ P5-d 節流唔分會員/訪客(會員一樣 429)
```

### 5c **N1:30/min 對 NAT 唔合理 —— 建議改**

你問嘅嗰條數:60 秒心跳 × 30/min ⇒ **同一個公網 IP 最多得 30 部機**。
我用離散事件模擬(`o2-nat.mjs`,心跳相位隨機、固定 60 秒窗口,同 code 一樣):

| 同 IP 部機數 | 見得到 | 曾經被 429 | **完全見唔到** |
|---|---|---|---|
| 25 | 25 | 0 | 0 |
| 30 | 30 | 7 | 0 |
| 40 | 38 | 18 | **2** |
| 50 | 38 | 28 | **12** |
| 80 | 38 | 58 | **42** |
| 150 | 39 | 129 | **111** |

30 部機已經開始撞(固定窗口邊界效應),40 部機開始有人**成個鐘都見唔到**,
150 部機得 39 個見得到。

**點解呢個數唔合理**:
1. **教會 WiFi**。一堂崇拜幾十人開住 App 聽詩歌,全部同一個出口 IP。呢個
   App 嘅使用場景就係咁。
2. **香港流動網絡 CGNAT**。同一個 carrier 出口 IP 後面可以有幾千個 subscriber。
3. 最諷刺嘅係:**呢個頁面全部價值就係嗰三個數,而人越多個數越唔準** ——
   節流喺人最多嗰陣先發作。
4. 攻擊面根本唔靠呢層守 —— 第二層(`MAX_ENTRIES=5000` + 訪客優先剷,P5-e
   實測)已經封咗「撐爆記憶體」同「真會員被逼走」兩條。第一層淨係要擋
   「一秒幾千個 request 打爆 CPU」,唔使窄到 30。

**建議數值:`HEARTBEAT_RATE_MAX` 30 → 300**(= 同 IP 300 部機),
仍然係 5 req/s 上限,擋得住 flood,但唔會誤傷真人。
(呢個改動要 restart 先生效 —— 而 restart 本身已經係必做嘅,見 §10。)

### 5d **N2:P1 × P5 互撞 —— 一部機自己可以打爆 30/min**

`ACTIVE_SEND_DEDUP_MS = 100`,即係每次「返前台」最快 100ms 送一個。實測:

```
✓ X-1 一分鐘內切前後台 40 次 → 40 個心跳
```

即係**單獨一個用戶**喺前後台之間快速切換(睇通知、覆 WhatsApp、返嚟、
再出去)就可以自己燒晒 30/min 配額,連累同一個 NAT 後面所有人。P1 之前
呢個病唔存在(嗰陣根本一個都唔送)。

**建議:`ACTIVE_SEND_DEDUP_MS` 100 → 5000~10000。** 5 秒內返兩次前台,
第二個心跳零資訊增量(entry 內容一模一樣),丟咗冇損失。純 OTA、一個常數。

### 5e **N4:`heartbeatRateByIp` 冇上限**

`heartbeatRateByIp`(`routes/presence.js:33`)只會 `set`,窗口過期就覆寫,
**永遠唔會 delete**。每個見過嘅 IP 一條 entry,永久留到 restart。
10 萬個 IP ≈ 10MB 級數,唔會 OOM 但係一條真 leak。同 `presence.js` 個
`MAX_ENTRIES` 對比就見到落差 —— 嗰邊有上限,呢邊冇。
建議:size 超過(例如)20000 就清一次過期 entry。低度。

### 5f 訪客優先剷 —— PASS(自帶負控)

```
✓ P5-e 種 1 個「全表最舊」嘅會員 + 5100 個訪客 → size=5000、members=1、guests=4999
```

我特登將個會員種成**全表 lastSeen 最舊**嗰條 —— 舊 LRU 一定第一個剷佢。
佢生還 = 新嘅「訪客先剷」真係生效。

## 6. P6 —— `durationSec`

```
✓ P6 t0 心跳、t0+60s 心跳、t0+170s 讀快照 → durationSec=60(舊行為係 170)
```

**N7 記錄**:因為心跳每 60 秒一個,`lastSeen−firstSeen` 必然係 60 秒嘅倍數
—— 一個在線咗 3 分 50 秒嘅人會顯示「3 分鐘」(最多低報 59 秒)。對比舊版
最多**高報 180 秒**(而且人走咗個數仲照跳),呢個係好交易。純記錄,唔使改。

## 7. P7 —— 唔再重複 `requireAdmin`

我用**真** `requireAuth` / **真** `requireAdmin`,重現 `server.js:175/180` 嘅
掛載形狀(`app.use('/api/admin', requireAuth, requireAdmin, Router)` 排前、
`presenceRoutes(app)` 排後),唔 import `admin.js` 以免拉 hymns.db:

```
✓ P7-a 同一個 admin 連打 31 次 → statuses 全部 200(uniq=200)
✓ P7-b 正控:同一 admin 累計第 61 次先 429     ← 舊 code 係第 31 次
✓ P7-c auth 矩陣 401 / 403 / 401 / 200(冇 token / 非 admin / 亂 token / admin)
✓ P7-d fail-closed:另起一個冇 /api/admin 掛載層嘅 app → 401(唔會裸奔)
```

P7-b 係關鍵正控:唔係「冇 429」就算數,而係**證明個 counter 真係喺度數,
只不過而家一個 request 只數一次**。61 呢個數同 `requireAdmin.js:10`
`RATE_MAX = 60` 完全對得上。

**fall-through 安全性我另外核實過**:`routes/admin.js` 個 router 只有
`/hymns/:id`、`/hymns/preview`、`/hymns`、`/hymns/:id/delist`、
`/activity/added`、`/activity/delisted` 六條,**冇任何 param route 或
catch-all 會食咗 `/presence`**,亦冇 `router.use`。所以
`GET /api/admin/presence` 一定 fall through 落 `presenceRoutes` 嗰條。

P7-d 亦答咗「P7 令 route 嘅保護依賴 server.js 掛載次序」呢個顧慮:
`req.user` sanity guard 係 **fail-closed** —— 次序被人調亂就 401,唔會變裸奔。
設計成立。

## 8. 回歸(舊 case 重跑,冇 regression)

```
✓ R-2a 同 deviceId 登入前後 dedup      guests=1 → members=1(total 一直 1)
✓ R-1d 無效 token 當訪客               {"total":1,"members":0,"guests":1}
✓ R-1f 回應冇 deviceId、冇電話全號     keys=id,name,state,onlineSince,durationSec
✓ R-5  A-3 access log 排除             heartbeat 後 0 行 / admin 後 1 行
✓ R-F2 前台 120 秒 = 2 個 interval 心跳
✓ R-F3 背景 + 冇播 180 秒 = 0 心跳 / 0 timer
✓ R-F6 背景播歌 → state='bg-playing'
✓ R-F8 unmount 之後 0 心跳 / 0 timer(冇 leak)
```

## 9. 今輪冇開模擬器 —— 講明理由同缺口

上一輪我做過完整 iOS Release end-to-end。今輪四個修正入面,三個
(P1/P2/P4-hook)嘅真身係 **JS 邏輯**,真 module + 假 timer harness 量得比
模擬器**準**(可以做負控 P1-f、正控 P1-e、精確數心跳個數);P3 嘅
「in-flight 嗰刻棵樹係乜」喺模擬器只可以靠人工加延遲影相,喺 harness 可以
直接 assert `FlatList` vs `ActivityIndicator` 同 `rows` 數,仲可以同舊版對跑。

**唯一模擬器先答得到嘅嘢** = P1 依賴嘅「RN 先更新 `currentState`」前提。
我改為讀 RN 源碼直接證(§1),外加 Sonnet 張 `verify-07` 真機截圖同結論一致
(我自己亦睇過佢張 `verify-06-silent-refresh.png`:名單同三個數字 tile 喺
30 秒刷新期間全程冇變 spinner,同我 harness 結果對得上)。

**缺口聲明**:今輪冇真機 / 模擬器嘅獨立第一手證據。如果要 100% 覆蓋,
出街後叫 Eric 開一次 App、切一次前後台、睇個「訪客/會員」數有冇跳錯就夠。

## 10. 上線判定

### **GO** —— 但建議先改兩個常數

七條全部真係修好,冇一條係報大。新發現嘅七條保留全部**唔會整壞任何嘢**
(最壞係「Eric 睇到嘅數少咗人」),冇一條係 crash / 資料損毀 / 安全洞。

不過有兩條我建議**趁呢次一齊出**,因為漏咗要再 restart 多一次:

| 建議 | 改乜 | 要 restart? | 點解唔留低次 |
|---|---|---|---|
| **N1**(建議必做) | `routes/presence.js:32` `HEARTBEAT_RATE_MAX` 30 → **300** | **要** | 30/min = 同 IP 30 部機。教會 WiFi / CGNAT 一撞就有人完全見唔到(§5c 模擬表)。呢一頁全部價值就係嗰三個數,而個 bug 專門喺人最多嗰陣發作。留低次要多一次 restart + 多一次 gate approve |
| **N2**(建議) | `usePresenceHeartbeat.js:25` `ACTIVE_SEND_DEDUP_MS` 100 → **5000** | 唔使(純 OTA) | 一個人狂切前後台就可以自己燒晒同 IP 配額。同 N1 一齊改,兩層一次過收乾淨 |
| N3 | `AdminPresenceSheet.js` silent mode 唔好 `setErr` | 唔使(純 OTA) | 順手,幾行 |
| N4 / N5 / N6 / N7 | —— | —— | **第二版再算**,全部低度 |

### 次序(**唔准倒轉**)

```
1. 改 N1(backend 常數)+ N2/N3(frontend,純 OTA)  ← 建議,唔改都 GO
2. backend restart(新 sha,deploy gate 要 approve)
3. OTA
```

**點解 restart 一定排 OTA 前**(上一輪已實測、今輪結論不變):

- OTA 先出 → 舊 backend 冇 `/api/presence/heartbeat` → 每部機每 60 秒喺
  `/tmp/hymn_backend.log` 落一行 `[access] … 404`(舊 backend 冇 A-3 排除)。
  App 側係安全嘅(`postHeartbeat` 唔睇 `res.ok`、唔 `.json()`、外面仲有
  try/catch),但會洗 log。
- OTA 先出 → admin 撳「在線」會見「讀取失敗,遲啲再試」。
- restart 先出 × 舊 client:**零影響**。今次四個 commit 冇改任何現有 route;
  `presence.js` / `routes/presence.js` 全新檔,`server.js` 呢輪一個字冇改。

### 唔使再驗嘅嘢

- users.db schema:零改動,`tryAuthenticate()` 個 `UPDATE last_seen_at` 只落
  sql.js in-memory(冇 `saveUserDb()`),同 `requireAuth.js:33-35` 現有行為
  一模一樣。我跑完成套 harness,`users.db` sha256 一個 bit 都冇變。
- Eric 五條拍板:①前台/背景分標 ②訪客只數字 ③唔顯示聽緊邊首 ④連續在線
  ⑤無歷史 —— 呢四個 commit 冇動過其中任何一條嘅實現路徑,上一輪已全 PASS。
  (④ 反而因為 P6 更加準確。)

---

## 附:harness 檔案位置

全部喺
`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/`:
`o2-backend.mjs`(20 case)、`o2-hook.mjs`(16 case)、`o2-sheet.mjs`(新舊各 8 case)、
`o2-deviceid.mjs`、`o2-nat.mjs`。三支主 harness 合共 **44 個 assert,FAIL 0**。
