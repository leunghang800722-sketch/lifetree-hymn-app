#!/usr/bin/env bash
# 串流健康探測 —— Eric 2026-08-19 拍板。
#
# 背景:2026-08-19 發現 YouTube 8/18 起唔再派 format 18,令 OCR 落載全線 403 燒咗
# 成晚先俾人發現(靠 Eric 覺得「好似冇乜產出」)。串流播放層今次冇中招(佢用
# bestaudio 唔係 18),**但同樣風險存在** —— googlevideo 隨時會對舊 client 轉態度。
# 呢個 script 就係唔好等用戶投訴先知。
#
# 做乜:curl 幾個固定 id 嘅 /api/stream/<id>(只攞頭 64KB),睇係咪 206。
# 唔係 206 就寫警報落 docs/SUPERVISION-LOG.md,下次有人查進度就會見到。
#
# 點解唔用 launchd:各班嘅 checkpoint 會核對 `launchctl list | grep hymnapp` 要夠
# **7 個 job**,加多個 job 會令佢哋以為出事。用 user crontab 就唔會撞。
# 點解唔用 Claude scheduled task:呢個純粹係三個 curl,開成個 session 好嘥資源。
#
# 裝法(已經裝咗,留返做紀錄):
#   crontab -l | { cat; echo "0 */6 * * * /Users/macbookpro/.openclaw/workspace/hymn-app/ops/lyrics/stream-healthcheck.sh"; } | crontab -
# 手動試:  ops/lyrics/stream-healthcheck.sh --verbose

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$REPO/docs/SUPERVISION-LOG.md"
STATE="$REPO/backend/data/stream-health-state.json"
HISTORY="$REPO/backend/data/stream-health.log"
IDS=(42 77 5431)          # 固定三首(唔同 org / 唔同年代),兩首以上 OK 就當健康
# base URL 可以用環境變數 override —— 純粹為咗**測得到失敗路徑**(指去一個死 port)。
# 唔好貪方便改 script 本身再複製去第二度測:咁做 REPO 會解析錯,寫唔到 log,
# 個測試就會「靜靜哋乜都冇做」而你以為佢過咗(2026-08-19 實測撞過呢個伏)。
BASE="${HYMN_STREAM_BASE:-http://127.0.0.1:3001}"
RANGE="0-65535"           # 只攞 64KB,對 YouTube 嘅負擔可以忽略
TIMEOUT=45
VERBOSE=0
[[ "${1:-}" == "--verbose" ]] && VERBOSE=1

ts() { date '+%Y-%m-%d %H:%M'; }
say() { [[ $VERBOSE -eq 1 ]] && echo "$@"; return 0; }

ok=0; fail=0; detail=""
for id in "${IDS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -r "$RANGE" \
         "$BASE/api/stream/$id" 2>/dev/null)
  say "  id=$id → HTTP ${code:-timeout}"
  if [[ "$code" == "206" ]]; then ok=$((ok+1)); else fail=$((fail+1)); detail="$detail id=$id:${code:-timeout}"; fi
done

# 三首入面兩首以上 206 = 健康(容忍單一首歌俾人落架 / 上游壞片,唔想扮警報)
healthy=0
(( ok >= 2 )) && healthy=1

prev_fail=$(python3 -c "
import json,sys
try: print(json.load(open('$STATE')).get('consecutiveFail',0))
except Exception: print(0)" 2>/dev/null || echo 0)

if (( healthy == 1 )); then
  new_fail=0
else
  new_fail=$((prev_fail + 1))
fi

python3 - "$STATE" "$new_fail" "$ok" "$fail" <<'PY' 2>/dev/null
import json,sys,datetime
json.dump({'lastCheck': datetime.datetime.now().isoformat(timespec='seconds'),
           'consecutiveFail': int(sys.argv[2]), 'ok': int(sys.argv[3]), 'fail': int(sys.argv[4])},
          open(sys.argv[1],'w'), indent=1)
PY
echo "$(ts) ok=$ok fail=$fail consecutiveFail=$new_fail$detail" >> "$HISTORY"
say "  → ok=$ok fail=$fail consecutiveFail=$new_fail"

# 寫警報嘅時機:①啱啱由健康變唔健康(第 1 次)②之後每 4 次連續失敗提一次
#(6 個鐘一 tick,即係大約一日一次,唔會洗版)③由唔健康返返healthy 都報一次
if (( healthy == 0 )) && { (( new_fail == 1 )) || (( new_fail % 4 == 0 )); }; then
  {
    echo ""
    echo "- 🔴 **串流健康警報 $(ts)** — \`/api/stream\` 探測 ${#IDS[@]} 首得 $ok 首返 206(連續第 $new_fail 次失敗)。實際:$detail"
    echo "  診斷次序:①\`pgrep -f 'node.*server.js'\` backend 生存?②\`yt-dlp -f \"bestaudio[ext=m4a]/bestaudio\" --get-url <片>\` 攞唔攞到 URL?③攞到 URL 就 \`curl -r 0-65535\` 睇係咪 googlevideo 層 403(即係 2026-08-19 OCR 嗰種 client 過舊問題,見 \`docs/YOUTUBE-403-BLOCK-2026-08-19.md\`)。"
  } >> "$LOG"
  say "  ⚠ 已寫警報落 SUPERVISION-LOG"
elif (( healthy == 1 )) && (( prev_fail > 0 )); then
  echo "" >> "$LOG"
  echo "- ✅ **串流健康恢復 $(ts)** — 之前連續失敗 $prev_fail 次,今次 $ok/${#IDS[@]} 首返 206。" >> "$LOG"
  say "  ✅ 已寫恢復訊息"
fi
exit 0
