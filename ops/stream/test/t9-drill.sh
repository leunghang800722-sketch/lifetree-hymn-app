#!/usr/bin/env bash
# T9:演習入口 drill-restart(TOKEN-REVOKE-DRILL-EXEC-20260929 Part B)。用法:t9-drill.sh <scratchdir>
# 全部 cd / + env -i + 絕對路徑 + STREAM_WATCH_TEST=1 + scratch state。測試模式自動 --dry-run,唔會真 restart。
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?scratch dir}"; T="$(cd "$(dirname "$0")" && pwd)"; R="$T/../stream-remedy.sh"; W="$T/../stream-watch.sh"
D="$S/t9"; rm -rf "$D"; mkdir -p "$D/wd" "$D/stub" "$D/www/api"
echo ok > "$D/stub/mode"; echo '{}' > "$D/selfheal.json"; echo '{"ok":true}' > "$D/www/api/health"
# 本地假 health server(scratch,自己起自己殺)
PORT=$((20000 + RANDOM % 20000))
/usr/bin/python3 -m http.server "$PORT" --directory "$D/www" --bind 127.0.0.1 >/dev/null 2>&1 &
HP=$!; sleep 1
BASEENV=(HOME="$HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin STREAM_WATCH_TEST=1 STUB_DIR="$D/stub" WATCH_DIR="$D/wd" REMEDY_STATE="$D/wd/rs.json" \
  REMEDY_LOG="$D/wd/remedy.log" SELFHEAL_STATE="$D/selfheal.json" WATCH_STATE="$D/wd/ws.json" HYMN_STREAM_BASE="http://127.0.0.1:$PORT" \
  DRILL_HEALTH_WAIT=1 REMEDY_INCIDENT=t9 WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" WATCH_DIAGNOSE_CMD="$T/stub-diagnose.sh" \
  WATCH_LOG_MD="$D/SUPERVISION-LOG.md")
E() { (cd / && env -i "${BASEENV[@]}" "$@"); }
snap() { echo "   [wd: $(ls "$D/wd" | tr '\n' ' ')| rs.json: $(cat "$D/wd/rs.json" 2>/dev/null | tr -d ' \n')]"; }
: > "$D/SUPERVISION-LOG.md"
echo "=== B-1. request → watch 一個 tick → inflight 消耗 → remedy 去到 backend-restart.sh --same-code --dry-run → drill.log ==="
touch "$D/wd/stream-drill.request"; snap
E "$W"; echo "   watch exit=$?"; snap
echo "--- stream-drill.log:"; cat "$D/wd/stream-drill.log"
echo "--- remedy.log:"; cat "$D/wd/remedy.log"
echo "--- 有冇 inflight/request 殘留?$(ls "$D/wd" | grep -c 'stream-drill\.\(request\|inflight\)')(預期 0)"
echo "--- remedy 直接輸出(另一次:重新放 inflight,新 state,看完整 stdout,ENGINE=drill)"
mv "$D/wd/rs.json" "$D/wd/rs.json.b1"; touch "$D/wd/stream-drill.inflight"
E REMEDY_ENGINE=drill "$R" drill-restart; echo "   exit=$?"; mv -f "$D/wd/rs.json.b1" "$D/wd/rs.json"
echo "--- B-1b. 成功路徑(SELFHEAL_RESTART_CMD=stub 成功;驗 health + pid 欄):watch 一個 tick"
rm -f "$D/wd/rs.json"; touch "$D/wd/stream-drill.request"; : > "$D/stub/cmd.calls"
E SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart-stub" "$W"; echo "   watch exit=$?"; tail -1 "$D/wd/stream-drill.log"; echo "   stub restart calls: $(cat "$D/stub/cmd.calls")"
echo "=== B-2. 冇 inflight / 過期 / symlink / 無 ENGINE=drill ==="
rm -f "$D/wd/rs.json" "$D/wd/remedy.log"; snap
echo "--- 冇 inflight"; E REMEDY_ENGINE=drill "$R" drill-restart; echo "   exit=$?"; snap
echo "--- inflight 過期(mtime 11 分鐘前)"; touch -t "$(date -v-11M +%Y%m%d%H%M.%S)" "$D/wd/stream-drill.inflight" 2>/dev/null || { touch "$D/wd/stream-drill.inflight"; touch -t "$(date -v-11M +%Y%m%d%H%M.%S)" "$D/wd/stream-drill.inflight"; }
E REMEDY_ENGINE=drill "$R" drill-restart; echo "   exit=$?"; snap; rm -f "$D/wd/stream-drill.inflight"
echo "--- inflight 係 symlink"; ln -s "$D/stub/mode" "$D/wd/stream-drill.inflight"; E REMEDY_ENGINE=drill "$R" drill-restart; echo "   exit=$?"; snap; rm -f "$D/wd/stream-drill.inflight"
echo "--- 有新鮮 inflight 但 ENGINE=manual(冇設)"; touch "$D/wd/stream-drill.inflight"; E "$R" drill-restart; echo "   exit=$?"; snap
echo "--- 帶參數"; E REMEDY_ENGINE=drill "$R" drill-restart x; echo "   exit=$?"; snap; rm -f "$D/wd/stream-drill.inflight"
echo "--- remedy.log:"; cat "$D/wd/remedy.log"
echo "=== B-3. 配額 ==="
rm -f "$D/wd/rs.json" "$D/wd/remedy.log"
touch "$D/wd/stream-drill.inflight"; echo "--- 第 1 次"; E REMEDY_ENGINE=drill "$R" drill-restart >/dev/null; echo "   exit=$?"; snap
touch "$D/wd/stream-drill.inflight"; echo "--- 同日第 2 次"; E REMEDY_ENGINE=drill "$R" drill-restart; echo "   exit=$?"; snap; echo "   inflight 已被消耗?$([ -e "$D/wd/stream-drill.inflight" ] && echo NO || echo yes)"
echo "--- restarts 配額用晒(REMEDY_TOTAL 用 selfheal restartsToday=3)時 drill 仍可行(用新一日 state,drills=0)"
rm -f "$D/wd/rs.json"; printf '{"date":"%s","swapsToday":0,"restartsToday":3}' "$(date +%F)" > "$D/selfheal.json"
E "$R" restart-backend; echo "   restart-backend exit=$?(預期 3=配額用晒)"
touch "$D/wd/stream-drill.inflight"; E REMEDY_ENGINE=drill "$R" drill-restart | grep -E "restart exit|DRILL-RESULT" | cut -c1-140; echo "   drill exit=${PIPESTATUS[0]}"; snap
echo "--- drill 唔令 restarts +1(rs.json 內 restarts 應仍 0)"
echo "--- 反向:restarts 用過 1 次後 drill 仍可行,drills 仍獨立"
rm -f "$D/wd/rs.json"; echo '{}' > "$D/selfheal.json"; E "$R" restart-backend >/dev/null; touch "$D/wd/stream-drill.inflight"; E REMEDY_ENGINE=drill "$R" drill-restart >/dev/null; echo "   drill exit=$?"; snap
echo "=== B-4. REMEDY_ENGINE=ai → exit 2(即使有新鮮 inflight)==="
rm -f "$D/wd/rs.json" "$D/wd/remedy.log"; touch "$D/wd/stream-drill.inflight"
E REMEDY_ENGINE=ai "$R" drill-restart; echo "   exit=$?"; snap; echo "   inflight 仍在(未被 ai 消耗)?$([ -e "$D/wd/stream-drill.inflight" ] && echo yes || echo NO)"; rm -f "$D/wd/stream-drill.inflight"
echo "--- diagnose 規則同 AI allowlist 有冇提及 drill:$(grep -c drill "$T/../stream-diagnose.sh" "$T/../stream-diagnose-rules.sh" | tr '\n' ' ')(預期全 0)"
echo "=== B-5. 演習 stub 失敗 / hang:watch 照行完狀態機、exit 0 ==="
rm -f "$D/wd/stream-drill.log"; : > "$D/stub/drill-stub.calls"
echo bad > "$D/stub/mode"
echo "--- stub exit 1(status=bad → 狀態機應照走:ok→bad 記 incident)"
touch "$D/wd/stream-drill.request"; E DRILL_STUB_MODE=fail WATCH_DRILL_CMD="$T/stub-drill-fail.sh" "$W"; echo "   watch exit=$?"
echo "   state: $(python3 -c "import json;d=json.load(open('$D/wd/ws.json'));print(d['status'],'badTicks=',d['badTicks'])")"; cat "$D/wd/stream-drill.log"
echo "--- stub hang(WATCH_DRILL_CAP=3 秒)"
touch "$D/wd/stream-drill.request"; t0=$(date +%s); E DRILL_STUB_MODE=hang WATCH_DRILL_CAP=3 WATCH_DRILL_CMD="$T/stub-drill-fail.sh" "$W"; echo "   watch exit=$?  用時 $(( $(date +%s) - t0 ))s"
echo "   state: $(python3 -c "import json;d=json.load(open('$D/wd/ws.json'));print(d['status'],'badTicks=',d['badTicks'])")(第 2 個 bad tick,應 =2 並觸發 DIAGNOSE)"
tail -1 "$D/wd/stream-drill.log"; echo "   diagnose stub 被 call:$(wc -l < "$D/stub/diagnose.calls" 2>/dev/null | tr -d ' ') 次"
echo "   hang stub 殘留 process(自己起嘅 sleep 600 應已被 pg kill):$(pgrep -f 'sleep 600' | wc -l | tr -d ' ')(注意:此數可能包含別人嘅)"
echo "--- stream-watch.off 存在時唔行演習"
touch "$D/wd/stream-watch.off" "$D/wd/stream-drill.request"; : > "$D/stub/drill-stub.calls"; E DRILL_STUB_MODE=fail WATCH_DRILL_CMD="$T/stub-drill-fail.sh" "$W"; echo "   watch exit=$?  stub calls=$(wc -l < "$D/stub/drill-stub.calls" | tr -d ' ')  request 仍在?$([ -e "$D/wd/stream-drill.request" ] && echo yes || echo no)"
rm -f "$D/wd/stream-watch.off" "$D/wd/stream-drill.request"
echo "--- 冇 request:零側效應(ok tick)"; echo ok > "$D/stub/mode"; rm -f "$D/wd/stream-drill.log"; E "$W"; echo "   watch exit=$?  drill.log 存在?$([ -e "$D/wd/stream-drill.log" ] && echo yes || echo no)"
echo "=== B-6. F2:restart 失敗 + backend 死咗 → pid/lstart/health 要重新量(唔准抄 before)==="
# scratch 假 backend(自己起、自己收;cmdline 有獨一 token,測試模式用 DRILL_PGREP_PAT 指住佢,唔會碰真 backend)
TOK="scratchfakebackend$RANDOM$RANDOM"
perl -e 'sleep 300' "$TOK" & FP=$!; echo "$FP" > "$D/fakepid"; sleep 0.5
echo "   假 backend pid=$FP lstart=$(ps -o lstart= -p $FP | tr -s ' ')"
rm -f "$D/wd/rs.json"; touch "$D/wd/stream-drill.inflight"
E REMEDY_ENGINE=drill DRILL_PGREP_PAT="$TOK" FAKEPID_FILE="$D/fakepid" SELFHEAL_RESTART_CMD="$T/stub-drill-kill.sh" HYMN_STREAM_BASE="http://127.0.0.1:9" "$R" drill-restart 2>&1 | grep -E "^(drill:|DRILL-RESULT|restart exit)" | sed 's/path=.*//'
echo "   假 backend 仍存活?$(ps -p $FP >/dev/null 2>&1 && echo yes || echo no)(預期 no);DRILL-RESULT 應 restart_rc=1 health=000 pid_after=none"
kill "$FP" 2>/dev/null; wait "$FP" 2>/dev/null
echo "=== B-7. F6:HOME 唔可以搬 state(L4:改用 scratch 假 repo 副本 + sed 換真 home 取值,唔喺真 repo 行 prod 模式)==="
FR="$D/fr"; FH="$D/fh"; mkdir -p "$FR/ops/stream" "$FR/backend/data" "$FH/.hymn-deploy"
cp "$T/../stream-remedy.sh" "$T/../stream-watch-lib.sh" "$FR/ops/stream/"
sed -i '' 's|^  export HOME="\$_sw_home"$|  export HOME="'"$FH"'"|' "$FR/ops/stream/stream-remedy.sh"
sed -i '' 's|^wlib_real_home() {$|wlib_real_home() { printf "%s" "'"$FH"'"; return 0;|' "$FR/ops/stream/stream-watch-lib.sh"
grep -q "export HOME=\"$FH\"" "$FR/ops/stream/stream-remedy.sh" && echo "   假 repo 已 patch(HOME=$FH)" || echo "   假 repo patch 失敗"
mkdir -p /tmp/x-f6-home 2>/dev/null
echo "--- 假 repo 副本 prod 模式(冇 STREAM_WATCH_TEST)、HOME=/tmp/x-f6-home、DRY-RUN:xtrace 出嚟嘅 HOME/WATCH_DIR/STATE 賦值(HOME 應被覆蓋,唔係 /tmp/x-f6-home)"
(cd / && env -i HOME=/tmp/x-f6-home PATH=/usr/bin:/bin REMEDY_MANUAL=1 REMEDY_DRY_RUN=1 /bin/bash -p -x "$FR/ops/stream/stream-remedy.sh" wait 2>&1 | grep -E "^\++ (export )?(HOME|WATCH_DIR|STATE|LOG)=" | sed 's/^+* //')
echo "   /tmp/x-f6-home 之下有冇被寫嘢?$(ls -A /tmp/x-f6-home | wc -l | tr -d ' ')(預期 0);假 home 之下有冇被寫嘢?$(ls -A "$FH/.hymn-deploy" | wc -l | tr -d ' ')(預期 0)"; rmdir /tmp/x-f6-home 2>/dev/null
echo "=== 收尾:殺自己起嘅 http server pid=$HP(核 lstart/命令)==="
ps -o pid=,ppid=,lstart=,command= -p "$HP"; kill "$HP" 2>/dev/null; sleep 0.5; ps -p "$HP" >/dev/null 2>&1 && echo "仍在" || echo "已停"
