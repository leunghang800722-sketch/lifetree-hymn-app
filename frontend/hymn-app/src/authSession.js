// authSession — 登入 token 過期處理(2026-09-28「URL加歌出 unauthorized」事故)
//
// 背景:token 30 日過期(backend TOKEN_EXPIRY),之前 App 完全冇處理 401——
// admin 畫面原字彈「unauthorized」,userSync 靜靜哋 fail(outbox 越積越多),
// 用戶由頭到尾唔知自己其實已經「登出」咗。
//
// 呢個檔案係獨立 lib(唔係 context),俾 api.js / userSync.js 呢類冇 hook
// 嘅地方報「呢個 token 俾 server 拒咗」,AuthContext 訂閱之後清 session +
// 叫用戶重新登入。

// base64url → string。唔靠 atob(舊 Hermes 冇),JWT payload 好細,手寫夠用。
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64urlDecode(input) {
  const s = String(input).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0;
  let acc = 0;
  let bytes = '';
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) throw new Error('bad base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes += '%' + ('0' + ((acc >> bits) & 0xff).toString(16)).slice(-2);
    }
  }
  return decodeURIComponent(bytes);
}

// 回 exp(毫秒);讀唔到回 null(caller 要當「唔知」,唔好當過期——
// 真.過期由 server 401 兜底)。
export function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(b64urlDecode(String(token).split('.')[1]));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch (_) {
    return null;
  }
}

export function isTokenExpired(token, now = Date.now()) {
  const exp = tokenExpiryMs(token);
  return exp != null && exp <= now;
}

let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

// 帶埋「邊個 token 俾人拒」——AuthContext 靠佢分辨舊 request 遲返嘅 401
// (用戶已經重新登入咗)同真.現役 token 失效。
export function reportUnauthorized(token) {
  if (_onUnauthorized) _onUnauthorized(token);
}
