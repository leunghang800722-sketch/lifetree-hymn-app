// backend/lib/dotenv.js — 極簡 .env loader(DEEP-AUDIT-W2-EXEC-20260906 D-10 D1)
//
// 讀 `backend/.env`(如存在),`KEY=VALUE` 逐行注入 `process.env`。**已有
// process.env 嘅唔覆蓋**(plist 值優先,過渡期兩邊並存唔會撞——Eric 未刪走
// launchd plist 嗰五個 key 之前,呢個 loader 淨係補冇喺 plist 出現嘅 key,
// 唔會同已生效嘅 plist 值打交)。唔加任何 npm 依賴(唔起 dotenv package)。
//
// ⚠️ 呢個 module 一定要係 server.js 嘅**第一個** import。ES module 按 import
// 宣告次序 depth-first 評估(呢個側效必須喺任何讀 `process.env.JWT_SECRET`/
// `process.env.TWILIO_*` 嘅 module——`lib/authSecret.js`/`routes/otpAuth.js`
// 等——之前行完)。如果將呢個 import 擺喺後面,或者換成第二/第三個 import,
// 一旦將來 Eric 跟 W2 報告 §5 嘅指引刪咗 plist 入面嗰五個 key,backend 就會
// 喺 `authSecret.js` 嘅 `process.exit(1)` 度死——因為 `.env` 冇機會喺
// authSecret.js 評估之前讀入,就算檔案本身存在都嚟唔切。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '..', '.env');

try {
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  let loadedCount = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 容許值兩邊有引號(方便手打含空格/特殊符號嘅值),淨係去最外層一對。
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loadedCount++;
    }
  }
  if (loadedCount > 0) {
    console.log(`[env] backend/.env 讀入 ${loadedCount} 個 key(process.env 已有嘅冇覆蓋)`);
  }
} catch (_) {
  // backend/.env 唔存在 —— 完全正常(過渡期 plist 仲齊晒啲值,唔算錯誤)。
}
