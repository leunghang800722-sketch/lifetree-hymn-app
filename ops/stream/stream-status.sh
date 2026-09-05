#!/usr/bin/env bash
# ops/stream/stream-status.sh — 一行 JSON 現況,俾 Dispatch 排程 check-in 用
# (STREAM-SELFHEAL-PLAN-20260905 S3)。
#
# 合併三樣嘢:
#   · backend/data/stream-health-state.json(stream-healthcheck.sh 寫,env
#     HEALTH_STATE 可 override)—— consecutiveFail / lastCheck / ok / mid
#   · backend/data/stream-selfheal-state.json(stream-selfheal.sh 寫,env
#     SELFHEAL_STATE 可 override)—— alert{active,since,form,message} /
#     lastAction / swapsToday / restartsToday
#   · 現役 yt-dlp 版本(readlink backend/tools/yt-dlp,env YTDLP_LINK 可 override)
#   · backend pid(pgrep -f "node.*server.js",env BACKEND_PID_PATTERN 可 override)
#
# 印一行 JSON 落 stdout:
#   {"healthy":bool,"stale":bool,"consecutiveFail":n,"lastCheck":"…",
#    "ageMin":n,"form":"…","alert":{...},"lastAction":"…","ytdlp":"…",
#    "backendPid":n|null,"needsHuman":bool,"summary":"一句人話"}
#
# exit code:
#   0 = 健康(consecutiveFail==0 而且冇 active alert)
#   1 = 唔健康 / alert.active(但偵測本身仲生存)
#   2 = stale —— lastCheck 超過 $STALE_MIN 分鐘(預設 90)= 偵測本身都死咗,
#       呢個要通知,唔可以同「健康」撈埋一齊睇
#
# needsHuman = alert.active(即係③形態 / 安全閥觸頂 / gate 唔過 / 重開完都未
# 確認好返)或者 stale。
#
# 手動試: ops/stream/stream-status.sh
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

HEALTH_STATE="${HEALTH_STATE:-$REPO/backend/data/stream-health-state.json}"
SELFHEAL_STATE="${SELFHEAL_STATE:-$REPO/backend/data/stream-selfheal-state.json}"
YTDLP_LINK="${YTDLP_LINK:-$REPO/backend/tools/yt-dlp}"
BACKEND_PID_PATTERN="${BACKEND_PID_PATTERN:-node.*server\.js}"
STALE_MIN="${STALE_MIN:-90}"

ytver="$("$YTDLP_LINK" --version 2>/dev/null | tr -d '\n')"
[[ -z "$ytver" ]] && ytver="?"
backend_pid="$(pgrep -f "$BACKEND_PID_PATTERN" 2>/dev/null | head -1)"
[[ -z "${backend_pid:-}" ]] && backend_pid=""

python3 - "$HEALTH_STATE" "$SELFHEAL_STATE" "$ytver" "$backend_pid" "$STALE_MIN" <<'PY'
import json, sys, datetime

health_path, selfheal_path, ytver, backend_pid, stale_min = sys.argv[1:6]
stale_min = int(stale_min)

def load(path):
    try:
        with open(path) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

health = load(health_path)
selfheal = load(selfheal_path)

consecutiveFail = int(health.get("consecutiveFail", 0) or 0)
lastCheck = health.get("lastCheck", "") or ""
ok = health.get("ok")
mid = health.get("mid")

ageMin = None
if lastCheck:
    try:
        dt = datetime.datetime.fromisoformat(lastCheck)
        ageMin = int((datetime.datetime.now() - dt).total_seconds() // 60)
    except Exception:
        ageMin = None

stale = (ageMin is None) or (ageMin > stale_min)

alert = selfheal.get("alert") or {}
alert_active = bool(alert.get("active", False))
alert_since = alert.get("since", "") or ""
alert_form = alert.get("form", "") or ""
alert_message = alert.get("message", "") or ""
lastAction = selfheal.get("lastAction", "none") or "none"
swapsToday = selfheal.get("swapsToday", 0)
restartsToday = selfheal.get("restartsToday", 0)

healthy = (consecutiveFail == 0) and (not alert_active) and (not stale)
needsHuman = alert_active or stale

if stale:
    summary = f"偵測本身可能死咗:lastCheck 已經 {ageMin if ageMin is not None else '?'} 分鐘冇更新(門檻 {stale_min})"
    exit_code = 2
elif healthy:
    summary = f"健康:consecutiveFail=0,ok={ok},mid={mid},yt-dlp={ytver}"
    exit_code = 0
else:
    if alert_active:
        summary = f"唔健康,形態{alert_form or '?'}:{alert_message[:120]}"
    else:
        summary = f"唔健康但仲未觸發 alert(consecutiveFail={consecutiveFail})"
    exit_code = 1

out = {
    "healthy": healthy,
    "stale": stale,
    "consecutiveFail": consecutiveFail,
    "lastCheck": lastCheck,
    "ageMin": ageMin,
    "form": alert_form,
    "alert": {
        "active": alert_active,
        "since": alert_since,
        "message": alert_message,
    },
    "lastAction": lastAction,
    "swapsToday": swapsToday,
    "restartsToday": restartsToday,
    "ytdlp": ytver,
    "backendPid": (int(backend_pid) if backend_pid.strip().isdigit() else None),
    "needsHuman": needsHuman,
    "summary": summary,
}
print(json.dumps(out, ensure_ascii=False))
sys.exit(exit_code)
PY
exit $?
