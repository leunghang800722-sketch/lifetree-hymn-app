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
BLOCK_FLAG=/tmp/lyrics-403-block   # fetchLyrics 偵測到全域 403 就寫呢個檔(2026-08-19 事故)
BLOCK_COOL=5400                    # 見到 flag 就唞 90 分鐘,再試真落載探測
LOG=/tmp/hymn_keeper.log
FLOG=/tmp/hymn_fetchlyrics.log
MARK=/tmp/lyrics-sprint-keeper-mark      # 上一轉開波嗰時 FLOG 嘅 byte offset
STREAK=/tmp/lyrics-sprint-403-streak     # 連續「開波即斷路」次數
STARVE=/tmp/lyrics-sprint-ocr-starved    # 上一轉 OCR 開到但池入面冇一首攻得(全部俾 ledger cooldown / --skip-orgs 剔走)

NODE_BIN="$(command -v node)"
SQLITE_BIN="$(command -v sqlite3)"

TICK=300                 # 每 5 分鐘一 tick
DRAFT_CEILING=400        # draft 積到咁多就唞,唔好嘥 YouTube quota 堆貨
POOL_FLOOR=100           # OCR 池低過咁多就轉去 CC 補倉
COOL_403=7200            # 連續兩轉開波即斷路 → 唞 2 個鐘保 IP
# 2026-08-18 22:20 Eric 拍板**放行**呢四個 vein(留空 = 唔再押後)。
# 背景:天韻/CantonHymn/悦雨/原始和聲 原本喺 47H 衝刺 Phase 0 押後,理由係
# 「2026-08-11 至 08-13 逐首讀過判死」—— 但嗰個判斷係基於**舊 Vision OCR**。
# 8/16 換咗 PaddleOCR 主引擎之後未重新評估過,而家池榨乾(連續兩轉「冇一首
# 攻得」),放返出嚟 680 首入 OCR 池頂住三條複核線嘅消耗,順便實測新引擎
# 救唔救得返呢批。要重新押後就填返:SKIP_ORGS="天韻合唱團,CantonHymn,悦雨音樂,原始和聲"
SKIP_ORGS=""

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

# 上一轉 OCR 係咪「開到但一首都攻唔到」——即係 POOL 條 SQL 數到嘅 cc:miss 全部
# 俾 fetchLyrics 自己嘅落載失敗 ledger(12 鐘頭 cooldown / fails>=3)或者 --skip-orgs 剔走。
# 唔偵測嘅話 POOL 會永遠停喺高位、跌唔穿 POOL_FLOOR,keeper 就會一路空轉開 OCR,
# 補倉嘅 CC 分支永遠行唔到(2026-08-15 15:21–17:00 實際咁樣蝕咗 1.5 個鐘)。
was_ocr_starved() {
  local off block
  off="$(cat "$MARK" 2>/dev/null)"
  [[ -z "$off" ]] && return 1
  block="$(tail -c "+$((off + 1))" "$FLOG" 2>/dev/null)"
  [[ -z "$block" ]] && return 1
  echo "$block" | grep -q '冇更多 cc:miss 嘅歌等 OCR'
}

# fetchLyrics.js 用相對路徑跑(scripts/… + ../data、../lib),所以成個 keeper
# 一開波就 cd 入 backend,兩條分支都唔使各自 cd。
cd "$BACKEND" || { log "⛔ cd 唔到 $BACKEND"; exit 1; }

log "keeper 開波(pid $$,repo $REPO)"

# ── 每小時產出時報(2026-08-17 Eric 要求 24h 追趕,實況入 docs/SUPERVISION-LOG.md)──
REPORT_MARK=/tmp/lyrics-pline-report-epoch
REPORT_CUM=/tmp/lyrics-pline-report-lastcum
SUPLOG="$REPO/docs/SUPERVISION-LOG.md"

maybe_report() {
  local now last cum lastcum delta redo draftnow prod
  now=$(date +%s)
  last=$(cat "$REPORT_MARK" 2>/dev/null || echo 0)
  (( now - last < 3600 )) && return 0
  cum=$(grep -c "有效草稿" "$FLOG" 2>/dev/null | head -1); [[ -z "$cum" ]] && cum=0
  lastcum=$(cat "$REPORT_CUM" 2>/dev/null || echo "$cum")
  delta=$(( cum - lastcum ))
  redo=$("$NODE_BIN" "$REPO/ops/lyrics/requeue-pending-count.mjs" 2>/dev/null | head -1); [[ -z "$redo" ]] && redo='?'
  draftnow=$("$NODE_BIN" "$REPO/ops/lyrics/bi-freeze.mjs" --count 2>/dev/null); [[ -z "$draftnow" ]] && draftnow='?'
  prod=$(pgrep -f 'scripts/fetchLyrics.js' >/dev/null 2>&1 && echo '行緊' || echo '冇行')
  echo "- [$(date '+%Y-%m-%d %H:%M')] P線時報(keeper自動):過去1小時 OCR/whisper draft **+${delta}**(log累計 ${cum});重做隊剩 ${redo};可做draft ${draftnow};producer ${prod}" >> "$SUPLOG"
  echo "$now" > "$REPORT_MARK"
  echo "$cum" > "$REPORT_CUM"
}

while true; do
  if [[ -f "$STOP" ]]; then
    log "見到 $STOP,keeper 收工"
    exit 0
  fi

  maybe_report

  if pgrep -f 'scripts/fetchLyrics.js' >/dev/null 2>&1; then
    sleep "$TICK"; continue
  fi

  # ── 403 全域封鎖:唞夠鐘,再用**真落載**探測(唔可以用 list-subs,2026-08-19 教訓)──
  if [[ -f "$BLOCK_FLAG" ]]; then
    log "⛔ 見到 403 封鎖 flag($(head -1 "$BLOCK_FLAG" 2>/dev/null))→ 唞 $((BLOCK_COOL/60)) 分鐘"
    sleep "$BLOCK_COOL"
    probe_dir="$(mktemp -d)"
    # ⚠️ 2026-08-22(YTDLP-UNIFY-PLAN-20260822.md)呢個探測本身壞咗兩樣,一次過修:
    #   ① 用 bare `yt-dlp`(PATH 搵 brew 版)—— 而 producer 真正落載係用 repo binary,
    #      即係「探測用 A 版、幹活用 B 版」,探測結果代表唔到實況。
    #   ② `-f 18`:YouTube 2026-08-18 起已經**唔再派 format 18**(8/19 實錘)。即係話
    #      呢個探測**注定失敗**——一旦 BLOCK_FLAG 著咗,個 producer 就永遠恢復唔返,
    #      因為解封條件係一個冇可能過到嘅測試(靜靜哋熄咗火,冇人會見到)。
    # 而家:統一 binary + 同 fetchLyrics.js 一樣嘅 DASH format waterfall。
    if "$NODE_BIN" -e '
      const {execFileSync}=require("child_process");
      const BIN=process.argv[2];
      const FMT="bv*[height<=360]+ba/bv*[height<=480]+ba/18/b[height<=480]/b";
      try{ execFileSync(BIN,["-f",FMT,"--no-playlist","-o",process.argv[1]+"/p.%(ext)s",
        "https://www.youtube.com/watch?v=gF-eDlXq3II"],{stdio:"pipe",timeout:120000}); process.exit(0); }
      catch(e){ process.exit(/403/.test(String(e.stderr||e.message))?2:1); }' "$probe_dir" "$REPO/backend/tools/yt-dlp" >/dev/null 2>&1; then
      rm -rf "$probe_dir"; rm -f "$BLOCK_FLAG"
      log "✅ 真落載探測成功 → 封鎖解除,恢復正常"
    else
      rm -rf "$probe_dir"
      log "⚠ 真落載探測仍然失敗 → 繼續唞,唔重開 producer(唔好空轉燒失敗)"
      continue
    fi
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
    if was_ocr_starved; then
      touch "$STARVE"
      log "⚠ 上一轉 OCR 池入面冇一首攻得(全部 cooldown / skip-orgs)→ 下一轉強制轉 CC 補倉"
    else
      rm -f "$STARVE"
    fi
    rm -f "$MARK"
  fi

  # ⚠️ 純音樂 exclusion(INSTRUMENTAL-PHASE1-EXEC-20260821.md §4):三條計數
  # query 都加咗 `AND (instrumental IS NULL OR instrumental = 0)` —— instrumental=1
  # 嘅歌唔入歌詞線,計埋入池會令 keeper 以為仲有貨。理論上佢哋
  # lyrics_status='unavailable' 本身已經入唔到呢三條條件,呢一刀係雙保險。
  POOL="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND (instrumental IS NULL OR instrumental = 0) AND lyrics_status='none' AND lyrics_source='cc:miss';")"
  CCLEFT="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND (instrumental IS NULL OR instrumental = 0) AND (lyrics_status IS NULL OR lyrics_status='none') AND (lyrics_source IS NULL OR lyrics_source='');")"
  # ⚠️ 2026-08-16:唔可以再數 draft 總數 —— Eric 拍板將「中文歌配英文歌詞」嗰批
  # 全面扣起(唔准 apply、唔准判死,等新方法出嚟先處理),而佢哋一直留喺 draft。
  # 用總數就會出現「隊列 444 塞爆 → 熄咗 producer」但其實得 190 首做得嘅情況
  # (2026-08-16 朝早實錄:P 線白白閒置咗成個上晝)。所以數「真正可做」嗰個。
  DRAFTS="$("$NODE_BIN" "$REPO/ops/lyrics/bi-freeze.mjs" --count 2>/dev/null)"
  # script 有咩冬瓜豆腐就 fallback 返總數(保守:寧願早唞都好過亂出貨)
  if [[ -z "$DRAFTS" ]]; then
    DRAFTS="$(count "SELECT COUNT(*) FROM hymns_all WHERE curated=1 AND status!='dead' AND (instrumental IS NULL OR instrumental = 0) AND lyrics_status='draft';")"
    log "⚠ bi-freeze --count 攞唔到數,fallback 用 draft 總數 $DRAFTS"
  fi

  # sqlite3 讀唔到(DB 俾人揸緊鎖之類)就今 tick 唔做嘢,唔好靠估開 producer。
  if [[ -z "$POOL" || -z "$CCLEFT" || -z "$DRAFTS" ]]; then
    log "⚠ 讀唔到 DB 數字,今 tick 跳過"
    sleep "$TICK"; continue
  fi

  # 2026-08-16 LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P4:重做隊(Eric 拍板嗰 280 首)
  # 有貨嗰陣唔受 ceiling 限制 —— ceiling 原意係「reviewer 追唔切就唔好堆新貨」,
  # 重做批係 Eric 點名要重出嘅舊貨,fetchLyrics 會排佢哋隊頭先做。
  REDO_PENDING="$("$NODE_BIN" "$REPO/ops/lyrics/requeue-pending-count.mjs" 2>/dev/null | head -1)"
  [[ -z "$REDO_PENDING" ]] && REDO_PENDING=0
  if (( DRAFTS >= DRAFT_CEILING )) && (( REDO_PENDING == 0 )); then
    log "可做 draft $DRAFTS ≥ $DRAFT_CEILING,reviewer 追唔切,唞 10 分鐘"
    sleep 600; continue
  fi
  if (( REDO_PENDING > 0 )); then
    log "重做隊仲有 $REDO_PENDING 首(ceiling 唔攔重做批)"
  fi

  wc -c < "$FLOG" 2>/dev/null | tr -d ' ' > "$MARK" || echo 0 > "$MARK"

  if { (( POOL < POOL_FLOOR )) || [[ -f "$STARVE" ]]; } && (( CCLEFT > 0 )); then
    if [[ -f "$STARVE" ]]; then
      log "池 $POOL 但全部攻唔到(cooldown / skip-orgs),CC 未行 $CCLEFT 首 → 開 CC 補倉(budget 300)"
      rm -f "$STARVE"
    else
      log "池 $POOL < $POOL_FLOOR,CC 未行 $CCLEFT 首 → 開 CC 補倉(budget 300)"
    fi
    nohup "$NODE_BIN" scripts/fetchLyrics.js --mode cc --budget 300 --delay 3000 --ignore-window \
      >> "$FLOG" 2>&1 &
    disown
  elif (( POOL > 0 )); then
    log "池 $POOL、可做 draft $DRAFTS → 開 OCR(budget 120)"
    nohup "$NODE_BIN" scripts/fetchLyrics.js --mode ocr --budget 120 --delay 4000 --ignore-window \
      ${SKIP_ORGS:+--skip-orgs "$SKIP_ORGS"} >> "$FLOG" 2>&1 &
    disown
  else
    rm -f "$MARK"
    log "池空 + CC 都行晒(POOL=$POOL CCLEFT=$CCLEFT),冇嘢可做,等下一 tick"
  fi

  sleep "$TICK"
done
