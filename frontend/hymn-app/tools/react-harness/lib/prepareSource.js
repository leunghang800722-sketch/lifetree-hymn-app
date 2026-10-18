import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = join(__dirname, '..');
const DEFAULT_SOURCE_DIR = join(HARNESS_ROOT, '..', '..', 'src', 'hooks');
const TMP_DIR = join(HARNESS_ROOT, '.tmp', 'hooks');

// sed 規則表。每條 { from, to, required }:required=true 搵唔到即 throw;
// required=false(例如舊版 c9bd715 先有嘅 MMKV import、或新版先有嘅 storage /
// perfMarks / react-native import)搵到先 patch。最後 diff 行數必須等於「實際
// 命中規則數」,否則 throw(維護紀律)。
// 2026-10-18:useCachedHymns.js 已由直接 `new MMKV()` 改為經 ../storage 嘅
// getStorage()(BATCH5 O10),另加 perfMarks / react-native import,所以 MMKV
// 規則降為舊版專用,新版 import 形狀加三條 stub 規則。
const RULES = [
  // 舊版(c9bd715 一類)直接 import MMKV
  { name: 'mmkv(legacy)', from: "import { MMKV } from 'react-native-mmkv';", to: "import { MMKV } from '../../mocks/mmkvMock.js';" },
  // 現行:經 storage.js 共用 instance
  { name: 'storage', from: "import { getStorage } from '../storage';", to: "import { getStorage } from '../../mocks/storageStub.js';" },
  { name: 'perfMarks', from: "import { mark, note } from '../perfMarks';", to: "import { mark, note } from '../../mocks/perfMarksStub.js';" },
  { name: 'api(fetchWithTimeout)', from: "import { fetchWithTimeout } from '../api';", to: "import { fetchWithTimeout } from '../../mocks/apiStub.js';" },
  { name: 'react-native', from: "import { InteractionManager } from 'react-native';", to: "import { InteractionManager } from '../../mocks/reactNativeStub.js';" },
  // 兩種 config import 寫法(舊版 ../config.js,必有其一)
  { name: 'config', from: "import { API_BASE } from '../config.js';", to: "import { API_BASE } from '../../mocks/configStub.js';", required: true },
];
// MMKV 來源必有其一(舊版 MMKV 直 import,或新版 storage import)。
const MMKV_SOURCE_RULES = ['mmkv(legacy)', 'storage'];

function diffLineNumbers(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const max = Math.max(la.length, lb.length);
  const changed = [];
  for (let i = 0; i < max; i++) {
    if (la[i] !== lb[i]) changed.push(i + 1);
  }
  return changed;
}

// 運行時由(預設)src/hooks/useCachedHymns.js 複製現行源碼、sed 只改 MMKV +
// config 兩條 import 做 mock/stub,永遠測「而家嘅 code」,唔准 commit 一份
// 會過時嘅 copy(O1-O2-REPLAN-20260819.md §6.2 維護要求)。sed 前後 diff 一定
// 要淨係嗰兩行,唔係就 throw —— 呢個 assertion 防止未來源碼改咗 import
// 寫法之後,呢度靜靜哋唔再 patch 中,令 harness 測緊一個仲用緊真 MMKV/真
// config 嘅版本(會喺 CI 環境即刻炸,而唔係扮測緊嘢)。
//
// sourceDir 可以用 HARNESS_SOURCE_DIR 環境變數覆蓋 —— 一次性紅色驗收
// (對住 c9bd715 舊版跑)專用,唔影響日常 gate 用嘅預設路徑。
export function prepareUseCachedHymns(sourceDir = process.env.HARNESS_SOURCE_DIR || DEFAULT_SOURCE_DIR) {
  const srcPath = join(sourceDir, 'useCachedHymns.js');
  const original = readFileSync(srcPath, 'utf8');

  const hit = RULES.filter((r) => original.includes(r.from));
  const hitNames = hit.map((r) => r.name);
  if (!hit.some((r) => MMKV_SOURCE_RULES.includes(r.name))) {
    throw new Error(`prepareSource: 搵唔到預期嘅 MMKV/storage import 行,sed 冇得做。source=${srcPath}`);
  }
  for (const r of RULES) {
    if (r.required && !hitNames.includes(r.name)) {
      throw new Error(`prepareSource: 搵唔到預期嘅 ${r.name} import 行,sed 冇得做。source=${srcPath}`);
    }
  }

  let patched = original;
  for (const r of hit) patched = patched.replace(r.from, r.to);

  const changedLines = diffLineNumbers(original, patched);
  const expectedChangedCount = hit.length; // 每條命中規則恰好改一行
  if (changedLines.length !== expectedChangedCount) {
    throw new Error(
      `prepareSource: sed 前後 diff 應該淨係 ${expectedChangedCount} 行,實際 ${changedLines.length} 行` +
      `(line numbers: ${changedLines.join(',')})。維護紀律要求呢個 assertion fail 就即刻停,` +
      `唔准 harness 靜靜哋測緊一份唔知改咗幾多嘢嘅 copy。`
    );
  }

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const outPath = join(TMP_DIR, 'useCachedHymns.harness.js');
  writeFileSync(outPath, patched, 'utf8');

  // externalStore.js(如果新版有 import 就會用到)——原封複製,唔 sed,
  // 因為佢冇任何 RN/MMKV 依賴,唔使 mock。淨係喺新設計先存在,舊版
  // (c9bd715)冇呢個 import 就跳過。
  if (patched.includes("from './externalStore.js'")) {
    const esPath = join(sourceDir, 'externalStore.js');
    const esContent = readFileSync(esPath, 'utf8');
    writeFileSync(join(TMP_DIR, 'externalStore.js'), esContent, 'utf8');
  }

  return { outPath, srcPath, changedLines, patchedRules: hitNames };
}
