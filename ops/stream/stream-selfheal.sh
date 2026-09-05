#!/usr/bin/env bash
# ops/stream/stream-selfheal.sh — 串流自動修復梯(STREAM-SELFHEAL-PLAN-20260905 S2)
#
# Eric 拍板:Q1(a) 只喺壞咗先自動換 yt-dlp / Q3 准自動重開 backend。
#
# 由 ops/lyrics/stream-healthcheck.sh 每 tick 尾段呼叫(健康 30 分鐘一 tick),
# 傳入嗰次探測嘅七個數:
#   --healthy-a --healthy-b --mid --midfail --ok --fail --detail
# 自己嗰份 state 存喺 backend/data/stream-selfheal-state.json(env SELFHEAL_STATE
# 可 override);consecutiveFail 讀返 stream-healthcheck.sh 啱啱寫低嗰份
# backend/data/stream-health-state.json(env HEALTH_STATE 可 override)。
#
# ── 三種故障形態(判定次序,唔理絕對值,睇傳入嘅 midfail/healthy_a/healthy_b)──
#   ① yt-dlp   — midfail>=2(1MiB 病,不論 A 點)
#   ② backend  — healthy_a==0 而 healthy_b==1(upstream 好地地,backend 側死)
#   ③ YouTube側 — 其他(兩層都壞 / ① 試完都唔得)
#
# ── 動作 ──────────────────────────────────────────────────────────
#   ① swapsToday<1:行 $SELFHEAL_APPLY_CMD(預設 ops/ytdlp/update-ytdlp.sh --apply)。
#      用 readlink 前後對比判斷有冇真係換咗(而唔係 parse 佢啲 stdout 文字,
#      因為嗰個 script 好多分支唔輸出 APPLIED 字眼)。換咗就即刻重跑 Layer B
#      直打(唔經 backend)—— ①嘅成敗淨係睇呢個。Layer B 唔過就 rollback
#      條 symlink,升級做③處理。Layer B 過但 Layer A(healthy_a)仍然係 0 嗰陣
#      (2026-09-05 Opus 驗收 §2a 揭到嘅 false-green):**唔會**寫🟢/清 alert,
#      會保持 alert.active=1,訊息講明「已換版,等 Layer A 下一 tick 重驗」
#      (backend Layer A 打嘅係 playbackRetry:true 嗰條路,resolveAudio.js
#      FAIL_TTL_PLAYBACK_MS=60 秒,唔係 FAIL_TTL_MS 15 分鐘嗰個——15 分鐘嗰個
#      淨係管批量/預取,同呢度冇關)。
#   ② restartsToday<2:行 $SELFHEAL_RESTART_CMD(預設 ops/deploy/backend-restart.sh
#      --same-code)。嗰個 script 自己會查 approved.json/HEAD gate,gate 唔過
#      會非 0 exit 並喺 stderr 度有 "abort:HEAD" —— 呢度攔截返嚟寫成人話警報,
#      唔會嘗試繞過 gate。過咗就等 $SELFHEAL_RECHECK_SLEEP 秒(預設 15)重跑
#      Layer A。
#   ③ 或者安全閥觸頂(今日已換 yt-dlp 1 次 / 已重開 backend 2 次):只寫警報,
#      唔郁手,交返俾下個 tick(30 分鐘後)再試。
#   健康返(consecutiveFail==0 而之前 alert.active):寫恢復,alert.active=false,
#      同時重置節流用嘅 lastActionTick/lastActionForm(新一輪故障由頭計)。
#
# 安全閥:每日(本機日曆日)最多自動換 yt-dlp 1 次、自動重開 backend 2 次。
# 呢個 script 唔會直接改 launchctl / backend 之外嘅任何嘢,亦唔會自己起
# node process —— 全部經返 update-ytdlp.sh / backend-restart.sh 呢兩條已經
# 有 gate/canary 保護嘅路徑。
#
# ── 節流(2026-09-05 Opus 驗收 §7 P7:selfheal 自己完全冇節流,同一單故障
#     每 30 分鐘一個 tick 就再 call 一次 apply/restart 兼寫一行 SUPERVISION-LOG,
#     抵消咗 healthcheck 自己嗰個「每 12 次先報一次」嘅節流)──────────────
# 除咗上面嘅「每日安全閥」之外,再加一層「幾耐先郁一次手/寫一次人話警報」:
#   · 「連續 fail 剛到 2」(呢個故障頭一次符合郁手門檻)—— 一定郁手/寫警報。
#   · 之後同一種形態(用未加後綴嘅原始 form,即 ①yt-dlp/②backend/③YouTube側,
#     故意唔理 rollback 之後加嘅「(①已試過)」呢類後綴,否則 rollback 令
#     form 文字跳嚟跳去,節流會被繞過)持續,每 12 個 tick(= 30 分鐘 × 12 =
#     6 小時)先再郁手/寫一次。
#   · 形態一變(即係 form 同 state 記低嗰個 lastActionForm 唔同)—— 當新消息,
#     即刻郁手/寫警報,唔等 12 tick。
# state 用 lastActionTick(上次真正郁手/寫警報嗰刻嘅 consecutiveFail 值)同
# lastActionForm 記低。冇到期(due=0)嗰啲 tick:唔會 call apply/restart,唔會
# 寫 SUPERVISION-LOG,但 `stream-selfheal.log`(history,machine log)照樣
# 每 tick 記一行(顯示 due=0 throttled),alert 狀態(active/form/message)照樣
# 更新落 state 俾 stream-status.sh 讀到最新現況。
#
# SELFHEAL_DRY_RUN=1:全部側效應(symlink 換/rollback、真正行 restart cmd、
# 網絡 resolve/curl、寫 state/log)一律跳過,淨係印「會做乜」;唔受節流影響
# (手動試嘅時候想睇成套流程行一次)。
#
# 手動試(唔會郁任何嘢):
#   SELFHEAL_DRY_RUN=1 ops/stream/stream-selfheal.sh --healthy-a 1 --healthy-b 0 \
#     --mid 0 --midfail 3 --ok 3 --fail 0 --detail "B:x:403" --verbose

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

LOG="${SELFHEAL_LOG_MD:-$REPO/docs/SUPERVISION-LOG.md}"
STATE="${SELFHEAL_STATE:-$REPO/backend/data/stream-selfheal-state.json}"
HEALTH_STATE="${HEALTH_STATE:-$REPO/backend/data/stream-health-state.json}"
HISTORY="${SELFHEAL_HISTORY:-$REPO/backend/data/stream-selfheal.log}"

YTDLP_LINK="${YTDLP_LINK:-$REPO/backend/tools/yt-dlp}"
YTDLP_DIR="$(dirname "$YTDLP_LINK")"
APPLY_CMD="${SELFHEAL_APPLY_CMD:-$REPO/ops/ytdlp/update-ytdlp.sh --apply}"
RESTART_CMD="${SELFHEAL_RESTART_CMD:-$REPO/ops/deploy/backend-restart.sh --same-code}"
DRY_RUN="${SELFHEAL_DRY_RUN:-0}"
RECHECK_SLEEP="${SELFHEAL_RECHECK_SLEEP:-15}"

BASE="${HYMN_STREAM_BASE:-http://127.0.0.1:3001}"
IDS=(${SELFHEAL_IDS:-42 77 5431})
RANGE="${SELFHEAL_RANGE:-0-65535}"
YT_IDS=(${SELFHEAL_YT_IDS:-PG_J_0gsMXA 7UkwavM5L1E 2GbxXhvdhhA})
MID_RANGE="${SELFHEAL_MID_RANGE:-2097152-2162687}"
CURL_TIMEOUT="${SELFHEAL_CURL_TIMEOUT:-45}"
RESOLVE_TIMEOUT="${SELFHEAL_RESOLVE_TIMEOUT:-45}"
SWAP_LIMIT="${SELFHEAL_SWAP_LIMIT:-1}"
RESTART_LIMIT="${SELFHEAL_RESTART_LIMIT:-2}"
THROTTLE_TICKS="${SELFHEAL_THROTTLE_TICKS:-12}"

VERBOSE=0
healthy_a=1; healthy_b=1; mid=0; midfail=0; ok=0; fail=0; detail=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --healthy-a) healthy_a="${2:-1}"; shift 2 ;;
    --healthy-b) healthy_b="${2:-1}"; shift 2 ;;
    --mid) mid="${2:-0}"; shift 2 ;;
    --midfail) midfail="${2:-0}"; shift 2 ;;
    --ok) ok="${2:-0}"; shift 2 ;;
    --fail) fail="${2:-0}"; shift 2 ;;
    --detail) detail="${2:-}"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) shift ;;
  esac
done

ts() { date '+%Y-%m-%d %H:%M'; }
say() { [[ $VERBOSE -eq 1 ]] && echo "$@"; return 0; }

# ⚠️ macOS 冇 GNU `timeout`,用 perl alarm 頂硬上限(同 stream-healthcheck.sh /
# update-ytdlp.sh 一致做法)。
run_capped() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@" 2>/dev/null; }

# ── 讀 selfheal state(跨日重置計數)────────────────────────────────
read_state() {
  python3 - "$STATE" <<'PY'
import json, sys, datetime
path = sys.argv[1]
today = datetime.date.today().isoformat()
try:
    d = json.load(open(path))
    if not isinstance(d, dict):
        d = {}
except Exception:
    d = {}
if d.get('date') != today:
    d['date'] = today
    d['swapsToday'] = 0
    d['restartsToday'] = 0
d.setdefault('swapsToday', 0)
d.setdefault('restartsToday', 0)
d.setdefault('lastAction', 'none')
d.setdefault('lastActionAt', '')
al = d.get('alert') or {}
al.setdefault('active', False)
al.setdefault('since', '')
al.setdefault('form', '')
al.setdefault('message', '')
d['alert'] = al
d.setdefault('pendingRecheck', None)
d.setdefault('lastActionTick', 0)
d.setdefault('lastActionForm', '')

def esc(s):
    return str(s).replace("'", "'\\''")

print(f"ST_SWAPS='{int(d['swapsToday'])}'")
print(f"ST_RESTARTS='{int(d['restartsToday'])}'")
print(f"ST_LASTACTION='{esc(d['lastAction'])}'")
print(f"ST_LASTACTIONAT='{esc(d['lastActionAt'])}'")
print(f"ST_ALERT_ACTIVE='{1 if al['active'] else 0}'")
print(f"ST_ALERT_SINCE='{esc(al['since'])}'")
print(f"ST_ALERT_FORM='{esc(al['form'])}'")
print(f"ST_ALERT_MSG='{esc(al['message'])}'")
print(f"ST_LASTACTIONTICK='{int(d['lastActionTick'] or 0)}'")
print(f"ST_LASTACTIONFORM='{esc(d['lastActionForm'])}'")
PY
}
eval "$(read_state)"

consecutiveFail=$(python3 -c "
import json
try:
    print(int(json.load(open('$HEALTH_STATE')).get('consecutiveFail', 0)))
except Exception:
    print(0)
" 2>/dev/null || echo 0)

# ── 寫 selfheal state(DRY_RUN 全跳過)────────────────────────────
write_state() {
  # $1=swaps $2=restarts $3=lastAction $4=lastActionAt $5=alertActive(0/1)
  # $6=alertSince $7=alertForm $8=alertMsg $9=pendingRecheck
  # $10=lastActionTick $11=lastActionForm
  [[ "$DRY_RUN" == "1" ]] && return 0
  python3 - "$STATE" "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9" "${10}" "${11}" <<'PY'
import json, sys, datetime
path = sys.argv[1]
(swaps, restarts, lastAction, lastActionAt, alertActive, alertSince, alertForm,
 alertMsg, pendingRecheck, lastActionTick, lastActionForm) = sys.argv[2:13]
data = {
    "date": datetime.date.today().isoformat(),
    "swapsToday": int(swaps),
    "restartsToday": int(restarts),
    "lastAction": lastAction,
    "lastActionAt": lastActionAt,
    "alert": {
        "active": alertActive == "1",
        "since": alertSince,
        "form": alertForm,
        "message": alertMsg,
    },
    "pendingRecheck": (pendingRecheck if pendingRecheck else None),
    "lastActionTick": int(lastActionTick or 0),
    "lastActionForm": lastActionForm,
}
json.dump(data, open(path, "w"), indent=1, ensure_ascii=False)
PY
}

hist() {
  [[ "$DRY_RUN" == "1" ]] && { say "  [dry-run] history: $*"; return 0; }
  echo "$(ts) $*" >> "$HISTORY"
}
supervision() {
  # $1 = 主行, $2(可選) = 附加行
  [[ "$DRY_RUN" == "1" ]] && { say "  [dry-run] supervision: $1"; return 0; }
  { echo ""; echo "$1"; [[ -n "${2:-}" ]] && echo "$2"; } >> "$LOG"
}

# ── Layer B(直打 googlevideo)/ Layer A(經 backend)重驗 helper ──────
verify_layer_b() {
  local m=0 mf=0 yid url code
  for yid in "${YT_IDS[@]}"; do
    url=$(run_capped "$RESOLVE_TIMEOUT" "$YTDLP_LINK" -f "bestaudio[ext=m4a]/bestaudio" \
          --get-url --no-playlist "https://www.youtube.com/watch?v=$yid" | head -1)
    if [[ "$url" != http* ]]; then mf=$((mf+1)); say "  [verifyB] $yid → resolve FAIL"; continue; fi
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" -r "$MID_RANGE" "$url" 2>/dev/null)
    say "  [verifyB] $yid → HTTP ${code:-timeout}"
    [[ "$code" == "206" ]] && m=$((m+1)) || mf=$((mf+1))
  done
  VB_MID=$m; VB_MIDFAIL=$mf
}
verify_layer_a() {
  local o=0 f=0 id code
  for id in "${IDS[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" -r "$RANGE" "$BASE/api/stream/$id" 2>/dev/null)
    say "  [verifyA] id=$id → HTTP ${code:-timeout}"
    [[ "$code" == "206" ]] && o=$((o+1)) || f=$((f+1))
  done
  VA_OK=$o; VA_FAIL=$f
}

now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ══ 1. 恢復判斷(優先於一切,包括 consecutiveFail<2 短路)══════════════
if (( consecutiveFail == 0 )) && [[ "$ST_ALERT_ACTIVE" == "1" ]]; then
  say "健康已恢復(之前形態 $ST_ALERT_FORM),清 alert,節流計數歸零"
  hist "RECOVERED 之前形態=$ST_ALERT_FORM(之前訊息:$ST_ALERT_MSG)"
  supervision "- ✅ **自動修復梯:健康已恢復 $(ts)** — 之前形態 \`$ST_ALERT_FORM\`,而家 healthy_a=$healthy_a healthy_b=$healthy_b(ok=$ok mid=$mid)。alert 已清。"
  write_state "$ST_SWAPS" "$ST_RESTARTS" "recovered" "$now_iso" "0" "" "" "" "" "0" ""
  exit 0
fi

# ══ 2. 容忍單次 blip:consecutiveFail<2 淨係更新 state,唔郁手 ═══════
if (( consecutiveFail < 2 )); then
  say "consecutiveFail=$consecutiveFail < 2,唔郁手(只做跨日重置 housekeeping)"
  write_state "$ST_SWAPS" "$ST_RESTARTS" "$ST_LASTACTION" "$ST_LASTACTIONAT" \
    "$ST_ALERT_ACTIVE" "$ST_ALERT_SINCE" "$ST_ALERT_FORM" "$ST_ALERT_MSG" "" \
    "$ST_LASTACTIONTICK" "$ST_LASTACTIONFORM"
  exit 0
fi

# ══ 3. 形態判定 ═════════════════════════════════════════════════
if (( midfail >= 2 )); then
  form="①yt-dlp"
elif (( healthy_a == 0 && healthy_b == 1 )); then
  form="②backend"
else
  form="③YouTube側"
fi
form_kind="$form"   # 節流用嘅原始形態,唔理下面 rollback/pending 加嘅後綴
say "形態判定:$form(healthy_a=$healthy_a healthy_b=$healthy_b mid=$mid midfail=$midfail consecutiveFail=$consecutiveFail)"

# ══ 3b. F2 節流判斷 ═════════════════════════════════════════════
# due=1:呢個 tick 准郁手(call apply/restart)兼寫 SUPERVISION-LOG。
#   · 形態同上次記錄嘅唔同 → 新消息,即刻 due。
#   · 呢個故障頭一次夠 consecutiveFail==2 門檻 → due。
#   · 未記過任何 lastActionTick(=0)→ due(第一次見到呢個形態)。
#   · 距離上次郁手夠 THROTTLE_TICKS(預設 12 = 6 小時)→ due。
due=0
if [[ "$form_kind" != "$ST_LASTACTIONFORM" ]]; then
  due=1
elif (( consecutiveFail == 2 )); then
  due=1
elif (( ST_LASTACTIONTICK <= 0 )); then
  due=1
elif (( consecutiveFail - ST_LASTACTIONTICK >= THROTTLE_TICKS )); then
  due=1
fi
say "節流判斷:due=$due(consecutiveFail=$consecutiveFail lastActionTick=$ST_LASTACTIONTICK lastActionForm=$ST_LASTACTIONFORM)"

alert_active=0; alert_form="$form"; alert_msg=""
swaps=$ST_SWAPS; restarts=$ST_RESTARTS
action="none"; pending=""

case "$form" in
①*)
  if (( ST_SWAPS >= SWAP_LIMIT )); then
    action="alert-safetyvalve-ytdlp"
    alert_active=1
    alert_msg="形態①(yt-dlp,midfail=$midfail/${#YT_IDS[@]}):今日已經換過 $ST_SWAPS 次(安全閥 $SWAP_LIMIT),唔再自動換,交返俾人手查 \`ops/ytdlp/update-ytdlp.sh\`。實際:$detail"
    hist "alert safetyvalve-ytdlp swapsToday=$ST_SWAPS/$SWAP_LIMIT due=$due"
    (( due == 1 )) && supervision "- 🔴 **自動修復梯:形態①但安全閥觸頂 $(ts)** — $alert_msg"
  else
    before_target="$(readlink "$YTDLP_LINK" 2>/dev/null || true)"
    if [[ -z "$before_target" ]]; then
      # F1: $YTDLP_LINK 唔係 a/b symlink 佈局(空 readlink = 一係唔係 symlink,
      # 一係啱啱 clean checkout / 俾人手殘剷咗)。唔准 apply(唔知點揈返轉頭),
      # 亦冇嘢好 rollback,只可以叫人手處理。
      action="ytdlp-not-symlink"
      alert_active=1
      form="③YouTube側(①唔准郁,yt-dlp唔係symlink)"; alert_form="$form"
      alert_msg="形態①(yt-dlp)但 \`$YTDLP_LINK\` 唔係 a/b symlink 佈局(readlink 讀唔到 target),為安全**唔會 apply 亦唔會 rollback**,要人手查同重建 symlink(應該指返 \`ytdlp-venv-a/bin/yt-dlp\` 或 \`ytdlp-venv-b/bin/yt-dlp\`)。實際:$detail"
      hist "ytdlp-not-symlink readlink-empty,冇郁手 due=$due"
      (( due == 1 )) && supervision "- 🔴 **自動修復梯:形態①但 yt-dlp 唔係 symlink,要人手 $(ts)** — $alert_msg"
    elif [[ "$DRY_RUN" == "1" ]]; then
      say "  [dry-run] 會行:$APPLY_CMD"
      say "  [dry-run] 換咗之後會即刻重驗 Layer B(唔經 backend)"
      action="dry-run-ytdlp-swap"
      alert_msg="[dry-run] 形態①(yt-dlp):會行 \`$APPLY_CMD\`,換咗即刻重驗 Layer B。今日現存 swapsToday=$ST_SWAPS/$SWAP_LIMIT。"
      hist "$alert_msg"
    elif (( due == 0 )); then
      # F2:未到期,唔再 call apply,亦唔寫 SUPERVISION-LOG,只更新 state。
      action="ytdlp-throttled-wait"
      alert_active=1; alert_form="$form"
      alert_msg="形態①(yt-dlp)持續(consecutiveFail=$consecutiveFail),節流中(上次郁手/警報喺 consecutiveFail=$ST_LASTACTIONTICK,每 $THROTTLE_TICKS 個 tick 先再試一次),冇再 call apply。實際:$detail"
      hist "ytdlp-throttled-wait consecutiveFail=$consecutiveFail lastActionTick=$ST_LASTACTIONTICK"
    else
      apply_out="$(eval "$APPLY_CMD" 2>&1)"; apply_rc=$?
      after_target="$(readlink "$YTDLP_LINK" 2>/dev/null || true)"
      say "  apply rc=$apply_rc before=$before_target after=$after_target"
      if [[ -n "$after_target" && "$after_target" != "$before_target" ]]; then
        swaps=$((ST_SWAPS+1))
        verify_layer_b
        say "  重驗 Layer B:mid=$VB_MID midfail=$VB_MIDFAIL"
        if (( VB_MID >= 2 )); then
          if (( healthy_a == 1 )); then
            # Layer A 本身已經健康(純粹係「1MiB 病」形態),換咗即刻算修復好。
            action="ytdlp-swap-ok"
            alert_msg="形態①(yt-dlp)已修復:$before_target → $after_target,重驗 Layer B $VB_MID/${#YT_IDS[@]} 過,Layer A 本身已經健康。今日 swapsToday=$swaps/$SWAP_LIMIT。"
            hist "ytdlp-swap-ok $before_target -> $after_target, verifyB=$VB_MID/${#YT_IDS[@]}"
            supervision "- 🟢 **自動修復梯:形態①已自動修復 $(ts)** — $alert_msg"
          else
            # 🔴 2026-09-05 Opus §2a false-green:兩層之前都死,換咗 yt-dlp 之後
            # Layer B 過,但呢次探測嘅 healthy_a 仍然係 0 —— 用戶側好可能仍然
            # 播唔到。唔可以寫 🟢/清 alert,要保持警報,等下個 tick 見到 A 自然
            # 回復(backend Layer A 打嘅係 playbackRetry:true,resolveAudio.js
            # FAIL_TTL_PLAYBACK_MS=60 秒,唔係 15 分鐘嗰個 FAIL_TTL_MS)。
            action="ytdlp-swap-ok-pending-a"
            alert_active=1
            alert_form="$form"
            pending="layerA-after-ytdlp-swap($now_iso,backend failCache(playbackRetry)約60秒,下個tick先會見到A回復)"
            alert_msg="形態①(yt-dlp)已換版:$before_target → $after_target,重驗 Layer B $VB_MID/${#YT_IDS[@]} 過,但呢次探測 Layer A 仍然 healthy_a=0(用戶側可能仍然播唔到)。已換版,等 Layer A 下一 tick 重驗,暫時保持警報。今日 swapsToday=$swaps/$SWAP_LIMIT。"
            hist "ytdlp-swap-ok-pending-a $before_target -> $after_target, verifyB=$VB_MID/${#YT_IDS[@]}, healthy_a=0"
            supervision "- 🟡 **自動修復梯:形態①已換版,等 Layer A 重驗 $(ts)** — $alert_msg"
          fi
        else
          # rollback。F1:再核一次 before_target 係咪仍然指住一個喺
          # $YTDLP_DIR 下面可執行嘅檔案先揈返轉頭,避免整死條 symlink。
          if [[ -n "$before_target" && -x "$YTDLP_DIR/$before_target" ]]; then
            ln -sfn "$before_target" "$YTDLP_LINK" 2>/dev/null || true
            rollback_note="已 rollback 返 $before_target"
          else
            rollback_note="⚠️ rollback guard 唔過(before_target='$before_target' 唔係 \`$YTDLP_DIR\` 下可執行檔),為安全冇郁 symlink,而家現役可能仍然係 $after_target,要人手核實同修正"
          fi
          action="ytdlp-swap-rollback"
          form="③YouTube側(①已試過)"; alert_form="$form"; alert_active=1
          alert_msg="形態①(yt-dlp)試過換去 $after_target,但重驗 Layer B 仍得 $VB_MID/${#YT_IDS[@]},判定換咗都冇用,$rollback_note。升級做③,可能係 YouTube 側全面擋緊。今日 swapsToday=$swaps/$SWAP_LIMIT。實際:$detail"
          hist "ytdlp-swap-rollback $after_target -> $before_target(冇好轉), verifyB=$VB_MID/${#YT_IDS[@]}"
          supervision "- 🔴 **自動修復梯:形態①換咗都冇用,已 rollback $(ts)** — $alert_msg"
        fi
      else
        action="ytdlp-no-candidate"
        form="③YouTube側(①冇候選版本)"; alert_form="$form"; alert_active=1
        short_out="$(echo "$apply_out" | tail -c 300)"
        alert_msg="形態①(yt-dlp)但閒置 slot 冇 canary-PASS 嘅新版本可換(readlink 冇變:$before_target;apply 輸出尾段:$short_out)。升級做③。實際:$detail"
        hist "ytdlp-no-candidate before=$before_target after=$after_target apply_rc=$apply_rc"
        supervision "- 🔴 **自動修復梯:形態①冇候選版本 $(ts)** — $alert_msg"
      fi
    fi
  fi
  ;;
②*)
  if (( ST_RESTARTS >= RESTART_LIMIT )); then
    action="alert-safetyvalve-backend"
    alert_active=1
    alert_msg="形態②(backend):今日已經重開過 $ST_RESTARTS 次(安全閥 $RESTART_LIMIT),唔再自動重開,要人手查 backend log。實際:$detail"
    hist "alert safetyvalve-backend restartsToday=$ST_RESTARTS/$RESTART_LIMIT due=$due"
    (( due == 1 )) && supervision "- 🔴 **自動修復梯:形態②但安全閥觸頂 $(ts)** — $alert_msg"
  elif [[ "$DRY_RUN" == "1" ]]; then
    say "  [dry-run] 會行:$RESTART_CMD"
    action="dry-run-backend-restart"
    alert_msg="[dry-run] 形態②(backend):會行 \`$RESTART_CMD\`,等 ${RECHECK_SLEEP}s 後重驗 Layer A。今日 restartsToday=$ST_RESTARTS/$RESTART_LIMIT。"
    hist "$alert_msg"
  elif (( due == 0 )); then
    # F2:未到期,唔再 call restart。
    action="backend-restart-throttled-wait"
    alert_active=1; alert_form="$form"
    alert_msg="形態②(backend)持續(consecutiveFail=$consecutiveFail),節流中(上次郁手/警報喺 consecutiveFail=$ST_LASTACTIONTICK,每 $THROTTLE_TICKS 個 tick 先再試一次),冇再 call restart。實際:$detail"
    hist "backend-restart-throttled-wait consecutiveFail=$consecutiveFail lastActionTick=$ST_LASTACTIONTICK"
  else
    restart_out="$(eval "$RESTART_CMD" 2>&1)"; restart_rc=$?
    say "  restart rc=$restart_rc"
    if (( restart_rc != 0 )) && echo "$restart_out" | grep -q "abort:HEAD"; then
      # gate 攔咗:backend-restart.sh 喺郁手之前已經 abort,冇真係 launchctl
      # bootout/bootstrap 過,唔算「用咗」一次安全閥額度,restarts 唔加。
      short_out="$(echo "$restart_out" | tail -c 400)"
      action="backend-restart-gate-blocked"
      alert_active=1
      alert_msg="形態②(backend)但部署 gate 唔過(HEAD≠已批准 backend.sha,有未批准 backend/ code 改動),冇自動重開,要人手 approve 先($REPO/ops/deploy/approve.sh)。輸出尾段:$short_out"
      hist "$action restart_rc=$restart_rc restartsToday=$restarts/$RESTART_LIMIT(冇消耗,gate攔咗)"
      supervision "- 🔴 **自動修復梯:形態②重開失敗 $(ts)** — $alert_msg"
    elif (( restart_rc != 0 )); then
      restarts=$((ST_RESTARTS+1))
      short_out="$(echo "$restart_out" | tail -c 400)"
      action="backend-restart-failed"
      alert_active=1
      alert_msg="形態②(backend):行 \`$RESTART_CMD\` 失敗(exit $restart_rc)。輸出尾段:$short_out"
      hist "$action restart_rc=$restart_rc restartsToday=$restarts/$RESTART_LIMIT"
      supervision "- 🔴 **自動修復梯:形態②重開失敗 $(ts)** — $alert_msg"
    else
      restarts=$((ST_RESTARTS+1))
      sleep "$RECHECK_SLEEP"
      verify_layer_a
      say "  重驗 Layer A:ok=$VA_OK fail=$VA_FAIL"
      if (( VA_OK >= 2 )); then
        action="backend-restart-ok"
        alert_msg="形態②(backend)已自動重開($RESTART_CMD),等 ${RECHECK_SLEEP}s 後重驗 Layer A $VA_OK/${#IDS[@]} 過,判定修復。今日 restartsToday=$restarts/$RESTART_LIMIT。"
        hist "backend-restart-ok verifyA=$VA_OK/${#IDS[@]} restartsToday=$restarts/$RESTART_LIMIT"
        supervision "- 🟢 **自動修復梯:形態②已自動修復 $(ts)** — $alert_msg"
      else
        action="backend-restart-recheck-fail"
        alert_active=1
        alert_msg="形態②(backend)已自動重開,但等 ${RECHECK_SLEEP}s 後重驗 Layer A 仍得 $VA_OK/${#IDS[@]},未確認修復好,要人手睇。今日 restartsToday=$restarts/$RESTART_LIMIT。"
        hist "backend-restart-recheck-fail verifyA=$VA_OK/${#IDS[@]} restartsToday=$restarts/$RESTART_LIMIT"
        supervision "- 🔴 **自動修復梯:形態②重開咗但未確認好返 $(ts)** — $alert_msg"
      fi
    fi
  fi
  ;;
③*)
  action="alert-youtube"
  alert_active=1
  alert_msg="形態③(YouTube 側):兩層都異常,冇得自動修。已警報,依家健康檢查每 30 分鐘一 tick 會自動重試。實際:$detail"
  hist "alert-youtube consecutiveFail=$consecutiveFail due=$due"
  (( due == 1 )) && supervision "- 🔴 **自動修復梯:形態③(YouTube側),冇得自動修 $(ts)** — $alert_msg"
  ;;
esac

# 沿用之前 alert.since,除非呢次先啱啱由 inactive 變 active
if [[ "$alert_active" == "1" ]]; then
  if [[ "$ST_ALERT_ACTIVE" == "1" && -n "$ST_ALERT_SINCE" ]]; then
    alert_since="$ST_ALERT_SINCE"
  else
    alert_since="$now_iso"
  fi
else
  alert_since=""
  alert_form=""
fi

# F2:只有真正 due 嘅 tick 先更新節流基準點(lastActionTick/lastActionForm),
# throttled-wait 嗰啲 tick 保留返上次記錄,等下次計「距離上次夠唔夠 12 tick」
# 唔會因為中間插咗一堆 throttled tick 而錯亂。
if [[ "$DRY_RUN" == "1" ]]; then
  out_tick="$ST_LASTACTIONTICK"; out_form="$ST_LASTACTIONFORM"
elif (( due == 1 )); then
  out_tick="$consecutiveFail"; out_form="$form_kind"
else
  out_tick="$ST_LASTACTIONTICK"; out_form="$ST_LASTACTIONFORM"
fi

write_state "$swaps" "$restarts" "$action" "$now_iso" "$alert_active" "$alert_since" "$alert_form" "$alert_msg" "$pending" "$out_tick" "$out_form"
say "action=$action alert_active=$alert_active form=$alert_form due=$due"
exit 0
