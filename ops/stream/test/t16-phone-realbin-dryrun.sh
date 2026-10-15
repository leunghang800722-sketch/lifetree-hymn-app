#!/usr/bin/env bash
# T16(P3):launchd 等效環境(cd / && env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin)下,wlib_notify_phone 用「真 openclaw 二進位 + --dry-run」(真 conf,target 全程遮罩)。
# 唔發真訊息(--dry-run = 只印 payload)。log 落 scratch(WATCH_PHONE_LOG),唔掂 ~/.hymn-deploy。用法:t16-phone-realbin-dryrun.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t16"; T="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$T/../../.." && pwd -P)"
rm -rf "${S:?}"; mkdir -p "$S"
REALHOME="$(/usr/bin/dscl . -read "/Users/$(/usr/bin/id -un)" NFSHomeDirectory | /usr/bin/awk '{print $2}')"
CONF="$REALHOME/.hymn-deploy/stream-notify.conf"
echo "conf 存在=$([[ -f $CONF ]] && echo yes || echo no) 權限=$(stat -f %Lp "$CONF" 2>/dev/null) keys=$(awk -F= '{printf "%s ", $1}' "$CONF" 2>/dev/null)(只印 key 名)"
echo "openclaw 二進位:/opt/homebrew/bin/openclaw $([[ -x /opt/homebrew/bin/openclaw ]] && echo 可執行 || echo 唔可執行)"
echo "--- launchd 等效環境:cd / && env -i HOME=… PATH=/usr/bin:/bin:/usr/sbin:/sbin(冇 USER、冇 TMPDIR、冇 STREAM_WATCH_TEST),真 conf,PHONE_DRY_RUN=1"
s=$(date +%s)
( cd / && env -i HOME="$REALHOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin WATCH_PHONE_LOG="$S/notify.log" PHONE_DRY_RUN=1 \
    /bin/bash -c '. "$1/ops/stream/stream-watch-lib.sh"; wlib_notify_phone p3 "🔴 Odely 串流中斷 測試 dry-run，形態 ④，需要你：換 NordVPN server"; echo "wlib_notify_phone rc=$?"' _ "$REPO" ) 2>&1 | sed 's/^/  /'
echo "  耗時 $(( $(date +%s) - s ))s"
echo "--- stream-notify(scratch)log 內容(target 已由 lib 遮罩;下面再機械檢查):"
sed 's/^/  /' "$S/notify.log"
TGT="$(grep -E '^PHONE_TARGET=' "$CONF" | tail -1 | cut -d= -f2-)"
if [[ -n "$TGT" ]]; then
  echo "--- 機械檢查(唔印 target 值):log 內 target 原值出現次數=$(grep -cF -- "$TGT" "$S/notify.log")(預期 0);含 <target> 次數=$(grep -c '<target>' "$S/notify.log")"
else echo "--- (conf 內冇 PHONE_TARGET,跳過機械檢查)"; fi
echo "--- 對照:同環境但 PATH 冇 /opt/homebrew/bin 時,用絕對路徑 /opt/homebrew/bin/openclaw 仍搵到(node 靠 shebang:$(head -c 60 /opt/homebrew/bin/openclaw | head -1))"
