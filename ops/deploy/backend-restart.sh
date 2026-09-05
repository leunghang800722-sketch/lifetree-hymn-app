#!/usr/bin/env bash
# ops/deploy/backend-restart.sh [--dry-run] [--same-code]
#
# 唯一合法嘅 backend restart 路徑。順序:
#   1. HEAD 必須等於 approved.json 嘅 backend.sha —— **除非** `--same-code`
#      (2026-09-05 STREAM-SELFHEAL F4):HEAD≠approved 嗰陣,唔即刻 abort,
#      改為驗 `git diff --quiet <approved> HEAD -- backend` (豁免
#      hymns.db/data/public/logs 呢啲運行時目錄) —— 如果 backend/ 嘅
#      **code** 同已批准嗰個 sha 完全一樣(即係只係 docs/frontend/每晚
#      hymns.db 自動備份 commit 令 HEAD 前進咗),就當過咗,照准 restart。
#      背景:`com.hymnapp.dbautosync` 每晚自動 commit hymns.db,HEAD 日日
#      行前,而 gate 原本係 per-repo-sha,連純 docs commit 都會令自動修復梯
#      嘅②(backend restart)永久 gate-blocked(2026-09-05 Opus 驗收 §3b)。
#      `--same-code` 只放寬「sha 必須完全相等」呢一條,第 2 步嘅髒檔案檢查
#      同健康檢查全部原樣保留;backend/ code 有真實差異照舊 abort。
#   2. git status --porcelain -- backend/ 必須乾淨,但豁免運行時檔案
#      (hymns.db、users.db*、backend/data/、*.log、*.bak*、backend/public/ 等)。
#   3. 全過 -> launchctl bootout + bootstrap gui/$(id -u)/com.hymnapp.backend
#      (唔用 kickstart -k:嗰個淨係 restart 已 load 緊嘅 job spec,唔會重讀
#      plist——改咗 plist 嘅 EnvironmentVariables(例如 REGISTRATION_MODE)
#      唔會生效。bootout+bootstrap 先係真係由磁盤重新載入 plist),
#      然後 health check(10 秒內 200 先算成功)。
#   4. append deploy.log(記 mode=normal|same-code + approved sha)。
#
# --dry-run 行晒 1-2 但唔真係 restart。
#
# DEPLOY-GATE-PLAN.md §二 2.4;--same-code 見 STREAM-SELFHEAL-EXEC-20260905.md §F4
set -euo pipefail

DRY_RUN=0
SAME_CODE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --same-code) SAME_CODE=1 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DEPLOY_DIR="${HYMN_DEPLOY_DIR:-$HOME/.hymn-deploy}"
APPROVED_JSON="$DEPLOY_DIR/approved.json"
DEPLOY_LOG="$DEPLOY_DIR/deploy.log"

if [[ ! -f "$APPROVED_JSON" ]]; then
  echo "❌ 錯誤:搵唔到批准檔 $APPROVED_JSON。請先跑 ops/deploy/approve.sh backend <sha> --confirm。" >&2
  exit 1
fi

# --- 1. HEAD == approved.json 嘅 backend.sha ---
HEAD_SHA="$(git rev-parse HEAD)"
APPROVED_SHA="$(node -e "
  const fs = require('fs');
  try {
    const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    process.stdout.write((d.backend && d.backend.sha) || '');
  } catch (e) { process.stdout.write(''); }
" "$APPROVED_JSON")"

if [[ -z "$APPROVED_SHA" ]]; then
  echo "❌ abort:批准檔入面冇 backend.sha。請先跑 ops/deploy/approve.sh backend <HEAD sha> --confirm。" >&2
  exit 1
fi

MODE_TAG="normal"
if [[ "$HEAD_SHA" != "$APPROVED_SHA" ]]; then
  SAME_CODE_OK=0
  if [[ "$SAME_CODE" -eq 1 ]]; then
    # 淨係比較 backend/ code,豁免同 §2 一樣嘅運行時目錄/檔案(hymns.db 系列、
    # backend/data/、backend/public/、backend/logs/)。--quiet 淨係睇 exit
    # code,冇差異先 0。用兩個 sha 直接 diff,唔理 working tree 現況(第 2 步
    # 會另外驗 working tree 乾淨)。
    if git diff --quiet "$APPROVED_SHA" "$HEAD_SHA" -- backend \
         ':!backend/hymns.db' ':!backend/data' ':!backend/public' ':!backend/logs' 2>/dev/null; then
      SAME_CODE_OK=1
    fi
  fi
  if [[ "$SAME_CODE_OK" -eq 1 ]]; then
    MODE_TAG="same-code"
    echo "✅ --same-code:HEAD ($HEAD_SHA) ≠ 已批准 backend.sha ($APPROVED_SHA),但 backend/ code 同已批准嗰個 sha 完全一樣(只係 docs/frontend/每晚 DB 自動備份令 HEAD 前進),准行 (mode=same-code approved=$APPROVED_SHA head=$HEAD_SHA)"
  else
    echo "❌ abort:HEAD ($HEAD_SHA) 唔等於已批准嘅 backend.sha ($APPROVED_SHA)。" >&2
    echo "" >&2
    echo "你想 restart 嘅 tree 包含以下未經批准嘅 commit(git log $APPROVED_SHA..HEAD):" >&2
    git log "$APPROVED_SHA..HEAD" --oneline >&2 || true
    if [[ "$SAME_CODE" -eq 1 ]]; then
      echo "" >&2
      echo "(已試過 --same-code:backend/ code 同已批准 sha 有真實差異,唔止係 docs/frontend/DB 自動備份,唔可以放行。)" >&2
    fi
    echo "" >&2
    echo "如果呢啲 commit 已經攞到 Eric go,請先跑:" >&2
    echo "  ops/deploy/approve.sh backend $HEAD_SHA --confirm" >&2
    exit 1
  fi
fi

# --- 2. git status --porcelain -- backend/ 乾淨,豁免運行時檔案 ---
# 豁免清單(呢啲係 job 運行時狀態,永遠髒,唔係 code):
#   backend/hymns.db*      — 主資料庫(含 -wal/-shm/-journal 等 sqlite 附屬檔)
#   backend/users.db*      — 會員資料庫 + 備份(users.db.bak-*)
#   backend/data/          — growLibrary/fetchLyrics/backfillMeta 等 job 產出
#   *.log                  — 任何 log 檔
#   *.bak*                 — 任何備份檔
#   backend/public/        — 如有靜態產出目錄
# ⚠️ 2026-08-24 R1:一定要 `-c core.quotepath=false`。冇佢嘅話 git 會將非 ASCII 路徑
#    quote 成 `?? "backend/data/instrumental/\345\244\251..."`,行頭多咗個引號,
#    下面 `^.. backend/data/` 呢類豁免 pattern 就對唔上,令純中文檔名嘅運行時產出
#    被誤判成「未 commit 嘅 code 改動」而 abort。豁免清單本身零改動。
RAW_DIRTY="$(git -c core.quotepath=false status --porcelain -- backend/)"
FILTERED_DIRTY="$(echo "$RAW_DIRTY" | grep -vE \
  -e '^.. backend/hymns\.db' \
  -e '^.. backend/users\.db' \
  -e '^.. backend/data/' \
  -e '\.log$' \
  -e '\.bak' \
  -e '^.. backend/public/' \
  || true)"
# grep -v 空結果時仍會輸出空行,要清走
FILTERED_DIRTY="$(echo "$FILTERED_DIRTY" | sed '/^\s*$/d')"

if [[ -n "$FILTERED_DIRTY" ]]; then
  echo "❌ abort:backend/ working tree 有唔屬於運行時豁免嘅未 commit 改動:" >&2
  echo "$FILTERED_DIRTY" >&2
  echo "" >&2
  echo "(運行時檔案如 hymns.db/users.db*/backend/data//*.log/*.bak*/backend/public/ 已豁免)" >&2
  exit 1
fi

if [[ "$MODE_TAG" == "same-code" ]]; then
  echo "✅ 檢查全過:HEAD (${HEAD_SHA}) 同已批准 backend.sha (${APPROVED_SHA}) code 相同(mode=same-code),backend/ 冇非運行時髒檔案"
else
  echo "✅ 檢查全過:HEAD == 已批准 backend.sha ($APPROVED_SHA),backend/ 冇非運行時髒檔案"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(--dry-run,唔會真係 kickstart backend)"
  exit 0
fi

# 搵 backend 監聽緊嘅 port(server.js 入面 process.env.PORT || <fallback>)
PORT="${PORT:-}"
if [[ -z "$PORT" ]]; then
  PORT="$(node -e "
    const fs = require('fs');
    const src = fs.readFileSync(process.argv[1], 'utf8');
    const m = src.match(/const\s+PORT\s*=\s*process\.env\.PORT\s*\|\|\s*(\d+)/);
    process.stdout.write(m ? m[1] : '3001');
  " "$REPO_ROOT/backend/server.js")"
fi

UID_N="$(id -u)"
LABEL="com.hymnapp.backend"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

# bootout 先卸載(如果本來冇 load 緊會非 0 exit,唔可以令成個 script 中斷)
launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
sleep 1
# bootstrap 由磁盤重新讀 plist(RunAtLoad=true 會即刻起返)
launchctl bootstrap "gui/${UID_N}" "$PLIST_PATH"

# health check:10 秒內 200 先算成功
OK=0
for i in $(seq 1 10); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/health" --max-time 2 2>/dev/null | grep -q "^2\|^3"; then
    OK=1
    break
  fi
done

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$DEPLOY_DIR"

if [[ "$OK" -ne 1 ]]; then
  echo "❌ health check 失敗:kickstart 完 10 秒內 localhost:${PORT}/api/health 都冇 2xx/3xx 回應。" >&2
  echo "$NOW | backend-restart | sha=$HEAD_SHA | health=FAIL | port=$PORT | mode=$MODE_TAG approved=$APPROVED_SHA" >> "$DEPLOY_LOG"
  exit 1
fi

echo "$NOW | backend-restart | sha=$HEAD_SHA | health=OK | port=$PORT | mode=$MODE_TAG approved=$APPROVED_SHA" >> "$DEPLOY_LOG"
echo "✅ backend restart 完成,health check 過(port $PORT),已記錄落 $DEPLOY_LOG"
