#!/usr/bin/env bash
# testlib.sh — ops/stream/test/t*.sh 共用硬防呆(STREAM-HARDEN-EXEC-20260929 §2.3)。
# 用法(每支 t*.sh 開頭第一句,必須 source):  . "$(dirname "$0")/testlib.sh" "$@"     第一個參數 = scratch 目錄
#
# 保證:
#  1. 入口即 export STREAM_WATCH_TEST=1;scratch 目錄必須存在且喺 /tmp|/private/tmp|/var/folders|/private/var/folders 下,否則 exit 2。
#  2. 預設 export WATCH_DIR/REMEDY_STATE/REMEDY_LOG/SELFHEAL_STATE/DIAG_DIR 去 scratch;caller 預先設咗嘅值都要過 tmp 檢查
#     (case 自己稍後覆蓋:用 tl_require_tmp <path> 自檢)。
#  3. prod 快照斷言(最後防線):source 時記 ~/.hymn-deploy 全部檔(路徑+md5)、/tmp/hymn_stream_watch.log 行數、
#     docs/SUPERVISION-LOG.md md5、backend/data/stream-*.json md5;EXIT trap 再比,任何差異 → 印 `PROD-WRITE DETECTED: <檔>` 並 exit 1;
#     冇差異 → 印 `PROD-SNAPSHOT OK`。就算上面全部繞過,寫咗 prod 測試都會即刻紅。
#     (⚠️ 快照睇「內容 md5/行數」唔睇 mtime;真 launchd healthcheck tick(:07/:37)會合法更新 stream-health-state.json 等,
#      跑測試要避開 tick 時間窗,否則可能假紅。)
[[ -n "${_TL_LOADED:-}" ]] && return 0
_TL_LOADED=1
export STREAM_WATCH_TEST=1

tl_tmpok() { case "$1" in *..*) return 1 ;; /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) return 0 ;; esac; return 1; }
tl_require_tmp() { tl_tmpok "$1" || { echo "testlib: 拒絕——'$1' 唔喺 tmp 目錄下(/tmp|/private/tmp|/var/folders|/private/var/folders)" >&2; exit 2; }; }

_TL_S="${1:-}"
if [[ -z "$_TL_S" || ! -d "$_TL_S" ]]; then echo "testlib: 第一個參數必須係已存在嘅 scratch 目錄(收到 '${_TL_S}')" >&2; exit 2; fi
_TL_S="$(cd "$_TL_S" && pwd -P)"; tl_require_tmp "$_TL_S"
export TL_SCRATCH="$_TL_S"

# 自己嘅預設目錄每次 source 都清(否則 state 跨 run 累積:t7 就因為 tl-wd 內 bad tick 累積,第二次跑 watch 真身升到 DIAGNOSE 並經 healthcheck 寫咗 prod watch log)
rm -rf "$_TL_S/tl-wd" "$_TL_S/tl-diag" "$_TL_S/tl-selfheal.json" 2>/dev/null
for _v in WATCH_DIR REMEDY_STATE REMEDY_LOG SELFHEAL_STATE DIAG_DIR; do
  if [[ -n "${!_v:-}" ]]; then tl_require_tmp "${!_v}"; fi
done
export WATCH_DIR="${WATCH_DIR:-$_TL_S/tl-wd}" REMEDY_STATE="${REMEDY_STATE:-$_TL_S/tl-wd/tl-rs.json}" REMEDY_LOG="${REMEDY_LOG:-$_TL_S/tl-wd/tl-remedy.log}" \
       SELFHEAL_STATE="${SELFHEAL_STATE:-$_TL_S/tl-selfheal.json}" DIAG_DIR="${DIAG_DIR:-$_TL_S/tl-diag}"

# ── prod 快照 ──────────────────────────────────────────────────
_TL_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
_TL_USER="$(/usr/bin/id -un)"; _TL_HOME="$(/usr/bin/dscl . -read "/Users/$_TL_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')"
[[ "$_TL_HOME" == /* && -d "$_TL_HOME" ]] || { echo "testlib: 攞唔到真 HOME,唔敢跑" >&2; exit 2; }
_tl_snapshot() {
  local d="$_TL_HOME/.hymn-deploy" f
  echo "## ~/.hymn-deploy(路徑+md5)"
  if [[ -d "$d" ]]; then find "$d" -mindepth 1 | LC_ALL=C sort | while IFS= read -r f; do
      if [[ -f "$f" ]]; then printf '%s  %s\n' "$(/sbin/md5 -q "$f" 2>/dev/null)" "$f"; else printf 'DIR/OTHER  %s\n' "$f"; fi; done
  else echo "(不存在)"; fi
  echo "## /tmp/hymn_stream_watch.log 行數"; wc -l < /tmp/hymn_stream_watch.log 2>/dev/null | tr -d ' ' || echo none
  echo "## docs/SUPERVISION-LOG.md"; /sbin/md5 -q "$_TL_REPO/docs/SUPERVISION-LOG.md" 2>/dev/null || echo none
  echo "## backend/data/stream-*.json"
  for f in "$_TL_REPO"/backend/data/stream-*.json; do [[ -e "$f" ]] && printf '%s  %s\n' "$(/sbin/md5 -q "$f")" "$f"; done
}
_TL_SNAP0="$(_tl_snapshot)"
_tl_exit() {
  local rc=$? snap1 diffs
  trap - EXIT
  snap1="$(_tl_snapshot)"
  if [[ "$snap1" != "$_TL_SNAP0" ]]; then
    diffs="$(diff <(printf '%s\n' "$_TL_SNAP0") <(printf '%s\n' "$snap1") | grep '^[<>]' )"
    echo "PROD-WRITE DETECTED: 測試前後 prod 快照有差異(< 前 / > 後):" >&2
    printf '%s\n' "$diffs" | sed 's/^/PROD-WRITE DETECTED: /' >&2
    exit 1
  fi
  echo "PROD-SNAPSHOT OK"
  exit $rc
}
trap _tl_exit EXIT
