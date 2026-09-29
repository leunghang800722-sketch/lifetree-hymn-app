#!/usr/bin/env bash
# T3/V2/V4:stream-diagnose.sh 管道測試(mock-claude,唔係真模型)。用法:t3-diagnose-plumbing.sh <scratchdir>
#  A. 冇 ai-on 檔 → mock 零次被 call(V2)
#  B. 有 ai-on:ok / noverdict / autherr / hang → argv / cwd / env 證據 + fallback(V2)
#  C. 偽造 VERDICT ×5 + is_error(V4)
set -u
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"; D="$T/../stream-diagnose.sh"
rm -rf "$S/t3m"; mkdir -p "$S/t3m/stub" "$S/t3m/wd"
export STREAM_WATCH_TEST=1 STUB_DIR="$S/t3m/stub" WATCH_DIR="$S/t3m/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/t3m/wd/remedy.log" REMEDY_STATE="$S/t3m/wd/rs.json" \
  SELFHEAL_STATE="$S/t3m/sh.json" SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply" SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" HYMN_STREAM_BASE="http://127.0.0.1:9" WATCH_STATE="$S/t3m/none.json" \
  DIAG_BUNDLE_FILE="$T/fixtures/bundle-backend-down.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" DIAG_CLAUDE_BIN="$T/mock-claude.sh"
calls() { cat "$STUB_DIR/mock-claude.calls" 2>/dev/null | grep -c '^cwd='; }
echo "=== A. 冇 ~/.hymn-deploy/stream-watch.ai-on(WATCH_DIR=scratch 內冇該檔)→ mock 應零次被 call ==="
export MOCK_MODE=ok; DIAG_DIR="$S/t3m/inc-noaion" "$D" m-noaion | sed 's/^/  /'
echo "  mock-claude 被 call 次數 = $(calls)(預期 0)"; echo "  claude.stderr: $(cat "$S/t3m/inc-noaion/claude.stderr")"
touch "$WATCH_DIR/stream-watch.ai-on"
echo "=== A2. ai-on + no-ai 同時存在 → no-ai 優先(仍零 call)==="
touch "$WATCH_DIR/stream-watch.no-ai"; DIAG_DIR="$S/t3m/inc-noai" "$D" m-noai | sed 's/^/  /'; echo "  mock-claude 被 call 次數 = $(calls)(預期 0)"; rm -f "$WATCH_DIR/stream-watch.no-ai"
for mode in ok illegal direct probes-none noverdict autherr hang; do
  echo "=== B. ai-on,mock MOCK_MODE=$mode ==="; export MOCK_MODE=$mode; [[ $mode == hang ]] && export DIAG_TIMEOUT=3 || unset DIAG_TIMEOUT
  s=$(date +%s); DIAG_DIR="$S/t3m/inc-$mode" "$D" "m-$mode" | sed 's/^/  /'; echo "  elapsed=$(( $(date +%s)-s ))s"
done
unset DIAG_TIMEOUT
echo "=== C. 偽造 VERDICT / is_error(V4)==="
for mode in forged-quote forged-double forged-early forged-noaction forged-bad iserror; do
  echo "--- MOCK_MODE=$mode"; export MOCK_MODE=$mode; DIAG_DIR="$S/t3m/inc-$mode" "$D" "m-$mode" | sed 's/^/  /'
done
echo "=== mock-claude.calls(argv / cwd / env / 祖先 settings 證據)==="; cat "$STUB_DIR/mock-claude.calls"
echo "=== remedy.log ==="; cat "$REMEDY_LOG"
echo "=== 孤兒檢查:hang mode 嘅 sleep 300 有冇殘留(只查自己 scratch 起嘅,以 PPID=1 + 命令行 sleep 300)==="
ps -axo pid,ppid,command | grep -E '[s]leep 300' | awk '$2==1' | head -3; echo "(以上如無輸出=冇 PPID=1 嘅 sleep 300)"
echo "=== D. C-1:兩回合證據(ok/illegal):probes.md、actions.md、ignored 計數、canary ==="
for m in ok illegal; do echo "--- $m: probes.md"; cat "$S/t3m/inc-$m/ai/probes.md" 2>/dev/null | head -30; echo "--- $m: actions.md"; cat "$S/t3m/inc-$m/ai/actions.md" 2>/dev/null; echo "--- $m: diagnosis.md"; cat "$S/t3m/inc-$m/diagnosis.md"; done
echo "canary /tmp/pwn-semicolon /tmp/pwn-probe 存在? $(ls /tmp/pwn-semicolon /tmp/pwn-probe 2>&1 | grep -c 'No such')/2 個唔存在(預期 2)"
