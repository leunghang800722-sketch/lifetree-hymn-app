#!/usr/bin/env bash
# T3-mock:stream-diagnose.sh 管道測試(用 mock-claude,唔係真模型)。用法:t3-diagnose-plumbing.sh <scratchdir>
set -u
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"; D="$T/../stream-diagnose.sh"
rm -rf "$S/t3m"; mkdir -p "$S/t3m/stub" "$S/t3m/wd"
export STUB_DIR="$S/t3m/stub" WATCH_DIR="$S/t3m/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/t3m/wd/remedy.log" REMEDY_STATE="$S/t3m/wd/rs.json" \
  SELFHEAL_STATE="$S/t3m/sh.json" SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply" SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" HYMN_STREAM_BASE="http://127.0.0.1:9" WATCH_STATE="$S/t3m/none.json" \
  DIAG_BUNDLE_FILE="$T/fixtures/bundle-backend-down.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" DIAG_CLAUDE_BIN="$T/mock-claude.sh"
for mode in ok noverdict autherr hang; do
  echo "=== mock MOCK_MODE=$mode ==="; export MOCK_MODE=$mode; [[ $mode == hang ]] && export DIAG_TIMEOUT=3 || unset DIAG_TIMEOUT
  s=$(date +%s); DIAG_DIR="$S/t3m/inc-$mode" "$D" "m-$mode" | sed 's/^/  /'; echo "  elapsed=$(( $(date +%s)-s ))s"
done
echo "=== mock-claude.calls(argv / cwd / env 證據)==="; cat "$STUB_DIR/mock-claude.calls"
echo "=== remedy.log ==="; cat "$REMEDY_LOG"
