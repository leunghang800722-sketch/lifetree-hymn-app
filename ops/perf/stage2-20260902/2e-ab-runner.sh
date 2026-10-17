#!/bin/bash
# PERF-STAGE2-2E-20260902 — S2 熱開 A/B runner。
# 用法: 2e-ab-runner.sh <label:B|A> <mode:seed|warm> <run#>
set -uo pipefail

SCRATCH=/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad
DEV=E0416618-B662-41D2-A253-5260FA0CF556
BUNDLE=com.hymnapp.praise
LABEL="$1"   # B=BEFORE(d375f9a,2D 嘅 AFTER) A=AFTER(2E HEAD,含 E-1..E-5)
MODE="$2"    # seed|warm
RUN="$3"

if [ "$LABEL" = "B" ]; then
  APP="$SCRATCH/BEFORE-2E.app"
  EXPECT_BYTES=3725280
else
  APP="$SCRATCH/AFTER-2E.app"
  EXPECT_BYTES=3726969
fi

LOG="$SCRATCH/2e-run-${LABEL}-${MODE}-${RUN}.log"
: > "$LOG"

echo "=== label=$LABEL mode=$MODE run=$RUN app=$APP ===" | tee -a "$LOG"

if [ "$MODE" = "seed" ]; then
  # 全新 install(冇 cache)+ launch,俾佢行完成套 lite(+E-5 延遲 8s 之後嘅
  # lyrics)+merge+MMKV 寫,等落一步 warm reopen 有真 cache 可以食。
  # 40s(2D 用 15s——E-5 加咗 8s idle 延遲,加大margin 保證兩個 label 都
  # 有充裕時間完成 merge)。
  xcrun simctl uninstall "$DEV" "$BUNDLE" >>"$LOG" 2>&1
  xcrun simctl install "$DEV" "$APP" >>"$LOG" 2>&1
  CONTAINER=$(xcrun simctl get_app_container "$DEV" "$BUNDLE" 2>>"$LOG")
  ACTUAL_BYTES=$(stat -f%z "$CONTAINER/main.jsbundle" 2>/dev/null)
  echo "verify: expect=$EXPECT_BYTES actual=$ACTUAL_BYTES match=$([ "$EXPECT_BYTES" = "$ACTUAL_BYTES" ] && echo YES || echo NO)" | tee -a "$LOG"
  T_LAUNCH=$(python3 -c "import time; print(int(time.time()*1000))")
  xcrun simctl launch "$DEV" "$BUNDLE" >>"$LOG" 2>&1
  echo "seed launched at host_ts=$T_LAUNCH, waiting 40s for E-5 delay+merge+MMKV write" | tee -a "$LOG"
  sleep 40
  xcrun simctl terminate "$DEV" "$BUNDLE" >>"$LOG" 2>&1
elif [ "$MODE" = "warm" ]; then
  # 唔 uninstall/install —— 沿用 seed 步驟留低嘅 sandbox(MMKV cache 已populate)。
  T_LAUNCH=$(python3 -c "import time; print(int(time.time()*1000))")
  xcrun simctl launch "$DEV" "$BUNDLE" >>"$LOG" 2>&1
  echo "warm launched at host_ts=$T_LAUNCH" | tee -a "$LOG"
  echo "host_launch_ts=$T_LAUNCH" >> "$LOG"
fi

echo "=== done $LABEL $MODE $RUN ===" | tee -a "$LOG"
