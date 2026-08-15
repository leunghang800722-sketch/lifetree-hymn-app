#!/usr/bin/env bash
# 歌詞 producer keeper —— LYRICS-47H-SPRINT-PLAN §P0.3(2026-08-15 47 小時衝刺 P 線)
#
# 一個 detached process,每 5 分鐘睇一次個池,自動決定開 CC 補倉定 OCR 出 draft,
# 令複核線永遠有貨。**只准同時跑一個 fetchLyrics**(YouTube 出口 IP 係全 App 命脈,
# 見 HANDOFF §2.2)—— 呢個由下面個 pgrep 把關,所以班次**唔准自己開 producer**,
# 只准檢查 keeper 生死、死咗就照呢個 script 重開。
#
# 開:  nohup bash ops/lyrics/producer-keeper.sh >/dev/null 2>&1 & disown
# 停:  touch /tmp/lyrics-sprint-stop      (≤5 分鐘內自然退場)
# 睇:  tail -30 /tmp/hymn_keeper.log
#
# ⚠️ 唔好用嚟恢復 launchd 個 com.hymnapp.fetchlyrics job —— 佢係 2026-08-13 刻意
#    停嘅,恢唔恢復要等 Eric 拍板。呢個 keeper 係衝刺專用,wrap 班會停埋佢。

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$REPO/backend"
DB="$BACKEND/hymns.db"

STOP=/tmp/lyrics-sprint-stop
LOG=/tmp/hymn_keeper.log
FLOG=/tmp/hymn_fetchlyrics.log
MARK=/tmp/lyrics-sprint-keeper-mark      # 上一轉開波嗰時 FLOG 嘅 byte offset
STREAK=/tmp/lyrics-sprint-403-streak     # 連續「開波即斷路」次數

NODE_BIN="$(command -v node)"
SQLITE_BIN="$(command -v sqlite3)"

TICK=300                 # 每 5 分鐘一 tick
DRAFT_CEILING=400        # draft 積到咁多就唞,唔好嘥 YouTube quota 堆貨
POOL_FLOOR=100           # OCR 池低過咁多就轉去 CC 補倉
COOL_403=7200            # 連續兩轉開波即斷路 → 唞 2 個鐘保 IP
SKIP_ORGS="天韻合唱團,CantonHymn,悦雨音樂,原始和聲"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

if [[ -z "$NODE_BIN" || -z "$SQLITE_BIN" ]]; then
  log "⛔ 搵唔到 node 或者 sqlite3(PATH=$PATH),keeper 開唔到"
  exit 1
fi

# 讀一個數;read-only URI 開 DB,絕對唔會阻住 producer / backend 寫入。
count() {
  "$SQLITE_BIN" "file:$DB?mode=ro" "$1" 2>/dev/null | head -1
}

# 上一轉係咪「開波 5 分鐘內就斷路收場」(即係疑似俾 YouTube 擋)。
# 0 = 係,1 = 唔係 / 判斷唔到。
was_circuit_broken() {
  local off block first_ts brk_ts first_e brk_e
  off="$(cat "$MARK" 2>/dev/null)"
  [[ -z "$off" ]] && return 1
  block="$(tail -c "+$((off + 1))" "$FLOG" 2>/dev/null)"
  [[ -z "$block" ]] && return 1
  echo "$block" | grep -q '疑似俾 YouTube 擋' || return 1
  first_ts="$(echo "$block" | head -1 | sed -n 's/^\[\([0-9-]* [0-9:]*\)\].*/\1/p')"
  brk_ts="$(echo "$block" | grep '疑似俾 YouTube 擋' | head -1 | sed -n 's/^\[\([0-9-]* [0-9:]*\)\].*/\1/p')"
  [[ -z "$first_ts" || -z "$brk_ts" ]] && return 1
  first_e="$(date -j -f '%Y-%m-%d %H:%M:%S' "$first_ts" '+%s' 2>/dev/null)"
  brk_e="$(date -j -f '%Y-%m-%d %H:%M:%S' "$brk_ts" '+%s' 2>/dev/null)"
  [[ -z "$first_e" || -z "$brk_e" ]] && return 1
  (( brk_e - first_e <= 300 ))
}

# fetchLyrics.js 用相對路徑跑(scripts/… + ../data、../lib),所以成個 keeper
# 一開波就 cd 入 backend,兩條分支都唔使各自 cd。
cd "$BACKEND" || { log "⛔ cd 唔到 $BACKEND"; exit 1; }

log "keeper 開波(pid $$,repo $REPO)"

while true; do
  if [[ -f "$STOP" ]]; then
    log "見到 $STOP,keeper 收工"
    exit 0
  fi

  if pgrep -f 'scripts/fetchLyrics.js' >/dev/null 2>&1; then
    sleep "$TICK"; continue
  fi

  # 冇 producer 跑緊 = 上一轉(如果有)已經完,喺度結算 403 風暴掣。
  if [[ -f "$MARK" ]]; then
    if was_circuit_broken; then
      n=$(( $(cat "$STREAK" 2>/dev/null || echo 0) + 1 ))
      echo "$n" > "$STREAK"
      log "⚠ 上一轉開波 5 分鐘內斷路(疑似俾 YouTube 擋),連續 $n 次"
      if (( n >= 2 )); then
        log "⛔ 403 風暴掣觸發:唞 $((COOL_403 / 60)) 分鐘保住出口 IP"
        echo 0 > "$STREAK"
        rm -f "$MARK"
        sleep "$COOL_403"
        continue
      fi
    else
      echo 0 > "$STREAK"
    fi
    rm -f "$MARK"
  fi

  POOL="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND lyrics_status='none' AND lyrics_source='cc:miss';")"
  CCLEFT="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND (lyrics_status IS NULL OR lyrics_status='none') AND (lyrics_source IS NULL OR lyrics_source='');")"
  DRAFTS="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND lyrics_status='draft';")"

  # sqlite3 讀唔到(DB 俾人揸緊鎖之類)就今 tick 唔做嘢,唔好靠估開 producer。
  if [[ -z "$POOL" || -z "$CCLEFT" || -z "$DRAFTS" ]]; then
    log "⚠ 讀唔到 DB 數字,今 tick 跳過"
    sleep "$TICK"; continue
  fi

  if (( DRAFTS >= DRAFT_CEILING )); then
    log "draft 隊列 $DRAFTS ≥ $DRAFT_CEILING,reviewer 追唔切,唞 10 分鐘"
    sleep 600; continue
  fi

  wc -c < "$FLOG" 2>/dev/null | tr -d ' ' > "$MARK" || echo 0 > "$MARK"

  if (( POOL < POOL_FLOOR )) && (( CCLEFT > 0 )); then
    log "池 $POOL < $POOL_FLOOR,CC 未行 $CCLEFT 首 → 開 CC 補倉(budget 300)"
    nohup "$NODE_BIN" scripts/fetchLyrics.js --mode cc --budget 300 --delay 3000 --ignore-window \
      >> "$FLOG" 2>&1 &
    disown
  elif (( POOL > 0 )); then
    log "池 $POOL、draft $DRAFTS → 開 OCR(budget 120)"
    nohup "$NODE_BIN" scripts/fetchLyrics.js --mode ocr --budget 120 --delay 4000 --ignore-window \
      --skip-orgs "$SKIP_ORGS" >> "$FLOG" 2>&1 &
    disown
  else
    rm -f "$MARK"
    log "池空 + CC 都行晒(POOL=$POOL CCLEFT=$CCLEFT),冇嘢可做,等下一 tick"
  fi

  sleep "$TICK"
done
