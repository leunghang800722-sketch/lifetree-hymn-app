#!/usr/bin/env bash
# T2:stream-remedy.sh allowlist / 配額。用法:t2-remedy.sh <scratchdir>
set -u
S="${1:?scratch dir}"; T="$(cd "$(dirname "$0")" && pwd)"; R="$T/../stream-remedy.sh"
rm -rf "$S/t2"; mkdir -p "$S/t2/wd" "$S/t2/stub"
export STUB_DIR="$S/t2/stub" WATCH_DIR="$S/t2/wd" REMEDY_STATE="$S/t2/wd/rs.json" REMEDY_LOG="$S/t2/wd/remedy.log" \
  SELFHEAL_STATE="$S/t2/selfheal.json" SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply" SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" HYMN_STREAM_BASE="http://127.0.0.1:9" REMEDY_INCIDENT=t2inc WATCH_STATE="$S/t2/none.json"
echo ok > "$STUB_DIR/mode"; echo '{}' > "$SELFHEAL_STATE"
sidefx() { echo "   [side effects: cmd.calls=$(cat "$STUB_DIR/cmd.calls" 2>/dev/null | wc -l | tr -d ' ') rs.json=$([ -f "$REMEDY_STATE" ] && echo exists || echo none) request=$([ -f "$WATCH_DIR/stream-escalate.request" ] && echo yes || echo no)]"; }
run() { echo "\$ REMEDY_DRY_RUN=${DRYV:-} stream-remedy.sh $*"; "$R" "$@"; echo "   exit=$?"; sidefx; }
echo "=== A. 每個 action dry-run ==="
export REMEDY_DRY_RUN=1
run status; run probe 42; run swap-ytdlp; run restart-backend; run wait; run escalate "測試升級"; run bust-resolve-cache
echo "=== B. 拒絕(exit 2、零側效應;非 dry-run 都零)==="
unset REMEDY_DRY_RUN
run bogus; run; run status extra; run wait now; run probe; run probe 42 43; run probe "42; rm -rf $S/t2/canary"; run probe '$(touch '"$S"'/t2/canary)'
run 'restart-backend; touch '"$S"'/t2/canary'; run escalate; run escalate a b; run swap-ytdlp --force
echo "   canary 檔存在?$([ -e "$S/t2/canary" ] && echo YES-BAD || echo no)"
echo "=== C. 配額(非 dry-run,stub 指令)==="
run restart-backend; run restart-backend; run swap-ytdlp; run swap-ytdlp
echo "--- 合共上限:selfheal 今日已 restart 2 次 → 其中 remedy 第 1 次應被拒"
rm -f "$REMEDY_STATE"; printf '{"date":"%s","swapsToday":1,"restartsToday":3}' "$(date +%F)" > "$SELFHEAL_STATE"
run restart-backend; run swap-ytdlp
echo "--- probe 每 incident ≤6(curl 打死 port,只驗配額)"
for i in 1 2 3 4 5 6 7; do run probe 42 | grep -E "exit=|QUOTA"; done
echo "--- gate 唔過:restart stub exit 1 + 'abort' → GATE-BLOCKED"
rm -f "$REMEDY_STATE"; echo '{}' > "$SELFHEAL_STATE"
export SELFHEAL_RESTART_CMD="$T/stub-gate-fail.sh"; run restart-backend
echo "--- escalate 非 dry-run 寫 request"; run escalate "backend 修唔到"; cat "$WATCH_DIR/stream-escalate.request"
echo "=== remedy.log ==="; cat "$REMEDY_LOG"
