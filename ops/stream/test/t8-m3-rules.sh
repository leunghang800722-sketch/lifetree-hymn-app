#!/usr/bin/env bash
# M3:規則輸入時間窗(最近 1 個 hourly bucket;樣本<10 用 3 個;resolve total>=3)。用法:t8-m3-rules.sh <scratchdir>
# 注意:走真 build_bundle(pgrep backend / curl localhost /api/health 只讀),remedy 全 dry-run 指去 scratch。
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?}/m3"; REPO_PROD_STATE_PATH="$(cd "$(dirname "$0")/../../.." && pwd -P)/backend/data/stream-health-state.json"; T="$(cd "$(dirname "$0")" && pwd)"; D="$T/../stream-diagnose.sh"
rm -rf "$S"; mkdir -p "$S/stub" "$S/wd"
cat > "$S/mk.py" <<'PY'
import json,sys
last=json.loads(sys.argv[2])
h={"2026-09-29T10":{"upstream403":{"hls":0,"stream":0,"hlsTotal":100,"streamTotal":100},"resolve":{"total":50,"ok":50,"fail":0}},
   "2026-09-29T11":{"upstream403":{"hls":0,"stream":0,"hlsTotal":100,"streamTotal":100},"resolve":{"total":50,"ok":50,"fail":0}},
   "2026-09-29T12":last}
json.dump({"hourly":h},open(sys.argv[1],'w'))
PY
# 第三輪 O1:釘 health state fixture 喺 $WATCH_DIR 入面(測試模式 diagnose 強制只讀 $WATCH_DIR/stream-health-state.json,唔再讀 prod)。
# 默認 fixture = Layer B 健康(healthyB=1,botcheckB=0)⇒ 案3 預期 swap;HS_JSON 可覆蓋。
HS_DEFAULT='{"healthyB":1,"botcheckB":0,"bResolveFail":0,"b403":0}'
run() { echo "${HS_JSON:-$HS_DEFAULT}" > "$S/wd/stream-health-state.json"; python3 "$S/mk.py" "$S/om.json" "$1"; rm -rf "$S/inc"
  STREAM_WATCH_TEST=1 HEALTH_STATE="${HS_PATH:-$S/wd/stream-health-state.json}" STUB_DIR="$S/stub" WATCH_DIR="$S/wd" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/wd/r.log" REMEDY_STATE="$S/wd/rs.json" SELFHEAL_STATE="$S/sh.json" \
  REMEDY_STATUS_CMD="$T/stub-status.sh" STATUS_CMD="$T/stub-status.sh" OPS_METRICS_FILE="$S/om.json" DIAG_FORCE_RULES=1 BACKEND_LOG=/dev/null DIAG_DIR="$S/inc" "$D" m3 | sed -n 2,3p
  grep -E 'RATE|RESOLVE|HEALTHY_B|BOTCHECK_B' "$S/inc/facts.env" | tr '\n' ' '; echo; }
echo "== 案1:最近 1 鐘 403 40%(20 樣本,前兩鐘 0%;24h 率約 8%)"; run '{"upstream403":{"hls":8,"stream":0,"hlsTotal":20,"streamTotal":0},"resolve":{"total":5,"ok":5,"fail":0}}'
echo "== 案2:最近 1 鐘樣本 4 (<10) → 用最近 3 鐘加總"; run '{"upstream403":{"hls":4,"stream":0,"hlsTotal":4,"streamTotal":0},"resolve":{"total":2,"ok":0,"fail":2}}'
echo "== 案3:resolve 最近 1 鐘 3/3 fail(規則預期 swap;dry-run;視乎機上候選版本)"; run '{"upstream403":{"hls":0,"stream":0,"hlsTotal":50,"streamTotal":0},"resolve":{"total":3,"ok":0,"fail":3}}'

# ── 第三輪斷言(案3 預期 swap;④ 規則;HEALTHY_B 缺失 fail-safe;O1 隔離)──
RES3='{"upstream403":{"hls":0,"stream":0,"hlsTotal":50,"streamTotal":0},"resolve":{"total":3,"ok":0,"fail":3}}'
FAILS=0
verdict_of() { sed -n 1,3p "$S/last.out" | grep -E '^(VERDICT|ACTIONS)' | tr '\n' ' '; }
a() { run "$RES3" > "$S/last.out" 2>&1; local v; v="$(grep -E 'REASON|VERDICT' "$S/last.out" | tr '\n' ' ')"; echo "  [$1] ${v}| $(grep -oE 'HEALTHY_B=[^ ]*' "$S/last.out" | head -1)"; case "$v" in *"$2"*) echo "  [$1] PASS(含 $2)" ;; *) echo "  [$1] FAIL(預期含 $2)"; FAILS=$((FAILS+1)) ;; esac; }
echo "== 斷言A 案3 + healthyB=1 fixture ⇒ swap-ytdlp(O1:唔受 prod state 污染)"; HS_JSON="$HS_DEFAULT" a A3 swap-ytdlp
echo "== 斷言B healthyB=0 + botcheckB=3 + bResolveFail=3 ⇒ escalate(④ bot-check 原因,唔 swap)"; HS_JSON='{"healthyB":0,"botcheckB":3,"bResolveFail":3,"b403":0}' a B4 'bot-check'
echo "== 斷言C HEALTHY_B 缺失(fixture 冇欄)而規則 2 條件成立 ⇒ fail-safe escalate,唔 swap"; HS_JSON='{"botcheckB":0}' a C-failsafe 'HEALTHY_B 缺失'
grep -q '已 swap-ytdlp' "$S/last.out" && { echo "  [C] FAIL 唔應該 swap"; FAILS=$((FAILS+1)); } || echo "  [C] PASS 冇 swap"
echo "== 斷言D O1:HEALTH_STATE 指去 prod 路徑,測試模式照樣強制讀 \$WATCH_DIR fixture(healthyB=1 ⇒ swap)"; HS_PATH="$REPO_PROD_STATE_PATH" HS_JSON="$HS_DEFAULT" a D-isolation swap-ytdlp
echo "t8 第三輪斷言 FAILS=$FAILS(預期 0)"
