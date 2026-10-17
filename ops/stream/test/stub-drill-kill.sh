#!/usr/bin/env bash
# t9 F2 用:假 restart——殺 $FAKEPID_FILE 指住嘅(測試自己起嘅 scratch)假 backend,然後失敗 exit 1(模擬 restart 失敗且 backend 死咗)
p="$(cat "$FAKEPID_FILE" 2>/dev/null)"; [[ "$p" =~ ^[0-9]+$ ]] && kill "$p" 2>/dev/null; sleep 0.5
echo "stub restart failed; fake backend killed pid=$p"; exit 1
