// routes/admin.js — 管理員功能(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.4)。
// 全部行 requireAuth + requireAdmin。

import { Router } from 'express';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import requireAuth from '../lib/requireAuth.js';
import requireAdmin from '../lib/requireAdmin.js';
import { openDb, query, formatDuration, isInSongDurationBand, isCompilation, isNonWorship, SONG_DURATION_MIN } from '../lib/hymnDb.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { YTDLP } from '../lib/ytdlpBin.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { updateHymn, insertHymn, delistHymn, EDITABLE_FIELDS } from '../lib/adminHymns.js';
import { getDataVersion } from '../lib/serverDb.js';

const execFile = promisify(execFileCb);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_LOG_PATH = path.join(__dirname, '..', 'logs', 'admin-audit.log');

// audit log(§3.5)—— 逐個寫操作一行 JSON。寫入失敗淨係 console.error,唔 fail
// 個 request(得 Eric 一個 admin,audit 係追溯用,可用性行先)。
//
// ⚠️ Opus 5 驗收揪出:logs/ 開出嚟預設 755,§4 安全考量表明講「backups/ 同
// logs/ 都喺 .gitignore,目錄 700」——同 backupUsersDb.js 一致做法(mkdirSync
// 帶 mode 淨係對「新建」有效,已經存在嘅目錄 mode 唔會變,所以要額外
// chmodSync 一次先保證到 700,唔理呢個目錄係咪已經以錯誤 mode 開咗)。
function appendAudit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(AUDIT_LOG_PATH), 0o700);
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('admin-audit 寫入失敗:', e?.message);
  }
}

function whoOf(user) {
  return user.email || user.phone || `#${user.id}`;
}

// 讀 admin-audit.log(§二/§3.1 MYPAGE-ADMIN-CHIPS-PLAN)—— 「我加過嘅歌」「已下架」
// 兩個 endpoint 共用。檔案唔存在(全新環境,冇 admin 操作過)回空 list;逐行
// JSON.parse 包 try/catch,寫入途中中斷嘅壞行直接跳過,唔好累成個 endpoint 死。
function readAuditLog() {
  let raw;
  try {
    raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // 壞行——跳過
    }
  }
  return out;
}

// 按 hymn_id 淨留最新一條(按 ts 比較字串已經夠——ISO 格式天生可排序),
// 新→舊排。
function latestPerHymn(entries) {
  const byHymn = new Map();
  for (const e of entries) {
    const prev = byHymn.get(e.hymn_id);
    if (!prev || e.ts > prev.ts) byHymn.set(e.hymn_id, e);
  }
  return [...byHymn.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

// batch join hymns_all,衍生 in_library/listed flag(§一定義:listed 要跟足
// `hymns` view 三個條件,唔可以淨係睇 curated)。entries 已經 dedupe 過。
async function joinHymnActivity(entries, tsField) {
  if (!entries.length) return [];
  const db = await openDb();
  const ids = entries.map((e) => e.hymn_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = query(
    db,
    `SELECT id, youtube_id, display_title, title, artist, curated, status FROM hymns_all WHERE id IN (${placeholders})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return entries.map((e) => {
    const hymn = byId.get(e.hymn_id) || null;
    const in_library = !!hymn;
    const listed = !!hymn && Number(hymn.curated) === 1 && hymn.status !== 'dead' && hymn.status !== 'rejected';
    return { hymn, in_library, listed, [tsField]: e.ts };
  });
}

function audit(req, action, hymnId, before, after) {
  appendAudit({
    ts: new Date().toISOString(),
    user_id: req.user.id,
    who: whoOf(req.user),
    action,
    hymn_id: hymnId,
    before,
    after,
  });
}

// preview 專用限速(§3.4:每下都 spawn yt-dlp,per-user 10/min,比 requireAdmin
// 嗰個 60/min 通盤限速更緊)。
const PREVIEW_RATE_WINDOW_MS = 60 * 1000;
const PREVIEW_RATE_MAX = 10;
const previewRateByUser = new Map();
function previewRateLimited(userId) {
  const now = Date.now();
  const rec = previewRateByUser.get(userId);
  if (!rec || now - rec.windowStart > PREVIEW_RATE_WINDOW_MS) {
    previewRateByUser.set(userId, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > PREVIEW_RATE_MAX;
}

// 唔好將原始 URL 掟落 shell:先由已知格式抽 11 字元 video id,之後一律用
// server 自己砌嘅 canonical URL + execFile(參數陣列,唔行 shell string)。
const VIDEO_ID_IN_URL_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
function extractVideoId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(VIDEO_ID_IN_URL_RE);
  return m ? m[1] : null;
}

// 驗證:string、trim 後(album/title_en 可以清空,其他唔准)、≤200 字元、
// strip 控制字元(同 §5.6 display_name 一致)。回 null = 唔啱格式。
// performer:TAXONOMY-5D-PLAN.md §2.2「搵唔到留空 ''」,准清空;org 一定
// 要有值(P1 驗證 `org=''` 必須=0),唔加入呢個 set。
const OPTIONAL_EMPTY_FIELDS = new Set(['album', 'title_en', 'performer']);
function validateField(key, value) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  if (v.length > 200) return null;
  if (!v && !OPTIONAL_EMPTY_FIELDS.has(key)) return null;
  return v;
}

// kids / instrumental:獨立 int 欄(0/1),唔係 string,所以要獨立驗證,
// 唔可以行 validateField 嗰套(嗰度會 String() 咗佢,0 會變空字串再被
// 判做「必填但空」)。接受 0/1 或者 boolean(前端 Switch 送 boolean、
// script 送 number,兩邊都兼容)。回 null = 唔啱格式。
//   kids        —— TAXONOMY-5D-PLAN.md §8 C2 觀察②
//   instrumental —— INSTRUMENTAL-CATEGORY-PLAN §3.3 #4(Phase 2d)
const INT_FLAG_FIELDS = new Set(['kids', 'instrumental']);
function validateIntFlagField(value) {
  if (value === 0 || value === 1) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

export default function adminRoutes(app) {
  const router = Router();

  // GET /api/admin/hymns/:id —— 由 hymns_all 讀全行(包 curated/status,俾編輯
  // sheet 預填;`hymns` view 睇唔到已落架嘅,admin 要睇到)。開新鮮 openDb()
  // 唔靠 serverDb 個 cache——admin 隨時要睇夜晚 job 啱啱先改嘅最新狀態。
  router.get('/hymns/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_id' });
    try {
      const db = await openDb();
      const hymn = query(db, 'SELECT * FROM hymns_all WHERE id = ?', [id])[0];
      if (!hymn) return res.status(404).json({ error: 'not_found' });
      res.json({ hymn });
    } catch (e) {
      console.error('admin GET hymn error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // PATCH /api/admin/hymns/:id —— 改歌 metadata,白名單以外一律 400。
  router.patch('/hymns/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_id' });
    const body = req.body || {};
    const keys = Object.keys(body);
    if (!keys.length) return res.status(400).json({ error: 'no_fields' });
    const badKey = keys.find((k) => !EDITABLE_FIELDS.includes(k));
    if (badKey) return res.status(400).json({ error: 'field_not_allowed', field: badKey });

    const fields = {};
    for (const k of keys) {
      if (INT_FLAG_FIELDS.has(k)) {
        const v = validateIntFlagField(body[k]);
        if (v === null) return res.status(400).json({ error: 'bad_field_value', field: k });
        fields[k] = v;
        continue;
      }
      const v = validateField(k, body[k]);
      if (v === null) return res.status(400).json({ error: 'bad_field_value', field: k });
      fields[k] = v;
    }

    try {
      const { before, after, hymn } = await updateHymn(id, fields);
      audit(req, 'edit', id, before, after);
      res.json({ ok: true, hymn, dataVersion: getDataVersion() });
    } catch (e) {
      if (e.code === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.code === 'db_busy') return res.status(503).json({ error: 'db_busy' });
      console.error('admin PATCH hymn error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/admin/hymns/preview —— 貼 URL 攞 metadata + 過濾預警(唔寫 DB)。
  router.post('/hymns/preview', async (req, res) => {
    if (previewRateLimited(req.user.id)) return res.status(429).json({ error: 'rate_limited' });

    const videoId = extractVideoId(req.body?.url);
    if (!videoId) return res.status(400).json({ error: 'bad_url', message: '唔係有效嘅 YouTube 連結' });

    // 撞庫 check 行先(§3.4)—— 已喺庫就唔使再燒 yt-dlp。開新鮮 openDb() 避免
    // 撞正夜晚 job 啱啱先收咗佢嗰個窄縫。
    try {
      const db = await openDb();
      const existing = query(db, 'SELECT * FROM hymns_all WHERE youtube_id = ?', [videoId])[0];
      if (existing) {
        if (Number(existing.curated) === 1) return res.json({ exists: true, hymn: existing });
        return res.json({ relistable: true, hymn: existing });
      }
    } catch (e) {
      console.error('admin preview dedupe check error:', e.message);
      return res.status(500).json({ error: 'server_error' });
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let stdout;
    try {
      const r = await execFile(
        YTDLP,
        ['--print', '%(id)s|%(duration)s|%(title)s|%(channel)s', '--no-playlist', canonicalUrl],
        { timeout: 20000 }
      );
      stdout = r.stdout.trim();
    } catch (e) {
      console.warn('admin preview yt-dlp failed:', e?.message);
      return res.status(422).json({ error: 'metadata_failed', message: '攞唔到片段資料,可能已下架或者連結唔啱' });
    }

    // 同 lib/hymnDb.js listChannelVideos 一致嘅切法:title 本身可以帶「|」,
    // 唔可以淨係 split('|')——靠位置切(id 喺頭、channel 喺尾)。
    const i1 = stdout.indexOf('|');
    const i2 = stdout.indexOf('|', i1 + 1);
    const i3 = stdout.lastIndexOf('|');
    const ytId = stdout.slice(0, i1);
    const durationRaw = stdout.slice(i1 + 1, i2);
    const title = stdout.slice(i2 + 1, i3);
    const channel = stdout.slice(i3 + 1);
    const durationNum = Number(durationRaw);
    const duration = Number.isFinite(durationNum) && durationNum > 0 ? durationNum : null;

    // 過濾預警(提示唔係攔截 —— §3.4:規則係幫 Eric 唔係限佢)。
    const warnings = [];
    if (!isInSongDurationBand(duration)) {
      if (duration == null) warnings.push('拎唔到片長');
      else if (duration < SONG_DURATION_MIN) warnings.push(`片長${formatDuration(duration)},短過正常歌帶`);
      else warnings.push(`片長${formatDuration(duration)},超出正常歌帶`);
    }
    if (isCompilation(title)) warnings.push('標題似合輯/節目');
    if (isNonWorship(title, channel)) warnings.push('標題/頻道似非敬拜內容');

    res.json({
      youtube_id: ytId || videoId,
      title,
      display_title: cleanDisplayTitle(title, channel),
      channel,
      duration,
      warnings,
    });
  });

  // POST /api/admin/hymns —— 加歌流程下半場(preview 改完嘅最終值)。
  router.post('/hymns', async (req, res) => {
    const body = req.body || {};
    const videoId = /^[A-Za-z0-9_-]{11}$/.test(body.youtube_id || '') ? body.youtube_id : null;
    if (!videoId) return res.status(400).json({ error: 'bad_youtube_id' });

    const fields = { youtube_id: videoId };
    for (const k of ['title', 'display_title', 'artist', 'category', 'lang']) {
      const v = validateField(k, body[k]);
      if (v === null) return res.status(400).json({ error: 'bad_field_value', field: k });
      fields[k] = v;
    }
    // org:TAXONOMY-5D-PLAN.md §3.5,選填——冇填 insertHymn() 會 fallback 做
    // artist(fresh insert)或者保留現有 org(relist,觀察①)。前端
    // AdminAddHymnScreen.js 而家未加呢個輸入欄(C1 範圍淨係
    // AdminEditHymnSheet.js),但 route/lib 層先行支援,方便日後補 UI。
    for (const k of ['album', 'title_en', 'org']) {
      if (body[k] === undefined) continue;
      const v = validateField(k, body[k]);
      if (v === null) return res.status(400).json({ error: 'bad_field_value', field: k });
      fields[k] = v;
    }
    // kids:§8 C2 觀察②,選填——冇填 insertHymn() fresh insert 預設 0、relist
    // 保留現有值,唔再由 lang==='兒童' 推斷。
    // (instrumental 刻意**唔**喺呢條 POST 路徑收:Phase 2 決定④ = Add 畫面
    //  唔加 UI,新器樂歌 Phase 4 走 script 落 flag,所以呢度冇 caller。
    //  要改就用 PATCH,嗰邊 INT_FLAG_FIELDS 已經收。)
    if (body.kids !== undefined) {
      const v = validateIntFlagField(body.kids);
      if (v === null) return res.status(400).json({ error: 'bad_field_value', field: 'kids' });
      fields.kids = v;
    }
    if (Number.isFinite(body.duration)) fields.duration = body.duration;

    // 攞鎖之前:resolveAudioUrl 驗活(preview 過嘅多數已經 warm,呢下順手暖埋
    // URL cache——入完庫即刻播都係 warm 路徑)。resolve 唔到回 422。
    try {
      await resolveAudioUrl(videoId);
    } catch (e) {
      return res.status(422).json({ error: 'resolve_failed', message: '拎唔到音訊' });
    }

    try {
      const { before, after, hymn, relisted } = await insertHymn(fields);
      // 防呆(Opus 5 驗收揪出嗰個 500 嘅根因已經喺 adminHymns.js 修咗,但呢度
      // 都加多重 null 檢查——寧願回清楚嘅 500 俾前端顯示錯誤,都好過 `hymn.id`
      // 拋 TypeError 冧成個 request,累個寫入本身成功咗但用戶完全唔知。
      if (!hymn) {
        console.error('admin POST hymns: insertHymn 冇回 hymn(寫入可能已成功但讀唔返)');
        return res.status(500).json({ error: 'server_error', message: '入庫可能已成功,但讀唔返資料,請檢查詩歌庫' });
      }
      audit(req, relisted ? 'relist' : 'add', hymn.id, before, after);
      res.json({ ok: true, hymn, dataVersion: getDataVersion() });
    } catch (e) {
      if (e.code === 'conflict') return res.status(409).json({ error: 'already_curated' });
      if (e.code === 'db_busy') return res.status(503).json({ error: 'db_busy' });
      console.error('admin POST hymns error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/admin/hymns/:id/delist
  router.post('/hymns/:id/delist', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_id' });
    try {
      const { before, after, hymn, idempotent } = await delistHymn(id);
      if (!idempotent) audit(req, 'delist', id, before, after);
      res.json({ ok: true, hymn, dataVersion: getDataVersion() });
    } catch (e) {
      if (e.code === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.code === 'db_busy') return res.status(503).json({ error: 'db_busy' });
      console.error('admin delist error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/admin/activity/added —— 「我加過嘅歌」(§3.1)。⚠️ 路徑刻意唔用
  // /hymns/added——現有 GET /hymns/:id 會食咗佢變 bad_id 400。純讀 audit log,
  // read-only query 唔使攞 db lock(鎖規矩只管寫操作)。
  router.get('/activity/added', async (req, res) => {
    try {
      const mine = readAuditLog().filter(
        (e) => e.user_id === req.user.id && (e.action === 'add' || e.action === 'relist')
      );
      const items = (await joinHymnActivity(latestPerHymn(mine), 'acted_at')).slice(0, 100);
      res.json({ items });
    } catch (e) {
      console.error('admin activity/added error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/admin/activity/delisted —— 「已下架」(§3.2)。同上讀 audit log,
  // 分別:filter action==='delist',join 完之後只留現時 status==='rejected'
  // 嘅(落完架又 relist 返嘅唔應該再喺呢度出現)。
  router.get('/activity/delisted', async (req, res) => {
    try {
      const mine = readAuditLog().filter((e) => e.user_id === req.user.id && e.action === 'delist');
      const items = (await joinHymnActivity(latestPerHymn(mine), 'delisted_at')).filter(
        (it) => it.hymn && it.hymn.status === 'rejected'
      );
      res.json({ items });
    } catch (e) {
      console.error('admin activity/delisted error:', e.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.use('/api/admin', requireAuth, requireAdmin, router);
}
