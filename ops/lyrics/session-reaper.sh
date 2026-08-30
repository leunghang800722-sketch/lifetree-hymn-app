#!/usr/bin/env bash
# 歌詞複核殭屍session reaper —— LYRICS-ZOMBIE-REAPER-EXEC-20260830.md T1。
#
# 背景(詳見 memory `project-lyrics-zombie-sessions-rootcause`):4條歌詞複核
# scheduled task(lyrics-line-mandarin/-b/lyrics-line-cantonese/-b)嘅session,
# model層面班班準時收爐,但claude process完成之後唔會exit,runner又唔reap
# → 每日24條殭屍,~1.5日積到76條。呢個script靠**session自我登記**
# (`/tmp/hymn-lyrics-sessions/<線名>-<pid>.pid`),每15分鐘由launchd叫一次,
# 對登記超過3.5小時嘅process做SIGTERM→30秒→SIGKILL。
#
# 第二層:掃`until pgrep sleep`輪詢shell(pgrep -f self-match令loop永遠唔完
# 嘅已知病),etime>4小時就同樣armed殺/dry-run log。
#
# 模式:`ops/lyrics/.reaper-armed`(repo內,已加落.gitignore)存在=armed,
# 唔存在=dry-run(淨係log「WOULD KILL」)。**第一晚一定係dry-run**,等Fable5
# 驗完先由人手create呢個flag file arm佢 —— 呢個script自己唔會create。
#
# 全部路徑/行為都可以用env override(方便T5合成測試,唔使掂真registry/真flag):
#   REAPER_REGISTRY            registry目錄(預設 /tmp/hymn-lyrics-sessions)
#   REAPER_MATCH                合法claude process嘅cmdline子字串
#                                (預設 claude.app/Contents/MacOS/claude)
#   REAPER_ARMED_FILE            armed flag檔路徑(預設 ops/lyrics/.reaper-armed)
#   REAPER_LOG                   reaper自己嘅log(預設 /tmp/hymn_lyric_reaper.log)
#   REAPER_SUPERVISION_LOG       真殺先會append嘅SUPERVISION-LOG路徑
#   REAPER_SIGTERM_WAIT          SIGTERM後等幾耐先SIGKILL(預設30秒)
#   REAPER_THRESHOLD_SEC         registry entry殭屍閾值(預設12600=3.5h)
#   REAPER_ORPHAN_THRESHOLD_SEC  orphan輪詢shell閾值(預設14400=4h)
#   REAPER_SKIP_ORPHAN_SCAN      設1跳過第二層(T5測registry邏輯用,
#                                 避免armed測試順便掂到真系統嘅orphan shell)
#
# 用法:launchd每15分鐘行一次(`com.hymnops.lyricreaper`);人手試:
#   bash ops/lyrics/session-reaper.sh

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

REGISTRY="${REAPER_REGISTRY:-/tmp/hymn-lyrics-sessions}"
MATCH="${REAPER_MATCH:-claude.app/Contents/MacOS/claude}"
ARMED_FILE="${REAPER_ARMED_FILE:-$REPO/ops/lyrics/.reaper-armed}"
LOG="${REAPER_LOG:-/tmp/hymn_lyric_reaper.log}"
SUP_LOG="${REAPER_SUPERVISION_LOG:-$REPO/docs/SUPERVISION-LOG.md}"
TERM_WAIT="${REAPER_SIGTERM_WAIT:-30}"
THRESHOLD="${REAPER_THRESHOLD_SEC:-12600}"
ORPHAN_THRESHOLD="${REAPER_ORPHAN_THRESHOLD_SEC:-14400}"
SKIP_ORPHAN="${REAPER_SKIP_ORPHAN_SCAN:-0}"

mkdir -p "$REGISTRY"

# log rotation:>1MB就truncate(避免長開機器慢慢谷爆)
if [[ -f "$LOG" ]]; then
  sz=$(stat -f%z "$LOG" 2>/dev/null || echo 0)
  if (( sz > 1048576 )); then
    : > "$LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [reaper] log超過1MB,已truncate" >> "$LOG"
  fi
fi

logln() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

armed=0
[[ -f "$ARMED_FILE" ]] && armed=1
logln "=== cycle start (armed=$armed registry=$REGISTRY match=\"$MATCH\") ==="

epoch_of_lstart() {  # <pid> → epoch(攞唔到就印空)
  local pid="$1" lstart
  lstart=$(ps -o lstart= -p "$pid" 2>/dev/null)
  [[ -z "$lstart" ]] && { echo ""; return; }
  date -j -f "%a %b %d %T %Y" "$lstart" +%s 2>/dev/null
}

etime_to_sec() {  # ps etime格式(MM:SS / HH:MM:SS / DD-HH:MM:SS)→ 秒
  local e="$1" days=0 rest="$e" sec=0 a b c
  if [[ "$e" == *-* ]]; then
    days="${e%%-*}"
    rest="${e#*-}"
  fi
  IFS=: read -r a b c <<< "$rest"
  if [[ -n "${c:-}" ]]; then
    sec=$(( 10#$a*3600 + 10#$b*60 + 10#$c ))
  elif [[ -n "${b:-}" ]]; then
    sec=$(( 10#$a*60 + 10#$b ))
  else
    sec=$(( 10#$a ))
  fi
  echo $(( days*86400 + sec ))
}

kill_or_log() {  # <pid> <描述,俾SUPERVISION-LOG用>
  local pid="$1" desc="$2"
  if (( armed == 1 )); then
    kill -TERM "$pid" 2>/dev/null
    sleep "$TERM_WAIT"
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null
      logln "[armed] SIGTERM冇死,SIGKILL pid=$pid ($desc)"
    else
      logln "[armed] SIGTERM成功,pid=$pid已死 ($desc)"
    fi
    {
      echo ""
      echo "- 🔴 **殭屍歌詞session已reap $(date '+%Y-%m-%d %H:%M')** — $desc"
    } >> "$SUP_LOG"
  else
    logln "[dry-run] WOULD KILL pid=$pid ($desc)"
  fi
}

# ── 第一層:registry entries ─────────────────────────────────────
shopt -s nullglob
for f in "$REGISTRY"/*.pid; do
  base=$(basename "$f")
  entry=$(cat "$f" 2>/dev/null)
  pid="${entry%%:*}"
  rest="${entry#*:}"
  reg_epoch="${rest%%:*}"
  line_name="${rest#*:}"

  if [[ -z "$pid" || -z "$reg_epoch" || "$pid" == "$entry" ]]; then
    logln "壞entry $base(內容:$entry),刪除"
    rm -f "$f"; continue
  fi

  # 1. pid存唔存在
  if ! kill -0 "$pid" 2>/dev/null; then
    logln "pid=$pid ($line_name) 已經唔存在,刪entry $base"
    rm -f "$f"; continue
  fi

  # 2. cmdline要match先當佢係真嘅claude session(唔match=疑PID reuse,唔殺)
  cmdline=$(ps -o command= -p "$pid" 2>/dev/null)
  if [[ "$cmdline" != *"$MATCH"* ]]; then
    logln "pid=$pid ($line_name) cmdline唔match「$MATCH」(疑PID reuse),刪entry唔殺 $base"
    rm -f "$f"; continue
  fi

  # 3. PID-reuse雙重保險:process start time要 <= 登記epoch+60
  start_epoch=$(epoch_of_lstart "$pid")
  if [[ -z "$start_epoch" ]]; then
    logln "pid=$pid ($line_name) 攞唔到start time,刪entry唔殺 $base"
    rm -f "$f"; continue
  fi
  if (( start_epoch > reg_epoch + 60 )); then
    logln "pid=$pid ($line_name) start_epoch=$start_epoch > 登記epoch=$reg_epoch+60(疑PID reuse),刪entry唔殺 $base"
    rm -f "$f"; continue
  fi

  # 4. 3.5小時閾值
  now=$(date +%s)
  age=$(( now - reg_epoch ))
  if (( age > THRESHOLD )); then
    hours=$(awk "BEGIN{printf \"%.2f\", $age/3600}")
    desc="線名=$line_name pid=$pid 登記epoch=$reg_epoch 存活=${hours}h(閾值3.5h) registry=$base"
    logln "pid=$pid ($line_name) 存活${hours}h > 3.5h閾值 → 觸發reap"
    kill_or_log "$pid" "$desc"
    # ⚠️ dry-run唔准刪entry:如果今晚dry-run期間有真殭屍形成,entry要留低
    # 等聽日arm咗之後嗰個cycle先真殺真刪,唔係就永遠冇人再追呢隻殭屍。
    (( armed == 1 )) && rm -f "$f"
  else
    young_hours=$(awk "BEGIN{printf \"%.2f\", $age/3600}")
    logln "pid=$pid ($line_name) 存活${young_hours}h,未過閾值,跳過"
  fi
done

# ── 第二層:orphan輪詢shell(until+pgrep+sleep,etime>4h) ─────────
if [[ "$SKIP_ORPHAN" != "1" && "$SKIP_ORPHAN" != "true" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    p=$(awk '{print $1}' <<< "$line")
    et=$(awk '{print $2}' <<< "$line")
    cmd=$(cut -d' ' -f3- <<< "$line")
    [[ "$cmd" == *until* && "$cmd" == *pgrep* && "$cmd" == *sleep* ]] || continue
    sec=$(etime_to_sec "$et")
    if (( sec > ORPHAN_THRESHOLD )); then
      shortcmd="${cmd:0:160}"
      desc="orphan輪詢shell pid=$p etime=$et(${sec}s,閾值${ORPHAN_THRESHOLD}s) cmd=$shortcmd"
      logln "orphan輪詢shell pid=$p etime=$et > 4h閾值 → 觸發reap"
      kill_or_log "$p" "$desc"
    fi
  done < <(ps -axwwo pid=,etime=,command= 2>/dev/null)
else
  logln "REAPER_SKIP_ORPHAN_SCAN 開咗,跳過第二層"
fi

logln "=== cycle end ==="
