#!/usr/bin/env bash
# ops/deploy/ota-rollback.sh "<message>" [--confirm]
#     [--ios-group <id>] [--android-group <id>]
#
# 唯一合法嘅 OTA 回退路徑(OTA-ROLLBACK-PLAN-20260823.md §2.A,Eric 2026-08-23 拍板)。
#
# 做咩:用 `eas update:republish` 將一個**已經出過街嘅舊 update group** 喺
# production branch 重新出一次。republish 係 server-side 複製 —— 攞舊 group 嘅
# bundle/assets 原封不動再出一個新 update,**唔會 re-export、唔讀 working tree、
# 唔使 checkout 舊 commit**,所以完全避開「多 session 共用 worktree」嗰個死結。
# runtimeVersion 跟返原 update(舊 group 出得街,即係同 live binaries 夾)。
#
# 兩步式(刻意):
#   1. 冇 `--confirm` -> 只做預覽:內部 call `eas update:view <group> --json`,
#      印出目標 group 嘅 message / createdAt / gitCommitHash / platform /
#      runtimeVersion,俾操作者眼見核實「回去邊個版本」。一定唔會推。
#   2. 有 `--confirm` -> 兩個 platform 各 republish 一次,parse 新 group id,
#      append `deploy.log` + `ota-groups.log`。
#
# ⚠️ 兩個同 ota-publish.sh 刻意唔同嘅設計(OTA-ROLLBACK-PLAN §2.A):
#   * **唔驗 working tree 乾淨** —— republish 根本唔讀 tree;事故當刻其他 session
#     幾乎一定有 dirty file,唔可以俾呢個 check 卡死回退。
#   * **唔行 approve.sh** —— approve.sh 焗住「sha == 當前 HEAD」,而回退場景個
#     HEAD 正正就係壞版本,永遠滿足唔到。回退目標本身就係「經過 approve、出過
#     街、live 過」嘅 bundle,唔存在未經批准 code 出街嘅風險。授權來源 =
#     Eric/Dispatch 口頭 go + 呢個 script 自己嘅兩步式 `--confirm`。
#
# 事故當刻 runbook 見 OTA-ROLLBACK-PLAN-20260823.md §4。
# 推完要同 Eric 講:**完全熄咗個 App 再開,做兩次**(expo-updates 係「開 app
# 時 check → 下載 → 下一次冷啟先生效」)。
set -euo pipefail

MESSAGE=""
CONFIRM=0
IOS_GROUP=""
ANDROID_GROUP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm)        CONFIRM=1; shift ;;
    --ios-group)      IOS_GROUP="${2:-}"; shift 2 ;;
    --android-group)  ANDROID_GROUP="${2:-}"; shift 2 ;;
    --*)              echo "❌ 唔識嘅 flag:$1" >&2; exit 1 ;;
    *)                if [[ -z "$MESSAGE" ]]; then MESSAGE="$1"; else
                        echo "❌ 多咗一個位置參數:$1(message 要用引號包住成句)" >&2; exit 1
                      fi; shift ;;
  esac
done

if [[ -z "$MESSAGE" ]]; then
  cat >&2 <<'USAGE'
用法: ops/deploy/ota-rollback.sh "<message>" [--confirm]
          [--ios-group <id>] [--android-group <id>]

  冇 --confirm = 只印目標 group 預覽,唔會推。
  --ios-group / --android-group 唔寫就由 ~/.hymn-deploy/ota-groups.log 推算
  「上一個 live 嘅 group」。
USAGE
  exit 1
fi

# ── EXPO_TOKEN 自助 ────────────────────────────────────────────────────────
# `EXPO_TOKEN` 淨係 export 喺 ~/.zshrc,即係**只有 login shell 先有**。Claude
# Code 個 Bash tool 唔 source zshrc,所以 `bash ops/deploy/ota-rollback.sh …`
# 直接跑就會冇 token,eas 全部 call 都靜靜哋失敗,個 script 只會報「攞唔到
# 詳情」—— 事故當刻用幾分鐘去查呢個係最唔抵嘅。呢度自己撈返,唔靠呼叫者
# 記得包 `zsh -ilc`。
if [[ -z "${EXPO_TOKEN:-}" ]]; then
  EXPO_TOKEN="$(zsh -ilc 'printf %s "${EXPO_TOKEN:-}"' 2>/dev/null || true)"
  export EXPO_TOKEN
fi
if [[ -z "${EXPO_TOKEN:-}" ]]; then
  echo "⚠️ 搵唔到 EXPO_TOKEN(應該喺 ~/.zshrc)。eas 可能會 auth 失敗。" >&2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEPLOY_DIR="${HYMN_DEPLOY_DIR:-$HOME/.hymn-deploy}"
DEPLOY_LOG="$DEPLOY_DIR/deploy.log"
GROUPS_LOG="$DEPLOY_DIR/ota-groups.log"

# ── 目標 group:冇明文指定就由 ota-groups.log 推算 ───────────────────────────
# 規則:同一個 platform 嘅 log 行按時序排,最後一行 = 而家 live 嗰個,
# 尾二嗰行 = 回退目標。
# ⚠️ 如果最後一行本身已經係 rollback,就**唔准**自動揀 —— 尾二嗰行係啱啱先
# 被回退走嗰個壞版本,自動揀落去會「回退返去壞版本」。呢種情況焗操作者明文
# 指定 --ios-group/--android-group,逼佢諗清楚要去邊個版本。
prev_group_for() {
  local plat="$1"
  [[ -f "$GROUPS_LOG" ]] || return 0
  local lines
  lines="$(grep "| platform=${plat} |" "$GROUPS_LOG" || true)"
  [[ -n "$lines" ]] || return 0
  local n last_action
  n="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  [[ "$n" -ge 2 ]] || return 0
  last_action="$(printf '%s\n' "$lines" | tail -1 | awk -F'|' '{gsub(/ /,"",$2); print $2}')"
  if [[ "$last_action" == "rollback" ]]; then
    return 0
  fi
  printf '%s\n' "$lines" | tail -2 | head -1 | sed -n 's/.*| group=\([0-9a-f-]*\).*/\1/p'
}

[[ -n "$IOS_GROUP"     ]] || IOS_GROUP="$(prev_group_for ios)"
[[ -n "$ANDROID_GROUP" ]] || ANDROID_GROUP="$(prev_group_for android)"

if [[ -z "$IOS_GROUP" || -z "$ANDROID_GROUP" ]]; then
  echo "❌ abort:推算唔到回退目標 group(ios='${IOS_GROUP}' android='${ANDROID_GROUP}')。" >&2
  echo "" >&2
  echo "可能原因:$GROUPS_LOG 未夠兩行、或者最近一次操作本身就係 rollback" >&2
  echo "(嗰種情況刻意唔自動揀,免得回退返去啱啱先被回退走嗰個壞版本)。" >&2
  echo "" >&2
  echo "請明文指定,例如 8/19 已知穩定版:" >&2
  echo "  --ios-group 6faf4e94-1939-4a1c-ac5e-80666fc0fda0 \\" >&2
  echo "  --android-group 523275e7-d712-4694-9d70-46d0a4758447" >&2
  exit 1
fi

cd "$REPO_ROOT/frontend/hymn-app"

# ── 1. 預覽(兩種模式都行,--confirm 都要印一次先推)─────────────────────────
# `eas update:view <group> --json` 冇 --non-interactive 呢個 flag(19.0.8 實測),
# --json 本身已經 implies non-interactive。
preview_group() {
  local plat="$1" gid="$2" raw
  echo "── $plat 目標 group:$gid ──"
  if ! raw="$(eas update:view "$gid" --json 2>/dev/null)"; then
    echo "  ⚠️ 攞唔到詳情(group id 錯?網絡?)—— 唔好盲推,先查清楚。"
    return 1
  fi
  printf '%s' "$raw" | node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      let a; try { a = JSON.parse(s); } catch (e) { console.log('  ⚠️ JSON parse 失敗'); process.exit(1); }
      if (!Array.isArray(a)) a = [a];
      if (!a.length) { console.log('  ⚠️ 冇任何 update'); process.exit(1); }
      for (const u of a) {
        console.log('  platform       : ' + u.platform);
        console.log('  message        : ' + u.message);
        console.log('  createdAt      : ' + u.createdAt);
        console.log('  runtimeVersion : ' + u.runtimeVersion);
        console.log('  gitCommitHash  : ' + u.gitCommitHash);
      }
    });
  " || return 1
}

echo "════ OTA ROLLBACK 預覽 ════"
echo "message: $MESSAGE"
echo
PREVIEW_OK=1
preview_group ios "$IOS_GROUP"         || PREVIEW_OK=0
echo
preview_group android "$ANDROID_GROUP" || PREVIEW_OK=0
echo

if [[ "$PREVIEW_OK" -ne 1 ]]; then
  echo "❌ abort:上面至少一個 group 攞唔到詳情,唔會推。" >&2
  exit 1
fi

if [[ "$CONFIRM" -ne 1 ]]; then
  echo "(預覽模式 —— 乜都冇推。核實咗上面兩個版本無誤,再加 --confirm 真推。)"
  exit 0
fi

# ── 2. 真推 ────────────────────────────────────────────────────────────────
mkdir -p "$DEPLOY_DIR"

for PAIR in "ios:$IOS_GROUP" "android:$ANDROID_GROUP"; do
  PLAT="${PAIR%%:*}"
  GID="${PAIR#*:}"
  echo "── republish $PLAT ← $GID ──"
  # --json implies --non-interactive;照樣明文寫 --non-interactive,同
  # ota-publish.sh 嘅風格一致、亦令意圖睇得出。
  # update:republish 冇 --environment(19.0.8 help 實測),唔會撞
  # `eas update` 嗰條「non-interactive 一定要帶 --environment」規則。
  OUT="$(eas update:republish --group "$GID" --platform "$PLAT" \
          --non-interactive --json --message "$MESSAGE")"
  NEW_GROUP="$(printf '%s' "$OUT" | node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      let a; try { a = JSON.parse(s); } catch (e) { process.stdout.write(''); return; }
      if (!Array.isArray(a)) a = [a];
      process.stdout.write((a[0] && a[0].group) || '');
    });
  " || true)"
  [[ -n "$NEW_GROUP" ]] || NEW_GROUP="unknown"
  NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "$NOW | ota-rollback | platform=$PLAT | target_group=$GID | new_group=$NEW_GROUP | message=$MESSAGE" >> "$DEPLOY_LOG"
  echo "$NOW | rollback | platform=$PLAT | sha=(republish of $GID) | group=$NEW_GROUP | message=$MESSAGE" >> "$GROUPS_LOG"
  echo "   ✅ 新 group = $NEW_GROUP"
done

echo
echo "✅ Rollback 推完(ios + android),已記錄落 $DEPLOY_LOG 同 $GROUPS_LOG"
echo
echo "下一步:"
echo "  1. 驗證 live 已切換: cd frontend/hymn-app && eas branch:view production --json --limit 4"
echo "  2. 通知 Eric:**完全熄咗個 App 再開,做兩次**(第一次開先落載,第二次冷啟先生效)"
