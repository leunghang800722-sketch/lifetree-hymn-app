#!/usr/bin/env bash
# ops/deploy/approve.sh <ota|backend> <sha> [--confirm]
#
# 記錄 Eric 批准「呢個 sha 嘅 code 可以出 production」。
# 設計成焗住做人肉核對:sha 必須明文提供、必須等於當前 HEAD;
# 冇 --confirm 淨係印會新包含嘅 commit,唔寫入批准檔。
#
# 批准檔位置由 HYMN_DEPLOY_DIR 決定(預設 ~/.hymn-deploy),方便測試時 override
# 免污染真批准檔。
#
# DEPLOY-GATE-PLAN.md §二 2.2
set -euo pipefail

usage() {
  echo "用法: $0 <ota|backend> <sha> [--confirm]" >&2
  exit 1
}

TARGET="${1:-}"
SHA="${2:-}"
CONFIRM=0
if [[ "${3:-}" == "--confirm" ]]; then
  CONFIRM=1
fi

if [[ "$TARGET" != "ota" && "$TARGET" != "backend" ]]; then
  echo "錯誤:第一個參數必須係 ota 或 backend(收到:'$TARGET')" >&2
  usage
fi

if [[ -z "$SHA" ]]; then
  echo "錯誤:必須明文提供 <sha>" >&2
  usage
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$SHA" != "$HEAD_SHA" ]]; then
  echo "錯誤:提供嘅 sha ($SHA) 唔等於當前 HEAD ($HEAD_SHA)。" >&2
  echo "只可以批准「你眼前呢一刻」嘅 HEAD,防止 approve 咗個唔知係乜嘅 sha。" >&2
  exit 1
fi

DEPLOY_DIR="${HYMN_DEPLOY_DIR:-$HOME/.hymn-deploy}"
APPROVED_JSON="$DEPLOY_DIR/approved.json"
DEPLOY_LOG="$DEPLOY_DIR/deploy.log"

mkdir -p "$DEPLOY_DIR"

if [[ ! -f "$APPROVED_JSON" ]]; then
  echo "{}" > "$APPROVED_JSON"
fi

PREV_SHA="$(node -e "
  const fs = require('fs');
  const [file, target] = process.argv.slice(1);
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    process.stdout.write((d[target] && d[target].sha) || '');
  } catch (e) { process.stdout.write(''); }
" "$APPROVED_JSON" "$TARGET" 2>/dev/null || echo "")"

echo "=== 批准目標: $TARGET ==="
echo "=== 新批准 sha: $SHA ==="
if [[ -n "$PREV_SHA" ]] && git cat-file -e "${PREV_SHA}^{commit}" 2>/dev/null; then
  echo "=== 上次批准 sha: $PREV_SHA ==="
  echo "=== 今次批准會新包含嘅 commit(git log $PREV_SHA..$SHA): ==="
  git log "$PREV_SHA..$SHA" --oneline || true
else
  echo "=== 首次批准(冇上次批准 sha 或上次 sha 喺呢個 repo 搵唔到),列出最近 10 個 commit: ==="
  git log -10 --oneline
fi

if [[ "$CONFIRM" -ne 1 ]]; then
  echo ""
  echo "(冇 --confirm,淨係預覽,未寫入批准檔)"
  exit 0
fi

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NOTE="approved via approve.sh"

node -e "
  const fs = require('fs');
  const [file, target, sha, approvedAt, note] = process.argv.slice(1);
  let d = {};
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { d = {}; }
  d[target] = { sha, approvedAt, note };
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
" "$APPROVED_JSON" "$TARGET" "$SHA" "$NOW" "$NOTE"

echo "$NOW | approve | target=$TARGET | sha=$SHA | note=$NOTE" >> "$DEPLOY_LOG"

echo ""
echo "✅ 已批准:$TARGET -> $SHA (寫入 $APPROVED_JSON)"
