#!/usr/bin/env node
// 純音樂 Phase 1 / T2 —— INSTRUMENTAL-PHASE1-EXEC-20260821.md §3.1
//
// 用庫入面現成嘅 `lyrics_timeline.whisper`(零落片、零網絡)掃全庫,出「純音樂
// 候選」報告。**唔攞 DB 鎖**(read-only URI 開,唔會阻住四條歌詞複核線同
// producer-keeper)。
//
// 判定式係 `scripts/auditLyricsBatch.js` `whisperShortVerdict()` 反轉用:嗰邊
// 問「whisper 有冇聽到嘢,證明首歌真係咁短」,呢邊問「whisper 由頭聽到尾都**冇**
// 聽到人聲,證明首歌係器樂」。
//
// ⚠️ 三個同 EXEC 文件原文有出入嘅實作決定(2026-08-23 執行時實測改,report
//    §0 會列返數):
//    (a) EXEC §3.1 寫 `cjkChars`/`latinChars` 用**全文**計。實測唔得:器樂片
//        嘅 whisper 幻覺係「同一句 credit 行 loop 幾十次」(memory
//        project-lyrics-r1-2026-08-22-night「詞曲李宗盛/張震嶽」指紋),
//        #5699 全文有 570 幾個 CJK 字,照全文計會將幾乎所有真器樂片踢落擦邊
//        名單,自動回標等於做唔到。所以字數改用**去重之後**嘅文本計
//        (`uniqueContentLen()` 同一套 `\n` 切行 + normCompare 去重),
//        全文數字照樣寫入 report 做審計。
//    (b) 加多一道 `uniqSegs <= 4` 前置閘 —— 呢個係 memory
//        project-daily-proofread-copyright-blocker 實測出嚟「幻覺 loop」嘅
//        最可靠指紋(ws 字數可以去到 573,但 unique 段數得 1-4)。
//    (c) 加多兩道硬閘,補返 §10.2「8033 型:器樂版但片上打晒歌詞字幕」
//        (第一道閘係 EXEC 寫明嘅 lyrics_status='verified' 一律唔掂):
//        · `lyrics` 欄有文本 = 有出街歌詞,一律唔准自動標;
//        · `lyrics_status='draft'` 一律唔准自動標 —— draft 係四條複核線
//          (R1/R1b/R2/R2b)而家手頭嘅活貨,標落去等於喺人哋隊列中間抽走
//          一首,亦都同 T3 個 lyrics_status 寫入撞。只有 `unavailable`/`none`
//          (兩者都係終態/未開工)先入自動回標。
//        ⚠️ **唔可以**用 `lyrics_draft` 做閘:實測 739/3989/5065/5690/5699
//        呢批公認器樂片個 draft 全部都有嘢,但入面係專輯封面浮水印嘅 OCR
//        亂碼(「06 慈 愛素」「新心國語敬拜專輯之四」),唔係歌詞。
//    (d) 【最重要嗰道】「靜」分兩種,只有一種可以自動標:
//        · **佔位符型**(unique 行全部係 `[MUSIC]`/`[BLANK_AUDIO]`/`upbeat
//          music` 呢類 whisper 音效標記)= whisper 明確講「我聽唔到人聲」
//          → 可以自動標。
//        · **幻覺型**(unique 行係「詞曲李宗盛」「詩歌歌詞的錄音」呢類 loop)
//          = whisper 亂噏,證明唔到有冇人聲 → **唔可以**自動標,落擦邊名單。
//          實測打死呢條界線嘅反例:#3015「不再是奴僕 粵語版 Cover」、#3022
//          「飢渴 粵語版」呢批 CantonHymn 翻唱**有人聲**,但 whisper 一係得
//          `[MUSIC]` 一係吐「詩歌歌詞的錄音」loop —— 淨計字數同覆蓋率
//          分唔開佢哋同真器樂片。
//        · 另外 whisper 有一批標記係**人聲嘅正面證據**(`singing in foreign
//          language`/`[APPLAUSE]`/`[FOREIGN]`/`audience cheering`),中咗
//          一條就直接判「唔係器樂」,連擦邊都唔入(report §6 另外列數)。
//    (e) 【第二道獨立證據 —— 呢個係最後打死自動回標誤判嘅一刀】
//        實測發現「佔位符型 whisper」**都唔夠**做自動回標嘅唯一證據:whisper
//        對住**非英文人聲**成首歌交白卷、吐足全首 `[MUSIC]` 係常態。反例:
//          #5202-5234 SOP 韓文專輯「가사 영상 Lyrics」(韓文歌詞 MV,有人聲)
//          #5642-5659 SOP 日文專輯「リリック Lyrics」(日文歌詞 MV,有人聲)
//          #3015 不再是奴僕 粵語版 Cover、#3383 默然愛我 —— 全部 whisper 得 `[MUSIC]`
//        所以自動回標改成**要兩條互相獨立嘅證據**:
//          ① whisper 佔位符型全程靜(音訊證據)
//          ② 歌名/專輯有器樂訊號(演奏/純音樂/弦樂四重奏/Piano Lullaby/
//             禱告音樂/安靜系列 …)或者喺 EXEC §3.2 已知名單(元資料證據)
//        淨係中①嘅一律落擦邊名單等 Eric 過目(Eric Q6 原話:「唔肯定嘅開名單」)。
//        呢個做法同 PLAN §10.1「掹錯時代曲嘅根治係白名單唔係關鍵字」一致。
//    (f) Q3「伴奏/karaoke/卡拉OK/backing track 唔收」—— 歌名中咗呢批
//        blacklist 嘅,就算兩條證據齊都唔自動標(落擦邊名單),因為落咗 flag
//        等於出現喺「純音樂」tab,同 Q3 拍板相反。
//
// 用法:node scripts/scanInstrumentalCandidates.mjs [--out-stamp YYYYMMDD]

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { normCompare } from '../lib/textSimilarity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'hymns.db');
const OUT_DIR = path.join(__dirname, '..', 'data', 'instrumental');

const stampArg = process.argv.indexOf('--out-stamp');
const STAMP = stampArg > -1 ? process.argv[stampArg + 1] : new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ── 門檻(實錘)────────────────────────────────────────────────
const HARD_COVERAGE = 0.85;   // whisper 要聽到尾,先證明到「成首歌都冇人聲」
const HARD_UNIQ_SEGS = 4;     // unique 段數 ≤ 4 = 幻覺 loop / [MUSIC] 佔位符
const HARD_CJK = 30;
const HARD_LATIN = 60;
// ── 門檻(擦邊,人手名單)——實錘門檻嘅 1.5 倍 / coverage 放寬到 0.70 ──
const SOFT_COVERAGE = 0.70;
const SOFT_UNIQ_SEGS = 6;
const SOFT_CJK = 45;
const SOFT_LATIN = 90;

// ── whisper 音效標記分類(實測 2026-08-23 全庫 unique 行詞彙表打出嚟)──
// tokenKey:剝走所有標點/括號/空白,淨返字母數字同 CJK,再細楷。
// `[MUSIC]`→`music`、`>>[APPLAUSE]`→`applause`、`♪Well turn up our song♪`→`wellturnupoursong`
const tokenKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿㐀-䶿]/g, '');

// 「whisper 聽唔到人聲」嘅佔位符/環境音標記 —— 全部 unique 行都係呢啲先准自動標
const MUSIC_PLACEHOLDERS = new Set([
  'music', 'musicplaying', 'musicplays', 'blankaudio', 'silence', 'nospeech', 'pause', 'sound',
  'upbeatmusic', 'softmusic', 'softpianomusic', 'pianomusic', 'gentlemusic', 'gentlepianomusic',
  'instrumentalmusic', 'softinstrumentalmusic', 'calmmusic', 'slowmusic', 'musiccontinues',
  'watertrickling', 'windblowing', 'birdschirping',
]);

// 人聲/現場觀眾嘅**正面**證據 —— 中一條就唔係器樂,連擦邊都唔入
const VOCAL_MARK_RE = /sing|speech|speak|vocal|applau|cheer|laugh|gasp|audience|foreign|nonenglish|chant|choir|humming|narrat|talking|crowd|whisper(ing)?voice/;

// ── 第二道獨立證據:歌名/專輯嘅器樂訊號(見檔頭 (e))──────────────
// 全部係**完整詞組**,唔用單字(PLAN §10.5「bare 見證」前科)。
const TITLE_INSTRUMENTAL_ZH = [
  '演奏', '純音樂', '樂器', '弦樂', '管弦', '鋼琴曲', '琴韻',
  '禱告音樂', '靈修音樂', '默想音樂', '冥想音樂', '安靜系列',
];
const TITLE_INSTRUMENTAL_EN = [
  /\binstrumental\b/i, /\bstring quartet\b/i, /\blullab(y|ies)\b/i,
  /\bpiano (lullaby|cover|solo|version|instrumental)\b/i, /\bsoaking\b/i,
];
// Q3 拍板唔收 —— 就算兩條證據齊都唔自動標
const TITLE_BLACKLIST = ['伴奏', '卡拉OK', 'KALA版', 'karaoke', 'backing track'];

function titleEvidence(title = '', album = '') {
  const hay = `${title} ${album}`;
  const low = hay.toLowerCase();
  for (const w of TITLE_BLACKLIST) if (low.includes(w.toLowerCase())) return { ok: false, blacklisted: w };
  for (const w of TITLE_INSTRUMENTAL_ZH) if (hay.includes(w)) return { ok: true, hit: w };
  for (const re of TITLE_INSTRUMENTAL_EN) { const m = hay.match(re); if (m) return { ok: true, hit: m[0] }; }
  return { ok: false };
}

const CJK_RE = /[一-鿿㐀-䶿]/g;
const LATIN_RE = /[a-zA-Z]/g;
const cjkCount = (s) => ((s || '').match(CJK_RE) || []).length;
const latinCount = (s) => ((s || '').match(LATIN_RE) || []).length;

// duration 係 TEXT "M:SS" / "H:MM:SS",純分鐘制(62:30 = 62分30秒)。
// parse 唔到就回 0(caller 當「計唔到覆蓋率」處理,唔准估)。
function durationSecs(d) {
  if (!d) return 0;
  const raw = String(d).trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(raw)) return 0;
  const p = raw.split(':').map((x) => parseInt(x, 10) || 0);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0];
}

// 逐行去重(唔理標點/空白差異)—— 同 auditLyricsBatch.js uniqueContentLen()
// 一樣嘅切法,但呢度要攞返啲行本身嚟計字數,唔淨係計長度。
function uniqueLines(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || '').split(/[\n。,,!!??;;]/)) {
    const k = normCompare(line);
    if (!k || k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function loadRows() {
  const sql = `SELECT id, title, display_title, artist, org, lang, duration, lyrics_status,
      lyrics_source, album, TRIM(COALESCE(lyrics,'')) AS lyr, TRIM(COALESCE(lyrics_draft,'')) AS drf,
      json_extract(lyrics_timeline,'$.whisper') AS whisper
    FROM hymns_all WHERE curated = 1 AND status = 'ok' ORDER BY id`;
  const out = execFileSync('sqlite3', ['-json', `file:${DB_PATH}?mode=ro`, sql],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out || '[]');
}

function analyse(r) {
  const dur = durationSecs(r.duration);
  let segs = [];
  let parseErr = null;
  if (r.whisper) {
    try {
      const parsed = JSON.parse(r.whisper);
      // ⚠️ `$.whisper` 唔一定係 array:落片失敗嗰啲寫咗個 `{"failed":"dead-video"}`
      // object 落去(9 首)。當「冇 whisper 段落」處理,唔可以當壞檔。
      if (Array.isArray(parsed)) segs = parsed;
      else if (parsed && typeof parsed === 'object') parseErr = null;
    } catch (e) { parseErr = String(e?.message || e); }
  }
  const wText = segs.map((x) => x.text || '').join('\n');   // ⚠️ 一定要 \n join
  const uniqSegTexts = new Set(segs.map((x) => normCompare(x.text || '')).filter(Boolean));
  const uniq = uniqueLines(wText);
  const uniqText = uniq.join('\n');
  const lastT1 = segs.length ? Math.max(...segs.map((x) => Number(x.t1 ?? x.end ?? 0) || 0)) : 0;
  return {
    id: r.id,
    title: r.display_title || r.title,
    artist: r.artist, org: r.org, lang: r.lang, album: r.album,
    titleEvidence: titleEvidence(r.title || '', r.album || ''),
    duration: r.duration, durSec: dur,
    lyrics_status: r.lyrics_status, lyrics_source: r.lyrics_source,
    hasLyricsText: !!r.lyr,          // 只計出街嘅 `lyrics`,唔計 `lyrics_draft`(見檔頭 (c))
    isDraft: r.lyrics_status === 'draft',
    segs: segs.length,
    uniqSegs: uniqSegTexts.size,
    lastT1: Math.round(lastT1),
    coverage: dur ? lastT1 / dur : null,
    cjkUniq: cjkCount(uniqText), latinUniq: latinCount(uniqText),
    cjkRaw: cjkCount(wText), latinRaw: latinCount(wText),
    placeholderOnly: uniq.length > 0 && uniq.every((l) => MUSIC_PLACEHOLDERS.has(tokenKey(l))),
    vocalMarks: uniq.filter((l) => VOCAL_MARK_RE.test(tokenKey(l))).slice(0, 3),
    sample: uniq.slice(0, 3).map((s) => s.slice(0, 40)),
    parseErr,
  };
}

function verdict(a) {
  if (a.parseErr) return { level: 'skip', why: `lyrics_timeline 壞咗:${a.parseErr}` };
  const isVerified = a.lyrics_status === 'verified';

  const quietUniq = a.cjkUniq < HARD_CJK && a.latinUniq < HARD_LATIN;
  const quietSoft = a.cjkUniq < SOFT_CJK && a.latinUniq < SOFT_LATIN;
  const covOk = a.coverage !== null && a.coverage >= HARD_COVERAGE;
  const covSoft = a.coverage !== null && a.coverage >= SOFT_COVERAGE;

  // 「靜」嘅實證齊晒(唔理 verified / 有冇歌詞文本)—— 用嚟分流
  const quietProven = covOk && a.uniqSegs > 0 && a.uniqSegs <= HARD_UNIQ_SEGS && quietUniq;

  if (isVerified && a.vocalMarks.length) return { level: 'skip', why: 'verified' };
  if (isVerified) {
    // ⚠️ verified 一律唔入候選(EXEC §3.1):保護「器樂版但片上打晒歌詞字幕」
    // 嗰類(3959/3976/3984/8033/8035)。淨係落觀察名單,唔准動。
    return quietProven
      ? { level: 'observe', why: 'lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動' }
      : { level: 'skip', why: 'verified' };
  }

  if (a.vocalMarks.length) return { level: 'vocal', why: `whisper 標到人聲/觀眾聲(${a.vocalMarks.join(', ')})—— 判定唔係器樂` };
  if (quietProven && a.hasLyricsText) return { level: 'soft', why: 'whisper 實錘靜,但 `lyrics` 欄有出街歌詞(8033 型風險)—— 唔自動標' };
  if (quietProven && a.isDraft) return { level: 'soft', why: 'whisper 實錘靜,但 lyrics_status=draft(四條複核線手頭活貨)—— 唔自動標,唔喺人哋隊列中間抽歌' };
  if (quietProven && !a.placeholderOnly) return { level: 'soft', why: `whisper 靜但係**幻覺型**(unique 行:${a.sample.join(' / ').slice(0, 60)})—— 證明唔到冇人聲,唔自動標` };
  if (quietProven && a.titleEvidence.blacklisted) return { level: 'soft', why: `whisper 佔位符型全程靜,但歌名中咗 Q3 blacklist「${a.titleEvidence.blacklisted}」(伴奏/karaoke 唔收)—— 唔自動標` };
  if (quietProven && !a.titleEvidence.ok) return { level: 'soft', why: `whisper 佔位符型全程靜,但歌名/專輯冇器樂訊號 —— 得一條證據,唔自動標(whisper 對非英文人聲交白卷都係吐 [MUSIC],#5202 韓文/#5642 日文歌詞 MV 就係咁誤中)` };
  if (quietProven) return { level: 'hard', why: `whisper實錘(佔位符型)cov=${(a.coverage * 100).toFixed(0)}% uniqSegs=${a.uniqSegs} cjk=${a.cjkUniq} latin=${a.latinUniq} 標記=${a.sample.join('/')};歌名證據「${a.titleEvidence.hit}」` };

  if (a.segs === 0) return { level: 'soft', why: 'whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇' };
  if (!a.durSec) return { level: 'soft', why: `duration 解唔到(${JSON.stringify(a.duration)})—— 計唔到覆蓋率` };

  if (covSoft && a.uniqSegs <= SOFT_UNIQ_SEGS && quietSoft) {
    return { level: 'soft', why: `擦邊 cov=${(a.coverage * 100).toFixed(0)}% uniqSegs=${a.uniqSegs} cjk=${a.cjkUniq} latin=${a.latinUniq}` };
  }
  return { level: 'skip', why: 'whisper 聽到人聲' };
}

// ── 已知名單(EXEC §3.2)────────────────────────────────────────
const TITLE_LIKE = ['%演奏%', '%Instrumental%', '%純音樂%'];
// SUPERVISION-LOG 三批死症 vein(讚美之泉 鋼琴演奏系列/安靜系列/弦樂四重奏/
// 青少年弦樂團),行號係 SUPERVISION-LOG.md 嘅人手判定紀錄
const VEIN_IDS = {
  'SUPERVISION-LOG:4145': [5065, 5690, 5691, 5701, 5803, 5804, 5805, 5806, 5810, 5812, 5922, 5925, 5980, 5990, 5991],
  'SUPERVISION-LOG:3822': [739, 2987, 2988],
  'SUPERVISION-LOG:5321': [5794, 5795, 5798, 5799, 5801, 5915],
};

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadRows();
  const byId = new Map();
  const analysed = rows.map((r) => { const a = analyse(r); a.verdict = verdict(a); byId.set(a.id, a); return a; });

  const titleSet = new Set(rows.filter((r) => TITLE_LIKE.some((p) => {
    const needle = p.replace(/%/g, '');
    return String(r.title || '').toLowerCase().includes(needle.toLowerCase());
  })).map((r) => r.id));

  const veinById = new Map();
  for (const [src, ids] of Object.entries(VEIN_IDS)) for (const id of ids) veinById.set(id, src);

  const hard = analysed.filter((a) => a.verdict.level === 'hard');
  const soft = analysed.filter((a) => a.verdict.level === 'soft');
  const observe = analysed.filter((a) => a.verdict.level === 'observe');
  const vocal = analysed.filter((a) => a.verdict.level === 'vocal');

  // 已知名單核實:逐個過 T2 判定式
  const known = [];
  for (const id of new Set([...titleSet, ...veinById.keys()])) {
    const a = byId.get(id);
    const basis = [];
    if (titleSet.has(id)) basis.push('title-match');
    if (veinById.has(id)) basis.push(veinById.get(id));
    if (!a) { known.push({ id, basis, state: 'NOT-IN-SCOPE', note: '唔喺 curated=1 AND status=ok 範圍(可能已落架)' }); continue; }
    known.push({
      id, basis, state: a.verdict.level, note: a.verdict.why,
      title: a.title, lyrics_status: a.lyrics_status, duration: a.duration,
      segs: a.segs, uniqSegs: a.uniqSegs,
      coverage: a.coverage === null ? null : Number(a.coverage.toFixed(3)),
      cjkUniq: a.cjkUniq, latinUniq: a.latinUniq,
    });
  }

  // T3 自動回標名單 = 實錘 ∪ 已知名單(EXEC §3.2)—— 已 dedupe
  //
  // 已知名單(title 有「演奏/Instrumental/純音樂」+ SUPERVISION-LOG 三批 vein)
  // 本身就係**獨立於 whisper 嘅證據**,所以佢哋唔使過「佔位符型」嗰道閘
  // (幻覺型 whisper 喺呢批身上好常見:#3989/#5699/#739 都係「詞曲李宗盛」loop)。
  // 但其餘幾道安全閘照樣要過:verified 唔掂、`lyrics` 有文本唔掂、draft 唔掂、
  // 有人聲標記唔掂、覆蓋率同字數要夠靜。
  const applyList = hard.map((a) => ({ id: a.id, reason: a.verdict.why, title: a.title }));
  const applyIds = new Set(applyList.map((x) => x.id));
  const knownAdded = [];
  for (const id of new Set([...titleSet, ...veinById.keys()])) {
    if (applyIds.has(id)) continue;
    const a = byId.get(id);
    if (!a) continue;
    const basis = [titleSet.has(id) ? 'title-match' : null, veinById.get(id)].filter(Boolean).join(' + ');
    if (a.lyrics_status === 'verified' || a.hasLyricsText || a.isDraft || a.vocalMarks.length) continue;
    if (a.titleEvidence.blacklisted) continue;   // Q3:伴奏/karaoke 唔收
    const covOk = a.coverage !== null && a.coverage >= HARD_COVERAGE;
    const quiet = a.uniqSegs > 0 && a.uniqSegs <= HARD_UNIQ_SEGS && a.cjkUniq < HARD_CJK && a.latinUniq < HARD_LATIN;
    if (a.segs === 0) {
      // 冇 whisper timeline —— 照 EXEC §3.2 尾段,用已知名單嘅人手判定紀錄做依據,
      // 但要有**歌名**呢個獨立證據先算(淨係 vein id 冇歌名證據嘅唔夠)
      if (!titleSet.has(id)) continue;
      applyList.push({ id, reason: `已知名單(${basis}):歌名明示器樂版,whisper 冇 timeline,依 SUPERVISION-LOG 人手判定`, title: a.title });
      applyIds.add(id); knownAdded.push({ id, basis, why: 'segs=0,靠歌名證據' });
      continue;
    }
    if (!covOk || !quiet) continue;
    applyList.push({ id, reason: `已知名單(${basis})+ whisper 靜 cov=${(a.coverage * 100).toFixed(0)}% uniqSegs=${a.uniqSegs} cjk=${a.cjkUniq} latin=${a.latinUniq}`, title: a.title });
    applyIds.add(id); knownAdded.push({ id, basis, why: `幻覺型 whisper 但已知名單有獨立證據 cov=${(a.coverage * 100).toFixed(0)}%` });
  }
  applyList.sort((x, y) => x.id - y.id);

  const json = {
    generated: new Date().toISOString(),
    db: path.basename(DB_PATH),
    scope: 'curated=1 AND status=ok',
    thresholds: { HARD_COVERAGE, HARD_UNIQ_SEGS, HARD_CJK, HARD_LATIN, SOFT_COVERAGE, SOFT_UNIQ_SEGS, SOFT_CJK, SOFT_LATIN },
    totals: { scanned: analysed.length, hard: hard.length, soft: soft.length, observe: observe.length, vocal: vocal.length, apply: applyList.length },
    hard, soft, observe, vocal, known, knownAdded,
    applyList,
  };
  const jsonPath = path.join(OUT_DIR, `scan-${STAMP}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));

  const softOnly = soft.filter((a) => !applyIds.has(a.id));
  const softTitled = softOnly.filter((a) => a.titleEvidence.ok);
  const softRest = softOnly.filter((a) => !a.titleEvidence.ok);

  const fmt = (a) => `| ${a.id} | ${String(a.title || '').replace(/\|/g, '/').slice(0, 44)} | ${a.artist || ''} | ${a.duration || '?'} | ${a.lyrics_status} | ${a.segs}/${a.uniqSegs} | ${a.coverage === null ? '—' : (a.coverage * 100).toFixed(0) + '%'} | ${a.cjkUniq}/${a.latinUniq} | ${a.titleEvidence.ok ? a.titleEvidence.hit : (a.titleEvidence.blacklisted ? '⛔' + a.titleEvidence.blacklisted : '—')} | ${a.sample.join(' ⏎ ').slice(0, 44)} |`;
  const head = '| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |\n|---|---|---|---|---|---|---|---|---|---|';

  const md = `# 純音樂候選掃描報告(T2)

產生時間:${json.generated}
範圍:\`curated=1 AND status='ok'\`,共 **${analysed.length}** 首
判定式:\`auditLyricsBatch.js whisperShortVerdict()\` 反轉用,詳見 \`scanInstrumentalCandidates.mjs\` 檔頭

## §0 門檻

實錘(T3 自動回標)—— **兩條互相獨立嘅證據都要齊**:
1. **音訊證據**:\`coverage ≥ ${HARD_COVERAGE}\` 且 \`unique 段數 ≤ ${HARD_UNIQ_SEGS}\` 且去重後 \`CJK < ${HARD_CJK}\`、\`latin < ${HARD_LATIN}\`,而且 unique 行**全部**係 whisper 音效佔位符(\`[MUSIC]\`/\`[BLANK_AUDIO]\`/\`upbeat music\` 呢類),冇任何人聲標記
2. **元資料證據**:歌名/專輯有器樂訊號(演奏/純音樂/弦樂/禱告音樂/安靜系列/Instrumental/Piano Lullaby/String Quartet …),或者喺 EXEC §3.2 已知名單
3. 另加安全閘:\`lyrics_status ≠ verified\`、\`lyrics\` 欄空、\`lyrics_status ≠ draft\`、歌名唔中 Q3 blacklist(伴奏/karaoke)

⚠️ **點解要兩條證據**:實測 whisper 對住非英文人聲成首歌交白卷、吐足全首 \`[MUSIC]\` 係常態
(#5202-5234 SOP 韓文歌詞 MV、#5642-5659 SOP 日文歌詞 MV、#3015 粵語 cover —— 全部有人聲但 whisper 得 \`[MUSIC]\`)。
淨靠音訊證據會將呢批誤標。
擦邊(人手名單,**唔寫 DB**):\`coverage ≥ ${SOFT_COVERAGE}\`、\`unique 段數 ≤ ${SOFT_UNIQ_SEGS}\`、\`CJK < ${SOFT_CJK}\`、\`latin < ${SOFT_LATIN}\` 任一喺 1.5 倍緩衝內,或者 whisper 段數 = 0,或者 duration 解唔到

## §1 統計

| 級 | 首數 | 去向 |
|---|---|---|
| 實錘(佔位符型 whisper) | **${hard.length}** | T3 自動落 \`instrumental=1\` |
| 已知名單補入(歌名/SUPERVISION-LOG 有獨立證據) | **${knownAdded.length}** | T3 自動落 \`instrumental=1\` |
| **T3 回標總數** | **${applyList.length}** | \`apply-${STAMP}.json\` |
| 擦邊 | **${softOnly.length}** | 人手名單,等 Eric 過目,**唔寫 DB**(其中 ${softTitled.length} 首歌名有器樂訊號 = 最高優先,見 §3.1) |
| whisper 標到人聲/觀眾聲 | **${vocal.length}** | 判定唔係器樂,唔入名單(§6) |
| verified 但 whisper 全程靜(觀察) | **${observe.length}** | **唔准動** |

## §2 實錘名單(${hard.length} 首,佔位符型 whisper)

${head}
${hard.map(fmt).join('\n')}

## §3 擦邊名單(${softOnly.length} 首)—— 唔寫 DB,等 Eric 過目

_(原始 soft 判定 ${soft.length} 首,扣走 ${soft.length - softOnly.length} 首經 §5 已知名單補入咗 T3 回標嘅。)_

### §3.1 最高優先:歌名有器樂訊號,只差 whisper 實證(${softTitled.length} 首)

呢批**歌名/專輯已經有器樂訊號**,唯一唔夠嘅係音訊證據(whisper 係幻覺型 loop、
冇 timeline、或者 duration 解唔到),所以自動回標唔敢郁。Eric 睇一眼就可以批一批。
⚠️ 提提你:歌名有「靈修音樂」唔一定係器樂 —— #5349/#5350「8分鐘敬拜靈修音樂」
係 verified 有 413 字歌詞嘅**有人聲**歌(佢哋已經俾 verified 閘擋住)。

${head}
${softTitled.map(fmt).join('\n')}

### §3.2 其餘擦邊(${softRest.length} 首)

${head}
${softRest.slice(0, 80).map(fmt).join('\n')}

${softRest.length > 80 ? `_(表只列頭 80 首,全份喺 JSON 嘅 \`soft\` 陣列。)_` : ''}

## §4 verified 但 whisper 全程靜(${observe.length} 首)—— 觀察名單,唔准動

呢類係「器樂版但片上打晒歌詞字幕」(8033 仲救返過原曲 7721,見 SUPERVISION-LOG:6181)。
whisper 聽唔到人聲係啱嘅,但首歌本身有 verified 歌詞 —— 標 instrumental 會令歌詞消失,所以一律唔掂。

${head}
${observe.slice(0, 50).map(fmt).join('\n')}

${observe.length > 50 ? `_(表只列頭 50 首,全份 ${observe.length} 首喺 \`scan-${STAMP}.json\` 嘅 \`observe\` 陣列。呢個數字大係正常:whisper 幻覺 loop 喺全庫好普遍,而呢啲歌係靠 OCR 做到 verified 嘅。)_` : ''}

## §5 已知名單核實(EXEC §3.2)

title-match(演奏/Instrumental/純音樂)+ SUPERVISION-LOG 三批 vein id,逐個過返 T2 判定式:

| id | 依據 | T2 判定 | 歌名 | lyrics_status | 長度 | segs/uniq | cov | cjk/latin(去重) | 備註 |
|---|---|---|---|---|---|---|---|---|---|
${known.sort((x, y) => x.id - y.id).map((k) => `| ${k.id} | ${k.basis.join(' + ')} | ${k.state} | ${String(k.title || '').replace(/\|/g, '/').slice(0, 40)} | ${k.lyrics_status || '—'} | ${k.duration || '—'} | ${k.segs ?? '—'}/${k.uniqSegs ?? '—'} | ${k.coverage === null || k.coverage === undefined ? '—' : (k.coverage * 100).toFixed(0) + '%'} | ${k.cjkUniq ?? '—'}/${k.latinUniq ?? '—'} | ${k.note} |`).join('\n')}

已知名單 **${known.length}** 首入面,**${known.filter((k) => applyIds.has(k.id)).length}** 首入咗 T3 回標(已 dedupe),**${known.filter((k) => !applyIds.has(k.id)).length}** 首唔入(原因見上表)。

其中 **${knownAdded.length}** 首係「whisper 判唔到(幻覺型 / 冇 timeline)但已知名單有獨立證據」而補入嘅:

${knownAdded.length ? knownAdded.map((k) => `- ${k.id} —— ${k.basis} —— ${k.why}`).join('\n') : '_(無)_'}

## §6 whisper 標到人聲/觀眾聲(${vocal.length} 首)—— 判定唔係器樂

呢批嘅 whisper 雖然轉錄唔到歌詞,但吐咗 \`singing in foreign language\` / \`[APPLAUSE]\` /
\`[FOREIGN]\` / \`audience cheering\` 呢類標記 —— 即係 whisper **明確聽到**有人唱/有觀眾,
只係轉錄唔到字。呢個係「唔係器樂」嘅正面證據,所以連擦邊名單都唔入。
(實例:#3015 不再是奴僕 粵語版 Cover、#4280 我要來大聲讚美祢 舞蹈版 —— 兩首都明顯有人聲。)

${head}
${vocal.slice(0, 40).map(fmt).join('\n')}

${vocal.length > 40 ? `_(表只列頭 40 首,全份喺 JSON 嘅 \`vocal\` 陣列。)_` : ''}
`;
  const mdPath = path.join(OUT_DIR, `scan-${STAMP}-report.md`);
  fs.writeFileSync(mdPath, md);

  const applyPath = path.join(OUT_DIR, `apply-${STAMP}.json`);
  fs.writeFileSync(applyPath, JSON.stringify(applyList, null, 2));

  console.log(`掃描 ${analysed.length} 首:實錘 ${hard.length}、擦邊 ${soft.length}、verified觀察 ${observe.length}`);
  console.log(`→ ${jsonPath}`);
  console.log(`→ ${mdPath}`);
  console.log(`→ ${applyPath}(T3 輸入)`);
}

main();
