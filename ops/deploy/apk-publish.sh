#!/usr/bin/env bash
# ops/deploy/apk-publish.sh <apk路徑> <versionCode> <versionName> [--dry-run] [--url <url>]
#
# 換 APK 嘅唯一合法路徑(APP-UPDATE-CHECK-PLAN.md §1.1)。順序:
#   1. 核對 <apk路徑> 存在,<versionCode> 係正整數。
#   2. 舊 backend/public/app.apk(如存在)自動 backup 做
#      backend/public/app.apk.bak-<舊version>-<date>(唔覆蓋歷史,舊版本號讀
#      自現有 app-version.json,搵唔到就用 "unknown")。
#   3. cp 新 APK 去 backend/public/app.apk。
#   4. 寫 backend/public/app-version.json:{ versionCode, versionName, url }。
#   5. 印新 app.apk 嘅 md5,俾人肉核對載到嘅同上載嘅係同一隻檔。
#
# --dry-run:行晒 1,印晒 2-4 會做啲乜,但唔真係郁 backend/public/ 任何檔案。
#
# url 預設 https://api.odemusics.com/downloads/app.apk,可用 --url 覆蓋。
#
# 注意:backend/public/ 屬 backend-restart.sh 嘅 dirty-check 豁免目錄(運行時
# 檔案,唔使 approve.sh 批准就可以換);但換完記得照樣行 backend gate 流程
# restart backend,先會生效(呢個 script 淨係換檔案,唔會自己 restart)。
set -euo pipefail

usage() {
  echo "用法: $0 <apk路徑> <versionCode> <versionName> [--dry-run] [--url <url>]" >&2
  exit 1
}

if [[ $# -lt 3 ]]; then
  usage
fi

APK_PATH="$1"
VERSION_CODE="$2"
VERSION_NAME="$3"
shift 3

DRY_RUN=0
URL="https://api.odemusics.com/downloads/app.apk"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --url)
      URL="${2:-}"
      if [[ -z "$URL" ]]; then
        echo "❌ 錯誤:--url 要帶埋個值" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "未知參數: $1" >&2
      usage
      ;;
  esac
done

if [[ ! "$VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "❌ 錯誤:versionCode 必須係正整數(收到:'$VERSION_CODE')" >&2
  exit 1
fi

if [[ -z "$VERSION_NAME" ]]; then
  echo "❌ 錯誤:必須明文提供 versionName" >&2
  exit 1
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "❌ 錯誤:搵唔到 APK 檔案:$APK_PATH" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PUBLIC_DIR="$REPO_ROOT/backend/public"
TARGET_APK="$PUBLIC_DIR/app.apk"
MANIFEST="$PUBLIC_DIR/app-version.json"
TODAY="$(date -u +"%Y%m%d")"

OLD_VERSION_NAME="unknown"
if [[ -f "$MANIFEST" ]]; then
  OLD_VERSION_NAME="$(node -e "
    const fs = require('fs');
    try {
      const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      process.stdout.write(d.versionName || 'unknown');
    } catch (e) { process.stdout.write('unknown'); }
  " "$MANIFEST")"
fi
BACKUP_APK="$PUBLIC_DIR/app.apk.bak-${OLD_VERSION_NAME}-${TODAY}"

echo "=== apk-publish ==="
echo "來源 APK: $APK_PATH"
echo "versionCode: $VERSION_CODE"
echo "versionName: $VERSION_NAME"
echo "url: $URL"
echo "目標: $TARGET_APK"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(--dry-run,以下係會做但未做嘅動作)"
  if [[ -f "$TARGET_APK" ]]; then
    echo "  -> 會 backup 現有 $TARGET_APK 去 $BACKUP_APK"
  else
    echo "  -> 現有 $TARGET_APK 唔存在,冇嘢要 backup"
  fi
  echo "  -> 會 cp $APK_PATH -> $TARGET_APK"
  echo "  -> 會寫 $MANIFEST:"
  echo "     { \"versionCode\": $VERSION_CODE, \"versionName\": \"$VERSION_NAME\", \"url\": \"$URL\" }"
  echo "  -> 會印新 app.apk 嘅 md5"
  echo "(--dry-run 完,冇郁任何 backend/public/ 檔案)"
  exit 0
fi

mkdir -p "$PUBLIC_DIR"

if [[ -f "$TARGET_APK" ]]; then
  cp "$TARGET_APK" "$BACKUP_APK"
  echo "✅ 舊 app.apk 已 backup 去 $BACKUP_APK"
fi

cp "$APK_PATH" "$TARGET_APK"
echo "✅ 新 APK 已 cp 去 $TARGET_APK"

node -e "
  const fs = require('fs');
  const [file, versionCode, versionName, url] = process.argv.slice(1);
  const manifest = { versionCode: Number(versionCode), versionName, url };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
" "$MANIFEST" "$VERSION_CODE" "$VERSION_NAME" "$URL"
echo "✅ manifest 已寫: $MANIFEST"
cat "$MANIFEST"

if command -v md5 >/dev/null 2>&1; then
  MD5="$(md5 -q "$TARGET_APK")"
elif command -v md5sum >/dev/null 2>&1; then
  MD5="$(md5sum "$TARGET_APK" | awk '{print $1}')"
else
  MD5="(冇 md5/md5sum 命令,跳過)"
fi
echo "✅ app.apk md5: $MD5"

echo ""
echo "✅ apk-publish 完成。呢個 script 淨係換檔案,記得照 DEPLOY-GATE-PLAN 走 backend gate 流程 restart backend 先會生效。"
