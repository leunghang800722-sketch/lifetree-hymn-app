#!/usr/bin/env bash
echo "$(date +%T) | $1 | $2" >> "$STUB_DIR/notify.log"
