#!/usr/bin/env bash
# ops/deploy/ota-publish.sh "<message>" [--dry-run]
#
# 唯一合法嘅 OTA 推送路徑。順序:
#   1. frontend/hymn-app working tree 必須完全乾淨(唔乾淨就 abort 並列出髒檔案)。
#   2. HEAD 必須等於 approved.json 嘅 ota.sha(唔係就 abort 並印出未批准嘅 commit)。
#   3. 全過 -> cd frontend/hymn-app && eas update(見底下實際 flags)
#      2026-08-11(iOS Phase 2 上線後補):`--platform` 淨係接受單一值
#      android/ios/all(eas-cli platform.js 嘅 RequestedPlatform enum),冇
#      逗號分隔語法。所以呢度分開跑兩次 —— android 一次、ios 一次 —— 兩次都用
#      同一個已批准 HEAD sha、同一個 message,產生兩個 update group(呢個
#      project 而家兩個平台共用同一個 runtimeVersion/channel,同一個 commit
#      理應兩邊都推,唔可以淨推 android 令 iOS 停留喺舊 JS bundle)。
#      舊版曾經淨用 `--platform android`,原因係「`all` 會連 web 一齊 export,
#      而 web bundle 因為 react-native-track-player 嘅 web backend 缺
#      shaka-player peer dep 會炒」——但依家裝緊嘅 eas-cli(21.7.1)
#      `RequestedPlatform` 已經冇 web 呢個值(`platform.js` 明文 TODO:「Add web
#      when it's fully supported」),`all` 只會 resolve 做 [android, ios]。
#      即使咁,呢度都揀「分開兩次、各自單一 platform 值」而唔係賭一手
#      `--platform all`——android 呢句係成個 project 用咗成個月、反覆驗證過嘅
#      精確命令,加多一次同樣單一值嘅 ios 呼叫係風險最低嘅擴展方式。
#      --non-interactive + --environment production 係必須:Claude Code session
#      冇 TTY,eas-cli ≥19 non-interactive mode 唔帶 --environment 會直接炒
#      "The --environment flag must be set when running in --non-interactive mode")
#   4. 成功後 append deploy.log(兩次 publish 各自一行)。
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

mkdir -p "$DEPLOY_DIR"

for PLAT in android ios; do
  echo "── 推 $PLAT ──"
  eas update --channel production --platform "$PLAT" --environment production --non-interactive --message "$MESSAGE"
  NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "$NOW | ota-publish | platform=$PLAT | sha=$HEAD_SHA | message=$MESSAGE" >> "$DEPLOY_LOG"
done

echo "✅ OTA 推送完成(android + ios),已記錄落 $DEPLOY_LOG"
