#!/usr/bin/env node
// 機械驗收關卡 —— 俾自動校對 routine(對照官方來源執靚 draft、輸出 reviewLyrics.js
// --apply 格式嘅 JSON)喺真係 --apply 之前用嚟自我檢查。純靜態檢查,唔開 DB、
// 唔郁網絡,淨係讀入一個 apply JSON 檔,行晒下面呢批 check:
//
//   1. JSON 格式啱、係陣列
//   2. 冇重複 id
//   3. {id, lyrics} 條目(verify)嘅 lyrics 唔可以係空 —— {id, demote:true} 條目
//      唔使呢個 check(demote 本身冇 lyrics 欄)
//   4. 衛生 regex:(編曲|監製|版權|訂閱|http|www\.|生成|Official MV|讚好)命中
//      即 reject —— 呢啲字眼代表 draft 摻埋咗 YouTube 頻道資訊/廣告,唔係正經歌詞
//   5. 太薄:中文歌 normalize(剝晒標點/空白)之後 <45 個 CJK 字 reject;純英文
//      (冇 CJK 字)<60 個字元 reject —— demote 條目唔使 check(冇 lyrics 可比)
//   6. 經文附註格式:半形括號包住「書卷 章:節」呢種格式(例:(約3:16))reject,
//      要求一定要用全形「（書卷 章:節）」先啱規格
//
// 輸出 <input>-passed.json(全部過晒嘅原始條目)+ <input>-rejects.json(冇過嘅
// 條目 + reject 原因陣列),exit code:0 = 全過,1 = 有 reject(俾自動校對
// routine 判斷使唔使停低人手覆核)。
//
// Usage:
//   node scripts/auditLyricsBatch.js /path/to/apply.json
//   node scripts/auditLyricsBatch.js /path/to/apply.json --quiet   # 淨係印總結,唔逐條印

import fs from 'fs';
import path from 'path';
import { normCompare, isCJK } from '../lib/textSimilarity.js';

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const INPUT_FILE = process.argv[2];
const QUIET = process.argv.includes('--quiet');

const HYGIENE_RE = /(編曲|監製|版權|訂閱|http|www\.|生成|Official MV|讚好)/;
// 半形括號包住「書卷 N:N」呢種經文附註 —— 一定要係 ASCII ( ) 先中,全形「（）」
// 係唔同 code point,唔會撞入呢條 regex(即係全形版本合規、唔會誤 reject)。
const HALFWIDTH_SCRIPTURE_RE = /\([^()]*\d+:\d+[^()]*\)/;
const MIN_CJK_CHARS = 45;
const MIN_LATIN_CHARS = 60;
const CJK_RE = /[一-鿿㐀-䶿]/g;

function charCountCJK(s) {
  return ((s || '').match(CJK_RE) || []).length;
}

// 檢查單一條目,回傳 reject 原因陣列(空陣列 = 全過)。
function auditItem(item) {
  const reasons = [];

  if (item?.id === undefined || item?.id === null) {
    reasons.push('冇 id');
    return reasons; // 冇 id 冚唪唥檢查都做唔到,即刻收
  }

  const isDemote = item?.demote === true;
  const hasLyricsField = Object.prototype.hasOwnProperty.call(item || {}, 'lyrics');

  if (!isDemote && !hasLyricsField) {
    reasons.push('唔識嘅條目格式(要係 {id, lyrics} 或者 {id, demote:true})');
    return reasons;
  }

  if (isDemote) return reasons; // demote 條目冇 lyrics 可比,淨係 id/重複 id check 適用

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
      reasons.push(`太薄(中文):normalize 後得 ${cjkChars} 個 CJK 字,少過門檻 ${MIN_CJK_CHARS}`);
    }
  } else {
    // 純英文/英文為主:睇成句字元數
    if (normalized.length < MIN_LATIN_CHARS) {
      reasons.push(`太薄(英文):normalize 後得 ${normalized.length} 個字元,少過門檻 ${MIN_LATIN_CHARS}`);
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

  const passed = [];
  const rejects = [];

  for (const item of items) {
    const reasons = auditItem(item);
    if (dupIds.has(item?.id)) reasons.push(`重複 id(呢個 id 喺檔入面出現 ${idCounts.get(item.id)} 次)`);

    if (reasons.length) {
      rejects.push({ ...item, rejectReasons: reasons });
      if (!QUIET) log(`  ✗ reject id=${item?.id ?? '(冇id)'}:${reasons.join('; ')}`);
    } else {
      passed.push(item);
    }
  }

  const { passed: passedPath, rejects: rejectsPath } = outPaths(INPUT_FILE);
  fs.writeFileSync(passedPath, JSON.stringify(passed, null, 2), 'utf8');
  fs.writeFileSync(rejectsPath, JSON.stringify(rejects, null, 2), 'utf8');

  log(`驗收完成:共 ${items.length} 條,過 ${passed.length} 條,reject ${rejects.length} 條`);
  log(`  → ${passedPath}`);
  log(`  → ${rejectsPath}`);

  process.exit(rejects.length ? 1 : 0);
}

main();
