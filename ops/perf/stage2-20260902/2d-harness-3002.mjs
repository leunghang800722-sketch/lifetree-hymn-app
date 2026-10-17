// PERF-STAGE2-2D-20260902 —— 精簡 harness backend,起喺 port 3002。
//
// 目的:live production backend(3001)因為鐵律「唔准部署/restart」仲未
// 有 C-1(A-6)嘅 `?lite=1` / `/api/hymns/lyrics` 兩條 route(backend 代碼
// 已經 commit 到 ab78c98,只係 live process 未 reload)。要 A/B 量度 2D
// 嘅 BEFORE(HEAD 現有 frontend)vs AFTER(C-1 client)build,兩個 build 要
// 打同一個「已經有 C-1 endpoint」嘅 backend,先可以將 bytes/時間差歸因
// 得返落 frontend 改動本身,而唔係「一個 build 撞到新 endpoint、一個撞
// 唔到」嘅假差異。
//
// 鐵律:
//   - 唔准 import backend/server.js(佢有 precache/keep-warm 等背景 burst,
//     冇 env guard 可以完全關晒,執行單 §2A 明文話「只有全部背景 burst 都
//     關得掉先可以起第二個 instance,否則用直接複製 route handler 嘅方式
//     量」——揀後者)。
//   - 唔准放喺 backend/ 底下(memory: scratch script 放 backend/ 會令
//     backend-restart.sh 過唔到 deploy gate,唔准繞 gate)——呢個檔全程
//     留喺 scratchpad,用絕對路徑 import backend 嘅 node_modules/lib。
//   - 唔起真 keep-warm/precache——`lib/serverDb.js` 本身冇呢啲背景 job
//     (淨係 lazy getDb() + dataVersion 追蹤),`getWarmCandidates`/
//     `enablePersistence` 呢啲先係 server.js 自己 wiring 出嚟嘅背景嘢,
//     呢個 harness 完全冇 import 佢哋。
//   - 只讀 hymns.db(sql.js `new SQL.Database(buffer)`,冇寫入 API),同
//     Opus 5 2A 驗收用嘅手法一致。
//
// 路由(逐字複製 backend/server.js 現時(ab78c98)嘅 handler 邏輯,淨係將
// import 换做絕對路徑;冇改任何判斷/欄位/cache 邏輯):
//   GET  /api/health
//   GET  /api/version        (含 maybeReload() —— C-4 out-of-process 追蹤)
//   GET  /api/hymns          (含 ?lite=1 分支,C-1)
//   GET  /api/hymns/lyrics   (C-1)
//   POST /api/client-log     (格式抄 backend/routes/clientLog.js,唔 import
//                              嗰個檔——避免佢嘅 appendClientLog() 寫入
//                              backend/logs/,呢個 harness 淨係 console.log
//                              比 host 用 > 重定向去 scratchpad 底個 log 檔)

import express from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/express/index.js';
import cors from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/cors/lib/index.js';
import compression from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/node_modules/compression/index.js';
import { getDb, getDataVersion, maybeReload } from '/Users/macbookpro/.openclaw/workspace/hymn-app/backend/lib/serverDb.js';

const PORT = 3002;
const app = express();

app.use(cors());
app.use(express.json());

// backend/server.js 現時 compression 設定(A-2,server.js:118-124)—— 逐字複製。
const COMPRESSION_EXCLUDE_PATHS = [/^\/api\/stream/, /^\/api\/hls/, /^\/api\/audio/, /^\/app\.apk/, /^\/downloads/];
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (COMPRESSION_EXCLUDE_PATHS.some((re) => re.test(req.path))) return false;
    return compression.filter(req, res);
  },
}));

// server.js:262-264
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// server.js:268-283(C-4 maybeReload 已包含)
app.get('/api/version', (req, res) => {
  maybeReload();
  const dataVersion = getDataVersion();
  console.log(`[harness3002] 🔖 /api/version → ${dataVersion}`);
  res.set('Cache-Control', 'no-cache');
  res.json({ dataVersion });
});

// server.js:354-406(C-1 lite 分支 + C-4 maybeReload,逐字複製)
let hymnsResponseCache = null;
let hymnsLiteResponseCache = null;
let hymnsLyricsResponseCache = null;

app.get('/api/hymns', async (req, res) => {
  try {
    maybeReload();
    const lite = req.query.lite === '1';
    const currentDataVersion = getDataVersion();
    const cacheSlot = lite ? hymnsLiteResponseCache : hymnsResponseCache;
    if (cacheSlot && cacheSlot.dataVersion === currentDataVersion) {
      res.set('Content-Type', 'application/json');
      res.set('Cache-Control', 'private, max-age=0, must-revalidate');
      return res.send(cacheSlot.json);
    }
    const db = await getDb();
    const columns = lite
      ? 'id, title, display_title, artist, youtube_id, lang, duration, tags, view_count, created_at, album, title_en, org, performer, kids, instrumental'
      : 'id, title, display_title, artist, youtube_id, lang, duration, lyrics, tags, view_count, created_at, album, title_en, org, performer, kids, instrumental';
    const stmt = db.prepare(`SELECT ${columns} FROM hymns ORDER BY id`);
    const hymns = [];
    while (stmt.step()) {
      hymns.push(stmt.getAsObject());
    }
    for (const h of hymns) {
      h.real_lang = h.lang;
      if (h.kids) h.lang = '兒童';
    }
    const dataVersion = getDataVersion();
    console.log(`[harness3002] 📚 /api/hymns ${lite ? 'lite' : 'full'} fetch → ${hymns.length} hymns, dataVersion=${dataVersion}`);
    const body = JSON.stringify({ data: hymns, dataVersion });
    if (lite) hymnsLiteResponseCache = { dataVersion, json: body };
    else hymnsResponseCache = { dataVersion, json: body };
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    res.send(body);
  } catch (err) {
    console.error('[harness3002] Failed to fetch hymns:', err.message);
    res.status(500).json({ error: 'Failed to fetch hymns' });
  }
});

// server.js:431-455(C-1,逐字複製)
app.get('/api/hymns/lyrics', async (req, res) => {
  try {
    maybeReload();
    const currentDataVersion = getDataVersion();
    if (hymnsLyricsResponseCache && hymnsLyricsResponseCache.dataVersion === currentDataVersion) {
      res.set('Content-Type', 'application/json');
      res.set('Cache-Control', 'private, max-age=0, must-revalidate');
      return res.send(hymnsLyricsResponseCache.json);
    }
    const db = await getDb();
    const stmt = db.prepare("SELECT id, lyrics FROM hymns WHERE lyrics IS NOT NULL AND lyrics != '' ORDER BY id");
    const data = {};
    let count = 0;
    while (stmt.step()) {
      const row = stmt.getAsObject();
      data[row.id] = row.lyrics;
      count++;
    }
    const dataVersion = getDataVersion();
    console.log(`[harness3002] 📚 /api/hymns/lyrics fetch → ${count} hymns, dataVersion=${dataVersion}`);
    const body = JSON.stringify({ data, dataVersion });
    hymnsLyricsResponseCache = { dataVersion, json: body };
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    res.send(body);
  } catch (err) {
    console.error('[harness3002] Failed to fetch hymn lyrics:', err.message);
    res.status(500).json({ error: 'Failed to fetch hymn lyrics' });
  }
});

// 格式抄 backend/routes/clientLog.js 嘅 logLine()(唔 import 嗰個檔,避免
// appendClientLog() 寫入 backend/logs/ 持久化底——呢個 harness 淨係
// console.log,由 host 用 `> ...-clientlog.log` 重定向去 scratchpad)。
function logLine(fields) {
  console.log(`[client-log] ${new Date().toISOString()} ${Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`);
}
app.post('/api/client-log', (req, res) => {
  try {
    const b = req.body || {};
    logLine({
      event: String(b.event || '').slice(0, 64),
      clientTs: String(b.clientTs || '').slice(0, 40),
      detail: String(b.detail || '').slice(0, 300),
      platform: String(b.platform || '').slice(0, 10),
      deviceId: String(b.deviceId || '').slice(0, 40),
    });
  } catch (_) {}
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`[harness3002] listening on ${PORT}`);
});
