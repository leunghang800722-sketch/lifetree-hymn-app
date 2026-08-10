#!/usr/bin/env bash
# ops/deploy/backend-restart.sh [--dry-run]
#
# 唯一合法嘅 backend restart 路徑。順序:
#   1. HEAD 必須等於 approved.json 嘅 backend.sha。
#   2. git status --porcelain -- backend/ 必須乾淨,但豁免運行時檔案
#      (hymns.db、users.db*、backend/data/、*.log、*.bak*、backend/public/ 等)。
#   3. 全過 -> launchctl bootout + bootstrap gui/$(id -u)/com.hymnapp.backend
#      (唔用 kickstart -k:嗰個淨係 restart 已 load 緊嘅 job spec,唔會重讀
#      plist——改咗 plist 嘅 EnvironmentVariables(例如 REGISTRATION_MODE)
#      唔會生效。bootout+bootstrap 先係真係由磁盤重新載入 plist),
#      然後 health check(10 秒內 200 先算成功)。
#   4. append deploy.log。
#
# --dry-run 行晒 1-2 但唔真係 restart。
#
# DEPLOY-GATE-PLAN.md §二 2.4
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
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

if [[ "$HEAD_SHA" != "$APPROVED_SHA" ]]; then
  echo "❌ abort:HEAD ($HEAD_SHA) 唔等於已批准嘅 backend.sha ($APPROVED_SHA)。" >&2
  echo "" >&2
  echo "你想 restart 嘅 tree 包含以下未經批准嘅 commit(git log $APPROVED_SHA..HEAD):" >&2
  git log "$APPROVED_SHA..HEAD" --oneline >&2 || true
  echo "" >&2
  echo "如果呢啲 commit 已經攞到 Eric go,請先跑:" >&2
  echo "  ops/deploy/approve.sh backend $HEAD_SHA --confirm" >&2
  exit 1
fi

# --- 2. git status --porcelain -- backend/ 乾淨,豁免運行時檔案 ---
# 豁免清單(呢啲係 job 運行時狀態,永遠髒,唔係 code):
#   backend/hymns.db*      — 主資料庫(含 -wal/-shm/-journal 等 sqlite 附屬檔)
#   backend/users.db*      — 會員資料庫 + 備份(users.db.bak-*)
#   backend/data/          — growLibrary/fetchLyrics/backfillMeta 等 job 產出
#   *.log                  — 任何 log 檔
#   *.bak*                 — 任何備份檔
#   backend/public/        — 如有靜態產出目錄
RAW_DIRTY="$(git status --porcelain -- backend/)"
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

echo "✅ 檢查全過:HEAD == 已批准 backend.sha ($APPROVED_SHA),backend/ 冇非運行時髒檔案"

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
  echo "$NOW | backend-restart | sha=$HEAD_SHA | health=FAIL | port=$PORT" >> "$DEPLOY_LOG"
  exit 1
fi

echo "$NOW | backend-restart | sha=$HEAD_SHA | health=OK | port=$PORT" >> "$DEPLOY_LOG"
echo "✅ backend restart 完成,health check 過(port $PORT),已記錄落 $DEPLOY_LOG"
