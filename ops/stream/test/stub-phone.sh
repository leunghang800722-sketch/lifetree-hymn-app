#!/usr/bin/env bash
# 假 openclaw(測試用 WATCH_PHONE_CMD):記每次 call 嘅 argv(-m 後面嗰個 = 訊息全文寫 phone.last)。模式由 $STUB_DIR/phone-mode:ok(預設)|fail|hang
echo "$(date +%T) | $*" >> "$STUB_DIR/phone.log"
prev=""; for a in "$@"; do [[ "$prev" == "-m" ]] && printf '%s' "$a" > "$STUB_DIR/phone.last"; [[ "$prev" == "-m" ]] && printf '%s\n' "$a" >> "$STUB_DIR/phone.msgs"; prev="$a"; done
case "$(cat "$STUB_DIR/phone-mode" 2>/dev/null)" in
  fail) echo "gateway unreachable (to=TESTTARGET-12345 token=abcd1234secretvalue)" >&2; exit 1 ;;
  hang) sleep 61; exit 0 ;;
esac
exit 0
