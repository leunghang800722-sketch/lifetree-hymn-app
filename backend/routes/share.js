// routes/share.js — 分享播放清單(MEMBERSHIP-PHASE3-SHARE-PLAN §1-3)
//
// 四條 route,呢個 file 自己逐條掛 requireAuth(§1.3 明講唔靠 server.js
// 掛載次序——/api/me 個 60/min 限速 middleware 掛喺 meRoutes(app) 入面,
// 靠「呢個 file 喺佢之後 import」嚟保證食唔食到限速太脆,分享生成 API
// 冇必要行嗰個限速,獨立 requireAuth 就夠):
//
//   POST   /api/me/playlists/:id/share   生成/重用 token(ownership 驗證)
//   DELETE /api/me/playlists/:id/share   撤銷(revoked=1,今次冇 UI 但留後路)
//   GET    /p/:token                     SSR 網頁預覽(WhatsApp OG 卡)
//   GET    /api/p/:token                 JSON 版俾 app 用
//
// 兩個公開 endpoint 行獨立 per-IP 限速(§5.2)—— 唔係防 brute force(token
// 128-bit,冇可能估中),係防 scraper 兜 hymns 縮圖/煩擾 backend。

import crypto from 'crypto';
import { getUserDb, saveUserDb } from '../lib/userDb.js';
import requireAuth from '../lib/requireAuth.js';
import { clientIp } from '../lib/loginRateLimit.js';

// ODE-REBRAND-PLAN §3.5:新 domain。舊 god-music.com 唔剪(舊 APK/流通中連結
// 靠佢),server.js 已加 host-based 301 將舊域 /p/ /downloads 帶去呢度。
const API_BASE = 'https://api.odemusics.com';
const APK_PACKAGE = 'com.hymnapp.praise';
// debug.keystore 嘅 SHA-256(§0.3:release build 而家都係用呢條簽,keytool -list
// -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android 攞)。
const APK_SHA256_FINGERPRINT = 'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';

// ── per-IP 限速(§5.2)—— 抄 lib/loginRateLimit.js 嘅 in-memory pattern,
// 但呢度計**全部 request**(唔淨計失敗),同 routes/me.js isRateLimited() 個
// counter 寫法一致。15 分鐘 60 次。
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 60;
const hitsByIp = new Map();

// Opus 5 驗收揪出:呢個 Map 冇 eviction——單一 IP check 嗰陣自己個窗口過期
// 會覆寫(下面 isRateLimited 本身),但**只出現過一次就冇再嚟**嘅 IP(公開
// endpoint,scraper 換 IP 好常見)永遠冇人再幫佢 check,個 entry 會留一世,
// 長遠慢慢漏 memory。
//
// 修法:唔跟 loginRateLimit.js 加長駐 setInterval(嗰邊冧本身都冇用 timer,
// 保持一致),淨係喺 Map 大到有意義先做一次全表過期掃(廉價、罕見觸發,
// 唔會拖慢正常 request)。SWEEP_THRESHOLD 500 純粹「呢個規模先值得行一次
// O(n) 掃描」嘅工程判斷,唔係業務數字。
const SWEEP_THRESHOLD = 500;
function sweepExpired(now) {
  for (const [ip, rec] of hitsByIp) {
    if (now - rec.windowStart > RATE_WINDOW_MS) hitsByIp.delete(ip);
  }
}

function isRateLimited(ip) {
  const now = Date.now();
  if (hitsByIp.size > SWEEP_THRESHOLD) sweepExpired(now);
  const rec = hitsByIp.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    hitsByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > RATE_MAX;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function findPlaylist(db, userId, playlistId) {
  const stmt = db.prepare('SELECT id, deleted FROM playlists WHERE user_id = ? AND id = ?');
  stmt.bind([userId, playlistId]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// 兩步查:token(revoked=0)→ playlist(deleted=0)。任何一步 miss 都回 null,
// 上層一律當「呢個清單已經唔存在」處理——唔可以分「token 錯」定「清單刪咗」
// (§1.3 no oracle)。
function resolveShare(db, token) {
  const shareStmt = db.prepare('SELECT user_id, playlist_id FROM playlist_shares WHERE token = ? AND revoked = 0');
  shareStmt.bind([token]);
  const shareRow = shareStmt.step() ? shareStmt.getAsObject() : null;
  shareStmt.free();
  if (!shareRow) return null;

  const plStmt = db.prepare('SELECT name, songs_json FROM playlists WHERE user_id = ? AND id = ? AND deleted = 0');
  plStmt.bind([shareRow.user_id, shareRow.playlist_id]);
  const plRow = plStmt.step() ? plStmt.getAsObject() : null;
  plStmt.free();
  if (!plRow) return null;

  const ownerStmt = db.prepare('SELECT username FROM users WHERE id = ?');
  ownerStmt.bind([shareRow.user_id]);
  const ownerRow = ownerStmt.step() ? ownerStmt.getAsObject() : null;
  ownerStmt.free();

  let songs = [];
  try { songs = JSON.parse(plRow.songs_json || '[]'); } catch (_) {}

  return { name: plRow.name, owner: ownerRow?.username || null, songs };
}

// intent:// URL(§3.1)—— Android Chrome / WhatsApp 內置瀏覽器都食。冇任何
// 用戶輸入落呢條 URL(token 係 server 生成嘅 base64url,package/下載頁都係
// 常數),唔使額外 encode。
function intentUrl(token) {
  const fallback = encodeURIComponent(`${API_BASE}/downloads/app.apk`);
  return `intent://p/${token}#Intent;scheme=godmusic;package=${APK_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

// Ode 色板(ODE-REBRAND-PLAN §2):靛紫底 + 暖光 CTA,冇金色、冇綠色。
const PAGE_STYLE = `
  body { margin:0; background:#0B0913; color:#F4F1FA; font-family:-apple-system,Roboto,sans-serif; }
  .wrap { max-width:480px; margin:0 auto; padding:28px 20px 40px; }
  .brand { font-size:13px; color:#A79CD0; margin-bottom:6px; letter-spacing:1px; }
  h1 { font-size:22px; margin:0 0 6px; line-height:1.3; }
  .meta { font-size:14px; color:#8F88AB; margin-bottom:20px; }
  .btn { display:block; text-align:center; text-decoration:none; padding:13px 16px; border-radius:24px;
         font-size:15px; font-weight:600; margin-bottom:10px; }
  .btn.primary { background:#EFE4D2; color:#1C1436; }
  .btn.secondary { background:#150F26; color:#F4F1FA; border:1px solid #2A2145; }
  .songs { margin-top:24px; }
  .song { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #16112A; }
  .song img { width:52px; height:52px; border-radius:9px; object-fit:cover; background:#221B3E; flex-shrink:0; }
  .song .title { font-size:15px; margin:0 0 2px; }
  .song .artist { font-size:12px; color:#8F88AB; margin:0; }
  .gone { text-align:center; padding-top:60px; }
  .gone .icon { font-size:40px; }
`;

function pageShell({ title, ogTags = '', bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${ogTags}
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
${bodyHtml}
</div>
</body>
</html>`;
}

function renderGonePage() {
  const bodyHtml = `
  <div class="gone">
    <div class="icon">🎵</div>
    <h1>呢個清單已經唔存在</h1>
    <p class="meta">連結可能已經失效,或者分享者刪咗個清單。</p>
    <a class="btn primary" href="/downloads/app.apk">⬇ 下載 App(Android)</a>
  </div>`;
  return pageShell({ title: 'Odely 詩歌', bodyHtml });
}

function renderPlaylistPage(data, token) {
  const name = escapeHtml(data.name);
  const owner = data.owner ? escapeHtml(data.owner) : null;
  const count = data.songs.length;
  const ogTitle = escapeHtml(`【${data.name}】· ${count} 首詩歌`);
  const ogDesc = escapeHtml(owner ? `${data.owner} 喺 Odely 同你分享咗一個詩歌清單` : '有人喺 Odely 同你分享咗一個詩歌清單');
  const firstYoutubeId = data.songs.find((s) => s?.youtube_id)?.youtube_id;
  const ogImageTag = firstYoutubeId
    ? `<meta property="og:image" content="https://img.youtube.com/vi/${escapeHtml(firstYoutubeId)}/mqdefault.jpg">`
    : '';
  const ogTags = `<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
${ogImageTag}`;

  const songsHtml = data.songs.map((s) => {
    // 冇 youtube_id(理論上唔應該,但 songs_json 係用戶輸入嘅 slim object,
    // 防禦性處理)就唔出 <img>,唔好帶個空 src 走去 load 返自己個頁。
    const cover = s?.youtube_id
      ? `<img src="https://img.youtube.com/vi/${escapeHtml(s.youtube_id)}/mqdefault.jpg" alt="">`
      : '';
    return `<div class="song">${cover}<div><p class="title">${escapeHtml(s?.title || '未知歌名')}</p><p class="artist">${escapeHtml(s?.artist || '')}</p></div></div>`;
  }).join('\n');

  const bodyHtml = `
  <div class="brand">Odely 詩歌</div>
  <h1>${name}</h1>
  <div class="meta">${owner ? `由 ${owner} 分享 · ` : ''}${count} 首詩歌</div>
  <a class="btn primary" href="${intentUrl(token)}">▶ 喺 App 開啟</a>
  <a class="btn secondary" href="/downloads/app.apk">⬇ 下載 App(Android)</a>
  <div class="songs">${songsHtml}</div>`;

  return pageShell({ title: ogTitle, ogTags, bodyHtml });
}

export default function shareRoutes(app) {
  // ── 生成/重用 token(§1.1:一個清單一條、永久有效)──────────────────
  app.post('/api/me/playlists/:id/share', requireAuth, async (req, res) => {
    try {
      const db = await getUserDb();
      const pl = findPlaylist(db, req.user.id, req.params.id);
      if (!pl || pl.deleted) return res.status(404).json({ error: 'not_found' });

      const sel = db.prepare('SELECT token FROM playlist_shares WHERE user_id = ? AND playlist_id = ? AND revoked = 0');
      sel.bind([req.user.id, req.params.id]);
      let token = sel.step() ? sel.getAsObject().token : null;
      sel.free();

      if (!token) {
        token = crypto.randomBytes(16).toString('base64url'); // 128-bit,22 字元
        db.run(
          'INSERT INTO playlist_shares (token, user_id, playlist_id) VALUES (?, ?, ?)',
          [token, req.user.id, req.params.id]
        );
        saveUserDb(db);
      }

      res.json({ url: `${API_BASE}/p/${token}`, token });
    } catch (err) {
      console.error('share create error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 撤銷(§1.1:今次唔出 UI,留後路)────────────────────────────────
  app.delete('/api/me/playlists/:id/share', requireAuth, async (req, res) => {
    try {
      const db = await getUserDb();
      const pl = findPlaylist(db, req.user.id, req.params.id);
      if (!pl) return res.status(404).json({ error: 'not_found' });
      db.run('UPDATE playlist_shares SET revoked = 1 WHERE user_id = ? AND playlist_id = ?', [req.user.id, req.params.id]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('share revoke error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 公開:SSR 網頁預覽(§3)────────────────────────────────────────
  app.get('/p/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https://img.youtube.com; style-src 'unsafe-inline'");
    if (isRateLimited(clientIp(req))) return res.status(429).send('太多請求,請稍後再試');
    try {
      const db = await getUserDb();
      const data = resolveShare(db, req.params.token);
      if (!data) return res.status(410).send(renderGonePage());
      res.status(200).send(renderPlaylistPage(data, req.params.token));
    } catch (err) {
      console.error('share page error:', err);
      res.status(500).send('Server error');
    }
  });

  // ── 公開:JSON 版俾 app 用(§1.2)───────────────────────────────────
  app.get('/api/p/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (isRateLimited(clientIp(req))) return res.status(429).json({ error: 'rate_limited' });
    try {
      const db = await getUserDb();
      const data = resolveShare(db, req.params.token);
      if (!data) return res.status(410).json({ error: 'gone' });
      res.json({ name: data.name, owner: data.owner, songs: data.songs, song_count: data.songs.length });
    } catch (err) {
      console.error('share json error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── Android App Links 驗證(§2.3配套)—— 公開標準檔,冇秘密,唔使限速 ──
  app.get('/.well-known/assetlinks.json', (req, res) => {
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: APK_PACKAGE,
          sha256_cert_fingerprints: [APK_SHA256_FINGERPRINT],
        },
      },
    ]);
  });
}
