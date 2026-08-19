#!/usr/bin/env node
// 機械驗收關卡 —— 俾自動校對 routine(對照官方來源執靚 draft、輸出 reviewLyrics.js
// --apply 格式嘅 JSON)喺真係 --apply 之前用嚟自我檢查。純靜態檢查,唔開 DB、
// 唔郁網絡,淨係讀入一個 apply JSON 檔,行晒下面呢批 check:
//
//   1. JSON 格式啱、係陣列
//   2. 冇重複 id
//   3. {id, lyrics} 條目(verify)嘅 lyrics 唔可以係空 —— {id, demote:true} 同
//      {id, unusable:true} 條目唔使呢個 check(兩者本身都冇 lyrics 欄)。
//      unusable = 底本判死(2026-08-13 reviewLyrics.js 加嘅第三種終態,寫
//      lyrics_status='unavailable'),同 demote 一樣淨係 id/重複 id check 適用。
//   4. 衛生 regex:(編曲|監製|版權|訂閱|http|www\.|AI生成|自動生成|Official MV|讚好)
//      命中即 reject —— 呢啲字眼代表 draft 摻埋咗 YouTube 頻道資訊/廣告,唔係正經歌詞
//   5. 太薄:中文歌 normalize(剝晒標點/空白)之後 <45 個 CJK 字 reject;純英文
//      ⚠️ 2026-08-19 加 whisper override:entry 帶 `shortOk: true` 嘅話,會開 DB
//      查返條片嘅 whisper timeline,確認「由頭聽到尾(覆蓋 ≥85%)+ 真係聽到嘢
//      + whisper unique 內容冇多過歌詞 1.6 倍」三樣都過,就當「天然短」放行。
//      實證唔過就照 reject,並印明點解唔過。詳見下面 SHORT_OK_* 常數嗰段註解。
//      (冇 CJK 字)<60 個字元 reject —— demote 條目唔使 check(冇 lyrics 可比)
//   6. 經文附註格式:半形括號包住「書卷 章:節」呢種格式(例:(約3:16))reject,
//      要求一定要用全形「（書卷 章:節）」先啱規格
//
// 輸出三個檔:<input>-passed.json(全部過晒嘅原始條目,只有呢個准 --apply)、
// <input>-rejects.json(冇過嘅條目 + reject 原因陣列)、<input>-langmismatch.json
// (2026-08-15 加:lang 標中文但歌詞主要係英文嘅條目,唔入 passed,merge 落
// backend/data/lyrics-langmismatch-hold.json 等 Eric 拍板)。exit code:0 = 全過,
// 1 = 有 reject(俾自動校對 routine 判斷使唔使停低人手覆核)。
//
// Usage:
//   node scripts/auditLyricsBatch.js /path/to/apply.json
//   node scripts/auditLyricsBatch.js /path/to/apply.json --quiet   # 淨係印總結,唔逐條印

import fs from 'fs';
import path from 'path';
import { normCompare, isCJK } from '../lib/textSimilarity.js';
import { langMismatchReason as langMismatchReasonShared } from '../lib/lyricsLangCheck.js';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const INPUT_FILE = process.argv[2];
const QUIET = process.argv.includes('--quiet');

// 2026-08-15:『生成』由裸字收窄做『AI生成|自動生成』—— 裸字會誤殺正經歌詞
// (SUPERVISION-LOG L4800 實錄:id 3140「降生成為人子」俾呢條 regex reject 咗)。
const HYGIENE_RE = /(編曲|監製|版權|訂閱|http|www\.|AI生成|自動生成|Official MV|讚好)/;
// 半形括號包住「書卷 N:N」呢種經文附註 —— 一定要係 ASCII ( ) 先中,全形「（）」
// 係唔同 code point,唔會撞入呢條 regex(即係全形版本合規、唔會誤 reject)。
const HALFWIDTH_SCRIPTURE_RE = /\([^()]*\d+:\d+[^()]*\)/;
const MIN_CJK_CHARS = 45;
const MIN_LATIN_CHARS = 60;

// ── whisper 完整轉錄 override(Eric 2026-08-19 拍板)────────────────────
// 問題:天然短嘅詩歌(例:5431 願祢國降臨 27 CJK、5632 祢的慈愛 29 CJK)成首歌
// 真係得四句,但俾 45 CJK 門檻硬擋死,每輪 export 都出返嚟俾人重讀,永遠出唔到街。
// 解法:如果 whisper **由頭聽到尾**都確認冇更多內容,咁「短」就係事實,唔係「薄」。
//
// 呢個 override **唔係口頭聲明就算**:reviewer 喺 apply entry 加 `shortOk: true`
// 之後,呢度會**真係開 DB 查返條片嘅 whisper timeline** 驗三樣嘢(三樣都要過):
//   1. 覆蓋率:whisper 最後一段講到成首歌 ≥85%(即係真係聽到尾,唔係聽一半死咗)
//   2. whisper 本身有嘢聽到:轉錄文字 ≥30 個 CJK 字(中文歌)/ ≥60 字元(英文歌)
//      —— 專門擋走 6385 賜福與你 嗰種「whisper 全程淨係出 [MUSIC]」嘅個案,
//      嗰啲根本實證唔到,唔可以放行。
//   3. 內容量對得上:whisper 去重之後嘅 unique 內容 ≤ 提交歌詞 × 1.6。
//      呢條係最緊要嘅一條 —— 如果 whisper 聽到嘅內容明顯多過你交嘅歌詞,
//      即係 OCR 漏咗嘢(唔係天然短),要打返轉頭。
// 另外仲有一條**硬地板**:唔理點都要 ≥12 CJK 字 / ≥20 字元,防止空殼過關。
const SHORT_OK_COVERAGE = 0.85;
const SHORT_OK_WHISPER_MIN_CJK = 30;
const SHORT_OK_WHISPER_MIN_LATIN = 60;
const SHORT_OK_CONTENT_RATIO = 1.6;
const SHORT_OK_HARD_FLOOR_CJK = 12;
const SHORT_OK_HARD_FLOOR_LATIN = 20;
const __dirname_audit = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname_audit, '..', 'hymns.db');

const durationSecs = (d) => {
  if (!d) return 0;
  const p = String(d).split(':').map((x) => parseInt(x, 10) || 0);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0];
};

// 逐行去重(唔理標點/空白差異),用嚟量「unique 內容有幾多」
function uniqueContentLen(text) {
  const seen = new Set();
  let n = 0;
  for (const line of String(text || '').split(/[\n。,,!!??;;]/)) {
    const k = normCompare(line);
    if (!k || k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    n += k.length;
  }
  return n;
}

// 開 DB 查 whisper timeline(read-only URI,唔會攞鎖、唔會阻住 producer)
function loadWhisperRows(ids) {
  if (!ids.length) return new Map();
  const sql = `SELECT id, duration, lyrics_timeline FROM hymns_all WHERE id IN (${ids.join(',')})`;
  try {
    const out = execFileSync('sqlite3', ['-json', `file:${DB_PATH}?mode=ro`, sql],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    return new Map(JSON.parse(out || '[]').map((r) => [r.id, r]));
  } catch (e) {
    log(`⚠ 查唔到 whisper timeline(${e?.message || e})—— 所有 shortOk 一律唔放行`);
    return new Map();
  }
}

// 回傳 null = 過(可以 override),否則回傳唔過嘅原因
function whisperShortVerdict(item, row) {
  if (!row) return 'DB 揾唔到呢個 id,實證唔到';
  const dur = durationSecs(row.duration);
  if (!dur) return '條片冇 duration,計唔到覆蓋率';
  let tl;
  try { tl = JSON.parse(row.lyrics_timeline || '{}'); } catch (_) { return 'lyrics_timeline 壞咗,解唔到'; }
  const segs = tl.whisper || [];
  if (!segs.length) return 'whisper 冇任何段落,實證唔到';

  const last = Math.max(...segs.map((x) => Number(x.t1 ?? x.end ?? 0)));
  const coverage = last / dur;
  if (coverage < SHORT_OK_COVERAGE) {
    return `whisper 只聽到 ${Math.round(last)}s / ${dur}s(覆蓋 ${(coverage * 100).toFixed(0)}%),未夠 ${SHORT_OK_COVERAGE * 100}%,證明唔到「聽到尾」`;
  }

  // ⚠️ 2026-08-19 修 join bug(R2 05:16 報、R1 09:05 獨立覆核實錘,兩條線都因為
  // 自己分區有苦主而避嫌冇改 code):**一定要用 \n join,唔可以用空格**。
  // uniqueContentLen() 係按 [\n。,,!!??;;] 切行嘅,而 whisper 段落本身好多時
  // 冇標點(兒歌/短詩歌係常態)—— 空格 join 會令成個轉錄變一條切唔開嘅巨行,
  // 「重複唱嘅段落」逐次照計做 unique,分子谷大,ratio 誤判成「OCR 漏咗嘢」,
  // 反而誤殺真正嘅天然短歌(實錄苦主:6166 小孩的讚頌 2.0×、6179 聖靈果子歌
  // 1.8×、7965 安心睡)。用 \n join 之後每段自成一行,重複段落先去得到重。
  const wText = segs.map((x) => x.text || '').join('\n');
  const lyrics = (item.lyrics || '').trim();
  const isCjkSong = isCJK(lyrics);
  const wCjk = charCountCJK(wText);
  const wLatin = normCompare(wText).length;
  if (isCjkSong ? wCjk < SHORT_OK_WHISPER_MIN_CJK : wLatin < SHORT_OK_WHISPER_MIN_LATIN) {
    return `whisper 轉錄根本冇聽到嘢(得 ${isCjkSong ? `${wCjk} 個 CJK 字` : `${wLatin} 字元`},例如成段都係 [MUSIC])—— 實證唔到首歌真係咁短`;
  }

  const wUniq = uniqueContentLen(wText);
  const lUniq = uniqueContentLen(lyrics);
  if (lUniq > 0 && wUniq > lUniq * SHORT_OK_CONTENT_RATIO) {
    return `whisper 聽到嘅 unique 內容(${wUniq})明顯多過你交嘅歌詞(${lUniq},比例 ${(wUniq / lUniq).toFixed(1)}×)—— 即係 OCR 漏咗嘢,唔係天然短`;
  }

  const nl = normCompare(lyrics);
  if (isCjkSong ? charCountCJK(nl) < SHORT_OK_HARD_FLOOR_CJK : nl.length < SHORT_OK_HARD_FLOOR_LATIN) {
    return `低過硬地板(${isCjkSong ? `${SHORT_OK_HARD_FLOOR_CJK} CJK 字` : `${SHORT_OK_HARD_FLOOR_LATIN} 字元`}),幾短都唔可以再短`;
  }
  return null;
}
const CJK_RE = /[一-鿿㐀-䶿]/g;

function charCountCJK(s) {
  return ((s || '').match(CJK_RE) || []).length;
}

// ── 語言錯配 bucket(LYRICS-47H-SPRINT-PLAN §P0.2 → 2026-08-16 改行級)────
// 舊版全文計「拉丁字母總數 vs CJK 字總數」——實測屈死雙語對照:同一句歌詞,
// 英文譯行天然係中文行 3-4 倍字符,官方 MV 中英對照字幕必然中招(hold 池 121
// 條有 117 條中文齊晒讀啱晒)。Eric 2026-08-16 拍板:跟官方,雙語對照照出街。
// 判定改用 lib/lyricsLangCheck.js 嘅**行級**分類(CJK 行佔比 ≥35% pass;
// <10% 真錯配 hold;中間疑似爛 draft hold),唯一來源,bi-freeze.mjs 都用同一份。
function langMismatchReason(item) {
  if (!Object.prototype.hasOwnProperty.call(item || {}, 'lang')) return null; // 冇 lang 欄就判唔到
  return langMismatchReasonShared(item.lang, item.lyrics);
}

// 檢查單一條目,回傳 reject 原因陣列(空陣列 = 全過)。
// 「太薄」呢個原因會俾 whisper override 蓋過,所以要認得出。用個前綴 tag,
// 唔使另外開 return 結構(其餘 caller 完全唔受影響)。
const THIN_TAG = '[thin]';
const isThinReason = (r) => String(r).startsWith(THIN_TAG);
const stripThinTag = (r) => String(r).replace(THIN_TAG, '');

function auditItem(item) {
  const reasons = [];

  if (item?.id === undefined || item?.id === null) {
    reasons.push('冇 id');
    return reasons; // 冇 id 冚唪唥檢查都做唔到,即刻收
  }

  const isDemote = item?.demote === true;
  const isUnusable = item?.unusable === true;
  const hasLyricsField = Object.prototype.hasOwnProperty.call(item || {}, 'lyrics');

  if (isDemote && isUnusable) {
    reasons.push('demote 同 unusable 唔可以同時 true(兩個終態互斥)');
    return reasons;
  }

  if (!isDemote && !isUnusable && !hasLyricsField) {
    reasons.push('唔識嘅條目格式(要係 {id, lyrics}、{id, demote:true} 或者 {id, unusable:true})');
    return reasons;
  }

  // demote / unusable 條目冇 lyrics 可比,淨係 id/重複 id check 適用
  if (isDemote || isUnusable) return reasons;

  const lyrics = item.lyrics;
  const trimmed = (lyrics || '').trim();
  if (!trimmed) {
    reasons.push('lyrics 為空');
    return reasons; // 冇內容,底下嘅 regex/字數 check 冇意思,唔使再做
  }

  if (HYGIENE_RE.test(trimmed)) {
    const hit = trimmed.match(HYGIENE_RE)[0];
    reasons.push(`衛生 regex 命中:「${hit}」(疑似頻道資訊/廣告,唔係正經歌詞)`);
  }

  if (HALFWIDTH_SCRIPTURE_RE.test(trimmed)) {
    const hit = trimmed.match(HALFWIDTH_SCRIPTURE_RE)[0];
    reasons.push(`經文附註用咗半形括號:「${hit}」(要改用全形「（書卷 章:節）」)`);
  }

  const normalized = normCompare(trimmed);
  // 中文歌 vs 純英文,借用 lib/textSimilarity.js 嘅 isCJK()(CJK 字數 vs 英文字母數,
  // 邊個多當邊種)—— 唔可以淨係睇「有冇 CJK 字」就當中文歌,好多首歌係英文為主、
  // 夾雜一兩句中文金句(例:實測 fixture id=1857,712 字英文入面得 16 個 CJK 字),
  // 咁樣應該當英文歌用 60 字元門檻,唔應該當中文歌用 45 CJK 字門檻屈死佢。
  if (isCJK(trimmed)) {
    // 中文歌(CJK 字數 ≥ 英文字母數):睇 CJK 字數
    const cjkChars = charCountCJK(normalized);
    if (cjkChars < MIN_CJK_CHARS) {
      reasons.push(`${THIN_TAG}太薄(中文):normalize 後得 ${cjkChars} 個 CJK 字,少過門檻 ${MIN_CJK_CHARS}`);
    }
  } else {
    // 純英文/英文為主:睇成句字元數
    if (normalized.length < MIN_LATIN_CHARS) {
      reasons.push(`${THIN_TAG}太薄(英文):normalize 後得 ${normalized.length} 個字元,少過門檻 ${MIN_LATIN_CHARS}`);
    }
  }

  return reasons;
}

function outPaths(inputPath) {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath) || '.json';
  const base = path.basename(inputPath, ext);
  return {
    passed: path.join(dir, `${base}-passed${ext}`),
    rejects: path.join(dir, `${base}-rejects${ext}`),
    langmismatch: path.join(dir, `${base}-langmismatch${ext}`),
  };
}

function main() {
  if (!INPUT_FILE) {
    log('用法:node scripts/auditLyricsBatch.js <apply.json> [--quiet]');
    process.exit(1);
  }
  if (!fs.existsSync(INPUT_FILE)) {
    log(`搵唔到檔案:${INPUT_FILE}`);
    process.exit(1);
  }

  let items;
  try {
    items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  } catch (e) {
    log(`JSON 格式錯:${e?.message || e}`);
    process.exit(1);
  }
  if (!Array.isArray(items)) {
    log('檔案要係 [{id, lyrics}] 或者 [{id, demote:true}] 陣列');
    process.exit(1);
  }

  // 重複 id 檢查(全域,喺逐條檢查之前先做):有重複嘅 id 全部標做 reject,
  // 因為冇辦法判斷邊條先啱,兩條(或以上)都唔可以放行。
  const idCounts = new Map();
  for (const item of items) {
    const id = item?.id;
    if (id === undefined || id === null) continue;
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const dupIds = new Set([...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id));

  // ── whisper 完整轉錄 override 預查 ───────────────────────────────────
  // 只有「帶咗 shortOk:true」而且「唔係 demote/unusable」嘅 entry 先會查 DB,
  // 所以平時完全唔會開 DB(維持原本純靜態、快)。
  const shortOkIds = items
    .filter((it) => it?.shortOk === true && it?.demote !== true && it?.unusable !== true
                    && Number.isInteger(it?.id))
    .map((it) => it.id);
  const whisperRows = shortOkIds.length ? loadWhisperRows(shortOkIds) : new Map();
  const overrideVerdict = new Map(); // id → null(過) / string(唔過嘅原因)
  for (const it of items) {
    if (it?.shortOk !== true || !Number.isInteger(it?.id)) continue;
    overrideVerdict.set(it.id, whisperShortVerdict(it, whisperRows.get(it.id)));
  }
  if (shortOkIds.length) {
    const ok = [...overrideVerdict.values()].filter((v) => v === null).length;
    log(`whisper override:${shortOkIds.length} 條聲明 shortOk,實證過 ${ok} 條、唔過 ${shortOkIds.length - ok} 條`);
  }
  let overrode = 0;

  const passed = [];
  const rejects = [];
  const langMismatched = [];
  let noLangField = 0;

  for (const item of items) {
    const reasons = auditItem(item);
    if (dupIds.has(item?.id)) reasons.push(`重複 id(呢個 id 喺檔入面出現 ${idCounts.get(item.id)} 次)`);

    // 語言錯配優先分流:呢類**一定唔可以入 passed**(入咗就係重演 263 首問題),
    // 就算佢同時有其他 reject 原因,都係擺入 hold 池等 Eric,唔會蝕貨。
    const mismatch = langMismatchReason(item);
    const isVerifyItem = item?.demote !== true && item?.unusable !== true
      && Object.prototype.hasOwnProperty.call(item || {}, 'lyrics');
    if (isVerifyItem && !Object.prototype.hasOwnProperty.call(item || {}, 'lang')) noLangField++;

    // whisper override:淨係「太薄」呢一個原因,而且 shortOk 實證過,先至放行。
    // 有第二個 reject 原因(衛生 regex / 經文括號 / 重複 id 等)就唔會放行 ——
    // override 淨係推翻「太薄」,唔係萬能通行證。
    if (reasons.length && reasons.every(isThinReason) && item?.shortOk === true) {
      const verdict = overrideVerdict.get(item.id);
      if (verdict === null) {
        overrode++;
        if (!QUIET) log(`  ↗ whisper override 放行 id=${item.id}:${stripThinTag(reasons[0])} —— 但 whisper 由頭聽到尾確認冇更多內容`);
        reasons.length = 0;
      } else if (!QUIET) {
        log(`  ✗ shortOk 實證唔過 id=${item.id}:${verdict}`);
      }
    }
    reasons.forEach((r, i) => { reasons[i] = stripThinTag(r); });

    if (mismatch) {
      langMismatched.push({ ...item, holdReason: mismatch, ...(reasons.length ? { rejectReasons: reasons } : {}) });
      if (!QUIET) log(`  ⏸ hold id=${item?.id ?? '(冇id)'}:${mismatch}`);
    } else if (reasons.length) {
      rejects.push({ ...item, rejectReasons: reasons });
      if (!QUIET) log(`  ✗ reject id=${item?.id ?? '(冇id)'}:${reasons.join('; ')}`);
    } else {
      passed.push(item);
    }
  }

  const { passed: passedPath, rejects: rejectsPath, langmismatch: langPath } = outPaths(INPUT_FILE);
  fs.writeFileSync(passedPath, JSON.stringify(passed, null, 2), 'utf8');
  fs.writeFileSync(rejectsPath, JSON.stringify(rejects, null, 2), 'utf8');
  fs.writeFileSync(langPath, JSON.stringify(langMismatched, null, 2), 'utf8');

  log(`驗收完成:共 ${items.length} 條,過 ${passed.length} 條,reject ${rejects.length} 條,語言錯配 hold ${langMismatched.length} 條` +
      (overrode ? `,其中 ${overrode} 條靠 whisper 完整轉錄 override 咗字數門檻` : ''));
  log(`  → ${passedPath}`);
  log(`  → ${rejectsPath}`);
  log(`  → ${langPath}${langMismatched.length ? '(merge 落 backend/data/lyrics-langmismatch-hold.json,唔好 apply、唔好判 unusable)' : ''}`);
  if (noLangField) log(`  ⚠ 有 ${noLangField} 條 {id, lyrics} 冇帶 lang 欄 —— 語言錯配擋板對呢啲判唔到,下批記住由 export 抄返個 lang`);

  process.exit(rejects.length ? 1 : 0);
}

main();
