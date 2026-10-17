// lib/tokenValidity.js — 改密碼即令舊 token 失效(TOKEN-REVOKE-DRILL-EXEC-20260929 Part A)
//
// users.token_valid_after(unix 秒,NULL = 冇限制)。iat 早過呢個值嘅 JWT 一律當撤銷。
// 用 `<` 而唔係 `<=`:同一秒簽發嘅舊 token 會通過(可接受,見報告)。
// 冇 iat(偽造/舊格式)嘅 token 喺有 token_valid_after 嘅用戶身上一律當撤銷。

export function isTokenRevoked(decoded, userRow) {
  if (!userRow) return false;
  const after = userRow.token_valid_after;
  if (after === null || after === undefined) return false;
  return typeof decoded?.iat !== 'number' || decoded.iat < after;
}

// 寫入「而家」(秒)。呼叫方負責 saveUserDb(同 password_hash 更新同一個落盤路徑)。
export function markTokensRevoked(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  db.run('UPDATE users SET token_valid_after = ? WHERE id = ?', [now, userId]);
  return now;
}
