#!/usr/bin/env node
// 歌詞入庫 —— LYRICS-PIPELINE-PLAN 落地。獨立夜晚隊列,同 growLibrary **完全分開**:
// 自己揀 curated 又冇歌詞(lyrics_status='none')嘅歌，新收錄嘅歌自動係 'none' 就
// 自然流入呢條隊，兩個 script 零耦合。
//
// ── 每首歌嘅流程(LYRICS-PIPELINE-PLAN §3c)──────────────────────
//   ① CC 字幕   yt-dlp --list-subs：有**人手**字幕軌 → 落載 vtt → 清 timestamp/重複 → draft(cc)
//   ② OCR       冇 CC → 落低清片抽 frame → macOS Vision 讀燒死喺畫面嘅字            [STAGE 2 已接]
//   ③ Whisper   OCR 讀唔到夠字(畫面冇字幕嘅 live 版)→ 用返同一條片嘅音軌轉錄        [STAGE 2 已接]
//   ④ 都唔得    標 unavailable(90 日後可重試),UI 照「暫無歌詞」
// STAGE 1(CC)已行緊,實測命中率接近 0(中文敬拜 MV 嘅字幕係燒死喺畫面,唔係字幕軌)。
// STAGE 2 加咗 OCR 做主力 + whisper 做少數畫面冇字嘅 live 版後備。CC 揾唔到嘅歌會
// 標 source='cc:miss' 泊住,OCR 揀嗰啲歌做(唔會夜夜重 CC)。
//
// ── 草稿 ≠ 入庫 ──────────────────────────────────────────────────
// CC/OCR/whisper 出嘅只係 `lyrics_draft` + status='draft',**唔會出街**。
// 要執行 session 對照官方來源(讚美之泉/小羊/CantonHymn)校對、寫入 `lyrics` +
// status='verified' 先至俾前端見到(見 reviewLyrics.js)。同擴庫「攞到 ID 唔算收錄」
// 同一精神。
//
// ── DB 寫入鎖(2026-07-24 P0 修) ──────────────────────────────────
// growLibrary 而家 24 小時每 15 分鐘行一次,用 hymnDb.js 嘅 acquireDbLock/releaseDbLock
// 做互斥。fetchLyrics 呢個 script 喺鎖機制出現**之前**寫嘅,一直係直接 openDb→寫→
// saveDb,冇同 growLibrary 協調。sql.js 成個 DB 檔讀落記憶體、成個檔寫返出去
// (last-writer-wins),結果已經實測證實過:fetchLyrics 三晚標咗 36 首 cc:miss,
// DB 最後得返 1 首,其餘全部俾 growLibrary 嘅 stale in-memory 副本覆蓋咗。
//
// 修法(關鍵設計原則,唔可以行返轉頭):**慢工序(yt-dlp 落載/OCR/whisper 轉錄)
// 唔可以揸住個鎖做** —— OCR 一首幾分鐘,揸住鎖會餓死 growLibrary 每 15 分鐘嘅 slot。
// 正確 pattern(見底下 `writeLyricsRow`):
//   1. 揀候選 / 落載 / 抽 frame / OCR / whisper —— 呢啲全部唔攞鎖,用返一開始
//      openDb() 嗰個唔理鎖嘅 snapshot 揀候選就得(讀唔使鎖)。
//   2. 淨係每首歌嘅慢工序做晒之後,先 acquireDbLock('fetchLyrics') → 重新
//      openDb()(攞返最新版,唔好用返開頭嗰個舊 snapshot)→ UPDATE 嗰一首 →
//      saveDb() → releaseDbLock(token)。即攞即放,揸鎖嗰段時間淨係一個
//      UPDATE + 一次 export,幾乎即時。
//   3. 攞唔到鎖(acquireDbLock 已經內建 retry,最多等 5 分鐘)就 skip 呢首,
//      留低等下晚再嚟,唔死等、唔阻住成個 script。
// 之前俾冚咗嘅 cc:miss 標記唔使人手補救:嗰啲歌 lyrics_source 已經變返空,
// 會自動重入 CC 隊,self-healing。
//
// ── 安全機制(全部沿用 growLibrary,唔好行返轉頭)────────────────
//   * 2026-08-01 起窗口係 19:00 起夜晚跨到朝早 09:00(見底下 inWindow() 註解);
//     排程拆做八輪(19/21/23/01/03/05/07/08:40),詳見 ops/launchd/
//     com.hymnapp.fetchlyrics.plist 嘅時序註解。concurrency=1、每首之間 jitter delay。
//   * budget 分兩級:CC 平,預設 12 首(排程實際用 --cc-budget 25);OCR 重
//     (落片+抽frame+OCR),預設 6 首(排程實際用 --ocr-budget 20)。
//   * 連續 3 次「exec 失敗」(唔係「冇字幕/冇夠字」——嗰啲係正常 miss)→ 用一首
//     已知有 CC 嘅歌做對照探測,分清「俾 YouTube 擋」定「呢批片本身有問題」。
//   * 落載嘅片/抽出嚟嘅 frame/wav 全部喺 os.tmpdir() 嘅 mkdtemp 目錄,一首處理
//     完即刪成個目錄(唔存副本,同音訊串流嗰條鐵律一致)。
//
// Usage:
//   node scripts/fetchLyrics.js                          # 排程正常路徑:CC 12 首 → OCR 6 首
//   node scripts/fetchLyrics.js --cc-budget 12 --ocr-budget 6 --delay 4000
//   node scripts/fetchLyrics.js --mode cc --budget 10     # 淨係 CC(手動測試)
//   node scripts/fetchLyrics.js --mode ocr --budget 2     # 淨係 OCR(手動測試)
//   node scripts/fetchLyrics.js --status                  # 報告,唔改嘢
//   node scripts/fetchLyrics.js --ignore-window --dry     # 測試,唔寫 DB

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock, candidateSortKey } from '../lib/hymnDb.js';
import { detectWhisperLang, runWhisperJson as runWhisperJsonShared, DEFAULT_WHISPER_MODEL_NAME } from '../lib/whisperTranscribe.js';
import { YTDLP } from '../lib/ytdlpBin.js';
// 2026-08-16 LYRICS-CJK-OCR-ROOTCAUSE-PLAN:合併演算法抽咗去 lib(P2 fuzzy watermark
// + P3 行級投票喺嗰邊),中文判定共用 lyricsLangCheck.js。
import { mergeOcrLines } from '../lib/ocrMerge.js';
import { CJK_LANGS, cjkCount } from '../lib/lyricsLangCheck.js';
import { paddleEntriesToFrameLines } from '../lib/paddleAdapter.js';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const CC_BUDGET = Number(arg('--cc-budget', arg('--budget', 12)));
const OCR_BUDGET = Number(arg('--ocr-budget', 6));
const DELAY_MS = Number(arg('--delay', 4000));
const STATUS_ONLY = process.argv.includes('--status');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const DRY = process.argv.includes('--dry');

// 2026-08-01 Eric 拍板 8 輪 × 20 首(見 ops/launchd/com.hymnapp.fetchlyrics.plist
// 註解):窗口由「00:00-09:00 一段」改做「19:00 起夜晚跨到朝早 09:00」——
// h>=19(19:00-23:59)或者 h<9(00:00-08:59)先准行,08:40 呢輪 h=8 ✓ 準行。
// 時段本身唔係封鎖因素:growLibrary 已經 24 小時行咗十日都零事(封鎖靠總量
// 唔靠時鐘),呢個窗口淨係想避開一日入面人流/流量最密嗰段,同 growLibrary
// 專用嘅辦公封鎖窗(平日 10:30-18:30)完全兩回事、亦已經全部避開咗。
const NIGHT_START = 19, WINDOW_END = 9;
// 對照探測片:LYRICS-PIPELINE-PLAN §0 記錄小羊詩歌精選有 zh-CN 人手字幕軌。
const PROBE_VIDEO = 'gF-eDlXq3II';
// 想收嘅字幕語言(人手軌;auto-generated 唔算)
const WANT_LANGS = ['zh-Hant', 'zh-HK', 'yue', 'zh', 'zh-Hans', 'zh-CN', 'en'];
// OCR 抽 frame 間隔(秒)——LYRICS-PIPELINE-PLAN §3c:每 2 秒一張。
const FRAME_INTERVAL_SEC = 2;
// OCR/whisper 草稿去晒水印之後少過呢個字數,當「呢個來源攞唔到嘢」。
const MIN_DRAFT_CHARS = 40;
// 2026-08-09 OCR frame loop 並發上限——單條片入面嘅 frame 逐張叫本機 Vision
// binary,零 YouTube request,唔關防封鎖事,純粹想用返閒置 CPU(實測 82% idle)。
// 5 張一批,唔好無限制全部一齊掟(避免瞬間開太多 ocrframe subprocess 拖累
// backend 服務)。
const OCR_FRAME_CONCURRENCY = 5;

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
// 2026-08-02 Eric 追加:**星期日全日都准行**(佢星期日唔使用電腦,冇資源
// 衝突顧慮),星期一至六維持夜間窗口(19:00 跨夜到 09:00)。plist 對應加咗
// Weekday=0 嘅日間班次(10:40/12:40/14:40/16:40),呢度個窗口檢查要一致放行,
// 唔係 plist 準時開波都會俾自己擋(08:40 尾輪嗰課學過)。
const inWindow = () => {
  const now = new Date();
  if (now.getDay() === 0) return true; // 星期日全日
  const h = now.getHours();
  return h >= NIGHT_START || h < WINDOW_END;
};
const charCount = (s) => (s || '').replace(/\s/g, '').length;

// ── 落載失敗 ledger(LYRICS-47H-SPRINT-PLAN §P0.1)──────────────────────
// 之前落載失敗係純 `continue` 唔寫任何嘢,同一首片可以夜夜重抽重敗、零記憶
// (403 率實測 ~49%,即係接近一半 budget 花咗喺重複攻打同一批死片)。呢個
// ledger 用純 fs JSON 記賬(唔使 DB 鎖 —— 全程只准一個 producer process 跑,
// 由 ops/lyrics/producer-keeper.sh 嘅 pgrep 把關),做三件事:
//   1. fails >= 3 → 寫 DB `lyrics_source='dl:dead'`,永久踢出 OCR 候選
//      (pickOcrCandidates 要求 source='cc:miss')。status 保留 'none' 可翻案:
//      人手 UPDATE 返做 'cc:miss' 就會重新入隊。
//   2. fails >= 1 而 12 鐘頭內試過 → cooldown 跳過(403 大約半數係間歇性,
//      俾佢隔半日再試一次,夠三次先判死)。
//   3. CC 層(--list-subs)失敗都記賬,但 **唔判 dl:dead**,淨係食 cooldown ——
//      CC 係輕操作,失敗多數係網絡雜訊,唔應該憑呢個判一首歌死。
// ── 403 全域封鎖偵測(2026-08-19 事故之後加)────────────────────────────
// 事故:8/18–8/19 yt-dlp 落載全線 HTTP 403,但 `--list-subs` 完全正常。舊嘅斷路
// 探測用 list-subs 做對照,所以**由頭到尾冇響過**,producer 空轉一晚,仲要將
// 685 首完全冇問題嘅片判咗 `dl:dead`。實測(已知好片 gF-eDlXq3II):-f 18 / DASH /
// bestaudio / client=ios 全部 403,出口 IP 係 Datacamp(NordVPN 機房)——
// 即係 **googlevideo 媒體落載俾機房 IP 封,但 youtube.com metadata 唔封**,
// 所以任何用 metadata 做嘅探測都**探唔到**呢種封鎖。
//
// 修法:①直接數「連續 403」,唔靠探測;②確認全域封鎖之後**唔准再記 ledger、
// 唔准判 dl:dead**(逐首歸因喺全域封鎖下係錯);③寫 flag 檔俾 keeper 唞耐啲。
const BLOCK_FLAG = '/tmp/lyrics-403-block';
const CONSEC_403_TO_BLOCK = 5;
const is403 = (e) => /HTTP Error 403|403: Forbidden/.test(String(e?.message || e || ''));

const DL_LEDGER_PATH = path.join(__dirname, '..', 'data', 'lyrics-dl-failures.json');
const DL_DEAD_AFTER = 3;
const DL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function readDlLedger() {
  try {
    return JSON.parse(fs.readFileSync(DL_LEDGER_PATH, 'utf8')) || {};
  } catch (_) {
    return {}; // 未有檔 / 壞 JSON:當空 ledger 由頭記,唔好因為呢樣死成個 run
  }
}

function recordDlFail(id) {
  const ledger = readDlLedger();
  const key = String(id);
  const prev = ledger[key] || { fails: 0 };
  ledger[key] = { fails: (prev.fails || 0) + 1, lastAt: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(DL_LEDGER_PATH), { recursive: true });
    fs.writeFileSync(DL_LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
  } catch (e) {
    log(`    \u26a0 \u5beb\u5514\u5230\u843d\u8f09\u5931\u6557 ledger(\u5514\u963b run):${e?.message || e}`);
  }
  return ledger[key].fails;
}

// 候選過濾:ledger 判咗死嘅(補漏 —— 防 DB 嗰次寫入攞唔到鎖)同埋仲喺 cooldown
// 入面嘅,喺 loop 開始之前就剔走,唔好食 budget。
function filterByDlLedger(cands, label) {
  const ledger = readDlLedger();
  const now = Date.now();
  let dead = 0, cooling = 0;
  const kept = cands.filter((c) => {
    const e = ledger[String(c.id)];
    if (!e) return true;
    if ((e.fails || 0) >= DL_DEAD_AFTER) { dead++; return false; }
    if ((e.fails || 0) >= 1 && e.lastAt && (now - Date.parse(e.lastAt)) < DL_COOLDOWN_MS) { cooling++; return false; }
    return true;
  });
  if (dead || cooling) log(`  ${label}:ledger 剔走 ${dead} 首(失敗 ≥${DL_DEAD_AFTER} 次判死)、${cooling} 首(12 鐘頭 cooldown 內)`);
  return kept;
}

// --skip-orgs "A,B,C":將已知死症 vein(逐首讀過、底本救唔返嗰幾間機構)押後到
// 池尾 —— artist 或者 org 欄命中就今轉唔落隊。唔係永不做:池乾嗰陣唔加呢個
// flag 就會照做(見 LYRICS-47H-SPRINT-PLAN §8)。
const SKIP_ORGS = (arg('--skip-orgs', '') || '').split(',').map((x) => x.trim()).filter(Boolean);

function filterBySkipOrgs(cands, label) {
  if (!SKIP_ORGS.length) return cands;
  const hit = (v) => !!v && SKIP_ORGS.some((o) => String(v).includes(o));
  const kept = cands.filter((c) => !hit(c.artist) && !hit(c.org));
  const dropped = cands.length - kept.length;
  if (dropped) log(`  ${label}:--skip-orgs 押後 ${dropped} 首(${SKIP_ORGS.join('/')})`);
  return kept;
}

// ── cantonhymn 預篩排隊(Eric 2026-08-15 拍板)────────────────────────
// ops/lyrics/cantonhymn-prescreen.mjs 掃過全部「粵語 + 仲未有歌詞」嘅歌,記低邊啲
// 喺 cantonhymn.net 有現成核對底本。呢度將嗰批**排到隊頭**先做 OCR。
//
// 點解:複核線嘅樽頸係 Claude 額度(硬頂 1,500 個決定),唔係池夠唔夠大。有現成
// 底本嘅歌,複核起上嚟快、信心高、唔使燒 WebSearch 配額,即係「每個決定買到嘅
// verified」高好多。之前 OCR 池係國語 409 / 粵語 125 而 producer 隨機抽,等於
// 大部分決定花咗喺冇免費核對來源嗰批。
//
// ⚠️ 呢個純粹係**做事次序**,唔涉及歌詞內容:cantonhymn 嘅文字照舊只准核對、
//    唔准照抄入 DB(HANDOFF §2.0)。預篩命中 ≠ 嗰首歌有歌詞,佢一樣要行 OCR。
const PRESCREEN_PATH = path.join(__dirname, '..', 'data', 'cantonhymn-prescreen.json');

function loadPrescreenIds() {
  try {
    const j = JSON.parse(fs.readFileSync(PRESCREEN_PATH, 'utf8'));
    return new Set(Object.keys(j.hits || {}).map(Number));
  } catch (_) {
    return new Set(); // 未跑過預篩:當冇呢件事,次序維持原狀
  }
}

// stable partition:命中嘅照原本次序排前,其餘照原本次序跟尾 —— 唔會搞亂
// candidateSortKey 喺各自組別入面嘅優先次序(官方靜態版行先嗰套)。
function prioritizeByPrescreen(cands, label) {
  const ids = loadPrescreenIds();
  if (!ids.size) return cands;
  const front = [], back = [];
  for (const c of cands) (ids.has(c.id) ? front : back).push(c);
  if (front.length) log(`  ${label}:cantonhymn 預篩命中 ${front.length} 首,排到隊頭先做`);
  return front.concat(back);
}

// ── 重做隊列優先(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P4,2026-08-16)────────
// backend/data/lyrics-requeue-priority.json 記住 Eric 拍板要**優先重做**嘅歌
// (71 首 live 純英文遺害排最先,之後係爛 draft 重做批)。呢啲 id 排到隊頭
// 最前(先於 cantonhymn 預篩)。名單唔使清:一首重做完 source 由 'cc:miss'
// 變返 'ocr',pickOcrCandidates 自然唔會再揀佢,留喺名單零影響。
const REQUEUE_PRIORITY_PATH = path.join(__dirname, '..', 'data', 'lyrics-requeue-priority.json');

function prioritizeByRequeue(cands, label) {
  let ids;
  try {
    ids = new Set(JSON.parse(fs.readFileSync(REQUEUE_PRIORITY_PATH, 'utf8')).ids || []);
  } catch (_) {
    return cands; // 冇名單 = 冇呢回事
  }
  if (!ids.size) return cands;
  const front = [], back = [];
  for (const c of cands) (ids.has(c.id) ? front : back).push(c);
  if (!front.length) return cands;
  // front 跟返名單檔嘅次序(名單係按緊急度排:live 遺害行最先)
  const order = [...ids];
  front.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  log(`  ${label}:重做優先名單命中 ${front.length} 首,排到隊頭最前`);
  return front.concat(back);
}

function report(db) {
  // 純音樂(instrumental=1)喺呢度**單獨數一行**,唔混入 lyrics_status 分佈 ——
  // 佢哋根本唔入歌詞線,撈埋一齊數會令個 report 睇落好似有一堆做唔掂嘅歌。
  const rows = query(db, `SELECT lyrics_status, COUNT(*) n FROM hymns_all
                            WHERE curated=1 AND status!='dead'
                              AND (instrumental IS NULL OR instrumental = 0)
                            GROUP BY lyrics_status`);
  log('歌詞進度(curated,按 status):');
  for (const r of rows) log(`   ${r.lyrics_status || 'none'}  →  ${r.n} 首`);
  const instr = query(db, `SELECT COUNT(*) n FROM hymns_all WHERE curated=1 AND status!='dead' AND instrumental = 1`)[0];
  log(`   (純音樂 instrumental=1:${instr?.n ?? 0} 首,唔入歌詞線)`);
  const bySource = query(db, `SELECT lyrics_source, COUNT(*) n FROM hymns_all
                              WHERE curated=1 AND status!='dead' AND lyrics_source IS NOT NULL AND lyrics_source != ''
                              GROUP BY lyrics_source`);
  if (bySource.length) log('   (source 細分:' + bySource.map((r) => `${r.lyrics_source}=${r.n}`).join(', ') + ')');
}

// ── DB 寫入(帶鎖,即攞即放)──────────────────────────────────────
// 見檔案頭註解:呢個 function 一定要喺慢工序(落載/OCR/whisper)做晒之後先叫,
// 唔可以擺喺慢工序入面或者之前。`fields` 係 { 欄名: 值 } 嘅 plain object。
async function writeLyricsRow(id, fields) {
  const token = await acquireDbLock('fetchLyrics');
  if (!token) {
    log('    ⚠ 攞唔到 DB 鎖(俾 growLibrary 用緊,已經等到 acquireDbLock 嘅上限),呢首今晚寫唔到,skip(下晚再嚟)');
    return false;
  }
  try {
    // 一定要重新 openDb() 攞返呢一刻最新嘅版本 —— 唔可以用返 run 開頭嗰個舊
    // snapshot,否則寫返出去嗰陣會蓋走 growLibrary 呢排(慢工序行緊嗰幾分鐘)
    // 寫落去嘅嘢,即係 P0 bug 原本個問題。
    const freshDb = await openDb();
    const cols = Object.keys(fields);
    freshDb.run(
      `UPDATE hymns_all SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`,
      [...cols.map((c) => fields[c]), id]
    );
    saveDb(freshDb);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

// 揀下一首:curated、生、status='none'、未 CC 試過(source 空)。SQL 層 ORDER BY
// RANDOM() 打亂,再用 candidateSortKey stable-sort(官方靜態版行先,現場/翻唱
// 等延後——見 hymnDb.js「歌詞攞取優先次序」註解)——Array#sort 喺 Node 保證
// stable,所以同一個 key 值入面保留返 SQL 嗰層嘅隨機次序,唔會退返做 id 順序
// (growLibrary 教訓:唔好用 id 順序,舊 id 死亡率高)。
// ⚠️ 純音樂 exclusion(INSTRUMENTAL-PHASE1-EXEC-20260821.md §4):
// `instrumental=1` 嘅歌唔入歌詞線。理論上 `lyrics_status='unavailable'` 已經
// 係終態(下面條 query 硬性要 'none'),呢一刀係**雙保險 + 語意清晰**,唔係
// 修 bug —— 免得下手見到「instrumental 冇 exclusion」以為係漏咗。
function pickCandidates(db) {
  const rows = query(db, `SELECT id, youtube_id, title, artist, album, org FROM hymns_all
                    WHERE curated=1 AND status!='dead'
                      AND (instrumental IS NULL OR instrumental = 0)
                      AND (lyrics_status IS NULL OR lyrics_status='none')
                      AND (lyrics_source IS NULL OR lyrics_source='')
                    ORDER BY RANDOM()`);
  return rows.sort((a, b) => candidateSortKey(a) - candidateSortKey(b));
}

// OCR 候選:CC 試過冇(source='cc:miss')嘅歌。攞埋 lang 俾 whisper 語言判斷做
// fallback(OCR 讀唔到字嗰陣冇文字可以判斷 CJK 比例,就靠呢個欄位)。同樣用
// candidateSortKey 排先後(見上面 pickCandidates 註解)。
function pickOcrCandidates(db) {
  const rows = query(db, `SELECT id, youtube_id, title, artist, lang, album, org FROM hymns_all
                    WHERE curated=1 AND status!='dead'
                      AND (instrumental IS NULL OR instrumental = 0)   -- 純音樂 exclusion,見 pickCandidates 註解
                      AND lyrics_status='none' AND lyrics_source='cc:miss'
                    ORDER BY RANDOM()`);
  return rows.sort((a, b) => candidateSortKey(a) - candidateSortKey(b));
}

// 判斷呢首歌叫 whisper 應該用邊個語言:優先用 OCR 啱啱讀到嘅文字(最準,見
// detectWhisperLang),OCR 乜都讀唔到就 fallback 用 DB 嘅 lang 欄位('英文' →
// en,其他(國語/粵語/兒童)→ zh)。
function whisperLangFor(ocrText, langCol) {
  if (ocrText && ocrText.trim()) return detectWhisperLang(ocrText);
  return langCol === '英文' ? 'en' : 'zh';
}

// yt-dlp --list-subs：返「有邊啲**人手**字幕軌」。auto-generated 唔算。
// 回傳 { langs: [...], error: bool }。error=true = yt-dlp exec 出錯(可能俾擋)。
async function listManualSubs(youtubeId) {
  try {
    const { stdout } = await exec(
      `"${YTDLP}" --list-subs --skip-download "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 30000 }
    );
    // "Available subtitles" section = 人手;"Available automatic captions" = auto,唔要。
    const manualBlock = stdout.split(/Available automatic captions/i)[0];
    const langs = WANT_LANGS.filter((l) => new RegExp(`^\\s*${l}\\b`, 'im').test(manualBlock));
    return { langs, error: false };
  } catch (e) {
    // 分辨:yt-dlp 行到但冇字幕 vs 真係 exec 錯。有 stdout 就當行到。
    if (e?.stdout) return { langs: [], error: false };
    return { langs: [], error: true };
  }
}

// 落載字幕 vtt → 清做純文字。處理完即刪 temp 檔(同「唔存副本」鐵律一致)。
async function downloadSubs(youtubeId, langs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnlyr-'));
  try {
    await exec(
      `"${YTDLP}" --write-subs --sub-langs "${langs.join(',')}" --sub-format vtt ` +
      `--skip-download -o "${path.join(dir, '%(id)s')}" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 40000 }
    );
    const vtt = fs.readdirSync(dir).find((f) => f.endsWith('.vtt'));
    if (!vtt) return null;
    const raw = fs.readFileSync(path.join(dir, vtt), 'utf8');
    return cleanVtt(raw);
  } catch (_) {
    return null;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// vtt → 純歌詞:剝走 header / timestamp / 序號 / <tag> / 連續重複行。
function cleanVtt(raw) {
  const out = [];
  let last = null;
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/<[^>]+>/g, '').trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/-->/.test(line)) continue;            // timestamp
    if (/^\d+$/.test(line)) continue;          // 序號
    if (/^(Kind|Language):/i.test(line)) continue;
    if (line === last) continue;               // 連續重複
    last = line;
    out.push(line);
  }
  return out.join('\n').trim();
}

async function runCC(db, budget) {
  log(`mode=CC budget=${budget} delay=~${DELAY_MS}ms`);
  // 同 runOcr 一致化:一律用最新 snapshot 揀候選,唔好靠 main() 傳落嚟嗰個
  // (呢度風險本身細好多——run 一開波就叫,同 main() openDb() 相隔幾乎零——
  // 但養成「揀候選就攞新鮮」嘅習慣,唔會因為第日改咗執行次序而中招)。
  const freshDb = await openDb();
  const cands = prioritizeByPrescreen(filterByDlLedger(filterBySkipOrgs(pickCandidates(freshDb), 'CC'), 'CC'), 'CC');
  if (!cands.length) { log('冇更多要做嘅歌(全部 curated 都試過 CC / 有歌詞 / 俾 ledger 同 --skip-orgs 剔走)'); return 0; }

  let drafted = 0, missed = 0, streak = 0;
  for (let i = 0; i < budget && i < cands.length; i++) {
    const c = cands[i];
    log(`  CC 檢查 [${c.artist}] ${c.title}`);
    const { langs, error } = await listManualSubs(c.youtube_id);

    if (error) {
      streak++;
      // CC 層失敗只記賬食 cooldown,唔判 dl:dead(見 ledger 註解第 3 點)
      const fails = recordDlFail(c.id);
      log(`    ⚠ yt-dlp exec 失敗 (連續 ${streak},呢首累計 ${fails} 次)`);
      if (streak >= 3) {
        log('  連續 3 次 exec 失敗 —— 用已知有 CC 嘅片做對照探測…');
        await sleep(jitter(DELAY_MS));
        const probe = await listManualSubs(PROBE_VIDEO);
        if (probe.error) { log('  對照都 exec 失敗 → 疑似俾 YouTube 擋,今晚收工'); break; }
        log('  對照行到 → 唔關 block 事,繼續'); streak = 0;
      }
      if (i < budget - 1) await sleep(jitter(DELAY_MS));
      continue;
    }
    streak = 0;

    if (langs.length) {
      const text = await downloadSubs(c.youtube_id, langs);
      if (text && text.length > 10) {
        if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: text, lyrics_status: 'draft', lyrics_source: 'cc', lyrics_checked_at: today() });
        drafted++;
        log(`    ✓ CC 有字幕(${langs.join(',')}),存草稿 ${text.length} 字(累計 +${drafted})`);
      } else {
        // 話有軌但落唔到 → 當 miss,泊去等 OCR
        if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'cc:miss', lyrics_checked_at: today() });
        missed++;
        log('    · 有軌但攞唔到內容,標 cc:miss(等 OCR)');
      }
    } else {
      // 冇人手字幕(大多數中文敬拜 MV 都係咁)→ 標 cc:miss,等 STAGE 2 OCR
      if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'cc:miss', lyrics_checked_at: today() });
      missed++;
      log('    · 冇人手 CC,標 cc:miss(等 OCR)');
    }
    if (i < budget - 1) await sleep(jitter(DELAY_MS));
  }
  log(`今次:CC 草稿 ${drafted} 首,冇 CC(泊去等 OCR)${missed} 首`);
  return drafted;
}

// ── OCR(STAGE 2 主力)──────────────────────────────────────────────
// 落低清視訊 → ffmpeg 抽 frame → macOS Vision(ocrframe binary)讀畫面字 →
// 合併去重 → draft(ocr)。OCR 唔夠字先撞 whisper(用返同一條片嘅音軌,零額外 request)。

const OCRFRAME_BIN = path.join(__dirname, '..', 'tools', 'ocrframe');
// 2026-07-27 STAGE 3 對齊修:small 唔可靠(見 lib/whisperTranscribe.js 頭註解),
// 一律用 medium,同 alignBackfill.js 對齊一致。
const WHISPER_BIN = 'whisper-cli';
const WHISPER_MODEL = path.join(__dirname, '..', 'models', `ggml-${DEFAULT_WHISPER_MODEL_NAME}.bin`);

// 落低清片(video+audio 埋一齊,俾 whisper 之後攞音軌用,唔使再落多次)。
//
// ⚠️ 2026-08-19 大改(403 事故):YouTube 8/18 起**唔再派 format 18**(漸進式 mp4),
// 而舊 yt-dlp stable 2026.07.04 對住新版 player 全線攞 403 —— 實測 6 條琴晚 403 嘅片,
// stable 100% 403,nightly 2026.08.18 + DASH format **6/6 全部落到**。所以兩樣一齊改:
//   ① 用 nightly binary(唔用系統 brew 嗰個)
//   ② format 由 `18/...` 改做 DASH 為主(`bv*+ba` 合併,ffmpeg 會 merge 返一條有音軌嘅片,
//      whisper 照用得)
// 2026-08-16 嗰個「用 18 避 DASH 403」嘅結論**已經反轉**,唔好照抄舊註解。
//
// ⚠️ 2026-08-22 更新(YTDLP-UNIFY-PLAN-20260822.md):個 binary 路徑而家由
// `lib/ytdlpBin.js` 統一提供,唔再喺呢度自己砌一條 `tools/yt-dlp-nightly`。點解:
// 呢個檔案自己都曾經係分裂嘅 —— 落載片用 nightly const,但上面 `--list-subs` /
// `--write-subs` 用 bare `yt-dlp`(即 brew 版),即係同一個 script 對住兩個版本。
// 而嗰個所謂 nightly 其實係 8/19 凍結咗嘅 snapshot,冇機制更新,brew 一升就變咗
// 全機最舊嗰個。三個字:唔好再有第二條 path。
const DL_FORMAT = 'bv*[height<=360]+ba/bv*[height<=480]+ba/18/b[height<=480]/b';

async function downloadVideoLowRes(youtubeId, dir) {
  const outTemplate = path.join(dir, 'video.%(ext)s');
  await exec(
    `"${YTDLP}" -f "${DL_FORMAT}" --no-playlist -o "${outTemplate}" ` +
    `"https://www.youtube.com/watch?v=${youtubeId}"`,
    { timeout: 300000 }
  );
  const file = fs.readdirSync(dir).find((f) => f.startsWith('video.') && !f.endsWith('.part'));
  if (!file) throw new Error('落載完但搵唔到片檔');
  return path.join(dir, file);
}

async function extractFrames(videoPath, dir) {
  const pattern = path.join(dir, 'frame_%04d.png');
  await exec(`ffmpeg -i "${videoPath}" -vf "fps=1/${FRAME_INTERVAL_SEC}" -y "${pattern}"`, { timeout: 240000 });
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));
}

// 叫已經 compile 好嘅 Swift Vision binary 讀一張 frame,返嗰張 frame 由上到下嘅文字行。
async function ocrFrame(framePath) {
  try {
    const { stdout } = await exec(`"${OCRFRAME_BIN}" "${framePath}"`, { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (_) {
    return []; // 呢張 frame 冇字或者 Vision 出錯,當冇字跳過(唔阻住成首歌)
  }
}

// concurrency-limited 版 map,keep 原本 items 次序(用 index 寫入 results,唔理
// 邊個 worker 先做完)。mergeOcrLines() 嘅段落分組演算法靠「frame 陣列次序 = 片
// 入面畫面出現次序」呢個假設,呢度一定要保住呢個次序,唔可以用 Promise.all
// 逐個掟晒出去嗰種(結果次序靠完成快慢,唔靠原本次序)。
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── PaddleOCR 引擎(§P1,中文歌主力)────────────────────────────────
// mergeOcrLines/cleanOcrLine 本體搬咗去 lib/ocrMerge.js(P2 fuzzy watermark +
// P3 行級投票喺嗰邊,有離線 harness 回歸)。呢度剩返引擎層:邊個 engine 讀
// frame、Paddle 專屬嘅行級 filter。
//
// 實測(2026-08-16,LYRICS-CJK-OCR-ROOTCAUSE-PLAN §1):macOS Vision 對圓體/
// 藝術中文字體到頂(720p+預處理照錯「憐憫→機憫」),PaddleOCR chinese_cht
// 360p 都全對,仲有信心分+bbox。所以 lang∈{國語,粵語,兒童} 行 Paddle,英文
// 照舊 Vision(英文字幕 Vision 夠準,唔使開 python)。

const PADDLE_PY = path.join(__dirname, '..', 'tools', 'paddle-venv', 'bin', 'python');
const PADDLEFRAME = path.join(__dirname, '..', 'tools', 'paddleframe.py');
const paddleReady = () => fs.existsSync(PADDLE_PY) && fs.existsSync(PADDLEFRAME);

// 一次過 OCR 成首歌嘅 frame(model 載入 ~5 秒,逐張叫就嘥晒),再行 lib/paddleAdapter.js
// 嘅行級 filter(score/拼音/殘影/位置級 watermark)。回傳 string[][](同 Vision
// 路徑一樣 shape,餵 mergeOcrLines);出錯回傳 null(調用方 fallback 去 Vision)。
// 2026-08-24 加:每個 paddle process 嘅 BLAS/OMP 線程上限 = 效能核 ÷ 並行 OCR 線。
// 08-17→08-22 部機出咗 26 個 Python SIGSEGV,全部係兩個 paddle process 各自向全部
// 核開 Accelerate thread,喺 cblas_sgemm 爆(詳情見 tools/paddleframe.py 頂)。
// sysctl 一個 run 只查一次。
let _paddleThreadCap = null;
async function paddleThreadCap() {
  if (_paddleThreadCap !== null) return _paddleThreadCap;
  let perf = 4;
  try {
    const { stdout } = await exec('sysctl -n hw.perflevel0.logicalcpu');
    perf = Number(String(stdout).trim()) || 4;
  } catch (_) {
    /* 唔係 Apple Silicon / sysctl 冇呢個 key → 用 4 兜底 */
  }
  _paddleThreadCap = Math.max(1, Math.floor(perf / Math.max(1, OCR_SONG_CONCURRENCY)));
  return _paddleThreadCap;
}

// 俾 signal 殺死先值得重試 —— Accelerate 嗰種爆法係間歇性,同 frame 內容無關,
// 原地再行一次多數就過到。timeout(exec 自己送 SIGTERM)、JSON 壞、venv 冧
// 呢啲重試幾多次都係一樣結果,唔好嘥多 10 分鐘,即刻 fallback Vision。
const PADDLE_RETRY_SIGNALS = new Set(['SIGSEGV', 'SIGBUS', 'SIGABRT', 'SIGILL']);

async function ocrFramesPaddle(framePaths) {
  const cmd = `"${PADDLE_PY}" "${PADDLEFRAME}" ${framePaths.map((f) => `"${f}"`).join(' ')}`;
  const opts = {
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PADDLE_CPU_THREADS: String(await paddleThreadCap()) },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await exec(cmd, opts);
      return paddleEntriesToFrameLines(JSON.parse(stdout));
    } catch (e) {
      const retryable = PADDLE_RETRY_SIGNALS.has(e?.signal) && attempt === 0;
      const why = String(e?.message || e).slice(0, 200);
      if (retryable) {
        log(`    ⚠ PaddleOCR 爆咗(${e.signal}),重試一次:${why}`);
        continue;
      }
      log(`    ⚠ PaddleOCR 行唔到(fallback 返 Vision):${why}`);
      return null;
    }
  }
  return null;
}

async function extractAudioWav(videoPath, dir) {
  const wavPath = path.join(dir, 'audio.wav');
  await exec(`ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -y "${wavPath}"`, { timeout: 120000 });
  return wavPath;
}

// whisper-cli 未裝 / model 未落 → 唔死磕,cache 住結果(一個 run 淨係查一次)。
let _whisperReadyCache = null;
async function checkWhisperAvailable() {
  if (_whisperReadyCache !== null) return _whisperReadyCache;
  try {
    await exec(`command -v ${WHISPER_BIN}`);
    _whisperReadyCache = fs.existsSync(WHISPER_MODEL);
  } catch (_) {
    _whisperReadyCache = false;
  }
  return _whisperReadyCache;
}

// 用返任務1已經落載嗰條片嘅音軌轉錄 —— 零額外 YouTube request。medium model,
// 語言由 OCR 已經讀到嘅文字判斷(見 lib/whisperTranscribe.js detectWhisperLang),
// 唔再用 -l auto —— auto 語言偵測俾前奏/純音樂段搞到亂偵測(2026-07-27 監督
// 診斷 id=402:成首歌轉錄變晒僧伽羅文/希臘文亂碼),仲會加中文 initial prompt
// 防拼音幻覈、做垃圾段偵測(見 runWhisperJson 實作)。
// ⚠️ 2026-07-27 STAGE 3 改用 -oj(JSON,帶 timestamp)代替舊版 -otxt -nt(淨文字,
// 冇時間) —— alignLyrics.js 對齊演算法要 whisper 嘅逐段時間做「實際演唱」ground
// truth,冇 timestamp 就做唔到。回傳 [{t0,t1,text}](秒),plainText() 幫手 join
// 返純文字俾 OCR 唔夠字嗰種 fallback(舊行為,直接寫 lyrics_draft)用。
async function runWhisperTranscribe(wavPath, lang) {
  const { segs, garbageDropped, failed } = await runWhisperJsonShared(wavPath, WHISPER_MODEL, lang, { timeout: 300000 });
  return { segs, lang, garbageDropped, failed };
}
const whisperPlainText = (segs) => segs.map((s) => s.text).join(' ').trim();

const WHISPER_MODEL_NAME = path.basename(WHISPER_MODEL).replace(/^ggml-/, '').replace(/\.bin$/, '');

// ── OCR 流水線(2026-08-17 Eric 拍板 24h 追趕)────────────────────────
// 舊版一首歌「落載→OCR→whisper」全串行,一首 ~5.5 分鐘,日產 150-260 首,
// 追唔上複核線(Max plan 後容量 ~880 決定/日)。樽頸喺本機 CPU 唔喺 YouTube,
// 所以拆開兩層:
//   * 落載照舊**單線 + jitter delay** —— YouTube 出口 IP 係全 App 命脈,
//     請求密度、次序、間隔全部零改變(唔准為速度郁呢層,紅線)
//   * OCR/whisper(本機 CPU,同 IP 無關)開 --ocr-concurrency 條線並行食隊
// 落載隊上限 MAX_DL_QUEUE 首(每首 360p ~10-30MB,唔好喺 /tmp 囤太多)。
const OCR_SONG_CONCURRENCY = Number(arg('--ocr-concurrency', 2));
const MAX_DL_QUEUE = 3;

// 一首已經落載好嘅歌嘅全部慢工序(frame→OCR→whisper→寫DB)。
// 呢個 function 會俾多條 worker 並行叫,log 用 [id] 做前綴等交錯都睇得明;
// 佢唔負責刪 temp dir(worker 嘅 finally 做)。
async function processOneSong(c, dir, videoPath, whisperReady, state) {
  const tag = `[${c.id}]`;
  const frames = await extractFrames(videoPath, dir);
  log(`    ${tag} 抽咗 ${frames.length} 張 frame`);

  // §P1 引擎選擇:中文歌行 PaddleOCR(藝術字體實測完勝 Vision),英文照舊
  // Vision。Paddle 行唔到(venv 冧咗/JSON 壞)或者讀出嚟 CJK 得雞碎咁多
  // (可能簡體字幕/怪字體認唔晒)→ Vision 兜底,邊份 CJK 多用邊份。
  let engine = 'vision';
  let merged = null;
  if (CJK_LANGS.has(c.lang) && paddleReady()) {
    const paddleLines = await ocrFramesPaddle(frames);
    if (paddleLines) {
      merged = mergeOcrLines(paddleLines, FRAME_INTERVAL_SEC);
      engine = 'paddle';
    }
  }
  if (!merged || (engine === 'paddle' && cjkCount(merged.text) < MIN_DRAFT_CHARS)) {
    const visionLines = await mapConcurrent(frames, OCR_FRAME_CONCURRENCY, ocrFrame);
    const visionMerged = mergeOcrLines(visionLines, FRAME_INTERVAL_SEC);
    if (!merged || cjkCount(visionMerged.text) > cjkCount(merged.text)) {
      if (engine === 'paddle') {
        log(`    ${tag} · Paddle 讀到 CJK 太少(${cjkCount(merged.text)}),Vision 兜底(${cjkCount(visionMerged.text)})`);
        engine = 'vision-fallback';
      }
      merged = visionMerged;
    }
  }
  const { blocks: ocrBlocks, text: ocrText, watermarkCount } = merged;
  const ocrChars = charCount(ocrText);
  log(`    ${tag} OCR(${engine})草稿 ${ocrChars} 隻字、${ocrBlocks.length} 個段落 block(剔咗 ${watermarkCount} 組疑似水印行)`);

  // 順手做 whisper(用返呢首歌啱啱落載嗰條片嘅音軌,零額外 request)。失敗
  // 唔阻 OCR draft(catch 咗)——timeline 冇 whisper 就等 alignBackfill.js 補。
  let whisperSegs = [], whisperError = null;
  if (whisperReady) {
    try {
      const wav = await extractAudioWav(videoPath, dir);
      const whisperLang = whisperLangFor(ocrText, c.lang);
      const result = await runWhisperTranscribe(wav, whisperLang);
      whisperSegs = result.segs;
      if (result.garbageDropped) log(`    ${tag} ⚠ 剷走 ${result.garbageDropped} 段疑似垃圾(CJK 佔比太低)`);
      if (result.failed) log(`    ${tag} · whisper 出嚟嘅嘢大部分係垃圾,當轉錄失敗,唔存入 timeline`);
      log(`    ${tag} whisper(-l ${whisperLang})出咗 ${whisperSegs.length} 段(存 timeline,俾將來對齊用)`);
    } catch (e) {
      whisperError = e;
      log(`    ${tag} ⚠ whisper 轉錄出錯(唔阻 OCR draft):${e?.message || e}`);
    }
  }
  const whisperText = whisperPlainText(whisperSegs);
  const whisperChars = charCount(whisperText);
  const timelineFields = (ocrBlocks.length || whisperSegs.length)
    ? { lyrics_timeline: JSON.stringify({ ocr: ocrBlocks, whisper: whisperSegs, model: WHISPER_MODEL_NAME, updatedAt: new Date().toISOString() }) }
    : {};

  if (ocrChars >= MIN_DRAFT_CHARS) {
    if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: ocrText, lyrics_status: 'draft', lyrics_source: 'ocr', lyrics_checked_at: today(), ...timelineFields });
    state.drafted++;
    log(`    ${tag} ✓ OCR 有效草稿(累計 +${state.drafted})`);
  } else if (whisperChars >= MIN_DRAFT_CHARS) {
    // OCR 去晒水印之後少過 40 字(當畫面冇字幕)—— whisper 文字夠就做後備 draft。
    if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: whisperText, lyrics_status: 'draft', lyrics_source: 'whisper', lyrics_checked_at: today(), ...timelineFields });
    state.drafted++;
    log(`    ${tag} ✓ OCR 冇字幕,whisper 有效草稿(累計 +${state.drafted})`);
  } else if (whisperReady && !whisperError) {
    if (!DRY) await writeLyricsRow(c.id, { lyrics_status: 'unavailable', lyrics_source: 'whisper', lyrics_checked_at: today(), ...timelineFields });
    state.unavailable++;
    log(`    ${tag} · OCR 冇字幕、whisper 都攞唔到嘢(可能純音樂/即興 live),標 unavailable`);
  } else {
    if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'ocr:miss', lyrics_checked_at: today(), ...timelineFields });
    state.ocrMiss++;
    log(whisperReady ? `    ${tag} · whisper 轉錄出錯,標 ocr:miss 留低(下次再試)` : `    ${tag} · whisper 未裝,標 ocr:miss 留低(唔算失敗,等裝好再揀返)`);
  }
}

async function runOcr(db, budget) {
  log(`mode=OCR budget=${budget} delay=~${DELAY_MS}ms 並行OCR線=${OCR_SONG_CONCURRENCY}`);
  const whisperReady = await checkWhisperAvailable();
  // 2026-07-27 STAGE 3:whisper 而家唔再淨係「OCR 唔夠字」先撞——同一個 run 順手
  // 幫每首(唔理 OCR 夠唔夠字)做埋 whisper,攞 timestamp 存 lyrics_timeline.whisper
  // 做 alignLyrics.js 對齊嘅 ground truth(零額外 YouTube request,片已經落咗)。
  // OCR 唔夠字嗰種情況,whisper 出嚟嘅文字仲係會當 draft 後備(舊行為冇變)。
  log(`  whisper:${whisperReady ? `已裝妥(${WHISPER_MODEL_NAME} model)——每首順手做 timeline,OCR 唔夠字仲會揀嚟做 draft 後備` : '未裝 / model 未落,冇 timeline,OCR 唔夠字嘅歌會標 ocr:miss 留低(唔算失敗)'}`);

  // ⚠️ 2026-07-25 P0 修:唔可以用 main() 開場嗰個舊 `db` snapshot 揀候選 ——
  // 實錄:CC 層(runCC)喺同一個 run 入面經 writeLyricsRow 剛啱標咗 25 首
  // cc:miss(呢啲寫入直接落正式 DB 檔,冇改到記憶體入面呢個舊 snapshot),
  // 跟住呢度用舊 snapshot 查 pickOcrCandidates 就完全見唔到呢 25 首,
  // 誤判「冇更多 cc:miss 等 OCR」,0 首收工。要重新 openDb() 攞返呢一刻
  // 最新嘅版,先睇得到 CC 層啱啱寫落去嘅嘢。
  const freshDb = await openDb();
  const cands = prioritizeByRequeue(
    prioritizeByPrescreen(filterByDlLedger(filterBySkipOrgs(pickOcrCandidates(freshDb), 'OCR'), 'OCR'), 'OCR'),
    'OCR'
  );
  if (!cands.length) { log('冇更多 cc:miss 嘅歌等 OCR(或者淨低嗰啲俾 ledger / --skip-orgs 剔走)'); return 0; }

  const state = { drafted: 0, unavailable: 0, ocrMiss: 0 };
  const queue = [];       // 已落載好、等 OCR 嘅歌:{ c, dir, videoPath }
  let dlFinished = false;

  // 落載線(串行):原有失敗記賬/streak/對照探測/斷路邏輯全部原封保留。
  const downloader = (async () => {
    let streak = 0, consec403 = 0;
    for (let i = 0; i < budget && i < cands.length; i++) {
      const c = cands[i];
      // 隊滿就等 OCR 線消化 —— 呢段等待唔會產生任何 YouTube 請求
      while (queue.length >= MAX_DL_QUEUE) await sleep(2000);
      log(`  落載 [${c.artist}] ${c.title}(id ${c.id})`);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnocr-'));
      let videoPath;
      try {
        videoPath = await downloadVideoLowRes(c.youtube_id, dir);
      } catch (e) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
        streak++;
        if (is403(e)) {
          consec403++;
          if (consec403 >= CONSEC_403_TO_BLOCK) {
            try { fs.writeFileSync(BLOCK_FLAG, `${new Date().toISOString()}\n連續 ${consec403} 次 HTTP 403\n`); } catch (_) {}
            log(`  ⛔ 連續 ${consec403} 次 HTTP 403 —— 疑似出口 IP 俾 YouTube 封咗媒體落載。`);
            log('     (list-subs 呢類 metadata 唔受影響,唔可以用佢做探測 —— 2026-08-19 事故教訓)');
            log('     落載線即刻收工,唔記 ledger、唔判 dl:dead(全域封鎖唔應該歸咎個別歌)。');
            return;
          }
          log(`    ⚠ 落載 403 (連續 ${consec403}/${CONSEC_403_TO_BLOCK}),未夠數判全域封鎖,暫當個別失敗`);
        } else {
          consec403 = 0;
        }
        const fails = recordDlFail(c.id);
        log(`    ⚠ 落載失敗 (連續 ${streak},呢首累計 ${fails} 次):${e?.message || e}`);
        if (fails >= DL_DEAD_AFTER && !DRY) {
          // 三次都落唔到 → 寫 dl:dead 踢出 OCR 候選(pickOcrCandidates 要 cc:miss),
          // lyrics_status 保留 'none' 所以第日想翻案改返 source 就得。
          await writeLyricsRow(c.id, { lyrics_source: 'dl:dead', lyrics_checked_at: today() });
          log(`    · 落載失敗夠 ${DL_DEAD_AFTER} 次,標 dl:dead 永久踢出 OCR 隊(可人手翻案)`);
        }
        if (streak >= 3) {
          log('  連續 3 次落載失敗 —— 用 CC 對照探測分清係咪俾擋…');
          await sleep(jitter(DELAY_MS));
          const probe = await listManualSubs(PROBE_VIDEO);
          if (probe.error) { log('  對照都 exec 失敗 → 疑似俾 YouTube 擋,落載線收工(OCR 線做埋手尾)'); return; }
          log('  對照行到 → 唔關 block 事,呢首本身落唔到,繼續'); streak = 0;
        }
        if (i < budget - 1) await sleep(jitter(DELAY_MS));
        continue;
      }
      streak = 0;
      consec403 = 0; // 落到片 = 冇封鎖,計數歸零
      queue.push({ c, dir, videoPath });
      if (i < budget - 1) await sleep(jitter(DELAY_MS));
    }
  })().finally(() => { dlFinished = true; });

  // OCR 線 × OCR_SONG_CONCURRENCY:本機 CPU 工序,同 YouTube 完全無關。
  const worker = async (wid) => {
    for (;;) {
      const item = queue.shift();
      if (!item) {
        if (dlFinished) return;
        await sleep(1500);
        continue;
      }
      try {
        await processOneSong(item.c, item.dir, item.videoPath, whisperReady, state);
      } catch (e) {
        log(`    [${item.c.id}] ⚠ OCR 線 w${wid} 處理出錯(跳過呢首,唔寫 DB,下次再試):${e?.message || e}`);
      } finally {
        try { fs.rmSync(item.dir, { recursive: true, force: true }); } catch (_) {}
      }
    }
  };

  await Promise.all([downloader, ...Array.from({ length: OCR_SONG_CONCURRENCY }, (_, w) => worker(w + 1))]);
  log(`今次:OCR/whisper 有效草稿 ${state.drafted} 首,unavailable ${state.unavailable} 首,ocr:miss(等 whisper/重試)${state.ocrMiss} 首`);
  return state.drafted;
}

async function main() {
  const db = await openDb();
  if (STATUS_ONLY) { report(db); return; }
  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${NIGHT_START}:00-${WINDOW_END}:00(隔夜)窗口內,唔做嘢。`);
    return;
  }
  report(db);
  const mode = arg('--mode', null);
  if (mode === 'ocr') {
    await runOcr(db, Number(arg('--budget', OCR_BUDGET)));
  } else if (mode === 'cc') {
    await runCC(db, Number(arg('--budget', CC_BUDGET)));
  } else {
    // 排程正常路徑(2026-07-24 起):每晚一次過,CC 先(平、處理新收錄嘅歌),
    // 跟住 OCR(主力,處理 CC 揾唔到嘅 backlog)。
    await runCC(db, CC_BUDGET);
    await runOcr(db, OCR_BUDGET);
  }
  log('---');
}

main().catch((e) => { console.error('fetchLyrics 出錯:', e); process.exit(1); });
