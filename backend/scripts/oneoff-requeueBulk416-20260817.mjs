#!/usr/bin/env node
// D1(2026-08-17,Eric 拍板):將 oneoff-clearBiLiveLyrics-bulk-20260817.mjs 剷咗
// 嘅 416 首正式併入重做隊 —— 單淨 lyrics=NULL 唔會俾 fetchLyrics 揀中
// (pickOcrCandidates 要 lyrics_status='none' AND lyrics_source='cc:miss'),
// 要跟返 oneoff-requeueCjkRedo-20260816.mjs「Batch A:live 遺害」嗰個做法:
// reset lyrics_status='none' + lyrics_source='cc:miss',先至會俾 producer
// keeper 嘅 OCR 隊食到。
//
// 安全條件:淨係郁「本身 lyrics_status 仲係 verified 且 lyrics 已經係 NULL」
// 嘅個案(即係啱啱俾 oneoff-clearBiLiveLyrics-bulk 剷過嗰批,狀態未變過)。
// lyrics_draft 唔郁(留返做重做底本參考)。
//
// 完成之後將呢 416 個 id merge 落 backend/data/lyrics-requeue-priority.json
// (排到隊頭最前 —— 依家出街緊係 NULL,比原本 66 首「live 遺害」更急),
// dedup 走同原有 273 首重疊嗰啲(佢哋喺呢批入面會經呢個 script 重新 reset 一次,
// 冇壞處)。
//
// 用法:node scripts/oneoff-requeueBulk416-20260817.mjs [--dry]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIORITY_PATH = path.join(__dirname, '..', 'data', 'lyrics-requeue-priority.json');
const DRY = process.argv.includes('--dry');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// 同 oneoff-clearBiLiveLyrics-bulk-20260817.mjs 一樣嘅 416 個 id(照抄)
const IDS = [19, 27, 72, 74, 77, 81, 186, 191, 205, 206, 207, 212, 214, 219, 221, 225, 237, 240, 248, 250, 254, 297, 308, 309, 313, 316, 318, 320, 321, 322, 324, 325, 331, 333, 336, 343, 345, 350, 351, 355, 357, 850, 1301, 1323, 1324, 1325, 1326, 1327, 1333, 1334, 1336, 1337, 1338, 1339, 1342, 1362, 1551, 1552, 1608, 1635, 1649, 1702, 1781, 1782, 1815, 1821, 1843, 1938, 2131, 2132, 2140, 2148, 2253, 2254, 2731, 3243, 3342, 3343, 3345, 3381, 3499, 3502, 3520, 3521, 3524, 3528, 3579, 3582, 3589, 3717, 3724, 3725, 3727, 3728, 3751, 3757, 3761, 3763, 3765, 3774, 3779, 3784, 3792, 3793, 4081, 4084, 4107, 4108, 4109, 4142, 4145, 4154, 4204, 4283, 4300, 4301, 4308, 4314, 4317, 4323, 4325, 4326, 4330, 4333, 4337, 4338, 4351, 4412, 4706, 4814, 4816, 4819, 4836, 4838, 4841, 4850, 4862, 4869, 4870, 4871, 4881, 4882, 4883, 4884, 4885, 4886, 4895, 4896, 4897, 4898, 4905, 4917, 4921, 4922, 4926, 4966, 4978, 4986, 4987, 4997, 5035, 5053, 5059, 5060, 5062, 5064, 5074, 5075, 5083, 5084, 5086, 5087, 5097, 5098, 5103, 5104, 5105, 5106, 5108, 5109, 5111, 5113, 5118, 5119, 5120, 5122, 5123, 5131, 5133, 5134, 5142, 5143, 5390, 5431, 5575, 5608, 5609, 5619, 5647, 5703, 5756, 5769, 5879, 5889, 5890, 5891, 5893, 5901, 5967, 6010, 6012, 6026, 6050, 6063, 6072, 6075, 6140, 6141, 6223, 6228, 6229, 6232, 6234, 6237, 6239, 6240, 6244, 6249, 6306, 6309, 6314, 6315, 6327, 6357, 6360, 6362, 6363, 6365, 6367, 6369, 6370, 6372, 6375, 6376, 6381, 6382, 6384, 6385, 6386, 6395, 6411, 6412, 6416, 6432, 6434, 6435, 6436, 6449, 6463, 6581, 6582, 6600, 6605, 6610, 6614, 6617, 6618, 6619, 6620, 6621, 6631, 6632, 6633, 6639, 6640, 6658, 6671, 6674, 6679, 6686, 6694, 6695, 6696, 6697, 6698, 6704, 6737, 6739, 6742, 6747, 6748, 6749, 6752, 6788, 6792, 6837, 6838, 6839, 6843, 6844, 6845, 6847, 6849, 6851, 6857, 6873, 6929, 6930, 6931, 6933, 6936, 6941, 6942, 6946, 6949, 6968, 6998, 7025, 7026, 7027, 7030, 7033, 7034, 7035, 7067, 7069, 7077, 7078, 7084, 7085, 7087, 7091, 7102, 7104, 7160, 7161, 7162, 7163, 7168, 7169, 7172, 7177, 7180, 7181, 7184, 7210, 7211, 7283, 7286, 7289, 7291, 7292, 7294, 7296, 7310, 7311, 7312, 7405, 7420, 7470, 7471, 7486, 7489, 7493, 7534, 7537, 7806, 8095, 8097, 8102, 8104, 8106, 8110, 8116, 8117, 8118, 8121, 8126, 8130, 8131, 8148, 8150, 8151, 8152, 8155, 8157, 8158, 8166, 8171, 8180, 8184, 8187, 8189, 8192, 8194, 8195, 8196, 8197, 8198, 8200, 8201, 8202, 8205, 8209, 8210, 8213, 8214, 8215, 8221, 8222, 8223, 8224, 8225, 8226, 8227, 8367];

const token = await acquireDbLock('oneoff-requeueBulk416');
if (!token) { log('⛔ 攞唔到 DB 鎖(等到上限),乜都冇做,遲啲再試'); process.exit(1); }

let resetCount = 0, skipCount = 0;
try {
  const db = await openDb();
  const rows = query(db, `SELECT id, lyrics_status, lyrics, lyrics_source FROM hymns_all WHERE id IN (${IDS.join(',')})`);
  for (const r of rows) {
    const alreadyNull = r.lyrics === null || r.lyrics === undefined;
    if (r.lyrics_status !== 'verified' || !alreadyNull) {
      skipCount++;
      log(`· skip ${r.id}(狀態已變:status=${r.lyrics_status} lyrics_null=${alreadyNull} —— 唔係啱啱剷完嗰個原始狀態,唔重複郁)`);
      continue;
    }
    if (!DRY) db.run(`UPDATE hymns_all SET lyrics_status='none', lyrics_source='cc:miss' WHERE id=?`, [r.id]);
    resetCount++;
  }
  if (!DRY && resetCount) saveDb(db);
  log(`${DRY ? '[dry] ' : ''}reset ${resetCount} 首 status→none/source→cc:miss,skip ${skipCount} 首(清單 ${IDS.length} 個 id)`);
} finally {
  releaseDbLock(token);
}

// ── merge 落 priority json ──────────────────────────────────────
let existing;
try {
  existing = JSON.parse(fs.readFileSync(PRIORITY_PATH, 'utf8'));
} catch (_) {
  existing = { counts: {}, ids: [], parkedInstrumentals: { note: '', ids: [] } };
}
const oldIds = existing.ids || [];
const newSet = new Set(IDS);
const overlapWithOld = oldIds.filter((id) => newSet.has(id)).length;
// 呢 416 首排到隊頭最前(依家出街緊係 NULL,比原有 66 首「live 遺害」更急);
// 舊隊列入面冇撞名嘅繼續跟返原有次序排喺後面。
const mergedIds = [...IDS, ...oldIds.filter((id) => !newSet.has(id))];

const updated = {
  ...existing,
  note: `${existing.note || ''} | 2026-08-17 D1:併入 416 首 bulk 止血個案(見 SUPERVISION-LOG「416 首止血」段落),排到隊頭最前。`,
  updatedAt: new Date().toISOString(),
  counts: { ...existing.counts, bulkClear20260817: IDS.length },
  ids: mergedIds,
};

if (!DRY) {
  fs.writeFileSync(PRIORITY_PATH, JSON.stringify(updated, null, 1));
}
log(`${DRY ? '[dry] 會' : '已'} merge 落 priority json:新 416 首(同舊隊列重疊 ${overlapWithOld} 首)+ 舊隊列淨低 ${oldIds.length - overlapWithOld} 首 = 合計 ${mergedIds.length} 個 id`);
