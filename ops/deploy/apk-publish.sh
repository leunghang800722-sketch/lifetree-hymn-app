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

# ⚠️ 修2(Opus 親身踩中嘅事故):以前係「攞頭 3 個 arg 做位置參數,之後先
# parse flag」—— 呢個做法喺 `apk-publish.sh <apk> 54 --dry-run` 漏咗
# versionName 嘅情況下,會將 `--dry-run` 本身當成 versionName 食咗,DRY_RUN
# 永遠唔會被設做 1,變成真執行(事故已還原,見 APP-UPDATE-CHECK-PLAN §5)。
# 而家改做:**先掃一次全部 arg,凡係 `--` 開頭嘅一律當 flag 抽走**,淨返嘅
# 先當位置參數;位置參數數量唔啱好 3 個就直接 abort,唔會靜默錯配。
DRY_RUN=0
URL="https://api.odemusics.com/downloads/app.apk"
POSITIONAL=()
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
    --*)
      echo "未知參數: $1" >&2
      usage
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ne 3 ]]; then
  echo "❌ 錯誤:要求恰好 3 個位置參數(apk路徑 / versionCode / versionName),實際收到 ${#POSITIONAL[@]} 個:${POSITIONAL[*]:-(無)}" >&2
  echo "   (提示:如果見到呢個錯誤但明明打咗 3 個位置參數,檢查係咪漏咗某個參數令 flag 被誤當位置參數)" >&2
  usage
fi

APK_PATH="${POSITIONAL[0]}"
VERSION_CODE="${POSITIONAL[1]}"
VERSION_NAME="${POSITIONAL[2]}"

if [[ ! "$VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "❌ 錯誤:versionCode 必須係正整數(收到:'$VERSION_CODE')" >&2
  exit 1
fi

if [[ -z "$VERSION_NAME" ]]; then
  echo "❌ 錯誤:必須明文提供 versionName" >&2
  exit 1
fi

if [[ "$VERSION_NAME" == --* ]]; then
  echo "❌ 錯誤:versionName 唔可以以 '--' 開頭(收到:'$VERSION_NAME')—— 呢個好大機會係漏咗某個位置參數,令一個 flag 被誤當成 versionName" >&2
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
# 加時分秒(唔淨係日期)—— 同一日重行呢個 script(例如手快錯咗再嚟一次)
# 唔會令第二次嘅 backup 覆蓋第一次個 backup,兩隻歷史 APK 都留得低。
TIMESTAMP="$(date -u +"%Y%m%d-%H%M%S")"

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
BACKUP_APK="$PUBLIC_DIR/app.apk.bak-${OLD_VERSION_NAME}-${TIMESTAMP}"

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

# ⚠️ 修2(b):次序改做「manifest 先寫去 temp → APK cp 成功 → 先 mv temp
# manifest 落實際位置」。原本嘅次序係 cp APK 完即刻直接寫 live manifest,
# 如果中途(例如 cp 果吓)fail 咗,會留低「新 APK + 舊 manifest」呢種唔一致
# 組合。而家 manifest 內容一早喺 temp 檔度預備好,mv 係同一 filesystem 上
# 嘅 atomic rename,所以 manifest 要不全新、要不完全未郁,唔會有中間態。
MANIFEST_TMP="$(mktemp "${MANIFEST}.tmp.XXXXXX")"
trap 'rm -f "$MANIFEST_TMP"' EXIT

node -e "
  const fs = require('fs');
  const [file, versionCode, versionName, url] = process.argv.slice(1);
  const manifest = { versionCode: Number(versionCode), versionName, url };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
" "$MANIFEST_TMP" "$VERSION_CODE" "$VERSION_NAME" "$URL"

cp "$APK_PATH" "$TARGET_APK"
echo "✅ 新 APK 已 cp 去 $TARGET_APK"

mv "$MANIFEST_TMP" "$MANIFEST"
trap - EXIT
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
