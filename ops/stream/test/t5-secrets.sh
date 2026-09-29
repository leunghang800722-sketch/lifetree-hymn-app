#!/usr/bin/env bash
# T5/V5(M4):密鑰過濾。正控:raw fixture 六類密鑰全有命中;過濾後 bundle/diagnosis/alert/state/LOG/notify 全 0。
# 負控:正常 🔴 SUPERVISION-LOG 升級行原文保留(唔准變 [filtered]);正常診斷字眼(PO token / cookies)行保留。用法:t5-secrets.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"
# 六類 + 混合嘅「值」特徵(唔含 key 名,只認假值本身)
VALS='FAKEJWT|hunter2-fake|fake-not-real-123|fakefakefake|FAKESIG123|FAKELSIG|FAKESIGNATURE9|FAKEKEY77|FAKETOK55|eyJFAKEHEADER|FAKESIGPART|ACfa4e5c0de|SKfa4e5c0de|fakepass123|fakeuser'
rm -rf "$S/t5"; mkdir -p "$S/t5/stub" "$S/t5/wd"
export STREAM_WATCH_TEST=1 STUB_DIR="$S/t5/stub" WATCH_DIR="$S/t5/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/t5/wd/remedy.log" REMEDY_STATE="$S/t5/wd/rs.json" SELFHEAL_STATE="$S/t5/sh.json" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" WATCH_STATE="$S/t5/wd/stream-watch-state.json" DIAG_FORCE_RULES=1
echo "=== 正控:raw fixture 每一類嘅命中行數 ==="
for v in FAKEJWT hunter2-fake fake-not-real-123 fakefakefake FAKESIG123 FAKESIGNATURE9 FAKEKEY77 FAKETOK55 eyJFAKEHEADER ACfa4e5c0de SKfa4e5c0de fakepass123; do printf '   %-20s raw=%s\n' "$v" "$(grep -c "$v" "$T/fixtures/raw-with-fake-secrets.md")"; done
echo "   合計含任何假值嘅行 = $(grep -cE "$VALS" "$T/fixtures/raw-with-fake-secrets.md")"
DIAG_DIR="$S/t5/inc" DIAG_BUNDLE_FILE="$T/fixtures/raw-with-fake-secrets.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" "$T/../stream-diagnose.sh" t5 >/dev/null
echo "--- bundle.md(過濾後)"; cat "$S/t5/inc/bundle.md"
# watch 層:stub 診斷刻意回帶密鑰嘅 REASON(經 leaky-diag)+ 帶密鑰嘅 status summary
cat > "$S/t5/leaky-diag.sh" <<'X'
#!/usr/bin/env bash
echo engine=leaky; echo "VERDICT: escalate"; echo "REASON: 見到 Authorization: Bearer FAKEJWT.aaa 同 JWT_SECRET=fake-not-real-123 同 password=hunter2-fake 同 ?sig=FAKESIG123 同 eyJFAKEHEADER12345.eyJFAKEPAYLOAD12345.FAKESIGPART_abc"; echo "ACTIONS: none"
X
chmod +x "$S/t5/leaky-diag.sh"; echo bad > "$STUB_DIR/mode"; : > "$S/t5/LOG.md"
export WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_DIAGNOSE_CMD="$S/t5/leaky-diag.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" WATCH_LOG_MD="$S/t5/LOG.md"
WATCH_NOW=1790000000 "$T/../stream-watch.sh" >/dev/null; WATCH_NOW=1790001800 "$T/../stream-watch.sh" >/dev/null
echo "=== 檔案清單 ==="; ls "$S/t5/wd" | head -20
echo "=== 六類值 grep(全部應 = 0)==="
for f in "$S/t5/inc/bundle.md" "$S/t5/inc/diagnosis.md" "$S/t5/wd/STREAM-ALERT.md" "$S/t5/LOG.md" "$STUB_DIR/notify.log" "$S/t5/wd/stream-watch-state.json"; do
  echo "grep VALS $(basename "$f") → $(grep -cE "$VALS" "$f" 2>/dev/null)"; done
echo "--- state json 內 diagReason / escalateReason:"; python3 -c "
import json;d=json.load(open('$S/t5/wd/stream-watch-state.json'));print(' diagReason =',d.get('diagReason'));print(' escalateReason =',d.get('escalateReason'))"
echo "=== 負控:SUPERVISION-LOG 🔴 升級行(骨架保留)==="; grep -E '🔴' "$S/t5/LOG.md" | cut -c1-400
echo "   含 [filtered: sensitive line] 嘅行數 = $(grep -c 'filtered: sensitive line' "$S/t5/LOG.md")(預期 0)"
echo "--- 負控:bundle 內正常字眼行保留:"; grep -E 'PO token|status=403 id=77' "$S/t5/inc/bundle.md"
echo "--- STREAM-ALERT.md 診斷結論/升級原因行:"; grep -E "診斷結論|升級原因" "$S/t5/wd/STREAM-ALERT.md"
