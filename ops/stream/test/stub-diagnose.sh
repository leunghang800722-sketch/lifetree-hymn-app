#!/usr/bin/env bash
# 假診斷:記一次 call,按 $STUB_DIR/verdict(預設 wait)回覆
echo "called id=${1:-}" >> "$STUB_DIR/diagnose.calls"
v="$(cat "$STUB_DIR/verdict" 2>/dev/null || echo wait)"
echo "engine=stub"; echo "VERDICT: $v"; echo "REASON: stub 診斷 $v"; echo "ACTIONS: none"
