#!/usr/bin/env bash
# T12:prod 模式守衛(STREAM-HARDEN §2.2)——「唔設 env 就冇可能寫 prod」。用法:t12-guard.sh <scratchdir>
#  (i) 半設 env / (j) watch guard / (k) symlink:見下。L4:凡係 prod 模式 + MANUAL 嘅呼叫,一律只喺 scratch 假 repo 副本行。
#  (a)(e)(g) 用真 script、唔設 REMEDY_STATE 等任何 env:證明 REFUSED exit 2 + 零寫入(remedy.log/state md5 不變),testlib 快照做雙保險。
#  (c)(d) 需要「prod 模式 + 可控 .watch-ctx」:用 scratch 假 repo 副本,只 sed 換兩處「真 HOME」取值(remedy 嘅 export HOME、lib 嘅 wlib_real_home)
#  指去 scratch 假 home——守衛邏輯(wlib_prod_guard/wlib_ctx_valid)原封不動。
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t12"; T="$(cd "$(dirname "$0")" && pwd)"; SRC="$T/.."; R="$SRC/stream-remedy.sh"; DG="$SRC/stream-diagnose.sh"
rm -rf "$S"; mkdir -p "$S"
REALHOME="$(/usr/bin/dscl . -read "/Users/$(/usr/bin/id -un)" NFSHomeDirectory | /usr/bin/awk '{print $2}')"
FAILS=0
chk() { # <label> <cond-exit-code: 0=符合預期>
  if [[ "$2" -eq 0 ]]; then echo "  PASS $1"; else echo "  FAIL $1"; FAILS=$((FAILS+1)); fi; }
prodsum() { for f in "$REALHOME"/.hymn-deploy/stream-remedy.log "$REALHOME"/.hymn-deploy/stream-remedy-state.json; do /sbin/md5 -q "$f" 2>/dev/null || echo none; done | tr '\n' ' '; ls -A "$REALHOME/.hymn-deploy" | wc -l | tr -d ' '; }
if [[ -e "$REALHOME/.hymn-deploy/.watch-ctx" ]]; then echo "SKIP (a)(e)(g):真 ~/.hymn-deploy/.watch-ctx 存在(launchd tick 正喺行),唔測以免撞真憑證;稍後重跑"; SKIPREAL=1; else SKIPREAL=0; fi
NOENV=(env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME")   # 完全冇 STREAM_WATCH_TEST/REMEDY_*/WATCH_DIR 等
refused() { # <label> <cmd...> ;期望 exit 2 + stderr 有 REFUSED + prod 摘要不變
  local label="$1"; shift; local before after rc
  before="$(prodsum)"; (cd / && "$@") >"$S/out" 2>"$S/err"; rc=$?; after="$(prodsum)"
  if [[ $rc -eq 2 ]] && grep -q '^REFUSED: prod 模式只准由 stream-watch tick 內呼叫' "$S/err" && [[ "$before" == "$after" ]]; then echo "  PASS $label → exit 2 REFUSED、prod remedy.log/state md5+檔數不變"
  else echo "  FAIL $label rc=$rc err=$(head -c 150 "$S/err") before=[$before] after=[$after]"; FAILS=$((FAILS+1)); fi; }
if [[ $SKIPREAL -eq 0 ]]; then
echo "=== (a) 真 script、冇任何 env、cwd=/ ==="
refused "remedy wait" "${NOENV[@]}" "$R" wait
refused "remedy status" "${NOENV[@]}" "$R" status
refused "remedy restart-backend" "${NOENV[@]}" "$R" restart-backend
refused "remedy swap-ytdlp" "${NOENV[@]}" "$R" swap-ytdlp
refused "diagnose(冇 env,ID=t12ref)" "${NOENV[@]}" "$DG" t12ref
[[ ! -e "$REALHOME/.hymn-deploy/stream-incident-t12ref" ]]; chk "diagnose 冇喺真 ~/.hymn-deploy 建 incident 目錄" $?
echo "=== (e) CLAUDECODE=1、冇 MANUAL(真 script)→ REFUSED ==="
refused "remedy wait + CLAUDECODE=1" "${NOENV[@]}" CLAUDECODE=1 "$R" wait
refused "diagnose + CLAUDECODE=1" "${NOENV[@]}" CLAUDECODE=1 "$DG" t12ref2
echo "=== (g) 重演事故:zsh 唔拆字 env \$E(整串變成一個 env 賦值,STREAM_WATCH_TEST 唔係 \"1\")==="
refused "zsh: E='STREAM_WATCH_TEST=1 REMEDY_STATE=/tmp/x' env \$E remedy wait" /bin/zsh -c "E='STREAM_WATCH_TEST=1 REMEDY_STATE=/tmp/x-t12-should-not-exist REMEDY_LOG=/tmp/x-t12.log'; env \$E '$R' wait"
[[ ! -e /tmp/x-t12-should-not-exist && ! -e /tmp/x-t12.log ]]; chk "/tmp/x-t12* 冇被建" $?
fi
echo "=== 假 repo(prod 模式 + 可控 .watch-ctx)==="
FR="$S/fr"; FH="$S/fh"; mkdir -p "$FR/ops/stream" "$FR/backend/data" "$FH/.hymn-deploy"
cp "$SRC/stream-remedy.sh" "$SRC/stream-diagnose.sh" "$SRC/stream-diagnose-rules.sh" "$SRC/stream-watch-lib.sh" "$FR/ops/stream/"
sed -i '' 's|^  export HOME="\$_sw_home"$|  export HOME="'"$FH"'"|' "$FR/ops/stream/stream-remedy.sh"
sed -i '' 's|^wlib_real_home() {$|wlib_real_home() { printf "%s" "'"$FH"'"; return 0;|' "$FR/ops/stream/stream-watch-lib.sh"
grep -q "export HOME=\"$FH\"" "$FR/ops/stream/stream-remedy.sh"; chk "假 repo 副本已 patch remedy HOME" $?
grep -q "wlib_real_home() { printf" "$FR/ops/stream/stream-watch-lib.sh"; chk "假 repo 副本已 patch lib wlib_real_home" $?
FR_R="$FR/ops/stream/stream-remedy.sh"; FR_D="$FR/ops/stream/stream-diagnose.sh"; CTX="$FH/.hymn-deploy/.watch-ctx"; FLOG="$FH/.hymn-deploy/stream-remedy.log"
FENV=(env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$FH")
fr() { (cd / && "${FENV[@]}" "$@") >"$S/out" 2>"$S/err"; }
# 自己起嘅活 pid(sleep,測試尾巴自己收)
/bin/sleep 120 & LIVE=$!; sleep 0.3; echo "  測試自起 live pid=$LIVE  $(ps -o pid=,ppid=,lstart=,command= -p $LIVE)"
/bin/sleep 0.1 & DEAD=$!; wait $DEAD 2>/dev/null
echo "=== (b) 明示 MANUAL(L4:只喺 scratch 假 repo 副本 + 假 home 行;真 repo 唔准用 prod 模式跑)==="
b1="$(prodsum)"
fr REMEDY_MANUAL=1 REMEDY_DRY_RUN=1 "$FR_R" wait; rc=$?; [[ $rc -eq 0 ]] && grep -q '^wait:' "$S/out"; chk "假 repo:MANUAL 加 DRY wait → 行到(rc=$rc)" $?
fr REMEDY_MANUAL=1 REMEDY_DRY_RUN=1 "$FR_R" restart-backend; rc=$?; [[ ($rc -eq 0 || $rc -eq 3) ]] && ! grep -q REFUSED "$S/err"; chk "假 repo:MANUAL 加 DRY restart-backend → 過守衛(rc=$rc)" $?
[[ ! -e "$FLOG" ]]; chk "(b) 假 home remedy.log 冇被寫(DRY)" $?
echo "=== (f) diagnose 人手模式(假 repo 副本 + 假 home + DRY + 規則 + 預製 bundle/facts)==="
fr DIAG_MANUAL=1 DIAG_DIR="$S/diag-manual" DIAG_FORCE_RULES=1 REMEDY_DRY_RUN=1 DIAG_BUNDLE_FILE="$T/fixtures/bundle-backend-down.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" "$FR_D" t12man
rc=$?; [[ $rc -eq 0 ]] && grep -q '^engine=rules' "$S/out" && ! grep -q REFUSED "$S/err"; chk "假 repo:diagnose 人手 → 行到(rc=$rc)$(grep -E '^(engine|VERDICT|ACTIONS)' "$S/out" | tr '\n' ' ')" $?
[[ "$b1" == "$(prodsum)" ]]; chk "(b)(f) 前後真 prod 摘要不變" $?
echo "=== (c) .watch-ctx 存在但 pid 已死 → REFUSED ==="
printf 'pid=%s ts=%s\n' "$DEAD" "$(date +%s)" > "$CTX"; rm -f "$FLOG"
fr "$FR_R" wait; rc=$?; [[ $rc -eq 2 && ! -e "$FLOG" ]] && grep -q REFUSED "$S/err"; chk "remedy:dead pid → exit 2、零寫入(remedy.log 不存在)rc=$rc" $?
fr "$FR_D" t12c; rc=$?; [[ $rc -eq 2 && ! -e "$FH/.hymn-deploy/stream-incident-t12c" ]]; chk "diagnose:dead pid → exit 2、零寫入 rc=$rc" $?
echo "=== (d) .watch-ctx 存在且 pid 生存(=測試自己嘅 sleep)→ 行到 ==="
printf 'pid=%s ts=%s\n' "$LIVE" "$(date +%s)" > "$CTX"; chmod 600 "$CTX"
fr "$FR_R" wait; rc=$?; [[ $rc -eq 0 && -s "$FLOG" ]]; chk "remedy:live pid → 行到、remedy.log 寫落假 home(rc=$rc)" $?
fr REMEDY_DRY_RUN=1 "$FR_R" wait; rc=$?; [[ $rc -eq 0 ]]; chk "remedy:live pid + dry → 行到 rc=$rc" $?
fr DIAG_DIR="$S/diag-ctx" DIAG_FORCE_RULES=1 REMEDY_DRY_RUN=1 DIAG_BUNDLE_FILE="$T/fixtures/bundle-backend-down.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" "$FR_D" t12d; rc=$?
[[ $rc -eq 0 ]] && grep -q '^engine=rules' "$S/out" && ! grep -q REFUSED "$S/out" "$S/err"; chk "diagnose:live pid → 行到,子 remedy 亦過守衛($(grep '^ACTIONS' "$S/out"))rc=$rc" $?
echo "=== (d2) live pid 但 mtime 31 分鐘前 → REFUSED(期限)==="
touch -t "$(date -v-31M +%Y%m%d%H%M.%S)" "$CTX"; rm -f "$FLOG"
fr "$FR_R" wait; rc=$?; [[ $rc -eq 2 && ! -e "$FLOG" ]]; chk "remedy:過期 ctx → exit 2 rc=$rc" $?
echo "=== (d3) ctx 內容壞 / symlink → REFUSED ==="
printf 'garbage\n' > "$CTX"; fr "$FR_R" wait; rc=$?; [[ $rc -eq 2 ]]; chk "remedy:壞內容 → exit 2" $?
rm -f "$CTX"; printf 'pid=%s ts=1\n' "$LIVE" > "$S/realctx"; ln -s "$S/realctx" "$CTX"; fr "$FR_R" wait; rc=$?; [[ $rc -eq 2 ]]; chk "remedy:ctx 係 symlink → exit 2" $?; rm -f "$CTX"
echo "=== (e2) 有效 ctx + CLAUDECODE=1(冇 MANUAL)→ REFUSED;加 MANUAL=1 → 行到 ==="
printf 'pid=%s ts=%s\n' "$LIVE" "$(date +%s)" > "$CTX"; rm -f "$FLOG"
fr CLAUDECODE=1 "$FR_R" wait; rc=$?; [[ $rc -eq 2 && ! -e "$FLOG" ]]; chk "有效 ctx + CLAUDECODE=1 → exit 2、零寫入 rc=$rc" $?
fr CLAUDECODE=1 REMEDY_MANUAL=1 "$FR_R" wait; rc=$?; [[ $rc -eq 0 ]]; chk "有效 ctx + CLAUDECODE=1 + REMEDY_MANUAL=1 → 行到 rc=$rc" $?
rm -f "$CTX"
echo "=== (h) 測試模式(STREAM_WATCH_TEST=1 + tmp REMEDY_STATE)唔受守衛限制(t1–t11 靠佢),但 REMEDY_STATE 唔喺 tmp 就跌返 prod → REFUSED ==="
fr STREAM_WATCH_TEST=1 REMEDY_STATE="$S/h.json" REMEDY_LOG="$S/h.log" WATCH_DIR="$S/hwd" "$FR_R" wait; rc=$?; [[ $rc -eq 0 ]]; chk "測試模式 tmp state → 行到 rc=$rc" $?
fr STREAM_WATCH_TEST=1 REMEDY_STATE="$REALHOME/x.json" "$FR_R" wait; rc=$?; [[ $rc -eq 2 ]]; chk "STREAM_WATCH_TEST=1 但 state 唔喺 tmp → exit 2 rc=$rc" $?
if [[ $SKIPREAL -eq 0 ]]; then
echo "=== (i) M1:半設 env → REFUSED(真 script、prod 模式、無憑證⇒零寫入)==="
i0="$(prodsum)"; ISM="$(/sbin/md5 -q /tmp/hymn_stream_watch.log 2>/dev/null)"
mkdir -p "$S/half"
for combo in "REMEDY_STATE=$S/half/s.json" "REMEDY_STATE=$S/half/s.json REMEDY_LOG=$S/half/l.log" "REMEDY_STATE=$S/half/s.json WATCH_DIR=$S/half/wd" "REMEDY_LOG=$S/half/l.log WATCH_DIR=$S/half/wd" "WATCH_DIR=$S/half/wd"; do
  refused "half-env[$(echo "$combo" | sed "s#$S/half/##g")] escalate" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 $combo "$R" escalate "t12 half env"
done
[[ ! -e "$REALHOME/.hymn-deploy/stream-escalate.request" && -z "$(ls -A "$S/half")" ]]; chk "半設 env:真 stream-escalate.request 冇出現、scratch 半設路徑冇被建" $?
[[ "$i0" == "$(prodsum)" ]]; chk "(i) 前後真 prod 摘要不變" $?
echo "=== (j) M2:watch guard(真 watch script;預期全部拒絕⇒零寫入,故可喺真 repo 跑)==="
W="$SRC/stream-watch.sh"; j0="$(prodsum)"; JLOG="$(/sbin/md5 -q "$SRC/../../docs/SUPERVISION-LOG.md" 2>/dev/null)"; JW="$(/sbin/md5 -q /tmp/hymn_stream_watch.log 2>/dev/null)"
(cd / && env -u STREAM_WATCH_TEST CLAUDECODE=1 "$W") >"$S/out" 2>"$S/err"; rc=$?; [[ $rc -eq 2 ]] && grep -q '^REFUSED' "$S/err"; chk "watch + CLAUDECODE=1(冇 WATCH_MANUAL)→ exit 2 REFUSED rc=$rc" $?
(cd / && "${NOENV[@]}" STREAM_WATCH_TEST=1 WATCH_DIR=/usr/local/t12-nonexistent-wd "$W") >"$S/out" 2>"$S/err"; rc=$?; [[ $rc -eq 2 ]] && grep -q '^REFUSED' "$S/err"; chk "watch + STREAM_WATCH_TEST=1 但 WATCH_DIR 唔喺 tmp(用寫唔入嘅 /usr/local 路徑,壞咗都寫唔到真 home) → exit 2 rc=$rc" $?
(cd / && "${NOENV[@]}" STREAM_WATCH_TEST=1 WATCH_DIR="$S/jwd" WATCH_LOG_MD=/usr/local/t12-nonexistent-log.md "$W") >"$S/out" 2>"$S/err"; rc=$?; [[ $rc -eq 2 && ! -e "$S/jwd" ]]; chk "watch + 測試模式但 WATCH_LOG_MD 唔喺 tmp(同樣用寫唔入路徑) → exit 2 rc=$rc" $?
[[ "$j0" == "$(prodsum)" && "$JLOG" == "$(/sbin/md5 -q "$SRC/../../docs/SUPERVISION-LOG.md" 2>/dev/null)" && "$JW" == "$(/sbin/md5 -q /tmp/hymn_stream_watch.log 2>/dev/null)" ]]; chk "(j) 前後真 ~/.hymn-deploy、SUPERVISION-LOG、watch log 不變" $?
echo "=== (k) L1 symlink:scratch symlink → 非 tmp 目錄(/usr,寫唔入)"
mkdir -p "$S/k"; ln -s /usr "$S/k/lnk"
(eval "$(sed -n '/^_sw_tmpok()/,/^}/p' "$SRC/stream-remedy.sh")"; _sw_tmpok "$S/k/lnk/x"); [[ $? -ne 0 ]]; chk "remedy _sw_tmpok:symlink→/usr 被拒" $?
(eval "$(sed -n '/^_sw_tmpok()/,/^}/p' "$SRC/stream-remedy.sh")"; _sw_tmpok "$S/k/plain/x"); chk "remedy _sw_tmpok:普通 scratch 路徑接受" $?
(eval "$(sed -n '/^tl_tmpok()/,/^}/p' "$T/testlib.sh")"; tl_tmpok "$S/k/lnk/x"); [[ $? -ne 0 ]]; chk "testlib tl_tmpok:symlink→/usr 被拒" $?
refused "remedy:三個 env 齊但經 symlink 指出 tmp → 當 prod → REFUSED" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 REMEDY_STATE="$S/k/lnk/s.json" REMEDY_LOG="$S/k/lnk/l.log" WATCH_DIR="$S/k/lnk/wd" "$R" wait
fi
echo "=== 收尾:殺自己起嘅 sleep pid=$LIVE(核 PPID=$$ + 命令行)==="
ps -o pid=,ppid=,command= -p "$LIVE"; if [[ "$(ps -o ppid= -p "$LIVE" | tr -d ' ')" == "$$" && "$(ps -o command= -p "$LIVE")" == "/bin/sleep 120" ]]; then kill "$LIVE"; wait "$LIVE" 2>/dev/null; echo killed; fi
echo "=== 總結:FAILS=$FAILS ==="
[[ $FAILS -eq 0 ]]
