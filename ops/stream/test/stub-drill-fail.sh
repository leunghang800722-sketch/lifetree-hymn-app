#!/usr/bin/env bash
# 演習 stub(WATCH_DRILL_CMD):$DRILL_STUB_MODE = fail(exit 1)| hang(睡 600 秒)| ok
echo "$(date +%T) $$ $*" >> "$STUB_DIR/drill-stub.calls"
case "${DRILL_STUB_MODE:-fail}" in
  fail) echo "stub 演習失敗"; exit 1 ;;
  hang) sleep 600 ;;
  *) echo "DRILL-RESULT stub ok"; exit 0 ;;
esac
