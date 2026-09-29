#!/usr/bin/env bash
# ops/stream/stream-remedy.sh <action> — 串流事故「修復動作」唯一入口(STREAM-WATCH-EXEC-20260929 §1.3)
#
# AI(headless claude)同規則診斷共用。AI 冇自由 shell,只准 call 呢支 script;
# 每個動作嘅配額/節流/gate 都喺呢度,AI 只係「揀邊個動作」。
#
# 動作(其他一律 exit 2):
#   status                 重跑 stream-status.sh
#   probe <hymnId>         經 localhost 打 /api/stream/<id> Range 0-1MB + 1MB-2MB,回 status/ttfb(唔落檔;每 incident ≤6)
#   swap-ytdlp             行 selfheal 用緊嘅同一個 apply 指令 + 換咗即重驗 Layer B + 唔過 rollback(每日 ≤1;selfheal 今日換過就唔准)
#   restart-backend        ops/deploy/backend-restart.sh --same-code(每日 ≤1;連 selfheal 合共 ≤3;gate 唔過唔重試)
#   wait                   乜都唔做,記「判為上游暫時性,下一 tick 重驗」
#   escalate "<reason>"    即刻升級(寫 escalate.request,stream-watch.sh 下次讀到即刻寫警報+通知)
#
# ⚠️ 冇 `bust-resolve-cache`:resolveAudio.js 嘅 bustCache() 只係 process 內部函數,冇 admin/內部
#    HTTP 入口;刪 backend/cache/resolve-cache.json 冇用(記憶體 Map 仍在,而且下次 flush 寫返)。
#    冇安全入口 = 唔做(見 STREAM-WATCH-REPORT-20260929.md)。
#
# exit: 0 成功 / 1 動作失敗 / 2 拒絕(未知 action、參數唔啱) / 3 配額用晒 / 4 precondition-failed(node/python3 缺,冇試過)
# REMEDY_DRY_RUN=1:全部側效應歸零(唔 call apply/restart、唔寫 state/request、唔 curl 落 backend)。
#   prod 同測試模式都認(只收字面 1);配額檢查行先,配額用晒會回 exit 3 而唔係 DRY-RUN 輸出。
#
# env override(測試用):REMEDY_STATE REMEDY_LOG WATCH_DIR WATCH_STATE SELFHEAL_STATE
#   SELFHEAL_APPLY_CMD SELFHEAL_RESTART_CMD REMEDY_STATUS_CMD HYMN_STREAM_BASE REMEDY_INCIDENT REMEDY_ENGINE
#   REMEDY_LIMIT_{PROBE,SWAP,RESTART} REMEDY_TOTAL_{SWAP,RESTART}
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# M5:危險 env 入口一律忽略/重設。AI(或任何 caller)喺命令前面加 `REMEDY_STATE=/tmp/x ...`、
# `SELFHEAL_RESTART_CMD=... ...` 都冇用——只有 STREAM_WATCH_TEST=1 **而且** REMEDY_STATE 喺 tmp 目錄下
# (冇 `..`)先認呢批 override(測試用)。REMEDY_ENGINE / REMEDY_INCIDENT 只係標籤,照收(唔係攻擊面)。
_sw_tmpok() { case "$1" in *..*) return 1 ;; /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) return 0 ;; esac; return 1; }
if [[ "${STREAM_WATCH_TEST:-0}" == "1" ]] && _sw_tmpok "${REMEDY_STATE:-}"; then
  TESTMODE=1
else
  TESTMODE=0
  # N2(Opus 第二輪):REMEDY_DRY_RUN 只會令動作「少做」,唔係攻擊面——prod 模式照認,
  # 唔准靜靜忽略變真 restart。只收字面 "1"。
  _sw_dry=0; [[ "${REMEDY_DRY_RUN:-0}" == "1" ]] && _sw_dry=1
  unset REMEDY_STATE REMEDY_LOG REMEDY_DRY_RUN SELFHEAL_STATE SELFHEAL_APPLY_CMD SELFHEAL_RESTART_CMD \
        REMEDY_STATUS_CMD REMEDY_VERIFY_CMD REMEDY_NODE_BIN WATCH_DIR WATCH_STATE HYMN_STREAM_BASE YTDLP_LINK \
        REMEDY_LIMIT_PROBE REMEDY_LIMIT_SWAP REMEDY_LIMIT_RESTART REMEDY_TOTAL_SWAP REMEDY_TOTAL_RESTART \
        SELFHEAL_YT_IDS SELFHEAL_MID_RANGE SELFHEAL_RESOLVE_TIMEOUT SELFHEAL_CURL_TIMEOUT
  [[ $_sw_dry -eq 1 ]] && REMEDY_DRY_RUN=1
fi
. "$REPO/ops/stream/stream-watch-lib.sh"

DRY="${REMEDY_DRY_RUN:-0}"
ENGINE="${REMEDY_ENGINE:-manual}"
STATE="${REMEDY_STATE:-$WATCH_DIR/stream-remedy-state.json}"
LOG="${REMEDY_LOG:-$WATCH_DIR/stream-remedy.log}"
WATCH_STATE="${WATCH_STATE:-$WATCH_DIR/stream-watch-state.json}"
SELFHEAL_STATE="${SELFHEAL_STATE:-$REPO/backend/data/stream-selfheal-state.json}"
APPLY_DEFAULT=1; [[ -n "${SELFHEAL_APPLY_CMD:-}" ]] && APPLY_DEFAULT=0
RESTART_DEFAULT=1; [[ -n "${SELFHEAL_RESTART_CMD:-}" ]] && RESTART_DEFAULT=0
APPLY_CMD="${SELFHEAL_APPLY_CMD:-$REPO/ops/ytdlp/update-ytdlp.sh --apply}"
RESTART_CMD="${SELFHEAL_RESTART_CMD:-$REPO/ops/deploy/backend-restart.sh --same-code}"
# 測試模式 + 預設指令:永遠唔會真 restart/swap(restart 加 --dry-run;swap 直接唔行)
if [[ $TESTMODE -eq 1 && $RESTART_DEFAULT -eq 1 ]]; then RESTART_CMD="$RESTART_CMD --dry-run"; fi
STATUS_CMD="${REMEDY_STATUS_CMD:-$REPO/ops/stream/stream-status.sh}"
BASE="${HYMN_STREAM_BASE:-http://127.0.0.1:3001}"
REQ_FILE="${WATCH_DIR}/stream-escalate.request"
YTDLP_LINK="${YTDLP_LINK:-$REPO/backend/tools/yt-dlp}"
YTDLP_DIR="$(dirname "$YTDLP_LINK")"
YT_IDS=(${SELFHEAL_YT_IDS:-PG_J_0gsMXA 7UkwavM5L1E 2GbxXhvdhhA})
MID_RANGE="${SELFHEAL_MID_RANGE:-2097152-2162687}"
NODE_BIN="${REMEDY_NODE_BIN:-node}"
# L5:動作上限 < 診斷上限(DIAG_TIMEOUT 預設 600):restart 240 / swap(apply 240 + verify 240)
CAP_RESTART=240; CAP_APPLY=240; CAP_VERIFY=240

INCIDENT="${REMEDY_INCIDENT:-}"
if [[ -z "$INCIDENT" ]]; then
  INCIDENT="$(python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1])).get('incidentId') or 'none')
except Exception: print('none')" "$WATCH_STATE" 2>/dev/null)"
fi
INCIDENT="$(printf '%s' "$INCIDENT" | tr -cd 'A-Za-z0-9_-' | cut -c1-40)"; [[ -z "$INCIDENT" ]] && INCIDENT=none

action="${1:-}"; nargs=$#

san() { printf '%s' "$1" | tr -d '\000-\037\177' | cut -c1-200; }   # L2:strip 控制字元/換行、截 200 字
log_line() { # $1=result
  [[ "$DRY" == "1" && -z "${REMEDY_LOG:-}" ]] && return 0
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s | engine=%s | incident=%s | %s%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(san "$ENGINE" | cut -c1-20)" "$INCIDENT" \
    "$([[ "$DRY" == "1" ]] && echo '[DRY] ')" "$(san "${ACTION_DESC:-$action}")" "$(san "$1")" >> "$LOG" 2>/dev/null
  return 0
}
reject() { echo "REJECTED: $(san "$1")" >&2; ACTION_DESC="${action:0:40}"; log_line "rejected: $1"; exit 2; }

# 配額 check+consume(L6:flock 防 race;合共配額讀 selfheal state 當日計數)。輸出 "OK" 或 "DENY <原因>"
# 預設:swap 每日 remedy ≤1 且「remedy+selfheal 合共 <1」(即 selfheal 今日換過就唔准再換,避免 slot 來回揈);
#       restart 每日 remedy ≤1、合共 ≤3(selfheal 上限 2)。
quota() { # $1=kind(probe|swap|restart)
  python3 - "$STATE" "$1" "$INCIDENT" "$SELFHEAL_STATE" "$DRY" \
    "${REMEDY_LIMIT_PROBE:-6}" "${REMEDY_LIMIT_SWAP:-1}" "${REMEDY_LIMIT_RESTART:-1}" \
    "${REMEDY_TOTAL_SWAP:-1}" "${REMEDY_TOTAL_RESTART:-3}" <<'PY'
import json, sys, datetime, fcntl, os
path, kind, inc, shpath, dry, lp, ls_, lr, ts_, tr = sys.argv[1:11]
lp, ls_, lr, ts_, tr = map(int, (lp, ls_, lr, ts_, tr))
today = datetime.date.today().isoformat()
def load(p):
    try:
        d = json.load(open(p)); return d if isinstance(d, dict) else {}
    except Exception: return {}
lockf = None
if dry != '1':
    try:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        lockf = open(path + '.lock', 'w'); fcntl.flock(lockf, fcntl.LOCK_EX)
    except Exception as e:
        print("DENY 攞唔到 quota lock: " + str(e)); sys.exit(0)
st = load(path)
if st.get('date') != today:
    st = {'date': today, 'swaps': 0, 'restarts': 0, 'probes': {}}
st.setdefault('swaps', 0); st.setdefault('restarts', 0); st.setdefault('probes', {})
st['probes'] = {k: v for k, v in st['probes'].items() if k == inc}   # 只留當前 incident,唔會無限增長
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
    elif st['swaps'] + int(sh_swaps) >= ts_: deny = f"swap-ytdlp 合共(remedy {st['swaps']} + selfheal {sh_swaps})今日已到上限 {ts_}"
    else: st['swaps'] += 1
elif kind == 'restart':
    if st['restarts'] >= lr: deny = f"restart-backend 今日已用 {st['restarts']}/{lr}"
    elif st['restarts'] + int(sh_restarts) >= tr: deny = f"restart-backend 合共(remedy {st['restarts']} + selfheal {sh_restarts})今日已到上限 {tr}"
    else: st['restarts'] += 1
if deny:
    print("DENY " + deny)
else:
    if dry != '1':
        try:
            json.dump(st, open(path + '.tmp', 'w'), indent=1); os.replace(path + '.tmp', path)
        except Exception as e: print("DENY 寫唔到 state: " + str(e)); sys.exit(0)
    print("OK")
PY
}

# swap 後重驗(Layer B:直打 googlevideo,同 selfheal verify_layer_b 同一做法);>=2 首 mid-range 206 算過。
# REMEDY_VERIFY_CMD(只測試模式)可換做 stub:exit 0=過。
verify_swap() {
  if [[ -n "${REMEDY_VERIFY_CMD:-}" ]]; then wlib_capped_pg "$CAP_VERIFY" $REMEDY_VERIFY_CMD >/dev/null 2>&1; return $?; fi
  local m=0 yid url code
  for yid in "${YT_IDS[@]}"; do
    url="$(wlib_capped_pg 45 "$YTDLP_LINK" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-playlist "https://www.youtube.com/watch?v=$yid" 2>/dev/null | head -1)"
    [[ "$url" == http* ]] || continue
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 45 -r "$MID_RANGE" "$url" 2>/dev/null)"
    [[ "$code" == "206" ]] && m=$((m+1))
  done
  echo "verify Layer B mid ok=$m/${#YT_IDS[@]}" >&2
  [[ $m -ge 2 ]]
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
    if ! command -v python3 >/dev/null 2>&1; then echo "precondition-failed: python3 唔喺 PATH($PATH)"; log_line "precondition-failed: python3 not found"; exit 4; fi
    q="$(quota swap)"
    if [[ "$q" != OK ]]; then echo "QUOTA: ${q#DENY }"; log_line "quota-denied: ${q#DENY }"; exit 3; fi
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會行 $APPLY_CMD,換咗即重驗 Layer B,唔過 rollback"; log_line "dry-run"; exit 0; fi
    if [[ $TESTMODE -eq 1 && $APPLY_DEFAULT -eq 1 ]]; then echo "TEST-MODE: 預設 apply 指令唔會真行"; log_line "test-mode-skip"; exit 0; fi
    before="$(readlink "$YTDLP_LINK" 2>/dev/null || true)"
    echo "run: $APPLY_CMD"
    out="$(wlib_capped_pg "$CAP_APPLY" $APPLY_CMD 2>&1)"; rc=$?
    echo "$out" | tail -8 | wlib_filter
    after="$(readlink "$YTDLP_LINK" 2>/dev/null || true)"
    if [[ -z "$after" || "$after" == "$before" ]]; then
      echo "swap-ytdlp: 冇候選版本可換(apply exit=$rc,symlink 冇變:$before)"; log_line "no-candidate apply-exit=$rc"; exit 1
    fi
    if verify_swap; then
      echo "swap-ytdlp: $before -> $after,重驗 Layer B 過"; log_line "exit=0 swapped $before -> $after verified"; exit 0
    fi
    if [[ -n "$before" && -x "$YTDLP_DIR/$before" ]]; then
      ln -sfn "$before" "$YTDLP_LINK" 2>/dev/null; note="已 rollback 返 $before"
    else
      note="rollback guard 唔過(before='$before' 唔係可執行檔),冇郁 symlink,要人手核實"
    fi
    echo "swap-ytdlp: $before -> $after 但重驗 Layer B 唔過;$note"; log_line "exit=1 swap-verify-failed $note"; exit 1 ;;
  restart-backend)
    [[ $nargs -eq 1 ]] || reject "restart-backend 唔收參數"
    ACTION_DESC="restart-backend"
    # H1:動作前預檢 node。缺 = precondition-failed,唔消耗配額、唔當試過
    if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
      echo "precondition-failed: 搵唔到 $NODE_BIN(PATH=$PATH);未有試過 restart,配額冇消耗"; log_line "precondition-failed: $NODE_BIN not found"; exit 4
    fi
    q="$(quota restart)"
    if [[ "$q" != OK ]]; then echo "QUOTA: ${q#DENY }"; log_line "quota-denied: ${q#DENY }"; exit 3; fi
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會行 $RESTART_CMD(gate 照行,唔過唔重試)"; log_line "dry-run"; exit 0; fi
    echo "run: $RESTART_CMD"
    out="$(wlib_capped_pg "$CAP_RESTART" $RESTART_CMD 2>&1)"; rc=$?
    echo "$out" | tail -8 | wlib_filter; echo "restart-backend exit=$rc"
    if [[ $rc -ne 0 ]] && echo "$out" | grep -q 'abort'; then echo "GATE-BLOCKED: 部署 gate 唔俾過,唔會重試/繞過"; log_line "gate-blocked exit=$rc"; exit 1; fi
    log_line "exit=$rc"; [[ $rc -eq 0 ]] && exit 0 || exit 1 ;;
  wait)
    [[ $nargs -eq 1 ]] || reject "wait 唔收參數"
    ACTION_DESC="wait"; echo "wait: 判為上游暫時性(例如 googlevideo 403 窗),下一 tick 重驗"; log_line "noop"; exit 0 ;;
  escalate)
    [[ $nargs -eq 2 ]] || reject "escalate 要正正一個 reason 參數"
    reason="$(printf '%s' "$2" | tr -d '\000-\037\177' | cut -c1-300 | wlib_filter)"
    ACTION_DESC="escalate"
    if [[ "$DRY" == "1" ]]; then echo "DRY-RUN: 會寫 $REQ_FILE reason=$reason"; log_line "dry-run reason=$reason"; exit 0; fi
    mkdir -p "$WATCH_DIR"; printf 'incident=%s\nat=%s\nreason=%s\n' "$INCIDENT" "$(date '+%Y-%m-%d %H:%M:%S')" "$reason" > "$REQ_FILE"
    echo "escalate: 已登記,本次診斷完 stream-watch 即刻寫警報 + 通知"; log_line "requested reason=$reason"; exit 0 ;;
  "") reject "冇 action" ;;
  *) reject "未知 action" ;;
esac
