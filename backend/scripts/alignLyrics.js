#!/usr/bin/env node
// 歌詞 STAGE 3「音訊次序驗證層」—— 任務4:對齊演算法。純本地計算,唔打 YouTube。
//
// 背景(見 fetchLyrics.js 頭註解、LYRICS-PIPELINE-PLAN):OCR 每 2 秒抽一張 frame,
// 同一版字幕影 2-5 次(假重複);單靠「畫面顯示次序」冇辦法分「真係唱多一次」
// 同「OCR 影多咗」。呢個 script 用 whisper timestamp 轉錄做「實際演唱」嘅
// ground truth 次序,fuzzy 對照返 OCR 文字(字面準過 whisper)做內容,合成
// 對齊結果。
//
// ── 兩層輸出(Eric 拍板,參考讚美之泉官網慣例)───────────────────────
//   verification(驗證層,唔出街):whisper 判斷出嚟嘅完整演唱次序,包括邊段
//     真係唱咗幾多次 —— 用嚟證明 ground truth 本身做啱咗(黃金測試睇呢層)。
//   display(顯示層,將來寫入 lyrics 俾用戶睇嗰版):喺 verification 基礎上
//     做「段落級」(stanza,唔係單行)去重 —— 同一段內容(normalize 後相似
//     度夠高)無論真定假重複,淨係顯示第一次出現嗰次,次序跟首次演唱位置。
//     單行喺唔同段落重複(副歌疊句)唔算段落重複,唔會被誤刪 —— 判斷單位
//     係成個 stanza 嘅合併文字,唔係逐行比對。
//
// ── OCR inventory 嚟源 ──────────────────────────────────────────────
//   新歌(STAGE 3 之後 fetchLyrics 產嘅):lyrics_timeline.ocr 已經係段落級
//   block(fetchLyrics.js mergeOcrLines 出嘅),每個 block = 一個 stanza。
//   舊歌(冇 lyrics_timeline.ocr,只有 lyrics_draft):draft 係逐行 flat dump
//   (STAGE 2 舊版冇分段結構),行一次雜訊清洗(剷 credits/水印殘留/網址)
//   當純逐行 inventory,唔強行假設段落邊界 —— display 層嘅 stanza 分組
//   完全靠 whisper 時間軸嘅停頓(唔靠 OCR 結構),所以呢個簡化唔影響 dedup。
//
// ── 對齊邏輯 ──────────────────────────────────────────────────────
//   1. 逐個 whisper segment(時間序)同 inventory 全部候選(單行 + 同一 block
//      內最多3行連續組合)比相似度,中文用字 bigram Dice,英文用 word overlap
//      (`lib/textSimilarity.js` 嘅 `textSimilarity`),揀最高分,≥ MATCH_THRESHOLD
//      先算 match,emit 嗰句 OCR 準確字面(唔用 whisper 錯字)。
//   2. verification 層:連續 emit 出嚟嘅內容(normalize 後)高度相似 —— 相隔
//      <8秒 = 同一句拉長咗畀 whisper 切開兩段,合併(唔重複 emit);≥8秒 =
//      真係再唱一次,保留做新一行。
//   3. display 層:將 verification 層嘅行,按 whisper 時間停頓(STANZA_GAP_SEC)
//      分組做「sung stanza」;每組同之前已顯示嘅 stanza 比對(normalize 後
//      相似度 ≥ STANZA_DEDUP_THRESHOLD)—— 似就跳過(唔顯示第二次),唔似
//      就顯示,次序 = 首次出現嗰次嘅位置。
//   4. 經文/書卷章節 pattern 嘅 inventory 行(whisper match 唔到,因為冇唱)
//      → 放喺 display 輸出尾做「(經文)」附註,唔好掉。
//   5. matchRate = 配對到嘅 whisper segment / 總 whisper segment 數。
//      Gate:≥55% auto-pass,唔夠 → confidence='low-confidence'(留返校對
//      session 搵官方歌詞或者扣起)。
//
// Usage:
//   node scripts/alignLyrics.js --id 141                    # 單首,印結果 + 寫 report
//   node scripts/alignLyrics.js --id 141,48,1725             # 多首(逗號分隔)
//   node scripts/alignLyrics.js --all                        # 全部有 timeline 嘅歌
//   node scripts/alignLyrics.js --id 141 --out /path/report.json

import fs from 'fs';
import path from 'path';
import { Converter } from 'opencc-js';
import { openDb, query } from '../lib/hymnDb.js';
import { normCompare, textSimilarity, isCJK } from '../lib/textSimilarity.js';

// 2026-07-27 監督診斷:whisper 出簡體字,OCR inventory(同官方歌詞)通常係繁體
// (讚美之泉/小羊多數繁體字幕)——直接逐字 bigram 比對,簡繁唔同字就當唔中,
// match 到嗰批都只得 57-74%,白蝕咗分。修法:比對之前兩邊文字都轉一次做繁體
// (cn→tw),**淨係影響比對用嘅相似度計算**——verificationText/displayText 全部
// 照樣輸出 inventory(OCR)原字,唔會被呢層改到。
const toTraditional = Converter({ from: 'cn', to: 'tw' });
// 統一入口:兩邊都轉繁體之後先叫返 textSimilarity(內部已經有 normCompare 剷標點)。
const simText = (a, b) => textSimilarity(toTraditional(a || ''), toTraditional(b || ''));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ID_ARG = arg('--id', null);
const ALL = process.argv.includes('--all');
const OUT_PATH = arg('--out', '/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/e9ebf027-df32-4c06-beb3-7233560815a5/scratchpad/align-report.json');

const MATCH_THRESHOLD = 0.5;
const LINE_REPEAT_GAP_SEC = 8;      // 同一句(verification 層)真/假重複嘅時間門檻
const LINE_REPEAT_SIM = 0.8;        // 判斷「呢句同上一句其實係同一句」嘅相似度門檻
const STANZA_DEDUP_SIM = 0.6;       // display 層 stanza 級去重(連續重複行)嘅相似度門檻
const AUTO_PASS_MATCH_RATE = 0.55;

// ── 經文/書卷章節 pattern ────────────────────────────────────────────
const SCRIPTURE_BOOKS = '創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳記|列王紀|歷代志|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米書|耶利米哀歌|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多前書|哥林多後書|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦前書|帖撒羅尼迦後書|提摩太前書|提摩太後書|提多書|腓利門書|希伯來書|雅各書|彼得前書|彼得後書|約翰一書|約翰二書|約翰三書|猶大書|啟示錄';
const SCRIPTURE_BOOK_RE = new RegExp(SCRIPTURE_BOOKS);
const CHAPTER_VERSE_RE = /\d{1,3}\s*[:：]\s*\d{1,3}/;
const isScriptureLine = (line) => SCRIPTURE_BOOK_RE.test(line) || CHAPTER_VERSE_RE.test(line);

// ── 舊 draft 雜訊清洗(冇 timeline.ocr 先用)─────────────────────────
const isCreditLine = (line) =>
  /^(曲|詞|作曲|作詞|編曲|監製|導演|攝影|剪接|出品|製作|MV|Lyrics|Music|Video)\s*[\/:：]/i.test(line) ||
  /^(曲|詞)\s*\/\s*(曲|詞)/.test(line);
const isUrlLine = (line) => /^(https?:\/\/|www\.)/i.test(line) || /\.(com|net|org|hk|tw)\b/i.test(line);
// 純 ASCII 短碎片(OCR 讀到卡拉OK/心心 icon 疊字嘅殘影,例:「VE！」「LOVE！」「Kess」)
// 淨係喺成首歌以中文為主先當噪音剔走 —— 英文歌唔可以用呢條(會誤殺真係短英文字)。
const isAsciiNoiseFragment = (line) => {
  const asciiOnly = line.replace(/[^a-zA-Z]/g, '');
  const hasCJK = /[一-鿿]/.test(line);
  return !hasCJK && asciiOnly.length >= 1 && asciiOnly.length <= 5 && asciiOnly.length === line.replace(/[^a-zA-Z0-9]/g, '').length;
};

function buildInventoryFromDraft(draftText) {
  const rawLines = (draftText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const songIsCJK = isCJK(draftText);
  const lines = [];
  for (const line of rawLines) {
    if (isCreditLine(line) || isUrlLine(line)) continue;
    if (songIsCJK && isAsciiNoiseFragment(line)) continue;
    lines.push({ text: line, scripture: isScriptureLine(line), blockStart: false });
  }
  return lines;
}

function buildInventoryFromTimelineOcr(ocrBlocks) {
  const lines = [];
  (ocrBlocks || []).forEach((b) => {
    const blockLines = (b.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    blockLines.forEach((line, i) => {
      lines.push({ text: line, scripture: isScriptureLine(line), blockStart: i === 0 });
    });
  });
  return lines;
}

// 候選:單行 + 同一 block 內最多連續 3 行嘅組合(俾 whisper 一段跨咗兩行原文
// 嘅情況都撞到)。舊 draft(冇 blockStart 資訊)當成一大個 block,一樣容許
// 跨行組合 —— 冇分段結構本來就冇得再細分,呢個簡化唔影響 display 層(嗰層
// 完全靠 whisper 時間停頓分組,唔靠呢度嘅 stanza 邊界)。
function buildCandidates(inventory) {
  const candidates = [];
  for (let i = 0; i < inventory.length; i++) {
    let text = inventory[i].text;
    candidates.push({ i0: i, i1: i, text });
    for (let len = 2; len <= 3 && i + len - 1 < inventory.length; len++) {
      // 唔跨 block 邊界(得 timeline.ocr 先有呢個資訊;舊 draft 全部 blockStart=false,唔會擋)
      if (inventory[i + len - 1].blockStart) break;
      text = inventory.slice(i, i + len).map((l) => l.text).join(' ');
      candidates.push({ i0: i, i1: i + len - 1, text });
    }
  }
  return candidates;
}

function bestMatch(segText, candidates) {
  let best = null, bestScore = -1;
  for (const c of candidates) {
    const score = simText(segText, c.text);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return { candidate: best, score: bestScore };
}

// ── 主對齊 function ─────────────────────────────────────────────────
// inventory: [{text, scripture, blockStart}], whisperSegs: [{t0,t1,text}](時間序)
function alignSong(inventory, whisperSegs) {
  const candidates = buildCandidates(inventory);
  const usedInventoryIdx = new Set();

  // ── verification 層:逐個 whisper segment 揾最似嘅 inventory 候選 ──
  // ⚠️ 2026-07-27 黃金測試(id=141)實測揪出嚟嘅 bug:如果直接用 candidate 嘅
  // (可能跨1-3行)joined text 做一個 verification 項,同一段內容真係再唱一次
  // 嗰陣,兩次 whisper segment 好可能撞中『唔同闊度』嘅 candidate(例如第一次
  // 淨係match到1行,第二次match到2行合併)—— 兩次 emit 出嚟嘅文字長度唔一,
  // 段落級去重(下面)逐行比對就會因為長度唔對稱而斷鏈,漏咗真正嘅重複。
  // 修法:唔好以 candidate 做 emit 單位,拆返做底層 inventory 嘅單一行 —— 逐個
  // matched candidate 展開做 (i1-i0+1) 個 verification 項,每項都係一句原本
  // OCR inventory 嘅單行文字。咁樣兩次真係唱同一句,無論嗰次 whisper match 到
  // 幾多行合併嘅 candidate,展開返出嚟都係同一組單行,先可以逐行對稱比較。
  const verification = []; // [{ text, t0, t1 }]
  let matchedCount = 0;
  for (const seg of whisperSegs) {
    const { candidate, score } = bestMatch(seg.text, candidates);
    if (!candidate || score < MATCH_THRESHOLD) continue;
    matchedCount++;
    for (let k = candidate.i0; k <= candidate.i1; k++) usedInventoryIdx.add(k);

    for (let idx = candidate.i0; idx <= candidate.i1; idx++) {
      const lineText = inventory[idx].text;
      const prev = verification[verification.length - 1];
      if (prev) {
        const gap = seg.t0 - prev.t1;
        const sim = simText(normCompare(prev.text), normCompare(lineText));
        if (gap < LINE_REPEAT_GAP_SEC && sim >= LINE_REPEAT_SIM) {
          // 同一句畀 whisper 切咗開兩段,或者跨行 candidate 入面同上一項撞返
          // 埋一齊,延長返上一行嘅結束時間,唔重複 emit。
          prev.t1 = Math.max(prev.t1, seg.t1);
          continue;
        }
      }
      verification.push({ text: lineText, t0: seg.t0, t1: seg.t1 });
    }
  }

  // ── display 層:段落(stanza)級去重 ──────────────────────────────
  // ⚠️ 2026-07-27 黃金測試(id=141)實測推翻咗最初嘅「時間停頓分 stanza」設計:
  // 呢首歌成首連續唱落嚟,主歌1→主歌2→副歌1→副歌2→bridge 之間完全冇 ≥3秒
  // 嘅停頓(whisper segment 一個接一個,t0 = 上一個 t1),用時間停頓分組會將
  // 唔同段落錯誤合併埋一齊、又完全偵測唔到邊度係第二輪重複嘅開始。
  //
  // 改做直接喺 verification 行序列上面揾「連續重複嘅一段行」(唔理時間):
  // 掃描揾 j 開始嘅內容,係咪同之前(i<j)開始嘅一段內容逐行都好似(similarity
  // ≥ STANZA_DEDUP_SIM),連續夠 MIN_REPEAT_RUN 行先算「成段重複」(先至係
  // 段落級,唔會誤刪淨係一兩行啱巧撞到嘅副歌疊句/refrain)—— 撞到就將 j 呢
  // 段成嚿標記做重複、喺 display 層剔除(verification 層原封不動保留)。
  const MIN_REPEAT_RUN = 3;
  const n = verification.length;
  const dropped = new Array(n).fill(false);
  for (let j = 0; j < n; j++) {
    if (dropped[j]) continue;
    for (let i = 0; i < j; i++) {
      if (dropped[i]) continue;
      if (simText(verification[i].text, verification[j].text) < STANZA_DEDUP_SIM) continue;
      let len = 0;
      while (
        i + len < j && j + len < n && !dropped[i + len] &&
        simText(verification[i + len].text, verification[j + len].text) >= STANZA_DEDUP_SIM
      ) len++;
      if (len >= MIN_REPEAT_RUN) {
        for (let k = 0; k < len; k++) dropped[j + k] = true;
        j += len - 1;
        break;
      }
    }
  }
  const displayLines = verification.filter((_, idx) => !dropped[idx]);
  const repeatedLineCount = dropped.filter(Boolean).length;
  const displayStanzas = [displayLines.map((l) => l.text).join('\n')];

  // ── 經文附註:whisper match 唔到嘅 scripture 行,放尾 ──
  const scriptureNotes = [];
  const seenScripture = new Set();
  inventory.forEach((l, idx) => {
    if (!l.scripture || usedInventoryIdx.has(idx)) return;
    if (seenScripture.has(l.text)) return;
    seenScripture.add(l.text);
    scriptureNotes.push(l.text);
  });

  const displayText = displayStanzas.join('\n\n') +
    (scriptureNotes.length ? `\n\n（經文）\n${scriptureNotes.join('\n')}` : '');
  const verificationText = verification.map((l) => l.text).join('\n');

  const matchRate = whisperSegs.length ? matchedCount / whisperSegs.length : 0;
  const usedInventoryLines = inventory.filter((_, idx) => usedInventoryIdx.has(idx)).length;
  const inventoryUsageRate = inventory.length ? usedInventoryLines / inventory.length : 0;

  return {
    verificationText,
    displayText,
    verificationLineCount: verification.length,
    displayLineCount: displayLines.length,
    repeatedLineCount,
    matchRate,
    inventoryUsageRate,
    scriptureNoteCount: scriptureNotes.length,
    confidence: matchRate >= AUTO_PASS_MATCH_RATE ? 'auto-pass' : 'low-confidence',
  };
}

function loadSong(db, id) {
  const rows = query(db, `SELECT id, title, artist, lang, lyrics_draft, lyrics_timeline FROM hymns_all WHERE id=?`, [id]);
  if (!rows.length) return null;
  const row = rows[0];
  let timeline = {};
  try { timeline = JSON.parse(row.lyrics_timeline || '{}') || {}; } catch (_) { timeline = {}; }
  const whisperSegs = Array.isArray(timeline.whisper) ? timeline.whisper : [];
  const ocrBlocks = Array.isArray(timeline.ocr) ? timeline.ocr : null;
  const inventory = ocrBlocks && ocrBlocks.length
    ? buildInventoryFromTimelineOcr(ocrBlocks)
    : buildInventoryFromDraft(row.lyrics_draft);
  return { row, inventory, whisperSegs, inventorySource: ocrBlocks && ocrBlocks.length ? 'timeline.ocr' : 'draft-fallback' };
}

function pickAllCandidates(db) {
  return query(db, `SELECT id FROM hymns_all
                    WHERE curated=1 AND status!='dead'
                      AND lyrics_status IN ('draft','verified') AND (lyrics_source IS NULL OR lyrics_source != 'manual')
                      AND lyrics_timeline IS NOT NULL AND TRIM(lyrics_timeline) != ''`).map((r) => r.id);
}

async function main() {
  const db = await openDb();
  let ids = [];
  if (ID_ARG) ids = ID_ARG.split(',').map((s) => Number(s.trim())).filter(Boolean);
  else if (ALL) ids = pickAllCandidates(db);
  else { console.log('用法:--id N[,N,...]  或  --all  [--out file.json]'); return; }

  const report = [];
  for (const id of ids) {
    const song = loadSong(db, id);
    if (!song) { console.log(`⚠ 搵唔到 id=${id}`); continue; }
    if (!song.whisperSegs.length) {
      console.log(`⚠ id=${id} [${song.row.artist}] ${song.row.title} —— 冇 whisper timeline,跳過(先行 alignBackfill.js)`);
      continue;
    }
    const result = alignSong(song.inventory, song.whisperSegs);
    console.log(`\n=== id=${id} [${song.row.artist}] ${song.row.title} (lang=${song.row.lang}) ===`);
    console.log(`  inventory 來源:${song.inventorySource}(${song.inventory.length} 行)  whisper segments:${song.whisperSegs.length}`);
    console.log(`  match rate: ${(result.matchRate * 100).toFixed(1)}%  inventory 使用率: ${(result.inventoryUsageRate * 100).toFixed(1)}%  confidence: ${result.confidence}`);
    console.log(`  verification 行數: ${result.verificationLineCount}  display 行數: ${result.displayLineCount}  去重咗(段落級重複): ${result.repeatedLineCount}`);
    console.log('  --- display 層(最終顯示版)---');
    console.log(result.displayText);
    report.push({
      id, title: song.row.title, artist: song.row.artist, lang: song.row.lang,
      inventorySource: song.inventorySource,
      inventoryLineCount: song.inventory.length,
      whisperSegmentCount: song.whisperSegs.length,
      matchRate: result.matchRate,
      inventoryUsageRate: result.inventoryUsageRate,
      confidence: result.confidence,
      verificationLineCount: result.verificationLineCount,
      displayLineCount: result.displayLineCount,
      repeatedLineCount: result.repeatedLineCount,
      verificationText: result.verificationText,
      displayText: result.displayText,
    });
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nreport 寫咗 → ${OUT_PATH}`);
}

main().catch((e) => { console.error('alignLyrics 出錯:', e); process.exit(1); });
