// routes/me.js — 會員系統 Phase 1:跨裝置同步 API
// (MEMBERSHIP-PHASE1-LOGIN-SYNC.md §1.3-1.5)
//
// 全部行 requireAuth;每個寫操作完即刻 saveUserDb(Phase 0 pattern)。
// 清單衝突用 last-write-wins(比 updated_at),輸嗰邊回 stale:true + server
// 版本俾 client 覆蓋本地;最愛淨係 set,union 天然冪等。

import { getUserDb, saveUserDb } from '../lib/userDb.js';
import { getDb } from '../lib/serverDb.js';
import requireAuth from '../lib/requireAuth.js';

// ── hymn_id 存在性驗證(DELISTED-FAVORITES-ROOTCAUSE-20260822.md §G2)────────
//
// 舊版呢度係赤裸裸嘅 `INSERT OR IGNORE`,乜 id 都收。後果實錘過:kids C4 原子
// 換血 hard delete 咗舊兒童庫、migration 亦都清咗用戶側嘅 favorites,但 client
// 本地 MMKV 仲揸住嗰堆舊 id,下一次登入合併就原封不動打返上嚟(user 2 嘅
// 1835/1951/2015/2420/2718 就係咁返生),之後每次撳到就 /api/stream 404、
// 背景播放死寂 86 秒。server 側清幾多次都冇用,因為冇人守住入口。
//
// 呢度守住入口:一律核對 `hymns` view(同 /api/hymns 同 /api/stream 用嘅係
// 同一份 in-memory 副本,所以「App 見得到」同「收得入最愛」永遠一致,唔會
// 出現「見到但加唔到」)。
//
// ⚠️ 故意 fail-open:讀唔到 hymns.db 就回 null,caller 一律當「查唔到,唔過濾」。
// 寧願放幾個死 id 入嚟(前端已經有佔位 + playQueueImpl 剪走做第二層保險),
// 都唔可以因為 DB 一時讀唔到就靜靜哋剷走用戶成個最愛清單。
async function existingHymnIds(ids) {
  const wanted = [...new Set((ids || []).map((n) => parseInt(n, 10)).filter(Number.isFinite))];
  if (wanted.length === 0) return new Set();
  try {
    const db = await getDb();
    const out = new Set();
    const stmt = db.prepare('SELECT 1 FROM hymns WHERE id = ?');
    for (const id of wanted) {
      stmt.bind([id]);
      if (stmt.step()) out.add(id);
      stmt.reset();
    }
    stmt.free();
    return out;
  } catch (err) {
    console.error('me/hymn-exists check failed (fail-open, 唔過濾):', err.message);
    return null;
  }
}

// ── 限速(§1.5)—— 純防前端 sync loop 走火,正常使用遠遠掂唔到 ──────────
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const rateByUser = new Map(); // user_id -> { count, windowStart }

function isRateLimited(userId) {
  const now = Date.now();
  const rec = rateByUser.get(userId);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    rateByUser.set(userId, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > RATE_MAX;
}

const PLAYLIST_ID_RE = /^pl_[A-Za-z0-9_-]{1,40}$/;

function validPlaylistPayload(body) {
  if (!body || typeof body !== 'object') return null;
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 40) return null;
  if (typeof body.updated_at !== 'string' || !body.updated_at) return null;
  const songs = Array.isArray(body.songs) ? body.songs.slice(0, 30) : [];
  const position = Number.isFinite(body.position) ? body.position : 0;
  return { name, songs, updated_at: body.updated_at, position };
}

function rowToPlaylist(row) {
  let songs = [];
  try { songs = JSON.parse(row.songs_json || '[]'); } catch (_) {}
  return { id: row.id, name: row.name, position: row.position, songs, updated_at: row.updated_at };
}

function getData(db, userId) {
  const favorites = [];
  const favStmt = db.prepare('SELECT hymn_id FROM favorites WHERE user_id = ? ORDER BY created_at');
  favStmt.bind([userId]);
  while (favStmt.step()) favorites.push(favStmt.getAsObject().hymn_id);
  favStmt.free();

  const playlists = [];
  const plStmt = db.prepare(
    'SELECT id, name, position, songs_json, updated_at FROM playlists WHERE user_id = ? AND deleted = 0 ORDER BY position'
  );
  plStmt.bind([userId]);
  while (plStmt.step()) playlists.push(rowToPlaylist(plStmt.getAsObject()));
  plStmt.free();

  return { favorites, playlists };
}

// LWW upsert,PUT 同 /sync 逐個清單都行呢條(§1.3/§1.4 共用邏輯)。
// deleted=1 嘅清單唔特別處理:純比 updated_at,client 較新就寫入(deleted 順手
// 重設 0,即係復活),否則 stale——同 §1.4 「client 較新就復活,否則維持刪除」一致。
// liveIds:existingHymnIds() 嘅結果。傳 Set 就會剪走清單入面指唔到現有歌嘅
// song(同 favorites 一樣嘅入口守衛);傳 null(fail-open)就照單全收。
function upsertPlaylist(db, userId, id, payload, liveIds = null) {
  if (!PLAYLIST_ID_RE.test(id)) return { error: 'bad_id' };
  const valid = validPlaylistPayload(payload);
  if (!valid) return { error: 'bad_payload' };
  if (liveIds) {
    const before = valid.songs.length;
    valid.songs = valid.songs.filter((s) => liveIds.has(parseInt(s?.id, 10)));
    if (valid.songs.length !== before) {
      console.log(`🧹 playlist ${id} (user ${userId}) 剪走 ${before - valid.songs.length} 首唔存在嘅歌`);
    }
  }

  const sel = db.prepare('SELECT id, name, position, songs_json, updated_at FROM playlists WHERE user_id = ? AND id = ?');
  sel.bind([userId, id]);
  const exists = sel.step();
  const existing = exists ? sel.getAsObject() : null;
  sel.free();

  if (existing && existing.updated_at >= valid.updated_at) {
    return { stale: true, server: rowToPlaylist(existing) };
  }

  if (existing) {
    db.run(
      'UPDATE playlists SET name = ?, position = ?, songs_json = ?, updated_at = ?, deleted = 0 WHERE user_id = ? AND id = ?',
      [valid.name, valid.position, JSON.stringify(valid.songs), valid.updated_at, userId, id]
    );
  } else {
    db.run(
      'INSERT INTO playlists (user_id, id, name, position, songs_json, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [userId, id, valid.name, valid.position, JSON.stringify(valid.songs), valid.updated_at]
    );
  }
  return { ok: true };
}

export default function meRoutes(app) {
  app.use('/api/me', requireAuth, (req, res, next) => {
    if (isRateLimited(req.user.id)) return res.status(429).json({ error: 'rate_limited' });
    next();
  });

  app.get('/api/me/data', async (req, res) => {
    try {
      const db = await getUserDb();
      res.json(getData(db, req.user.id));
    } catch (err) {
      console.error('me/data error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/me/favorites/:hymnId', async (req, res) => {
    try {
      const hymnId = parseInt(req.params.hymnId, 10);
      if (!Number.isFinite(hymnId)) return res.status(400).json({ error: 'bad_hymn_id' });
      // §G2 入口守衛:唔存在(已下架 / hard delete / curated=0)嘅 id 一律唔收。
      const live = await existingHymnIds([hymnId]);
      if (live && !live.has(hymnId)) {
        console.log(`🚫 fav_add 拒收唔存在嘅 hymn_id=${hymnId} (user ${req.user.id})`);
        return res.status(404).json({ error: 'hymn_not_found' });
      }
      const db = await getUserDb();
      db.run('INSERT OR IGNORE INTO favorites (user_id, hymn_id) VALUES (?, ?)', [req.user.id, hymnId]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('me/favorites add error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/me/favorites/:hymnId', async (req, res) => {
    try {
      const hymnId = parseInt(req.params.hymnId, 10);
      if (!Number.isFinite(hymnId)) return res.status(400).json({ error: 'bad_hymn_id' });
      const db = await getUserDb();
      db.run('DELETE FROM favorites WHERE user_id = ? AND hymn_id = ?', [req.user.id, hymnId]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('me/favorites remove error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.put('/api/me/playlists/:id', async (req, res) => {
    try {
      const db = await getUserDb();
      const songIds = Array.isArray(req.body?.songs) ? req.body.songs.map((s) => s?.id) : [];
      const result = upsertPlaylist(db, req.user.id, req.params.id, req.body, await existingHymnIds(songIds));
      if (result.error) return res.status(400).json({ error: result.error });
      if (!result.stale) saveUserDb(db);
      res.json(result);
    } catch (err) {
      console.error('me/playlists upsert error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/me/playlists/:id', async (req, res) => {
    try {
      const db = await getUserDb();
      const now = new Date().toISOString();
      db.run('UPDATE playlists SET deleted = 1, updated_at = ? WHERE user_id = ? AND id = ?', [now, req.user.id, req.params.id]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('me/playlists delete error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/me/sync', async (req, res) => {
    try {
      const db = await getUserDb();
      const userId = req.user.id;
      const favorites = Array.isArray(req.body?.favorites) ? req.body.favorites : [];
      const playlists = Array.isArray(req.body?.playlists) ? req.body.playlists : [];

      // §G2 入口守衛 —— 呢條就係「登入合併令死 id 返生」嗰條路。一次過查晒
      // favorites + 所有清單入面嘅 song id,慳返逐條 query。
      const allIds = [
        ...favorites,
        ...playlists.flatMap((pl) => (Array.isArray(pl?.songs) ? pl.songs.map((s) => s?.id) : [])),
      ];
      const liveIds = await existingHymnIds(allIds);

      let droppedFavs = 0;
      for (const raw of favorites) {
        const hymnId = parseInt(raw, 10);
        if (!Number.isFinite(hymnId)) continue;
        if (liveIds && !liveIds.has(hymnId)) { droppedFavs++; continue; }
        db.run('INSERT OR IGNORE INTO favorites (user_id, hymn_id) VALUES (?, ?)', [userId, hymnId]);
      }
      if (droppedFavs > 0) {
        console.log(`🧹 /api/me/sync (user ${userId}) 拒收 ${droppedFavs} 個唔存在嘅 hymn_id`);
      }

      for (const pl of playlists) {
        if (!pl || typeof pl.id !== 'string') continue;
        upsertPlaylist(db, userId, pl.id, pl, liveIds);
      }

      saveUserDb(db);
      res.json(getData(db, userId));
    } catch (err) {
      console.error('me/sync error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}
