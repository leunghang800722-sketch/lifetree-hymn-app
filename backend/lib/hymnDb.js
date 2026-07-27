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
    // 2026-07-27 追加(discover 基恩敬拜祈禱仔 playlist 實測踩過):「花絮」/
    // 「專輯介紹」/「課程回顧」呢類非歌 title 格式 —— 幕後花絮片、專輯宣傳
    // 介紹片、課程/事工回顧片,冇歌名。特登揀窄嘅完整詞組(唔加淨係
    // 「介紹」/「回顧」咁廣),因為「介紹」呢類字眼好可能出現喺正常歌名嘅
    // 副標題入面(誤殺風險高),已用現有 1480 首 curated 歌 check 過,
    // 「專輯介紹」「課程回顧」零命中,「花絮」命中嘅 5 首本身已經係
    // 誤收嘅幕後花絮片(唔係真歌),確認呢個關鍵字精準。
    '花絮', '專輯介紹', '課程回顧',
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
export function isNonWorship(title = '', artist = '') {
  if (SECULAR_ARTISTS.includes((artist || '').toLowerCase().trim())) return true;
  return /(dance tutorial|dance choreograph|choreography|relay dance|dance cover)/i.test(title);
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
export async function acquireDbLock(owner = `pid${process.pid}`) {
  const token = `${owner}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
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
