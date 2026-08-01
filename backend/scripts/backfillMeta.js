#!/usr/bin/env node
// backfillMeta.js — TAXONOMY-5D-PLAN.md §3.2/§3.3/§8 C5:performer(歌手)+
// album(專輯) backfill。每首歌一次 `yt-dlp -J --no-playlist` 攞 title+
// description,waterfall 三層推斷 performer,同一次 call 順手 parse album。
//
// ── Waterfall(§3.2)──────────────────────────────────────────────
//   Layer D(description):regex 搵「主唱/演唱/獻唱/Vocal(s)?/Singer/Sung by」
//     行 → performer_source='description'
//   Layer T(title):對照 `data/knownPerformers.js` seed 名單 → 'title'
//   Layer A(AI):D/T 都落空嘅存做一個 batch,用 `claude -p`(headless)一次
//     過推斷,strict JSON 輸出;有把握先填,判斷純音樂就寫「純音樂」→ 'ai'
//   三層都空 → performer 留 ''(下次照樣重試,唔標記——同 fetchLyrics cc:miss
//     嗰種「泊住等下一層」唔同,呢度冇下一層,純粹留返做手動/日後 AI 進步)
//
// album(§3.3):description 嘅「Album (專輯): XXX」/「專輯:XXX」行、title 嘅
// 「專輯 N:XXX」pattern。**唔准 AI 估**——parse 唔到就留空。現有 album 有值
// 嘅唔重寫(保護規則)。
//
// ── 保護規則 ────────────────────────────────────────────────────
//   * performer_source='manual' 嘅 row 一律 skip(admin 手動改過/Lullaby 13 條)
//   * album 已有值嘅 row 唔重寫 album(performer 照常處理)
//   * 斷點續跑:candidate 揀 `performer_source=''`,寫完即刻非空,下次自動跳過
//   * 寫 DB 用 acquireDbLock(fetchLyrics 嗰個「慢工序唔揸鎖,即攞即放」pattern)
//
// ── Pilot(C5,§8)────────────────────────────────────────────────
// 淨跑 `--org 泥土音樂 --status ok`(現實資料:85 條,唔係方案原稿講嘅 89——
// 差額係 curated=0 pool 24 首 + status='dead'/'rejected' 唔跌入呢個 filter,
// 詳見 pilot 報告)。跑完出 `backend/data/backfill-meta-pilot.md`。
//
// ⚠️ 呢個 script **唔開夜晚排程**——C5 只做 pilot,排程等 Opus 5 抽查通過先
// (TAXONOMY-5D-PLAN.md §8 C5 明文)。
//
// Usage:
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok           # pilot 正式跑
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --dry     # 唔寫 DB
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --limit 5 # 測試少量
//   node scripts/backfillMeta.js --org 泥土音樂 --status ok --no-ai   # 唔叫 claude -p

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
const LIMIT = Number(arg('--limit', 0)) || null; // 0/未傳 = 冇上限(全部候選)
const DELAY_MS = Number(arg('--delay', 3500));
const AI_BATCH_SIZE = Number(arg('--ai-batch-size', 25));
const DRY = process.argv.includes('--dry');
const NO_AI = process.argv.includes('--no-ai');
const REPORT_PATH = arg('--report', path.join(__dirname, '..', 'data', 'backfill-meta-pilot.md'));

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// ── Layer D:description 主唱/演唱/獻唱/Vocal(s)/Singer/Sung by ─────────
// 括號註解可選(跟 album regex 同一個教訓:呢個 org 嘅 description template
// 有時會用「中文標籤 (英文標籤):」或者反過來嘅次序,例如 album 嗰行實測撞過
// 「專輯 ( Album ): XXX」——即使呢個 pilot 冇撞到 Vocal/主唱 呢類行,都預先
// 用同一個容錯 pattern,唔使下次先再補一次同類 fix)。
const DESC_PERFORMER_RE = /^(?:主唱|演唱|獻唱|vocals?|singer|sung\s*by)\s*(?:[\(（][^)）]*[\)）]\s*)?[:：]\s*(.+)$/im;
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
  return s;
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

// ── yt-dlp -J:攞 title+description(唔落載,--skip-download) ─────────────
async function fetchYtMeta(youtubeId) {
  try {
    const { stdout } = await execFile(
      'yt-dlp',
      ['-J', '--no-playlist', '--skip-download', `https://www.youtube.com/watch?v=${youtubeId}`],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout);
    return { title: info.title || '', description: info.description || '' };
  } catch (e) {
    return null;
  }
}

// ── DB 寫入(帶鎖,即攞即放——跟 fetchLyrics.js writeLyricsRow 一致 pattern)──
async function writeRow(id, fields) {
  if (!Object.keys(fields).length) return true;
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
// 因為 admin 改過嘅 row performer_source='manual' != '') ────────────────
function pickCandidates(db) {
  const conds = ["performer_source = ''"];
  const params = [];
  if (ORG) { conds.push('org = ?'); params.push(ORG); }
  if (STATUS) { conds.push('status = ?'); params.push(STATUS); }
  return query(db, `SELECT id, youtube_id, title, artist, org, album, performer_source
                    FROM hymns_all WHERE ${conds.join(' AND ')} ORDER BY id ASC`, params);
}

// ── Layer A:claude -p headless 批量推斷(D/T 都落空嘅先入呢層)───────────
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
  if (!ORG) { console.error('要傳 --org(pilot 用 --org 泥土音樂)'); process.exit(1); }
  log(`backfillMeta pilot:org=${ORG} status=${STATUS} dry=${DRY} no-ai=${NO_AI}`);

  const db = await openDb();
  let cands = pickCandidates(db);
  log(`候選(performer_source='' AND org='${ORG}' AND status='${STATUS}'):${cands.length} 首`);
  if (LIMIT) cands = cands.slice(0, LIMIT);

  const ytCache = new Map(); // youtube_id -> meta(或 null=fetch失敗) —— 同一片多個 row 共用,慳 API
  const results = []; // { row, meta, performer, performerSource, album, fetchFailed }
  const aiCandidates = []; // D/T 都落空,入 AI batch

  for (let i = 0; i < cands.length; i++) {
    const row = cands[i];
    log(`  [${i + 1}/${cands.length}] id=${row.id} ${row.youtube_id} 「${row.title}」`);
    let meta = ytCache.get(row.youtube_id);
    if (meta === undefined) {
      meta = await fetchYtMeta(row.youtube_id);
      ytCache.set(row.youtube_id, meta);
      if (i < cands.length - 1) await sleep(jitter(DELAY_MS));
    } else {
      log('    (同一條片,重用 cache,唔再叫 yt-dlp)');
    }

    if (!meta) {
      log('    ⚠ yt-dlp -J 攞唔到 metadata,skip(下次再試)');
      results.push({ row, fetchFailed: true });
      continue;
    }

    const descPerformer = matchDescriptionPerformer(meta.description);
    const titlePerformer = descPerformer ? null : matchTitlePerformer(meta.title || row.title);
    const albumFromDesc = extractAlbumFromDescription(meta.description);
    const albumFromTitle = albumFromDesc ? null : extractAlbumFromTitle(meta.title || row.title);

    const performer = descPerformer || titlePerformer || null;
    const performerSource = descPerformer ? 'description' : (titlePerformer ? 'title' : null);
    const album = albumFromDesc || albumFromTitle || null;

    const result = { row, meta, performer, performerSource, album };
    results.push(result);
    if (!performer) aiCandidates.push({ youtube_id: row.youtube_id, title: meta.title, description: meta.description, result });

    log(`    D/T:performer=${performer || '(空)'} source=${performerSource || '-'} album=${album || '(空)'}`);
  }

  // ── Layer A ──────────────────────────────────────────────────────
  let aiCliAvailable = null;
  if (!NO_AI && aiCandidates.length) {
    log(`Layer A:${aiCandidates.length} 首 D/T 都落空,check claude CLI 可用性…`);
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
        for (const it of batch) {
          const v = out[it.youtube_id];
          if (v) {
            it.result.performer = v;
            it.result.performerSource = 'ai';
            log(`    ✓ AI: ${it.youtube_id} → ${v}`);
          }
        }
        if (i + AI_BATCH_SIZE < aiCandidates.length) await sleep(jitter(1500));
      }
    }
  } else if (NO_AI) {
    log('--no-ai:跳過 Layer A');
  }

  // ── 寫 DB(protect:album 已有值唔重寫;performer 冇命中就完全唔寫呢個 row)──
  let written = 0;
  for (const r of results) {
    if (r.fetchFailed) continue;
    const fields = {};
    if (r.performer && r.performerSource) {
      fields.performer = r.performer;
      fields.performer_source = r.performerSource;
    }
    if (r.album && !(r.row.album && r.row.album.trim())) {
      fields.album = r.album;
    }
    if (Object.keys(fields).length) {
      if (!DRY) await writeRow(r.row.id, fields);
      written++;
    }
  }
  log(`寫入完成:${written}/${results.length} 首有更新${DRY ? '(--dry,實際冇寫)' : ''}`);

  writeReport(results, { aiCliAvailable, dry: DRY });
}

function writeReport(results, { aiCliAvailable, dry }) {
  const bySource = { description: 0, title: 0, ai: 0, empty: 0, fetchFailed: 0 };
  let albumHit = 0;
  const lines = [];
  lines.push(`# backfillMeta pilot 報告 —— org=${ORG} status=${STATUS}`);
  lines.push('');
  lines.push(`> TAXONOMY-5D-PLAN.md §3.2/§3.3/§8 C5 pilot。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
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
  lines.push(`- Layer D(description)命中:${bySource.description}`);
  lines.push(`- Layer T(title)命中:${bySource.title}`);
  lines.push(`- Layer A(AI)命中:${bySource.ai}`);
  lines.push(`- 三層都空:${bySource.empty}`);
  lines.push(`- yt-dlp 攞唔到 metadata:${bySource.fetchFailed}`);
  lines.push(`- album 命中(含原有值):${albumHit}/${total}`);
  lines.push('');
  lines.push('## AI batch(Layer A)執行狀況');
  lines.push('');
  if (aiCliAvailable === null) {
    lines.push('冇觸發 Layer A(D/T 已經覆蓋晒所有候選,或者 --no-ai)。');
  } else if (aiCliAvailable === false) {
    lines.push('⚠️ `claude -p` headless CLI 呢部機行唔到(未登入 `/login`,或者其他 exec 錯誤)——');
    lines.push('Layer A 留 stub,呢批 D/T 落空嘅 row performer 維持空白,等有登入嘅環境再補跑。');
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
