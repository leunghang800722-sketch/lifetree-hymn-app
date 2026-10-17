#!/bin/bash
# PERF-STAGE2-2E-20260902 — 一次過:launch(warm)→2s→tap Library(201,796
# points)→27s(俾 perfHome@5s/perfMarks@25s/perfNav beacon 晒)→terminate。
# 用法: 2e-warm-cycle.sh <label:B|A> <run#>
set -uo pipefail
SCRATCH=/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad
DEV=E0416618-B662-41D2-A253-5260FA0CF556
BUNDLE=com.hymnapp.praise
LABEL="$1"
RUN="$2"
LOG="$SCRATCH/2e-run-${LABEL}-warm-${RUN}.log"
: > "$LOG"

T_LAUNCH=$(python3 -c "import time; print(int(time.time()*1000))")
xcrun simctl launch "$DEV" "$BUNDLE" >>"$LOG" 2>&1
echo "warm launched at host_ts=$T_LAUNCH" | tee -a "$LOG"
sleep 2
T_TAP=$(python3 -c "import time; print(int(time.time()*1000))")
idb ui tap --udid "$DEV" 201 796 >>"$LOG" 2>&1
echo "library tapped at host_ts=$T_TAP" | tee -a "$LOG"
sleep 27
xcrun simctl terminate "$DEV" "$BUNDLE" >>"$LOG" 2>&1
echo "host_launch_ts=$T_LAUNCH host_tap_ts=$T_TAP" >> "$LOG"
echo "=== done $LABEL warm $RUN ===" | tee -a "$LOG"
