#!/usr/bin/env bash
# 歌詞複核殭屍session reaper —— LYRICS-ZOMBIE-REAPER-EXEC-20260830.md T1。
#
# 背景(詳見 memory `project-lyrics-zombie-sessions-rootcause`):4條歌詞複核
# scheduled task(lyrics-line-mandarin/-b/lyrics-line-cantonese/-b)嘅session,
# model層面班班準時收爐,但claude process完成之後唔會exit,runner又唔reap
# → 每日24條殭屍,~1.5日積到76條。呢個script靠**session自我登記**
# (`/tmp/hymn-lyrics-sessions/<線名>-<pid>.pid`),每15分鐘由launchd叫一次,
# 對登記超過3.5小時嘅process做SIGTERM→(輪詢等,上限REAPER_SIGTERM_WAIT)→SIGKILL。
#
# 第二層(2026-08-30 Fable5/Opus5覆查改設計,**永久log-only,唔准殺**):
# 掃`bash/zsh/sh -c`起頭、含`until`+`pgrep`+`do sleep`嘅輪詢shell
# (pgrep -f self-match令loop永遠唔完嘅已知病)。**唔call kill(armed都唔殺)**——
# 第一層armed殺一個登記緊嘅session時,harness會連帶殺埋佢spawn嘅background
# task(實測kill時彈status=killed通知),orphan輪詢shell會跟住parent一齊死,
# 第二層唔需要落手,誤殺風險唔值博。淨係log+寫🟡警報落SUPERVISION-LOG,
# 用`$REGISTRY/.orphan-alerted/<pid>`防同一pid日日嘈。
#
# B3 restart順延guard:armed殺人之前check有冇`backend-restart.sh`/
# `approve.sh`跑緊,有就今個cycle唔殺,entry留低,下轉(15分鐘後)再睇——
# 堵「3.5h閾值腰斬R1班尾restart」嘅最壞情況。
#
# 模式:`ops/lyrics/.reaper-armed`(repo內,已加落.gitignore)存在=armed,
# 唔存在=dry-run(淨係log「WOULD KILL」)。**第一晚一定係dry-run**,等Fable5
# 驗完先由人手create呢個flag file arm佢 —— 呢個script自己唔會create。
#
# 全部路徑/行為都可以用env override(方便T5合成測試,唔使掂真registry/真flag):
#   REAPER_REGISTRY              registry目錄(預設 /tmp/hymn-lyrics-sessions)
#   REAPER_MATCH                  合法claude process嘅cmdline子字串
#                                  (預設 claude.app/Contents/MacOS/claude)
#   REAPER_ARMED_FILE              armed flag檔路徑(預設 ops/lyrics/.reaper-armed)
#   REAPER_LOG                     reaper自己嘅log(預設 /tmp/hymn_lyric_reaper.log)
#   REAPER_SUPERVISION_LOG         真殺/orphan警報先會append嘅SUPERVISION-LOG路徑
#   REAPER_SIGTERM_WAIT            SIGTERM後最多等幾耐先SIGKILL(整數秒,預設30;
#                                   0.5秒一poll,process早死就早走,唔使死等)
#   REAPER_THRESHOLD_SEC           registry entry殭屍閾值(預設12600=3.5h)
#   REAPER_ORPHAN_THRESHOLD_SEC    orphan輪詢shell閾值(預設14400=4h)
#   REAPER_SKIP_ORPHAN_SCAN        設1跳過第二層(T5測registry邏輯用,
#                                   避免掂到真系統嘅orphan shell)
#   REAPER_RESTART_GUARD_PATTERN   B3 guard嘅pgrep -f pattern
#                                   (預設 backend-restart\.sh|ops/deploy/approve\.sh)
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
RESTART_GUARD_PATTERN="${REAPER_RESTART_GUARD_PATTERN:-backend-restart\.sh|ops/deploy/approve\.sh}"

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
threshold_hours=$(awk "BEGIN{printf \"%.2f\", $THRESHOLD/3600}")
orphan_threshold_hours=$(awk "BEGIN{printf \"%.2f\", $ORPHAN_THRESHOLD/3600}")
logln "=== cycle start (armed=$armed registry=$REGISTRY match=\"$MATCH\" threshold=${threshold_hours}h) ==="

epoch_of_lstart() {  # <pid> → epoch(攞唔到就印空)
  local pid="$1"
  local lstart
  lstart=$(ps -o lstart= -p "$pid" 2>/dev/null)
  [[ -z "$lstart" ]] && { echo ""; return; }
  date -j -f "%a %b %d %T %Y" "$lstart" +%s 2>/dev/null
}

etime_to_sec() {  # ps etime格式(MM:SS / HH:MM:SS / DD-HH:MM:SS)→ 秒
  # ⚠️ B1(Opus5驗收揪出):`local e="$1" days=0 rest="$e" ...` 全部字都喺同一句
  # `local`入面 —— bash會**先做晒成句嘅word expansion先至逐個assign**,即係
  # `rest="$e"`個 `$e` 喺 `e` 真正被呢句 `local` assign之前就已經expand咗,
  # `set -u`下觸發`e: unbound variable`,令第二層由頭到尾冇run過一次。
  # 修法:`e`要拆做獨立一句`local`先,等佢真正存在咗先至可以俾第二句攞嚟用。
  local e="$1"
  local days=0 sec=0 a b c
  local rest="$e"
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

kill_or_log() {  # <pid> <描述,俾SUPERVISION-LOG用>(呢個function淨係第一層用)
  local pid="$1" desc="$2"
  if (( armed == 1 )); then
    kill -TERM "$pid" 2>/dev/null
    # N4:輪詢等(0.5秒一poll),process早死就早走,唔使死等成個REAPER_SIGTERM_WAIT。
    local max_polls=$(( TERM_WAIT * 2 ))
    local poll=0
    while (( poll < max_polls )); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
      poll=$(( poll + 1 ))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null
      logln "[armed] SIGTERM冇死(等咗上限${TERM_WAIT}s),SIGKILL pid=$pid ($desc)"
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

# B3:restart順延guard,每個cycle計一次(唔係per-entry,避免同一cycle判斷唔一致)。
restart_guard_hit=$(pgrep -f "$RESTART_GUARD_PATTERN" 2>/dev/null | head -1)

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

  # 4. 閾值(REAPER_THRESHOLD_SEC,預設3.5h)
  now=$(date +%s)
  age=$(( now - reg_epoch ))
  if (( age > THRESHOLD )); then
    hours=$(awk "BEGIN{printf \"%.2f\", $age/3600}")
    desc="線名=$line_name pid=$pid 登記epoch=$reg_epoch 存活=${hours}h(閾值${threshold_hours}h) registry=$base"
    if [[ -n "$restart_guard_hit" ]]; then
      # B3:backend restart/approve進行中,今個cycle唔殺,entry留低等下轉。
      logln "pid=$pid ($line_name) 存活${hours}h > ${threshold_hours}h閾值,但backend restart/approve進行中(pid=$restart_guard_hit match \"$RESTART_GUARD_PATTERN\"),今個cycle唔殺,下轉再睇"
    else
      logln "pid=$pid ($line_name) 存活${hours}h > ${threshold_hours}h閾值 → 觸發reap"
      kill_or_log "$pid" "$desc"
      # ⚠️ dry-run唔准刪entry:如果今晚dry-run期間有真殭屍形成,entry要留低
      # 等聽日arm咗之後嗰個cycle先真殺真刪,唔係就永遠冇人再追呢隻殭屍。
      (( armed == 1 )) && rm -f "$f"
    fi
  else
    young_hours=$(awk "BEGIN{printf \"%.2f\", $age/3600}")
    logln "pid=$pid ($line_name) 存活${young_hours}h,未過閾值${threshold_hours}h,跳過"
  fi
done

# ── 第二層(純偵測,永久唔殺):until+pgrep+do sleep輪詢shell ────────
if [[ "$SKIP_ORPHAN" != "1" && "$SKIP_ORPHAN" != "true" ]]; then
  ALERT_DIR="$REGISTRY/.orphan-alerted"
  mkdir -p "$ALERT_DIR"
  seen_pids=" "
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    p=$(awk '{print $1}' <<< "$line")
    et=$(awk '{print $2}' <<< "$line")
    # ⚠️ 唔用 `cut -d' ' -f3-`:ps 欄位之間會有多個空格對齊,cut 淨係識
    # 逐個單一空格拆field,對齊用嘅空格會拆出一堆空field,令實際command
    # 內容全部消失。改用awk清走頭兩個欄再重併返(容忍多空格)。
    cmd=$(awk '{ $1=""; $2=""; print }' <<< "$line" | sed -E 's/^[[:space:]]+//')
    # 收窄match:cmdline要以 bash/zsh/sh -c 開頭(唔好齋三字substring),
    # 兼且含 until + pgrep + "do sleep"。
    [[ "$cmd" =~ ^([^[:space:]]*/)?(bash|zsh|sh)[[:space:]]+-c ]] || continue
    [[ "$cmd" == *until* && "$cmd" == *pgrep* && "$cmd" == *"do sleep"* ]] || continue
    seen_pids="$seen_pids$p "
    sec=$(etime_to_sec "$et")
    if (( sec > ORPHAN_THRESHOLD )); then
      if [[ -f "$ALERT_DIR/$p" ]]; then
        continue   # 已經警報過,防spam
      fi
      shortcmd="${cmd:0:160}"
      logln "orphan輪詢shell pid=$p etime=$et(${sec}s) > ${orphan_threshold_hours}h閾值 → 純偵測(唔殺),寫警報"
      : > "$ALERT_DIR/$p"
      {
        echo ""
        echo "- 🟡 **偵測到orphan輪詢shell(疑違反SOP §2c) $(date '+%Y-%m-%d %H:%M')** — pid=$p etime=$et(${sec}s) cmd=$shortcmd"
      } >> "$SUP_LOG"
    fi
  done < <(ps -axwwo pid=,etime=,command= 2>/dev/null)

  # 清走已經唔喺current scan見到嘅alert marker,避免PID reuse永久靜音。
  for markerf in "$ALERT_DIR"/*; do
    [[ -e "$markerf" ]] || continue
    mp=$(basename "$markerf")
    [[ "$seen_pids" == *" $mp "* ]] || rm -f "$markerf"
  done
else
  logln "REAPER_SKIP_ORPHAN_SCAN 開咗,跳過第二層"
fi

logln "=== cycle end ==="
