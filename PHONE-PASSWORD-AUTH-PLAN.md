# PHONE-PASSWORD-AUTH-PLAN — 註冊先驗 OTP、日常登入用密碼

> 狀態:**草稿,等 Eric 拍板**(§11 有幾個決定要簽)
> 流程:Eric 拍板 → Sonnet 落地 → Opus 5 驗收(三層流程照舊)
> 日期:2026-08-01

---

## §0 背景 + 現況實測

Eric 訴求:而家每次登入都要電話 OTP(Twilio 收錢、用戶又麻煩)。改做**只有第一次
註冊先要 OTP** 驗證電話,之後日常登入用密碼;註冊時輸入密碼兩次確認,順便收埋
**姓名、性別、出生年份**。

**追加(Eric 2026-08-01,指明同呢輪一齊落地、唔准拆開兩次 OTA)**:每頁(首頁/
詩歌庫/我的)右上角加會員掣——圓圈頭像顯示姓名第一個字母,撳入會員/帳戶頁;
「我的」頁最頂嗰嚿帳戶卡(尾號1174/已同步)拎走。呢個 UI 靠本輪新收嘅「姓名」
先有字母顯示,所以綁埋一齊。詳見 §5.4。

### 0.1 現有 code 實際行為(2026-08-01 讀 code 核實)

| 檔案 | 現況 |
|---|---|
| `backend/routes/otpAuth.js` | `/api/auth/otp/request`(Twilio Verify,WhatsApp 主 SMS 後備,+852 白名單,per-phone 60s cooldown / 日 5 次,per-IP 日 10 次,全局日 100 熔斷)+ `/api/auth/otp/verify`(驗碼成功即 **upsert**:有 phone 就登入,冇就開新用戶——註冊登入合一)+ `/api/auth/otp/status` |
| `backend/routes/auth.js` | 舊 email/password 通道:register(bcryptjs cost 10)+ login(**已有 per-IP 登入失敗限速**:15 分鐘 10 次失敗鎖 429)+ `/api/auth/me` |
| `backend/lib/authSecret.js` | `JWT_SECRET` 淨係食 env,冇 fallback,冇就拒絕開機(上次 hardcode 教訓已修) |
| `backend/lib/requireAuth.js` | 每 request 由 users.db 重新 SELECT 用戶(唔齋信 token),順手更新 `last_seen_at`,role 由 DB 讀 |
| `backend/lib/userDb.js` | schema + try/catch `ALTER TABLE` 遷移 pattern;每次寫完 atomic save(tmp→rename) |
| `frontend .../AuthContext.js` | `requestOtp`/`verifyOtp`/`login`/`register`/`logout`;token 存 AsyncStorage |
| `frontend .../PhoneLoginScreen.js` | 兩步:①輸入號碼 ②輸入驗證碼。`PHONE_AUTH_ENABLED=true`,係而家預設登入方式 |
| `frontend .../AuthScreen.js` | 分流:已登入→AccountScreen;未登入→PhoneLoginScreen(可切 email form) |
| `App.js`(HomeScreen header,~L1341) | **首頁右上角其實已經有會員掣**:36px 圓形 `avatarBtn`,登入顯示 `username` 第一個字母、未登入顯示 person icon,撳落去 `onOpenAuth` 開 AuthScreen modal。Eric 見到嘅「?」係因為佢帳戶 `username` NULL → fallback 字面 `'?'`。所以 §5.4 唔係「新發明」,係抽共用 + 鋪去另外兩頁 |
| `MineScreen.js`(L67–91) | 最頂帳戶卡:avatar 圓圈(`username‖phone尾4‖'?'` 第一個字)+「尾號 1174」+「已同步/N 項等緊同步」,撳落去同樣 `onOpenAuth`。同步狀態喺 AccountScreen 入面亦有齊(sync 行 + subtitle),拆卡唔會冇咗個資訊 |
| `LibraryScreen.js` | 大字標題「詩歌庫」,**冇** `onOpenAuth` prop(App.js 而家冇傳俾佢,要加線) |

### 0.2 一個要同 Eric 講清楚嘅事實

JWT 有效期係 **30 日**,token 存喺 AsyncStorage——即係話**唔係字面上「每次開 app
都要 OTP」**,而係:登出、重裝、換機、或者 30 日 token 過期先要再驗。但 Eric 嘅
訴求依然成立:每次重裝/換機/過期都燒一次 Twilio 錢,而且冇密碼概念,用戶冇得
主動登入。呢個 plan 照做,只係唔好誤會而家日日燒錢。

### 0.3 users.db 現況(2026-08-01 實查)

```
schema: id | username | email(UNIQUE NOT NULL) | password_hash(NOT NULL) | phone | created_at | last_seen_at | role
```

| id | 身份 | 關鍵欄位 | 過渡影響 |
|---|---|---|---|
| 2 | **Eric 真帳戶(尾號1174,admin)** | `password_hash='otp-no-password'`(sentinel)、email 係 placeholder、username NULL | **冇密碼,要過渡路徑**(§6) |
| 3–6 | 測試帳戶(metest/synctest1/2/opus-verify) | 全部有真 bcrypt hash,行 email 通道 | 唔受影響 |

好消息:`username` 欄一早存在(AccountScreen 已經用佢做 displayName),「姓名」
唔使加新欄;`password_hash` 欄都一早存在。真正要加嘅只有 `gender` 同 `birth_year`。

---

## §1 目標 / 唔做嘅嘢

**做:**
1. 註冊 = OTP 驗電話(得呢一次)→ 設密碼(×2 確認)+ 姓名 + 性別 + 出生年份
2. 日常登入 = 電話 + 密碼,零 OTP、零 Twilio 成本
3. 忘記密碼 = OTP 做 reset 通道(保留,詳見 §2.3——呢個係唯一自助恢復途徑)
4. 現有 OTP-only 用戶(尾號1174)平滑過渡
5. 舊版 app(未 OTA 嘅 client)唔會即刻死
6. **三頁右上角統一會員掣**(字母頭像)+「我的」頁帳戶卡收起(§5.4,同一次 OTA)

**唔做(呢期):**
- email 通道唔剷(測試帳戶靠佢;而且係 +86 用戶將來嘅後備),但 UI 繼續收埋喺「用電郵/密碼登入」細字後面
- 唔做「改密碼」(登入後於帳戶頁改)——同忘記密碼共用 OTP 通道已經夠,想做可以下期
- 唔做 email 驗證、唔做第三方登入
- 唔郁 JWT 機制(30d expiry、requireAuth 每 request 查 DB 照舊)

---

## §2 新流程設計

### 2.1 註冊(新用戶,一世人一次 OTP)

```
①電話號碼 → /api/auth/otp/request(照舊,Twilio)
②輸入6位驗證碼 → /api/auth/otp/verify-ticket(新)
     Twilio check approved 後:
     - 呢個 phone 已註冊(有密碼)→ 422 already_registered「呢個號碼已註冊,請直接登入」
     - 未註冊 → 回 ticket(10分鐘有效,見 §3.2),前端入③
③一版過填:密碼 ×2、姓名、性別(男/女)、出生年份
     → /api/auth/register-phone(新){ ticket, password, username, gender, birthYear }
     → 建帳戶 + 發 30d JWT,直接登入
```

前端③喺本地驗「兩次密碼一致」,唔使將兩個都送上 server。ticket 過期(拖太耐先
撳註冊)→ 回 401 ticket_expired,前端顯示「驗證過期,請重新攞驗證碼」跳返①。

### 2.2 日常登入

```
電話 + 密碼 → /api/auth/login-phone(新)
  → bcrypt compare → 30d JWT
  失敗一律回 401「電話或密碼唔啱」(唔透露邊樣錯,防 enumeration)
  限速見 §3.4
```

### 2.3 忘記密碼(保留 OTP 做 reset 通道 —— 建議:要)

Eric 問「password reset 係咪要保留 OTP 通道」——**要**。理由:
- 電話號碼係唯一身份錨點(email 係 placeholder),冇 OTP 就只剩「搵 Eric 人手改 DB」
- 成本可控:reset 係罕見事件,現有 per-phone 日 5 次 cap 已經封頂
- 同註冊共用同一套 ticket 機制,backend 幾乎零額外 code

```
①電話 → otp/request ②驗碼 → otp/verify-ticket
     - 呢個 phone 有帳戶 → 回 ticket
③新密碼 ×2 → /api/auth/reset-password(新){ ticket, password, username?, gender?, birthYear? }
     → 更新 password_hash → 發 30d JWT 直接登入
```

**補完 profile(過渡用戶關鍵)**:reset-password 接受可選嘅 username/gender/birthYear,
**只喺該欄目前係 NULL 先寫入**(有值一律唔覆蓋——reset 唔係編輯 profile 嘅門)。
前端 step ③:登入前唔知帳戶缺唔缺,由 verify-ticket 回應加個 `profileComplete: bool`
(server 睇該 phone 帳戶三欄齊唔齊),唔齊就喺③一併顯示姓名/性別/年份欄。咁樣
尾號1174 行一次忘記密碼,就順便有咗名——右上角頭像(§5.4)先至有字母顯示。

注意:verify-ticket 對「已註冊」定「未註冊」嘅 phone 都發 ticket(payload 一樣,
純粹證明「呢一刻控制住呢個電話」),由 register-phone / reset-password 兩個
endpoint 自己分流:register 見已註冊就拒,reset 見未註冊就拒。一種 ticket,兩個
用途,唔使兩套 code。

### 2.4 舊 endpoint 點處理(兼容舊 client)

`/api/auth/otp/verify`(舊,驗完即發 token)**保留但改行為**:
- phone 已存在 → 照舊登入發 token(舊版 app 用戶唔會突然登入唔到)
- phone 唔存在 → **唔再 upsert 開新戶**,回 422 `use_new_flow`「請更新 app 再註冊」

即係:舊 client 嘅存量用戶照用(每次 OTP,自己成本自己燒,好少),但唔會再經舊
路開出「冇密碼、冇 profile」嘅新戶,令 §6 嘅過渡問題唔會愈滾愈大。等 OTA 鋪開
之後(睇 log 冇人叫舊 endpoint),下期先徹底落閘。

---

## §3 Backend 改動

### 3.1 密碼儲存

- **繼續用 bcryptjs cost 10**,同 `auth.js` 現役做法一致。唔轉 argon2:argon2 npm
  包係 native binding,backend 跑喺 Eric 部 Mac 用 launchd,加 native dep 會令
  `npm install`/Node 升級多個爆點;呢個 app 嘅威脅模型(單機 SQLite、幾十個用戶)
  bcrypt cost 10 綽綽有餘。
- 用 **async** `bcrypt.hash()`/`bcrypt.compare()`(唔好抄 auth.js 嘅 `hashSync`,
  cost 10 sync 會 block event loop ~80–100ms;順手唔順手改埋 auth.js 舊 code 由
  Sonnet 判斷,唔強制)。
- 明文密碼:唔落 log(而家啲 catch 淨 log `e.message`,守住呢條線)、唔存、唔回 echo。
- `JWT_SECRET` 機制照舊(env-only,`authSecret.js` 唔郁)。

### 3.2 Ticket(「電話已驗證」短期憑證)

用 JWT 自己簽,**唔使** server-side store(單機都得,但 JWT 重啟唔會冇、又唔使
清理過期紀錄):

```js
jwt.sign({ phone, purpose: 'phone_verified' }, JWT_SECRET, { expiresIn: '10m' })
```

安全要點(Sonnet 落地時要照住寫,Opus 驗收要逐條試):
1. payload **冇 `id`** → 攞去撞 `requireAuth` 會因為 `decoded.id` undefined 查唔到
   用戶而 401,天然唔係 session token;但唔好靠呢個巧合——
2. `register-phone`/`reset-password` 必須顯式驗 `purpose === 'phone_verified'`,
   而且**只認 ticket 入面嘅 phone**,request body 嘅 phone 一律唔信
3. 反方向:攞正常 session JWT 去撞 register/reset → 因為冇 `purpose` claim 被拒
4. ticket 一經使用唔使強制單次(10 分鐘窗口內重放最多係「再 reset 一次自己個
   密碼」,冇利益;單次化要 server-side store,唔值)

### 3.3 新 endpoints(全部落 `otpAuth.js`,同現有 OTP code 放埋一齊)

| Endpoint | 入 | 出 | 錯誤 |
|---|---|---|---|
| `POST /api/auth/otp/verify-ticket` | phone, code | `{ ticket, registered: bool }` | 400 bad_input / 401 bad_code / 503 not_configured |
| `POST /api/auth/register-phone` | ticket, password, username, gender, birthYear | `{ token, user }` | 401 ticket_invalid / 422 already_registered / 400 欄位驗證 |
| `POST /api/auth/login-phone` | phone, password | `{ token, user }` | 401 bad_credentials(統一文案)/ 429 too_many_attempts |
| `POST /api/auth/reset-password` | ticket, password, username?, gender?, birthYear? | `{ token, user }` | 401 ticket_invalid / 422 no_account / 400 weak_password |

`verify-ticket` 回應加 `profileComplete: bool`(該 phone 有帳戶時先有意義;無帳戶
回 `registered: false`,前端行註冊支線)。

`user` object 統一回 `{ id, username, phone, email, role, gender, birthYear }`;
`/api/auth/me` 同步加埋 phone/gender/birthYear(而家連 phone 都冇回,AccountScreen
靠登入嗰下嘅 user object,補返齊)。

### 3.4 登入限速(延伸現有機制)

現有 `auth.js` 得 **per-IP**(15 分鐘 10 次失敗)。密碼登入係 credential-stuffing
目標,單靠 IP 唔夠(攻擊者可以換 IP 集中打一個電話號碼):

- 將 `auth.js` 嘅 limiter 抽做 `lib/loginRateLimit.js`(in-memory,單機 pattern 同
  otpAuth 一致),兩個維度:
  - **per-IP**:15 分鐘 10 次失敗 → 429(現有規格照搬)
  - **per-phone(新)**:15 分鐘 5 次失敗 → 429「太多次失敗,請 15 分鐘後再試,
    或者用忘記密碼」——鎖電話唔會鎖死真用戶,因為 OTP reset 通道唔受呢個限
- `auth.js` email login 改用同一個 lib(行為不變,純 refactor);`login-phone` 用
  兩個維度
- OTP request 嗰套防濫用(cooldown/日 cap/全局熔斷)原封不動

### 3.5 欄位驗證(server-side,前端只係 UX 兜底)

| 欄 | 規則 |
|---|---|
| password | **最少 6 位**(同現有 email 通道一致;用戶群係教會弟兄姊妹,唔搞大小寫符號硬性要求——NIST 800-63B 都唔建議 complexity rules,長度+限速先係真防線)。上限 72 bytes(bcrypt 截斷位)。 |
| username(姓名) | trim 後 1–30 字,必填 |
| gender | `'male'` / `'female'` 二選一,必填(Eric 指明「男定女」) |
| birthYear | 整數,1900 ≤ year ≤ 今年,必填 |
| phone | 照舊 E.164 normalize + 白名單 |

---

## §4 DB migration

跟 `userDb.js` 現成 try/catch `ALTER TABLE` pattern,**純加欄,零破壞**:

```js
try { db.run('ALTER TABLE users ADD COLUMN gender TEXT'); } catch (_) {}
try { db.run('ALTER TABLE users ADD COLUMN birth_year INTEGER'); } catch (_) {}
```

- `username`/`password_hash`/`phone` 一早有,唔使郁
- 舊行兩個新欄係 NULL,所有讀嗰邊都要容忍 NULL(AccountScreen 已經係咁)
- **migration 喺 server 重啟時自動行**(initSchema),冇獨立 script,冇 downtime
- ⚠️ 記住 users.db 係「server process 單一寫入者」:唔可以用 CLI 直接改檔案,
  所有過渡操作(§6)都要經 server 或者配套重啟(MEMBERSHIP-PHASE2 §2.2 教訓)

**動手前備份**:`cp users.db users.db.bak-pwauth-YYYYMMDD`(另外 Phase 2 A 項嘅
每日備份 cron 應該已經行緊,Opus 驗收時順手核實)。

---

## §5 前端改動(純 JS,可行 EAS OTA,唔使新 APK)

### 5.1 `AuthContext.js`

加:`loginPhone(phone, password)`、`verifyOtpTicket(phone, code)`、
`registerPhone({ ticket, password, username, gender, birthYear })`、
`resetPassword(ticket, password)`。保留 `requestOtp`;`verifyOtp`(舊)保留俾
未 OTA 嘅…唔使,前端新舊一齊出,直接改晒,`verifyOtp` 可以刪(舊 client 舊
JS bundle 自己帶住舊 code,唔關新 bundle 事)。

### 5.2 `PhoneLoginScreen.js` 重寫

預設係**登入版面**(電話+密碼),唔再係 OTP 版面:

```
[電話號碼] [密碼]        ← autoComplete="password" / textContentType 俾密碼管理器認得
[登入]
「新用戶?註冊」 「忘記密碼?」
「用電郵/密碼登入」(細字,照舊)
```

- **註冊**:①電話 → ②OTP 碼(現有兩步 UI 照搬)→ ③一版:密碼、確認密碼、
  姓名、性別(兩粒 chip:男/女)、出生年份(numeric input,4 位)。兩次密碼唔
  一致 inline 提示,唔俾 submit。
- **忘記密碼**:①電話 → ②OTP 碼 → ③新密碼 ×2。同註冊 step ①② 共用 component。
- 422 `already_registered`(註冊撞已有號碼)→ 提示「呢個號碼已註冊」+ 一掣跳返
  登入;422 `no_account`(reset 撞未註冊)→ 提示「呢個號碼未註冊」+ 一掣跳註冊。

### 5.3 `AuthScreen.js` / `AccountScreen.js`

- AuthScreen:分流邏輯唔使點郁(PhoneLoginScreen 依然係預設)
- AccountScreen:displayName 邏輯已經係 `username || 尾號XXXX`,新註冊用戶自動
  有名;可以順手喺帳戶頁顯示性別/出生年份(display-only,唔做編輯——想改搵
  下期)

### 5.4 三頁右上角會員掣 + 「我的」頁帳戶卡收起(Eric 追加,同呢輪一齊 OTA)

**現況(§0.1 已核實)**:首頁 header(App.js 內嵌 `HomeScreen`,~L1341)已經有
一個 36px 圓形 `avatarBtn`——`username` 第一個字母大寫,NULL 就字面 `'?'`(Eric
見到嘅「?」掣就係佢),未登入顯示 `person-outline` icon,onPress=`onOpenAuth`。
所以呢項工作係**抽共用、鋪兩頁、拆一卡**,唔係起新嘢:

1. **新共用 component `src/components/AvatarButton.js`**
   - 36px 圓圈,style 照搬 App.js `hs.avatarBtn`/`hs.avatarText`(accent 底、
     background 色字),props:`onPress`
   - 內部自己 `useAuth()` 攞 user,顯示邏輯統一為:
     ```
     user && 有字母可顯 → (username || phone尾4 || '?').charAt(0).toUpperCase()
     user 但 username NULL → 尾號第一個數字(即「1」;同 MineScreen/AccountScreen
                              現成 fallback 一致,唔再顯示令人誤會嘅「?」)
     未登入 → person-outline icon(照舊)
     ```
   - 過渡用戶(尾號1174)喺行完 §2.3 忘記密碼+補完 profile 之後,自動變返
     真・字母頭像——所以呢個 fallback 只係短暫狀態,唔使做得太精緻
2. **App.js 首頁 header**:換用 `<AvatarButton onPress={onOpenAuth} />`,拆走
   inline 嗰段(行為不變,純 refactor)
3. **`LibraryScreen.js`**:App.js 要**加傳 `onOpenAuth`**(而家冇呢條線);header
   由單獨 `<Text>詩歌庫</Text>` 改成 row(標題左、AvatarButton 右),對齊跟返
   MineScreen 同款大字標題 + `insets.top` 處理,唔好郁到下面搜尋欄/chips 佈局
4. **`MineScreen.js`**:header「我的」同樣改 row 加 AvatarButton(佢本身有
   `onOpenAuth` prop);**拆走 L67–91 嘅帳戶卡**。連帶影響逐個數:
   - 「已同步/N 項等緊同步」display:AccountScreen 入面有齊(sync 行 + subtitle),
     一撳頭像就見到,唔算冇咗;MineScreen 嘅 `useOutboxLength()` 如果冇其他用途
     可以一併拆(Sonnet 落地時核實)
   - **未登入 CTA**:張卡未登入時係「登入 / 註冊+登入後可以同步最愛同清單」,
     係「我的」頁唯一顯眼登入入口。建議:**未登入先保留張卡(CTA 形態),登入
     後先收起**——完全滿足 Eric「唔好重複顯示」(佢見到嘅重複係登入態),又唔
     會令新用戶搵唔到登入。如果 Eric 想連 CTA 都拆,右上角 person icon 就係唯一
     入口(§11 決定⑥)
   - admin「貼連結加歌」行照舊唔郁
5. **AccountScreen 唔使郁**(佢係 modal 內頁,唔係 tab 頁,右上角唔加)

**驗收位(Opus,emulator)**:三頁圓掣位置/大小/色一致;未登入 person icon →
撳開登入;登入後(opus-verify,有 username)顯示字母;用 sentinel 過渡戶模擬
username NULL → 顯示尾號數字唔係「?」;「我的」頁登入態冇帳戶卡、未登入有 CTA
卡(如決定⑥揀保留);LibraryScreen 搜尋欄/chips 冇被 header 改動整跌。

---

## §6 現有用戶過渡(尾號1174)

用戶 id=2:`password_hash='otp-no-password'`(sentinel)、username NULL、admin。

- **`login-phone` 撞到 sentinel**:`bcrypt.compare(任何嘢, 'otp-no-password')` 一定
  false → 回 401,同「密碼錯」無異。**冇後門**,sentinel 字串本身唔係有效 bcrypt
  hash,冇任何輸入 compare 得過。Sonnet 唔使為 sentinel 寫特別分支——但為咗 UX,
  login-phone 失敗時**如果**該戶係 sentinel,錯誤文案改回「呢個帳戶未設密碼,
  請用『忘記密碼』設定」(422 `password_not_set`)。呢度有個 enumeration 取捨:
  會透露「呢個號碼有帳戶」——接受,因為得一個真用戶,而且攻擊者拎唔到任何
  密碼線索;Eric 唔接受就劃一 401,靠佢自己知道去撳忘記密碼。
- **過渡路徑 = 忘記密碼流程**:Eric 喺新版 app 撳「忘記密碼」→ OTP → 設密碼,
  同一版順便補埋姓名/性別/出生年份(§2.3 補完 profile 機制,只填 NULL 欄),
  一次搞掂,零人手改 DB。補完之後右上角頭像(§5.4)即刻有字母顯示;唔補嘅話
  AccountScreen 照 fallback「尾號 1174」、頭像顯示尾號數字。
- 測試帳戶(3–6)行 email 通道,完全唔受影響;`opus-verify` 係驗收專用戶照舊用
  (記憶規則:驗收用 opus-verify,唔好開新)。

---

## §7 安全清單(Opus 驗收逐條打勾)

1. [ ] 密碼只以 bcrypt hash 落 DB,`sqlite3 users.db` 肉眼核實冇明文
2. [ ] server log 冇密碼(成功/失敗/exception 三路都試)
3. [ ] ticket 攞去打 `requireAuth` 保護嘅 API → 401
4. [ ] session JWT 攞去打 register-phone / reset-password → 401(冇 purpose claim)
5. [ ] ticket 過期(改短 expiry 測)→ 401 ticket_expired
6. [ ] ticket 嘅 phone 同 body 嘅 phone 唔一致 → 以 ticket 為準(body phone 直情唔讀)
7. [ ] login-phone 錯密碼 ×5(同一 phone、唔同 IP 模擬)→ 429;OTP reset 通道唔受鎖
8. [ ] login-phone 錯密碼 ×10(同一 IP)→ 429
9. [ ] 舊 `/api/auth/otp/verify`:已有 phone 照登入;新 phone → 422 唔開戶
10. [ ] sentinel 帳戶登入 → 引導去忘記密碼,冇任何輸入可以 compare 過
11. [ ] register-phone 用已註冊 phone 嘅 ticket → 422,唔會覆蓋現有戶
12. [ ] reset-password 用未註冊 phone 嘅 ticket → 422,唔會開新戶
13. [ ] JWT_SECRET 冇設 → server 拒絕開機(regression check,authSecret.js 冇被郁過)
14. [ ] 欄位驗證:密碼 5 位 / gender 亂入 / birthYear 1800 或 2049 → 全部 400

---

## §8 Rollout 順序(兼容性驅動)

1. **Backend 先行**:新 endpoints + 舊 verify 改行為 + migration,重啟 server。
   舊 client(Eric 部機而家個版本)照樣 OTP 登入——零感知。
2. **驗收**:Opus 5 喺 emulator 用 dev build 過晒 §7 + §9 驗收位。
3. **EAS OTA 推前端**(跟 EAS-UPDATE-PLAN 流程,publish 前清場:淨 stash 指定
   file,唔好夾埋其他 session 未 commit 嘢——多 session 共用 worktree 紅線)。
4. Eric 真機收 OTA → 用忘記密碼流程設定自己密碼 → 完成過渡。
5. (下期)log 見冇人叫舊 verify → 徹底停舊 endpoint。

## §9 Rollback plan(詳細)

風險分層,邊層爆 roll 邊層:

| 層 | 爆嘅症狀 | Rollback 動作 | 數據影響 |
|---|---|---|---|
| Backend 新 endpoints | 新註冊/登入行唔通 | `git revert` backend commit(s) → 重啟 server。舊 verify upsert 行為跟住 revert 返嚟,OTP 登入全面恢復 | **零**:gender/birth_year 兩欄留喺 DB 冇人讀,無害;已設嘅 password_hash 留喺度,revert 後行 OTP 一樣登入到 |
| 前端 OTA | 新登入版面爆/UX 死路 | EAS Update republish 上一個 update(跟 EAS-UPDATE-PLAN 現成做法),client 重開 app ×2 收到 | 零:舊 bundle 叫舊 verify,backend 未 roll 嘅話已有用戶照登入(§2.4 保證) |
| DB migration | (理論上)ALTER 爆/DB 壞 | 停 server → `cp users.db.bak-pwauth-* users.db` → 起返舊 backend | 損失備份後嘅新註冊/心心/清單同步——所以備份要喺重啟前一刻做 |
| 過渡(尾號1174) | Eric reset 唔成功 | 唔使 roll:舊 verify 對已有 phone 照發 token,OTP 登入永遠係後備 | 零 |

**關鍵設計令 rollback 平價**:①migration 純加欄(向後兼容,roll code 唔使 roll
DB);②舊 OTP 登入通道對存量用戶始終有效(雙軌期);③前後端獨立 roll(任何
單邊 roll 返都係一個自洽狀態)。

**Rollback 演練要求**(Opus 驗收其中一條):喺 emulator 環境真係做一次「backend
revert + 舊 client OTP 登入」確認雙軌成立,唔好齋紙上談兵。

---

## §10 並行工作線交叉風險(同一 worktree)

而家有三條線可能同時郁 `feature/player-rebuild` 呢個 worktree:

| 並行線 | 狀態 | 同本 plan 嘅交叉 | 結論/緩解 |
|---|---|---|---|
| **Phase 2 admin** | 四個 commit 已落地,**等 Opus 驗收** | 直接相撞:兩邊都掂 `userDb.js`(initSchema)、`otpAuth.js`(role 回傳)、`AuthContext.js`、`AccountScreen.js`;驗收如果要修嘢就會同 auth 改動疊埋 | **硬性排序:等 Phase 2 驗收完(含修正 commit)先開工本 plan**。唔好兩條線一齊改 auth 檔案 |
| **Taxonomy C1–C7** | C1 已 commit,C2+ 進行中(working tree 而家有未 commit 嘅 hymns.db/worshipGroups.js/scripts) | 檔案幾乎零重疊(佢哋掂 hymns.db/admin.js/library screens;本 plan 掂 users.db/auth 檔)。真正風險:①commit 衛生——per-file `git add`,**嚴禁 `git add -A`**(已有慘痛記憶);②兩邊都會想重啟 backend server,taxonomy 夜晚仲有 grow/lyrics job | 錯開 server 重啟時間(避開夜晚 job 窗口 19:00–08:40);OTA publish 前清場核對 working tree(EAS-UPDATE-PLAN 紅線) |
| **夜晚 lyrics/grow jobs** | 每晚 19:00–08:40 行緊 | 唔掂 users.db,但 server 重啟會唔會打斷 job?(jobs 係獨立 process,detach 咗,理論上唔會) | migration 重啟揀日頭做,順手避開 |

另外:`users.db.bak-taxonomy-20260801` 呢個備份係 taxonomy 嗰邊留低嘅,唔好誤會
係本 plan 嘅備份,本 plan 要開自己嘅 `users.db.bak-pwauth-*`。

---

## §11 留俾 Eric 拍板嘅決定

1. **密碼最少幾多位?** 建議 6(同現有一致、用戶群友善,防線靠限速);嫌短可以 8。
2. **sentinel 帳戶錯誤文案**(§6):建議明示「未設密碼,請用忘記密碼」(UX 好,
   輕微透露號碼已註冊);唔接受就劃一「電話或密碼唔啱」。
3. **姓名/性別/出生年份係咪三樣都必填?** 建議必填(Eric 原話「要選埋」,而且
   註冊時唔收,之後冇編輯功能就永遠冇)。
4. **時序確認**:等 Phase 2 admin 驗收收尾先開工(§10)。
5. (提一提)而家 token 30 日,即係現況都唔係「每日 OTP」(§0.2)——確認咗解
   都照做,因為重裝/換機/過期照燒錢,同埋用戶要有密碼概念。
6. **「我的」頁帳戶卡:未登入時留唔留做 CTA?**(§5.4)建議**留**(登入後先
   收起——Eric 見到嘅「重複」係登入態);拆埋嘅話右上角 person icon 係唯一
   登入入口。

---

## §12 執行切分(拍板後交 Sonnet)

建議五個 commit,每個獨立可 revert:

1. `feat(auth): lib/loginRateLimit.js 抽出 + per-phone 維度`(auth.js refactor,行為不變 + 新維度,附手測紀錄)
2. `feat(auth): schema gender/birth_year + verify-ticket/register-phone/login-phone/reset-password + 舊 verify 停 upsert`(backend 主體)
3. `feat(auth): 前端登入/註冊/忘記密碼三流程`(AuthContext + PhoneLoginScreen 重寫 + AccountScreen 顯示)
4. `feat(ui): AvatarButton 三頁右上角 + 我的頁帳戶卡收起`(§5.4:新 component + App.js/LibraryScreen/MineScreen;依賴 commit 3 嘅姓名欄先有意義,但 code 上獨立可 revert)
5. `chore(auth): 舊 email 通道 hashSync→async`(可選,獨立細 commit)

每個 commit 只 add 自己嗰堆 file(worktree 共用紅線)。3+4 係**同一次 OTA** 推
(Eric 指明唔准拆開兩次);落地後 Opus 5 按 §7 + §5.4 驗收位 + §9 演練驗收,
先至 OTA。
