#!/usr/bin/env bash
# ops/stream/stream-watch.sh — 串流保護監察(邊緣觸發;STREAM-WATCH-EXEC-20260929 §1.1)
#
# 由 ops/lyrics/stream-healthcheck.sh 每 tick 尾(selfheal 之後)呼叫(有 ~/.hymn-deploy/stream-watch.on 先接線)。
# 日常(ok→ok):零 Claude session、零通知、零寫檔(淨係 touch state 檔 mtime)。
#
# 狀態機:
#   ok→ok    乜都唔做
#   ok→bad   記 incidentId + badTicks=1(唔煩人;selfheal 自己要連續 2 tick 先郁手)
#   bad→bad  badTicks>=2(或 needsHuman 首次變 true)→ 自動診斷,每宗 incident 最多一次;
#            診斷後 verdict=escalate / remedy 登記 escalate → 即刻升級;否則診斷後再過 >=2 個 bad tick 仍未好 → 升級
#            已升級:警報檔更新 lastSeen;每 6 小時重發一次 macOS 通知
#   bad→ok   有診斷過/升級過先寫恢復行落 SUPERVISION-LOG(單 tick blip 靜靜哋過);刪警報檔;只有升級過先發「已恢復」通知
# 升級 = 寫 ~/.hymn-deploy/STREAM-ALERT.md + SUPERVISION-LOG 🔴 行 + macOS 通知(通知唔出到都仲有前兩樣)。
#
# 停用:touch ~/.hymn-deploy/stream-watch.off(成層停)。AI 診斷**預設關**:要 stream-watch.ai-on 存在先行
#   headless claude(由 stream-diagnose.sh 判斷);stream-watch.no-ai 兼容保留(優先於 ai-on,即強制規則診斷)。
# M1:所有 state 讀寫都喺 lock 內;攞唔到 lock = 成個 tick 零寫(連 status 都唔行)。
# 已知限制(L3,Eric 已拍板唔要 dead-man):watch 掛喺 healthcheck 尾,healthcheck 自己死咗/唔行,watch 都唔會行;
#   `stale` 觸發喺 healthcheck 內結構上幾乎唔會 fire。偵測本身死咗,呢層唔會知。
# env override(測試):WATCH_DIR WATCH_STATE WATCH_STATUS_CMD WATCH_DIAGNOSE_CMD WATCH_NOTIFY_CMD WATCH_LOG_MD
#   WATCH_ALERT_FILE WATCH_NOW(epoch,模擬時間) WATCH_DIAG_TIMEOUT WATCH_RENOTIFY_SEC
# 演習:stream-drill.request → 見 0.5 節;WATCH_DRILL_CMD / WATCH_DRILL_CAP 只係測試 override。
# 任何子步驟失敗一律吞掉,exit 0(唔准影響 healthcheck)。
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$REPO/ops/stream/stream-watch-lib.sh"

STATE="${WATCH_STATE:-$WATCH_DIR/stream-watch-state.json}"
STATUS_CMD="${WATCH_STATUS_CMD:-$REPO/ops/stream/stream-status.sh}"
DIAG_CMD="${WATCH_DIAGNOSE_CMD:-$REPO/ops/stream/stream-diagnose.sh}"
LOG_MD="${WATCH_LOG_MD:-$REPO/docs/SUPERVISION-LOG.md}"
ALERT="${WATCH_ALERT_FILE:-$WATCH_DIR/STREAM-ALERT.md}"
REQ_FILE="$WATCH_DIR/stream-escalate.request"
LOCK="$WATCH_DIR/stream-watch.lock"
DIAG_TIMEOUT="${WATCH_DIAG_TIMEOUT:-600}"
RENOTIFY_SEC="${WATCH_RENOTIFY_SEC:-21600}"
export WATCH_DIR WATCH_STATE="$STATE"

[[ -f "$WATCH_DIR/stream-watch.off" ]] && exit 0
mkdir -p "$WATCH_DIR" 2>/dev/null || exit 0

NOW="$(wlib_now)"

# ── 0. lock(M1:所有 state 讀寫都喺 lock 內;攞唔到 = 零寫)──────────
# stale lock(>20 分鐘)清走
if ! mkdir "$LOCK" 2>/dev/null; then
  age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
  if (( age > 1200 )); then rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" 2>/dev/null || { echo "$(wlib_ts) watch:lock 清唔到,skip"; exit 0; }
  else echo "$(wlib_ts) watch:另一個 tick 仲行緊(lock age=${age}s),skip(零寫)"; exit 0; fi
fi
TMPD="$(mktemp -d "${TMPDIR:-/tmp}/streamwatch.XXXXXX" 2>/dev/null)" || { rmdir "$LOCK" 2>/dev/null; exit 0; }
# STREAM-HARDEN §2.2:合法 caller 憑證。攞到 lock 後寫 .watch-ctx(pid=<本 watch pid> ts=<epoch>,umask 077),
# remedy/diagnose 喺 prod 模式靠佢判斷「喺 watch tick 內」;任何 exit 路徑(包括 TERM/INT/HUP)trap 刪走。kill -9 會殘留,
# 但 pid 死咗 + mtime 30 分鐘期限令佢失效。
CTX="$WATCH_DIR/.watch-ctx"
( umask 077; printf 'pid=%s ts=%s\n' "$$" "$(date +%s)" > "$CTX" ) 2>/dev/null
trap 'rm -rf "$TMPD"; rm -f "$CTX" 2>/dev/null; rmdir "$LOCK" 2>/dev/null' EXIT   # 攞到 lock 先掛,唔會拆人哋嘅 lock
trap 'exit 143' TERM INT HUP

# ── 0.5 演習入口(TOKEN-REVOKE-DRILL-EXEC-20260929 Part B)────────────
# 人手 touch ~/.hymn-deploy/stream-drill.request → 呢個 tick mv 成 inflight → remedy drill-restart(真 --same-code,
# 喺 launchd context)。一次性;結果 append stream-drill.log;演習任何失敗(rc≠0/hang/spawn 失敗)一律吞,唔影響下面狀態機同 exit 0。
# stream-watch.off 已喺頂部 exit,所以 off 時唔行演習。
DRILL_REQ="$WATCH_DIR/stream-drill.request"; DRILL_INFL="$WATCH_DIR/stream-drill.inflight"
if [[ -e "$DRILL_REQ" || -L "$DRILL_REQ" ]]; then
  DRILL_CMD="${WATCH_DRILL_CMD:-$REPO/ops/stream/stream-remedy.sh}"
  # Opus F4:request 唔係普通檔(目錄/symlink/fifo)→ 即刻掉走,唔 mv(mv 目錄會令 inflight 變目錄永遠刪唔走)
  if [[ -L "$DRILL_REQ" || ! -f "$DRILL_REQ" ]]; then
    rm -rf "$DRILL_REQ" 2>/dev/null; echo "$(wlib_ts) watch:演習 request 唔係普通檔,已掉走"
  # Opus F1:mv 保留 mtime,remedy 嘅 10 分鐘期限會由人手 touch 嗰刻起計 → mv 完 touch 一下,期限由呢個 tick 起計
  elif mv -f "$DRILL_REQ" "$DRILL_INFL" 2>/dev/null && touch "$DRILL_INFL" 2>/dev/null; then
    d0=$(date +%s)
    dout="$(REMEDY_ENGINE=drill wlib_capped_pg "${WATCH_DRILL_CAP:-240}" $DRILL_CMD drill-restart 2>&1)"; drc=$?
    dres="$(printf '%s' "$dout" | grep '^DRILL-RESULT ' | tail -1 | tr -d '\000-\037\177' | wlib_filter)"
    [[ -z "$dres" ]] && dres="(冇 DRILL-RESULT)$(printf '%s' "$dout" | tail -2 | tr '\n' ' ' | tr -d '\000-\037\177' | cut -c1-200 | wlib_filter)"
    printf '%s | watch-rc=%s | total=%ss | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$drc" "$(( $(date +%s) - d0 ))" "$dres" >> "$WATCH_DIR/stream-drill.log" 2>/dev/null
    echo "$(wlib_ts) DRILL rc=$drc(詳見 stream-drill.log)"
    rm -f "$DRILL_INFL" 2>/dev/null   # 一次性:萬一 remedy 冇消耗(如 hang 被殺)都唔留低
  else
    echo "$(wlib_ts) watch:演習 request mv 失敗,skip"
  fi
fi

# ── 1. status ────────────────────────────────────────────────────
$STATUS_CMD > "$TMPD/status.json" 2>/dev/null; SRC=$?
head -1 "$TMPD/status.json" > "$TMPD/status1.json"

# python 狀態機:讀 state + status,寫 state,輸出動作字(每行一個)
# L1:讀 state 做型別校驗;壞(JSON 壞/型別錯)→ 備份 .corrupt-<ts> + 重置 + 出 CORRUPT 動作(shell 寫 SUPERVISION-LOG 一行)
decide() { # 用法:decide <mode> [args]  mode=tick|diag|escalated|renotified|get
  python3 - "$STATE" "$NOW" "$RENOTIFY_SEC" "$@" <<'PY'
import json, sys, os, time
path, now, renotify, mode = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
extra = sys.argv[5:]
INT = ('badTicks', 'ticksSinceDiag', 'notifyCount')
BOOL = ('diagnosed', 'escalated', 'prevNeedsHuman')
NUM = ('lastNotifyAt', 'since', 'lastSeen', 'escalatedAt')
STR = ('status', 'incidentId', 'summary', 'verdict', 'diagReason', 'diagActions', 'diagEngine', 'escalateReason', 'escalatedFor')
def validate(d):
    for k in INT:
        if k in d and (not isinstance(d[k], int) or isinstance(d[k], bool)): return '%s 型別錯(%s)' % (k, type(d[k]).__name__)
    for k in BOOL:
        if k in d and not isinstance(d[k], bool): return '%s 型別錯(%s)' % (k, type(d[k]).__name__)
    for k in NUM:
        if k in d and (not isinstance(d[k], (int, float)) or isinstance(d[k], bool)): return '%s 型別錯(%s)' % (k, type(d[k]).__name__)
    for k in STR:
        if k in d and not isinstance(d[k], str): return '%s 型別錯(%s)' % (k, type(d[k]).__name__)
    if d.get('status', 'ok') not in ('ok', 'bad'): return 'status 值唔合法'
    return None
acts = []
def load(p):
    if not os.path.exists(p) or os.path.getsize(p) == 0: return {}
    try:
        d = json.load(open(p))
        if not isinstance(d, dict): raise ValueError('唔係 object')
        bad = validate(d)
        if bad: raise ValueError(bad)
        return d
    except Exception as e:
        bk = '%s.corrupt-%d' % (p, now)
        try: os.replace(p, bk)
        except Exception: bk = '(備份失敗)'
        acts.append('CORRUPT state 壞(%s)已備份 %s 並重置' % (str(e)[:80], os.path.basename(bk)))
        return {}
def main():
    st = load(path)
    st.setdefault('status', 'ok'); st.setdefault('badTicks', 0); st.setdefault('diagnosed', False)
    st.setdefault('ticksSinceDiag', 0); st.setdefault('escalated', False); st.setdefault('notifyCount', 0)
    st.setdefault('lastNotifyAt', 0); st.setdefault('prevNeedsHuman', False); st.setdefault('incidentId', '')
    def save():
        json.dump(st, open(path + '.tmp', 'w'), indent=1); os.replace(path + '.tmp', path)
    if mode == 'tick':
        src = int(extra[0])
        try: s = json.loads(open(extra[1]).read() or '{}')
        except Exception: s = {}
        if not isinstance(s, dict): s = {}
        nh = bool(s.get('needsHuman')); stale = bool(s.get('stale'))
        bad = src != 0 or nh or stale or not s
        st['summary'] = str(s.get('summary') or ('status 讀唔到 exit=%d' % src))[:300]
        st['lastSeen'] = now
        corrupted = any(a.startswith('CORRUPT') for a in acts)
        if not bad:
            if st['status'] == 'bad':
                if st['escalated'] or st['diagnosed']:   # 單 tick blip(冇診斷過)靜靜哋過,唔寫 log
                    acts.append('RECOVER %d %d' % (1 if st['escalated'] else 0, 1 if st['diagnosed'] else 0))
                st.update(status='ok', badTicks=0, diagnosed=False, ticksSinceDiag=0, escalated=False, prevNeedsHuman=False)
                save()
            else:
                if corrupted: acts.append('CLEAR_ALERT'); save()   # state 壞咗重置 + 今次 ok:殘留警報檔要清
                elif os.path.exists(path): os.utime(path, None)     # ok→ok:只 touch
                else: save()
        else:
            if st['status'] == 'ok':
                st.update(status='bad', incidentId=time.strftime('%Y%m%d-%H%M%S', time.localtime(now)), since=now, badTicks=1,
                          diagnosed=False, ticksSinceDiag=0, escalated=False, notifyCount=0, lastNotifyAt=0, verdict='', diagReason='', diagActions='', diagEngine='', escalateReason='')
            else:
                st['badTicks'] += 1
                if st['diagnosed']: st['ticksSinceDiag'] += 1
                if not st['diagnosed'] and (st['badTicks'] >= 2 or (nh and not st['prevNeedsHuman'])):
                    acts.append('DIAGNOSE')
                elif st['diagnosed'] and st['ticksSinceDiag'] >= 2 and not st['escalated']:
                    acts.append('ESCALATE 診斷後已過 %d 個 tick 仍未恢復' % st['ticksSinceDiag'])
                elif st['escalated'] and now - int(st['lastNotifyAt']) >= renotify:
                    acts.append('RENOTIFY')
                if st['escalated']: acts.append('ALERT_REFRESH')
            st['prevNeedsHuman'] = nh
            save()
    elif mode == 'diag':   # extra: verdict engine reason actions(reason/actions 由 caller 先過 wlib_filter)
        st.update(diagnosed=True, ticksSinceDiag=0, verdict=extra[0], diagEngine=extra[1], diagReason=extra[2][:400], diagActions=extra[3][:300])
        save()
    elif mode == 'escalated':   # extra: reason(已過濾)。同一次原子寫入
        first = st.get('escalatedFor') != st['incidentId']
        st.update(escalated=True, lastNotifyAt=now, notifyCount=(1 if first else int(st['notifyCount']) + 1),
                  escalatedAt=(now if first else st.get('escalatedAt', now)), escalatedFor=st['incidentId'],
                  escalateReason=(extra[0] if extra else '')[:300])
        save()
    elif mode == 'renotified':
        st.update(lastNotifyAt=now, notifyCount=int(st['notifyCount']) + 1); save()
    elif mode == 'get':
        print(json.dumps(st, ensure_ascii=False))
try:
    main()
except Exception as e:
    acts.append('ERR decide 例外:%s: %s' % (type(e).__name__, str(e)[:120]))
print("\n".join(acts))
PY
}
getf() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d.get(sys.argv[2],''))" "$STATE" "$1" 2>/dev/null; }

ACTS="$(decide tick "$SRC" "$TMPD/status1.json" 2>"$TMPD/decide.err")" || { echo "$(wlib_ts) watch:decide 失敗:$(head -c 300 "$TMPD/decide.err")"; exit 0; }
[[ -z "$ACTS" ]] && exit 0

# ── 通知 / 警報 / log ───────────────────────────────────────────
notify() { # $1=title $2=message → 印 channel 結果
  local rc
  if [[ -n "${WATCH_NOTIFY_CMD:-}" ]]; then wlib_capped 20 $WATCH_NOTIFY_CMD "$1" "$2" >/dev/null 2>&1; rc=$?
  else wlib_capped 20 osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Basso"' -e 'end run' "$1" "$2" >/dev/null 2>&1; rc=$?; fi
  echo "notify rc=$rc"; return 0
}
sm() { # SUPERVISION-LOG append(pattern 級過濾,🔴 行骨架保留;唔存在就唔寫)
  [[ -d "$(dirname "$LOG_MD")" ]] || return 0
  { echo ""; echo "$1"; } | wlib_filter >> "$LOG_MD" 2>/dev/null; return 0
}
write_alert() {
  local id summ verd reason acts eng
  id="$(getf incidentId)"; summ="$(getf summary)"; verd="$(getf verdict)"; reason="$(getf diagReason)"; acts="$(getf diagActions)"; eng="$(getf diagEngine)"
  local dir="$WATCH_DIR/stream-incident-$id"
  {
    echo "# 🔴 串流監察警報"
    echo
    echo "- incident: \`$id\`(開始 $(date -r "$(getf since)" '+%Y-%m-%d %H:%M' 2>/dev/null))"
    echo "- 升級時間: $(date -r "$(getf escalatedAt)" '+%Y-%m-%d %H:%M' 2>/dev/null)"
    echo "- lastSeen: $(wlib_ts)(仲未恢復)"
    echo "- 狀態摘要: $summ"
    echo "- 診斷引擎: ${eng:-n/a} | verdict: ${verd:-n/a}"
    echo "- 診斷結論: ${reason:-n/a}"
    echo "- 已試動作: ${acts:-none}"
    echo "- 升級原因: $(getf escalateReason)"
    echo
    echo "## 已試動作紀錄(stream-remedy.log,本 incident)"
    echo '```'; grep "incident=$id" "$WATCH_DIR/stream-remedy.log" 2>/dev/null | tail -10; echo '```'
    echo
    echo "## 建議人手下一步"
    echo "1. \`ops/stream/stream-status.sh\` 睇現況;\`tail -40 backend/data/stream-selfheal.log\`"
    echo "2. 睇診斷包:\`$dir/bundle.md\`、\`$dir/diagnosis.md\`"
    echo "3. 按形態:yt-dlp → \`ops/ytdlp/update-ytdlp.sh --apply\`;backend 死 → \`ops/deploy/backend-restart.sh --same-code\`(gate 唔過要 approve);googlevideo 403 窗 → 通常等 1-2 個 tick 自己好"
    echo "4. 恢復後警報檔會自動刪;想手動清 incident:刪 \`$STATE\` 同 \`$ALERT\`"
    echo "- 診斷包路徑: \`$dir/\`"
  } | wlib_filter > "$ALERT.tmp" 2>/dev/null && mv "$ALERT.tmp" "$ALERT" 2>/dev/null
  return 0
}
do_escalate() { # $1=reason(M4:入 state/alert/log 前過同一個 filter;L1:state 寫入原子)
  local reason; reason="$(printf '%s' "$1" | tr -d '\000-\037\177' | wlib_filter)"
  decide escalated "$reason" >/dev/null 2>&1
  write_alert
  local id summ; id="$(getf incidentId)"; summ="$(getf summary)"
  sm "- 🔴 **串流監察升級 $(wlib_ts)** — incident \`$id\`:${reason}。狀態:${summ}。診斷:$(getf diagEngine)/$(getf verdict) — $(getf diagReason)。警報檔 \`$ALERT\`,診斷包 \`$WATCH_DIR/stream-incident-$id/\`。"
  local n; n="$(notify "Odely 串流監察" "串流需要人手:$(printf '%s' "$summ" | tr -d '"\\' | cut -c1-70)(詳見 STREAM-ALERT.md)")"
  echo "$(wlib_ts) ESCALATE incident=$id reason=$reason $n"
}
# L2:stream-escalate.request 要帶 incidentId 而且等於當前 incident,否則掉。印 reason(已過濾)或空。
take_request() {
  [[ -f "$REQ_FILE" ]] || return 0
  local rid cur rsn
  rid="$(grep '^incident=' "$REQ_FILE" | head -1 | cut -c10-60)"; cur="$(getf incidentId)"
  rsn="$(grep '^reason=' "$REQ_FILE" | head -1 | cut -c8-200 | tr -d '\000-\037\177' | wlib_filter)"
  rm -f "$REQ_FILE"
  if [[ -z "$rid" || "$rid" != "$cur" ]]; then echo "$(wlib_ts) watch:掉咗 stale/冇 incidentId 嘅 escalate.request(request incident='${rid:-無}' 當前='$cur')" >&2; return 0; fi
  printf '%s' "${rsn:-(冇 reason)}"
}

# ── 2. 執行動作 ──────────────────────────────────────────────────
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  case "$line" in
    CORRUPT*) echo "$(wlib_ts) watch:${line#CORRUPT }"; sm "- 🟡 **串流監察 state 壞咗 $(wlib_ts)** — ${line#CORRUPT }。" ;;
    CLEAR_ALERT) rm -f "$ALERT"; echo "$(wlib_ts) watch:state 重置後健康,清走殘留警報檔" ;;
    ERR*) echo "$(wlib_ts) watch:${line}" ;;
    DIAGNOSE)
      id="$(getf incidentId)"; echo "$(wlib_ts) DIAGNOSE incident=$id"
      out="$(STREAM_INCIDENT_ID="$id" wlib_capped_pg "$((DIAG_TIMEOUT + 60))" $DIAG_CMD "$id" 2>"$TMPD/diag.err")"; drc=$?
      verd="$(printf '%s' "$out" | grep -E '^VERDICT: (fixed-pending-verify|wait|escalate)[[:space:]]*$' | tail -1 | sed 's/^VERDICT: //; s/[[:space:]]*$//')"
      eng="$(printf '%s' "$out" | grep -E '^engine=' | tail -1 | sed 's/^engine=//' | tr -cd 'A-Za-z0-9_-' | cut -c1-20)"
      reason="$(printf '%s' "$out" | grep -E '^REASON:' | tail -1 | sed 's/^REASON: *//' | wlib_filter)"
      acts="$(printf '%s' "$out" | grep -E '^ACTIONS:' | tail -1 | sed 's/^ACTIONS: *//' | wlib_filter)"
      if [[ -z "$verd" ]]; then verd=escalate; reason="診斷未有結論(exit=$drc,逾時或 script 失敗)"; eng="${eng:-none}"; fi
      decide diag "$verd" "${eng:-?}" "$reason" "$acts" >/dev/null 2>&1
      echo "$(wlib_ts) DIAGNOSED verdict=$verd engine=${eng:-?} actions=$acts"
      esc_reason=""
      [[ "$verd" == escalate ]] && esc_reason="診斷 verdict=escalate:$reason"
      rq="$(take_request)"
      if [[ -n "$rq" ]]; then esc_reason="${esc_reason:-診斷員登記升級}:$rq"; fi
      [[ -n "$esc_reason" ]] && do_escalate "$esc_reason"
      ;;
    ESCALATE*) do_escalate "${line#ESCALATE }" ;;
    RENOTIFY)
      id="$(getf incidentId)"; decide renotified >/dev/null 2>&1
      n="$(notify "Odely 串流監察" "串流仍然需要人手(已 $(( ($(wlib_now) - $(getf escalatedAt)) / 3600 )) 小時):詳見 STREAM-ALERT.md")"
      echo "$(wlib_ts) RENOTIFY incident=$id $n" ;;
    ALERT_REFRESH) rq="$(take_request)"; [[ -n "$rq" ]] && do_escalate "診斷員登記升級:$rq"; write_alert ;;
    RECOVER*)
      set -- $line; esc="$2"; dg="$3"
      id="$(getf incidentId)"
      if [[ "$esc" == 1 ]]; then
        sm "- ✅ **串流監察恢復 $(wlib_ts)** — incident \`$id\` 已恢復(曾升級人手;診斷 $(getf diagEngine)/$(getf verdict);動作 $(getf diagActions))。"
        rm -f "$ALERT" "$REQ_FILE"
        n="$(notify "Odely 串流監察" "串流已恢復(incident $id)")"
        echo "$(wlib_ts) RECOVER(escalated) incident=$id $n"
      else
        sm "- ✅ **串流監察:自動修復成功 $(wlib_ts)** — incident \`$id\` 冇升級就自己好返(診斷 $(getf diagEngine)/$(getf verdict);動作 $(getf diagActions);selfheal 最後動作見 stream-selfheal.log)。"
        rm -f "$ALERT" "$REQ_FILE"
        echo "$(wlib_ts) RECOVER(auto,no notification) incident=$id"
      fi ;;
  esac
done <<< "$ACTS"
exit 0
