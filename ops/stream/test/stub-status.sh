#!/usr/bin/env bash
# 假 stream-status:讀 $STUB_DIR/mode(ok|bad|stale),照 stream-status.sh 格式 + exit code 輸出
m="$(cat "$STUB_DIR/mode" 2>/dev/null || echo ok)"
case "$m" in
  ok)  echo '{"healthy":true,"stale":false,"needsHuman":false,"summary":"健康(stub)","consecutiveFail":0}'; exit 0 ;;
  bad) echo '{"healthy":false,"stale":false,"needsHuman":true,"summary":"唔健康,形態③(stub)","consecutiveFail":3}'; exit 1 ;;
  stale) echo '{"healthy":false,"stale":true,"needsHuman":true,"summary":"stale(stub)"}'; exit 2 ;;
esac
