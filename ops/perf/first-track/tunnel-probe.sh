#!/usr/bin/env bash
# ops/perf/first-track/tunnel-probe.sh — FIRST-TRACK-STEP01-EXEC-20260907
# §1 S0-3(G-7):tunnel 吞吐/RTT 探針。純讀,唔改任何行為,唔裝 cron
# (冇 launchctl 權限)——用法係「before 跑一次、部署完 after 再跑一次」,
# 兩次輸出夾埋比較。
#
# 用法: ops/perf/first-track/tunnel-probe.sh [熱歌id,預設42] [標籤,預設 before]
set -uo pipefail

HYMN_ID="${1:-42}"
LABEL="${2:-before}"
BASE="https://api.odemusics.com"
OUT_CSV="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tunnel-probe.csv"
N=5

echo "[tunnel-probe] label=$LABEL hymnId=$HYMN_ID N=$N base=$BASE"

# ---- /api/health RTT × N ----
rtts=()
for i in $(seq 1 "$N"); do
  t=$(curl -s -o /dev/null -w '%{time_total}' --max-time 5 "$BASE/api/health" 2>/dev/null)
  if [[ -n "$t" ]]; then
    ms=$(awk -v t="$t" 'BEGIN{printf "%.0f", t*1000}')
    rtts+=("$ms")
    echo "  health #$i: ${ms}ms"
  else
    echo "  health #$i: 失敗"
  fi
  sleep 0.3
done

# ---- /api/stream/<id> Range 0-1MB 吞吐 × N ----
kbps_list=()
for i in $(seq 1 "$N"); do
  t=$(curl -s -o /dev/null -w '%{time_total}' --max-time 15 -H "Range: bytes=0-1048575" "$BASE/api/stream/$HYMN_ID" 2>/dev/null)
  if [[ -n "$t" ]]; then
    kbps=$(awk -v t="$t" 'BEGIN{ if (t>0) printf "%.0f", (1048576/1024)/t; else print 0 }')
    kbps_list+=("$kbps")
    echo "  stream #$i: ${t}s → ${kbps}KB/s"
  else
    echo "  stream #$i: 失敗"
  fi
  sleep 0.3
done

# ---- median helper(純 awk,唔靠 sort -n 版本差異) ----
median() {
  local arr=("$@")
  local n=${#arr[@]}
  if [[ "$n" -eq 0 ]]; then echo ""; return; fi
  local sorted=($(printf '%s\n' "${arr[@]}" | sort -n))
  local mid=$((n/2))
  if (( n % 2 == 1 )); then echo "${sorted[$mid]}"; else echo $(( (sorted[$((mid-1))] + sorted[$mid]) / 2 )); fi
}

RTT_MED=$(median "${rtts[@]:-}")
KBPS_MED=$(median "${kbps_list[@]:-}")

# ---- cloudflared QUIC min_rtt + colo(冇 metrics endpoint 就留空) ----
QUIC_MIN_RTT=""
COLO=""
if metrics=$(curl -s --max-time 3 http://127.0.0.1:20241/metrics 2>/dev/null); then
  QUIC_MIN_RTT=$(echo "$metrics" | grep -o 'quic_client_min_rtt{[^}]*} [0-9.]*' | head -1 | awk '{print $2}')
  COLO=$(echo "$metrics" | grep -o 'cloudflared_tunnel_server_locations{[^}]*}' | head -1 | grep -o 'connection_id="[^"]*"' | head -1)
fi
if trace=$(curl -s --max-time 3 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null); then
  COLO_TRACE=$(echo "$trace" | grep '^colo=' | cut -d= -f2)
  [[ -n "$COLO_TRACE" ]] && COLO="$COLO_TRACE"
fi

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ ! -f "$OUT_CSV" ]]; then
  echo "ts,label,hymn_id,rtt_med_ms,kbps_med,quic_min_rtt_ms,colo" > "$OUT_CSV"
fi
echo "${TS},${LABEL},${HYMN_ID},${RTT_MED:-},${KBPS_MED:-},${QUIC_MIN_RTT:-},${COLO:-}" >> "$OUT_CSV"

echo "[tunnel-probe] rtt_med=${RTT_MED:-?}ms kbps_med=${KBPS_MED:-?}KB/s quic_min_rtt=${QUIC_MIN_RTT:-?} colo=${COLO:-?}"
echo "[tunnel-probe] 已寫入 $OUT_CSV"
