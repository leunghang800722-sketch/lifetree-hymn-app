// PaddleOCR 輸出 → mergeOcrLines 輸入嘅行級 filter(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P1/P2)。
// 由 fetchLyrics.js 抽出嚟做 lib,俾離線 harness 可以直接餵 paddleframe.py 嘅 JSON 回歸。
//
// 三類行級 filter(全部係「剔走唔要嘅行」,唔會改字):
//   * score < PADDLE_MIN_SCORE → OCR 自己都冇信心(過場動畫殘影/半透明特效),掉。
//   * 拼音行 → 掉(讚美之泉兒童系列嗰類字幕每句下面有拼音行,唔係歌詞)。
//     判定:帶 ≥2 個聲調字母,或者 ≥3 個 token 入面 ≥60% 係合法拼音音節。
//   * 純拉丁 ≤2 個字母嘅行(「G」「M」過場殘影)→ 掉。
// 加一個位置級 watermark 預filter(bbox 係 Paddle 獨有,Vision 冇):同一個畫面
// 位置喺 >55% 有字 frame 都有嘢,而且嗰個位置啲文字彼此相似(即係唔係逐句轉嘅
// 字幕區)→ 成個位置判 watermark 剔走。

import { cjkCount } from './lyricsLangCheck.js';

// 明顯 credits/版權行(片頭片尾字卡)—— 唔係歌詞,直接剔。詞曲/主領呢類頭卡
// 資訊 audit 層 HYGIENE_RE 本身會 reject 成份 draft,喺度剔咗佢,免得一句字卡
// 累到成首歌俾 audit 彈返轉頭。
const CREDITS_RE = /(copyright|all rights reserved|©|℗|CCLI|https?:|www\.|multimedia|production|ministries|官方|訂閱|按讚|詞[:：]|曲[:：]|词[:：]|主領[:：]?|監製|編曲|製作)/i;

export const PADDLE_MIN_SCORE = 0.85;

const PINYIN_DIACRITICS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/g;
// 常見拼音音節(唔求完備,夠判定用):聲母+韻母嘅寬鬆組合
const PINYIN_SYLLABLE = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(i?ang|i?ong|u?ang|u?eng|i?an|u?an|üan|i?ao|iu|ie|üe|er|ai|ei|ao|ou|an|en|in|un|ün|a|o|e|i|u|ü|ng)[1-5]?$/i;

export function isPinyinLine(text) {
  const t = (text || '').trim();
  if (!t || cjkCount(t)) return false;
  if (((t.match(PINYIN_DIACRITICS)) || []).length >= 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;
  const hits = tokens.filter((w) => PINYIN_SYLLABLE.test(w.replace(/[^a-zü]/gi, ''))).length;
  return hits / tokens.length >= 0.6;
}

// ⚠️ 唔好加「頻率/時間類位置 watermark filter」(2026-08-16 試過,已剷):字幕區
// 個位置成條片都「有嘢」,而重複度高嘅兒歌(id 4228 成首歌得兩三句)令「內容
// 相似=watermark」假設冧檔,實測連正確中文歌詞全部剷埋。改用下面呢條**無狀態**
// 幾何規則 —— 實測 id 241:歌詞行 h≈0.117 且置中(cx≈0.5),watermark
// 「雙膝跪下✝觸摸天堂/Joshua Band 18」h≈0.03 且偏左(cx≈0.2)。「字好細 +
// 明顯偏離中線」嘅行冇可能係字幕歌詞(角落 logo/專輯 watermark/經文出處先會咁),
// 逐行判,唔使靠頻率,亦唔會誤殺副歌。
const TINY_H_RATIO = 0.55;      // 行高 < 全片中位行高嘅 55%
const OFF_CENTER_MIN = 0.2;     // 且中心點偏離中線 ≥ 0.2(置中嘅字幕/雙語譯行唔會中)

// paddleframe.py 嘅 JSON entries → string[][](同 Vision 路徑一樣 shape,餵 mergeOcrLines)。
export function paddleEntriesToFrameLines(entries) {
  const heights = [];
  for (const e of entries) for (const ln of (e.lines || [])) {
    if (ln.box) heights.push(ln.box[3] - ln.box[1]);
  }
  heights.sort((a, b) => a - b);
  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 0;

  return entries.map((e) => (e.lines || []).filter((ln) => {
    if (typeof ln.score === 'number' && ln.score < PADDLE_MIN_SCORE) return false;
    if (isPinyinLine(ln.text)) return false;
    const t = (ln.text || '').trim();
    if (!cjkCount(t) && t.replace(/[^A-Za-z]/g, '').length <= 2) return false;
    if (CREDITS_RE.test(t)) return false;
    if (ln.box && medianH) {
      const h = ln.box[3] - ln.box[1];
      const cx = (ln.box[0] + ln.box[2]) / 2;
      if (h < medianH * TINY_H_RATIO && Math.abs(cx - 0.5) >= OFF_CENTER_MIN) return false;
    }
    return true;
  }).map((ln) => ln.text));
}
