#!/usr/bin/env bash
# ops/deploy/ota-publish.sh "<message>" [--dry-run]
#
# 唯一合法嘅 OTA 推送路徑。順序:
#   1. frontend/hymn-app working tree 必須完全乾淨(唔乾淨就 abort 並列出髒檔案)。
#   2. HEAD 必須等於 approved.json 嘅 ota.sha(唔係就 abort 並印出未批准嘅 commit)。
#   3. 全過 -> cd frontend/hymn-app && eas update --channel production --platform android --message "<message>"
#      (--platform android 係必須:唔帶預設 all platforms 會連 web 一齊 export,
#      而 web bundle 因為 react-native-track-player 嘅 web backend 缺 shaka-player
#      peer dep 會 export 失敗 —— 見 HANDOFF.md §2.10/EAS-UPDATE-PLAN.md §四)
#   4. 成功後 append deploy.log。
#
# --dry-run 行晒 1-2 但唔推,俾驗證用。
#
# DEPLOY-GATE-PLAN.md §二 2.3
set -euo pipefail

MESSAGE="${1:-}"
DRY_RUN=0
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
done

if [[ -z "$MESSAGE" || "$MESSAGE" == "--dry-run" ]]; then
  echo "用法: $0 \"<message>\" [--dry-run]" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DEPLOY_DIR="${HYMN_DEPLOY_DIR:-$HOME/.hymn-deploy}"
APPROVED_JSON="$DEPLOY_DIR/approved.json"
DEPLOY_LOG="$DEPLOY_DIR/deploy.log"

if [[ ! -f "$APPROVED_JSON" ]]; then
  echo "❌ 錯誤:搵唔到批准檔 $APPROVED_JSON。請先跑 ops/deploy/approve.sh ota <sha> --confirm。" >&2
  exit 1
fi

# --- 1. frontend/hymn-app working tree 必須完全乾淨 ---
DIRTY="$(git status --porcelain -- frontend/hymn-app)"
if [[ -n "$DIRTY" ]]; then
  echo "❌ abort:frontend/hymn-app working tree 唔乾淨,以下檔案有未 commit 改動:" >&2
  echo "$DIRTY" >&2
  echo "" >&2
  echo "OTA 必須喺完全乾淨嘅 tree 度推(export 嘅係當刻檔案,唔係 HEAD)。" >&2
  echo "唔准夾埋其他 session 未完成嘅改動 —— 唔准 git add -A / git stash 其他人嘅檔案。" >&2
  exit 1
fi

# --- 2. HEAD == approved.json 嘅 ota.sha ---
HEAD_SHA="$(git rev-parse HEAD)"
APPROVED_SHA="$(node -e "
  const fs = require('fs');
  try {
    const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    process.stdout.write((d.ota && d.ota.sha) || '');
  } catch (e) { process.stdout.write(''); }
" "$APPROVED_JSON")"

if [[ -z "$APPROVED_SHA" ]]; then
  echo "❌ abort:批准檔入面冇 ota.sha。請先跑 ops/deploy/approve.sh ota <HEAD sha> --confirm。" >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$APPROVED_SHA" ]]; then
  echo "❌ abort:HEAD ($HEAD_SHA) 唔等於已批准嘅 ota.sha ($APPROVED_SHA)。" >&2
  echo "" >&2
  echo "你想推嘅 tree 包含以下未經批准嘅 commit(git log $APPROVED_SHA..HEAD):" >&2
  git log "$APPROVED_SHA..HEAD" --oneline >&2 || true
  echo "" >&2
  echo "如果呢啲 commit 已經攞到 Eric go,請先跑:" >&2
  echo "  ops/deploy/approve.sh ota $HEAD_SHA --confirm" >&2
  exit 1
fi

echo "✅ 檢查全過:frontend/hymn-app 乾淨,HEAD == 已批准 ota.sha ($APPROVED_SHA)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(--dry-run,唔會真係推 eas update)"
  exit 0
fi

cd "$REPO_ROOT/frontend/hymn-app"
eas update --channel production --platform android --message "$MESSAGE"

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$DEPLOY_DIR"
echo "$NOW | ota-publish | sha=$HEAD_SHA | message=$MESSAGE" >> "$DEPLOY_LOG"

echo "✅ OTA 推送完成,已記錄落 $DEPLOY_LOG"
