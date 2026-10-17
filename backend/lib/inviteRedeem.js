// lib/inviteRedeem.js — 邀請碼消費 + 自動加好友共用邏輯(MEMBERSHIP-PHASE4-
// FRIENDS-INVITES-PLAN §2.4/§2.6)。register-phone(新開戶消費邀請碼)同
// /api/invites/redeem(已登入用戶輸入邀請碼)兩條路都經呢個 function,
// 避免「消費碼 + 建 friendship + audit」呢段邏輯兩處各抄一份。

import { appendAudit } from './auditLog.js';

// 消費一個未用嘅邀請碼,俾 userId 呢個人,同 inviteRow.created_by 自動做好友
// (accepted,唔使 confirm)。call 之前要自己驗好 inviteRow 存在/未 revoke/
// 未用/唔係自己派嘅碼——呢個 function 淨係做「消費」呢步。
//
// 回 { consumed, alreadyFriends }:
//   consumed=false      →race(§4 case 6):UPDATE 冧咗,碼已被搶用,冇做任何嘢。
//   alreadyFriends=true →兩個人本身已經係好友(accepted),唔會再 insert 多一行,
//                         但碼一樣算消費咗(single-use 唔因為呢個原因唔洗)。
//   已有 pending 請求(任一方發出)嘅情況會直接推上 accepted,唔留喺 pending。
export function redeemInviteAndFriend(db, inviteRow, userId) {
  db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL', [
    userId, new Date().toISOString(), inviteRow.code,
  ]);
  if (db.getRowsModified() === 0) {
    console.warn('invite redeem race — code 已被搶用', inviteRow.code, 'attempted by user', userId);
    return { consumed: false, alreadyFriends: false };
  }

  const lo = Math.min(userId, inviteRow.created_by);
  const hi = Math.max(userId, inviteRow.created_by);
  const stmt = db.prepare('SELECT status FROM friendships WHERE user_lo = ? AND user_hi = ?');
  stmt.bind([lo, hi]);
  const existing = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();

  let alreadyFriends = false;
  if (!existing) {
    db.run(
      'INSERT INTO friendships (user_lo, user_hi, requested_by, status, responded_at) VALUES (?, ?, ?, ?, ?)',
      [lo, hi, inviteRow.created_by, 'accepted', new Date().toISOString()]
    );
  } else if (existing.status === 'accepted') {
    alreadyFriends = true;
  } else {
    db.run("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE user_lo = ? AND user_hi = ?", [
      new Date().toISOString(), lo, hi,
    ]);
  }

  appendAudit({
    ts: new Date().toISOString(), user_id: inviteRow.created_by, who: `#${inviteRow.created_by}`,
    action: 'invite_used', code: inviteRow.code, used_by: userId,
  });

  return { consumed: true, alreadyFriends };
}
