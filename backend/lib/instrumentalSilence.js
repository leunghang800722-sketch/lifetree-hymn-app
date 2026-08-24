// lib/instrumentalSilence.js —— 「whisper 聽唔到人聲」嘅指紋庫(純音樂線共用)
//
// 2026-08-24 Phase 4 T7:由 `scripts/scanInstrumentalCandidates.mjs` 抽出嚟,
// 因為 `scripts/ingestInstrumental.mjs`(新歌入庫線)要用**同一套**判定。
// 兩條線唔可以各自維護一套 —— 存量回標同新歌入庫用唔同標準就冇得對數。
//
// ⚠️ 呢度啲 set/regex **唔係**「係器樂」嘅證據,係「whisper 呢一 pass 聽唔到
// 人聲」嘅證據。真正判器樂要兩條獨立腿(音訊 + 元資料),見 PHASE4-PLAN §4。
// 實錘:807 首 verified(確定有人聲)嘅歌入面,146 首 whisper 一樣吐呢啲嘢。

// tokenKey:剝走所有標點/括號/空白,淨返字母數字同 CJK,再細楷。
// `[MUSIC]`→`music`、`>>[APPLAUSE]`→`applause`
export const tokenKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿㐀-䶿]/g, '');

// ① 佔位符 / 環境音標記
export const MUSIC_PLACEHOLDERS = new Set([
  'music', 'musicplaying', 'musicplays', 'blankaudio', 'silence', 'nospeech', 'pause', 'sound',
  'upbeatmusic', 'softmusic', 'softpianomusic', 'pianomusic', 'gentlemusic', 'gentlepianomusic',
  'instrumentalmusic', 'softinstrumentalmusic', 'calmmusic', 'slowmusic', 'musiccontinues',
  'watertrickling', 'windblowing', 'birdschirping',
  // 2026-08-24 Phase 1.5:`watertrickling` 嘅同類變體(實測 vocal 0 / observe 0)
  'waterrunning', 'watersplashing',
  // ⚠️ **冇 `you`** —— 實測 vocal 2 / observe 30 命中(韓文/日文歌詞 MV、兒童歌
  // 呢批確定有人聲嘅片一樣吐 `[MUSIC] / you`),加咗會誤收。
]);

// ② 幻覺型靜音 —— whisper 對「冇人聲訊號」嘅預設輸出
//   A 類 · prompt 迴響:`詩歌歌詞的錄音`/`粵語或國語敬拜讚美詩歌` 逐字就係
//          lib/whisperTranscribe.js 個 ZH_INITIAL_PROMPT
//   B 類 · credits loop:`詞曲李宗盛`/`陳零九`/`韋禮安`/`張淑莉`
// 實驗室實錘(2026-08-24,ggml-medium):
//   · 6 秒純數碼靜音 wav → `-l zh` 吐「詞曲 李宗盛」、`-l en` 吐「you」
//   · 25 秒合成純音樂 wav → `-l zh` 吐「詩歌歌曲。」、`-l en` 吐「[Music]」
// 判準:成條 unique 行嘅 tokenKey **完全**由呢個詞彙表砌成(anchored,唔准
// substring)——真歌詞行一定夾雜其他字,砌唔出。
export const HALLUCINATED_SILENCE_VOCAB = [
  '以下是', '詩歌', '歌詞', '歌曲', '歌手', '錄音', '粵語', '國語', '台語', '英文',
  '或', '與', '和', '敬拜', '讚美', '聖歌', '音樂', '的',
  '作詞', '作曲', '編曲', '詞', '曲', '演唱', '主唱',
  '李宗盛', '陳零九', '韋禮安', '張淑莉',
];
export const HALLUCINATED_SILENCE_RE = new RegExp(`^(?:${HALLUCINATED_SILENCE_VOCAB.join('|')})+$`);
export const isHallucinatedSilence = (line) => HALLUCINATED_SILENCE_RE.test(tokenKey(line));

// ②b 2026-08-24 MORE-SOURCES N4 實跑補:上面個 B 類係**寫死藝人名**
// (李宗盛/陳零九/韋禮安/張淑莉),實跑即刻撞到名單以外嘅新變體
// (`詞曲:王智峯` / `演唱:王智峯`)。改用**結構規則**取代逐個名補:
// 成行係「credits 角色 + 冒號(可有可無)+ 2-4 個中文字」= credits 行,
// 唔可能係唱出嚟嘅歌詞。
// 精度實測(scan-20260824b ground truth):`vocal` 212 首命中 **0**,
// `hard`(已實錘器樂)12、`soft` 18、`observe` 94。
const CREDITS_LINE_RE = /^\s*(詞曲|作詞|作曲|編曲|演唱|主唱|歌手|製作|監製|詞|曲)\s*[:：]?\s*[一-鿿]{2,4}\s*$/;
// ②c 同場加映:whisper 喺靜音上會背誦流行歌歌詞碎片,呢兩句係實測反覆出現
// 嘅固定幻覺(`vocal` 0 / `observe` 4 / `soft` 6)。
const KNOWN_HALLUCINATION_LINES = [
  /^我就是想要你做我的(女)?朋友[，,。?？]?$/,
  /^知道嗎[?？]?$/,
];
// whisper 有時會將幾句幻覺**夾埋一個 segment** 出(實測:
// `我就是想要你做我的朋友, 知道嗎?` 係一行)。所以要按標點拆開,
// **每一小節都係已知幻覺**先算 —— 有任何一節係真嘢就唔算。
const splitClauses = (line) => String(line || '')
  .split(/[，,。.、；;？?！!\s]+/).map((x) => x.trim()).filter(Boolean);
const isKnownHallucinationClause = (c) =>
  CREDITS_LINE_RE.test(c) || KNOWN_HALLUCINATION_LINES.some((re) => re.test(c));
export const isCreditsLine = (line) => {
  const parts = splitClauses(line);
  return parts.length > 0 && parts.every(isKnownHallucinationClause);
};

// ③ 人聲/現場觀眾嘅**正面**證據 —— 中一條即刻唔係器樂
export const VOCAL_MARK_RE = /sing|speech|speak|vocal|applau|cheer|laugh|gasp|audience|foreign|nonenglish|chant|choir|humming|narrat|talking|crowd|whisper(ing)?voice/;
export const hasVocalMark = (line) => VOCAL_MARK_RE.test(tokenKey(line));

// ④ 括號音效標籤 —— whisper 嘅 sound-event tag 一律用 `[...]`/`(...)` 包住,
// 真歌詞行**冇可能**成行俾括號包住。所以「成行係一個括號標籤 + 唔中 vocalMark」
// = 音效標籤。呢條規則接住 whitelist 逐個字砌唔完嘅長尾(`[footsteps]`、
// `(instrumental)` 呢類)。
// 實測(對 scan-20260824.json,2026-08-24 T7):`vocal` 212 首**零**新增誤認,
// `soft` +1 / `observe` +1 —— 極保守。
// ⚠️ `hasVocalMark` 行先,所以 `[SINGING IN FOREIGN LANGUAGE]` / `[APPLAUSE]` /
//    `[NONENGLISHSINGING]` 全部照拒。
// ⚠️ 已知保守偏差:`hasVocalMark` 係 substring 比對,`[door closing]` 因為
//    「clo-sing」中咗 `sing` 而被拒。方向係「寧拒莫收」,P5 之下唔郁佢。
const BRACKET_TAG_RE = /^[\[\(（【][^\]\)）】]{1,40}[\]\)）】][.。]?$/;
export const isBracketSoundTag = (line) => BRACKET_TAG_RE.test(String(line || '').trim()) && !hasVocalMark(line);

// ⑤ 一條行係咪「靜音行」= 佔位符 OR 幻覺型 OR 括號音效標籤
export const isSilenceLine = (line) =>
  MUSIC_PLACEHOLDERS.has(tokenKey(line)) || isHallucinatedSilence(line)
  || isBracketSoundTag(line) || isCreditsLine(line);


