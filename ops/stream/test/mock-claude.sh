#!/usr/bin/env bash
# 假 claude(只測 stream-diagnose.sh 嘅管道:argv / env / cwd / VERDICT 解析 / timeout fallback)。**唔係**真模型。
# MOCK_MODE: ok | noverdict | hang | autherr
echo "cwd=$(pwd) REMEDY_ENGINE=${REMEDY_ENGINE:-} REMEDY_INCIDENT=${REMEDY_INCIDENT:-}" >> "$STUB_DIR/mock-claude.calls"
python3 -c 'import sys; a=sys.argv[1:]; i=a.index("-p"); a[i+1]="<prompt %d chars>"%len(a[i+1]); print("argv: "+" ".join("[%s]"%x for x in a))' "$@" >> "$STUB_DIR/mock-claude.calls"
case "${MOCK_MODE:-ok}" in
  hang) sleep 300 ;;
  autherr) echo '{"is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed"}'; exit 1 ;;
  noverdict) echo '{"is_error":false,"result":"我覺得冇問題。"}'; exit 0 ;;
  ok)
    out="$(ops/stream/stream-remedy.sh restart-backend 2>&1)"
    python3 -c 'import json,sys; print(json.dumps({"is_error":False,"permission_denials":[],"result":"backend health 非 200,執行 restart-backend。\nremedy: "+sys.argv[1]+"\nVERDICT: fixed-pending-verify\nREASON: backend 死\nACTIONS: restart-backend"}))' "$out" ;;
esac
