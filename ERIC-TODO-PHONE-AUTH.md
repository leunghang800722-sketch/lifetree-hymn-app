# Eric 要親手做嘅 steps —— 電話登入(WhatsApp/SMS OTP)

> 2026-07-20。Backend + 前端嘅 code **已經寫好、build 好**(v239),但**未 live**:
> 前端有個 flag `PHONE_AUTH_ENABLED` 而家係 `false`,後端冇 Twilio key 就回「未配置」。
> 你做完下面幾步、將 key 交俾我哋補落後端 + 開 flag,電話登入即刻通。
> 呢幾步涉及**金錢 / 證件 / 你自己嘅帳戶**,session 幫你唔到,一定要你本人做。

---

## A. 一定要做(WhatsApp/SMS 主通道)

### A1. 開 Twilio 帳戶 + 綁信用卡
- 去 https://www.twilio.com 註冊,揀 **Verify** 產品。
- 綁卡。新帳戶有 US$15 試用金(試用期只可以發去你自己驗證咗嘅號碼 —— 啱做測試)。

### A2. 開一個 Verify Service,抄低 3 條 key
- Console → Verify → Services → Create,個 service 名是但(例如 hymn-app)。
- 抄低呢 3 條交俾我哋(⚠️ 私訊,唔好貼公開/唔好入 git):
  - `TWILIO_ACCOUNT_SID`(Account 頁,AC 開頭)
  - `TWILIO_AUTH_TOKEN`(Account 頁,㩒 show)
  - `TWILIO_VERIFY_SERVICE_SID`(啱啱開嗰個 Verify service,VA 開頭)
- Console 順手開埋 **Fraud Guard**(Verify 設定入面,免費一個掣,防 SMS pumping)。

### A3.(WhatsApp 為主先要;純 SMS 可以跳過)開 Meta 商業帳戶 + 接 WhatsApp sender
> 你有 BR 文件,所以呢步做得。順利就用 WhatsApp(平 SMS 差唔多 9 倍);
> 未搞掂之前我哋會先行 **SMS**(一個 config 就切,唔阻你用)。
- 開一個 **Meta Business 帳戶**,做 **商業驗證(Business Verification)**,遞交你嘅 BR/公司文件。審批一般 1-5 個工作天。
- **要一個專用電話號碼做 WhatsApp sender** —— **唔可以**用你自己部手機而家用緊 WhatsApp 嗰個號(會被踢出正常 WhatsApp)。慣常做法:喺 Twilio 買個平價號碼(美國號 ~US$1.15/月)專做 sender。
- 喺 Twilio 將個 WhatsApp sender 接落去(Twilio 有 guided 流程:Messaging → WhatsApp senders)。
- 搞掂之後話我哋知,我哋將後端 `OTP_CHANNEL` 由 `sms` 切做 `whatsapp`(一行 config)。

---

## B.(可選)Email 驗證碼通道 —— 俾大陸 +86 用戶
> 大陸號碼收唔到國際 SMS/WhatsApp(見 plan §0),所以留一條 email 後路。
> ⚠️ 呢個通道嘅**發信部分我哋仲未接**(要你提供下面個 App Password 先接得到),
> 唔急,主通道 A 通咗先。
- 用你個 Gmail:https://myaccount.google.com → 安全性 → 兩步驗證 → **App Passwords**,
  開一個,抄低 16 位密碼交俾我哋(私訊)。零成本。

---

## C. 我哋(session)會做嘅嘢 —— 你交完 key 就搞
- 將 A2 三條 key(+ 將來 B 個 Gmail App Password)放入 Mac 嘅 launchd env(⚠️ 唔會 commit 落 git)。
- 前端 `PHONE_AUTH_ENABLED` 改 `true`,出新 build。
- 用你部真機 + Twilio 試用額度行全程實測(要先喺 Twilio console 驗證你自己個號碼)。
- WABA 搞掂就切 `OTP_CHANNEL=whatsapp`。

---

## D. 已經整定、等緊 key 嘅嘢(你唔使理,記錄用)
- 後端:`POST /api/auth/otp/request`、`POST /api/auth/otp/verify`、`GET /api/auth/otp/status`
  (`backend/routes/otpAuth.js`)。冇 key 回 `503 not_configured`,唔會 crash。
- 防濫用已內建:只准 `+852`(`OTP_ALLOWED_PREFIXES` 可加)、同號碼 60 秒 cooldown +
  每日 5 次、同 IP 每日 10 次、**全局每日熔斷** `OTP_DAILY_CAP`(預設 100)。
- 前端:`PhoneLoginScreen`(輸號碼 → 6 位碼 → 登入),已接 `AuthContext`;flag 開就顯示。
- 舊 email/password 登入**照舊保留**(過渡期),電話登入唔影響佢。

## E. 你要拍板嘅兩條問題(plan §1A)
1. 用 **WhatsApp 為主**(要做 A3),定係**先淨 SMS**(跳過 A3,之後再加)?
2. 接唔接受「WhatsApp 為主、SMS 後備」= 兩個通道嘅費用都可能出現?
   (50 個活躍用戶大約:WhatsApp ~US$3/月,純 SMS ~US$7/月。)
