#!/usr/bin/env bash
# T17:STREAM-PHONE-NOTIFY 第二輪(Opus 驗收修正)ops 部分——healthcheck Layer B stderr bot-check 計數(botcheckB)、警報文字分支、curl -4、
#   selfheal 用 state.botcheckB 判形態④。全 testlib 測試模式 + stub(yt-dlp stub 按 $S/ytmode 出 stderr;Layer A 用 stub-a-server;CDN 用 stub),零真網絡。
# 用法:t17-second-round.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t17"; T="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$T/../../.." && pwd -P)"; HC="$REPO/ops/lyrics/stream-healthcheck.sh"
rm -rf "${S:?}"; mkdir -p "$S"
python3 "$T/stub-a-server.py" > "$S/port" & SRV=$!; sleep 0.6; PORT="$(cat "$S/port")"
cat > "$S/yt" <<'STUB'
#!/bin/sh
[ "$1" = "--version" ] && { echo stub; exit 0; }
m="$(cat "$(dirname "$0")/ytmode")"
case "$m" in
  bot)    echo "ERROR: [youtube] xyz: Sign in to confirm you’re not a bot. Use --cookies-from-browser" >&2; exit 1 ;;
  http429) echo "ERROR: unable to download video data: HTTP Error 429: Too Many Requests" >&2; exit 1 ;;
  login)  echo "ERROR: [youtube] xyz: LOGIN_REQUIRED" >&2; exit 1 ;;
  other)  echo "ERROR: unable to extract uploader id; id 14291 and size 24290 broke" >&2; exit 1 ;;
  ok)     echo "http://stub.invalid/audio"; exit 0 ;;
esac
STUB
chmod +x "$S/yt"
printf '#!/usr/bin/env bash\necho 403\n' > "$S/cdn403.sh"; chmod +x "$S/cdn403.sh"
hc1() { # $1=dir $2=prev consecutiveFail $3=cdn → 跑一次 healthcheck(verbose 輸出落 $1/out.txt)
  local d="$1"; echo "{\"consecutiveFail\": $2}" > "$d/wd/stream-health-state.json"
  env WATCH_DIR="$d/wd" YTDLP_BIN="$S/yt" HYMN_STREAM_BASE="http://127.0.0.1:$PORT" HC_LIGHT=0 HC_IP_CMD= ${3:+HC_CDN_FETCH_CMD="$3"} \
      SELFHEAL_DRY_RUN=1 SELFHEAL_STATE="$d/sh.json" SELFHEAL_BACKEND_LOG="$d/none.log" "$HC" --verbose > "$d/out.txt" 2>&1; echo $?
}
run() { # $1=name $2=ytmode $3=cdn(空=206) $4=第一次 prev(預設 0:新事故第 1 次 → 寫警報文字) 之後再跑 prev=1(本 tick 變 2 → selfheal 判形態)
  local d="$S/$1"; rm -rf "${d:?}"; mkdir -p "$d/wd"; : > "$d/wd/SUPERVISION-LOG.md"; echo "$2" > "$S/ytmode"
  local rc1; rc1="$(hc1 "$d" "${4:-0}" "${3:-}")"
  python3 - "$d/wd/stream-health-state.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("  state: " + " ".join("%s=%s" % (k, d.get(k)) for k in ('consecutiveFail', 'mid', 'midFail', 'botcheckB', 'bResolveFail', 'b403', 'healthyB')) + "")
PY
  echo "  警報首行:$(grep -m1 '🔴' "$d/wd/SUPERVISION-LOG.md" | cut -c1-120)"
  echo "  含「1MiB 病」=$(grep -c '1MiB 病' "$d/wd/SUPERVISION-LOG.md") 含「換 yt-dlp 無用」=$(grep -c '換 yt-dlp 無用' "$d/wd/SUPERVISION-LOG.md") 含「第一件事查 yt-dlp」=$(grep -c '第一件事查 yt-dlp' "$d/wd/SUPERVISION-LOG.md")"
  hc1 "$d" 1 "${3:-}" >/dev/null
  echo "  selfheal(第 2 tick,dry-run,backend log 檔不存在):$(grep -m1 '^形態判定' "$d/out.txt" | cut -c1-70) | $(grep -m1 '^action=' "$d/out.txt" | cut -c1-60)"
}
echo "== C1 bot-check:B 三首全 resolve-fail 且 stderr 'Sign in to confirm'(A 過)→ botcheckB=3、警報改寫出口 IP;selfheal 單靠 state 判④(backend log 檔不存在)"
run c1 bot
echo "== C2 stderr 'HTTP Error 429' → 計"; run c2 http429
echo "== C3 stderr 'LOGIN_REQUIRED' → 計"; run c3 login
echo "== C4 負控:resolve-fail 但 stderr 冇 bot-check 字眼(含 14291/24290 數字,唔可誤中 429)→ botcheckB=0、仍寫舊「1MiB 病」文字;selfheal 非④"
run c4 other
echo "== C5 負控(真 yt-dlp 過舊形):resolve 成功、googlevideo 403 → b403=3、botcheckB=0、舊「1MiB 病」文字;selfheal 非④"
run c5 ok "$S/cdn403.sh"
echo "== C6 負控:全部健康(resolve ok、206)→ 無警報、healthyB=1"; run c6 ok "" 0
echo "== curl -4(R3 防 dual-stack 誤報 IP 變)"
grep -n 'ifconfig.me' "$HC" | grep -v '^.*#' | sed 's/^/  /'; echo "  含 -4 行數=$(grep -c 'curl -4 -s -m 5 https://ifconfig.me' "$HC")"
echo "  prod 暫存檔(hc-berr.*)殘留於 \$TMPDIR:$(ls "${TMPDIR:-/tmp}"/hc-berr.* 2>/dev/null | wc -l | tr -d ' ')(預期 0)"
kill $SRV 2>/dev/null
