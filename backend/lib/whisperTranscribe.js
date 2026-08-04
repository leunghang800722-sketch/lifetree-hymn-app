// lib/whisperTranscribe.js — whisper-cli 轉錄共用邏輯,俾 alignBackfill.js 同
// fetchLyrics.js 兩個 script 一致噉用(唔可以各自修一套,兩邊行為要對得上)。
//
// 2026-07-27 監督診斷(id=402 解剖,全批 51 首行完 alignLyrics 之後揪出嚟):
// whisper small model 用 `-l auto` 語言自動偵測,俾前奏/純音樂段搞到偵測去晒
// 僧伽羅文「වවව…」、希臘文「ἀἀἀ…」,仲有將中文字唱到轉做拼音羅馬字(「fang qi
// qie di chui qiu」= 放棄一切的追求)—— 成首歌轉錄變晒亂碼,alignLyrics.js
// match rate 跌到 0%。另外match 到嗰批都只得 57-74%,懷疑係 whisper 出簡體字
// vs OCR 繁體字冇做簡繁歸一,白蝕分(呢個修法喺 alignLyrics.js 嗰邊,呢度唔理)。
//
// 修法(呢個檔案負責頭三點):
//   1. model 一律用 medium(small 唔可靠 —— 粵語黃金測試已證,而家證埋國語都會炒)。
//   2. 唔准 -l auto:按草稿文字 CJK 字元佔比判斷,>30% → -l zh,否則 -l en
//      (whisper 冇細分粵/國,兩種中文都用 zh)。
//   3. zh 歌加中文 initial prompt(--prompt),防止拼音/外文 script 幻覺。
//   4. 垃圾偵測:zh 歌嘅 segment 如果 CJK 佔比 <30% → 當雜訊剷走嗰段;成首歌
//      >50% segments 係垃圾 → 當 whisper 轉錄失敗,唔好寫垃圾入 timeline。

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const exec = promisify(execCb);

export const WHISPER_BIN = 'whisper-cli';
export const DEFAULT_WHISPER_MODEL_NAME = 'medium';

// 中文 initial prompt —— 用漢字寫,幫 whisper 鎖定「呢度應該出中文」,減少幻覺出
// 拼音/其他 script。刻意冚粵語+國語兩種敬拜詩歌常見詞,唔偏向某一種。
const ZH_INITIAL_PROMPT = '以下是詩歌歌詞的錄音,粵語或國語敬拜讚美詩歌。';

const cjkRatio = (s) => {
  const text = (s || '').replace(/\s/g, '');
  if (!text.length) return 0;
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  return cjk / text.length;
};

// 按草稿/既有文字判斷呢首歌應該用邊個語言叫 whisper。CJK 佔比 >30% 當中文
// (-l zh),否則當英文(-l en)。搵唔到參考文字(draftText 空)嘅時候由caller
// 決定 fallback(通常用 DB 嘅 lang 欄位:'英文' → en,其他 → zh)。
export function detectWhisperLang(referenceText) {
  return cjkRatio(referenceText) > 0.3 ? 'zh' : 'en';
}

// 執行 whisper-cli 轉錄一個 wav,回傳 { segs, lang, garbageDropped, failed }。
//   wavPath: 16kHz mono wav 路徑
//   modelPath: ggml-*.bin 絕對路徑
//   lang: 'zh' | 'en'(由 detectWhisperLang 決定,唔准 'auto')
export async function runWhisperJson(wavPath, modelPath, lang, { timeout = 420000 } = {}) {
  const outBase = wavPath.replace(/\.wav$/, '');
  const promptArg = lang === 'zh' ? ` --prompt "${ZH_INITIAL_PROMPT}"` : '';
  await exec(
    `${WHISPER_BIN} -m "${modelPath}" -f "${wavPath}" -l ${lang}${promptArg} -oj -of "${outBase}" -np`,
    { timeout }
  );
  const jsonPath = `${outBase}.json`;
  if (!fs.existsSync(jsonPath)) return { segs: [], lang, garbageDropped: 0, failed: true };

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rawSegs = (parsed?.transcription || [])
    .map((s) => ({
      t0: Math.round((s.offsets?.from ?? 0) / 10) / 100,
      t1: Math.round((s.offsets?.to ?? 0) / 10) / 100,
      text: (s.text || '').trim(),
    }))
    .filter((s) => s.text);

  if (!rawSegs.length) return { segs: [], lang, garbageDropped: 0, failed: false };

  // 垃圾偵測淨係 zh 歌先做——英文歌嘅 CJK 比例天然係 0,唔可以用呢條規則篩佢。
  if (lang === 'zh') {
    const clean = rawSegs.filter((s) => cjkRatio(s.text) >= 0.3);
    const garbageDropped = rawSegs.length - clean.length;
    if (garbageDropped / rawSegs.length > 0.5) {
      // 成首歌大部分 segment 都係垃圾(亂碼/幻覺)→ 當轉錄失敗,唔好寫垃圾落 timeline。
      return { segs: [], lang, garbageDropped, failed: true };
    }
    return { segs: clean, lang, garbageDropped, failed: false };
  }
  return { segs: rawSegs, lang, garbageDropped: 0, failed: false };
}
