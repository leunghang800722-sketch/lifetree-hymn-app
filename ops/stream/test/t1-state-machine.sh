#!/usr/bin/env bash
# T1:stream-watch.sh 狀態機劇本。全部 env override 指去 $S(scratch)。用法:t1-state-machine.sh <scratchdir>
set -u
S="${1:?scratch dir}"; T="$(cd "$(dirname "$0")" && pwd)"; W="$T/../stream-watch.sh"
export STUB_DIR="$S/stub" WATCH_DIR="$S/wd" WATCH_LOG_MD="$S/SUPERVISION-LOG.md" \
  WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" WATCH_DIAGNOSE_CMD="$T/stub-diagnose.sh"
rm -rf "$S/stub" "$S/wd" "$S/SUPERVISION-LOG.md"; mkdir -p "$S/stub" "$S/wd"; : > "$S/SUPERVISION-LOG.md"
T0=1790000000; TICK=0
tick() { # $1=mode
  echo "$1" > "$STUB_DIR/mode"; WATCH_NOW=$((T0 + TICK*1800)) "$W"; TICK=$((TICK+1))
}
snap() { printf '%-28s | notify=%s diagCalls=%s alertFile=%s logLines=%s state.status=%s badTicks=%s\n' "$1" \
  "$(cat "$STUB_DIR/notify.log" 2>/dev/null | wc -l | tr -d ' ')" "$(cat "$STUB_DIR/diagnose.calls" 2>/dev/null | wc -l | tr -d ' ')" \
  "$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo no)" "$(wc -l < "$WATCH_LOG_MD" | tr -d ' ')" \
  "$(python3 -c "import json;d=json.load(open('$WATCH_DIR/stream-watch-state.json'));print(d['status'],d['badTicks'],sep=' badTicks=')" 2>/dev/null|| echo none)" ""; }
echo "=== 劇本 1:ok×3 → bad×1 → bad×2 → bad×3,×4 → 12 小時 → ok ==="
tick ok; snap "tick1 ok"; before="$(ls -la --time-style=+%s "$WATCH_DIR" 2>/dev/null | md5sum 2>/dev/null)"
tick ok; snap "tick2 ok"; tick ok; snap "tick3 ok(ok×3 完)"
echo "  (ok×3 後 wd 內容:$(ls "$WATCH_DIR" | tr '\n' ' '))"
tick bad; snap "tick4 bad#1"
tick bad; snap "tick5 bad#2(診斷應觸發一次)"
tick bad; snap "tick6 bad#3"
tick bad; snap "tick7 bad#4(應升級)"
for i in $(seq 1 24); do tick bad; done; snap "再 24 tick(12 小時)後"
cat "$STUB_DIR/notify.log"
echo "--- 警報檔"; cat "$WATCH_DIR/STREAM-ALERT.md"
tick ok; snap "tick(恢復)"
echo "--- notify.log"; cat "$STUB_DIR/notify.log"; echo "--- SUPERVISION-LOG"; cat "$WATCH_LOG_MD"
echo; echo "=== 劇本 2:診斷後下一 tick 即 ok(零通知 + 自動修復行) ==="
rm -f "$STUB_DIR/notify.log" "$STUB_DIR/diagnose.calls" "$WATCH_DIR/STREAM-ALERT.md"; : > "$WATCH_LOG_MD"
echo fixed-pending-verify > "$STUB_DIR/verdict"
tick bad; tick bad; snap "bad×2(已診斷)"; tick ok; snap "下一 tick ok"
echo "--- notify.log:$(cat "$STUB_DIR/notify.log" 2>/dev/null | wc -l | tr -d ' ') 行"; echo "--- SUPERVISION-LOG"; cat "$WATCH_LOG_MD"
echo; echo "=== 劇本 3:單 tick blip(bad×1 → ok)零寫檔零通知 ==="
rm -f "$STUB_DIR/diagnose.calls"; : > "$WATCH_LOG_MD"; tick bad; tick ok; snap "blip"
echo "log bytes=$(wc -c < "$WATCH_LOG_MD" | tr -d ' ')"
