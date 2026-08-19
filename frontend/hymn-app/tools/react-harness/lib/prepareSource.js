import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = join(__dirname, '..');
const DEFAULT_SOURCE_DIR = join(HARNESS_ROOT, '..', '..', 'src', 'hooks');
const TMP_DIR = join(HARNESS_ROOT, '.tmp', 'hooks');

const MMKV_IMPORT_FROM = "import { MMKV } from 'react-native-mmkv';";
const MMKV_IMPORT_TO = "import { MMKV } from '../../mocks/mmkvMock.js';";
const CONFIG_IMPORT_FROM = "import { API_BASE } from '../config.js';";
const CONFIG_IMPORT_TO = "import { API_BASE } from '../../mocks/configStub.js';";

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

  if (!original.includes(MMKV_IMPORT_FROM)) {
    throw new Error(`prepareSource: 搵唔到預期嘅 MMKV import 行,sed 冇得做。source=${srcPath}`);
  }
  if (!original.includes(CONFIG_IMPORT_FROM)) {
    throw new Error(`prepareSource: 搵唔到預期嘅 config import 行,sed 冇得做。source=${srcPath}`);
  }

  const patched = original
    .replace(MMKV_IMPORT_FROM, MMKV_IMPORT_TO)
    .replace(CONFIG_IMPORT_FROM, CONFIG_IMPORT_TO);

  const changedLines = diffLineNumbers(original, patched);
  const expectedChangedCount = 2; // MMKV import 行 + config import 行,可以係同一行都得但呢度必定分開兩行
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

  return { outPath, srcPath, changedLines };
}
