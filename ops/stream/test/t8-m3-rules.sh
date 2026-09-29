#!/usr/bin/env bash
# M3:規則輸入時間窗(最近 1 個 hourly bucket;樣本<10 用 3 個;resolve total>=3)。用法:t8-m3-rules.sh <scratchdir>
# 注意:走真 build_bundle(pgrep backend / curl localhost /api/health 只讀),remedy 全 dry-run 指去 scratch。
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?}/m3"; T="$(cd "$(dirname "$0")" && pwd)"; D="$T/../stream-diagnose.sh"
rm -rf "$S"; mkdir -p "$S/stub" "$S/wd"
cat > "$S/mk.py" <<'PY'
import json,sys
last=json.loads(sys.argv[2])
h={"2026-09-29T10":{"upstream403":{"hls":0,"stream":0,"hlsTotal":100,"streamTotal":100},"resolve":{"total":50,"ok":50,"fail":0}},
   "2026-09-29T11":{"upstream403":{"hls":0,"stream":0,"hlsTotal":100,"streamTotal":100},"resolve":{"total":50,"ok":50,"fail":0}},
   "2026-09-29T12":last}
json.dump({"hourly":h},open(sys.argv[1],'w'))
PY
run() { python3 "$S/mk.py" "$S/om.json" "$1"; rm -rf "$S/inc"
  STREAM_WATCH_TEST=1 STUB_DIR="$S/stub" WATCH_DIR="$S/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/wd/r.log" REMEDY_STATE="$S/wd/rs.json" SELFHEAL_STATE="$S/sh.json" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" STATUS_CMD="$T/stub-status.sh" OPS_METRICS_FILE="$S/om.json" DIAG_FORCE_RULES=1 BACKEND_LOG=/dev/null DIAG_DIR="$S/inc" "$D" m3 | sed -n 2,3p
  grep -E 'RATE|RESOLVE' "$S/inc/facts.env" | tr '\n' ' '; echo; }
echo "== 案1:最近 1 鐘 403 40%(20 樣本,前兩鐘 0%;24h 率約 8%)"; run '{"upstream403":{"hls":8,"stream":0,"hlsTotal":20,"streamTotal":0},"resolve":{"total":5,"ok":5,"fail":0}}'
echo "== 案2:最近 1 鐘樣本 4 (<10) → 用最近 3 鐘加總"; run '{"upstream403":{"hls":4,"stream":0,"hlsTotal":4,"streamTotal":0},"resolve":{"total":2,"ok":0,"fail":2}}'
echo "== 案3:resolve 最近 1 鐘 3/3 fail(規則預期 swap;dry-run;視乎機上候選版本)"; run '{"upstream403":{"hls":0,"stream":0,"hlsTotal":50,"streamTotal":0},"resolve":{"total":3,"ok":0,"fail":3}}'
