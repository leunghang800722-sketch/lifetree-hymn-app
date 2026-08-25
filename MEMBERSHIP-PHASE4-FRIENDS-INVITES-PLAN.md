# 會員系統 Phase 4:加好友 + 邀請碼開放(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN)

> 2026-08-04 Fable 5 出稿。Eric 拍板後交 Sonnet 5 執行,完成後 Opus 5 驗收。
> 母規劃:`MEMBERSHIP-PLAN.md` §6.1 / §7.3 / §8 Phase 4。呢個係會員系統**最後一個 phase**。
>
> **✅ Eric 已拍板(2026-08-04),§8 六條全跟推薦**:①B 所有會員都生成得(每人 5 個
> 未用 quota)②係,用碼註冊自動同派碼者做好友 ③B 好友睇到對方分享中嘅清單
> ④有拒絕掣(靜靜刪走,對方唔知)⑤封 email 註冊側門 ⑥入口跟建議(好友=「我的」頁
> 第 3 粒 chip 帶紅點;邀請朋友=帳戶頁一行)。建議默認全部照落。**本文件而家係
> 執行規格**,Sonnet 5 照 §7 四個 commit 做,Opus 5 照 §7 checklist 驗收。
>
> **✅ 全套上線(2026-08-04)**:四個 commit `80749db`/`9770a1b`/`753d25f`/`39d293b`
> + Opus 驗收 followup `25e0572`(登出好友 tab 殘留私隱 bug + 三個 UX polish)。
> Backend restart 行 gate(approved sha 688c749,15:59),`REGISTRATION_MODE=invite`
> 生效,email 註冊側門已封。Sonnet 因 gate 卡髒 tree 零自驗,改由 Fable 5 親自跑
> 46 項 API 測試全 PASS;Opus 5 emulator 首輪十三項全 PASS(揪出登出殘留 bug)+
> 重驗四項全 PASS。OTA update group `51c1e39e-5f06-426e-8931-09d754f1ee32`
> (runtime 2,production,commit 25e0572)。測試帳戶 phase4-verify-a/b/c/d/email/
> invited(id 14-18,20,密碼喺 agent 報告)+ probe 殘留 id 19 留喺 users.db 做
> regression 用;a 持 4 個未用邀請碼。**會員系統六項需求至此全部落地。**
>
> 範圍(2026-07-28 拍板):①會員之間加好友(要對方 confirm,唔係單方面加)
> ②邀請碼系統:`REGISTRATION_MODE=invite` 控制開放註冊,開閘俾 Eric 嘅朋友家人
> (3000 首 gate 早已 passed,而家 4700+ 首,隨時開得)。
>
> 前置狀態:Phase 0(地基)→1(登入+同步)→2(Admin)→3(分享清單)全部上線。
> 電話+密碼登入(PHONE-PASSWORD-AUTH-PLAN)2026-08-02 上線,係而家唯一新用戶註冊路。

---

## 0. 現況盤點 + 五個關鍵發現(影響成個設計)

### 0.1 已有嘅地基(啱啱好夠用)

| 嘢 | 位置 | 對 Phase 4 嘅意義 |
|---|---|---|
| `users.db`:`users` 表有 `phone`(E.164)、`username`(顯示名)、`role`、`gender`、`birth_year` | `backend/lib/userDb.js` | 好友顯示名 = `username`;電話配對搵人嘅 key 一早有;`initSchema()` 加表零遷移 |
| 註冊流程:OTP verify-ticket → register-phone(ticket 制) | `backend/routes/otpAuth.js` | 邀請碼閘就係喺呢條流程加一個欄 + 一步預檢,唔使起新流程 |
| `requireAuth`(每 request 由 DB 重讀 user/role)+ `requireAdmin` | `backend/lib/` | friends/invites API 直接掛 |
| 三款限速 pattern:`loginRateLimit.js`(失敗計數)、`me.js` per-user 60/min、`share.js` per-IP + sweep eviction | backend | 邀請碼防 brute force / 好友防 spam 全部照抄,唔使發明新嘢 |
| `playlist_shares` 表 + `GET /api/p/:token` + `SharedPlaylistSheet` | Phase 3 | 「好友頁睇對方分享中嘅清單」可以**零新讀取面**咁重用(§1.4) |
| 「我的」頁 chips row(最愛/我嘅清單/admin 兩粒),已經係 horizontal ScrollView | `MineScreen.js` | 「好友」tab 有現成落腳位,加一粒 chip 就得 |
| `AccountScreen`(頭像 modal 內頁)+ `AvatarButton` 三頁統一 | PHONE-PASSWORD-AUTH §5.4 | 「邀請朋友」入口擺呢度 |
| admin audit log(`appendAudit`)+ deploy gate(`ops/deploy/`) | Phase 2 / DEPLOY-GATE | 邀請碼生成/使用寫 audit;backend restart + OTA 照行 gate |
| 測試帳戶:opus-verify、phase3-verify-a/b(users.db 度) | Phase 2/3 遺產 | 好友流程要兩個帳戶對玩,現成有,唔使開新 |

### 0.2 🔴 發現一:而家註冊係「裸開」—— REGISTRATION_MODE 係新嘢,唔係現有 env

讀晒 `otpAuth.js`/`auth.js`/`server.js`,**冇任何註冊閘存在**:

- `POST /api/auth/register-phone`:任何人過到 +852 OTP 就開到戶。
- 更嚴重:**舊 email 通道 `POST /api/auth/register` 完全冇閘冇 OTP 冇限速**——
  知道 `api.god-music.com` 嘅人 curl 一下就開到帳戶、攞到 30 日 JWT,可以寫
  favorites/playlists、食 `/api/me` 資源。而家冇俾人搞過純粹係因為 app 冇公開
  上架、冇人知條 URL。
- 即係話 `REGISTRATION_MODE=invite` 唔係「由 open 切去 invite」,係**由裸奔切去
  有閘**。落閘同時要封埋 email register 呢條側門(§2.5),唔係邀請碼形同虛設。

### 0.3 發現二:Phase 4 全部前端改動純 JS —— 冇 Phase 3 嗰種 native 限制,OTA 推晒得

逐樣核過:好友 UI、邀請碼註冊步、生成/分享邀請碼(`Share.share` 純文字,Phase 3
已用緊)全部係 JS。**唔使新 APK,唔使等 versionCode 53**。唯一會引入 native 依賴
嘅係 QR code(下條),所以唔做。

### 0.4 發現三:QR code 加好友/邀請 —— 唔做(要新 APK,冇必要)

`package.json` 冇 `react-native-svg`,任何 QR 生成庫(`react-native-qrcode-svg` 等)
都要拖佢入嚟 = native dependency = 新 APK。而目標用戶係 Eric 嘅親友:**佢哋本身
互相有電話號碼、喺 WhatsApp 度傾偈**——電話配對加好友 + WhatsApp 發碼已經係最短
路徑,QR 係為做而做。刻意唔做,寫入 §6 scope 邊界。

### 0.5 發現四:冇 push notification 基建 —— 好友請求靠 in-app 紅點

app 冇 FCM/expo-notifications(得 RNTP 媒體通知,唔係呢家嘢)。好友請求通知機制:
「我的」頁「好友」chip 帶紅點 badge,入 tab 先見到請求列表(§3.2)。對方唔開 app
就唔知有請求——親友場景可接受(現實係 WhatsApp 會同步講「我 add 咗你」)。
push 基建係另一個 project,唔屬 Phase 4(§6)。

### 0.6 發現五:邀請碼要喺「燒 OTP 錢之前」驗

Twilio OTP 係真金白銀(SMS pumping 防護嗰套就係為咗佢)。如果註冊流程行到最尾
先發現邀請碼唔啱,嗰條 OTP 就白燒。所以流程設計係**邀請碼行第一步**(§2.4):
先過 `invite-check` 預檢先俾入電話步。預檢唔係授權(真正消費喺 register-phone
原子做),純粹慳錢 + UX。

---

## 1. 好友系統設計

### 1.1 Data model(落 `users.db`,`initSchema()` 加,`CREATE TABLE IF NOT EXISTS` 零遷移)

```sql
-- 一對人得一行:user_lo < user_hi(app 層保證,入表前 sort)。
-- status 講晒故事:pending(等 user_hi/user_lo 邊個唔係 requested_by 嗰個應)、accepted。
-- 拒絕/解除好友 = 刪行(唔留 declined 狀態,§4-4 解釋)。
CREATE TABLE IF NOT EXISTS friendships (
  user_lo      INTEGER NOT NULL,
  user_hi      INTEGER NOT NULL,
  requested_by INTEGER NOT NULL,          -- 邊個發起(∈ {user_lo, user_hi})
  status       TEXT DEFAULT 'pending',    -- 'pending' | 'accepted'
  created_at   TEXT DEFAULT (datetime('now')),
  responded_at TEXT,                      -- accept 嗰刻先有
  PRIMARY KEY (user_lo, user_hi)
);
```

跟 Phase 1/3 一貫做法:冇 FOREIGN KEY(sql.js 唔 enforce),靠 app 層驗;
每個寫操作完即 `saveUserDb(db)`(users.db 單一寫入者,唔掂 hymns.db lock)。

### 1.2 搵人方式:電話號碼精確配對(唯一方式)

- 親友互相有電話係天然事實(母 plan §6.1 拍板方向)。
- **唔做** display_name 模糊搜尋:幾十人規模冇需要,而且係 enumeration 面。
- **唔做** QR / 加好友深連結(§0.4)。
- 隱私規則(§5-4/5 詳細):lookup 只答「有/冇 + 關係狀態」,**唔答名**;
  對方個名要等到 ①佢向你發請求(你要知邊個先識答應)或者 ②成為好友之後先見到。

### 1.3 API(新 route file:`backend/routes/friends.js`,自己逐條掛 requireAuth,跟 share.js 唔靠掛載次序)

```
POST /api/friends/lookup        { phone }
  → E.164 normalize(抄 otpAuth normalizePhone)
  → { found: bool, relation: 'none'|'self'|'friends'|'pending_out'|'pending_in' }
  → 唔回 username、唔回 user id(id 喺 request 成功後先攞到)
  → per-user 限速:每日 20 次(§5-4)

POST /api/friends/request       { phone }
  → 搵唔到 / self → 400;已係好友 / 已有 pending_out → 冪等回現狀
  → 對方本身有 pending 請求緊你(pending_in)→ 直接變 accepted(互相想加,唔使兩重 confirm)
  → 否則 INSERT pending
  → per-user 限速:每日 10 個新請求;未應嘅 outgoing 上限 20(DB 數,persistent)

GET  /api/friends
  → { friends:  [{ user_id, username }],
      incoming: [{ user_id, username, created_at }],     ← 見到請求者個名(要決定接唔接受)
      outgoing: [{ user_id, phone_tail, created_at }] }  ← 只有尾4(你自己打嘅號碼),唔回名
  → 「好友」tab 開頁 + badge 數字都係呢條

POST   /api/friends/:userId/accept    → pending(requested_by=對方)先 accept 得
DELETE /api/friends/:userId           → 一 API 三用:拒絕請求 / 收回自己嘅請求 / 解除好友,全部刪行
```

回應**永遠唔出電話號碼**(除咗 outgoing 嘅尾4,嗰個號碼本身係請求者自己打入嚟嘅);
`username` NULL 就 fallback「用戶」(sentinel 過渡戶理論上唔會行到呢度,佢已補完 profile)。

### 1.4 好友之間有咩功能(Phase 4 範圍,§8 問題3)

**推薦:關係本身 + 一樣好抵嘅嘢——好友頁睇到對方「分享中」嘅清單。**

- 「分享中」= 對方喺 Phase 3 生成過 share token 嘅清單(`playlist_shares`
  revoked=0 + playlist deleted=0)。呢啲清單**本身已經係 link-public**(邊個有
  link 邊個睇到),俾好友喺 app 內見到一個列表**零新增私隱面**。
- 實作平到笑:`GET /api/friends/:userId/shares` → 驗 accepted friendship →
  回 `[{ token, name, song_count }]` → 前端撳入去行**現成** `GET /api/p/:token`
  + `SharedPlaylistSheet`(睇/播/儲存副本全部現成)。Backend 一條 route,
  前端一個 list 畫面,冇新同步邏輯。
- 咁好友關係第一日就有意義:「加咗阿媽做好友 → 見到佢分享緊嘅詩歌單 → 一撳照播」,
  而唔係加完得個名喺度。
- **唔係**「好友睇到我全部清單」——冇分享過嘅清單照舊私人。將來想做
  per-playlist「好友可見」權限,friendships 呢張表就係地基(母 plan §6.1 講嘅
  「權限語義」),但嗰個係將來(§6)。

如果 Eric 覺得連呢樣都唔要(純關係),就剷 §1.4 呢條 route + 前端嗰頁,
其他設計一律不變。

---

## 2. 邀請碼系統設計

### 2.1 Data model

```sql
CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,            -- normalize 後形態(大寫、冇連字號),例:'K7NMWP4E'
  created_by INTEGER NOT NULL,
  used_by    INTEGER,                     -- NULL = 未用;一次性,用完即廢
  used_at    TEXT,
  revoked    INTEGER DEFAULT 0,           -- admin 撤銷用
  created_at TEXT DEFAULT (datetime('now'))
);
```

- **一次性**:一個碼開一個戶。想邀請三個人就生成三個碼——邊個碼邊個人用咗
  一目了然,亦係 auto-friend(§2.6)嘅前提。
- **永久有效,冇過期時間**:親友節奏慢(「下個月見到姨媽先同佢講」),過期制
  淨係製造「個碼死咗」嘅客服麻煩。防濫用靠一次性 + quota + admin revoke,唔靠時限。
- **格式**:8 字元,alphabet 去晒易撈亂字符(`23456789ABCDEFGHJKMNPQRSTUVWXYZ`,
  31 字元,冇 0/O/1/I/L),`crypto.randomBytes` 生成 ≈ 39.6-bit。顯示/分享時
  格式化做 `K7NM-WP4E`,輸入時 strip 連字號+空格+統一大寫。WhatsApp 發字、
  口講、人手打全部 OK。39-bit + §5-1 限速,brute force 冇可能(計數喺 §5-1)。

### 2.2 邊個生成得(§8 問題1)

**推薦:所有已登入會員都生成得,每人上限 5 個「未用未撤銷」碼;admin 冇上限。**

- 理由:開放嘅目的係「Eric 嘅朋友家人入嚟」,但親友網絡係一環扣一環——
  表哥入咗嚟,表哥個女想入,唔通次次都要經 Eric?會員自己派碼先似「家人拉家人」。
- 風險可控:①註冊本身仲有 +852 OTP 白名單呢重硬閘(邀請碼唔係唯一防線)
  ②每人 5 個未用碼 cap 住派碼速度 ③`invites.created_by` 全記錄,admin 隨時
  睇晒邊個派咗幾多、revoke 邊個 ④邀請鏈 = 好友鏈(§2.6),每個新人都掛喺
  一個現有會員名下,唔會有「唔知邊度嚟」嘅人。
- 如果 Eric 想穩陣起步:揀 admin-only,API/UI 一樣起晒,只係生成權限收窄
  (`requireAdmin`),第日想放開改一行。兩個選項起嘅嘢 95% 一樣。

### 2.3 API

```
POST /api/me/invites            [requireAuth]
  → member:數「未用未撤銷」碼,≥5 → 422 quota_full「用晒先再生成」;admin 唔數
  → 生成 code,INSERT,回 { code: 'K7NM-WP4E' }(display 格式)
  → 寫 admin-audit log(invite_created,邊個生成)

GET  /api/me/invites            [requireAuth]
  → 自己生成嘅碼:[{ code, used: bool, used_by_name, created_at }]
  → used_by_name 只喺「用咗嘅人而家係你好友」先回名,否則淨係 used: true(§5-5)

GET  /api/admin/invites         [requireAdmin]   → 全部碼 + created_by/used_by 概況
POST /api/admin/invites/:code/revoke [requireAdmin] → revoked=1(未用先 revoke 得)

POST /api/auth/invite-check     [公開,唔使 auth]  { code }
  → { valid: bool }(唔透露「用咗」定「唔存在」定「revoked」——一律 invalid,no oracle)
  → per-IP 限速:15 分鐘 10 次(§5-1);mode=open 時一律回 { valid: true }
```

### 2.4 REGISTRATION_MODE 點接落現有註冊流程

**Env**:`REGISTRATION_MODE` = `'open'` | `'invite'`,boot 時讀一次。
**冇設 = `invite`(fail-closed)**——寧願 Eric 未派碼前冇人註冊到,好過 env
漏咗設變返裸奔(§0.2)。Eric 部 Mac launchd plist 加一行(同 `JWT_SECRET` 一齊)。

`GET /api/auth/otp/status` 回應加 `registrationMode` 欄——前端靠佢決定註冊
流程使唔使顯示邀請碼步,將來切 `open` 唔使再 OTA。

**註冊流程(invite mode)**:

```
⓪ 輸入邀請碼 → POST /api/auth/invite-check → valid 先入①(§0.6:燒 OTP 錢之前先驗)
① 電話號碼 → otp/request(照舊)
② OTP 碼 → otp/verify-ticket(照舊)
③ 密碼×2 + 姓名 + 性別 + 出生年份(照舊)
   → POST /api/auth/register-phone { ticket, inviteCode, password, username, gender, birthYear }
   → server 原子咁:驗 ticket → 驗欄位 → 驗碼(存在、未用、未 revoked)
     → INSERT user → UPDATE invites SET used_by/used_at → INSERT friendship(§2.6)
     → saveUserDb 一次過
   → 碼無效/已用 → 422 invite_invalid / invite_used,前端跳返⓪(§4-6)
```

- `invite-check` 只係預檢;**真正消費喺 register-phone**,同開戶同一個寫入批次
  (sql.js 單寫入者、單 process,天然冇 race;都要 SELECT used_by IS NULL 先
  UPDATE,防雙擊重放)。
- mode=`open` 時:register-phone 唔要求 `inviteCode`(有送都唔理),前端跳過⓪。
- **忘記密碼 / 登入 / 現有用戶完全唔受影響**——邀請碼淨係閘「開新戶」呢一下。

### 2.5 側門一齊封:舊 email register(§0.2)

`invite` mode 下 `POST /api/auth/register`(email 通道)直接回 422
`registration_closed`「而家要邀請碼註冊,請用電話註冊流程」。

- **唔係**加邀請碼支援落 email 通道——嗰條係 legacy 路(測試帳戶用,前端收埋
  喺細字後面),冇 OTP 冇限速,俾佢收埋碼等於留返個冇電話驗證嘅開戶後門。
- 現有 email 帳戶(opus-verify 等)**登入照舊**,淨係封「開新戶」。
- 將來大陸親友 email OTP 通道(PHONE-AUTH-PLAN §4)真係起嗰陣先設計佢嘅邀請碼
  接法,而家嗰條通道根本未存在。

### 2.6 邀請 = 自動好友(§8 問題2)

**推薦:用邀請碼開戶成功嗰刻,自動同 `created_by` 成為好友(status 直接
`accepted`,唔使 confirm)。**

- 派碼係實名動作:你 WhatsApp 個碼俾表妹,你就係想同佢喺 app 有關係——
  再叫兩邊行一次「請求→接受」係行禮如儀。
- 新人第一日開 app 就有至少一個好友(至少係邀請佢嗰個人),好友 tab 唔會
  空到唔知有咩用;配 §1.4,即刻見到邀請人分享緊嘅清單——「入嚟就有嘢聽」。
- 實作:register-phone 消費碼嗰下順手 INSERT friendship(accepted,
  requested_by=created_by)。唔想要呢個行為就刪呢三行 code,零連鎖影響。

### 2.7 生成/分享 UI(前端)

- **入口:AccountScreen 加一行「邀請朋友加入」**(所有登入會員見到;如 §2.2 揀
  admin-only 就 `isAdmin` 先見)。「我的」頁唔加 chip——chips 係內容 tab,
  邀請係帳戶動作,擺 AccountScreen 啱位。
- 撳入去:簡單 sheet,列自己啲碼(未用/已用邊個用咗),「＋生成新碼」掣,
  每個未用碼有「分享」掣 → `Share.share` 純文字:

  ```
  我邀請你用 God Music 詩歌 App 🎵
  下載(Android):https://api.god-music.com/downloads/app.apk
  註冊時輸入邀請碼:K7NM-WP4E
  ```

- **唔做** `/i/<code>` 邀請 landing page:WhatsApp 文字已經送到碼+下載 link,
  多整一頁公開網頁係新攻擊面冇新價值。(App 名跟 BRAND-GODMUSIC 進度,文案
  落地時用當時定案名。)

---

## 3. 前端(React Native)—— 好友部分

### 3.1 「我的」頁加「好友」chip(§8 問題6)

- chips row 加第三粒 tab:`好友`(icon `group`),**登入先顯示**(未登入本身
  有 CTA 卡引導登入,唔使多個入口)。admin 照舊多兩粒,ScrollView 已經係
  horizontal,爆闊度冇問題。
- **紅點 badge**:incoming 請求 >0 就喺 chip 右上角細紅點(唔出數字,幾十人
  規模冇必要)。數據嚟源:「我的」頁 focus 時 call `GET /api/friends`(帶
  cache,唔好 spam;me.js 60/min 限速上限好鬆,呢個用量九牛一毛)。

### 3.2 「好友」tab 內容(三段式,一個 FlatList 搞掂)

```
[＋加好友]                          ← ListHeader,同「＋新播放清單」同款視覺
── 好友請求(N)──                   ← incoming 有先出呢段
  [頭像字母] 陳大文        [接受] [✕]
── 我嘅好友 ──
  [頭像字母] 阿媽              [⋯] → Alert:睇分享清單 / 解除好友
  [頭像字母] 表哥              [⋯]
── 等緊對方接受 ──                  ← outgoing 有先出
  尾號 5678(等緊接受)      [收回]
```

- 「＋加好友」→ 輸入電話 sheet → `lookup` → `found:false`「呢個號碼未註冊,
  可以send個邀請碼俾佢」/ `relation:'friends'`「已經係好友」/ OK →「發出請求?」
  → `request` → toast「請求已發出」。
- 接受 → row 即時搬去好友段;✕/收回/解除 → `DELETE /api/friends/:userId`
  (解除好友要二次確認 Alert,同刪清單一致做法)。
- 撳好友行(或 ⋯ → 睇分享清單)→ `GET /api/friends/:userId/shares` →
  簡單列表(清單名 + N 首)→ 撳入去開現成 `SharedPlaylistSheet`(§1.4)。
  對方冇分享中清單就 empty state「佢未有分享緊嘅清單」。
- 好友功能全部要登入,呢個 tab 本身登入先見到,唔使逐個動作再驗。

### 3.3 註冊流程加邀請碼步(`PhoneLoginScreen.js`)

- 開註冊支線時先 call `otp/status`(而家已經 call 緊佢決定登入方式)攞
  `registrationMode`;`invite` 先插⓪:一格輸入(自動大寫、容忍連字號/空格)
  +「檢查」→ `invite-check` → pass 先去電話步。
- 422 `invite_invalid`:「邀請碼唔啱,請問返邀請你嗰位朋友」;
  register 尾段 422 `invite_used`:「呢個邀請碼啱啱俾人用咗」跳返⓪(§4-6)。
- `registerPhone()` (AuthContext) 加 `inviteCode` 參數,原有欄位不變。

---

## 4. 邊界 case(逐條答)

| # | Case | 行為 | 點解咁設計 |
|---|---|---|---|
| 1 | A request B,B 都 request A | 第二個 request 直接變 accepted | 互相想加,兩重 confirm 係行禮如儀(§1.3) |
| 2 | 重複 request 同一人 | 冪等,回現狀,唔重複 INSERT | pending 只有一行(PK 保證) |
| 3 | B 拒絕咗,A 再 request | 得(刪行後可再開),受每日 10 個 cap | 唔留 declined 狀態:親友場景「嗰陣撳錯拒絕」要有得翻身;真騷擾有 cap + admin(§5-3) |
| 4 | 解除好友後再加 | 得,重新行 request→confirm | 同上,刪行制天然支持 |
| 5 | 對方唔理個請求 | pending 一直喺度,A 見「等緊接受」,可收回 | 冇過期、冇催促通知——唔理就係答案(母 plan §6.1) |
| 6 | 邀請碼⓪過檢,③先俾第二個人用咗 | register 回 422 invite_used,跳返⓪;嗰條 OTP 燒咗 | 預檢唔係鎖碼(鎖要 TTL/釋放一堆狀態機);同一個碼兩個人同時註冊係極罕見 case,講清楚就算(§0.6) |
| 7 | 生成者俾 admin 除名 admin / revoke 碼 | 未用碼 revoked=1 即失效;已開嘅戶不受影響 | 碼係開戶門票,唔係持續憑證 |
| 8 | `REGISTRATION_MODE` env 冇設 | 當 `invite`(fail-closed) | §2.4;寧靜默閂閘,唔靜默開閘 |
| 9 | 舊 bundle(未收 Phase 4 OTA)喺 invite mode 撞註冊 | register-phone 冇 inviteCode → 422 + message「請更新 app 再註冊」 | 落地次序 backend 先行(§7),但開閘派碼一定喺 OTA 之後,實際冇人會撞到;訊息兜底 |
| 10 | 好友 user 喺 DB 消失(理論上冇刪戶功能) | GET /api/friends join 唔到就 filter 走 | 防禦性,唔做 UI |
| 11 | sentinel 過渡戶(username NULL)出現喺好友列表 | 顯示「用戶」fallback | 實際上佢已行忘記密碼補完 profile,純兜底 |
| 12 | mode 切返 `open` | 前端(靠 otp/status)自動唔再顯示⓪;invite-check 一律 valid | 切模式唔使 OTA(§2.4) |

---

## 5. 安全考量

1. **邀請碼 brute force**:39.6-bit(31^8 ≈ 8×10¹¹)× 一次性。`invite-check`
   per-IP 15 分鐘 10 次(抄 share.js sweep pattern,記住 CF-Connecting-IP 攞真
   IP——backend 喺 Cloudflare tunnel 後面,Phase 3 同一個坑)+ 全局每日 500 次
   熔斷(抄 otpAuth globalCount pattern)。就算唔眠唔休打滿限速,期望命中要
   幾千年;而且中咗都仲要過 +852 OTP 呢重。register-phone 嘅碼驗證受 OTP
   ticket 前置保護(冇 ticket 掂唔到),唔使獨立限速。
2. **`invite-check` 唔做 oracle**:唔存在/用咗/revoked 一律 `{ valid: false }`,
   唔俾人 confirm「呢個碼曾經存在」。
3. **好友請求防 spam**:per-user 每日 10 個新請求 + 未應 outgoing 上限 20(DB 數)
   + lookup 每日 20 次。呢啲 cap 用 in-memory Map(重啟清零可接受,同 otpAuth
   一致)。唔做 block 名單——幾十個親友,真有騷擾 Eric admin 落手(revoke 邀請
   碼、直接 DB 處理),母 plan §6.1 拍板方向。**要 spam 先要有帳戶,而帳戶要
   邀請碼**——邀請制本身就係最大重防 spam。
4. **電話 enumeration**:lookup 只俾已登入用戶用、只答 found bool、每日 20 次。
   攻擊者要先攞到邀請碼開戶先 enumerate 得,每日 20 個號碼,而透露嘅只係
   「呢個號碼有冇用呢個 app」。同 OTP request 嗰邊(佢都有 enumeration 面,
   有更嚴 cap)一致風險水平,可接受。
5. **顯示名最小披露**:lookup 唔回名;request 發出後對方先見你個名(佢要決定
   接唔接受,呢個披露係功能本身);你見對方個名要等 accepted。invites 嘅
   `used_by_name` 同一原則:係好友先見名。**電話號碼喺任何 friends/invites
   回應都唔出現**(outgoing 尾4 除外,嗰個係請求者自己打入嚟嘅號碼)。
6. **邀請碼唔係 secret credential**:佢喺 WhatsApp 明文飛緊,threat model 係
   「防陌生人量產帳戶」唔係「防親友俾人偷碼」。碼外洩最壞情況 = 一個陌生人
   開到一個戶(仲要有 +852 電話),而 `used_by`+auto-friend 令佢即刻現形喺
   邀請人好友列表度。
7. **Audit**:invite 生成/使用/revoke 寫 admin-audit.log(現成 `appendAudit`),
   出事有得追邊條鏈入嚟。
8. **全部寫操作 prepared statement + 現成 validation helpers**;friendships
   寫入前驗雙方 user 存在。

---

## 6. Scope 邊界:Phase 4 做 / 刻意唔做

**做(Phase 4 = 呢啲全部,亦只係呢啲)**:
好友(電話配對、請求/接受/拒絕/解除、紅點 badge、好友列表)、好友頁睇對方
分享中清單(§1.4,如拍板要)、邀請碼(生成/quota/一次性/admin 管理)、
`REGISTRATION_MODE` 註冊閘 + 封 email register 側門、邀請碼註冊步 + auto-friend。

**刻意唔做(邊個嚟問都係下一世/下一個 project)**:

| 唔做 | 點解 |
|---|---|
| 群組 / 聊天 / 留言 / 動態 feed | 超出會員系統範圍(母 plan §6.1 一早剔除);呢個係詩歌 app,唔係社交 app,傾偈有 WhatsApp |
| 好友可見權限(「好友先睇到」嘅私人清單) | friendships 表已為佢留好地基,但 per-playlist 權限 UI+同步語義係獨立一嚿工;Phase 4 只重用已 public 嘅 share token |
| 互相推薦歌 / 送歌 | 冇通知基建(§0.5)推薦咗對方都唔知;真需求出現先做 |
| Push notification | 獨立基建 project |
| Block 名單 | 幾十人規模 admin 落手夠(§5-3) |
| QR code 加好友/邀請 | 要新 native dep = 新 APK(§0.4),電話配對+WhatsApp 發碼已覆蓋 |
| display_name 搜尋 | enumeration 面,冇需要(§1.2) |
| 邀請 landing page `/i/<code>` | WhatsApp 純文字夠晒(§2.7) |
| 邀請碼過期時間 / 可重用碼 | 一次性+永久最簡單語義(§2.1) |
| email 通道邀請碼支援 | 通道本身係 legacy,直接封(§2.5);大陸 email OTP 係將來另一個 plan |

**Phase 4 完成 = 母規劃 MEMBERSHIP-PLAN 六項需求全部落地**(①3000首✅ ②同步✅
③自行註冊✅(有碼)④admin✅ ⑤好友✅ ⑥分享✅),會員系統收工;之後再有嘅係
增強,唔係欠账。

---

## 7. 落地分工(Sonnet 5 執行;四個 commit,逐個可驗)

> ⚠️ 多 session 共用 worktree:唔好 `git add -A`,逐個 file add。
> ⚠️ users.db 係 server 單一寫入者,唔可以 CLI 直接改;migration 靠 initSchema
> 喺重啟時自動行,動手前 `cp users.db users.db.bak-phase4-YYYYMMDD`。
> ⚠️ backend restart + OTA publish 必須行 `ops/deploy/` gate。

**Commit 1 — backend 好友**(`userDb.js` friendships 表 + 新 `routes/friends.js` + `server.js` 掛載)
- §1 全部(含 §1.4 shares route,如拍板要)+ §5-3/4/5 限速。
- 自驗:curl 用 phase3-verify-a/b 兩個帳戶行晒 lookup→request→accept→
  DELETE→互相 request 秒 accept→cap 打爆 429。

**Commit 2 — backend 邀請碼 + 註冊閘**(`userDb.js` invites 表 + 新 `routes/invites.js` + `otpAuth.js` register 閘 + `auth.js` email register 封 + `otp/status` 加 mode)
- §2 全部 + §5-1/2/7。
- Eric 部 Mac plist 加 `REGISTRATION_MODE=invite`;backend restart 行 deploy gate。
- 自驗:curl 齊 生成/quota/check 限速/register 有碼冇碼/碼重用/email register 422/
  auto-friend 行(register 完 GET /api/friends 見到邀請人)。

**Commit 3 — 前端好友 UI**(`MineScreen.js` chip+tab+badge + 加好友 sheet + 好友分享清單頁 + `api.js`)
- §3.1/3.2。純 JS。

**Commit 4 — 前端邀請碼**(`PhoneLoginScreen.js` ⓪步 + `AuthContext.registerPhone` 加參 + `AccountScreen.js` 邀請朋友行 + 生成/分享 sheet)
- §2.7 + §3.3。純 JS。

Commit 3+4 **一次 OTA** 推(行 gate)。次序:backend 兩個 commit 先落+重啟
(invite mode 即時生效,冇人受影響——現有用戶登入照舊,而根本未派碼);
前端 OTA 跟上;Eric 收到 OTA 先開始派碼。**全程唔使新 APK**(§0.3)。

**Opus 5 驗收 checklist**(emulator,用 opus-verify + phase3-verify-a/b,唔好開新帳戶;⚠️ 記住 emulator 共用環境三個陷阱——開波先驗 DEBUGGABLE)
1. A lookup B(有/冇/自己/已好友四款回應啱)→ request → B「我的」頁 chip 紅點
   → 入 tab 見到 A 個名 → 接受 → 兩邊好友列表互見
2. 拒絕流程:A request → B ✕ → 兩邊列表乾淨;A 可以再 request
3. A/B 互相 request → 第二下直接 accepted,冇雙 pending
4. 解除好友(二次確認)→ 再加返 → 正常
5. 好友頁睇 B 分享中清單 → 開 SharedPlaylistSheet 播到/儲存到;B revoke token
   後刷新即消失(如 §1.4 拍板要)
6. spam cap:request 第 11 個 → 429;lookup 第 21 次 → 429
7. 邀請碼:member 生成第 6 個未用碼 → 422;admin 唔受限;revoke 後個碼
   check/register 都 invalid
8. invite mode 註冊全流程(真 OTP 或 mock):冇碼 422、錯碼 422、啱碼成功
   → invites.used_by 記啱 + 新戶自動同邀請人係好友
9. 同一個碼第二次 register → 422 invite_used;`invite-check` 第 11 次/15min → 429
10. email `POST /api/auth/register` → 422;opus-verify email **登入**照舊得
11. env 拎走 `REGISTRATION_MODE` 重啟 → 依然 invite(fail-closed);
    設 `open` 重啟 → 前端註冊冇⓪步(otp/status 驅動)
12. 全部 friends/invites API 回應 grep 一次:冇完整電話號碼出街
13. 未登入:「我的」頁冇好友 chip;CTA 卡照舊
14. Regression:登入/忘記密碼/同步/分享清單照常;`/api/me` 限速唔受新 route 影響

---

## 8. 要 Eric 拍板嘅嘢(過文件時問)

1. **邀請碼邊個生成得?**(§2.2)A. 淨係 Eric(admin)B. 所有會員都得,
   每人上限 5 個未用碼,admin 冇上限。**推薦 B**(家人拉家人先係開放嘅意義;
   邀請鏈全記錄,admin 隨時收權)。揀 A 都係同一套嘢,淨係權限收窄。
2. **用邀請碼註冊成功,自動同派碼嗰個人做好友?**(§2.6)**推薦係**——派碼
   係實名邀請,新人第一日就有好友,唔使再行請求禮儀。
3. **好友喺 Phase 4 有咩功能?**(§1.4)A. 純好友關係(列表得個名)
   B. 加埋「好友頁睇到對方分享中嘅清單」(重用 Phase 3 share token,零新私隱
   面,成本一條 route + 一頁)。**推薦 B**(好友關係第一日就有嘢用)。
   注意:唔係睇對方全部清單,冇分享過嘅照舊私人。
4. **好友請求俾唔俾「拒絕」?**(§1.3)**推薦俾**(✕ 一撳刪行,對方唔會收到
   任何通知,只會見到自己個請求仲喺「等緊接受」……其實已刪,佢見到嘅係
   收回選項——即係拒絕咗對方都唔知,冇尷尬)。另一選項係淨係「唔理」
   (請求永遠掛喺度)。
5. **舊 email 註冊通道直接封?**(§2.5)invite mode 下 `POST /api/auth/register`
   一律 422。**推薦封**——佢係冇 OTP 冇限速嘅裸奔側門(§0.2),而家人註冊
   全部行電話路;現有 email 帳戶登入完全唔受影響。
6. **好友入口擺「我的」頁第三粒 chip(推薦),「邀請朋友」擺 AccountScreen
   一行(推薦)**——OK 就唔使再問,唔啱位就話返邊度。

**建議默認(唔使逐項問,一次過 confirm)**:邀請碼 8 字元一次性永久有效
(§2.1)、`REGISTRATION_MODE` 冇設當 invite/fail-closed(§2.4)、搵人淨係電話
精確配對(§1.2)、唔做 QR/landing page/block 名單/push(§6)、lookup 唔回名+
電話永不出街(§5-5)。
