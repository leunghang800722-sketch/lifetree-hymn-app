#!/usr/bin/env bash
# 假 apply/restart 指令:記錄被 call,exit code 由 $STUB_RC(預設 0)
echo "$(date +%T) $(basename "$0") $*" >> "$STUB_DIR/cmd.calls"; echo "stub-cmd ran: $*"; exit "${STUB_RC:-0}"
