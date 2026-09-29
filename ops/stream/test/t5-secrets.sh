#!/usr/bin/env bash
# T5:密鑰過濾。正控:raw fixture 有命中;bundle/diagnosis/alert 三個檔 = 0。用法:t5-secrets.sh <scratchdir>
set -u
S="${1:?}"; T="$(cd "$(dirname "$0")" && pwd)"; PAT='JWT_SECRET|TWILIO|Bearer |password|FAKESIG|sig='
rm -rf "$S/t5"; mkdir -p "$S/t5/stub" "$S/t5/wd"
export STUB_DIR="$S/t5/stub" WATCH_DIR="$S/t5/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/t5/wd/remedy.log" REMEDY_STATE="$S/t5/wd/rs.json" SELFHEAL_STATE="$S/t5/sh.json" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" WATCH_STATE="$S/t5/wd/stream-watch-state.json" DIAG_FORCE_RULES=1
echo "正控:raw fixture 命中行數 = $(grep -cE "$PAT" "$T/fixtures/raw-with-fake-secrets.md")"
DIAG_DIR="$S/t5/inc" DIAG_BUNDLE_FILE="$T/fixtures/raw-with-fake-secrets.md" DIAG_FACTS_FILE="$T/fixtures/facts-backend-down.env" "$T/../stream-diagnose.sh" t5 >/dev/null
echo "--- bundle.md 內容"; cat "$S/t5/inc/bundle.md"
# alert:stub 診斷刻意回帶密鑰嘅 REASON,睇警報檔/SUPERVISION-LOG 有冇漏
cat > "$S/t5/leaky-diag.sh" <<'X'
#!/usr/bin/env bash
echo engine=leaky; echo "VERDICT: escalate"; echo "REASON: 見到 Authorization: Bearer FAKEJWT.aaa 同 JWT_SECRET=fake 同 password=hunter2"; echo "ACTIONS: none"
X
chmod +x "$S/t5/leaky-diag.sh"; echo bad > "$STUB_DIR/mode"; : > "$S/t5/LOG.md"
export WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_DIAGNOSE_CMD="$S/t5/leaky-diag.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" WATCH_LOG_MD="$S/t5/LOG.md"
WATCH_NOW=1790000000 "$T/../stream-watch.sh" >/dev/null; WATCH_NOW=1790001800 "$T/../stream-watch.sh" >/dev/null
echo "--- 檔案清單"; ls "$S/t5/wd" "$S/t5/wd"/stream-incident-* 2>/dev/null | head -20
for f in "$S/t5/inc/bundle.md" "$S/t5/inc/diagnosis.md" "$S/t5/wd/STREAM-ALERT.md" "$S/t5/LOG.md" "$STUB_DIR/notify.log"; do
  echo "grep '$PAT' $(basename "$f") → $(grep -cE "$PAT" "$f" 2>/dev/null)"; done
echo "--- STREAM-ALERT.md 診斷結論行:"; grep -E "診斷結論|升級原因" "$S/t5/wd/STREAM-ALERT.md"
