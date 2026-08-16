// 歌詞語言錯配判定(行級)—— LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P0(Eric 2026-08-16 拍板)。
//
// 舊做法(auditLyricsBatch.js / bi-freeze.mjs 各自實現):全文計「拉丁字母總數 vs
// CJK 字總數」,latin > cjk 就當「中文歌配英文歌詞」。實測呢個量度屈死雙語對照:
// 同一句歌詞,英文譯行天然係中文行 3-4 倍字符(「藏我在 翅膀蔭下」7 字 vs
// "Hide me now under Your wings" 23 字母),官方 MV 嘅中英對照字幕**必然**中招 ——
// 2026-08-16 重審 hold 池 121 條,117 條中文行齊晒讀啱晒,純粹俾呢個字數比屈住。
//
// 新做法:逐行分類(CJK 行 = 行內 CJK 字多過拉丁字母),用「CJK 行佔比」判:
//   ≥ BILINGUAL_MIN_RATIO (0.35) → 雙語對照 / 中文為主,pass(Eric 拍板:跟官方,
//                                   雙語照出街)
//   < ENGLISH_ONLY_RATIO (0.10)  → 真·語言錯配(中文歌但幾乎冇中文行),hold
//   中間                          → 疑似爛 draft(亂碼淹沒),hold
//
// 呢個 lib 係唯一判定來源 —— auditLyricsBatch.js(apply 擋板)、bi-freeze.mjs
// (keeper 可做數/凍結名單)都 import 呢度,唔准各自再抄一份公式。

export const CJK_LANGS = new Set(['國語', '粵語', '兒童']);

const CJK_RE = /[一-鿿㐀-䶿]/g;
const LATIN_RE = /[A-Za-z]/g;

export const BILINGUAL_MIN_RATIO = 0.35;
export const ENGLISH_ONLY_RATIO = 0.10;

export const cjkCount = (s) => ((s || '').match(CJK_RE) || []).length;
export const latinCount = (s) => ((s || '').match(LATIN_RE) || []).length;

// 逐行分類。回傳 { cjkLines, latinLines, ratio, verdict }
//   verdict: 'pass'(中文為主/雙語對照)| 'english-only' | 'messy' | 'empty'
export function classifyLangMix(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let cjkLines = 0, latinLines = 0;
  for (const l of lines) {
    const c = cjkCount(l), a = latinCount(l);
    if (c > a) cjkLines++;
    else if (a > 0) latinLines++;
    // 淨符號/數字行唔計入任何一邊
  }
  const denom = cjkLines + latinLines;
  if (!denom) return { cjkLines, latinLines, ratio: 0, verdict: 'empty' };
  const ratio = cjkLines / denom;
  let verdict = 'pass';
  if (ratio < ENGLISH_ONLY_RATIO) verdict = 'english-only';
  else if (ratio < BILINGUAL_MIN_RATIO) verdict = 'messy';
  return { cjkLines, latinLines, ratio, verdict };
}

// apply 擋板用:lang 係中文而歌詞判唔過 → 回傳 hold 原因字串;過 → null。
export function langMismatchReason(lang, lyrics) {
  if (!CJK_LANGS.has(lang)) return null;
  const text = (lyrics || '').trim();
  if (!text) return null;
  const { cjkLines, latinLines, ratio, verdict } = classifyLangMix(text);
  if (verdict === 'pass' || verdict === 'empty') return null;
  const pct = Math.round(ratio * 100);
  if (verdict === 'english-only') {
    return `語言錯配:lang=${lang} 但 CJK 行只佔 ${pct}%(${cjkLines}/${cjkLines + latinLines} 行)——中文歌幾乎冇中文歌詞(入 hold 池等處理)`;
  }
  return `疑似爛草稿:lang=${lang} 而 CJK 行只佔 ${pct}%(${cjkLines}/${cjkLines + latinLines} 行)——似係 OCR 垃圾淹沒(入 hold 池等處理)`;
}
