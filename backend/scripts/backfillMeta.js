#!/usr/bin/env node
// backfillMeta.js — TAXONOMY-5D-PLAN.md §3.2/§3.3/§8 C5+C5b:performer(歌手)+
// album(專輯) backfill。每首歌一次 `yt-dlp -J --no-playlist` 攞 title+
// description+structured artist/album/track,waterfall 四層推斷 performer,
// 同一次 call 順手 parse album。
//
// ── Waterfall(§3.2,C5b 加咗 Layer M)───────────────────────────────
//   Layer M(metadata):yt-dlp JSON 嘅結構化 `artist` 欄(Topic 式上載/YT Music
//     metadata 有填)→ performer_source='metadata'。放喺 D 之前——呢層係
//     平台自己標嘅結構化資料,比 regex 撞 description 準。
//   Layer D(description):regex 搵「主唱/演唱/獻唱/歌手/和聲/領唱/Vocal(s)?/
//     Singer/Sung by」行 → performer_source='description'
//   Layer T(title):對照 `data/knownPerformers.js` seed 名單 → 'title'
//   Layer A(AI):M/D/T 都落空嘅存做一個 batch,用 `claude -p`(headless)一次
//     過推斷,strict JSON 輸出;有把握先填,判斷純音樂就寫「純音樂」→ 'ai'
//   四層都空 → performer 留 ''(下次照樣重試,唔標記——同 fetchLyrics cc:miss
//     嗰種「泊住等下一層」唔同,呢度冇下一層,純粹留返做手動/日後 AI 進步)
//
// album(§3.3):Layer M 嘅結構化 `album` 欄 → description 嘅「Album (專輯): XXX」/
// 「專輯:XXX」行 → title 嘅「專輯 N:XXX」pattern。**唔准 AI 估**——parse 唔到
// 就留空。現有 album 有值嘅唔重寫(保護規則)。ALBUM-BACKFILL-ACCEL-PLAN.md
// Commit 1:邊層命中就 stamp 對應 `album_source`('metadata'/'description'/
// 'title'),俾 Phase A(playlist)/B(sop.org catalog)/C(search)呢類之後嘅
// backfill 分辨值嘅來歷(呢三層本身唔受影響,寫入條件不變)。
//
// ── 保護規則 ────────────────────────────────────────────────────
//   * performer_source='manual' 嘅 row 一律 skip(admin 手動改過/Lullaby 13 條)
//   * album 已有值嘅 row 唔重寫 album(performer 照常處理)
//   * 斷點續跑:candidate 揀 `performer_source=''`,寫完即刻非空,下次自動跳過
//   * 寫 DB 用 acquireDbLock(fetchLyrics 嗰個「慢工序唔揸鎖,即攞即放」pattern)
//
// ── C5b(Opus 5 三個硬條件 + 順手項,TAXONOMY-5D-PLAN.md §8 C5)──────────
//   ① DESC_PERFORMER_RE 加「歌手」(+和聲/領唱)——「歌手 (Singer):」呢類寫法
//     原本漏網,3 條(857/886/1194)客席主唱錯標盛曉玫。
//   ② 候選輪換 + 每晚 budget:唔准淨係 ORDER BY id ASC(死症 row 會塞住隊頭)。
//     加 `last_meta_attempt` 欄,每次嘗試(唔理揾唔揾到)寫 timestamp,候選
//     `ORDER BY last_meta_attempt IS NOT NULL, last_meta_attempt ASC`(未試過
//     先行,試過耐先重試)。`--limit` 預設 300(C5c followup③調高,見底下)。
//   ③ 逐條即寫:D/T/M 層命中即刻寫 DB(每條跟 acquireDbLock 節奏),唔准成晚
//     積到 run 尾先寫;Layer A batch 結果照最尾補寫(要成個 batch call 完先
//     知邊條有答案)。
//   順手:Layer M(above)、多人分隔符 normalize「、」、專輯異體字(脚步→腳步)、
//   suspected-nonsong side-output(唔改 DB,純 flag list 交 Eric 簽)。
//
// ── 排程(C5b 後開)───────────────────────────────────────────────
// 排程模式掃全庫 `performer_source=''`(冇 --org 限制),同 fetchLyrics 錯開
// 時段。現有 4000+ 首清完之後呢個排程照留低,自動接住每晚新收嘅歌。
//
// Usage:
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok           # pilot 正式跑
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --dry     # 唔寫 DB
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --limit 5 # 測試少量
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --no-ai   # 唔叫 claude -p
//   node scripts/backfillMeta.js --limit 300                          # 排程用:全庫掃

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { matchTitlePerformer } from '../data/knownPerformers.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const STATUS = arg('--status', 'ok');
// C5c followup③:預設 160→300(Opus 實測評估 300 安全,16-21 分鐘完場仍有
// 30 分鐘水位先到 18:40 alignBackfill)。原本 `Number(...) || 160` 有 falsy
// bug——`--limit 0`(意圖:無限量,見底下 `if (LIMIT)` slice 邏輯)會俾 `||`
// 打番做 160,表達唔到「0=無限」。改用 Number.isFinite 判斷。
const limitArgRaw = Number(arg('--limit', 300));
const LIMIT = Number.isFinite(limitArgRaw) ? limitArgRaw : 300;
const DELAY_MS = Number(arg('--delay', 3500));
const AI_BATCH_SIZE = Number(arg('--ai-batch-size', 25));
const DRY = process.argv.includes('--dry');
const NO_AI = process.argv.includes('--no-ai');
const REPORT_PATH = arg('--report', path.join(__dirname, '..', 'data', 'backfill-meta-pilot.md'));
const NONSONG_PATH = path.join(__dirname, '..', 'data', 'suspected-nonsong.md');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// ── Layer D:description 主唱/演唱/獻唱/歌手/和聲/領唱/Vocal(s)/Singer/Sung by ─
// 括號註解可選(跟 album regex 同一個教訓:呢個 org 嘅 description template
// 有時會用「中文標籤 (英文標籤):」或者反過來嘅次序,例如 album 嗰行實測撞過
// 「專輯 ( Album ): XXX」——即使呢個 pilot 冇撞到 Vocal/主唱 呢類行,都預先
// 用同一個容錯 pattern,唔使下次先再補一次同類 fix)。
// ⚠️ C5b①(Opus 5 硬條件):原本冇「歌手」——泥土音樂實測有片用
// 「歌手 (Singer) : 郭小晗 Raven Guo」template,漏網跌落 Layer T 錯標盛曉玫
// (857/886/1194,6.1% 錯標率)。順手加「和聲」「領唱」(同類客席/伴唱標籤)。
const DESC_PERFORMER_RE = /^(?:主唱|演唱|獻唱|歌手|和聲|領唱|vocals?|singer|sung\s*by)\s*(?:[\(（][^)）]*[\)）]\s*)?[:：]\s*(.+)$/im;
function matchDescriptionPerformer(description) {
  if (!description) return null;
  const m = description.match(DESC_PERFORMER_RE);
  if (!m) return null;
  let name = m[1].trim();
  name = name.replace(/[\(（].*?[\)）]/g, '').trim(); // 去括號註解
  name = name.replace(/^[:：\s]+|[,，、\s]+$/g, '').trim();
  if (!name || name.length > 40) return null;
  return name;
}

// ── Layer M:yt-dlp JSON 結構化 artist/album 欄(C5b 順手項)───────────────
// Topic 式上載/YT Music 有填 metadata 嘅片,`info.artist` 通常係
// 「廠牌/事工名, 歌手名」(例:「泥土音樂, 盛曉玫」),要清走 org 名先淨返
// 歌手。淨用「呢條 row 自己嘅 org」做清走目標(唔靠 worshipGroups 全表估估
// 吓,更準、亦唔會夾到第二個團體個名)。
// C5c followup②:org-strip 收貨修正。(a) 全部 parts 都係 org 時,原本回退
// 寫 org 名做 performer——而家改成回退 null(留空好過寫 org,唔好鎖死呢條
// row,留返俾下次/Layer A 補)。(b) exact 比對兜唔到 `artist='Stream of
// Praise 讚美之泉'` vs `org='讚美之泉'` 呢種 org 名做前綴/後綴嘅寫法——strip
// 條件放寬做「part 包含 org 或 org 包含 part」。
function extractMetaPerformer(rawArtist, rowOrg) {
  if (!rawArtist || typeof rawArtist !== 'string') return null;
  const parts = rawArtist.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const filtered = rowOrg
    ? parts.filter((p) => !(p === rowOrg || p.includes(rowOrg) || rowOrg.includes(p)))
    : parts;
  if (!filtered.length) return null; // (a) 成串都係 org 名 → 留空,唔好寫 org
  const name = filtered.join('、');
  if (!name || name.length > 40) return null;
  return name;
}
function extractMetaAlbum(rawAlbum) {
  if (!rawAlbum || typeof rawAlbum !== 'string') return null;
  return sanitizeAlbum(rawAlbum);
}

// ── 多人分隔符 normalize(§2.2:performer 多人用「、」分隔)───────────────
// 寫入前一律過呢個 filter,唔理邊層(M/D/T/A)出嚟嘅值。
const SEPARATOR_RE = /\s*(?:&amp;|&|feat\.?|,|，)\s*/gi;
function normalizeSeparators(name) {
  if (!name) return name;
  return name.replace(SEPARATOR_RE, '、').replace(/、{2,}/g, '、').replace(/^、+|、+$/g, '').trim();
}

// ── 專輯異體字 canonical(C5b 順手項)──────────────────────────────────
// known pair:「脚步」(日文/簡寫異體字)→「腳步」(正體)。之後撞到第二個
// pair 就加落呢個 map。
const ALBUM_CANONICAL = { 脚步: '腳步' };
function canonicalizeAlbum(album) {
  if (!album) return album;
  return ALBUM_CANONICAL[album] || album;
}

// ── album:description「Album (專輯): XXX」/「專輯:XXX」、title「專輯 N:XXX」──
// 兩邊都經 sanitizeAlbum 過濾——專輯名應該短(幾個字),太長/帶宣傳字眼嘅
// 當 parse 失敗處理(留空好過寫錯,§3.3 明文「唔准 AI 估」,parse 唔到都係
// 寧願留空)。
//
// ⚠️ 實測踩過嘅坑(泥土音樂 id=55「醫治的愛」):有啲片嘅 description/title
// 會**連寫兩次「專輯」**,例如 description 行「專輯：盛曉玫/泥土音樂專輯 –
// 好心情」——真正專輯名喺**最後一個**「專輯」之後(「好心情」),前面嘅
// 「盛曉玫/泥土音樂專輯」係「邊個團體嘅邊隻專輯」嘅前綴,唔係專輯名本身。
// 淨用第一個 regex match 會撞正「盛曉玫/」呢類前綴,俾 sanitizeAlbum 嘅
// 「/」cut 字符切到得返「盛曉玫」——寫錯做專輯名。修法:搵**最後一個**
// 「專輯」字眼,淨取佢後面嘅尾段做候選,先再過 sanitize。
function pickAlbumFromCandidate(raw) {
  if (!raw) return null;
  const idx = raw.lastIndexOf('專輯');
  const tail = idx === -1 ? raw : raw.slice(idx + 2);
  const stripped = tail.replace(/^[\s:：\-–\d.)）]+/, ''); // 剝走開頭嘅數字/分隔符/尾隨括號
  return sanitizeAlbum(stripped);
}
function sanitizeAlbum(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  const cutIdx = s.search(/[,，、/／|｜！!？?（(【\[\]】)]/);
  if (cutIdx > 0) s = s.slice(0, cutIdx).trim();
  if (!s || s.length > 12) return null;
  if (/(發行|最新|下載|購買|支持|訂閱|album)/i.test(s)) return null;
  return canonicalizeAlbum(s);
}
// ⚠️ 實測踩過第二個坑(id=856「盛曉玫詩歌 有一天」呢類「XX詩歌」重上載版本):
// description 用嘅係**反轉次序**「專輯 ( Album ): 有一天」,唔係最初樣本
// (id=47《腳步》)嗰種「Album (專輯): 脚步」——兩個版本個 template 唔同,兩個
// keyword 邊個行先都可能出現,仲可能夾埋英文/中文括號註解。用一個 regex
// 兩種次序都收,parenthetical 註解當可選跳過。
function extractAlbumFromDescription(description) {
  if (!description) return null;
  const lines = (description || '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(?:Album|專輯)\s*(?:[\(（]\s*(?:Album|專輯)\s*[\)）]\s*)?[:：]\s*(.+)$/i);
    if (m) return pickAlbumFromCandidate(m[1]);
  }
  return null;
}
function extractAlbumFromTitle(title) {
  if (!title || !title.includes('專輯')) return null;
  return pickAlbumFromCandidate(title);
}

// ── suspected-nonsong side-output(C5b 順手項,唔改 DB)──────────────────
// title 撞呢批 pattern = 疑似唔係一首完整歌(歌譜/教學/訪談/組曲/花絮等),
// 純粹 flag 落 backend/data/suspected-nonsong.md 等 C6 前交 Eric 簽,同
// K-C-triage.md 同一款做法。用 id 去重,唔會同一條片夜夜重複 append。
const NONSONG_TITLE_RE = /歌譜|教學|訪談|組曲|花絮|連續播放|\d+分鐘|的故事|發行|一次聽|完整版/;
function loadFlaggedNonsongIds() {
  try {
    const content = fs.readFileSync(NONSONG_PATH, 'utf8');
    const ids = new Set();
    for (const m of content.matchAll(/^\|\s*(\d+)\s*\|/gm)) ids.add(Number(m[1]));
    return ids;
  } catch (_) {
    return new Set();
  }
}
function appendSuspectedNonsong(rows) {
  if (!rows.length) return;
  const exists = fs.existsSync(NONSONG_PATH);
  const lines = [];
  if (!exists) {
    lines.push('# suspected-nonsong —— backfillMeta.js title regex flag 清單');
    lines.push('');
    lines.push('> TAXONOMY-5D-PLAN.md §8 C5b 順手項。純 flag list,唔改 DB。C6 開閘前');
    lines.push('> 要交 Eric 簽(剔走/留低),同 K-C-triage.md 同一款做法。');
    lines.push('');
    lines.push('| id | youtube_id | title | 撞中 pattern | 發現時間 |');
    lines.push('|---|---|---|---|---|');
  }
  for (const r of rows) {
    lines.push(`| ${r.id} | ${r.youtube_id} | ${mdEscape(r.title)} | ${r.hit} | ${stamp()} |`);
  }
  fs.appendFileSync(NONSONG_PATH, `${lines.join('\n')}\n`, 'utf8');
}

// ── yt-dlp -J:攞 title+description+structured artist/album(唔落載)──────
async function fetchYtMeta(youtubeId) {
  try {
    const { stdout } = await execFile(
      'yt-dlp',
      ['-J', '--no-playlist', '--skip-download', `https://www.youtube.com/watch?v=${youtubeId}`],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout);
    return {
      title: info.title || '',
      description: info.description || '',
      artist: info.artist || null,
      album: info.album || null,
    };
  } catch (e) {
    return null;
  }
}

// ── 欄位 migration(idempotent,C5b②)───────────────────────────────────
function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}
async function ensureLastMetaAttemptColumn() {
  const token = await acquireDbLock('backfillMeta-migrate');
  if (!token) { log('⚠ 攞唔到 DB 鎖去加 last_meta_attempt 欄,收工'); process.exit(1); }
  try {
    const db = await openDb();
    if (!hasColumn(db, 'hymns_all', 'last_meta_attempt')) {
      log('ALTER TABLE hymns_all ADD COLUMN last_meta_attempt TEXT');
      db.run('ALTER TABLE hymns_all ADD COLUMN last_meta_attempt TEXT');
      saveDb(db);
    }
  } finally {
    releaseDbLock(token);
  }
}

// ── DB 寫入(帶鎖,即攞即放——跟 fetchLyrics.js writeLyricsRow 一致 pattern)──
// C5b③:D/T/M 命中即刻 call 呢個(唔准成晚積到 run 尾)。DRY 模式唔真係寫,
// 但都要清楚噉話俾人知係咪真係寫咗(修埋 C5b⑧嗰個誤導 log)。
async function writeRow(id, fields) {
  if (!Object.keys(fields).length) return true;
  if (DRY) return true; // dry:淨係話你知會寫咩,唔真係碰 DB
  const token = await acquireDbLock('backfillMeta');
  if (!token) {
    log(`    ⚠ 攞唔到 DB 鎖,id=${id} 呢首寫唔到(下次再嚟)`);
    return false;
  }
  try {
    const freshDb = await openDb();
    const cols = Object.keys(fields);
    freshDb.run(
      `UPDATE hymns_all SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`,
      [...cols.map((c) => fields[c]), id]
    );
    saveDb(freshDb);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

// ── candidate 揀選:performer_source='' 先揀(斷點續跑 + manual 保護一齊達成,
// 因為 admin 改過嘅 row performer_source='manual' != '')。
// C5b②:唔准淨係 ORDER BY id ASC——三層皆空嘅死症 row 會永遠塞住隊頭,
// budget 一到就每晚重跑同一批。改用 last_meta_attempt 輪換:未試過(NULL)
// 先行,試過嘅耐先重試。─────────────────────────────────────────────
function pickCandidates(db) {
  const conds = ["performer_source = ''"];
  const params = [];
  if (ORG) { conds.push('org = ?'); params.push(ORG); }
  if (STATUS) { conds.push('status = ?'); params.push(STATUS); }
  return query(db, `SELECT id, youtube_id, title, artist, org, album, performer_source, last_meta_attempt
                    FROM hymns_all WHERE ${conds.join(' AND ')}
                    ORDER BY last_meta_attempt IS NOT NULL, last_meta_attempt ASC`, params);
}

// ── Layer A:claude -p headless 批量推斷(M/D/T 都落空嘅先入呢層)─────────
async function checkClaudeCliAvailable() {
  try {
    await execFile('claude', ['-p', '回覆得返一個字:ok'], { timeout: 30000 });
    return true;
  } catch (e) {
    return false;
  }
}

function buildAiPrompt(items) {
  const payload = items.map((it) => ({
    youtube_id: it.youtube_id,
    title: it.title,
    description: (it.description || '').slice(0, 400),
  }));
  return [
    '你係詩歌 metadata 分析員。以下每首歌俾你 youtube_id、title、description(節錄)。',
    '判斷呢首歌嘅實際演唱者(performer)係邊個人/組合。',
    '規則:',
    '- 有把握先答,唔肯定就答 null,唔好靠估',
    '- 如果內容明顯係純音樂/無人聲版本,答字串「純音樂」',
    '- 答案淨係人/組合名(唔超過 20 字),唔好加多餘文字/解釋',
    '- 唔准估專輯名,唔使理 album',
    '',
    '輸出**只可以係**一個 JSON object,key=youtube_id,value=performer字串或者null,',
    '唔准有其他文字、唔准 markdown code fence、唔准解釋。',
    '',
    '例:{"abc123": "盛曉玫", "def456": null, "ghi789": "純音樂"}',
    '',
    '資料:',
    JSON.stringify(payload),
  ].join('\n');
}

function parseAiJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (_) {}
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  return null;
}

async function runAiBatch(items) {
  if (!items.length) return {};
  const prompt = buildAiPrompt(items);
  try {
    const { stdout } = await execFile('claude', ['-p', prompt], { timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
    const parsed = parseAiJson(stdout);
    if (!parsed || typeof parsed !== 'object') {
      log(`    ⚠ AI batch 回應 parse 唔到 JSON(前 200 字):${(stdout || '').slice(0, 200)}`);
      return {};
    }
    const out = {};
    for (const it of items) {
      const v = parsed[it.youtube_id];
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' && v.trim().length <= 40) {
        out[it.youtube_id] = v.trim();
      }
    }
    return out;
  } catch (e) {
    log(`    ⚠ claude -p 執行失敗:${e?.message || e}`);
    return null; // null = CLI 行唔到(同「行到但冇答案」分開,俾 main() 分辨)
  }
}

async function main() {
  log(`backfillMeta:org=${ORG || '(全庫)'} status=${STATUS} limit=${LIMIT} dry=${DRY} no-ai=${NO_AI}`);

  await ensureLastMetaAttemptColumn();

  const db = await openDb();
  let cands = pickCandidates(db);
  log(`候選(performer_source=''${ORG ? ` AND org='${ORG}'` : ''}${STATUS ? ` AND status='${STATUS}'` : ''},last_meta_attempt 輪換排序):${cands.length} 首`);
  if (LIMIT) cands = cands.slice(0, LIMIT);
  log(`本次 budget 取:${cands.length} 首`);

  const flaggedNonsongIds = loadFlaggedNonsongIds();
  const newNonsongFlags = [];

  const ytCache = new Map(); // youtube_id -> meta(或 null=fetch失敗) —— 同一片多個 row 共用,慳 API
  const results = []; // { row, meta, performer, performerSource, album, fetchFailed, writtenImmediately }
  const aiCandidates = []; // M/D/T 都落空,入 AI batch

  let immediateWriteCount = 0;

  for (let i = 0; i < cands.length; i++) {
    const row = cands[i];
    log(`  [${i + 1}/${cands.length}] id=${row.id} ${row.youtube_id} 「${row.title}」`);
    let meta = ytCache.get(row.youtube_id);
    let alreadyFetched = meta !== undefined;
    if (!alreadyFetched) {
      meta = await fetchYtMeta(row.youtube_id);
      ytCache.set(row.youtube_id, meta);
      if (i < cands.length - 1) await sleep(jitter(DELAY_MS));
    } else {
      log('    (同一條片,重用 cache,唔再叫 yt-dlp)');
    }

    if (!meta) {
      log('    ⚠ yt-dlp -J 攞唔到 metadata,skip(下次再試)');
      // C5b②:fetch 失敗都要蓋 last_meta_attempt,唔係就會同「死症」row 一樣
      // 永遠塞喺候選隊頭,夜夜重試同一批壞片。
      await writeRow(row.id, { last_meta_attempt: stamp() });
      results.push({ row, fetchFailed: true });
      continue;
    }

    // suspected-nonsong flag(唔改 DB,純側寫)
    const checkTitle = meta.title || row.title;
    const nonsongHit = checkTitle.match(NONSONG_TITLE_RE);
    if (nonsongHit && !flaggedNonsongIds.has(row.id)) {
      newNonsongFlags.push({ id: row.id, youtube_id: row.youtube_id, title: checkTitle, hit: nonsongHit[0] });
      flaggedNonsongIds.add(row.id);
    }

    // ── waterfall:Layer M → D → T ──────────────────────────────────
    const metaPerformerRaw = extractMetaPerformer(meta.artist, row.org);
    const descPerformerRaw = metaPerformerRaw ? null : matchDescriptionPerformer(meta.description);
    const titlePerformerRaw = (metaPerformerRaw || descPerformerRaw) ? null : matchTitlePerformer(meta.title || row.title);

    const performerRaw = metaPerformerRaw || descPerformerRaw || titlePerformerRaw || null;
    let performerSource = metaPerformerRaw ? 'metadata' : (descPerformerRaw ? 'description' : (titlePerformerRaw ? 'title' : null));
    let performer = performerRaw ? normalizeSeparators(performerRaw) : null;
    // C5c followup②(c):保險——任何層寫 performer 前,同 row.org 完全一樣
    // 就當空(留空好過寫返個 org 名做「歌手」)。
    if (performer && row.org && performer === row.org) { performer = null; performerSource = null; }

    const metaAlbum = extractMetaAlbum(meta.album);
    const albumFromDesc = metaAlbum ? null : extractAlbumFromDescription(meta.description);
    const albumFromTitle = (metaAlbum || albumFromDesc) ? null : extractAlbumFromTitle(meta.title || row.title);
    const album = metaAlbum || albumFromDesc || albumFromTitle || null;
    // ALBUM-BACKFILL-ACCEL-PLAN.md Commit 1:三層邊層命中就 stamp 對應
    // album_source,俾 Phase A/B/C 之後可以分辨「呢個 album 值嚟自邊層」。
    const albumSource = metaAlbum ? 'metadata' : (albumFromDesc ? 'description' : (albumFromTitle ? 'title' : null));

    const result = { row, meta, performer, performerSource, album, albumSource };
    results.push(result);

    log(`    M/D/T:performer=${performer || '(空)'} source=${performerSource || '-'} album=${album || '(空)'}`);

    // ── C5b③:M/D/T 命中即刻寫,唔留到 run 尾 ──────────────────────────
    const fields = { last_meta_attempt: stamp() };
    if (performer && performerSource) {
      fields.performer = performer;
      fields.performer_source = performerSource;
    }
    if (album && !(row.album && row.album.trim())) {
      fields.album = album;
      fields.album_source = albumSource;
    }
    const hasRealUpdate = Boolean(fields.performer || fields.album);
    await writeRow(row.id, fields);
    result.writtenImmediately = true;
    if (hasRealUpdate) immediateWriteCount++;

    if (!performer) aiCandidates.push({ youtube_id: row.youtube_id, title: meta.title, description: meta.description, result });
  }

  if (newNonsongFlags.length) {
    appendSuspectedNonsong(newNonsongFlags);
    log(`suspected-nonsong:新增 ${newNonsongFlags.length} 條 flag → ${NONSONG_PATH}`);
  }

  // ── Layer A ──────────────────────────────────────────────────────
  let aiCliAvailable = null;
  let aiWriteCount = 0;
  if (!NO_AI && aiCandidates.length) {
    log(`Layer A:${aiCandidates.length} 首 M/D/T 都落空,check claude CLI 可用性…`);
    aiCliAvailable = await checkClaudeCliAvailable();
    if (!aiCliAvailable) {
      log('  ⚠ claude CLI 行唔到(未登入/唔喺 PATH/出錯)——Layer A 呢次留 stub,呢批 row performer 留空');
    } else {
      log('  claude CLI 可用,開始批量推斷…');
      for (let i = 0; i < aiCandidates.length; i += AI_BATCH_SIZE) {
        const batch = aiCandidates.slice(i, i + AI_BATCH_SIZE);
        log(`  AI batch [${i + 1}-${i + batch.length}/${aiCandidates.length}]`);
        const out = await runAiBatch(batch);
        if (out === null) { aiCliAvailable = false; log('  ⚠ batch 中途 CLI 出錯,之後嘅 batch 一律當 CLI 唔可用'); break; }
        // C5b③:Layer A 要成個 batch call 完先知邊條有答案,冇辦法逐條即寫,
        // 但一 call 完即刻補寫(唔等成個 script 跑晒先寫)。
        for (const it of batch) {
          const v = out[it.youtube_id];
          if (v) {
            let normalized = normalizeSeparators(v);
            // C5c followup②(c):同一重保險套用落 Layer A。
            if (normalized && it.result.row.org && normalized === it.result.row.org) normalized = null;
            if (normalized) {
              it.result.performer = normalized;
              it.result.performerSource = 'ai';
              await writeRow(it.result.row.id, { performer: normalized, performer_source: 'ai' });
              aiWriteCount++;
              log(`    ✓ AI: ${it.youtube_id} → ${normalized}`);
            }
          }
        }
        if (i + AI_BATCH_SIZE < aiCandidates.length) await sleep(jitter(1500));
      }
    }
  } else if (NO_AI) {
    log('--no-ai:跳過 Layer A');
  }

  const totalWritten = immediateWriteCount + aiWriteCount;
  log(`寫入完成:${totalWritten}/${results.length} 首有 performer/album 更新${DRY ? '(--dry,實際冇寫,以上為模擬計數)' : ''}(M/D/T 即寫 ${immediateWriteCount} + AI 補寫 ${aiWriteCount})`);

  writeReport(results, { aiCliAvailable, dry: DRY });
}

function writeReport(results, { aiCliAvailable, dry }) {
  const bySource = { metadata: 0, description: 0, title: 0, ai: 0, empty: 0, fetchFailed: 0 };
  let albumHit = 0;
  const lines = [];
  lines.push(`# backfillMeta 報告 —— org=${ORG || '(全庫)'} status=${STATUS}`);
  lines.push('');
  lines.push(`> TAXONOMY-5D-PLAN.md §3.2/§3.3/§8 C5+C5b。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push('| youtube_id | title | performer | source | album |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    if (r.fetchFailed) {
      bySource.fetchFailed++;
      lines.push(`| ${r.row.youtube_id} | ${mdEscape(r.row.title)} | (yt-dlp 攞唔到) | fetch-failed | - |`);
      continue;
    }
    const src = r.performerSource || 'empty';
    bySource[src] = (bySource[src] || 0) + 1;
    const albumVal = r.row.album && r.row.album.trim() ? r.row.album : (r.album || '');
    if (albumVal) albumHit++;
    lines.push(`| ${r.row.youtube_id} | ${mdEscape(r.meta?.title || r.row.title)} | ${mdEscape(r.performer || '')} | ${src} | ${mdEscape(albumVal)} |`);
  }
  lines.push('');
  lines.push('## 覆蓋率統計');
  lines.push('');
  const total = results.length;
  lines.push(`- 總數:${total}`);
  lines.push(`- Layer M(metadata)命中:${bySource.metadata}`);
  lines.push(`- Layer D(description)命中:${bySource.description}`);
  lines.push(`- Layer T(title)命中:${bySource.title}`);
  lines.push(`- Layer A(AI)命中:${bySource.ai}`);
  lines.push(`- 四層都空:${bySource.empty}`);
  lines.push(`- yt-dlp 攞唔到 metadata:${bySource.fetchFailed}`);
  lines.push(`- album 命中(含原有值):${albumHit}/${total}`);
  lines.push('');
  lines.push('## AI batch(Layer A)執行狀況');
  lines.push('');
  if (aiCliAvailable === null) {
    lines.push('冇觸發 Layer A(M/D/T 已經覆蓋晒所有候選,或者 --no-ai)。');
  } else if (aiCliAvailable === false) {
    lines.push('⚠️ `claude -p` headless CLI 呢部機行唔到(未登入 `/login`,或者其他 exec 錯誤)——');
    lines.push('Layer A 留 stub,呢批 M/D/T 落空嘅 row performer 維持空白,等有登入嘅環境再補跑。');
  } else {
    lines.push('`claude -p` 可用,已跑完批量推斷(見上表 source=ai 嘅列)。');
  }
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`報告已寫:${REPORT_PATH}`);
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

main().catch((e) => { console.error('backfillMeta 出錯:', e); process.exit(1); });
