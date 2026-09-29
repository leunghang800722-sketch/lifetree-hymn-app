#!/usr/bin/env bash
# ops/stream/stream-watch-lib.sh — stream-watch / diagnose / remedy 共用小函數(只 source,唔直接行)
# STREAM-WATCH-EXEC-20260929

WATCH_DIR="${WATCH_DIR:-$HOME/.hymn-deploy}"

# 密鑰/URL 過濾:見到敏感字眼成行換做 [filtered];所有 URL 只留 scheme://host(googlevideo
# 簽名 URL 嘅 sig/token 參數就唔會入診斷包)。stdin → stdout。
wlib_filter() {
  sed -E \
    -e '/Authorization|Bearer |token|secret|password|passwd|JWT|TWILIO|api[_-]?key|cookie|\.env/I s/.*/[filtered: sensitive line]/' \
    -e 's#(https?://[^/ "'"'"'?<>]+)[^ "'"'"'<>]*#\1/[url-path-stripped]#g'
}

# perl alarm 頂硬上限(macOS 冇 GNU timeout)。用法:wlib_capped <sec> cmd args...
wlib_capped() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@"; }

wlib_now() { echo "${WATCH_NOW:-$(date +%s)}"; }
wlib_ts() { date -r "$(wlib_now)" '+%Y-%m-%d %H:%M' 2>/dev/null || date '+%Y-%m-%d %H:%M'; }
