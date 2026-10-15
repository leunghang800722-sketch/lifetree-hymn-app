#!/usr/bin/env bash
# T15:resolveAudio.js bot-check 冷卻指數退避(STREAM-PHONE-NOTIFY-EXEC-20261015 R5(b);P7b)。用法:t15-resolve-backoff.sh <scratchdir>
# 做法:把 backend/lib + package.json 複製去 scratch(令 resolve-cache.json 寫去 scratch,唔掂 backend/cache),
#   YTDLP_BIN 指 scratch stub(按 $S/mode 出 bot-check stderr 或有效 URL),Date.now 換成可控假時鐘,真 import 真 module(唔係 mock 版)。
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t15"; T="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$T/../../.." && pwd -P)"
rm -rf "$S"; mkdir -p "$S/backend/lib" "$S/backend/cache"
cp "$REPO"/backend/lib/*.js "$S/backend/lib/"; cp "$REPO/backend/package.json" "$S/backend/"
cat > "$S/stub-ytdlp" <<'STUB'
#!/bin/sh
m="$(cat "$(dirname "$0")/mode" 2>/dev/null)"
if [ "$m" = ok ]; then echo "https://stub.invalid/audio?expire=9999999999"; exit 0; fi
echo "ERROR: [youtube] xyz: Sign in to confirm you’re not a bot. Use --cookies-from-browser" >&2; exit 1
STUB
chmod +x "$S/stub-ytdlp"; echo bot > "$S/mode"
cat > "$S/run.mjs" <<'JS'
import { pathToFileURL } from 'url';
const R = await import(pathToFileURL(process.argv[2] + '/backend/lib/resolveAudio.js'));
const M = await import(pathToFileURL(process.argv[2] + '/backend/lib/opsMetrics.js'));
import fs from 'fs';
const mode = (m) => fs.writeFileSync(process.argv[2] + '/mode', m);
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
const st = () => R.__rateLimitStateForTest();
const secs = () => Math.round((st().until - fake) / 1000);
const warn = []; const ow = console.warn; console.warn = (...a) => { warn.push(a.join(' ')); };
const log = []; console.log = (...a) => log.push(a.join(' '));
const out = (...a) => process.stderr.write(a.join(' ') + '\n');
let i = 0; const nid = () => 'vid' + (++i);
async function tryResolve(opts) { try { await R.resolveAudioUrl(nid(), opts); return 'ok'; } catch (e) { return 'err:' + String(e.message).slice(0, 40); } }
mode('bot');
out('--- 連續 bot-check 1..9 次(每次等冷卻過咗先再撞;背景 caller)');
const seq = [];
for (let n = 1; n <= 9; n++) {
  const r = await tryResolve({});
  seq.push(secs());
  out(`n=${n} result=${r} cooldownSecs=${secs()} streak=${st().streak} 冷卻log=${warn.filter(w => /^⚠️ 冷卻/.test(w)).slice(-1)[0] || '(無)'}`);
  fake = st().until + 1000;   // 冷卻過咗少少
}
out('SEQ=' + seq.join(','));
const exp = [30, 60, 120, 240, 480, 960, 1800, 1800, 1800];
out('SEQ-EXPECT=' + exp.join(',') + ' ' + (JSON.stringify(seq) === JSON.stringify(exp) ? 'MATCH' : 'DIFF'));
out('--- 冷卻中背景 caller fail-fast(唔算新一次、唔延長)');
fake = st().until - 1500 * 1000;   // 退返入冷卻窗(尚餘 1500s)
const before = { ...st() };
const r1 = await tryResolve({});
out(`during-cooldown background → ${r1}; streak ${before.streak}->${st().streak}; until unchanged=${before.until === st().until}; log=${warn.slice(-1)[0].slice(0, 70)}`);
out('--- 真人播放(playbackRetry)喺長冷卻(~1800s)內、過咗 base 30s 之後 → 可嘗試');
fake += 31 * 1000;
out(`remaining background cooldown=${secs()}s,base 已過=${fake >= st().baseUntil}`);
const rb = await tryResolve({});
out(`background @31s → ${rb}(應仍被擋)`);
mode('ok');
const rp = await tryResolve({ playbackRetry: true });
out(`playbackRetry @31s mode=ok → ${rp};成功後 streak=${st().streak}(應 0)`);
out('--- 成功只歸零 streak(背景冷卻窗自然到期先放行;唔提早解除)');
const rb2 = await tryResolve({});
out(`background right after success (cooldown 未到期) → ${rb2}`);
out('--- 歸零後再撞 → 又係 30s');
mode('bot'); fake = Math.max(fake, st().until) + 1000;
const rr = await tryResolve({}); out(`after-reset bot-check → ${rr}; cooldownSecs=${secs()} streak=${st().streak}`);
const m = M.getOpsMetrics().total.botCheck;
out('opsMetrics.total.botCheck=' + JSON.stringify(m));
Date.now = realNow;
process.exit(0);
JS
YTDLP_BIN="$S/stub-ytdlp" node "$S/run.mjs" "$S" 2>&1 | grep -v "^$"
echo "(resolve-cache 寫入目標=scratch:$(ls "$S/backend/cache" | wc -l | tr -d " ") 檔;真 backend/cache 唔掂——測試用複製出嚟嘅 lib)"
