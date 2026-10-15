#!/usr/bin/env bash
# ops/ytdlp/canary-note.sh [health-state.json] — update-ytdlp.sh 寫 canary-FAIL 警報時嘅第二行告示(STREAM-PHONE-NOTIFY-EXEC-20261015 R7)。
# 10-14 事故:11:27 canary FAIL 時全庫已經播唔到,但告示寫「唔代表而家播歌有事」,誤導人。
# 規則:stream-health-state.json 嘅 consecutiveFail >= 2 ⇒ 「⚠️ 而家串流健康檢查正在失敗」;否則維持原句。讀唔到 state = 當冇 fail(原句)。
# 純只讀,印一行(含開頭兩個空格)落 stdout。
STATE="${1:-${HEALTH_STATE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/backend/data/stream-health-state.json}}"
cf="$(python3 -c "
import json,sys
try: print(int(json.load(open(sys.argv[1])).get('consecutiveFail',0)))
except Exception: print(0)" "$STATE" 2>/dev/null)"
[[ "$cf" =~ ^[0-9]+$ ]] || cf=0
if (( cf >= 2 )); then
  echo "  ⚠️ 而家串流健康檢查正在失敗(連續 $cf 次 unhealthy)——canary 唔過好可能同一個原因(YouTube 側 / 出口 IP 被 bot-check),串流可能已經播唔到;先睇上面嘅串流健康警報同 \`~/.hymn-deploy/STREAM-ALERT.md\`。log:\`backend/data/ytdlp-update.log\`"
else
  echo "  唔使急住做嘢:呢個唔代表而家播歌有事(串流健康檢查另外每 30 分鐘驗緊)。如果連續幾日都 canary-FAIL,就要人手睇下係 YouTube 側擋緊(429/bot-check)定係 nightly 真係壞咗。log:\`backend/data/ytdlp-update.log\`"
fi
