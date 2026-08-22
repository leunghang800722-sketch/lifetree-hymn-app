#!/usr/bin/env bash
# 串流健康探測 —— Eric 2026-08-19 拍板;2026-08-22 加 Layer B(見下面)。
#
# 背景:2026-08-19 發現 YouTube 8/18 起唔再派 format 18,令 OCR 落載全線 403 燒咗
# 成晚先俾人發現(靠 Eric 覺得「好似冇乜產出」)。串流播放層今次冇中招(佢用
# bestaudio 唔係 18),**但同樣風險存在** —— googlevideo 隨時會對舊 client 轉態度。
# 呢個 script 就係唔好等用戶投訴先知。
#
# ⚠️ 2026-08-22 全庫 100% 播歌事故:呢個 script 由 8-21 19:14 到 8-22 13:14 五個 tick
# 全部 `ok=3 fail=0` 綠燈,但成個庫其實一首都播唔到。原因 = 病係「舊 yt-dlp 簽出嚟
# 嘅 URL 只開放頭 1MiB,之後全 403」,而舊版呢個 script 淨係攞 `bytes=0-65535`
# (64KB),**啱啱好落喺仲開放嗰 1MiB 之內**,所以探測同真實負載唔喺同一個象限,
# 全程假陽性。事故 + 結構性修復:YTDLP-UNIFY-PLAN-20260822.md。
#
# 做乜(兩層,兩層都要過先算健康):
#   Layer A:curl 幾個固定 id 嘅 /api/stream/<id>(頭 64KB)睇係咪 206。
#            角色 = 驗「backend 生存 + 全鏈路頭段通」。
#   Layer B:用**同 backend 現役同一隻** yt-dlp binary 行 --get-url,攞到條
#            googlevideo URL 之後**直接打 CDN**,攞 64KB @ offset 2MiB,睇係咪 206。
#            角色 = 驗「1MiB 之後仲派唔派貨」,即 8-22 嗰個病灶 range 本身。
#
# ⚠️ Layer B 一定要**繞過 backend 直打 googlevideo**,唔可以貪方便經 /api/stream 攞
# mid-range:backend 個 warm bufferCache 封頂 12MB,絕大部份詩歌成首入晒記憶體,
# upstream 死咗都可以由 cache 吐返 206 俾你 —— 咁就係補完一個假陽性即刻換第二個。
#
# 唔係 206 就寫警報落 docs/SUPERVISION-LOG.md,下次有人查進度就會見到。
#
# 點解唔用 launchd 嘅 hymnapp prefix:各班嘅 checkpoint 會核對
# `launchctl list | grep hymnapp` 要夠 **7 個 job**,加多個 hymnapp job 會令佢哋以為
# 出事。所以 label 用 com.hymnstream.healthcheck。
# 點解唔用 Claude scheduled task:呢個純粹係幾個 curl,開成個 session 好嘥資源。
#
# 排程:launchd `com.hymnstream.healthcheck`,每 10800s(3 小時,Eric 2026-08-22
# 由 6 小時改;plist 改完要 bootout + bootstrap 一次)。
# 手動試:  ops/lyrics/stream-healthcheck.sh --verbose

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$REPO/docs/SUPERVISION-LOG.md"
STATE="$REPO/backend/data/stream-health-state.json"
HISTORY="$REPO/backend/data/stream-health.log"

# 固定三首(唔同 org / 唔同年代),兩首以上 OK 就當健康。
# ⚠️ 呢三首 2026-08-22 查實音軌大細 = 5.6MB / 4.4MB / 3.0MB,全部遠過 Layer B 個
# 2MiB offset。**換 id 之前一定要重新查大細**(`yt-dlp -f "bestaudio[ext=m4a]/bestaudio"
# --print filesize <url>`),細過 2MiB 嘅歌 Layer B 會收 416,唔係 upstream 壞。
IDS=(42 77 5431)
YT_IDS=(PG_J_0gsMXA 7UkwavM5L1E 2GbxXhvdhhA)   # 同上面逐個對應(Layer B 直接用,唔使查 DB)

# base URL 可以用環境變數 override —— 純粹為咗**測得到失敗路徑**(指去一個死 port)。
# 唔好貪方便改 script 本身再複製去第二度測:咁做 REPO 會解析錯,寫唔到 log,
# 個測試就會「靜靜哋乜都冇做」而你以為佢過咗(2026-08-19 實測撞過呢個伏)。
BASE="${HYMN_STREAM_BASE:-http://127.0.0.1:3001}"
RANGE="0-65535"           # Layer A:只攞 64KB,對 YouTube 嘅負擔可以忽略
MID_RANGE="2097152-2162687"   # Layer B:64KB @ 2MiB —— 就係 8-22 嗰個病灶 range
# 全 app 唯一嘅 yt-dlp(同 backend/lib/ytdlpBin.js 同一個路徑;env 可 override 做比對)
YTDLP="${YTDLP_BIN:-$REPO/backend/tools/yt-dlp}"
TIMEOUT=45
RESOLVE_TIMEOUT=45
VERBOSE=0
[[ "${1:-}" == "--verbose" ]] && VERBOSE=1

ts() { date '+%Y-%m-%d %H:%M'; }
say() { [[ $VERBOSE -eq 1 ]] && echo "$@"; return 0; }

# ⚠️ macOS **冇** `timeout`(GNU coreutils 先有,呢部機冇裝 —— 2026-08-22 實測
# `command not found`)。如果照抄 Linux 寫法用 `timeout`,每次 resolve 都會即刻
# 127 死 → url 空 → 判做 upstream fail → **每 3 個鐘響一次假警報**,而個 script
# 自己睇落好似行緊。所以用 perl 嘅 alarm(macOS 一定有 perl)做硬性上限。
run_capped() {  # run_capped <秒> <cmd...>
  perl -e 'alarm shift; exec @ARGV or exit 127' "$@" 2>/dev/null
}

# ── Layer A:經 backend 攞頭 64KB ──────────────────────────────────
ok=0; fail=0; detail=""
for id in "${IDS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -r "$RANGE" \
         "$BASE/api/stream/$id" 2>/dev/null)
  say "  A id=$id → HTTP ${code:-timeout}"
  if [[ "$code" == "206" ]]; then ok=$((ok+1)); else fail=$((fail+1)); detail="$detail A:id=$id:${code:-timeout}"; fi
done

# ── Layer B:直打 googlevideo 攞 1MiB 之後嘅 mid-range ─────────────
# cfgerr = 探測配置本身有問題(binary 唔見咗 / 揀咗首細過 2MiB 嘅歌收 416),
# 唔算 upstream fail,唔好亂響警報,但要喺 log 見到。
mid=0; midfail=0; midcfg=0
ytver="?"
if [[ -x "$YTDLP" ]]; then
  ytver=$("$YTDLP" --version 2>/dev/null | tr -d '\n')
  [[ -z "$ytver" ]] && ytver="?"
  for yid in "${YT_IDS[@]}"; do
    url=$(run_capped "$RESOLVE_TIMEOUT" "$YTDLP" -f "bestaudio[ext=m4a]/bestaudio" \
          --get-url --no-playlist "https://www.youtube.com/watch?v=$yid" | head -1)
    if [[ "$url" != http* ]]; then
      midfail=$((midfail+1)); detail="$detail B:$yid:resolve-fail"
      say "  B $yid → resolve FAIL"
      continue
    fi
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -r "$MID_RANGE" "$url" 2>/dev/null)
    say "  B $yid → HTTP ${code:-timeout} (mid-range)"
    case "$code" in
      206) mid=$((mid+1)) ;;
      416) midcfg=$((midcfg+1)); detail="$detail B:$yid:416-too-short" ;;   # 條歌細過 2MiB = 探測配置問題
      *)   midfail=$((midfail+1)); detail="$detail B:$yid:${code:-timeout}" ;;
    esac
  done
else
  midcfg=${#YT_IDS[@]}
  detail="$detail B:no-binary($YTDLP)"
  say "  B 跳過:搵唔到 $YTDLP"
fi

# ── 判定 ───────────────────────────────────────────────────────────
# 三首入面兩首以上 206 = 該層健康(容忍單一首歌俾人落架 / 上游壞片,唔想扮警報)。
# Layer B 全部 cfgerr(binary 唔見 / 全部歌太短)= 探測本身壞咗,唔可以當 upstream
# 死;呢種情況 B 當「未驗到」(唔擋 healthy),但 log/警報要講明,等人去執探測配置。
healthy_a=0; (( ok >= 2 )) && healthy_a=1
healthy_b=0
b_tested=$(( mid + midfail ))
if (( b_tested == 0 )); then
  healthy_b=1          # 一次都驗唔到 → 唔判死,靠 cfgerr tag 提人
else
  (( mid >= 2 )) && healthy_b=1
  # 得一兩首驗到嘅情況(其餘 416):驗到嗰啲全部要過
  (( b_tested < 2 && midfail == 0 )) && healthy_b=1
fi
healthy=0
(( healthy_a == 1 && healthy_b == 1 )) && healthy=1

prev_fail=$(python3 -c "
import json,sys
try: print(json.load(open('$STATE')).get('consecutiveFail',0))
except Exception: print(0)" 2>/dev/null || echo 0)

if (( healthy == 1 )); then
  new_fail=0
else
  new_fail=$((prev_fail + 1))
fi

python3 - "$STATE" "$new_fail" "$ok" "$fail" "$mid" "$midfail" "$midcfg" "$ytver" <<'PY' 2>/dev/null
import json,sys,datetime
json.dump({'lastCheck': datetime.datetime.now().isoformat(timespec='seconds'),
           'consecutiveFail': int(sys.argv[2]), 'ok': int(sys.argv[3]), 'fail': int(sys.argv[4]),
           'mid': int(sys.argv[5]), 'midFail': int(sys.argv[6]), 'midCfgErr': int(sys.argv[7]),
           'ytdlp': sys.argv[8]},
          open(sys.argv[1],'w'), indent=1)
PY
cfgnote=""; (( midcfg > 0 )) && cfgnote=" mid=cfg-err:$midcfg"
echo "$(ts) ok=$ok fail=$fail mid=$mid midfail=$midfail$cfgnote ver=$ytver consecutiveFail=$new_fail$detail" >> "$HISTORY"
say "  → A ok=$ok fail=$fail | B mid=$mid midfail=$midfail cfgerr=$midcfg | ver=$ytver | consecutiveFail=$new_fail"

# 寫警報嘅時機:①啱啱由健康變唔健康(第 1 次)②之後每 4 次連續失敗提一次
#(3 個鐘一 tick,即係大約半日一次,唔會洗版)③由唔健康返返 healthy 都報一次
if (( healthy == 0 )) && { (( new_fail == 1 )) || (( new_fail % 4 == 0 )); }; then
  {
    echo ""
    if (( healthy_a == 0 && healthy_b == 0 )); then
      echo "- 🔴 **串流健康警報 $(ts)** — **兩層都失敗**(連續第 $new_fail 次)。Layer A(經 backend 頭 64KB)${#IDS[@]} 首得 $ok 首 206;Layer B(直打 googlevideo,64KB @ 2MiB)得 $mid 首 206。yt-dlp=$ytver。實際:$detail"
    elif (( healthy_a == 1 && healthy_b == 0 )); then
      echo "- 🔴 **串流健康警報 $(ts)** — ⚠️ **典型「1MiB 病」形態**:Layer A(頭 64KB,經 backend)$ok/${#IDS[@]} 首**過**,但 Layer B(直打 googlevideo,64KB @ 2MiB)得 $mid 首 206(連續第 $new_fail 次)。即係頭段派得、1MiB 之後 403 —— 用戶感受係「全庫播得幾秒就死/completely 播唔到」。實際:$detail"
      echo "  **第一件事查 yt-dlp 版本**(而家現役 \`$ytver\`,路徑 \`backend/tools/yt-dlp\`):2026-08-22 全庫事故就係 binary 太舊,YouTube 新 player 簽出嚟嘅 URL 只開放頭 1MiB。修法見 \`YTDLP-UNIFY-PLAN-20260822.md\`;人手升級:\`ops/ytdlp/update-ytdlp.sh --apply\`(canary 過先換,舊版留 \`backend/tools/yt-dlp.prev\` 可以 \`mv\` 返轉頭)。"
    else
      echo "- 🔴 **串流健康警報 $(ts)** — Layer A(經 backend)得 $ok/${#IDS[@]} 首 206,但 Layer B(直打 googlevideo)$mid 首過 —— **upstream 好地地,問題喺 backend 側**(連續第 $new_fail 次)。實際:$detail"
      echo "  診斷次序:①\`pgrep -f 'node.*server.js'\` backend 生存?②\`launchctl list | grep hymnapp\` 應該 7 個 job ③睇 backend log 有冇 503/crash loop。"
    fi
    (( midcfg > 0 )) && echo "  ⚠️ 另外有 $midcfg 首 Layer B 探測返 **cfg-err**(416 = 條歌細過 2MiB,或者搵唔到 binary)—— 呢個係**探測配置**問題唔係 upstream 問題,去 \`ops/lyrics/stream-healthcheck.sh\` 換返啲夠長嘅探測 id。"
  } >> "$LOG"
  say "  ⚠ 已寫警報落 SUPERVISION-LOG"
elif (( healthy == 1 )) && (( prev_fail > 0 )); then
  echo "" >> "$LOG"
  echo "- ✅ **串流健康恢復 $(ts)** — 之前連續失敗 $prev_fail 次,今次 Layer A $ok/${#IDS[@]} 首 206、Layer B $mid 首 mid-range 206(yt-dlp $ytver)。" >> "$LOG"
  say "  ✅ 已寫恢復訊息"
elif (( midcfg > 0 )) && (( healthy == 1 )); then
  # 健康但探測配置有問題:唔好靜靜哋當冇事(呢個 script 2026-08-19 就係「靜靜哋
  # 乜都冇做」而以為過咗),但都唔好當 fail 洗版 —— 每 8 個 tick 提一次。
  tickcount=$(wc -l < "$HISTORY" 2>/dev/null | tr -d ' ')
  if (( tickcount % 8 == 0 )); then
    echo "" >> "$LOG"
    echo "- ⚠️ **串流探測配置提醒 $(ts)** — 健康檢查過到,但 Layer B 有 $midcfg 首返 cfg-err(416 太短 / 搵唔到 binary),即係 mid-range 盲點冇完全補到。執:\`ops/lyrics/stream-healthcheck.sh\` 換探測 id。實際:$detail" >> "$LOG"
    say "  ⚠ 已寫 cfg-err 提醒"
  fi
fi
exit 0
