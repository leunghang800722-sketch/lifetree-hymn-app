#!/usr/bin/env node
// 純音樂 Phase 4 / 4c —— INSTRUMENTAL-PHASE4-PLAN-20260824.md §4 + §5
//
// 新歌入庫線。**唔係** `backfillAlbumFromPlaylists.js` 嘅改版 —— 嗰個 script
// 個 `--apply` 係 `UPDATE hymns_all SET album=? WHERE youtube_id=?`(專輯名回填
// 器),搵唔到行就 notFound++,佢**由頭到尾唔會 INSERT 新歌**(實查 2026-08-24
// backfillAlbumFromPlaylists.js:415-430)。所以呢度重新寫過。
//
// 三段式(discover 喺 `discoverInstrumentalPlaylists.mjs`):
//   --verify --org <name> [--limit N]   讀簽咗嘅白名單 → 五重閘 → 寫 verify.json。**唔寫 DB**
//   --apply  --org <name> [--dry]       讀 verify.json → 閘 5 → locked INSERT。**零網絡**
//   --report --org <name>               出 Eric 抽驗用嘅 markdown
//
// ── §4 五重閘 ────────────────────────────────────────────────────────
//  閘1 結構:只行官方 channel 嘅**器樂 playlist**,而且要人手簽 approved:true
//           + `instrumental_signal` 必填(空 = 唔准 apply)
//  閘2 標題/片長:isCompilation / isNonWorship(…,{line:'instrumental'}) / 120-600 秒
//  閘3 YouTube auto-caption:**有 auto-caption = 硬拒**(YouTube ASR 係同 whisper
//           完全獨立嘅第二個引擎,佢聽到嘢即係有人聲)。
//           ⚠️ 單向:冇 auto-caption **唔算**正面證據(實測 #4 主禱文有人聲但冇 caption)
//  閘4 whisper 雙 pass(-l zh + -l en,兩個都要過):
//           ① 任何 pass 出現 vocalMark → 拒
//           ② 去除靜音白名單後仲有剩餘文字行 → 拒
//           ③ coverage < 0.85 → 拒(用 yt-dlp 攞到嘅**真秒數**,唔用 DB TEXT 欄)
//           ④ 兩個 pass 結論唔一致 → 拒,落人手 report
//  閘5 playlist 一致性(apply 嗰陣):一條 playlist <50% 過閘 = 簽錯,成條唔 apply
//
// ⚠️ P5(Eric 2026-08-24 拍板)= 入庫即刻 curated=1 上架,**冇下游 review**。
//    所以任何「唔肯定」一律唔入庫,冇「入咗再算」。
//
// 🔴 唔准做:關鍵字搜尋攞歌、收 §5.1 六個中文 org 以外、收 >10 分鐘、
//    UPDATE/DELETE 任何現有行、掂 verified/draft 歌詞資料。

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock,
  isCompilation, isNonWorship, isInSongDurationBand, formatDuration,
} from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';
import { YTDLP } from '../lib/ytdlpBin.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { runWhisperJson, DEFAULT_WHISPER_MODEL_NAME } from '../lib/whisperTranscribe.js';
import { isSilenceLine, hasVocalMark } from '../lib/instrumentalSilence.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'instrumental');
const WHISPER_MODEL = path.join(__dirname, '..', 'models', `ggml-${DEFAULT_WHISPER_MODEL_NAME}.bin`);

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MODE_VERIFY = process.argv.includes('--verify');
const MODE_APPLY = process.argv.includes('--apply');
const MODE_REPORT = process.argv.includes('--report');
const ORG = arg('--org', null);
const DRY = process.argv.includes('--dry');
const LIMIT = Number(arg('--limit', 0)) || Infinity;
// 2026-08-24 MORE-SOURCES:白名單有兩個來源 ——
//   `playlists` = `discoverInstrumentalPlaylists.mjs`(人手 playlist tab)
//   `releases`  = `discoverInstrumentalReleases.mjs`(/releases + Topic + iTunes)
const SOURCE = arg('--source', 'playlists');
const ONLY_RELEASE = arg('--release', null);   // 淨係跑一張專輯(R6 分批 apply)
// `--ids a,b,c` 淨係驗指定嘅 youtube_id,而且**結果 merge 返入舊 verify.json**
// (唔會覆寫其餘已驗過嘅)。用喺「補驗少量漏網」呢類情況,唔使成 org 重跑。
const ONLY_IDS = arg('--ids', null) ? new Set(arg('--ids', '').split(',').map((x) => x.trim()).filter(Boolean)) : null;
const DELAY_MS = Number(arg('--delay', 3000));

// 器樂線片長 band(§8 Q2 拍板 10 分鐘硬上限 + P1 拍板 120 秒下限)
const BAND_MIN = 120, BAND_MAX = 600;
const HARD_COVERAGE = 0.85;

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (b) => Math.round(b * (0.7 + Math.random() * 0.9));
const mdEsc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const today = () => new Date().toISOString().slice(0, 10);

const whitelistPath = (org) => path.join(DATA_DIR, SOURCE === 'releases' ? `${org}-releases.json` : `${org}-playlists.json`);
const verifyPath = (org) => path.join(DATA_DIR, SOURCE === 'releases' ? `${org}-verify-releases.json` : `${org}-verify.json`);
const reportPath = (org) => path.join(DATA_DIR, `${org}-ingest-report.md`);

function findOrgConfig(orgName) {
  return GROUPS.find((g) => g.name === orgName || (g.aliases || []).includes(orgName));
}

async function ytdlpJson(args, timeout = 120000) {
  const { stdout } = await execFile(YTDLP, args, { timeout, maxBuffer: 60 * 1024 * 1024 });
  return JSON.parse(stdout);
}

// ── 閘 3:YouTube auto-caption ────────────────────────────────────────
// `-J --skip-download` 一 call 攞齊 automatic_captions / subtitles / duration /
// title —— 比 `--list-subs` 再 call 多次平。
async function fetchVideoMeta(id) {
  const j = await ytdlpJson(['-J', '--skip-download', `https://www.youtube.com/watch?v=${id}`], 120000);
  const auto = Object.keys(j.automatic_captions || {});
  const manual = Object.keys(j.subtitles || {}).filter((k) => k !== 'live_chat');
  return {
    id, title: j.title || '', duration: j.duration ?? null,
    channel: j.channel || '', upload_date: j.upload_date || null,
    auto_captions: auto, manual_subs: manual,
  };
}

// ── 閘 4:whisper 單 pass 判定 ────────────────────────────────────────
function judgePass(rawSegs, durationSec) {
  const texts = [...new Set((rawSegs || []).map((s) => (s.text || '').trim()).filter(Boolean))];
  const lastT1 = (rawSegs || []).reduce((m, s) => Math.max(m, s.t1 || 0), 0);
  const coverage = durationSec ? lastT1 / durationSec : null;
  const vocalMarks = texts.filter(hasVocalMark);
  const residual = texts.filter((t) => !isSilenceLine(t));
  const reasons = [];
  if (!texts.length) reasons.push('whisper 零段落 —— 實證唔到(唔可以當「靜」)');
  if (vocalMarks.length) reasons.push(`vocalMark:${vocalMarks.slice(0, 3).join(' / ')}`);
  if (residual.length) reasons.push(`剩餘文字 ${residual.length} 行:${residual.slice(0, 3).map((t) => t.slice(0, 30)).join(' / ')}`);
  if (coverage === null) reasons.push('攞唔到 duration,計唔到 coverage');
  else if (coverage < HARD_COVERAGE) reasons.push(`coverage ${(coverage * 100).toFixed(0)}% < ${HARD_COVERAGE * 100}%`);
  return { pass: reasons.length === 0, reasons, uniq: texts.slice(0, 10), uniqCount: texts.length, coverage, lastT1 };
}

async function whisperBothPasses(wavPath, durationSec) {
  const out = {};
  for (const lang of ['zh', 'en']) {
    const r = await runWhisperJson(wavPath, WHISPER_MODEL, lang, { timeout: 900000, keepRawSegs: true });
    out[lang] = { ...judgePass(r.rawSegs || r.segs, durationSec), whisperFailed: r.failed, garbageDropped: r.garbageDropped };
  }
  return out;
}

// ── verify ───────────────────────────────────────────────────────────
async function runVerify() {
  const cfg = findOrgConfig(ORG);
  if (!cfg) { console.error(`worshipGroups.js 搵唔到 org「${ORG}」`); process.exit(1); }
  if (!fs.existsSync(whitelistPath(ORG))) { console.error(`搵唔到白名單 ${whitelistPath(ORG)},未 discover 過`); process.exit(1); }
  if (!fs.existsSync(WHISPER_MODEL)) { console.error(`搵唔到 whisper model ${WHISPER_MODEL}`); process.exit(1); }

  const raw = JSON.parse(fs.readFileSync(whitelistPath(ORG), 'utf8'));
  // 兩種白名單 shape 統一做同一個介面,落面條 pipeline 唔使分
  const whitelist = raw.map((c) => (SOURCE === 'releases'
    ? { playlist_id: c.release_id, playlist_title: c.release_title, member_count: c.member_count,
        approved: c.approved, instrumental_signal: c.instrumental_signal, proposed_album: c.proposed_album,
        album_evidence: c.album_evidence !== false, preMembers: c.members }
    : { ...c, album_evidence: false, preMembers: null }));
  const approved = whitelist.filter((c) => c.approved === true)
    .filter((c) => !ONLY_RELEASE || c.playlist_id === ONLY_RELEASE);
  if (!approved.length) { log('白名單冇任何 approved:true,收工(冇碰 DB、冇落片)'); return; }

  // 閘 1:instrumental_signal 必填
  const unsigned = approved.filter((c) => !c.instrumental_signal);
  if (unsigned.length) {
    console.error(`🔴 有 ${unsigned.length} 條 approved 但 instrumental_signal 空 —— 閘 1 唔准過,abort:`);
    unsigned.forEach((c) => console.error(`   ${c.playlist_id}「${c.playlist_title}」`));
    process.exit(1);
  }

  const db = await openDb();
  const inDb = new Set(query(db, 'SELECT youtube_id FROM hymns_all').map((r) => r.youtube_id).filter(Boolean));
  log(`verify:org=${ORG},approved ${approved.length}/${whitelist.length} 條 playlist,DB 已有 ${inDb.size} 個 youtube_id`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'instr-verify-'));
  const results = [];
  const staleSkips = [];
  let done = 0;

  for (const c of approved) {
    log(`\n▶ playlist「${c.playlist_title}」(簽嗰陣 member=${c.member_count})`);
    let members = [];
    try {
      const j = await ytdlpJson(['-J', '--flat-playlist', '--skip-download', `https://www.youtube.com/playlist?list=${c.playlist_id}`]);
      members = (j.entries || []).filter((e) => e && e.id);
    } catch (e) {
      log(`  ⚠ 攞 member 失敗:${e?.message || e} —— 成條 playlist skip`);
      staleSkips.push({ playlist_id: c.playlist_id, reason: `fetch 失敗:${e?.message || e}` });
      continue;
    }
    // stale check(照抄 backfillAlbumFromPlaylists 紀律):簽咗之後 playlist 加咗嘢
    if (Number.isFinite(c.member_count) && members.length > c.member_count) {
      log(`  ⚠ member 數變咗(簽嗰陣 ${c.member_count} → 而家 ${members.length})—— 成條 playlist 唔處理,要重新 discover + 重簽`);
      staleSkips.push({ playlist_id: c.playlist_id, playlist_title: c.playlist_title, signedCount: c.member_count, freshCount: members.length, reason: 'stale' });
      continue;
    }

    for (const m of members) {
      if (done >= LIMIT) break;
      if (ONLY_IDS && !ONLY_IDS.has(m.id)) continue;
      const base = {
        youtube_id: m.id, raw_title: m.title || '', flat_duration: m.duration ?? null,
        playlist_id: c.playlist_id, playlist_title: c.playlist_title,
        instrumental_signal: c.instrumental_signal, proposed_album: c.proposed_album ?? null,
      };
      if (inDb.has(m.id)) { results.push({ ...base, verdict: 'skip', why: '已經喺庫' }); continue; }
      // releases 來源:discover 段已經行過閘 2 + §6 R2 dedup,唔過嗰啲唔使再落網絡
      if (c.preMembers) {
        const pre = c.preMembers.find((x) => x.youtube_id === m.id);
        if (pre && !pre.pass_pre) { results.push({ ...base, verdict: 'reject', gate: 2, why: pre.reasons.join('; ') }); continue; }
      }

      // 閘 2
      const t = m.title || '';
      const g2 = [];
      if (isCompilation(t)) g2.push('isCompilation');
      if (isNonWorship(t, ORG, { line: 'instrumental', albumEvidence: c.album_evidence })) g2.push('isNonWorship(器樂線)');
      if (m.duration != null && !isInSongDurationBand(m.duration, BAND_MAX, BAND_MIN)) g2.push(`片長 ${m.duration}s 唔喺 ${BAND_MIN}-${BAND_MAX} 秒`);
      if (g2.length) { results.push({ ...base, verdict: 'reject', gate: 2, why: g2.join('; ') }); continue; }

      done++;
      log(`  [${done}] ${t.slice(0, 55)}`);

      // 閘 3
      let meta;
      try { meta = await fetchVideoMeta(m.id); }
      catch (e) { results.push({ ...base, verdict: 'reject', gate: 3, why: `攞 metadata 失敗:${e?.message || e}` }); await sleep(jitter(DELAY_MS)); continue; }
      if (meta.auto_captions.length) {
        log(`      ✗ 閘3:有 auto-caption(${meta.auto_captions.slice(0, 3).join(',')}…共 ${meta.auto_captions.length} 種)= 有人聲,硬拒`);
        results.push({ ...base, verdict: 'reject', gate: 3, why: `YouTube auto-caption 存在(${meta.auto_captions.length} 種語言)—— 獨立引擎聽到人聲`, meta });
        await sleep(jitter(DELAY_MS)); continue;
      }
      // duration 用真秒數重驗一次(flat 個 duration 可能同 -J 唔一致)
      if (meta.duration != null && !isInSongDurationBand(meta.duration, BAND_MAX, BAND_MIN)) {
        results.push({ ...base, verdict: 'reject', gate: 2, why: `真片長 ${meta.duration}s 唔喺 band`, meta });
        await sleep(jitter(DELAY_MS)); continue;
      }

      // 閘 4:落 audio-only → wav → whisper 雙 pass
      const dir = fs.mkdtempSync(path.join(tmpRoot, `${m.id}-`));
      let whisper = null, err = null;
      try {
        const audioOut = path.join(dir, 'a.%(ext)s');
        await execFile(YTDLP, ['-f', 'bestaudio', '--no-playlist', '-o', audioOut, `https://www.youtube.com/watch?v=${m.id}`], { timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
        const got = fs.readdirSync(dir).filter((f) => f.startsWith('a.'));
        if (!got.length) throw new Error('yt-dlp 冇出檔');
        const wav = path.join(dir, 'audio.wav');
        await execFile('ffmpeg', ['-i', path.join(dir, got[0]), '-vn', '-ar', '16000', '-ac', '1', '-y', wav], { timeout: 180000 });
        whisper = await whisperBothPasses(wav, meta.duration);
      } catch (e) { err = e?.message || String(e); }
      finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

      if (err) {
        log(`      ✗ 閘4:${err.slice(0, 80)}`);
        results.push({ ...base, verdict: 'reject', gate: 4, why: `落片/whisper 出錯:${err.slice(0, 200)}`, meta });
        await sleep(jitter(DELAY_MS)); continue;
      }

      const zhOk = whisper.zh.pass, enOk = whisper.en.pass;
      if (zhOk && enOk) {
        log(`      ✓ 兩 pass 都過(zh cov=${(whisper.zh.coverage * 100).toFixed(0)}% uniq=${whisper.zh.uniqCount} / en cov=${(whisper.en.coverage * 100).toFixed(0)}% uniq=${whisper.en.uniqCount})`);
        results.push({ ...base, verdict: 'instrumental', gate: null, why: '五重閘全過', meta, whisper });
      } else {
        const why = !zhOk && !enOk ? `兩 pass 都唔過(zh: ${whisper.zh.reasons.join('; ')} | en: ${whisper.en.reasons.join('; ')})`
          : `兩 pass 結論唔一致(zh ${zhOk ? '過' : '唔過:' + whisper.zh.reasons.join('; ')} / en ${enOk ? '過' : '唔過:' + whisper.en.reasons.join('; ')})`;
        log(`      ✗ 閘4:${why.slice(0, 110)}`);
        results.push({ ...base, verdict: 'reject', gate: 4, why, meta, whisper });
      }
      await sleep(jitter(DELAY_MS));
    }
    if (done >= LIMIT) { log(`到 --limit ${LIMIT},停`); break; }
  }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}

  let merged = results;
  if (ONLY_IDS && fs.existsSync(verifyPath(ORG))) {
    // 補驗模式:攞返舊結果,淨係換走今次驗過嗰幾條,其餘原封不動
    const prev = JSON.parse(fs.readFileSync(verifyPath(ORG), 'utf8'));
    const now = new Map(results.map((r) => [r.youtube_id, r]));
    merged = (prev.results || []).map((r) => now.get(r.youtube_id) || r);
    for (const r of results) if (!merged.find((x) => x.youtube_id === r.youtube_id)) merged.push(r);
    log(`補驗模式:merge 返舊 verify.json(舊 ${(prev.results || []).length} 條 → 而家 ${merged.length} 條)`);
  }
  const out = { generated: new Date().toISOString(), org: ORG, band: [BAND_MIN, BAND_MAX], staleSkips, results: merged };
  fs.writeFileSync(verifyPath(ORG), JSON.stringify(out, null, 2), 'utf8');
  const pass = results.filter((r) => r.verdict === 'instrumental').length;
  const rej = results.filter((r) => r.verdict === 'reject').length;
  log(`\n完成:過閘 ${pass} 首、拒 ${rej} 首、已喺庫 skip ${results.filter((r) => r.verdict === 'skip').length} 首`);
  log(`→ ${verifyPath(ORG)}`);
  writeReport(out);
}

// ── apply ────────────────────────────────────────────────────────────
async function runApply() {
  if (!fs.existsSync(verifyPath(ORG))) { console.error(`搵唔到 ${verifyPath(ORG)},未 verify 過`); process.exit(1); }
  const v = JSON.parse(fs.readFileSync(verifyPath(ORG), 'utf8'));
  const cfg = findOrgConfig(ORG);
  if (!cfg) { console.error(`worshipGroups.js 搵唔到 org「${ORG}」`); process.exit(1); }

  // 閘 5:playlist 一致性
  const byPl = new Map();
  for (const r of v.results) {
    if (r.verdict === 'skip') continue;              // 已喺庫嘅唔計入分母
    if (r.gate === 2) continue;                      // 閘 2 擋走嘅係長合輯,唔代表簽錯
    if (!byPl.has(r.playlist_id)) byPl.set(r.playlist_id, { title: r.playlist_title, pass: 0, total: 0 });
    const e = byPl.get(r.playlist_id); e.total++; if (r.verdict === 'instrumental') e.pass++;
  }
  const badPl = new Set();
  for (const [pid, e] of byPl) {
    const ratio = e.total ? e.pass / e.total : 0;
    log(`閘5 一致性:「${e.title.slice(0, 40)}」${e.pass}/${e.total} = ${(ratio * 100).toFixed(0)}%`);
    if (e.total >= 2 && ratio < 0.5) { badPl.add(pid); log(`   🔴 <50% —— 成條 playlist 唔 apply(簽錯,退返重簽)`); }
  }

  const toInsert = v.results.filter((r) => r.verdict === 'instrumental' && !badPl.has(r.playlist_id));
  log(`可入庫 ${toInsert.length} 首${DRY ? '(--dry,唔會寫)' : ''}`);
  if (!toInsert.length) { log('冇嘢入,收工'); return; }

  const token = await acquireDbLock('ingestInstrumental');
  if (!token) { console.error('攞唔到 DB 鎖,收工(下次再試)'); process.exit(1); }
  const written = [];
  try {
    const db = await openDb();
    for (const r of toInsert) {
      // 冪等:verify 同 apply 之間可能有第二條線收咗
      const exist = query(db, 'SELECT id FROM hymns_all WHERE youtube_id = ?', [r.youtube_id]);
      if (exist.length) { log(`  · ${r.youtube_id} 已經喺庫(#${exist[0].id}),skip`); continue; }
      const title = r.meta?.title || r.raw_title;
      const dur = r.meta?.duration ?? r.flat_duration;
      const row = [
        title, cleanDisplayTitle(title, cfg.name), cfg.name, cfg.lang, r.youtube_id,
        cfg.kidsLang || cfg.lang, today(), formatDuration(dur), cfg.org ?? cfg.name,
        r.proposed_album || '',
      ];
      if (DRY) { log(`  [dry] INSERT ${r.youtube_id} 「${title.slice(0, 50)}」 dur=${formatDuration(dur)} album=${r.proposed_album || '(空)'}`); written.push({ ...r, dry: true }); continue; }
      db.run(
        `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang,
           curated, status, last_checked, fail_streak, duration, org, kids, instrumental,
           album, album_source, lyrics_status, lyrics_source)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, 0, 1, ?, ?, 'unavailable', 'instrumental')`,
        [...row, r.proposed_album ? 'playlist' : null]
      );
      const id = query(db, 'SELECT last_insert_rowid() as id')[0].id;
      written.push({ ...r, inserted_id: id });
      log(`  ✓ #${id} ${r.youtube_id} 「${title.slice(0, 50)}」`);
    }
    if (!DRY && written.length) { saveDb(db); log('已寫落碟'); }
  } finally { releaseDbLock(token); }

  log(`完成${DRY ? '(dry)' : ''}:入庫 ${written.length} 首`);
  if (!DRY && written.length) {
    fs.writeFileSync(path.join(DATA_DIR, `${ORG}-applied-${today().replace(/-/g, '')}.json`),
      JSON.stringify(written.map((w) => ({ id: w.inserted_id, youtube_id: w.youtube_id, title: w.meta?.title || w.raw_title, album: w.proposed_album, playlist: w.playlist_title })), null, 2), 'utf8');
  }
}

// ── rejudge:零網絡重判 ───────────────────────────────────────────────
// 用途:靜音指紋庫更新之後(例如加咗 YouTube promo 幻覺 pattern),唔使重新
// 落片跑 whisper,直接攞 verify.json 入面存住嘅 unique 行重跑一次判定。
// ⚠️ 只可以重判 `uniqCount <= uniq.length` 嘅(即係 unique 行冇被 slice 截),
//    截咗嘅一律唔郁,report 標明要重跑 verify。
function runRejudge() {
  if (!fs.existsSync(verifyPath(ORG))) { console.error(`搵唔到 ${verifyPath(ORG)}`); process.exit(1); }
  const v = JSON.parse(fs.readFileSync(verifyPath(ORG), 'utf8'));
  let flipped = 0, truncated = 0, unchanged = 0;
  for (const r of v.results) {
    if (r.verdict !== 'reject' || r.gate !== 4 || !r.whisper) continue;
    const passes = {};
    let ok = true;
    for (const lang of ['zh', 'en']) {
      const w = r.whisper[lang];
      if (!w) { ok = false; break; }
      if (w.uniqCount > (w.uniq || []).length) { truncated++; ok = false; break; }
      const vocalMarks = (w.uniq || []).filter(hasVocalMark);
      const residual = (w.uniq || []).filter((t) => !isSilenceLine(t));
      const covOk = w.coverage != null && w.coverage >= HARD_COVERAGE;
      passes[lang] = !vocalMarks.length && !residual.length && covOk && (w.uniq || []).length > 0;
      if (!passes[lang]) r.whisper[lang].rejudge_reasons =
        [...(vocalMarks.length ? [`vocalMark:${vocalMarks.join('/')}`] : []),
         ...(residual.length ? [`剩餘文字:${residual.map((t) => t.slice(0, 30)).join(' / ')}`] : []),
         ...(covOk ? [] : [`coverage ${w.coverage == null ? 'null' : (w.coverage * 100).toFixed(0) + '%'}`])];
    }
    if (!ok) continue;
    if (passes.zh && passes.en) {
      r.verdict = 'instrumental'; r.gate = null;
      r.why = '五重閘全過(rejudge:指紋庫更新後零網絡重判)';
      flipped++;
      log(`  ↻ 翻案:${(r.meta?.title || r.raw_title).slice(0, 50)}`);
    } else unchanged++;
  }
  fs.writeFileSync(verifyPath(ORG), JSON.stringify(v, null, 2), 'utf8');
  log(`rejudge:翻案 ${flipped} 首、維持拒收 ${unchanged} 首、unique 行俾截咗唔敢判 ${truncated} 首`);
  writeReport(v);
}

// ── report ───────────────────────────────────────────────────────────
function writeReport(v) {
  const L = [];
  L.push(`# 純音樂 Phase 4 / 4c 驗證報告 —— ${v.org}`, '');
  L.push(`產生時間:${v.generated}`);
  L.push(`片長 band:${v.band[0]}-${v.band[1]} 秒(§8 Q2 十分鐘上限 + P1 一百二十秒下限)`, '');
  L.push('> **P4/P5 抽驗指引**:白名單係 Claude 簽、入庫即刻上架,冇下游 review。');
  L.push('> 下面每首都有 YouTube 連結,click 入去聽 10 秒就驗到有冇人聲。', '');
  const pass = v.results.filter((r) => r.verdict === 'instrumental');
  const rej = v.results.filter((r) => r.verdict === 'reject');
  const skip = v.results.filter((r) => r.verdict === 'skip');
  L.push(`## §1 結果:過閘 **${pass.length}** / 拒 ${rej.length} / 已喺庫 ${skip.length}`, '');
  if (v.staleSkips.length) {
    L.push('### ⚠️ 成條 playlist skip 咗', '');
    v.staleSkips.forEach((s) => L.push(`- \`${s.playlist_id}\` ${mdEsc(s.playlist_title || '')} —— ${mdEsc(s.reason)}${s.signedCount != null ? `(簽 ${s.signedCount} → 而家 ${s.freshCount})` : ''}`));
    L.push('');
  }
  L.push('## §2 過閘名單(= 會入庫)', '');
  L.push('| # | 歌 | 片長 | zh cov | en cov | uniq(zh/en) | 專輯 | 聽 |');
  L.push('|---|---|---|---|---|---|---|---|');
  pass.forEach((r, i) => {
    const d = r.meta?.duration ?? r.flat_duration;
    L.push(`| ${i + 1} | ${mdEsc((r.meta?.title || r.raw_title).slice(0, 48))} | ${d}s | ${(r.whisper.zh.coverage * 100).toFixed(0)}% | ${(r.whisper.en.coverage * 100).toFixed(0)}% | ${r.whisper.zh.uniqCount}/${r.whisper.en.uniqCount} | ${mdEsc(r.proposed_album || '(空)')} | [▶](https://www.youtube.com/watch?v=${r.youtube_id}) |`);
  });
  L.push('');
  L.push('<details><summary>每首嘅 whisper 原文(核對「係咪真係冇人聲」)</summary>', '');
  pass.forEach((r) => {
    L.push(`**${mdEsc(r.meta?.title || r.raw_title)}**  `);
    L.push(`- zh:${mdEsc(JSON.stringify(r.whisper.zh.uniq))}`);
    L.push(`- en:${mdEsc(JSON.stringify(r.whisper.en.uniq))}`);
    L.push(`- auto-caption:${r.meta?.auto_captions?.length ? '⚠️ 有' : '冇'} · 人手字幕:${r.meta?.manual_subs?.length ? r.meta.manual_subs.join(',') : '冇'}`);
    L.push('');
  });
  L.push('</details>', '');
  L.push('## §3 被拒名單(逐首有理由)', '');
  L.push('| 閘 | 歌 | 理由 |');
  L.push('|---|---|---|');
  rej.forEach((r) => L.push(`| ${r.gate ?? '-'} | ${mdEsc((r.meta?.title || r.raw_title).slice(0, 44))} | ${mdEsc(String(r.why).slice(0, 150))} |`));
  L.push('');
  const rate = (pass.length + rej.length) ? rej.length / (pass.length + rej.length) : 0;
  L.push(`拒收率 **${(rate * 100).toFixed(0)}%**${rate > 0.5 ? ' —— ⚠️ 超過 50%,PLAN §8 checklist 話要退返 T5 重簽白名單' : ''}`, '');
  fs.writeFileSync(reportPath(v.org), L.join('\n'), 'utf8');
  log(`→ ${reportPath(v.org)}`);
}

// ── main ─────────────────────────────────────────────────────────────
if (!ORG) { console.error('要帶 --org <name>'); process.exit(1); }
if (MODE_VERIFY) await runVerify();
else if (MODE_APPLY) await runApply();
else if (process.argv.includes('--rejudge')) runRejudge();
else if (MODE_REPORT) { writeReport(JSON.parse(fs.readFileSync(verifyPath(ORG), 'utf8'))); }
else { console.error('要帶 --verify / --apply / --report / --rejudge'); process.exit(1); }
