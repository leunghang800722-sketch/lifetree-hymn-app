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
// ②b-2 2026-08-24 N4 實跑再補:專輯內頁 credits 唔止詞曲演唱,仲有混音/母帶/
// 製作人/樂手分軌(實測撞到「混音:張宇 / 母帶:張宇 / 製作人:張宇」)。
// ⚠️ 呢批**強制要有冒號**先算 —— 冇冒號嘅話「鋼琴聲響起」「和聲讚美主」
//    呢類真歌詞會中招(已驗:加咗冒號要求之後全部 false)。
// 精度實測(scan-20260824g):hard/soft/vocal/observe **全部 0 命中** ——
// 呢個 pattern 純粹係為新歌入庫線而設,唔會郁到存量任何一首。
const CREDITS_ROLE_COLON_RE = /^\s*(混音|母帶|母带|製作人|制作人|錄音|录音|混音師|配唱|和聲|和声|吉他|鋼琴|钢琴|弦樂|弦乐|鼓|貝斯|贝斯|監製|监制|統籌|统筹|企劃|企划|美術|美术|攝影|摄影)\s*[:：]\s*[一-鿿A-Za-z]{2,8}\s*$/;
// ②c 同場加映:whisper 喺靜音上會背誦流行歌歌詞碎片,呢兩句係實測反覆出現
// 嘅固定幻覺(`vocal` 0 / `observe` 4 / `soft` 6)。
const KNOWN_HALLUCINATION_LINES = [
  /^我就是想要你做我的(女)?朋友[，,。?？]?$/,
  /^知道嗎[?？]?$/,
  /^我只想跟你說一句話$/,
  /^我愛你[…\.]*$/,
];
// ②d 2026-08-24 N4 實跑再補:whisper 喺**靜音**上面會背誦佢訓練資料入面嘅
// YouTube 樣板文 —— 頻道 promo(「欢迎订阅我的频道…打赏支持」)、字幕組
// 水印、明報/明鏡呢類廣告字幕。呢批一定唔會係詩歌歌詞。
// 精度實測(scan-20260824d ground truth):`vocal` 212 首命中 **0**、
// `hard` 0、`soft` 0、`observe` 2 —— 零假陽性。
// (喺存量庫入面罕見,因為有人聲嘅歌 whisper 會轉錄真歌詞;呢個 pattern
//  主要係為新歌入庫線而設。)
// 分「強」「弱」兩級 —— 弱訊號單獨一個唔可以判死。實測踩過:
// 「我要訂閱這份愛」淨係中一個弱訊號(訂閱)就俾判做 promo,但佢完全可以
// 係一句真歌詞。所以:**強訊號一個就夠**(品牌名/字幕組,唔可能係歌詞),
// **弱訊號要夾夠兩個唔同嘅**先算(真 promo 樣板文一定夾住幾個)。
const PROMO_STRONG_RE = [
  /明镜|明鏡|明報|MING\s*PAO/i,
  /本字幕由|字幕組|字幕组|字幕由.*提供/,
  // 2026-08-24 N4 讚美之泉批再補(全部對 ground truth 實測 hard/soft/vocal/
  // observe **四個都 0 命中**,即係純為新歌線而設,郁唔到存量):
  /优优独播剧场|優優獨播劇場|YoYo\s*Television/i,   // YouTube 劇場頻道水印
  /Amara\.org/i,                                    // 字幕協作平台
  /由.{1,20}社群提供的字幕/,
  /^(中文)?字幕\s*[:：].{1,20}$/,                    // 「字幕:J Chong」
  /^(出品|發行|发行|導演|导演|策劃|策划)\s*[:：].{1,20}$/,
  /每週固定.{0,10}部影片|每周固定.{0,10}部影片/,
  /喜歡我的影片請訂閱|喜欢我的影片请订阅/,
];
const PROMO_WEAK_RE = [
  /订阅|訂閱/, /点赞|點贊|點讚/, /转发|轉發/, /打赏|打賞/, /请不吝|請不吝/,
  /关注我们|關注我們/, /感谢观看|感謝觀看|谢谢观看|謝謝觀看/, /我的频道|我的頻道/,
];
const isPromoLine = (raw) => PROMO_STRONG_RE.some((re) => re.test(raw))
  || PROMO_WEAK_RE.filter((re) => re.test(raw)).length >= 2;
// whisper 有時會將幾句幻覺**夾埋一個 segment** 出(實測:
// `我就是想要你做我的朋友, 知道嗎?` 係一行)。所以要按標點拆開,
// **每一小節都係已知幻覺**先算 —— 有任何一節係真嘢就唔算。
const splitClauses = (line) => String(line || '')
  .split(/[，,。.、；;？?！!\s]+/).map((x) => x.trim()).filter(Boolean);
const isKnownHallucinationClause = (c) =>
  CREDITS_LINE_RE.test(c) || CREDITS_ROLE_COLON_RE.test(c) || KNOWN_HALLUCINATION_LINES.some((re) => re.test(c))
  || isPromoLine(c);
export const isCreditsLine = (line) => {
  const raw = String(line || '').trim();
  if (!raw) return false;
  // ⚠️ promo 樣板文要**成行**比對,唔可以拆節 —— `splitClauses` 會連空白都拆,
  //    「MING PAO CANADA | MING PAO TOR」拆完變 ["MING","PAO","CANADA",…],
  //    逐節就冇一節配得中 `/MING\s*PAO/`(實測踩過)。
  if (isPromoLine(raw)) return true;
  const parts = splitClauses(raw);
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


