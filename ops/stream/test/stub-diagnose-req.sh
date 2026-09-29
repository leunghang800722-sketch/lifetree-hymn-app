#!/usr/bin/env bash
# 假診斷(模擬 AI 喺診斷期間 call `stream-remedy.sh escalate`):寫 escalate.request。
# REQ_MODE: good(帶當前 incident)| stale(帶舊 incident)| noinc(冇 incident 欄)
id="${1:-}"; f="$WATCH_DIR/stream-escalate.request"
case "${REQ_MODE:-good}" in
  good)  printf 'incident=%s\nat=x\nreason=正控:同 incident 嘅 request\n' "$id" > "$f" ;;
  stale) printf 'incident=STALE-OLD-INCIDENT\nat=x\nreason=舊 request\n' > "$f" ;;
  noinc) printf 'at=x\nreason=冇 incident 欄\n' > "$f" ;;
esac
echo "engine=stub-req"; echo "VERDICT: wait"; echo "REASON: stub 診斷(有寫 request)"; echo "ACTIONS: escalate"
