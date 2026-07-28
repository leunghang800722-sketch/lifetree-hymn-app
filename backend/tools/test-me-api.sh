#!/usr/bin/env bash
# tools/test-me-api.sh — W1 驗收腳本(MEMBERSHIP-PHASE1-LOGIN-SYNC.md §1.6)
#
# 七步全綠先算交貨。留低喺 repo 俾下次 regression 用。
#
# 用法: backend/tools/test-me-api.sh
#   要求: backend 已經行喺 localhost:3001,需要 jq。
#   步驟 6 會用 launchctl kickstart 重啟 backend,證明數據 persist。

set -uo pipefail

BASE="http://localhost:3001"
FAIL=0
TS=$(date +%s)
EMAIL="me-api-test-${TS}@test.local"
PASSWORD="testpass123"

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

req() {
  # req METHOD PATH [TOKEN] [BODY] → 輸出 body 落 $RESP_BODY,status 落 $RESP_CODE
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local args=(-s -o /tmp/me-api-resp.json -w '%{http_code}' -X "$method" "${BASE}${path}" -H 'Content-Type: application/json')
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer ${token}"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  RESP_CODE=$(curl "${args[@]}")
  RESP_BODY=$(cat /tmp/me-api-resp.json)
}

echo "── 1. register test 用戶 ──────────────────────────────"
req POST /api/auth/register "" "{\"username\":\"metest\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
TOKEN=$(echo "$RESP_BODY" | jq -r '.token // empty')
if [ "$RESP_CODE" = "200" ] && [ -n "$TOKEN" ]; then
  pass "register → token 攞到"
else
  fail "register 失敗 (code=$RESP_CODE body=$RESP_BODY)"
  echo "冇 token,後續步驟中止。"; exit 1
fi

echo "── 2. POST sync 推 fixture(3 favorites + 2 清單)→ GET data 核對 ──"
OLD_TS="2020-01-01T00:00:00.000Z"
SYNC_BODY=$(cat <<EOF
{
  "favorites": [1001, 1002, 1003],
  "playlists": [
    {"id":"pl_test1","name":"Test A","position":0,"songs":[{"id":1001,"title":"Song 1"}],"updated_at":"${OLD_TS}"},
    {"id":"pl_test2","name":"Test B","position":1,"songs":[],"updated_at":"${OLD_TS}"}
  ]
}
EOF
)
req POST /api/me/sync "$TOKEN" "$SYNC_BODY"
if [ "$RESP_CODE" = "200" ]; then
  FAV_COUNT=$(echo "$RESP_BODY" | jq '.favorites | length')
  PL_COUNT=$(echo "$RESP_BODY" | jq '.playlists | length')
  if [ "$FAV_COUNT" = "3" ] && [ "$PL_COUNT" = "2" ]; then
    pass "sync response 已含 3 favorites + 2 playlists"
  else
    fail "sync response 數量唔啱 (favorites=$FAV_COUNT playlists=$PL_COUNT)"
  fi
else
  fail "sync 失敗 (code=$RESP_CODE body=$RESP_BODY)"
fi

req GET /api/me/data "$TOKEN"
if [ "$RESP_CODE" = "200" ]; then
  FAV_COUNT=$(echo "$RESP_BODY" | jq '.favorites | length')
  PL_COUNT=$(echo "$RESP_BODY" | jq '.playlists | length')
  if [ "$FAV_COUNT" = "3" ] && [ "$PL_COUNT" = "2" ]; then
    pass "GET data 核對:3 favorites + 2 playlists"
  else
    fail "GET data 數量唔啱 (favorites=$FAV_COUNT playlists=$PL_COUNT)"
  fi
else
  fail "GET data 失敗 (code=$RESP_CODE body=$RESP_BODY)"
fi

echo "── 3. PUT 清單 A 用舊 updated_at → 預期 stale:true,內容冇變 ─────"
STALE_TS="2019-01-01T00:00:00.000Z"
req PUT /api/me/playlists/pl_test1 "$TOKEN" "{\"name\":\"Should Not Apply\",\"position\":0,\"songs\":[],\"updated_at\":\"${STALE_TS}\"}"
IS_STALE=$(echo "$RESP_BODY" | jq -r '.stale // false')
if [ "$RESP_CODE" = "200" ] && [ "$IS_STALE" = "true" ]; then
  pass "舊 updated_at → stale:true"
else
  fail "預期 stale:true (code=$RESP_CODE body=$RESP_BODY)"
fi

req GET /api/me/data "$TOKEN"
NAME_A=$(echo "$RESP_BODY" | jq -r '.playlists[] | select(.id=="pl_test1") | .name')
if [ "$NAME_A" = "Test A" ]; then
  pass "清單 A 內容冇變 (name=Test A)"
else
  fail "清單 A 被舊數據覆蓋咗 (name=$NAME_A)"
fi

echo "── 4. PUT 清單 A 用新 updated_at → 內容變咗 ─────────────────"
NEW_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
req PUT /api/me/playlists/pl_test1 "$TOKEN" "{\"name\":\"Test A Renamed\",\"position\":0,\"songs\":[{\"id\":1001,\"title\":\"Song 1\"}],\"updated_at\":\"${NEW_TS}\"}"
IS_STALE=$(echo "$RESP_BODY" | jq -r '.stale // false')
if [ "$RESP_CODE" = "200" ] && [ "$IS_STALE" != "true" ]; then
  pass "新 updated_at → 寫入成功 (非 stale)"
else
  fail "新 updated_at 寫入失敗 (code=$RESP_CODE body=$RESP_BODY)"
fi

req GET /api/me/data "$TOKEN"
NAME_A=$(echo "$RESP_BODY" | jq -r '.playlists[] | select(.id=="pl_test1") | .name')
if [ "$NAME_A" = "Test A Renamed" ]; then
  pass "清單 A 內容已變 (name=Test A Renamed)"
else
  fail "清單 A 內容冇變 (name=$NAME_A)"
fi

echo "── 5. DELETE favorite + DELETE 清單 → GET data 反映咗 ─────────"
req DELETE /api/me/favorites/1001 "$TOKEN"
[ "$RESP_CODE" = "200" ] && pass "DELETE favorite 1001 → 200" || fail "DELETE favorite 失敗 (code=$RESP_CODE)"

req DELETE /api/me/playlists/pl_test2 "$TOKEN"
[ "$RESP_CODE" = "200" ] && pass "DELETE 清單 pl_test2 → 200" || fail "DELETE 清單失敗 (code=$RESP_CODE)"

req GET /api/me/data "$TOKEN"
BEFORE_RESTART_BODY="$RESP_BODY"
HAS_1001=$(echo "$RESP_BODY" | jq '[.favorites[] | select(. == 1001)] | length')
HAS_PL2=$(echo "$RESP_BODY" | jq '[.playlists[] | select(.id=="pl_test2")] | length')
FAV_COUNT=$(echo "$RESP_BODY" | jq '.favorites | length')
PL_COUNT=$(echo "$RESP_BODY" | jq '.playlists | length')
if [ "$HAS_1001" = "0" ] && [ "$HAS_PL2" = "0" ] && [ "$FAV_COUNT" = "2" ] && [ "$PL_COUNT" = "1" ]; then
  pass "GET data 反映刪除 (favorites=2, playlists=1, 冇 1001/pl_test2)"
else
  fail "GET data 未反映刪除 (favorites=$FAV_COUNT playlists=$PL_COUNT has1001=$HAS_1001 hasPl2=$HAS_PL2)"
fi

echo "── 6. launchctl kickstart 重啟 backend → GET data 一模一樣 ────"
launchctl kickstart -k "gui/$(id -u)/com.hymnapp.backend" >/dev/null 2>&1
echo "  ⏳ 等 backend 重新起身..."
UP=0
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health")
  if [ "$CODE" = "200" ]; then UP=1; break; fi
  sleep 1
done
if [ "$UP" = "1" ]; then
  pass "backend 重啟後 /api/health 返 200"
else
  fail "backend 重啟後 30 秒仲未起身"
fi

req GET /api/me/data "$TOKEN"
if [ "$RESP_CODE" = "200" ] && [ "$(echo "$RESP_BODY" | jq -S .)" = "$(echo "$BEFORE_RESTART_BODY" | jq -S .)" ]; then
  pass "重啟後 GET data 同重啟前一模一樣(persist 證明)"
else
  fail "重啟後數據唔一致 (before=$BEFORE_RESTART_BODY after=$RESP_BODY)"
fi

echo "── 7. 冇 token / 爛 token → 401 ──────────────────────────"
req GET /api/me/data ""
[ "$RESP_CODE" = "401" ] && pass "冇 token → 401" || fail "冇 token 應該 401,實際 code=$RESP_CODE"

req GET /api/me/data "this.is.not.a.valid.jwt"
[ "$RESP_CODE" = "401" ] && pass "爛 token → 401" || fail "爛 token 應該 401,實際 code=$RESP_CODE"

echo ""
if [ "$FAIL" = "0" ]; then
  echo "🎉 七步全綠"
  exit 0
else
  echo "💥 有步驟失敗,睇返上面 ❌"
  exit 1
fi
