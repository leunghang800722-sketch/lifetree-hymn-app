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
#   5. 每個 platform 推完即刻攞返個 update group id,append 落
#      ~/.hymn-deploy/ota-groups.log —— ota-rollback.sh 靠呢個 log 推算
#      「上一個 live 嘅 group」(OTA-ROLLBACK-PLAN-20260823.md §2.B)。
#      ⚠️ 刻意**唔**改上面第 3 步嗰句 publish 指令去加 `--json`:嗰句係成個
#      project 用咗成個月、反覆驗證過嘅精確命令,而 `--json` 會將所有非 JSON
#      訊息掟去 stderr、改晒操作者見到嘅嘢。改為推完之後另外 call 一次純讀嘅
#      `eas branch:view --json` 攞最新 group。
#      (`eas channel:view --json` 唔夠用 —— 19.0.8 實測佢只吐返最新嗰**一個**
#       group,分唔到 ios/android 兩邊。)
#      攞唔到 group 唔算失敗:publish 本身已經成功,唔可以喺呢度炸,寫
#      `group=unknown` 頂住,人手補返就得。
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
GROUPS_LOG="$DEPLOY_DIR/ota-groups.log"

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

  # ── 5. 攞返啱啱推嗰個 update group id(見檔頭)──────────────────────────
  # 純讀,失敗唔可以拖冧已經成功嘅 publish,所以成段都 `|| true`。
  NEW_GROUP=""
  BV_JSON="$(eas branch:view production --json --non-interactive --limit 4 2>/dev/null || true)"
  if [[ -n "$BV_JSON" ]]; then
    NEW_GROUP="$(printf '%s' "$BV_JSON" | PLAT="$PLAT" node -e "
      let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
        let d; try { d = JSON.parse(s); } catch (e) { process.stdout.write(''); return; }
        let ups = (d && d.currentPage) || (d && d.updates) || d;
        if (ups && !Array.isArray(ups) && ups.updates) ups = ups.updates;
        if (!Array.isArray(ups)) { process.stdout.write(''); return; }
        // branch:view 由新到舊排,所以頭一個 match 就係啱啱推嗰個。
        const hit = ups.find((u) => (u.platforms || u.platform) === process.env.PLAT);
        process.stdout.write((hit && hit.group) || '');
      });
    " 2>/dev/null || true)"
  fi
  [[ -n "$NEW_GROUP" ]] || NEW_GROUP="unknown"
  echo "$NOW | publish | platform=$PLAT | sha=$HEAD_SHA | group=$NEW_GROUP | message=$MESSAGE" >> "$GROUPS_LOG"
  if [[ "$NEW_GROUP" == "unknown" ]]; then
    echo "   ⚠️ 攞唔到 $PLAT 個 group id(publish 本身成功)。回退前要人手補返 $GROUPS_LOG,"
    echo "      或者 rollback 嗰陣明文用 --${PLAT}-group 指定。"
  else
    echo "   group=$NEW_GROUP"
  fi
done

echo "✅ OTA 推送完成(android + ios),已記錄落 $DEPLOY_LOG 同 $GROUPS_LOG"
