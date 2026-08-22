#!/usr/bin/env bash
# yt-dlp 版本檢查 + canary —— Eric 2026-08-22 拍板「保守做法」。
#
# 背景:2026-08-22 全庫 100% 播歌事故,根因 = 串流路徑用緊嘅 yt-dlp 太舊
# (brew stable 2026.07.04),YouTube 新版 player 簽出嚟嘅 URL 只開放頭 1MiB,
# 之後全 403。同一個 bug class 三次(8/18、8/19、8/22)。詳見
# YTDLP-UNIFY-PLAN-20260822.md。
#
# ⚠️ **呢個 script 預設唔會換 binary。** Eric 明確揀咗保守版:canary 過都唔自動
# 切換,淨係寫警報,等人手(Eric / session)批咗先真正切。點解要咁:自動換
# binary 即係「冇人睇住嘅情況下換咗播歌命脈嘅核心組件」,而 nightly 理論上
# 有 regression 風險;寧願慢半日,唔好靜靜哋換錯。
#
#   ./update-ytdlp.sh            # 檢查 + canary,寫 log/警報,**唔郁現役 binary**
#   ./update-ytdlp.sh --apply    # 人手批准之後先行呢句,真正切換(會自動留 .prev)
#   ./update-ytdlp.sh --verbose  # 睇晒中間步驟
#
# Rollback SOP(一句,唔使 restart backend —— 每次 resolve 都係逐次 spawn):
#   mv backend/tools/yt-dlp.prev backend/tools/yt-dlp
#
# Canary 三關(全部用**新落載嗰個 temp binary**行,唔會掂現役):
#   ① --version 行到(檔案冇爛 / 唔係 HTML 錯誤頁)
#   ② 兩首固定歌 --get-url 攞到 http URL(用同 resolveAudio.js default strategy
#      一字一樣嘅 flag)
#   ③ 攞到嘅 URL 即場 curl 64KB @ offset 2MiB 要 206 —— **就係 8/22 嗰個病灶
#      range**,直接驗個病本身,唔係驗個「頭 64KB」假陽性象限
#
# 排程:launchd `com.hymnstream.ytdlpupdate`,每日 05:30。
# ⚠️ label 特登唔用 com.hymnapp.* prefix —— 各班 checkpoint 核對
# `launchctl list | grep hymnapp` 要啱啱好 7 個 job,加 hymnapp job 會令佢哋以為出事。

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS="$REPO/backend/tools"
ACTIVE="$TOOLS/yt-dlp"
PREV="$TOOLS/yt-dlp.prev"
LOG="$REPO/docs/SUPERVISION-LOG.md"
HISTORY="$REPO/backend/data/ytdlp-update.log"
NIGHTLY_API="https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest"
# Canary 探測歌(同 stream-healthcheck.sh 頭兩首一樣;2026-08-22 查實 5.6MB / 4.4MB,
# 兩首都遠過 2MiB。換之前一定要重新查大細,細過 2MiB 會收 416 當 canary 失敗)。
# env override 純粹為咗**測得到失敗路徑**(指去一個唔存在嘅 video id 睇佢會唔會
# 真係擋住個切換)。日常運行唔好用。
CANARY_IDS=(${YTDLP_CANARY_IDS:-PG_J_0gsMXA 7UkwavM5L1E})
MID_RANGE="2097152-2162687"
CURL_TIMEOUT=60
RESOLVE_TIMEOUT=60

APPLY=0; VERBOSE=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --verbose) VERBOSE=1 ;;
    *) echo "unknown arg: $a"; exit 2 ;;
  esac
done

ts() { date '+%Y-%m-%d %H:%M'; }
say() { [[ $VERBOSE -eq 1 ]] && echo "$@"; return 0; }
hist() { echo "$(ts) $*" >> "$HISTORY"; }

# ⚠️ macOS 冇 `timeout`(GNU coreutils 先有,呢部機冇裝 —— 2026-08-22 實測 command
# not found)。照抄 Linux 寫法會令每次 canary 即刻 127 死,睇落好似「新版永遠唔合格」。
run_capped() {  # run_capped <秒> <cmd...>
  perl -e 'alarm shift; exec @ARGV or exit 127' "$@" 2>/dev/null
}

TMPDIR_SELF="$(mktemp -d "${TMPDIR:-/tmp}/ytdlp-update.XXXXXX")"
cleanup() { rm -rf "$TMPDIR_SELF"; }
trap cleanup EXIT

# ── 1. 現役版本 vs 最新 nightly ────────────────────────────────────
if [[ -x "$ACTIVE" ]]; then
  cur=$("$ACTIVE" --version 2>/dev/null | tr -d '\n')
else
  cur=""
fi
[[ -z "$cur" ]] && cur="(none)"
say "現役:$cur"

latest=$(curl -s --max-time 45 "$NIGHTLY_API" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('tag_name',''))" 2>/dev/null)
if [[ -z "$latest" ]]; then
  hist "check-failed 攞唔到 nightly release 資訊(網絡/GitHub API),現役維持 $cur"
  say "⚠ 攞唔到 latest,收工(唔當事故 —— 現役完全冇郁)"
  exit 0
fi
say "最新 nightly:$latest"

if [[ "$cur" == "$latest" ]]; then
  hist "up-to-date $cur"
  say "已經係最新,零下載收工"
  exit 0
fi

# ── 2. 落載去 temp(唔會寫目標路徑)────────────────────────────────
NEW="$TMPDIR_SELF/yt-dlp_macos"
url="https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/$latest/yt-dlp_macos"
say "落載 $url"
if ! curl -sL --max-time 600 -o "$NEW" "$url"; then
  hist "download-failed $latest(現役維持 $cur)"
  say "⚠ 落載失敗,現役唔郁"
  exit 0
fi
chmod +x "$NEW" 2>/dev/null
size=$(wc -c < "$NEW" | tr -d ' ')
if (( size < 10000000 )); then     # 正常 ~37MB;細過 10MB 多數係 HTML 錯誤頁
  hist "download-corrupt $latest size=$size(現役維持 $cur)"
  say "⚠ 落載嘅嘢太細($size bytes),當爛檔"
  exit 0
fi

# ── 3. Canary(全部用 temp 嗰個新 binary)──────────────────────────
canary_ok=0; canary_detail=""
newver=$(run_capped 60 "$NEW" --version | tr -d '\n')
if [[ "$newver" != "$latest" ]]; then
  canary_detail="① --version 行唔到或者對唔上(得「$newver」)"
else
  pass=0
  for yid in "${CANARY_IDS[@]}"; do
    u=$(run_capped "$RESOLVE_TIMEOUT" "$NEW" -f "bestaudio[ext=m4a]/bestaudio" \
        --get-url --no-playlist "https://www.youtube.com/watch?v=$yid" | head -1)
    if [[ "$u" != http* ]]; then
      canary_detail="$canary_detail ② $yid resolve 失敗;"
      say "  canary $yid → resolve FAIL"
      continue
    fi
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" -r "$MID_RANGE" "$u" 2>/dev/null)
    say "  canary $yid → mid-range HTTP ${code:-timeout}"
    if [[ "$code" == "206" ]]; then
      pass=$((pass+1))
    else
      canary_detail="$canary_detail ③ $yid mid-range ${code:-timeout};"
    fi
  done
  # 兩首都要過先算合格 —— canary 係「換唔換核心組件」嘅閘,寧緊莫鬆
  (( pass == ${#CANARY_IDS[@]} )) && canary_ok=1
fi

if (( canary_ok == 0 )); then
  hist "canary-FAIL $latest(現役維持 $cur)$canary_detail"
  {
    echo ""
    echo "- ⚠️ **yt-dlp nightly canary 唔過 $(ts)** — 新版 \`$latest\` 驗唔過,**現役 \`$cur\` 維持唔郁**(fail-safe 方向啱)。細節:$canary_detail"
    echo "  唔使急住做嘢:呢個唔代表而家播歌有事(串流健康檢查另外每 3 個鐘驗緊)。如果連續幾日都 canary-FAIL,就要人手睇下係 YouTube 側擋緊(429/bot-check)定係 nightly 真係壞咗。log:\`backend/data/ytdlp-update.log\`"
  } >> "$LOG"
  say "⚠ canary 唔過,已寫警報"
  exit 0
fi

# ── 4. Canary 過 ────────────────────────────────────────────────
if (( APPLY == 0 )); then
  # Eric 2026-08-22 拍板嘅保守做法:過都唔自動換,淨係通知等人批。
  hist "canary-PASS $latest(現役 $cur;**未換**,等人手 --apply)"
  {
    echo ""
    echo "- 🟡 **yt-dlp 有新 nightly,canary 已過 $(ts)** — 新版 \`$latest\`(現役 \`$cur\`)。三關全過(--version / 兩首 resolve / 64KB @ 2MiB mid-range 206)。"
    echo "  **按 Eric 2026-08-22 拍板嘅保守做法,script 冇自動換**。要切換就人手行:\`ops/ytdlp/update-ytdlp.sh --apply\`(會自動留低 \`backend/tools/yt-dlp.prev\`,唔啱一句 \`mv\` 返轉頭,唔使 restart backend)。"
  } >> "$LOG"
  say "✅ canary 過,但保守模式唔換 —— 已寫通知等人批"
  exit 0
fi

# --apply:人手批准,真正切換
cp -p "$ACTIVE" "$PREV" 2>/dev/null || true
mv "$NEW" "$ACTIVE"          # mv 原子;行緊嘅 exec 揸住舊 inode 唔受影響
chmod +x "$ACTIVE"
applied=$("$ACTIVE" --version 2>/dev/null | tr -d '\n')
hist "APPLIED $cur → $applied(人手 --apply;舊版留喺 yt-dlp.prev)"
{
  echo ""
  echo "- ✅ **yt-dlp 已人手升級 $(ts)** — \`$cur\` → \`$applied\`(canary 三關過先換)。舊版留咗喺 \`backend/tools/yt-dlp.prev\`,rollback 一句:\`mv backend/tools/yt-dlp.prev backend/tools/yt-dlp\`(唔使 restart backend)。"
} >> "$LOG"
say "✅ 已切換:$cur → $applied"
exit 0
