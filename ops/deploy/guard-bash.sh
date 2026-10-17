#!/usr/bin/env bash
# ops/deploy/guard-bash.sh — PreToolUse hook,攔截未經 gate script 直接跑嘅
# `eas update` / `launchctl kickstart|load|unload|stop|bootout|bootstrap ... com.hymnapp.backend`。
#
# 讀 stdin 嘅 hook JSON,抽 .tool_input.command。
#   - 命中 `eas update`                                           -> deny
#   - 命中 `launchctl` 同時有 com.hymnapp.backend 同埋
#     kickstart|load|unload|stop|bootout|bootstrap 其中之一        -> deny
#     (`launchctl print`/`list` 呢類唔改狀態嘅查詢放行 —— 收窄 pattern,
#      DEPLOY-GATE-PLAN.md §四.5 建議)
#   - 其他一律放行(exit 0,唔輸出)
#
# deny 用 stdout JSON:
#   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
#
# DEPLOY-GATE-PLAN.md §三 3.2
set -euo pipefail

INPUT="$(cat)"

extract_command() {
  if command -v jq >/dev/null 2>&1; then
    echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true
  else
    echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', '') or '')
except Exception:
    pass
" 2>/dev/null || true
  fi
}

CMD="$(extract_command)"

if [[ -z "$CMD" ]]; then
  exit 0
fi

deny() {
  local reason="$1"
  python3 -c "
import json, sys
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'deny',
    'permissionDecisionReason': sys.argv[1],
  }
}))
" "$reason" 2>/dev/null || echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"$reason\"}}"
  exit 0
}

# --- eas update ---
if echo "$CMD" | grep -qE 'eas[[:space:]]+update'; then
  deny "OTA 必須經 ops/deploy/ota-publish.sh 推送(部署批准 Gate,DEPLOY-GATE-PLAN.md)。直接跑 eas update 已被攔截。"
fi

# --- launchctl kickstart/load/unload/stop/bootout/bootstrap ... com.hymnapp.backend ---
if echo "$CMD" | grep -qE 'launchctl' && echo "$CMD" | grep -q 'com\.hymnapp\.backend' \
  && echo "$CMD" | grep -qE '\b(kickstart|load|unload|stop|bootout|bootstrap)\b'; then
  deny "backend restart 必須經 ops/deploy/backend-restart.sh(部署批准 Gate,DEPLOY-GATE-PLAN.md)。直接操作 launchctl 已被攔截(查狀態請用 launchctl list | grep hymn 或 launchctl print,唔會被擋)。"
fi

exit 0
