#!/usr/bin/env bash
# T7:stream-watch.sh 壞/hang 都唔影響 healthcheck。因 healthcheck 寫 REPO 相對路徑(唔可 override),
# 用 scratch「假 repo」(複製 healthcheck+selfheal,stream-watch 換成 stub),HOME 指去 scratch(.on 檔喺 scratch HOME)。
# 用法:t7-healthcheck-isolation.sh <scratchdir>
set -u
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"; SRC="$(cd "$T/../../.." && pwd)"
R="$S/t7/repo"; H="$S/t7/home"; rm -rf "$S/t7"; mkdir -p "$R/ops/lyrics" "$R/ops/stream" "$R/docs" "$R/backend/data" "$H/.hymn-deploy"
cp "$SRC/ops/lyrics/stream-healthcheck.sh" "$R/ops/lyrics/"; cp "$SRC/ops/stream/stream-selfheal.sh" "$R/ops/stream/"
export HOME="$H" HYMN_STREAM_BASE="http://127.0.0.1:9" SELFHEAL_DRY_RUN=1
run() { # $1=label
  s=$(date +%s); "$R/ops/lyrics/stream-healthcheck.sh" >/dev/null 2>&1; rc=$?; e=$(( $(date +%s)-s ))
  echo "$1 | healthcheck exit=$rc elapsed=${e}s | /tmp/hymn_stream_watch.log 新增=$(( $(wc -l < /tmp/hymn_stream_watch.log 2>/dev/null || echo 0) ))行"; }
: > /tmp/hymn_stream_watch.log
mkwatch() { printf '#!/usr/bin/env bash\n%s\n' "$1" > "$R/ops/stream/stream-watch.sh"; chmod +x "$R/ops/stream/stream-watch.sh"; }
echo "(healthcheck 對死 port 探測,本身會判 unhealthy;比較只睇 exit code 同耗時)"
echo "--- 0. 冇 .on 檔(預設 off):watch 唔會被 call"
mkwatch 'echo CALLED >> "'"$S"'/t7/called"'; run "off(冇 .on)"; echo "   watch 被 call 次數=$(cat "$S/t7/called" 2>/dev/null | wc -l | tr -d ' ')"
touch "$H/.hymn-deploy/stream-watch.on"
echo "--- 1. baseline:on + watch 正常(exit 0)"; mkwatch 'echo CALLED >> "'"$S"'/t7/called"; exit 0'; run "watch exit 0"
echo "--- 2. watch exit 1"; mkwatch 'echo "watch failing on purpose"; exit 1'; run "watch exit 1"
echo "--- 3. watch 崩(kill -9 自己)"; mkwatch 'kill -9 $$'; run "watch SIGKILL"
echo "--- 4. watch hang 900s(模擬 15 分鐘),WATCH_HARD_CAP=6 令測試可行;prod 預設 1500s"
mkwatch 'sleep 900'; WATCH_HARD_CAP=6 run "watch hang(cap 6s)"
echo "--- 5. stream-watch.sh 真身 + 死 status(WATCH_STATUS_CMD=exit 99 亂碼)"; cp "$SRC/ops/stream/stream-watch.sh" "$SRC/ops/stream/stream-watch-lib.sh" "$R/ops/stream/"
printf '#!/usr/bin/env bash\necho garbage; exit 99\n' > "$S/t7/badstatus.sh"; chmod +x "$S/t7/badstatus.sh"
WATCH_STATUS_CMD="$S/t7/badstatus.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" STUB_DIR="$S/t7" WATCH_DIAGNOSE_CMD="$T/stub-diagnose.sh" WATCH_LOG_MD="$S/t7/LOG.md" run "watch 真身+status 亂碼"
echo "--- baseline 對照(watch 完全唔接線:刪 .on)"; rm -f "$H/.hymn-deploy/stream-watch.on"; run "baseline(off)"
