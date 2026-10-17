#!/usr/bin/env bash
# 第二輪修正單驗證:V1(launchd 等效環境)、V3(並發 tick)、V6(L1 state 損毀 / L2 stale request / L6 見 t2)。
# 全部 scratch env override,唔掂 prod state。用法:t6-fixes.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"; W="$T/../stream-watch.sh"; REPO="$(cd "$T/../../.." && pwd)"
snapenv() { export STREAM_WATCH_TEST=1 STUB_DIR="$S/$1/stub" WATCH_DIR="$S/$1/wd" WATCH_LOG_MD="$S/$1/LOG.md" WATCH_STATUS_CMD="$T/stub-status.sh" \
  WATCH_NOTIFY_CMD="$T/stub-notify.sh" WATCH_DIAGNOSE_CMD="$T/stub-diagnose.sh"; rm -rf "$S/$1"; mkdir -p "$S/$1/stub" "$S/$1/wd"; : > "$S/$1/LOG.md"; }

echo "################ V1 launchd 等效環境:env -i HOME=\$HOME(PATH 唔俾),scratch state + stub status ################"
echo "--- 對照:launchd 等效 PATH 下 node/claude/python3 搵唔搵到(未 source lib)"
env -i HOME="$HOME" /bin/bash -c 'echo "PATH=[$PATH]"; for c in node claude python3 git; do printf "  %-8s %s\n" $c "$(command -v $c || echo NOT-FOUND)"; done'
echo "--- source lib 之後"
env -i HOME="$HOME" /bin/bash -c '. '"$REPO"'/ops/stream/stream-watch-lib.sh; echo "PATH=[$PATH]"; for c in node claude python3 git; do printf "  %-8s %s\n" $c "$(command -v $c || echo NOT-FOUND)"; done'
V="$S/v1"; rm -rf "$V"; mkdir -p "$V/stub" "$V/wd"; : > "$V/LOG.md"; echo bad > "$V/stub/mode"
V1ENV=(HOME="$HOME" STREAM_WATCH_TEST=1 STUB_DIR="$V/stub" WATCH_DIR="$V/wd" WATCH_STATE="$V/wd/stream-watch-state.json" WATCH_LOG_MD="$V/LOG.md"
  WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh"
  REMEDY_STATE="$V/wd/rs.json" REMEDY_LOG="$V/wd/remedy.log" SELFHEAL_STATE="$V/sh.json" REMEDY_STATUS_CMD="$T/stub-status.sh"
  DIAG_BUNDLE_FILE="$T/fixtures/bundle-backend-down.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env")
# 注意:冇設 SELFHEAL_RESTART_CMD → 測試模式下 remedy 用預設 backend-restart.sh --same-code --dry-run(真 gate,唔真 restart)
for n in 0 1 2; do echo "--- tick $n (status=bad)"; env -i "${V1ENV[@]}" WATCH_NOW=$((1790000000 + n*1800)) /bin/bash "$W" 2>&1 | sed 's/^/   /'; done
echo "--- remedy.log"; cat "$V/wd/remedy.log"
echo "--- diagnosis.md"; cat "$V/wd/stream-incident-"*/diagnosis.md 2>/dev/null
echo "--- 手動 remedy(env -i,測試模式)直接睇 restart-backend 輸出(gate 結果):"
env -i "${V1ENV[@]}" REMEDY_STATE="$V/wd/rs2.json" REMEDY_LOG="$V/wd/remedy2.log" REMEDY_INCIDENT=v1manual /bin/bash "$T/../stream-remedy.sh" restart-backend 2>&1 | sed 's/^/   /'; echo "   exit=${PIPESTATUS[0]}"
echo "--- 負控:無 node 嘅 PATH(REMEDY_NODE_BIN 指去唔存在)→ precondition-failed"
env -i "${V1ENV[@]}" REMEDY_STATE="$V/wd/rs3.json" REMEDY_LOG="$V/wd/remedy3.log" REMEDY_NODE_BIN=node-missing /bin/bash "$T/../stream-remedy.sh" restart-backend 2>&1 | sed 's/^/   /'

echo; echo "################ V3 M1 並發:兩個 tick 同時起 ×20 輪 ################"
snapenv v3; W3="$S/v3"; T0=1790000000
# 場景:先 bad,bad(診斷)→ 升級;再喺 bad 期間並發 ok tick 同 bad tick,20 輪;最後單獨 ok 確認恢復行。
echo escalate > "$STUB_DIR/verdict"; echo bad > "$STUB_DIR/mode"; WATCH_NOW=$T0 "$W" >/dev/null; WATCH_NOW=$((T0+1800)) "$W" >/dev/null
python3 -c "import json;d=json.load(open('$WATCH_DIR/stream-watch-state.json'));print('   開場 state:',{k:d.get(k) for k in ('status','badTicks','diagnosed','escalated','notifyCount')})"
sk=0; bad=0
for i in $(seq 1 20); do
  echo ok > "$STUB_DIR/mode"; ( WATCH_NOW=$((T0+7200+i*100)) "$W" > "$S/v3/o1.$i" 2>&1 ) & ( WATCH_NOW=$((T0+7200+i*100+1)) "$W" > "$S/v3/o2.$i" 2>&1 ) & wait
  # 每輪之後如果已恢復,再逼返 bad→bad 升級狀態(用單獨 tick 重建)
  python3 - "$WATCH_DIR/stream-watch-state.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); print("   輪 state.status=%s escalated=%s alert=%s" % (d['status'], d['escalated'], ''), end='')
PY
  echo " alertFile=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo no) LOG✅行=$(grep -c '✅' "$WATCH_LOG_MD") skips=$(cat "$S"/v3/o?.$i | grep -c 'skip')"
  # 重建下一輪嘅升級狀態
  echo bad > "$STUB_DIR/mode"; rm -f "$STUB_DIR/diagnose.calls"
  WATCH_NOW=$((T0+7200+i*100+10)) "$W" >/dev/null; WATCH_NOW=$((T0+7200+i*100+20)) "$W" >/dev/null; WATCH_NOW=$((T0+7200+i*100+30)) "$W" >/dev/null
done > "$S/v3/rounds.txt" 2>&1
echo "   (20 輪逐輪輸出摘要:前 3 輪 + 最後 2 輪)"; sed -n '1,3p;19,20p' "$S/v3/rounds.txt"
echo "   20 輪內:state 可解析=$(python3 -c "import json;json.load(open('$WATCH_DIR/stream-watch-state.json'));print('yes')" 2>&1)  lock 目錄殘留=$([ -d "$WATCH_DIR/stream-watch.lock" ] && echo YES-BAD || echo no)  *.tmp 殘留=$(ls "$WATCH_DIR"/*.tmp 2>/dev/null | wc -l | tr -d ' ')"
echo "   skip 次數(至少一個 tick 因 lock 而零寫)=$(cat "$S"/v3/o?.* | grep -c 'skip')"
echo "   SUPERVISION-LOG ✅ 恢復行總數=$(grep -c '✅' "$WATCH_LOG_MD")  🔴 升級行=$(grep -c '🔴' "$WATCH_LOG_MD")  恢復通知數=$(grep -c '已恢復' "$STUB_DIR/notify.log")"
echo "   一致性:曾升級嘅恢復行(✅ …曾升級)數 vs 已恢復通知數 vs 升級行數 → $(grep -c '曾升級' "$WATCH_LOG_MD") vs $(grep -c '已恢復' "$STUB_DIR/notify.log") vs $(grep -c '🔴' "$WATCH_LOG_MD")"
echo "--- V3b 確定性 d2 場景(Opus M1 重現):已升級 → 人手持住 lock → 入 ok tick → 全部零寫 → 放 lock → ok tick 先做恢復"
snapenv v3b; echo escalate > "$STUB_DIR/verdict"; echo bad > "$STUB_DIR/mode"; WATCH_NOW=$T0 "$W" >/dev/null; WATCH_NOW=$((T0+1800)) "$W" >/dev/null
echo "   前置:警報檔=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo no) state.status=$(python3 -c "import json;print(json.load(open('$WATCH_DIR/stream-watch-state.json'))['status'])")"
M0="$(md5 -q "$WATCH_DIR/stream-watch-state.json")"; mkdir "$WATCH_DIR/stream-watch.lock"; echo ok > "$STUB_DIR/mode"
for i in 1 2; do WATCH_NOW=$((T0+3600+i)) "$W" 2>&1 | sed 's/^/   /'; done
echo "   持 lock 期間 state md5 不變=$([ "$M0" = "$(md5 -q "$WATCH_DIR/stream-watch-state.json")" ] && echo yes || echo NO-BAD)  警報檔仲喺=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo NO-BAD)  LOG ✅=$(grep -c '✅' "$WATCH_LOG_MD")"
rmdir "$WATCH_DIR/stream-watch.lock"; WATCH_NOW=$((T0+3700)) "$W" 2>&1 | sed 's/^/   /'
echo "   放 lock 後 ok tick:state=$(python3 -c "import json;print(json.load(open('$WATCH_DIR/stream-watch-state.json'))['status'])") 警報檔=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo 仲喺-BAD || echo 已刪) LOG ✅=$(grep -c '✅' "$WATCH_LOG_MD") 恢復通知=$(grep -c '已恢復' "$STUB_DIR/notify.log")"

echo; echo "################ V6-L1 state 損毀 ################"
for case in 'badTicks:"x"' 'not json{{' '[1,2]' 'status:"weird"' 'diagnosed:"yes"'; do
  snapenv l1; echo bad > "$STUB_DIR/mode"
  WATCH_NOW=$T0 "$W" >/dev/null
  case "$case" in
    'badTicks:"x"') python3 - "$WATCH_DIR/stream-watch-state.json" <<'PY'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['badTicks']='x'; json.dump(d,open(p,'w'))
PY
    ;;
    'not json{{') echo 'not json{{' > "$WATCH_DIR/stream-watch-state.json" ;;
    '[1,2]') echo '[1,2]' > "$WATCH_DIR/stream-watch-state.json" ;;
    'status:"weird"') python3 -c "import json;p='$WATCH_DIR/stream-watch-state.json';d=json.load(open(p));d['status']='weird';json.dump(d,open(p,'w'))" ;;
    'diagnosed:"yes"') python3 -c "import json;p='$WATCH_DIR/stream-watch-state.json';d=json.load(open(p));d['diagnosed']='yes';json.dump(d,open(p,'w'))" ;;
  esac
  out="$(WATCH_NOW=$((T0+1800)) "$W" 2>&1)"; out2="$(WATCH_NOW=$((T0+3600)) "$W" 2>&1)"; out3="$(WATCH_NOW=$((T0+5400)) "$W" 2>&1)"
  echo "--- 損毀=[$case]"; echo "   tick1 輸出: $(echo "$out" | head -2 | tr '\n' '|')"
  echo "   備份檔: $(ls "$WATCH_DIR" | grep corrupt | tr '\n' ' ')  state 而家: $(python3 -c "import json;d=json.load(open('$WATCH_DIR/stream-watch-state.json'));print(d['status'],d['badTicks'])")"
  echo "   tick2/3 仍然行緊(冇靜死):diag calls=$(cat "$STUB_DIR/diagnose.calls" 2>/dev/null | wc -l | tr -d ' ')  LOG:$(grep -c 'state 壞咗' "$WATCH_LOG_MD") 行 state壞"
done
echo "--- 已升級途中 state 變壞 JSON 之後恢復:警報檔應清走"
snapenv l1b; echo bad > "$STUB_DIR/mode"; echo escalate > "$STUB_DIR/verdict"; WATCH_NOW=$T0 "$W" >/dev/null; WATCH_NOW=$((T0+1800)) "$W" >/dev/null
echo "   升級後警報檔=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo no)"; echo 'garbage{' > "$WATCH_DIR/stream-watch-state.json"; echo ok > "$STUB_DIR/mode"
WATCH_NOW=$((T0+3600)) "$W" 2>&1 | sed 's/^/   /'; echo "   恢復(ok tick)後警報檔=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo 仲喺-BAD || echo 已清)"
echo "--- do_escalate 原子寫:escalate 之後 state 無 .tmp 殘留、可解析"; ls "$WATCH_DIR" | tr '\n' ' '; echo

echo; echo "################ V6-L2 escalate.request(模擬 AI 喺診斷期間 call escalate)################"
for mode in stale noinc good; do
  snapenv l2; export WATCH_DIAGNOSE_CMD="$T/stub-diagnose-req.sh" REQ_MODE=$mode; echo bad > "$STUB_DIR/mode"
  WATCH_NOW=$T0 "$W" >/dev/null; echo "--- REQ_MODE=$mode"; WATCH_NOW=$((T0+1800)) "$W" 2>&1 | sed 's/^/   /'
  echo "   警報檔=$([ -f "$WATCH_DIR/STREAM-ALERT.md" ] && echo yes || echo no)  request 檔=$([ -f "$WATCH_DIR/stream-escalate.request" ] && echo 仲喺 || echo 已消耗/已掉)  升級行=$(grep -c '🔴' "$WATCH_LOG_MD")"
done
unset REQ_MODE
