# 註冊拆開邀請碼規劃(REGISTER-OPTIONAL-INVITE-PLAN)

**日期**:2026-08-10
**規劃**:Fable 5|**執行**:Sonnet 5|**驗收**:Opus 5(emulator)
**Eric 決策**:「註冊還註冊,加好友還加好友」——新用戶註冊唔可以強制要邀請碼;
有碼嘅人仍然可以用碼建立「邊個介紹邊個」關聯;「加好友」功能唔可以因此壞咗。

---

## §0 現狀查證(邊度強制緊)

強制係**前後端都有**,由一個 backend env 統一控制:

1. **總開關**:`backend/lib/registrationMode.js` — `REGISTRATION_MODE` env,boot 讀一次,
   冇設就 fail-closed 當 `invite`。部署層面喺 `~/Library/LaunchAgents/com.hymnapp.backend.plist`
   而家明文設咗 `invite`。
2. **Backend 真閘**:`backend/routes/otpAuth.js` `/api/auth/register-phone` —
   invite mode 下冇有效碼直接 422(`invite_required`/`invite_invalid`/`invite_used`),
   有效碼就喺 INSERT user 之後經 `lib/inviteRedeem.js` 消費碼+同派碼者自動做好友。
3. **Email 側門封條**:`backend/routes/auth.js` `/api/auth/register` —
   invite mode 下成條 route 封死(422 `registration_closed`)。⚠️呢個封條嘅條件係
   `REGISTRATION_MODE === 'invite'`,即係一切 `open` 就**重開**——見 §3-B1,必須一齊修。
4. **前端⓪步**:`frontend/hymn-app/src/screens/PhoneLoginScreen.js` —
   mount 時經 `/api/auth/otp/status` 攞 `registrationMode`;invite mode 註冊流程有
   ⓪「輸入邀請碼」步(經公開 `/api/auth/invite-check` 預檢先俾過);
   `open` mode 已有現成邏輯跳過⓪步。攞唔到 status 時 fail-closed 當 invite。
5. **Open mode 現有缺口**:而家 `open` mode 下 register-phone **有送 inviteCode 都唔理**
   (MEMBERSHIP-PHASE4 §2.4 明文),前端 open mode 又完全冇⓪步入口——
   即係話單純切 env 做唔到 Eric 要嘅「有碼仍然可以註冊時用」。

## §1 依賴關係(拆開會唔會整壞加好友)

**結論:唔會,兩樣嘢喺 code/DB 層本身已經係獨立嘅。**

- `users` table **冇** referrer/inviter 欄位,冇 NOT NULL constraint 問題。
  「邊個介紹邊個」= `invites` table(`code/created_by/used_by/used_at`)+
  消費時自動建立嘅 `friendships` row。呢套追蹤唔郁,淨係唔再強制。
- 「加好友」三條入口寫 `friendships`:
  (a) `routes/friends.js` 電話搜好友請求——**完全唔掂 invites,零影響**;
  (b) `routes/invites.js` `/api/invites/redeem` 已登入用戶輸入碼(AddFriendSheet
  「輸入邀請碼」tab)——保留不變,呢條就係「註冊之後先入碼」嘅現成入口;
  (c) register-phone 消費碼——由「必經」變「有碼先行」。
  三條路共用 `lib/inviteRedeem.js`,唔使改。
- 冇任何邏輯假設「用戶一定有邀請人」:email 帳戶、Eric 自己、opus-verify 從來都
  冇 inviter,`invites.used_by` 本身 nullable,admin/邀請列表對「冇碼開戶」無感。
- `InviteFriendsSheet` share 文案(「開新戶時輸入邀請碼」)——因為方案保留
  optional ⓪步(§2-F1),文案照用唔使改。

## §2 設計方案

### Backend(Sonnet 改 code,一次 restart 連 env 切換一齊生效)

- **B1(必做,安全)**:`routes/auth.js` email register 封條**唔再跟** `REGISTRATION_MODE`,
  改成無條件 422 `registration_closed`。封佢嘅原意(冇 OTP、冇限速、知 URL 就開到戶)
  喺 open mode 一樣成立。現有 email 帳戶**登入**(`/api/auth/login`)照舊唔受影響。
- **B2(核心)**:`routes/otpAuth.js` register-phone 邀請碼閘改成:
  - `invite` mode:行為**一字不改**(保底,可隨時切返)。
  - `open` mode:`inviteCode` 變 optional——
    - 冇送/空字串 → 照開戶,唔建 friendship;
    - 有送 → 照 invite mode 同一套驗證(唔存在/revoked→422 `invite_invalid`,
      已用→422 `invite_used`),過到先消費+自動好友。用戶主動入咗碼就要誠實擋,
      唔可以 silent ignore 令佢以為加咗好友其實冇。
    - 加一個 self-check:open mode 下如果個碼係自己派嘅(理論上開新戶唔會發生,
      防手滑)照 `invite_invalid` 處理即可,唔使新錯誤碼。
- **B3**:`routes/invites.js` `/api/auth/invite-check` 刪走「open mode 一律
  `valid:true`」捷徑,統一真驗(有碼就查 DB)。因為 open mode 而家都會真消費,
  預檢一律放行會俾垃圾碼流到 register 先爆。
  ⚠️舊 bundle 相容分析見 §3-R2——安全。
- **B4(optional polish,P2)**:register-phone 消費成功時 response 加
  `invitedBy: <username>`,俾前端 toast「已同 XX 成為好友」。冇都唔擋收貨。

### Frontend(純 JS,OTA 推得)

- **F1(核心)**:`PhoneLoginScreen.js` 註冊流程——`open` mode 由「完全跳過⓪」
  改成「顯示 optional ⓪步」:
  - 標題/副題改做「有冇邀請碼?(選填)」之類,講明冇都註冊得;
  - 加一個「冇邀請碼,直接註冊」跳過掣 → 清空 `inviteCode` 入①電話步;
  - 有入碼 → 照行 `invite-check` 預檢,過先入①(現有 handleCheckInvite 照用);
  - 現有「register 時 422 invite_used/invite_invalid 跳返⓪」錯誤處理照用,
    唯一要動:open mode 下 `invite_required` 理論上唔會再出現,唔使特別處理。
  - `invite` mode 嘅⓪步(必填、冇跳過掣)**一字不改**。
- **F2**:`registrationMode` fetch fail 嘅 fail-closed(當 invite)保持不變——
  寧願罕見情況多一步,唔好裸奔。

### Env/部署切換

- **D1**:`com.hymnapp.backend.plist` `REGISTRATION_MODE` `invite`→`open`,
  同 B1-B3 code 一齊喺**同一次** backend restart 生效(改 plist 要
  `launchctl unload/load` 或等效重啟,跟現有 backend 重啟流程+deploy gate)。
- **D2**:順序——①backend code+env 一齊上+restart;②驗 API;③OTA 推前端 F1。
  中間窗口(backend 已 open、前端仲係舊 bundle)行為安全:舊 bundle 攞到
  `registrationMode:'open'` 會跳過⓪、唔送碼,冇碼照開戶——正正係目標行為,
  只係未有「選填入碼」入口,可接受。

## §3 風險評估

- **R1 Email 側門重開**:唯一真正危險位,B1 必做,唔做唔准切 open。
- **R2 舊 bundle × B3(invite-check 真驗)**:舊 bundle 喺 open mode 只會喺
  「otp/status 攞唔到」嘅罕見 fail-closed 路徑先顯示⓪(必填)。B3 之後呢條路
  有真碼照過,冇碼/垃圾碼會卡喺⓪——同而家 invite mode fail-closed 行為一致,
  重開 app 攞返 status 就好返,可接受,唔使做嘢。
- **R3 「一定有邀請人」假設**:查證過唔存在(§1),冇 null/undefined 炸彈。
  `invites.used_by` 本身 nullable,DB **零 schema 改動、零 migration**。
- **R4 Race(§4 case 6 同款)**:⓪預檢過咗、submit 前個碼俾人搶用——
  現有「跳返⓪重新核實」邏輯照兜,open mode 下跳返⓪之後用戶可以撳跳過掣照註冊,
  仲好過而家。
- **R5 invite mode 迴歸**:所有改動都要保住「切返 `invite` 一切照舊」呢條退路,
  Opus 驗收要兩個 mode 都行(§4)。
- **R6 多 session worktree**:老規矩——唔准 `git add -A`,commit 前核對 working tree,
  OTA publish 前清場(見 memory:EAS Update 流程)。
- **R7 OTA/Backend 幾時使唔使**:DB 零改動;backend code+env 要一次 restart;
  前端 F1 純 JS 行 OTA。冇嘢需要新 APK。

## §4 驗收清單(Opus 5,emulator;開波先驗 DEBUGGABLE,帳號用 opus-verify 套路)

Backend(curl 層):
1. open mode:register-phone 冇 `inviteCode` → 開戶成功,`friendships` 冇新 row
2. open mode:有效碼 → 開戶成功+自動好友(accepted)+`invites.used_by` 填咗+audit `invite_used`
3. open mode:錯碼/已用碼 → 422 `invite_invalid`/`invite_used`,**冇**開戶
4. open mode:email `/api/auth/register` 仍然 422(B1)
5. open mode:invite-check 真驗——有效碼 `valid:true`,垃圾碼 `valid:false`
6. invite mode(env 切返再測):冇碼 422 `invite_required`、email register 422——迴歸零變化
7. email 帳戶(opus-verify)`/api/auth/login` 照登入到

前端(emulator):
8. open mode 註冊流程見到「選填⓪步」,撳跳過掣可以全程冇碼註冊成功
9. open mode ⓪步入有效碼 → 註冊完成後「我的」好友列表見到派碼者
10. open mode ⓪步入錯碼 → 卡喺⓪有錯誤訊息;submit 階段碼被搶用 → 跳返⓪
11. 已登入用戶 AddFriendSheet「輸入邀請碼」tab 兌換照常(迴歸)
12. 已登入用戶「搜電話」加好友照常(迴歸)
13. InviteFriendsSheet 生成/分享碼照常(迴歸)

## §5 唔做(non-goals)

- 唔加 users.referrer 欄位/唔做新追蹤機制——現有 invites+friendships 已經記錄晒
- 唔改 `/api/invites/redeem`、`routes/friends.js`、`lib/inviteRedeem.js`
- 唔開 email 註冊、唔郁 OTP/密碼/忘記密碼流程
- 唔郁 invite 配額(member 5 個)/admin 管理/revoke
