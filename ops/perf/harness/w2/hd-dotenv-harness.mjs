// ops/perf/harness/w2/hd-dotenv-harness.mjs — DEEP-AUDIT W2 §2 H-D
//
// 三種情況(.env 唔存在/存在/同 process.env 撞)+ 一個「排序」正控:證明
// lib/dotenv.js 呢個 side-effect 真係喺 lib/authSecret.js 讀
// process.env.JWT_SECRET 之前行完(呢個先係 D1 個「一定要係第一個
// import」聲稱嘅重點,唔淨係「檔案解析啱唔啱」)。
//
// ⚠️ 呢個 harness 會短暫喺 backend/.env(真實運行時路徑,`.gitignore` 已
// 豁免、`git check-ignore` 會命中)寫一個**測試用假值**,測完即刻刪返
// (原本冇檔案就凈返冇檔案嘅狀態;如果跑呢個 harness 之前 backend/.env
// 已經存在——例如 Commit D3 已經幫 Eric 建咗真身——會**跳過**呢個會覆寫
// 真身嘅子測試,唔會亂咁覆寫已經有真密鑰嘅檔案)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../../../../backend');
const ENV_PATH = path.join(BACKEND_DIR, '.env');

const results = [];

// ── (a)(b)(c):純解析行為,喺獨立 child process 度測(避免污染呢個
// harness process 自己嘅 process.env,亦避免掂到真 backend/.env)────────
function runChild(envFileContent, presetEnv) {
  // 用一個臨時目錄放假 backend/,結構係 <tmp>/lib/dotenv.js + <tmp>/.env,
  // 完全唔掂真 backend/。
  const tmpRoot = fs.mkdtempSync('/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w2/dotenv-test-');
  fs.mkdirSync(path.join(tmpRoot, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(BACKEND_DIR, 'lib/dotenv.js'), path.join(tmpRoot, 'lib/dotenv.js'));
  if (envFileContent !== null) fs.writeFileSync(path.join(tmpRoot, '.env'), envFileContent);
  const driverPath = path.join(tmpRoot, 'driver.mjs');
  fs.writeFileSync(driverPath, `
import './lib/dotenv.js';
console.log(JSON.stringify({
  FOO: process.env.FOO ?? null,
  BAR: process.env.BAR ?? null,
  ALREADY_SET: process.env.ALREADY_SET ?? null,
}));
`);
  const out = execFileSync(process.execPath, [driverPath], {
    cwd: tmpRoot,
    env: { ...process.env, ...presetEnv },
    encoding: 'utf8',
  });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  return JSON.parse(out.trim().split('\n').pop());
}

// (a) .env 唔存在
results.push({ case: 'a_no_env_file', out: runChild(null, {}) });

// (b) .env 存在,兩個新 key
results.push({ case: 'b_env_file_new_keys', out: runChild('FOO=hello\nBAR="world with spaces"\n', {}) });

// (c) .env 存在,ALREADY_SET 喺 process.env 已經有值(模擬 plist 已設)——
//     唔准俾 .env 入面嘅值覆蓋。
results.push({
  case: 'c_env_file_conflicts_with_preset',
  out: runChild('FOO=from_dotenv\nALREADY_SET=from_dotenv\n', { ALREADY_SET: 'from_plist' }),
});

// ── (d) 排序正控:用返真身 lib/dotenv.js + lib/authSecret.js 一齊喺
// 一個獨立 child process 度行,證明 dotenv.js 個 side-effect 真係喺
// authSecret.js 讀 JWT_SECRET 之前完成。⚠️ 短暫喺真 backend/.env 寫一個
// 假值,執行完即刻刪返(如果之前已經有真身就跳過,唔冒險覆寫)。
const envAlreadyExists = fs.existsSync(ENV_PATH);
if (envAlreadyExists) {
  results.push({ case: 'd_ordering_positive_control', skipped: true, reason: 'backend/.env 已經存在(可能係 D3 已經幫 Eric 建咗真身),唔冒險覆寫去做呢個測試' });
} else {
  const testSecret = 'hc-dotenv-harness-fake-secret-not-real';
  fs.writeFileSync(ENV_PATH, `JWT_SECRET=${testSecret}\n`, { mode: 0o600 });
  try {
    const driverPath = path.join(BACKEND_DIR, '__hd_ordering_driver.mjs');
    fs.writeFileSync(driverPath, `
import './lib/dotenv.js';
import { JWT_SECRET } from './lib/authSecret.js';
console.log(JSON.stringify({ sawExpectedSecret: JWT_SECRET === ${JSON.stringify(testSecret)} }));
`);
    try {
      // 清走呢個 harness process 自己可能帶住嘅 JWT_SECRET(如果有),但保留
      // PATH/HOME 等,唔好整到 node 都行唔到。
      const cleanEnv = { ...process.env };
      delete cleanEnv.JWT_SECRET;
      const out = execFileSync(process.execPath, [driverPath], { cwd: BACKEND_DIR, env: cleanEnv, encoding: 'utf8' });
      results.push({ case: 'd_ordering_positive_control', out: JSON.parse(out.trim().split('\n').pop()) });
    } finally {
      fs.rmSync(driverPath, { force: true });
    }
  } finally {
    fs.rmSync(ENV_PATH, { force: true }); // 清返,唔留低假 .env
  }
}

for (const r of results) console.log(JSON.stringify(r));
