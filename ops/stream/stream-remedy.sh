#!/usr/bin/env bash
# ops/stream/stream-remedy.sh <action> — 串流事故「修復動作」唯一入口(STREAM-WATCH-EXEC-20260929 §1.3)
#
# AI(headless claude)同規則診斷共用。AI 冇自由 shell,只准 call 呢支 script;
# 每個動作嘅配額/節流/gate 都喺呢度,AI 只係「揀邊個動作」。
#
# 動作(其他一律 exit 2):
#   status                 重跑 stream-status.sh
#   probe <hymnId>         經 localhost 打 /api/stream/<id> Range 0-1MB + 1MB-2MB,回 status/ttfb(唔落檔;每 incident ≤6)
#   swap-ytdlp             行 selfheal 用緊嘅同一個 apply 指令(每日 ≤1;連 selfheal 合共 ≤2)
#   restart-backend        ops/deploy/backend-restart.sh --same-code(每日 ≤1;連 selfheal 合共 ≤3;gate 唔過唔重試)
#   wait                   乜都唔做,記「判為上游暫時性,下一 tick 重驗」
#   escalate "<reason>"    即刻升級(寫 escalate.request,stream-watch.sh 下次讀到即刻寫警報+通知)
#
# ⚠️ 冇 `bust-resolve-cache`:resolveAudio.js 嘅 bustCache() 只係 process 內部函數,冇 admin/內部
#    HTTP 入口;刪 backend/cache/resolve-cache.json 冇用(記憶體 Map 仍在,而且下次 flush 寫返)。
#    冇安全入口 = 唔做(見 STREAM-WATCH-REPORT-20260929.md)。
#
# exit: 0 成功 / 1 動作失敗 / 2 拒絕(未知 action、參數唔啱) / 3 配額用晒
# REMEDY_DRY_RUN=1:全部側效應歸零(唔 call apply/restart、唔寫 state/request、唔 curl 落 backend)。
#
# env override(測試用):REMEDY_STATE REMEDY_LOG WATCH_DIR WATCH_STATE SELFHEAL_STATE
#   SELFHEAL_APPLY_CMD SELFHEAL_RESTART_CMD REMEDY_STATUS_CMD HYMN_STREAM_BASE REMEDY_INCIDENT REMEDY_ENGINE
#   REMEDY_LIMIT_{PROBE,SWAP,RESTART} REMEDY_TOTAL_{SWAP,RESTART}
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$REPO/ops/stream/stream-watch-lib.sh"

DRY="${REMEDY_DRY_RUN:-0}"
ENGINE="${REMEDY_ENGINE:-manual}"
STATE="${REMEDY_STATE:-$WATCH_DIR/stream-remedy-state.json}"
LOG="${REMEDY_LOG:-$WATCH_DIR/stream-remedy.log}"
WATCH_STATE="${WATCH_STATE:-$WATCH_DIR/stream-watch-state.json}"
SELFHEAL_STATE="${SELFHEAL_STATE:-$REPO/backend/data/stream-selfheal-state.json}"
APPLY_CMD="${SELFHEAL_APPLY_CMD:-$REPO/ops/ytdlp/update-ytdlp.sh --apply}"
RESTART_CMD="${SELFHEAL_RESTART_CMD:-$REPO/ops/deploy/backend-restart.sh --same-code}"
STATUS_CMD="${REMEDY_STATUS_CMD:-$REPO/ops/stream/stream-status.sh}"
BASE="${HYMN_STREAM_BASE:-http://127.0.0.1:3001}"
REQ_FILE="${WATCH_DIR}/stream-escalate.request"

INCIDENT="${REMEDY_INCIDENT:-}"
if [[ -z "$INCIDENT" ]]; then
  INCIDENT="$(python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1])).get('incidentId') or 'none')
except Exception: print('none')" "$WATCH_STATE" 2>/dev/null)"
fi
INCIDENT="$(printf '%s' "$INCIDENT" | tr -cd 'A-Za-z0-9_-' | cut -c1-40)"; [[ -z "$INCIDENT" ]] && INCIDENT=none

action="${1:-}"; nargs=$#

log_line() { # $1=result
  [[ "$DRY" == "1" && -z "${REMEDY_LOG:-}" ]] && return 0
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s | engine=%s | incident=%s | %s%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$ENGINE" "$INCIDENT" \
    "$([[ "$DRY" == "1" ]] && echo '[DRY] ')" "${ACTION_DESC:-$action}" "$1" >> "$LOG" 2>/dev/null
  return 0
}
reject() { echo "REJECTED: $1" >&2; ACTION_DESC="${action:0:40}"; log_line "rejected: $1"; exit 2; }

# 配額 check+consume。輸出 "OK" 或 "DENY <原因>"
quota() { # $1=kind(probe|swap|restart)
  python3 - "$STATE" "$1" "$INCIDENT" "$SELFHEAL_STATE" "$DRY" \
    "${REMEDY_LIMIT_PROBE:-6}" "${REMEDY_LIMIT_SWAP:-1}" "${REMEDY_LIMIT_RESTART:-1}" \
    "${REMEDY_TOTAL_SWAP:-2}" "${REMEDY_TOTAL_RESTART:-3}" <<'PY'
import json, sys, datetime
path, kind, inc, shpath, dry, lp, ls_, lr, ts_, tr = sys.argv[1:11]
lp, ls_, lr, ts_, tr = map(int, (lp, ls_, lr, ts_, tr))
today = datetime.date.today().isoformat()
def load(p):
    try:
        d = json.load(open(p)); return d if isinstance(d, dict) else {}
    except Exception: return {}
st = load(path)
if st.get('date') != today:
    st = {'date': today, 'swaps': 0, 'restarts': 0, 'probes': st.get('probes', {})}
st.setdefault('swaps', 0); st.setdefault('restarts', 0); st.setdefault('probes', {})
sh = load(shpath)
sh_swaps = sh.get('swapsToday', 0) if sh.get('date') == today else 0
sh_restarts = sh.get('restartsToday', 0) if sh.get('date') == today else 0
deny = None
if kind == 'probe':
    n = st['probes'].get(inc, 0)
    if n >= lp: deny = f"probe 已用 {n}/{lp}(每 incident)"
    else: st['probes'][inc] = n + 1
elif kind == 'swap':
    if st['swaps'] >= ls_: deny = f"swap-ytdlp 今日已用 {st['swaps']}/{ls_}"
    elif st['swaps'] + int(sh_swaps) >= ts_: deny = f"swap-ytdlp 合共(含 selfheal {sh_swaps})今日已到 {ts_}"
    else: st['swaps'] += 1
elif kind == 'restart':
    if st['restarts'] >= lr: deny = f"restart-backend 今日已用 {st['restarts']}/{lr}"
    elif st['restarts'] + int(sh_restarts) >= tr: deny = f"restart-backend 合共(含 selfheal {sh_restarts})今日已到 {tr}"
    else: st['restarts'] += 1
if deny:
    print("DENY " + deny)
else:
    if dry != '1':
        try: json.dump(st, open(path, 'w'), indent=1)
        except Exception as e: print("DENY 寫唔到 state: " + str(e)); sys.exit(0)
    print("OK")
PY
}

case "$action" in
  status)
    [[ $nargs -eq 1 ]] || reject "status 唔收參數"
    ACTION_DESC="status"; out="$($STATUS_CMD 2>&1)"; rc=$?
    echo "$out" | wlib_filter; log_line "exit=$rc"; exit 0 ;;
  probe)
    [[ $nargs -eq 2 ]] || reject "probe 要一個 hymnId"
    [[ "$2" =~ ^[0-9]{1,7}$ ]] || reject "hymnId 必須係純數字"
    ACTION_DESC="probe $2"
    q="$(quota probe)"
    if [[ "$q" != OK ]]; then echo "QUOTA: ${q#DENY }"; log_line "quota-denied: ${q#DENY }"; exit 3; fi
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會 curl $BASE/api/stream/$2 Range 0-1MB + 1MB-2MB"; log_line "dry-run"; exit 0; fi
    res=""
    for r in 0-1048575 1048576-2097151; do
      o="$(curl -s -o /dev/null --max-time 45 -H "Range: bytes=$r" -w "%{http_code} ttfb=%{time_starttransfer}s" "$BASE/api/stream/$2" 2>/dev/null)"
      res="$res range=$r -> $o;"
    done
    echo "probe id=$2:$res"; log_line "ok:$res"; exit 0 ;;
  swap-ytdlp)
    [[ $nargs -eq 1 ]] || reject "swap-ytdlp 唔收參數"
    ACTION_DESC="swap-ytdlp"
    q="$(quota swap)"
    if [[ "$q" != OK ]]; then echo "QUOTA: ${q#DENY }"; log_line "quota-denied: ${q#DENY }"; exit 3; fi
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會行 $APPLY_CMD"; log_line "dry-run"; exit 0; fi
    out="$(wlib_capped 900 $APPLY_CMD 2>&1)"; rc=$?
    echo "$out" | tail -8 | wlib_filter; echo "swap-ytdlp exit=$rc"
    log_line "exit=$rc"; [[ $rc -eq 0 ]] && exit 0 || exit 1 ;;
  restart-backend)
    [[ $nargs -eq 1 ]] || reject "restart-backend 唔收參數"
    ACTION_DESC="restart-backend"
    q="$(quota restart)"
    if [[ "$q" != OK ]]; then echo "QUOTA: ${q#DENY }"; log_line "quota-denied: ${q#DENY }"; exit 3; fi
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會行 $RESTART_CMD(gate 照行,唔過唔重試)"; log_line "dry-run"; exit 0; fi
    out="$(wlib_capped 300 $RESTART_CMD 2>&1)"; rc=$?
    echo "$out" | tail -8 | wlib_filter; echo "restart-backend exit=$rc"
    if [[ $rc -ne 0 ]] && echo "$out" | grep -q 'abort'; then echo "GATE-BLOCKED: 部署 gate 唔俾過,唔會重試/繞過"; log_line "gate-blocked exit=$rc"; exit 1; fi
    log_line "exit=$rc"; [[ $rc -eq 0 ]] && exit 0 || exit 1 ;;
  wait)
    [[ $nargs -eq 1 ]] || reject "wait 唔收參數"
    ACTION_DESC="wait"; echo "wait: 判為上游暫時性(例如 googlevideo 403 窗),下一 tick 重驗"; log_line "noop"; exit 0 ;;
  escalate)
    [[ $nargs -eq 2 ]] || reject "escalate 要正正一個 reason 參數"
    reason="$(printf '%s' "$2" | tr -d '\n\r' | cut -c1-300 | wlib_filter)"
    ACTION_DESC="escalate"
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會寫 $REQ_FILE reason=$reason"; log_line "dry-run reason=$reason"; exit 0; fi
    mkdir -p "$WATCH_DIR"; printf 'incident=%s\nat=%s\nreason=%s\n' "$INCIDENT" "$(date '+%Y-%m-%d %H:%M:%S')" "$reason" > "$REQ_FILE"
    echo "escalate: 已登記,本次診斷完 stream-watch 即刻寫警報 + 通知"; log_line "requested reason=$reason"; exit 0 ;;
  "") reject "冇 action" ;;
  *) reject "未知 action" ;;
esac
