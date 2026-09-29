#!/usr/bin/env bash
# ops/stream/stream-diagnose-rules.sh <facts.env> — 規則診斷(headless claude 唔可用時嘅 fallback)
# STREAM-WATCH-EXEC-20260929 §1.2(4)。純 shell、零 AI。
#
# 規則次序(同執行單條目次序有一處對調:backend 死咗優先,因為 backend 死咗嗰陣 403 率冇意義):
#   1. backend pid 唔存在 或 /api/health 非 200      → restart-backend
#   2. resolve 全 fail(total>0 且 fail==total)且 yt-dlp 候選(閒置 slot)版本較新 → swap-ytdlp
#   3. 403 率高(>=RULE_403_HIGH,預設 30%)          → wait(記錄,交返下一 tick 重驗)
#   4. 其餘                                          → escalate
# 輸出固定格式 VERDICT / REASON / ACTIONS(俾 stream-diagnose.sh 收)。動作一律經 stream-remedy.sh。
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FACTS="${1:-}"; [[ -f "$FACTS" ]] || { echo "VERDICT: escalate"; echo "REASON: rules: 冇 facts 檔"; echo "ACTIONS: none"; exit 0; }
REMEDY="${REMEDY_CMD:-$REPO/ops/stream/stream-remedy.sh}"
HIGH="${RULE_403_HIGH:-30}"
export REMEDY_ENGINE=rules
# facts 只係 KEY=VALUE(diagnose 自己寫,值已 tr -cd 白名單字元),用 grep 讀,唔 source
f() { grep -E "^$1=" "$FACTS" | head -1 | cut -d= -f2-; }
pid="$(f BACKEND_PID)"; health="$(f HEALTH_HTTP)"; rt="$(f RESOLVE_TOTAL)"; rf="$(f RESOLVE_FAIL)"
act="$(f YTDLP_ACTIVE)"; idle="$(f YTDLP_IDLE)"; r403="$(f RATE403)"
rt="${rt:-0}"; rf="${rf:-0}"

run() { # $@ = remedy args;印結果,回傳 exit code
  local out rc; out="$("$REMEDY" "$@" 2>&1)"; rc=$?; echo "  \$ stream-remedy.sh $* → exit=$rc: $(echo "$out" | tail -3 | tr '\n' ' ')" >&2; return $rc
}
newer() { # $1 idle $2 active:idle 版本係咪比 active 新(sort -V)
  [[ -n "$1" && "$1" != "?" && "$1" != "$2" ]] && [[ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]
}

if [[ -z "$pid" || "$pid" == "none" || "$health" != "200" ]]; then
  reason="backend 有問題(pid=${pid:-none} health=${health:-?})"
  if run restart-backend; then
    echo "VERDICT: fixed-pending-verify"; echo "REASON: rules: $reason → 已 restart-backend,下一 tick 重驗"; echo "ACTIONS: restart-backend"
  else
    echo "VERDICT: escalate"; echo "REASON: rules: $reason → restart-backend 失敗/被拒(gate 或配額)"; echo "ACTIONS: restart-backend(failed)"
  fi
elif [[ "$rt" -gt 0 && "$rf" -eq "$rt" ]] && newer "$idle" "$act"; then
  reason="resolve 全 fail($rf/$rt)而候選 yt-dlp $idle 新過現役 $act"
  if run swap-ytdlp; then
    echo "VERDICT: fixed-pending-verify"; echo "REASON: rules: $reason → 已 swap-ytdlp,下一 tick 重驗"; echo "ACTIONS: swap-ytdlp"
  else
    echo "VERDICT: escalate"; echo "REASON: rules: $reason → swap-ytdlp 失敗/被拒"; echo "ACTIONS: swap-ytdlp(failed)"
  fi
elif [[ -n "$r403" ]] && awk -v a="$r403" -v b="$HIGH" 'BEGIN{exit !(a+0>=b+0)}'; then
  run wait
  echo "VERDICT: wait"; echo "REASON: rules: 403 率 ${r403}% >= ${HIGH}%,判為 googlevideo 上游暫時性,下一 tick 重驗"; echo "ACTIONS: wait"
else
  echo "VERDICT: escalate"; echo "REASON: rules: 唔符合任何自動修復規則(pid=${pid:-none} health=${health:-?} resolve=$rf/$rt 403=${r403:-n/a}%)"; echo "ACTIONS: none"
fi
