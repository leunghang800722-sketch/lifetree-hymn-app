#!/usr/bin/env bash
# yt-dlp 版本檢查 + canary —— Eric 2026-08-22 拍板「保守做法」。
#
# 背景:2026-08-22 全庫 100% 播歌事故,根因 = 串流路徑用緊嘅 yt-dlp 太舊
# (brew stable 2026.07.04),YouTube 新版 player 簽出嚟嘅 URL 只開放頭 1MiB,
# 之後全 403。同一個 bug class 三次(8/18、8/19、8/22)。詳見
# YTDLP-UNIFY-PLAN-20260822.md。
#
# ⚠️ **呢個 script 預設唔會換版本。** Eric 明確揀咗保守版:canary 過都唔自動
# 切換,淨係寫通知,等人手(Eric / session)批咗先真正切。點解要咁:自動換
# 即係「冇人睇住嘅情況下換咗播歌命脈嘅核心組件」,而 nightly 理論上有 regression
# 風險;寧願慢半日,唔好靜靜哋換錯。
#
#   ./update-ytdlp.sh            # 檢查 + canary,寫 log/通知,**唔郁現役**
#   ./update-ytdlp.sh --apply    # 人手批准之後先行呢句,真正切換
#   ./update-ytdlp.sh --verbose  # 睇晒中間步驟
#
# ── 點解係 pip venv 而唔係 standalone binary(2026-08-22 實測改方案)────────
# 規劃書原本寫「落載 yt-dlp_macos standalone binary(37MB)」。實測喺呢部機**行唔通**:
# 嗰個 adhoc-signed 37MB Mach-O,每次 exec 都俾 macOS XprotectService 重新掃一次,
# 淨係 `--version` 都要 **26–42 秒**(user time 得 0.6s,即係全程等緊掃描;實測
# XprotectService 食 55% CPU)。而 resolveAudio.js 個 RESOLVE_TIMEOUT_MS 係 12 秒
# —— 即係話用 standalone binary 嘅話,**每一次冷 resolve 都必定 timeout**,成個
# 串流會冧,比原本個病仲衰。剷 xattr / 本機重簽都冇用(兩樣都試過)。
# pip 裝落 venv 就冇呢個問題(一堆細 .py,冇大 Mach-O 俾人掃):**同一個 nightly
# 版本,0.17 秒**,真 resolve 2.9 秒。brew 版一路都咁快都係同一個原因。
#
# ── a/b 雙 venv + symlink(點解要咁)────────────────────────────────
# venv 入面啲 console script 個 shebang 係**絕對路徑**,所以 venv 資料夾唔可以改名
# (一改就 shebang 指去唔存在嘅 python)。所以唔用「mv 新蓋舊」,改用兩個固定
# slot(`ytdlp-venv-a` / `ytdlp-venv-b`)+ 一條 symlink `backend/tools/yt-dlp`
# 指住現役嗰個。更新 = 裝落**閒置**嗰個 slot、喺度 canary、過咗先 `ln -sfn` 一下
# 揈條 symlink 過去。好處:①切換係一個 symlink 操作,唔會有「裝到一半俾人 exec」
# 嘅窗口 ②rollback 就係揈返轉頭,唔使網絡、唔使 restart backend(每次 resolve
# 都係逐次 spawn,新舊即時生效)。
#
# Rollback SOP(一句):
#   cd backend/tools && ln -sfn ytdlp-venv-<另一個 slot>/bin/yt-dlp yt-dlp
#
# Canary 三關(全部用**閒置 slot 嗰個新版本**行,唔會掂現役):
#   ① --version 行到、而且等於預期版本
#   ② 兩首固定歌 --get-url 攞到 http URL(同 resolveAudio.js default strategy
#      一字一樣嘅 flag)
#   ③ 攞到嘅 URL 即場 curl 64KB @ offset 2MiB 要 206 —— **就係 8/22 嗰個病灶
#      range**,直接驗個病本身,唔係驗個「頭 64KB」假陽性象限
#
# 排程:launchd `com.hymnstream.ytdlpupdate`,每日 05:30。
# ⚠️ 個 label 特登唔用 com.hymnapp.* prefix —— 各班 checkpoint 核對
# `launchctl list | grep hymnapp` 要啱啱好 7 個 job,加 hymnapp job 會令佢哋以為出事。

set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS="$REPO/backend/tools"
LINK="$TOOLS/yt-dlp"                 # 全 app 唯一嘅 canonical path(symlink)
SLOT_A="$TOOLS/ytdlp-venv-a"
SLOT_B="$TOOLS/ytdlp-venv-b"
LOG="$REPO/docs/SUPERVISION-LOG.md"
HISTORY="$REPO/backend/data/ytdlp-update.log"
# Canary 探測歌(同 stream-healthcheck.sh 頭兩首一樣;2026-08-22 查實 5.6MB / 4.4MB,
# 兩首都遠過 2MiB。換之前一定要重新查大細,細過 2MiB 會收 416 當 canary 失敗)。
# env override 純粹為咗**測得到失敗路徑**(指去唔存在嘅 video id)。日常唔好用。
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

# ── 0. 搞清楚邊個 slot 現役、邊個閒置 ──────────────────────────────
active_target="$(readlink "$LINK" 2>/dev/null || true)"
case "$active_target" in
  ytdlp-venv-a/*) ACTIVE="$SLOT_A"; IDLE="$SLOT_B"; ACTIVE_NAME=a; IDLE_NAME=b ;;
  ytdlp-venv-b/*) ACTIVE="$SLOT_B"; IDLE="$SLOT_A"; ACTIVE_NAME=b; IDLE_NAME=a ;;
  *)
    # 未 bootstrap(clean checkout / 手殘剷咗)—— 由 slot a 開始裝
    ACTIVE=""; IDLE="$SLOT_A"; ACTIVE_NAME="(none)"; IDLE_NAME=a ;;
esac
say "現役 slot:$ACTIVE_NAME;會裝落 slot:$IDLE_NAME"

cur=""
[[ -x "$LINK" ]] && cur=$("$LINK" --version 2>/dev/null | tr -d '\n')
[[ -z "$cur" ]] && cur="(none)"
say "現役版本:$cur"

# ── 1+2. 裝最新 nightly 落閒置 slot(唔會掂現役)──────────────────
# ⚠️ 特登**唔自己 parse PyPI 版本號**:實測 PyPI 個 releases 列表除咗純數字版本,
# 仲有 `.post1` / `.dev0` 呢啲,自己排序好易靜靜哋揀錯(第一版就中過:攞返嚟嘅
# 「最新」係 stable 2026.8.19,唔係 nightly)。而家改成交返俾 pip 自己 resolve
# (`--pre` = 收 pre-release,即 nightly channel),裝完先讀返個真實版本嚟比。
# 代價 = 就算已經最新都會行一次 pip(幾秒),完全值得。
if [[ ! -x "$IDLE/bin/python3" ]]; then
  say "建立 venv:$IDLE"
  if ! python3 -m venv "$IDLE" >/dev/null 2>&1; then
    hist "venv-failed $IDLE(現役維持 $cur)"
    say "⚠ 起唔到 venv,現役唔郁"
    exit 0
  fi
fi
say "pip install --pre yt-dlp 落 slot $IDLE_NAME"
if ! "$IDLE/bin/pip" install -q --upgrade --pre "yt-dlp[default]" >/dev/null 2>&1; then
  hist "pip-failed(現役維持 $cur)"
  {
    echo ""
    echo "- ⚠️ **yt-dlp nightly 裝唔到 $(ts)** — \`pip install --pre yt-dlp\` 失敗(網絡?PyPI?),**現役 \`$cur\` 維持唔郁**。log:\`backend/data/ytdlp-update.log\`"
  } >> "$LOG"
  say "⚠ pip 失敗,現役唔郁"
  exit 0
fi

NEW="$IDLE/bin/yt-dlp"
latest=$("$NEW" --version 2>/dev/null | tr -d '\n')
if [[ -z "$latest" ]]; then
  hist "install-broken 裝完行唔到 --version(現役維持 $cur)"
  say "⚠ 新裝嗰個行唔到,現役唔郁"
  exit 0
fi
say "最新 nightly:$latest(現役 $cur)"
if [[ "$cur" == "$latest" ]]; then
  hist "up-to-date $cur"
  say "已經係最新,唔使換"
  exit 0
fi


# ── 3. Canary(全部用閒置 slot 嗰個新版本)────────────────────────
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
  hist "canary-FAIL $latest(現役維持 $cur,slot $IDLE_NAME 留低咗個新版等人查)$canary_detail"
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
  hist "canary-PASS $latest(現役 $cur;**未換**,已裝喺 slot $IDLE_NAME 等人手 --apply)"
  {
    echo ""
    echo "- 🟡 **yt-dlp 有新 nightly,canary 已過 $(ts)** — 新版 \`$latest\`(現役 \`$cur\`)。三關全過(--version / 兩首 resolve / 64KB @ 2MiB mid-range 206),已經裝好喺閒置 slot \`ytdlp-venv-$IDLE_NAME\`。"
    echo "  **按 Eric 2026-08-22 拍板嘅保守做法,script 冇自動換**。要切換就人手行:\`ops/ytdlp/update-ytdlp.sh --apply\`(一個 symlink 操作,唔使 restart backend;rollback 就係揈返轉頭)。"
  } >> "$LOG"
  say "✅ canary 過,但保守模式唔換 —— 已寫通知等人批"
  exit 0
fi

# --apply:人手批准,揈 symlink(原子)
ln -sfn "ytdlp-venv-$IDLE_NAME/bin/yt-dlp" "$LINK"
applied=$("$LINK" --version 2>/dev/null | tr -d '\n')
hist "APPLIED $cur(slot $ACTIVE_NAME)→ $applied(slot $IDLE_NAME);rollback: ln -sfn ytdlp-venv-$ACTIVE_NAME/bin/yt-dlp yt-dlp"
{
  echo ""
  echo "- ✅ **yt-dlp 已人手升級 $(ts)** — \`$cur\` → \`$applied\`(canary 三關過先換)。現役 slot 由 \`$ACTIVE_NAME\` 揈咗去 \`$IDLE_NAME\`。Rollback 一句(唔使 restart backend):\`cd backend/tools && ln -sfn ytdlp-venv-$ACTIVE_NAME/bin/yt-dlp yt-dlp\`。"
} >> "$LOG"
say "✅ 已切換:$cur(slot $ACTIVE_NAME)→ $applied(slot $IDLE_NAME)"
exit 0
