// lib/registrationMode.js — REGISTRATION_MODE env(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.4)
//
// boot 時讀一次。冇設 = 'invite'(fail-closed)——寧願 Eric 未派碼前冇人
// 註冊到,好過 env 漏咗設變返裸奔(§0.2:而家嘅 register/register-phone
// 冇任何閘,知道 API URL 嘅人就開到戶)。
export const REGISTRATION_MODE = process.env.REGISTRATION_MODE === 'open' ? 'open' : 'invite';
