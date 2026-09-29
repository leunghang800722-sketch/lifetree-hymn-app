#!/usr/bin/env bash
echo "$(date +%T) stub-verify rc=${VERIFY_RC:-0}" >> "$STUB_DIR/cmd.calls"; exit "${VERIFY_RC:-0}"
