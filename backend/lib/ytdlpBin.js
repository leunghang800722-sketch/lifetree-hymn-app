// lib/ytdlpBin.js —— 全 app 唯一嘅 yt-dlp 路徑。
//
// 點解要統一(YTDLP-UNIFY-PLAN-20260822.md):以前有兩條半 binary —— 串流 resolve
// 同大部份 pipeline 靠 PATH 搵 brew 系統版,fetchLyrics 落載片就用 repo 入面一個
// 8/19 凍結咗嘅 nightly snapshot。結果:
//   · 2026-08-22 全庫 100% 播歌事故 = brew 版舊咗 6 個星期(2026.07.04),YouTube
//     新版 player 簽出嚟嘅 URL 只開放頭 1MiB,再攞落去全部 403。
//   · brew 一升到 2026.8.19,個「nightly」snapshot 反而變咗全機最舊嗰個 —— 下次
//     YouTube 郁 player,先冧嘅會係歌詞線。
// 「兩個 binary 版本一致」係守唔住嘅不變量;一個 binary,版本漂移在定義上唔存在。
//
// 呢個檔案唔准加邏輯(唔好喺度做 fallback 去 brew 版):fallback 會靜靜哋令
// 「單一 binary」個不變量失效,變返兩條 path,即係今次個病本身。binary 唔見咗
// 就應該嘈,唔應該靜靜哋降級。bootstrap 見 ops/launchd/README.md。
//
// 呢條路徑實際上係一條 **symlink**,指住 `tools/ytdlp-venv-a` 或 `-b` 入面 pip 裝
// 嘅 yt-dlp。由 ops/ytdlp/update-ytdlp.sh 管理(每日 05:30 check + canary,Eric
// 2026-08-22 拍板保守做法:canary 過都唔自動換,等人手 --apply;切換 = 揈條
// symlink,rollback 就係揈返轉頭,兩樣都唔使 restart backend)。唔入 git。
//
// ⚠️ 點解係 pip venv 唔係規劃書寫嗰個 37MB standalone binary:實測嗰個
// adhoc-signed Mach-O 每次 exec 都俾 macOS XprotectService 重新掃,淨係
// `--version` 都要 26–42 秒,而下面 resolveAudio 個 RESOLVE_TIMEOUT_MS 得 12 秒
// —— 即係每一次冷 resolve 都必定 timeout,成個串流會冧。pip venv 同一個 nightly
// 版本得 0.17 秒。剷 xattr / 本機重簽都試過,冇用。
//
// env YTDLP_BIN 可以 override —— 淨係為咗實驗/版本比對(例:指返 brew 版對照),
// 唔好喺生產排程度用。

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const YTDLP = process.env.YTDLP_BIN
  || path.join(__dirname, '..', 'tools', 'yt-dlp');
