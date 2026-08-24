// lib/hymnDb.js — shared helpers for the offline maintenance scripts
// (dead-link checker + curation). These scripts own hymns.db on disk; the
// running server only ever reads it into memory at boot, so scripts must
// export()+write themselves and the server needs a restart to see changes.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { YTDLP } from './ytdlpBin.js';

const exec = promisify(execCb);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, '..', 'hymns.db');

export async function openDb() {
  const SQL = await initSqlJs();
  return new SQL.Database(fs.readFileSync(DB_PATH));
}

export function saveDb(db) {
  // Write atomically-ish: temp file then rename, so a crash mid-write can't
  // leave a truncated hymns.db (which would take the whole app down).
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, DB_PATH);
}

export function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Titles that are compilations / full albums rather than a single song.
// These are real entries in the DB (e.g. "THE WAY (全碟)", and id 800
// "Sunset Listen Through - Hymn Of Heaven" is a 54MB ~1.5h file). They stream
// badly (googlevideo throttles very long files toward playback rate) and they
// aren't what someone means by "a hymn", so they're excluded from the library.
export const COMPILATION_PATTERNS = [
  '%全碟%', '%全專輯%', '%專輯%', '%合輯%', '%詩歌集%',
  '%Top 100%', '%Top100%', '%Best of%', '%Best Of%', '%Ultimate%',
  '%Playlist%', '%playlist%', '%Album%', '%Listen Through%',
  '%Non Stop%', '%Nonstop%', '%Medley%', '%Compilation%',
  '%小時%', '%Hours%', '%hour %',
];

export function isCompilation(title = '') {
  const t = title.toLowerCase();
  const hit = [
    // ⚠️ 2026-07-26 查證(Eric 追問「點解成日0增長」揪出嚟):原本呢度有
    // 淨係「專輯」/「album」(冇「全」字),實測導致 backlog **78 首**正常
    // 單曲被誤殺 —— 「OO Track N of Mini-Album」、「XX詩歌專輯 6幸福」
    // 呢類係「呢首歌出自邊隻碟」嘅正常署名,唔代表條片本身係成隻碟。
    // 真正要擋嘅係「全碟/全專輯」(成隻碟一條片),已經有咗,唔可以再撞
    // 埋淨係「專輯/album」——留低會誤殺幾乎所有官方發行單曲。
    '全碟', '全專輯', '合輯', '合集', '詩歌集',
    // Found in the first curation pass: 11 of 143 curated songs were actually
    // multi-song compilations titled like "精选【天韵合唱团】...赞美诗歌15首（二）"
    // or "小羊诗歌 精选20首". They play, so acceptance wouldn't catch them — but
    // one "song" being 15 songs is not a hymn library.
    '精选', '精選', '热门', '熱門', '串烧', '串燒',
    'top 100', 'top100', 'best of', 'ultimate', 'playlist',
    'listen through', 'non stop', 'nonstop', 'medley', 'compilation',
    '小時', 'hours', 'greatest hits',
    // ⚠️ 2026-07-26 追加:攞走「album」單字之後,English 版「全碟」冇晒
    // 對應嘅信號——實測 Hillsong Kids「Piano Lullabies (Full Album) |
    // Hillsong Kids (1 Hour Peaceful Worship)」漏網(「hours」得複數形式,
    // 呢條係單數「1 Hour」)。加返「full album」(等於「全專輯」嘅英文版,
    // 冇「專輯」單字咁廣義,窄而準)同單數「1 hour」。
    'full album', '1 hour',
    // 2026-07-23 追加(查 ROLCC 順手撞到,唔係呢個頻道專屬):「最佳」/
    // 「推荐经典」呢類推介框架同「熱門」/「精选」係同一類 best-of 合輯,
    // 之前得「熱門/精选」冇埋呢兩個,漏咗一條 1h17m 嘅合輯冒充單曲。
    '最佳', '推荐经典', '推薦經典',
    // 2026-07-24 追加(discover 台北復興堂/Asia for JESUS 實測踩過):
    // 「宣教月｜一個成全他人夢想的教會｜王亞辰牧師」冇歌名,淨係主題+
    // 講員頭銜(牧師/傳道係中文講道嘅標準署名格式)。現有 520 首 curated
    // 撞呢兩個字嘅得返呢一條,零誤殺風險。
    // ⚠️ 2026-07-26 追加:「學院」原本淨係兩個字,discover 鹹蛋音樂事工
    // 實測撞到假陽性——「若未來留白...（建道神學院「___to the future
    // 青年會議」主題曲）」係正常歌,「建道神學院」淨係鳴謝／出處,唔係話
    // 條片本身係學院課程。收窄做「線上學院」,先啱得返原本想擋嘅
    // 「天國文化線上學院」呢類真.網課。
    '牧師', '傳道', '講座', '會長', '師母', '線上學院',
    // 2026-07-30 追加(Fable 5「假枯竭審計」方案,SUPERVISION-LOG 07-30 條目):
    // Asia for JESUS/台北復興堂嘅漏網候選大部分係研習會/線上課程/Q&A,原本方案
    // 仲提到「異象」「年度」,但落地前對全庫 1750+ 首 curated 做 regression 揪出
    // 呢兩個**唔可以用**——「異象」bare word 撞正 5 首正牌詩歌(包括「成為我異象
    // Be Thou My Vision」呢首全球知名嘅聖詩!),「年度」太廣義,零可靠訊號。
    // 「講座」上面已經有(唔使重複加)。淨係加返查證過零誤殺嘅三個:
    '研習會', '解惑', '線上研習',
    // 2026-07-27 追加(discover 基恩敬拜祈禱仔 playlist 實測踩過):「花絮」/
    // 「專輯介紹」/「課程回顧」呢類非歌 title 格式 —— 幕後花絮片、專輯宣傳
    // 介紹片、課程/事工回顧片,冇歌名。特登揀窄嘅完整詞組(唔加淨係
    // 「介紹」/「回顧」咁廣),因為「介紹」呢類字眼好可能出現喺正常歌名嘅
    // 副標題入面(誤殺風險高),已用現有 1480 首 curated 歌 check 過,
    // 「專輯介紹」「課程回顧」零命中,「花絮」命中嘅 5 首本身已經係
    // 誤收嘅幕後花絮片(唔係真歌),確認呢個關鍵字精準。
    '花絮', '專輯介紹', '課程回顧',
    // 2026-07-30 追加(backfillFromList.js 對同心圓敬拜嘅欠收清單實測踩過):
    // 「回顧」/「宣傳片」呢兩個之前冇加(對比返 2026-07-27 已有嘅「課程回顧」
    // 「宣傳影片」係窄詞組,漏咗「精彩回顧」「敬拜回顧」「宣傳片」呢啲變體)。
    // 落地前對全庫 curated regression:「回顧」4 中 4 全部係回顧片/合輯(2025
    // 青吶特會回顧影片/台北復興堂回顧影片/Facing GOD精彩回顧/鹹蛋2019敬拜回顧),
    // 「宣傳片」2 中 2 全部係活動宣傳片,零誤殺。⚠️ 冇加「特會」(太廣義,
    // 好多正牌歌都掛住「XX特會主題曲」,樣本細唔夠代表性)。
    '回顧', '宣傳片',
    // 2026-07-30 追加(新心音樂事工欠收清單實測踩過,方案原文都提到考慮呢個
    // 系列):「迎接聖誕十二天」係 12 集 devotional 系列(第一天…第十二天),
    // 唔係歌,但用嘅係「第N天」唔係現有 episode regex 撞嘅「第N集」,漏網。
    // 用完整專屬劇名做關鍵字(唔係泛用「第N天」regex),窄而準,查過現時
    // 全庫 0 個 curated=1 撞到,零誤殺。
    '迎接聖誕十二天',
    // 2026-07-31 追加(Eric 質疑「成晚冇攞到歌」查證期間,重新手動 backfill 果批
    // 實測踩過):「簡介」(課程/事工簡介)同「—介紹」(em dash + 介紹,devotional
    // 集介紹片)。⚠️ 唔可以加**bare「介紹」**——regression 揪出 9 中 7 個係
    // 「【介紹返】系列」,一個真.歌曲系列名(「感恩有祢 // 介紹返系列 // 余幸蓓」
    // 呢類全部係正牌歌),bare「介紹」會誤殺呢 7 首。「簡介」查過 7 中 7 全部係
    // 課程/事工/機構簡介,零誤殺。
    '簡介', '—介紹',
    // Asia for JESUS「WE R ONE Worship｜Revival X Radical｜Alleluia、
    // Shout For Freedom、10000 Armies…」呢類係大型特會現場全場敬拜
    // 錄影(一條片入面連唱幾首),用返佢哋自己嘅活動品牌名做訊號
    // (窄、但零誤殺,呢個頻道嘅同類內容全部用呢個品牌名)。
    'we r one',
    // Asia for JESUS 仲有網上課程/學院內容(「Kingdom Culture Online
    // Academy」),同天韻兒童踩過嗰條「作詞課」教學片同一類問題。
    'academy',
    // 2026-07-26 追加(discover Yancy 兒童頻道實測踩過):「What more
    // churches should be doing! Convo about Hosting Special Events with
    // Yancy + Brooke Gibson.」係訪談片唔係歌。backlog 得返多一條同類
    // (「...Interview with Canaan Baca...」),零誤殺風險。
    'convo', 'interview',
  ].some((p) => t.includes(p));
  // "…15首" / "…精选20首" — N songs in one video.
  const nSongs = /\d+\s*首/.test(title);
  // 直播/主日敬拜 set + 系列節目 —— 呢批冇上面任何關鍵字,靠內容特徵先捉到:
  //  · YYYYMMDD 日期戳(20260705)= 某日直播/主日敬拜嗰場,唔係一首歌
  //    (實測踩過:ROLCC「在你寶座前｜神羔羊…｜你是配得…20260705 #生命河主日敬拜」
  //     20分44秒 4 首連唱,前端一播就斷斷續續 —— archived livestream 本身冇乾淨
  //     progressive audio itag,resolve 落嚟個 format 令 ExoPlayer buffer 唔順)
  //  · 第N集 = 節目/系列(天韻「聲活圈 第14集…」根本係清談節目,唔係詩歌)
  //  · 主日敬拜/主日崇拜 = 成場崇拜,唔係單一首詩歌
  // ⚠️ 特登唔用「多個 | 分隔」做訊號:｜ 喺英文敬拜台好常見(「歌名 | 歌手 | 廠牌」),
  //    會誤殺一大堆正常單曲(Maverick City / Elevation…),命中率太低。
  // ⚠️ 2026-07-23 追加:唔可以淨係撞「YYYYMMDD 冇分隔」呢個 glued 格式。
  // ROLCC生命河「07.05.2026 #生命河美國250週年國慶崇拜…」(1h42m 成場崇拜)
  // 用嘅係 dotted 格式,原本 dateStamp 冧唔到,錯誤 curate 咗。
  // ⚠️ 2026-07-24 追加:上面嗰條 dd.mm.yyyy 淨係捉到年份擺尾嘅日期。
  // 台北611靈糧堂「台北611晨禱｜使徒行傳第28章…｜2026.06.19」用嘅係
  // **年份擺頭**嘅 yyyy.mm.dd,原本兩條都冧唔到,要獨立加多一條。
  const dateStamp = /20\d{6}/.test(title)
    || /\b\d{1,2}[.\/]\d{1,2}[.\/]20\d{2}\b/.test(title)
    || /\b20\d{2}[.\/]\d{1,2}[.\/]\d{1,2}\b/.test(title);
  const episode = /第\s*\d+\s*集/.test(title);
  // ⚠️ 2026-07-23 追加「N週年…崇拜」/「國慶崇拜」:同上面同一條 ROLCC
  // 片撞到嘅第二個漏洞 —— 「國慶崇拜」唔喺原本 5 個固定詞組入面。
  // ⚠️ 2026-07-24 追加「N天晚禱/生命見證/傳道講道」:台北611靈糧堂實測
  // 踩過 —— 佢個頻道幾乎全部係晨禱、21天晚禱、生命見證呢類禱告會/見證
  // 分享,冇歌名、淨係傳道/牧師名 + 日期。⚠️ 唔可以淨係撞「晨禱/晚禱」
  // 兩個字 —— 實測踩過:id 389「晨禱詩歌2026-1 我心旋律新歌」係正牌
  // 歌名(晨禱詩歌 = 詩歌嘅一種主題,唔係禱告會直播),撞單獨「晨禱」
  // 會誤殺。要「晨禱/晚禱」同「傳道/牧師」呢類講員頭銜**同一個 title
  // 出現**先算,或者「N天晚禱」(禱告會系列命名,好少會係歌名)先算。
  const prayerMeeting = /(晨禱|晚禱).*(傳道|牧師)|(傳道|牧師).*(晨禱|晚禱)|\d+\s*天晚禱/.test(title);
  const worshipSet = /主日敬拜|主日崇拜|崇拜實況|敬拜實錄|崇拜直播|週年.{0,6}崇拜|國慶崇拜|生命見證/.test(title) || prayerMeeting;
  // 英文版「第N集」:2026-07-23 discover Saddleback Kids 實測踩過 ——
  // "The Luminous City Episode 4 | Summer Blast 2026"、"Church at Home |
  // Elementary | Wherever You Go Week 4 - May 30/31" 呢類兒童事工節目集數,
  // 唔係歌,但冇撞上面任何中文關鍵字,一樣要擋。⚠️ 唔可以淨係撞「Series」+
  // 「Week N」—— 好多集數標題(例如上面「Wherever You Go Week 4」)冇
  // 「Series」呢個字,所以「Week N」自己一個就要當訊號,加埋「Church at
  // Home」(兒童事工線上崇拜嘅慣用命名)做多一重保險。
  const episodeEn = /\bepisode\s*\d+\b|\bweek\s*\d+\b|church at home/i.test(title);
  // 2026-07-23:ROLCC生命河「彤話詩歌」系列 —— 標題本身好似正常歌名
  // (「你神蹟如此真實」「你的愛不離不棄」),睇落完全捉唔到,要靠 YouTube
  // 真.title 帶住嘅「(River Worship 彤話詩歌)」呢個 suffix 先分到清:
  // 呢批片其實係「劉彤牧師主日崇拜講道尾聲嘅回應片段」,唔係獨立詩歌
  // (實測:8 首已收錄嘅同一形式,description 逐隻一模一樣)。⚠️ 現存
  // DB 嘅 title 已經俾之前某次入庫時嘅清理手續拆咗呢個 suffix,所以呢條
  // pattern 對現有 backlog 冇用(冇嘢再撞得中),純粹係俾將來(discover
  // mode 攞返呢個頻道,或者第二個掛住歌名但實質係講道回應片嘅頻道)
  // 帶住原汁原味 YouTube title 嘅新候選,喺入庫嗰一刻就擋得住。
  const sermonClip = /彤話詩歌|river worship/i.test(title);
  return hit || nSongs || dateStamp || episode || worshipSet || episodeEn || sermonClip;
}

// Not worship music at all. The scrape pulled in whole channels that merely
// LOOK devotional by name — e.g. artist "Grace Wu詩歌" is really a K-pop/pop
// dance-choreography channel (22 of its 23 entries are Aespa / Doja Cat /
// Bruno Mars / BTS dance tutorials). These pass every playability check, so
// only a content rule keeps them out of a hymn library.
const SECULAR_ARTISTS = ['grace wu詩歌', 'grace wu诗歌'];
// 2026-07-28 Fable 5 方案(SUPERVISION-LOG「器樂教學片滲漏」條目):琴譜/伴奏/
// 教學呢類器樂示範同課程片會播得到、標題又冇撞任何「合輯/講道」訊號,但唔係
// 一首完整嘅敬拜歌 —— 全庫掃到 62 首(讚美之泉兒童 40/KEC Worship 11/鹹蛋 4/
// 新心 3/Hillsong Kids 2/Endless 1/泥土 1),同一個頻道入面仲有大量真.MV 冇
// 撞到(讚美之泉兒童 117 首入面淨係 40 首中招,其餘 77 首真 MV 完全冇受影響)。
// ⚠️ 特登用完整詞組(「示範影片」/「琴譜」/「教學」呢類 2+字),唔用單字
// 「譜」「示範」——執行 session 落地前用全庫 curated 1750 首獨立 regression
// 過,單字會誤殺太多(「示範」可以出現喺敬拜示範現場片呢類正常歌名)。
export const INSTRUMENTAL_TUTORIAL_PATTERNS_ZH = ['琴譜', '樂譜', '歌譜', '伴奏', '教學', '示範影片', '純音樂', '預告', '宣傳影片'];
export const INSTRUMENTAL_TUTORIAL_PATTERNS_EN = ['tutorial', 'instrumental', 'sheet music', 'backing track', 'trailer', 'karaoke'];
// 2026-07-30 追加(Eric 喺兒童詩歌分類度親手撳到三條非歌內容,實測 whisper 轉錄
// +yt-dlp description 逐條 confirm):
//   ·「Word Absurd Ep. N」= Hillsong Kids 嘅 zoom 式聖經問答清談節目(自己
//     description 講明"a zoom style gameshow...Ridiculous questions"),全庫
//     8集全部中招、全部 curated=1,片長 7-8 分鐘啱啱好跌喺 SONG_DURATION 帶
//     入面,純靠片長攔唔到。
//   ·「Song Story」= Hillsong Kids 自家嘅「幕後訪談」franchise(description
//     講明"Interview with Kids Pastor...behind the scenes"),7 條全部中招。
//   ·「創意教室」= 讚美之泉兒童嘅「創意課室」小段——聽落似歌(标题帶歌名+
//     專輯名),實測全部 4 條 whisper 轉錄出嚟都係對白/講故仔/背經文,冇
//     一句係唱歌(例如「天上的家」嗰條係兩個角色講天堂盼望+讀約翰福音14:2-3,
//     「日日夜夜」嗰條係獨白式勸勉+讀以賽亞書54:10)。
//   ·「家長學生見證」/「創意學校」= 讚美之泉兒童敬拜創意學校嘅家長/學生見證
//     訪談片,唔係歌。
// ⚠️ 落地前對全庫 curated regression 驗證過,以下兩個「睇落啱」嘅字眼特登
// **冚咗唔用**,因為誤殺率太高:
//   · 淨「見證」bare word:10 個 curated=1 命中,得返 1 個(呢次目標嗰條)係
//     真.非歌,其餘 9 個係正牌歌名入面帶「見證」兩字(「見證信望愛」「雲彩
//     般的見證」「見證 親愛主」等)——同 2026-07-30 之前查過「異象」bare word
//     一樣嘅陷阱,唔可以用。
//   · 「Ep.」/「Episode N」縮寫格式:23 個 curated=1 命中,得返 8 個(Word
//     Absurd 本身)係非歌,其餘 19 個係鹹蛋音樂事工/悅雨音樂/角聲使團等頻道
//     用「EP.N」標自己單曲/MV 發行序號(例如「重生EP.1」「Racson's One-man
//     Project Ep.1」全部係真.官方 MV/cover),bare 「Ep.」規則會血洗呢批。
// 所以淨用查證過零誤殺嘅完整詞組/品牌名做訊號。
// 2026-07-30 追加(第二輪,Eric 再送4個非歌+1個要求聽真啲嘅例子):
//   ·「優勢好好玩」= Asia for JESUS 自製蓋洛普優勢教練清談節目(EP7 description
//     自己講"探索自己,發現獨特"、時間軸列晒訪談重點),唔係歌。
//   ·「工作坊」/「異象片」= 同一個頻道(Asia for JESUS)另外兩條:「領袖優勢
//     工作坊」係培訓工作坊(description:"兩位蓋洛普全球認證優勢教練教學與
//     引導...培訓...開課需求"),「約書亞樂團...年度異象片」係樂團年度使命/
//     歷史介紹片(description 純敘述 1998 年成立至今嘅歷程,冇歌詞),兩條都
//     喺 8 條入面之前已用「we r one」/「academy」/「回顧」擋咗 3 條,呢 3
//     條係漏網嘅第 4-6-7 條——即係話呢個頻道 DB 入面得返嘅 8 條,原來全部
//     8 條都唔啱做詩歌收錄,一條真歌都冇。
// ⚠️ 特登用「異象片」完整詞組,唔用淨「異象」——「異象」bare word 之前已經
// 查過(見上面 2026-07-30 第一輪嗰段)撞正「成為我異象 Be Thou My Vision」
// 呢類正牌歌名,「異象片」加咗「片」字先窄到得返呢類促銷/介紹片。
// 三個都對全庫 curated=1 regression 過,零誤殺。
// 2026-07-31 緊急追加(Fable 5 18:05 條目,Tier1 解凍 Asia for JESUS 之後即刻
// 漏網咗 4 條:「年度異象｜全新季節｜Vision 2024」+ 三條「青吶特會」workshop/
// 講員分享片)。⚠️ 落地前查證:bare「特會」12 中 7 個 curated=1 命中,7 個全部
// 係同心圓敬拜嘅正牌歌(「敬拜音樂特會」演唱會現場錄音,例如「《城裡哀歌》TWS
// 敬拜者使團「HEART」敬拜音樂特會2018」)——同「異象」bare word 一樣嘅陷阱,
// 唔可以用。「異象片」已經有(見上面),但「年度異象｜」呢個變體(冇「片」字
// 直接跟住)漏網。用返完整詞組「青吶特會」/「年度異象」,兩個都 0 個
// curated=1 誤殺(青吶特會 4 中 0、年度異象 2 中 0)。
export const NON_SONG_FORMAT_PATTERNS_ZH = ['創意教室', '創意學校', '家長學生見證', '工作坊', '異象片', '優勢好好玩', '青吶特會', '年度異象'];
export const NON_SONG_FORMAT_PATTERNS_EN = ['word absurd', 'song story'];
// ── 器樂線(純音樂 Phase 4)專用 gate config ────────────────────────────
// INSTRUMENTAL-CATEGORY-PLAN-20260821.md §4.1 Layer 2 / PHASE4-PLAN §3.3。
//
// 點解要 per-line config 而唔係剷走全局 blacklist:`INSTRUMENTAL_TUTORIAL_
// PATTERNS_*` 同時擋緊教學/琴譜/宣傳片,佢護緊主庫,剷咗成個庫即刻中招。
// 所以器樂線行嘅係「豁免幾個字眼 + 加返自己嗰批 exclude」,主庫零影響。
//
// ⚠️ 呢個 opts 係**第三個 optional 參數**:唔傳 opts 嘅 caller(全部 9 個現有
// caller)行為同改之前一模一樣,一個都唔使改。
//
// 豁免:呢兩個字眼喺器樂線就係標題本身,唔係雜訊訊號。
//   ·「演奏」本身唔喺任何 blacklist 入面(實查 2026-08-24),唔使豁免。
//   ·「伴奏 / karaoke / backing track」**唔豁免** —— §8 Q3 Eric 拍板唔收。
const INSTRUMENTAL_LINE_EXEMPT_ZH = new Set(['純音樂']);
const INSTRUMENTAL_LINE_EXEMPT_EN = new Set(['instrumental']);
// 器樂線專用 exclude —— 官方 playlist 都可能混咗呢類非敬拜器樂。
// ⚠️ 跟返上面同一條紀律:完整詞組(2+字),唔用單字。落地前對全庫 curated
// regression 過(PHASE4-PLAN §8 checklist),命中名單人眼掃。
export const INSTRUMENTAL_LINE_EXTRA_ZH = [
  '時代曲', '流行曲', '懷舊金曲', '金曲串燒', '輕音樂',
  '冥想音樂', '瑜伽', '助眠', '白噪音', '鋼琴譜', '純音樂教學',
];
export const INSTRUMENTAL_LINE_EXTRA_EN = [
  'meditation music', 'yoga', 'sleep music', 'white noise',
  'study music', 'relaxing music', 'lofi', 'lo-fi',
];

export function isNonWorship(title = '', artist = '', opts = {}) {
  const instrumentalLine = opts.line === 'instrumental';
  if (SECULAR_ARTISTS.includes((artist || '').toLowerCase().trim())) return true;
  if (/(dance tutorial|dance choreograph|choreography|relay dance|dance cover)/i.test(title)) return true;
  const zhList = instrumentalLine
    ? INSTRUMENTAL_TUTORIAL_PATTERNS_ZH.filter((p) => !INSTRUMENTAL_LINE_EXEMPT_ZH.has(p))
    : INSTRUMENTAL_TUTORIAL_PATTERNS_ZH;
  if (zhList.some((p) => title.includes(p))) return true;
  if (NON_SONG_FORMAT_PATTERNS_ZH.some((p) => title.includes(p))) return true;
  const t = title.toLowerCase();
  const enList = instrumentalLine
    ? INSTRUMENTAL_TUTORIAL_PATTERNS_EN.filter((p) => !INSTRUMENTAL_LINE_EXEMPT_EN.has(p))
    : INSTRUMENTAL_TUTORIAL_PATTERNS_EN;
  if (enList.some((p) => t.includes(p))) return true;
  if (NON_SONG_FORMAT_PATTERNS_EN.some((p) => t.includes(p))) return true;
  if (instrumentalLine) {
    if (INSTRUMENTAL_LINE_EXTRA_ZH.some((p) => title.includes(p))) return true;
    if (INSTRUMENTAL_LINE_EXTRA_EN.some((p) => t.includes(p))) return true;
  }
  return false;
}

// ── 歌詞攞取優先次序(2026-08-09 Eric 拍板)──────────────────────────
// Eric:先攞專輯官方靜態版嘅歌詞,現場/伴奏/翻唱/串燒合輯呢啲版本延後
// (**唔係剔除**,淨係排後啲,等官方版做晒先到佢)。
//
// ⚠️ Live/現場 獨立分開一層,唔同「翻唱/串燒/組曲/acoustic」呢批同層 ——
// 落地前用全庫 curated 6661 首查證過:標題含 live/現場嘅有 922 首,但
// 當中 823 首(89%)嚟自讚美之泉/讚美之泉粵語/約書亞樂團/同心圓敬拜等
// 頭部官方敬拜團體,格式係「XX現場敬拜MV (Live Worship MV)」——呢個係
// 嗰批團體**自己嘅標準官方發行格式**,並唔係業餘/翻唱嗰種 duplicate
// 版本(對照組:淨係 99 首同時帶「official/官方」字眼,證明大部分 live
// 標題本身唔會特登加呢個字,唔可以用嚟做過濾條件)。如果同真.翻唱/組曲/
// acoustic 呢批擺同一層,會將一大截頭部官方內容累到全部排到最後,
// 同「優先攞官方版」呢個目標背道而馳。所以分兩層:
//   Tier 1(VERSION_TIER_LIVE)—— 淨係撞 live/現場:方向啱(Eric 想先攞
//     studio 靜態版),但風險同「真.翻唱/合輯」唔同級,擺喺 clean 之後、
//     真.翻唱/組曲之前。
//   Tier 2(VERSION_TIER_ALT)—— 撞翻唱/cover/串燒/組曲/acoustic/伴奏
//     呢批(落地前逐個字眼查過全庫 curated,零已知誤殺——組曲 12 中 12
//     真.組曲,acoustic 111 中 111 真.Acoustic Live 版,cover/covered by
//     用 \b word boundary 避開 Alive/Covers Me 呢類撞正真歌名嘅陷阱)——
//     擺最後。
// Tier 0 = 冇撞任何呢啲字眼,當「官方/靜態版」,行先。
export const LIVE_VERSION_PATTERNS_ZH = ['現場'];
export const LIVE_VERSION_PATTERNS_EN = [/\blive\b/i];
export const ALT_VERSION_PATTERNS_ZH = ['翻唱', '串燒', '串烧', '組曲', '伴奏'];
export const ALT_VERSION_PATTERNS_EN = [/\bcover\b/i, /covered by/i, /\bmedley\b/i, /\bacoustic\b/i, /\binstrumental\b/i, /backing track/i];

export function versionPriorityTier(title = '') {
  const t = title || '';
  if (ALT_VERSION_PATTERNS_ZH.some((p) => t.includes(p)) || ALT_VERSION_PATTERNS_EN.some((re) => re.test(t))) return 2;
  if (LIVE_VERSION_PATTERNS_ZH.some((p) => t.includes(p)) || LIVE_VERSION_PATTERNS_EN.some((re) => re.test(t))) return 1;
  return 0;
}

// 排候選用嘅完整 sort key:先 versionPriorityTier(官方靜態版行先),同層
// 再睇 album 有冇資料(album backfill 已知就當多一分信心,行前啲)——album
// 全庫覆蓋率淨係 31%(2096/6661),唔夠齊全做主軸,淨係做同層嘅次要 tie-break。
// 呼叫方要自己 stable sort(Array#sort 喺 Node 保證 stable),先至可以連埋
// SQL 嗰句 ORDER BY RANDOM() 一齊用,喺同一個 key 值入面保留隨機次序
// (唔好用 id 順序嘅教訓見 pickCandidates 註解)。
export function candidateSortKey(row) {
  return versionPriorityTier(row.title) * 2 + (row.album ? 0 : 1);
}

// discover mode 專用:用官方頻道 handle(或者 playlist?list=XXX)列片,
// flat-playlist 唔落載、唔逐條resolve,好平。2026-07-27 由 growLibrary.js
// 搬過嚟(集中一份,俾 growLibrary.js 同 auditChannel.js 共用)。
//
// ⚠️ 2026-07-27 Fable 5 content-filter 架構升級方案(docs/SUPERVISION-LOG.md
// 10:40 條目)Q1 Layer 1:順手攞埋 `%(duration)s` —— flat-playlist 本身就帶
// 呢個欄位,唔加額外 request,俾 growLibrary 嘅片長 gate 同 auditChannel.js
// 嘅頻道審核用。
export async function listChannelVideos(channelHandle, limit) {
  const url = channelHandle.startsWith('playlist?list=')
    ? `https://www.youtube.com/${channelHandle}`
    : `https://www.youtube.com/${channelHandle}/videos`;
  const { stdout } = await exec(
    `"${YTDLP}" --flat-playlist --playlist-end ${limit} --print "%(id)s|%(duration)s|%(title)s" "${url}"`,
    { timeout: 30000 }
  );
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    // title 本身可以帶「|」,唔可以淨係 split('|') —— 要靠位置切,唔靠個數。
    const i1 = line.indexOf('|');
    const i2 = line.indexOf('|', i1 + 1);
    const id = line.slice(0, i1);
    const durationRaw = line.slice(i1 + 1, i2);
    const title = line.slice(i2 + 1);
    const d = Number(durationRaw);
    return { id, title, duration: Number.isFinite(d) && d > 0 ? d : null };
  });
}

// 歌嘅正常片長帶:75s(短過呢個多數係 shorts/片段)至 600s=10 分鐘(長過呢個
// 多數係崇拜/講道/合輯直播)。閾值本身唔係萬能——只係「語言無關」嘅最強
// 訊號,實測 known-good 中文團體(611 Worship/盛曉玫/有情天)嘅正常歌幾乎
// 全部跌喺呢個帶入面,而節目/講道/合輯普遍遠超 600s。
export const SONG_DURATION_MIN = 75;
export const SONG_DURATION_MAX = 600;
// 2026-07-30 Eric 拍板:@611worship 嘅 13-31 分鐘 live worship set(多首歌連做一條
// 片嗰種,例如「聖靈 我們歡迎祢降臨｜聖靈我們歡迎祢｜充滿在這裡｜611 Worship」)
// 要全收,唔跟標準片長上限。淨係俾**呢一個頻道**用 `maxOverride`(worshipGroups.js
// 個 `durationCapSec` 傳落嚟),全局預設完全冇郁。
// 2026-08-24 純音樂 Phase 4 (§3.4):加 `minOverride` 第三個 **optional** 參數。
// 器樂線傳 (sec, 600, 120) —— §8 Q2 拍板 10 分鐘硬上限、§P1 拍板 120 秒下限
// (比主庫嘅 75 秒**嚴**,即係器樂線唔會收到主庫收唔到嘅短片,方向安全)。
// 唔傳第三個參數嘅 6 個現有 caller 行為完全唔變。
export function isInSongDurationBand(seconds, maxOverride, minOverride) {
  const max = maxOverride ?? SONG_DURATION_MAX;
  const min = minOverride ?? SONG_DURATION_MIN;
  return seconds != null && seconds >= min && seconds <= max;
}

// duration 欄現存資料用 "m:ss"(例如 "4:32")顯示格式,前端直接讀嚟顯示
// (PlayerScreen.js 等),唔係原始秒數,呢度要跟返呢個格式先唔會累到現有 UI。
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Layer 2(選擇性,per-group 開關)—— 2026-07-27 Fable 5 方案:全局 title
// allowlist 對中文歌誤殺率太高(實測 known-good 團體 611 Worship 7%/
// 盛曉玫 17%/有情天 21% 命中,抽樣驗證全部係正常歌,純歌名標題冇呢啲字眼),
// 唔可以做主軸。但英文兒童頻道嘅歌片標題慣例穩定(♫/Lyric/Official/Cover
// 等),用嚟補片長 gate 攔唔晒嘅短集數(Kids on the Move 嗰類教學節目,
// 好多集數本身都啱啱好跌喺 75-600s 帶入面,淨靠片長唔夠)。
export function passesTitlePositiveSignal(title = '') {
  return /♫|lyrics?\b|\bsong\b|worship|dance|sing[\s-]?along|\bmv\b|official|\bcover\b/i.test(title);
}

// ── discover 候選負面快取(2026-07-30 Fable 5「假枯竭審計」方案)────────
// TZO4fPE6TS8(SOP兒童「小門徒」)因為 YouTube SABR/PO-token 故障持續 resolve
// 唔到,但 discover 嘅「fresh 候選」判斷淨係睇「未入 DB」,冇睇「試過幾多次」
// ——結果 log 見到同一條片被連環 retry 咗 848 次,夜夜燒晒時間落一條注定失敗
// 嘅片。呢個負面快取獨立於 `resolveAudio.js` 嗰個 15 分鐘 `failCache`(嗰個
// 係短暫、俾單一 process 用嚟避免重複打 YouTube;呢個係跨 run 持久化落碟、
// 以「累計失敗次數」判斷,少過 3 次可能係暫時性故障唔算數,夠 3 次先冷卻 7 日)。
const DISCOVER_FAIL_CACHE_PATH = path.join(__dirname, '..', 'cache', 'discover-fail-cache.json');
const DISCOVER_FAIL_THRESHOLD = 3;
const DISCOVER_FAIL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

function loadDiscoverFailCache() {
  try {
    return JSON.parse(fs.readFileSync(DISCOVER_FAIL_CACHE_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}
let discoverFailCache = loadDiscoverFailCache();

function saveDiscoverFailCache() {
  try {
    fs.mkdirSync(path.dirname(DISCOVER_FAIL_CACHE_PATH), { recursive: true });
    fs.writeFileSync(DISCOVER_FAIL_CACHE_PATH, JSON.stringify(discoverFailCache), 'utf8');
  } catch (e) {
    console.warn('discover-fail-cache 寫入失敗:', e?.message);
  }
}

export function isDiscoverCoolingDown(youtubeId) {
  const rec = discoverFailCache[youtubeId];
  return !!(rec && rec.coolUntil && rec.coolUntil > Date.now());
}

export function recordDiscoverFailure(youtubeId) {
  const rec = discoverFailCache[youtubeId] || { count: 0, coolUntil: 0 };
  rec.count += 1;
  if (rec.count >= DISCOVER_FAIL_THRESHOLD) rec.coolUntil = Date.now() + DISCOVER_FAIL_COOLDOWN_MS;
  discoverFailCache[youtubeId] = rec;
  saveDiscoverFailCache();
}

// 死鏈驗證成功就清返(反映咗現況,而唔係谷住個舊嘅失敗記錄)。
export function clearDiscoverFailure(youtubeId) {
  if (discoverFailCache[youtubeId]) {
    delete discoverFailCache[youtubeId];
    saveDiscoverFailCache();
  }
}

// ── per-頻道零收穫冷卻(2026-07-31 Fable 5 結構性修復方案)──────────────
// 事故:「已收錄最少優先」淨係睇 count,對「結構性零收穫」嘅頻道(fresh 候選
// 永遠得果幾條、永遠過唔到片長/分類關,例如 flow music 得一條 92 分鐘
// busking 片、基恩敬拜祈禱仔得一條「專輯介紹」)冇免疫力——呢批頻道會
// 夜夜贏中選但貢獻 0,冚住健康頻道(尤其係 backfill 完之後 count 谷高咗
// 嘅 CantonHymn/同心圓/新心)嘅 slot。連續 8 個 tick(約 2 個鐘)都
// tried=0 且 added=0,就冷卻 24 小時唔再入選;頻道出新片(reconcile 見到
// 官方數變/有新欠收)會自動解凍(見 `reconcileChannels.js`)。
const CHANNEL_COOLDOWN_PATH = path.join(__dirname, '..', 'cache', 'channel-cooldown.json');
const ZERO_YIELD_THRESHOLD = 8;
const ZERO_YIELD_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 小時

function loadChannelCooldown() {
  try {
    return JSON.parse(fs.readFileSync(CHANNEL_COOLDOWN_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}
let channelCooldown = loadChannelCooldown();

function saveChannelCooldown() {
  try {
    fs.mkdirSync(path.dirname(CHANNEL_COOLDOWN_PATH), { recursive: true });
    fs.writeFileSync(CHANNEL_COOLDOWN_PATH, JSON.stringify(channelCooldown), 'utf8');
  } catch (e) {
    console.warn('channel-cooldown 寫入失敗:', e?.message);
  }
}

export function isChannelCoolingDown(groupName) {
  const rec = channelCooldown[groupName];
  return !!(rec && rec.cooldownUntil && rec.cooldownUntil > Date.now());
}

// 每次一個頻道試完(唔理係 Tier 1 定 Tier 2),call 呢個記低今次嘅收成。
// 連續 8 次「一條都試唔到、一首都冇收」先算數,中間但凡有一次 tried>0
// 或者 added>0 都即刻重設(唔想一時三刻嘅波動就誤冷卻仲有嘢俾嘅頻道)。
export function recordChannelYield(groupName, added, tried) {
  const rec = channelCooldown[groupName] || { zeroStreak: 0, cooldownUntil: 0 };
  if (added === 0 && tried === 0) {
    rec.zeroStreak = (rec.zeroStreak || 0) + 1;
    if (rec.zeroStreak >= ZERO_YIELD_THRESHOLD) rec.cooldownUntil = Date.now() + ZERO_YIELD_COOLDOWN_MS;
  } else {
    rec.zeroStreak = 0;
    rec.cooldownUntil = 0;
  }
  channelCooldown[groupName] = rec;
  saveChannelCooldown();
}

// reconcile 見到官方數變(即係話真係有新片)就解凍,唔使等 24 小時。
export function clearChannelCooldown(groupName) {
  if (channelCooldown[groupName]) {
    delete channelCooldown[groupName];
    saveChannelCooldown();
  }
}

// The DB has 208 groups of duplicate youtube_ids (same video under different
// ids). Keep the lowest id of each group as canonical.
export function dedupeByYoutubeId(rows) {
  const seen = new Set();
  const out = [];
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    if (!r.youtube_id || seen.has(r.youtube_id)) continue;
    seen.add(r.youtube_id);
    out.push(r);
  }
  return out;
}

// Deliberately slow. The Mac's residential IP is the ONLY IP that still works
// for YouTube (Zeabur's is banned, verified 8/8 player_clients). Burning it
// with burst traffic would take the entire app down with no fallback, so every
// batch job here crawls on purpose.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DB 寫入鎖(2026-07-21 加)──────────────────────────────────────
// growLibrary.js 同 checkDeadLinks.js 都係「openDb() 讀成個 DB 落記憶體、
// 跑完先 saveDb() 一次過寫返落 disk」,兩個 script 完全冇協調。2026-07-21
// 查 log 發現個「已收錄」數試過喺日頭(冇任何排程行緊)無故跌咗 9,懷疑就係
// 呢個 lost-update:一個 script 讀咗個舊 snapshot,跑完先寫,蓋走咗第二個
// script 早幾分鐘先寫落去嘅嘢。以前 growLibrary 淨係夜晚 00:00-09:00 行、
// 特登跳過 checkDeadLinks 嘅 04:00,兩個好少埋堆先冇即刻爆出嚟。而家
// growLibrary 轉 24 小時、每 15-20 分鐘一次(2026-07-21 Eric 拍板),
// 冇咗「避開 4 點」呢層保護,撞埋嘅機會大好多,一定要有真正嘅互斥。
//
// 用一個簡單嘅 lockfile 做跨 process 互斥,兩個 script 都用同一條:
// 一開始(openDb 之前)攞鎖,成個 run(包括所有 saveDb())做完先放。
const LOCK_PATH = `${DB_PATH}.lock`;
const LOCK_STALE_MS = 20 * 60 * 1000; // 冇 job 應該行咁耐;仲存在就當持有者死咗
// 2026-07-25 追加(獨立驗收指出嘅死角):pid 生死檢查喺「部機死機/重開」
// 嘅情況會出事——殘留 lockfile 入面個 pid,開機之後可能啱啱好撞正另一個
// 無關 process(pid 係會重用嘅),於是永遠誤判「生存」、永遠搶唔到把鎖,
// 成條夜晚 job 鏈靜靜哋停晒,要人手刪 lockfile 先救返。所以要有一個唔理
// pid 生死嘅硬上限:鎖齡超過就一律當殭屍鎖照搶。揀 2 個鐘:而家最長嘅
// 合法持鎖係 checkDeadLinks 成個 run ~20-25 分鐘,2 個鐘有 4-5 倍鬆動位;
// 而真係出殭屍鎖嗰陣,最多阻 2 個鐘就自動復原,00:00-09:00 窗口內追得返。
const LOCK_HARD_STALE_MS = 2 * 60 * 60 * 1000;
const LOCK_RETRY_MS = 3000;
const LOCK_MAX_WAIT_MS = 5 * 60 * 1000; // 最多等 5 分鐘,再攞唔到就放棄,唔好卡死排程

// ⚠️ 2026-07-25 追加:淨睇檔案年齡嚟判斷「stale」唔夠——2026-07-25 04:20
// 實錄:checkDeadLinks 04:00 開波,150 首 x 3 秒一首,成個 run 行咗 ~20-25
// 分鐘(遠超「應該幾分鐘搞掂」嘅假設,亦即超過咗底下嘅 LOCK_STALE_MS)先
// saveDb 一次。fetchLyrics 04:20 攞鎖嗰陣,鎖齡已經 >20 分鐘,誤判持有者
// 死咗,搶咗把鎖去寫 25 首,跟住 checkDeadLinks 做完至 saveDb 佢自己嗰個
// 04:00 舊 snapshot,將呢 25 首全部冚走。教訓:「行咗好耐」唔等於「個
// process 死咗」——一定要真係去問 OS 個 pid 仲喺唔喺度。
// lockfile 第一行 token 格式:`owner:pid:timestamp:random`。
function parseLockPid(content) {
  const firstLine = (content || '').split('\n')[0] || '';
  const pid = Number(firstLine.split(':')[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

// process.kill(pid, 0) 淨係探生死,唔會真係送 signal 殺人。
//   ESRCH = 冇呢個 pid,真係死咗。
//   EPERM = 個 pid 屬於第二個 user 冇權限探,但佢實實在在生存緊,要當生存。
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'EPERM') return true;
    return false; // ESRCH 或者其他錯誤(理論上唔應該有第三種),當死咗
  }
}

// 「呢把鎖搶唔搶得?」嘅完整判斷,三層由硬到軟:
//   1. 鎖齡 > LOCK_HARD_STALE_MS(2粒鐘)→ 搶得,唔理 pid 生死(防重開機後
//      pid 撞正無關 process 嘅永久死鎖,見上面 LOCK_HARD_STALE_MS 註解)
//   2. parse 到 pid → 持有者死咗**而且**鎖齡 > LOCK_STALE_MS 先搶得
//      (雙重保險:pid 死咗都要夠舊,避免瞬間 pid 重用嘅邊緣 case)
//   3. parse 唔到 pid(格式唔啱/舊版 lockfile)→ 退返純年齡判斷做保底
// 抽出嚟做獨立 function 係為咗可以直接單元測試,唔使等 acquireDbLock
// 嘅 5 分鐘 retry loop。
export function lockIsStealable(content, age) {
  if (age > LOCK_HARD_STALE_MS) return true;
  const holderPid = parseLockPid(content);
  if (holderPid !== null) return !isPidAlive(holderPid) && age > LOCK_STALE_MS;
  return age > LOCK_STALE_MS;
}

// ⚠️ 2026-07-23 追加:`acquireDbLock()` 而家傳返一個**擁有權 token**
// (唔再係淨係 `true`),`releaseDbLock(token)` 一定要 token 對得上先真係
// 刪個 lockfile。原因:舊版 `releaseDbLock()` 冇條件、淨係 `unlinkSync`,
// 如果將來邊個 code path 手快快喺**未成功攞到鎖**就 call 咗佢(例如新加
// 一個提早 return 嘅檢查,漏咗擺喺 acquire 之前),就會將**第二個 process
// 合法持有緊嘅鎖**都刪走 —— 直接整翻返呢個鎖本身想解決嘅 race condition。
// 有 token 校對之後,call 錯都只會係安全 no-op(唔啱身唔會刪),唔會再有
// 呢種「累鄰居」嘅可能性。
// maxWaitMs:HTTP 用嘅 admin 寫入(routes/admin.js)唔可以死等 5 分鐘,傳
// 短啲嘅上限(例如 10_000)—— 攞唔到就回 null,由 caller 決定點回應(503)。
// 預設維持 LOCK_MAX_WAIT_MS,夜晚 script 嘅行為零改動。
export async function acquireDbLock(owner = `pid${process.pid}`, maxWaitMs = LOCK_MAX_WAIT_MS) {
  const token = `${owner}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      fs.writeFileSync(LOCK_PATH, `${token}\n${new Date().toISOString()}\n`, { flag: 'wx' });
      return token;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const content = fs.readFileSync(LOCK_PATH, 'utf8');
        const age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
        if (lockIsStealable(content, age)) { fs.unlinkSync(LOCK_PATH); continue; }
      } catch (_) { continue; } // 岩岩俾人放咗,即刻再試
      if (Date.now() > deadline) return null;
      await sleep(LOCK_RETRY_MS);
    }
  }
}

export function releaseDbLock(token) {
  if (!token) return; // 冇 token = 呢個 process 本身就未攞過鎖,乜都唔使做
  try {
    const content = fs.readFileSync(LOCK_PATH, 'utf8');
    if (!content.startsWith(`${token}\n`)) {
      // 唔係我張鎖(可能已經俾 stale-lock 邏輯搶咗,或者根本唔屬於我)——
      // 千其唔好郁,唔係就會刪走第二個 process 合法持有緊嘅鎖。
      return;
    }
    fs.unlinkSync(LOCK_PATH);
  } catch (_) {
    // 檔案已經唔喺度 = 當已經 release 咗,冇問題。
  }
}
