# 會員系統規劃書(MEMBERSHIP-PLAN)

> 2026-07-28 Fable 5 出稿。規劃文件,未落地;等 Dispatch 同 Eric 過完先逐 phase 交俾 Sonnet 執行。
>
> **Phase 0(§8)已落地(2026-07-28)**:`backend/lib/userDb.js` 獨立 `users.db` + atomic
> save、`backend/lib/authSecret.js`(冇 `JWT_SECRET` env 直接拒絕開機,secret 已輪替,
> 新舊 plist 都唔會 commit 真實 secret)、email/password login 加 IP 限速。已用真實
> register→重啟→login 測試過,詳情睇 git log。Phase 0 checklist 剩低「users.db 每日
> 備份 cron」未做(§5.7),未落地。
> 需求來源:Eric 確認咗六樣嘢 —— ①3000 首先開放 ②跨裝置同步最愛/清單 ③朋友家人自己註冊
> ④Eric 喺 App 入面做管理員(改歌名/分類、貼 YouTube 連結加歌) ⑤會員加好友 ⑥普通會員都可以分享清單。

---

## 0. 現況盤點 —— 有啲乜、壞咗啲乜(規劃嘅起點)

好消息:**會員系統唔係由零開始**,之前已經起咗幾件:

| 已有嘅嘢 | 狀態 |
|---|---|
| `backend/routes/auth.js` — email/password 註冊登入,bcrypt + JWT 30日 | 行到,但見下面 🔴 持久化問題 |
| `backend/routes/otpAuth.js` — 電話 OTP(WhatsApp/SMS,Twilio Verify),連防濫用限速 | code 寫好晒,**等 Eric 交 Twilio key**(`ERIC-TODO-PHONE-AUTH.md`) |
| 前端 `AuthContext` / `AuthScreen` / `LoginScreen` / `PhoneLoginScreen` | 寫好,`PHONE_AUTH_ENABLED=false` 收埋 |
| `PHONE-AUTH-PLAN.md` v2 | 已出稿:WhatsApp 為主、SMS 後備、+86 行 email 後備 |

但有兩個**地基級問題**,唔修好之前唔可以俾任何人註冊:

1. 🔴 **用戶寫入唔 persist**(HANDOFF §四 已記錄):`server.js` 開機將 `hymns.db` 讀一次入記憶體,
   `auth.js` 嘅 INSERT 寫喺記憶體嗰份,**從來冇寫返落 disk** —— backend 一重啟,註冊咗嘅用戶即刻消失。
   而家得 Eric 用緊、冇人註冊,所以未爆過;開放前必修。
2. 🔴 **JWT secret 有 hardcode fallback**(`'hymn-app-jwt-secret-2026'`,commit 咗落 git):任何人睇到 repo
   就可以自己簽個 admin token。開放前一定要轉做「env 冇 secret 就拒絕開機」,並且換過條 secret。

仲有一個架構事實影響晒成個設計:**`hymns.db` 係多寫入者共享**(夜晚 growLibrary/fetchLyrics/curate 用
`lib/hymnDb.js` 嘅 lock + atomic write;backend 就 hold 住幾份唔會 reload 嘅記憶體副本)。
用戶數據如果又擺埋入去,會同呢堆夜晚 job 爭寫入,遲早互相冚掉。所以 §2 會建議**用戶數據另開一個 DB 檔**。

---

## 1. 技術方案評估:認證用邊條路

### 三個選項

| | A. 自建(而家條路行落去) | B. Supabase(Auth + Postgres) | C. Firebase Auth / Clerk |
|---|---|---|---|
| 係咩 | 現有 bcrypt+JWT+Twilio OTP,自己 backend 簽 token | 開源 BaaS,auth+DB+API 一條龍,免費層幾慷慨 | Google/商業 SaaS 認證服務 |
| 改動量 | **細** — 80% code 已經寫好,補地基就得 | 大 — 用戶/同步數據要搬上 Supabase,backend 變兩截(歌喺 Mac、用戶喺雲) | 中大 — 要入 native SDK |
| 月費 | $0 + OTP 費(WhatsApp ~US$3/月@50人) | 免費層夠用;過咗 US$25/月起 | Firebase 免費層夠;Clerk 過 10k MAU 收費 |
| Eric 友善度 | 唔使開新帳戶(Twilio 本身要開) | 又多一個 dashboard/帳戶要管 | 要開 Google/Clerk 帳戶 |
| 同 bare workflow / sideload APK 夾唔夾 | ✅ 零 native SDK | ✅ REST 為主 | ⚠️ Firebase Phone Auth 對 sideload APK 要 fallback reCAPTCHA,體驗差(PHONE-AUTH-PLAN §1 已查證);大陸連 Google 服務直接死 |
| 大陸親友 | email OTP 後備通道照行 | Supabase 大陸連通性一般 | ❌ Google 服務大陸基本唔通 |
| 風險 | 安全嘢全部自己孭(§5 就係為咗呢個) | 多一個外部依賴;免費層政策會變 | 供應商綁定 |

### 建議:**A(自建)**,理由

1. 條路已經行咗 80%:OTP route、前端畫面、JWT 流程全部寫好,揀 B/C 等於掟晒佢哋重嚟。
2. 呢個 app 嘅用戶規模(目標朋友家人,幾十人)完全喺自建可控範圍。
3. 大陸親友係真實需求,B/C 喺呢點直接死或者半死;自建 + email OTP 後備係唯一三地(HK/海外/大陸)都通嘅路。
4. backend 本身就喺 Eric 部 Mac,數據主權簡單,唔使諗「歌喺屋企、用戶喺雲」嘅分裂架構。

代價係安全基本盤要自己搭 —— §5 逐項寫清楚,而且用戶量細,攻擊面有限(app 唔公開上架、
API 收喺 Cloudflare tunnel 後面)。

**認證通道**維持 PHONE-AUTH-PLAN 原案:電話 OTP(WhatsApp 主/SMS 後備)做主入口、
email OTP 做大陸後備、現有 email/password 過渡期保留。呢部分唔使重新拍板,等 Twilio key 就開得。

---

## 2. 數據模型設計

### 2.1 大原則:用戶數據另開 `users.db`,唔好再搭 `hymns.db` 順風車

- `hymns.db` 有成班夜晚寫入者(grow/curate/lyrics),有自己嘅 lock 協議;backend 對佢係「讀完唔 reload」。
- 用戶數據嘅寫入模式完全相反:日頭零散寫、要即時 persist、要唯一寫入者。
- 分開兩個檔之後:**`users.db` 得 server process 一個寫入者**,唔使掂 `hymnDb.js` 個 lock,
  夜晚 job 繼續唔知有會員系統存在,兩邊互不干擾。
- 實作:繼續用 sql.js(唔加 native dependency),但 `users.db` 每次寫完即刻 atomic save
  (export → 寫 tmp → rename,抄 `hymnDb.js` 現成做法)。用戶數據量細(幾十人×幾百行),
  每次寫全量 export 完全冇壓力。將來如果真係去到幾千用戶先考慮換 better-sqlite3。

### 2.2 Schema(全部落 `users.db`)

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT UNIQUE,            -- E.164;OTP 用戶主鍵性身份
  email         TEXT UNIQUE,            -- email OTP / 舊帳戶
  display_name  TEXT,                   -- 俾好友見到嘅名
  role          TEXT DEFAULT 'member',  -- 'member' | 'admin'
  password_hash TEXT,                   -- 只有舊 email/password 帳戶先有
  created_at    TEXT DEFAULT (datetime('now')),
  last_seen_at  TEXT
);

-- 最愛:一人一堆 hymn_id,細到唔使諗
CREATE TABLE favorites (
  user_id    INTEGER NOT NULL,
  hymn_id    INTEGER NOT NULL,          -- 對應 hymns.db 嘅 hymns.id(跨檔引用,app 層 join)
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, hymn_id)
);

CREATE TABLE playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  position   INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  deleted    INTEGER DEFAULT 0          -- soft delete,同步先分得清「刪咗」定「未同步」
);

CREATE TABLE playlist_songs (
  playlist_id INTEGER NOT NULL,
  hymn_id     INTEGER NOT NULL,
  position    INTEGER DEFAULT 0,
  PRIMARY KEY (playlist_id, hymn_id)
);

-- 好友:單行雙向,status 講晒故事
CREATE TABLE friendships (
  user_lo    INTEGER NOT NULL,          -- 細 id 嗰個(保證一對人得一行)
  user_hi    INTEGER NOT NULL,
  requested_by INTEGER NOT NULL,        -- 邊個發起
  status     TEXT DEFAULT 'pending',    -- 'pending' | 'accepted'
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_lo, user_hi)
);

-- 清單分享:一條 token 一個分享
CREATE TABLE playlist_shares (
  token       TEXT PRIMARY KEY,         -- 隨機 22 字元(128-bit),URL-safe
  playlist_id INTEGER NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  revoked     INTEGER DEFAULT 0
);

-- 邀請碼(開放前唯一入口,見 §7)
CREATE TABLE invites (
  code       TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  used_by    INTEGER,                   -- NULL = 未用
  created_at TEXT DEFAULT (datetime('now'))
);
```

跨檔引用(`favorites.hymn_id` → `hymns.db`)冇 foreign key 保護,處理方法:API 回傳最愛/清單時
同 in-memory hymns 做 join,揾唔到嘅(歌被 delist)就標 `unavailable`,前端顯示灰態,唔好靜靜哋跌走
—— 呢個同而家 delist 機制夾得埋。

### 2.3 舊 `users` 表(hymns.db 入面嗰個)點處理

裡面而家實際上冇真用戶(寫入唔 persist,寫咗都冇咗)。遷移動作:migration script 行一次,
如果 `hymns.db.users` 有殘留行就搬過去 `users.db`,之後舊表唔再用(留低唔剷,零風險)。

---

## 3. 跨裝置同步設計(最愛/清單)

### 3.1 策略:server 做 source of truth,本地 MMKV 降級做 cache

而家最愛/清單 100% 喺本地 MMKV(`FavoritesContext` / `PlaylistsContext`)。登入後改成:

1. **登入嗰刻做一次性合併上傳**:將本地 MMKV 嘅最愛+清單 push 上帳戶(union 合併,唔覆蓋 server 已有嘢)。
   呢下就係 Eric 無縫遷移嘅機制(§7)——佢登入嗰下,幾年儲落嘅嘢自動變成帳戶數據。
2. 之後每個寫操作(加/減最愛、清單 CRUD)**本地即時生效 + 背景 sync**:
   - 寫操作入一條 MMKV outbox queue,有網即 flush 去 API;冇網留喺 queue,下次開 app/恢復網絡再 flush。
   - UI 永遠讀本地 state —— 離線體驗同而家一模一樣,唔會「冇網就撳唔到心心」。
3. 開 app / 由背景返嚟時 pull 一次全量(數據細,一個 request 攞晒),以 server 為準覆蓋本地 cache,
   再 replay 未 flush 嘅 outbox。
4. 衝突處理:最愛係 set,天然冇衝突(add/remove 冪等);清單用 per-playlist last-write-wins
   (`updated_at` 比較),幾十人規模唔值得做 CRDT。兩部機同時改同一個清單係極罕見 case,輸嗰邊最多重做一次。

### 3.2 API(全部要 JWT)

```
GET  /api/me/data                 → { favorites:[hymn_id], playlists:[{id,name,songs,updated_at}] }
POST /api/me/favorites/:hymnId    → 加       DELETE 同路徑 → 減
POST /api/me/playlists            → 開新清單  PATCH/DELETE /api/me/playlists/:id
PUT  /api/me/playlists/:id/songs  → 全量寫入首歌列表(cap 30,同而家一致)
POST /api/me/merge                → 登入時一次性合併上傳本地數據
```

未登入用戶照舊行純 MMKV —— 同步係登入獎勵,唔係強制。呢點對「等 3000 首先開放」友善:
開放前 Eric 自己都可以先用同步(佢係第一個會員)。

---

## 4. 管理員權限機制(Eric 專用)

### 4.1 點樣標 admin

- `users.role='admin'`。**冇任何 API 可以改 role** —— 唯一途徑係 server 端一個 CLI script
  (`node scripts/setAdmin.js +852XXXXXXXX`),即係要摸到部 Mac 先做到。呢個就係最強防越權:
  攻擊面直接唔存在。
- JWT payload 加 `role`,但 admin endpoints **每次都由 DB 重新讀 role 核實**,唔信 token 裡面嗰個
  (token 30 日命,萬一要褫奪 admin 唔使等 token 過期)。

### 4.2 Backend:admin API(全部行 `requireAdmin` middleware)

```
PATCH /api/admin/hymns/:id      — 改 title/display_title/artist/category/lang/album
POST  /api/admin/hymns          — 貼 YouTube URL 加歌(見 4.4)
POST  /api/admin/hymns/:id/delist — 落架(行現有 delist 機制,唔好另起爐灶)
GET   /api/admin/invites  POST /api/admin/invites — 睇/生成邀請碼
```

- 每個 admin 寫操作 append 一行去 `backend/logs/admin-audit.log`(邊個、幾時、改咗乜),
  唔使做 UI,出事有得追。

### 4.3 🔴 設計難點:admin 寫 `hymns.db` 點樣唔同夜晚 job 打交

Admin 編輯係寫 `hymns.db`(歌庫),唔係 `users.db`。而 `hymns.db` 有 lock 協議 + backend 記憶體副本問題。方案:

1. Admin 寫入走同一套 `lib/hymnDb.js`:**攞 lock → 開檔 → 改 → saveDb → 放 lock**,
   同夜晚 script 平起平坐,永遠唔會互相冚掉。日頭 admin 改嘢基本上冇 job 行緊,lock 幾乎零等待。
2. 寫完之後要令 backend 見到:加一個 `reloadDb()`(將 server.js / home.js 嗰啲 `dbPromise` 設返 null,
   下個 request 重新由碟讀)。呢個順手解埋 HANDOFF §四「改完 DB 要手動 reload backend」嘅老問題。

### 4.4 貼 YouTube 連結加歌嘅流程

```
Eric 貼 URL → backend 用 yt-dlp 攞 metadata(title/channel/duration)
  → 過一次現有嘅非歌過濾(片長/blocklist —— 防止 admin 手快貼錯 tutorial)
  → 回顯俾 Eric 睇(App 入面 preview:歌名/團體/語言,可以即場改)
  → Eric 撳確認 → 入庫(curated=1)→ reloadDb → 即刻出現喺庫
```

過濾層對 admin 係**提示唔係攔截**(彈「呢條片睇落唔似歌,確定?」,Eric 可以硬加)——
佢係 owner,規則係幫佢唔係限佢。

### 4.5 前端 UI(最細改動版)

- `role==='admin'` 先見到:①歌曲長按 menu 加「✏️ 編輯資料」(彈 sheet 改名/團體/分類/語言)
  ②「我的」頁加一格「➕ 貼連結加歌」③編輯 sheet 內有「落架呢首」。
- 唔另起「管理後台 tab」—— Eric 日常係聽歌途中見到錯就順手改,埋位喺歌曲 context 最啱。

---

## 5. 安全/私隱基本盤(由零搭起,開放前逐項剔)

| # | 項目 | 做法 |
|---|---|---|
| 1 | **JWT secret** | 開機時 env 冇 `JWT_SECRET` 就直接 `process.exit`(而家嘅 hardcode fallback 係漏洞);Eric 部 Mac 嘅 launchd plist 放一條 64 字元隨機 secret;因為舊 secret 上過 git,一定要用新嘅 |
| 2 | 密碼 | 已用 bcrypt(10 rounds)✅;新用戶行 OTP 根本冇密碼,長遠密碼路淡出 |
| 3 | **登入限速** | OTP 已有(每號碼 5/日、每 IP 10/日、全局熔斷)✅;email/password login 路要補:每 IP 每 15 分鐘 10 次失敗即 429(in-memory 夠) |
| 4 | Token 管理 | JWT 30 日,無 refresh(用戶量細,過期重登入一次 OTP 可接受);token 只存 AsyncStorage(現狀);登出即刪 |
| 5 | 傳輸 | 已經全程 HTTPS(Cloudflare named tunnel)✅ |
| 6 | 輸入衛生 | 全部 SQL 已用 prepared statement ✅ 保持;display_name 限 20 字元、strip 控制字元 |
| 7 | **users.db 備份** | 每日 cron copy 去 `backend/backups/users-YYYYMMDD.db` 保留 14 日(用戶數據唔似歌庫,冇得重建;學過 Auto Backup snapshot 嗰課,呢啲嘢要自己揸手) |
| 8 | 私隱最小化 | 只收電話/email + 自改嘅 display_name,冇其他個人資料;好友先見到 display_name,電話號碼永遠唔會俾其他會員睇到 |
| 9 | API 唔好裸奔 | `/api/me/*`、`/api/admin/*`、`/api/friends/*` 全部 JWT 驗證;`/api/internal/*` 加淨係 localhost 先答(而家 tunnel 後面全公開) |
| 10 | 錯誤訊息 | 登入失敗統一講「電話/驗證碼唔啱」,唔透露號碼有冇註冊過(防 enumerate) |

---

## 6. 社交功能範圍(MVP 幾深)

### 6.1 加好友 —— 要對方 confirm 先算(拍板建議)

- 流程:A 搜 display_name 或者入電話號碼 → 發請求(`pending`)→ B 喺「我的」頁見到紅點 →
  接受(`accepted`)/ 唔理。**唔做**:拒絕通知(唔理就算)、block 名單(得幾十個親友,有事 Eric admin 落手)、
  好友動態 feed(超出需求)。
- 點解要 confirm:分享清單將來可以有「好友先睇到」選項,冇 confirm 嘅「好友」承載唔起任何權限語義。
- 搵人方式:電話號碼精確配對為主(親友互相有電話,天然);display_name 模糊搜尋次要。
  防 enumerate:號碼搜尋只答「有/冇註冊」俾已登入用戶,配 per-user 限速(每日 20 次)。

### 6.2 分享清單 —— 連結制,唔綁好友(拍板建議)

- **MVP:share token 連結**。清單頁「分享」掣 → 生成 `https://api.god-music.com/p/<token>` →
  行系統 share sheet(WhatsApp/Signal 是但)。
- 收到嘅人:①裝咗 app → 開連結入 app 睇清單,一撳「儲存做我嘅清單」(copy 一份,之後各自修改,唔係 live 同步)
  ②未裝 app → 網頁 fallback:一頁簡單清單預覽 + 「下載 App」掣(backend 本身識 serve APK,呢頁順手做埋拉新入口)。
- 點解揀連結制唔揀「好友先睇到」:親友分享場景 99% 係「WhatsApp 掟個 link 入家庭群組」,
  連結制先接得住「收嘅人未係會員」呢個現實;好友可見權限做 Phase 4 增強,唔阻 MVP。
- Token 128-bit 隨機,可以撤銷(revoked=1);知道 link = 睇到清單名+歌單,冇其他個人資料,風險可控。

---

## 7. 上線/遷移:點樣唔影響 Eric 而家嘅使用

1. **Eric 係 user #1 兼 admin**:Twilio key 一到,佢部真機登入(OTP)→ 登入流程自動將 MMKV 本地
   最愛/清單合併上傳(§3.1 第 1 步)→ 部 Mac 行 `setAdmin.js` 標佢做 admin。
   佢嘅使用體驗**零改變**(照舊開 app 聽歌,只係多咗個帳戶膊住啲數據),同埋由此以後
   唔再驚重裝/Auto Backup 食數據(2026-07-25 嗰單嘢從此絕版)。
2. **未登入永遠用得**:登入唔係牆。唔登入 = 現狀(本地數據、冇同步冇社交)。親友唔想搞帳戶都聽到歌。
3. **開放閘門 = 邀請碼,唔係日期**:`REGISTRATION_MODE=invite`(env):註冊要邀請碼(admin 喺 App 生成,
   WhatsApp 發俾親友)。3000 首達標 → Eric 話開就開始派碼。呢個設計令「幾時開放」變成 Eric 派唔派碼嘅決定,
   唔使改 code 唔使出 build。將來想全開就切 `REGISTRATION_MODE=open`。
4. **舊 email/password 帳戶**:實質冇(寫入唔 persist),唔使遷移;登入頁過渡期保留 email 入口俾大陸親友行 email OTP。

---

## 8. 分階段實作路線圖(逐個 phase 交 Sonnet,每個獨立可驗收)

### Phase 0:地基修復(唔依賴 Twilio,即刻做得)＜半日
1. 開 `users.db`(schema §2.2)+ 寫入即 atomic save;auth 路由全部搬過去
2. `JWT_SECRET` 冇 env 即拒絕開機;Eric plist 落新 secret
3. email/password login 補限速(§5.3)
4. `users.db` 每日備份 cron(§5.7)
- **驗收**:register → restart backend → login 照入到(而家係入唔到,呢個就係修復證明)

### Phase 1:登入 + 跨裝置同步(等 Twilio key;email OTP 可以先行)1-2 日
1. 同步 API(§3.2)+ 前端 Favorites/PlaylistsContext 改造(outbox + pull-on-open + 登入合併上傳)
2. `setAdmin.js`;Eric 真機登入、數據上帳戶、標 admin
3. `PHONE_AUTH_ENABLED=true`(key 到咗先)/ email OTP 通道(PHONE-AUTH-PLAN §4)
- **驗收**:Eric 部機 A 加最愛 → 部機 B(或重裝)login 見到同一堆嘢

### Phase 2:管理員功能 1-2 日
1. `requireAdmin` + admin API + audit log(§4.2)
2. hymns.db 寫入行 lock + `reloadDb()`(§4.3 —— 呢步要小心,係同夜晚 job 嘅交界)
3. 前端:長按編輯 sheet + 貼連結加歌 + 落架掣(§4.5)
- **驗收**:Eric 喺 App 改一首歌名 → 其他裝置刷新即見;貼一條 YouTube link → 首歌入庫播到

### Phase 3:分享清單 1 日
1. share token API + `/p/<token>` 網頁 fallback + App 內「儲存副本」
- **驗收**:Eric 分享個清單入 WhatsApp,另一部機開 link 儲存到

### Phase 4:好友 + 邀請碼開放 1-2 日
1. friendships API + 「我的」頁好友 UI(§6.1)
2. invites 表 + 註冊閘(§7.3)+ admin 生成邀請碼 UI
3. (可選增強)清單分享加「好友先睇到」選項
- **驗收**:兩個測試帳戶行完 請求→接受→互見 display_name;冇邀請碼註冊唔到

排序邏輯:0/1 係 Eric 自己即刻受益(同步+防數據丟失),2 令佢管理歌庫效率大增(配合谷去 3000 首),
3/4 先係俾人用嘅嘢 —— 啱好對齊「3000 首先開放」嘅時間線,唔使趕。

---

## 9. 要 Eric 拍板嘅嘢(過文件時問)

1. **認證路線**:同唔同意行 A(自建,即係而家條路行落去)?(§1;推薦 A)
2. **Twilio key**:`ERIC-TODO-PHONE-AUTH.md` 嗰幾步(開戶+綁卡+抄 key)幾時做?
   未有 key 之前 Phase 1 可以先行 email OTP 頂住,但親友體驗最好始終係 WhatsApp。
3. **加好友要對方接受**先算好友 —— OK?(§6.1;推薦要)
4. **分享清單行連結制**(WhatsApp 掟 link,對方唔係會員都睇到、可以儲存副本)—— OK?(§6.2;推薦係)
5. **開放方式用邀請碼**(3000 首後 Eric 自己派)—— OK?(§7.3;推薦係)
6. display_name 規則:註冊時要唔要即刻改名(定係預設「用戶XXXX」之後先改)?(小事,預設後者)
