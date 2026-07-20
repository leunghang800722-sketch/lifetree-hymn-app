// App 設定
//
// 固定 URL — 行緊 Cloudflare named tunnel（tunnel 名：hymn-api）。
// 呢條 URL 唔會再變，所以 tunnel 重開／電腦重啟之後都唔使改呢度、唔使 rebuild APK。
// （以前用臨時 trycloudflare tunnel，每次重開都係一條新 random URL，
//   搞到每次都要改 config + rebuild + 重裝，好折磨。）
//
// 要跑起個 backend 要開兩樣嘢：
//   1. cd backend && node server.js          （行喺 localhost:3001）
//   2. cloudflared tunnel run hymn-api       （config 喺 ~/.cloudflared/config.yml）
//
// ⚠️ backend 仍然係跑喺開發者部 Mac 度，部機要開住 + 有網，App 先用到。
export const API_BASE = 'https://api.god-music.com';

// 電話 OTP 登入(PHONE-AUTH-PLAN)。⚠️ 預設 false —— 等 Eric 開好 Twilio +
// 後端補 TWILIO_* env 之後先改 true。false 時登入頁維持現有 email/password,
// 唔會俾用戶見到一個未通嘅電話登入。
export const PHONE_AUTH_ENABLED = false;
