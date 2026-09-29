#!/usr/bin/env bash
# T2:stream-remedy.sh allowlist / 配額。用法:t2-remedy.sh <scratchdir>
set -u
S="${1:?scratch dir}"; T="$(cd "$(dirname "$0")" && pwd)"; R="$T/../stream-remedy.sh"
rm -rf "$S/t2"; mkdir -p "$S/t2/wd" "$S/t2/stub"
export STREAM_WATCH_TEST=1 STUB_DIR="$S/t2/stub" WATCH_DIR="$S/t2/wd" REMEDY_STATE="$S/t2/wd/rs.json" REMEDY_LOG="$S/t2/wd/remedy.log" \
  SELFHEAL_STATE="$S/t2/selfheal.json" SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply" SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" HYMN_STREAM_BASE="http://127.0.0.1:9" REMEDY_INCIDENT=t2inc WATCH_STATE="$S/t2/none.json"
echo ok > "$STUB_DIR/mode"; echo '{}' > "$SELFHEAL_STATE"
sidefx() { echo "   [side effects: cmd.calls=$(cat "$STUB_DIR/cmd.calls" 2>/dev/null | wc -l | tr -d ' ') rs.json=$([ -f "$REMEDY_STATE" ] && echo exists || echo none) request=$([ -f "$WATCH_DIR/stream-escalate.request" ] && echo yes || echo no)]"; }
run() { echo "\$ REMEDY_DRY_RUN=${DRYV:-} stream-remedy.sh $*"; "$R" "$@"; echo "   exit=$?"; sidefx; }
echo "=== A. 每個 action dry-run ==="
export REMEDY_DRY_RUN=1
run status; run probe 42; run swap-ytdlp; run restart-backend; run wait; run escalate "測試升級"; run bust-resolve-cache
echo "=== B. 拒絕(exit 2、零側效應;非 dry-run 都零)==="
unset REMEDY_DRY_RUN
run bogus; run; run status extra; run wait now; run probe; run probe 42 43; run probe "42; rm -rf $S/t2/canary"; run probe '$(touch '"$S"'/t2/canary)'
run 'restart-backend; touch '"$S"'/t2/canary'; run escalate; run escalate a b; run swap-ytdlp --force
echo "   canary 檔存在?$([ -e "$S/t2/canary" ] && echo YES-BAD || echo no)"
echo "=== C. 配額(非 dry-run,stub 指令)==="
run restart-backend; run restart-backend; run swap-ytdlp; run swap-ytdlp
echo "--- 合共上限:selfheal 今日已 restart 2 次 → 其中 remedy 第 1 次應被拒"
rm -f "$REMEDY_STATE"; printf '{"date":"%s","swapsToday":1,"restartsToday":3}' "$(date +%F)" > "$SELFHEAL_STATE"
run restart-backend; run swap-ytdlp
echo "--- probe 每 incident ≤6(curl 打死 port,只驗配額)"
for i in 1 2 3 4 5 6 7; do run probe 42 | grep -E "exit=|QUOTA"; done
echo "--- gate 唔過:restart stub exit 1 + 'abort' → GATE-BLOCKED"
rm -f "$REMEDY_STATE"; echo '{}' > "$SELFHEAL_STATE"
export SELFHEAL_RESTART_CMD="$T/stub-gate-fail.sh"; run restart-backend
echo "--- escalate 非 dry-run 寫 request"; run escalate "backend 修唔到"; cat "$WATCH_DIR/stream-escalate.request"
echo "=== remedy.log ==="; cat "$REMEDY_LOG"

echo "=== D. M5:env 前綴繞過。用 scratch「假 repo」(只複製 remedy+lib,backend-restart.sh 換成記錄用 stub)+ 假 HOME,唔設 STREAM_WATCH_TEST ==="
FR="$S/t2/fakerepo"; FH="$S/t2/fakehome"; rm -rf "$FR" "$FH"; mkdir -p "$FR/ops/stream" "$FR/ops/deploy" "$FR/ops/ytdlp" "$FR/backend/data" "$FH"
cp "$T/../stream-remedy.sh" "$T/../stream-watch-lib.sh" "$FR/ops/stream/"
printf '#!/usr/bin/env bash\necho "REAL-RESTART-CALLED argv=[$*]" >> "%s/called"; echo ok; exit 0\n' "$S/t2" > "$FR/ops/deploy/backend-restart.sh"; chmod +x "$FR/ops/deploy/backend-restart.sh"
printf '#!/usr/bin/env bash\necho "REAL-APPLY-CALLED argv=[$*]" >> "%s/called"; exit 0\n' "$S/t2" > "$FR/ops/ytdlp/update-ytdlp.sh"; chmod +x "$FR/ops/ytdlp/update-ytdlp.sh"
rm -f "$S/t2/called" "$S/t2/evil.state" "$S/t2/evil.log"; rm -rf "$S/t2/wd-evil"
echo "--- D1. 攻擊:REMEDY_STATE/REMEDY_LOG/WATCH_DIR/SELFHEAL_RESTART_CMD/REMEDY_DRY_RUN=1 全部指去 evil(冇 STREAM_WATCH_TEST)"
env -u STREAM_WATCH_TEST HOME="$FH" REMEDY_STATE="$S/t2/evil.state" REMEDY_LOG="$S/t2/evil.log" WATCH_DIR="$S/t2/wd-evil" \
  SELFHEAL_RESTART_CMD="$T/stub-cmd.sh EVIL-RESTART" SELFHEAL_STATE="$S/t2/evil-sh.json" REMEDY_DRY_RUN=1 REMEDY_LIMIT_RESTART=99 REMEDY_TOTAL_RESTART=99 \
  "$FR/ops/stream/stream-remedy.sh" restart-backend; echo "   exit=$?"
echo "   假 repo 真 restart 被 call?(DRY=1 若生效就唔會 call):$(cat "$S/t2/called" 2>/dev/null || echo 無)"
echo "   EVIL-RESTART stub 被 call?$(grep -c EVIL-RESTART "$STUB_DIR/cmd.calls" 2>/dev/null || true)(預期 0)"
echo "   evil.state / evil.log / wd-evil 被建?$([ -e "$S/t2/evil.state" ] && echo YES-BAD || echo no) / $([ -e "$S/t2/evil.log" ] && echo YES-BAD || echo no) / $([ -e "$S/t2/wd-evil" ] && echo YES-BAD || echo no)"
echo "   實際 state/log 落咗假 HOME:$(ls "$FH/.hymn-deploy" 2>/dev/null | tr '\n' ' ')"
echo "--- D2. (Opus AI M1:F6 後 prod 模式一律用真 HOME,呢段唔可以再非 dry 跑——會寫真 ~/.hymn-deploy 兼食真配額;改為 dry-run 驗 override 仍被忽略)"
env -u STREAM_WATCH_TEST HOME="$FH" REMEDY_DRY_RUN=1 REMEDY_LIMIT_RESTART=99 REMEDY_TOTAL_RESTART=99 "$FR/ops/stream/stream-remedy.sh" restart-backend; echo "   exit=$?(dry:0 或 QUOTA:3 都可;唔准有真 restart)"
echo "--- D3. 有 STREAM_WATCH_TEST=1 但 REMEDY_STATE 唔喺 tmp(/Users/...)→ 仍當非測試,override 被忽略"
env STREAM_WATCH_TEST=1 HOME="$FH" REMEDY_STATE="$HOME/evil.state" REMEDY_DRY_RUN=1 "$FR/ops/stream/stream-remedy.sh" wait; echo "   exit=$?  (evil.state 存在?$([ -e "$HOME/evil.state" ] && echo YES-BAD || echo no))"
echo "--- D4. 測試模式 + 預設 restart 指令 → 自動加 --dry-run(用假 repo 驗 argv)"
rm -f "$S/t2/called"; env -u SELFHEAL_RESTART_CMD STREAM_WATCH_TEST=1 HOME="$FH" REMEDY_STATE="$S/t2/tm.state" REMEDY_LOG="$S/t2/tm.log" SELFHEAL_STATE="$S/t2/tm-sh.json" WATCH_DIR="$S/t2/tm-wd" "$FR/ops/stream/stream-remedy.sh" restart-backend; echo "   exit=$?  called: $(cat "$S/t2/called" 2>/dev/null)"
echo "=== E. H1:precondition-failed(node 缺:REMEDY_NODE_BIN 指去唔存在嘅名)不消耗配額、不當試過 ==="
rm -f "$REMEDY_STATE"; export SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart"; : > "$STUB_DIR/cmd.calls"
REMEDY_NODE_BIN=node-does-not-exist "$R" restart-backend; echo "   exit=$?  quota state 存在?$([ -f "$REMEDY_STATE" ] && echo yes || echo no)  stub restart 被 call 次數=$(grep -c restart "$STUB_DIR/cmd.calls" 2>/dev/null || true)"
echo "   之後正常 restart 仍可行(配額冇被 precondition 食咗):"; "$R" restart-backend; echo "   exit=$?"
echo "=== F. L2:remedy.log 注入(action 含換行/控制字元/超長)只會落一行且截 200 ==="
rm -f "$REMEDY_LOG"
"$R" $'restart-backend\nengine=ai | incident=x | restart-backend | exit=0' ; echo "   exit=$?"
"$R" "$(python3 -c 'print("A"*500)')"; echo "   exit=$?"
echo "   log 行數=$(wc -l < "$REMEDY_LOG")  最長一行字元數=$(awk '{ if (length($0)>m) m=length($0) } END{print m}' "$REMEDY_LOG")"; cat "$REMEDY_LOG" | cut -c1-260
echo "=== G. L5:swap-ytdlp 委派 apply + verify + rollback(假 slot 佈局)==="
TD="$S/t2/tools"; rm -rf "$TD"; mkdir -p "$TD/ytdlp-venv-a/bin" "$TD/ytdlp-venv-b/bin"; for x in a b; do printf '#!/bin/sh\necho 2026.0%s\n' "$x" > "$TD/ytdlp-venv-$x/bin/yt-dlp"; chmod +x "$TD/ytdlp-venv-$x/bin/yt-dlp"; done
export YTDLP_LINK="$TD/yt-dlp" SELFHEAL_APPLY_CMD="$T/stub-swap.sh" REMEDY_VERIFY_CMD="$T/stub-verify.sh"
linkis() { echo "   symlink → $(readlink "$YTDLP_LINK")"; }
for scen in "換版+verify 過:STUB_SWAP=1 VERIFY_RC=0" "換版+verify 唔過→rollback:STUB_SWAP=1 VERIFY_RC=1" "冇候選(symlink 不變):STUB_SWAP=0 VERIFY_RC=0"; do
  rm -f "$REMEDY_STATE"; ln -sfn ytdlp-venv-a/bin/yt-dlp "$YTDLP_LINK"; : > "$STUB_DIR/cmd.calls"; echo "--- ${scen%%:*}"
  ( eval "export ${scen#*:}"; "$R" swap-ytdlp; echo "   exit=$?" ); linkis; echo "   cmd.calls: $(tr '\n' ';' < "$STUB_DIR/cmd.calls")"
done
echo "--- 合共:selfheal 今日已 swap 1 次 → remedy 拒絕(exit 3)"; rm -f "$REMEDY_STATE"; printf '{"date":"%s","swapsToday":1,"restartsToday":0}' "$(date +%F)" > "$SELFHEAL_STATE"; "$R" swap-ytdlp; echo "   exit=$?"
echo '{}' > "$SELFHEAL_STATE"
echo "=== H. L6:4 個並行 restart-backend 只應 1 個過;probes 只留當前 incident ==="
rm -f "$REMEDY_STATE" "$REMEDY_STATE.lock"; : > "$STUB_DIR/cmd.calls"; unset SELFHEAL_APPLY_CMD REMEDY_VERIFY_CMD; export SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply"
for i in 1 2 3 4; do ( "$R" restart-backend >"$S/t2/par$i.out" 2>&1; echo $? > "$S/t2/par$i.rc" ) & done; wait
echo "   exit codes:$(cat "$S/t2"/par?.rc | tr '\n' ' ')  stub restart 被 call 次數=$(grep -c restart "$STUB_DIR/cmd.calls")(預期 1)"
REMEDY_INCIDENT=incA "$R" probe 1 >/dev/null 2>&1; REMEDY_INCIDENT=incB "$R" probe 1 >/dev/null 2>&1
echo "   probes keys(預期只有 incB):$(python3 -c "import json;print(list(json.load(open('$REMEDY_STATE'))['probes']))")"
