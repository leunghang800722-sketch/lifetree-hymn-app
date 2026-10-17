// 文字相似度工具 —— 歌詞 STAGE 3「音訊次序驗證層」共用:
//   · fetchLyrics.js  段落級 OCR frame 合併(相鄰 frame 定係同一版字幕)
//   · alignLyrics.js  whisper segment ↔ OCR inventory 行 fuzzy 對齊
//
// normCompare: 標點/空白唔理,淨係比對文字本身 —— OCR 好易將全形標點讀錯（「，」
// 讀成「。」之類),純標點差異唔應該拖累相似度判斷。
export const normCompare = (s) =>
  (s || '').replace(/[，。！？；：、,.!?;:「」『』"'()（）\-\s]/g, '');

function bigrams(s) {
  const arr = [];
  for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
  return arr;
}

// 字元 bigram 嘅 Dice 係數 —— 中文冇分詞、逐字 bigram 已經夠準;短句/單字都work
// (兩邊都得一隻字冇 bigram 就直接比較是否相等)。
export function bigramDice(a, b) {
  const sa = a || '', sb = b || '';
  const A = bigrams(sa), B = bigrams(sb);
  if (!A.length || !B.length) return sa === sb ? 1 : 0;
  const counts = new Map();
  for (const bg of B) counts.set(bg, (counts.get(bg) || 0) + 1);
  let common = 0;
  for (const bg of A) {
    const c = counts.get(bg) || 0;
    if (c > 0) { common++; counts.set(bg, c - 1); }
  }
  return (2 * common) / (A.length + B.length);
}

// 英文行用詞疊度(word-level Dice)—— 英文係以詞做語意單位,唔似中文咁啱用逐字 bigram。
export function wordOverlap(a, b) {
  const wa = new Set((a || '').toLowerCase().match(/[a-z0-9']+/g) || []);
  const wb = new Set((b || '').toLowerCase().match(/[a-z0-9']+/g) || []);
  if (!wa.size || !wb.size) return wa.size === wb.size ? 1 : 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return (2 * common) / (wa.size + wb.size);
}

// 粗略判斷一段文字係咪主要係中日韓文字(揀邊個相似度演算法用)。
export function isCJK(s) {
  const cjk = ((s || '').match(/[一-鿿㐀-䶿]/g) || []).length;
  const letters = ((s || '').match(/[a-zA-Z]/g) || []).length;
  return cjk >= letters;
}

// 統一入口:中文用 bigram Dice(唔理標點),英文/其他用詞疊度。
export function textSimilarity(a, b) {
  if (isCJK(a) || isCJK(b)) return bigramDice(normCompare(a), normCompare(b));
  return wordOverlap(a, b);
}
