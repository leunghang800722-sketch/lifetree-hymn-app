#!/usr/bin/env bash
# T14:STREAM-PHONE-NOTIFY-EXEC-20261015 —— P1 狀態機+手機 stub、P2 失敗/hang、P4 文字過濾、P5 R1 形態④、P6 R3 出口 IP、P7a R5(a) 少探、P8 R7 告示。
# 全部 testlib 測試模式 + stub(WATCH_PHONE_CMD=stub-phone.sh;conf 內係假 target TESTTARGET-12345,唔係 Eric 嘅),唔發真 Telegram。用法:t14-phone-notify.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t14"; T="$(cd "$(dirname "$0")" && pwd)"; W="$T/../stream-watch.sh"; REPO="$(cd "$T/../../.." && pwd -P)"
HC="$REPO/ops/lyrics/stream-healthcheck.sh"; SH="$T/../stream-selfheal.sh"; RULES="$T/../stream-diagnose-rules.sh"
rm -rf "${S:?}"; mkdir -p "$S"
T0=1790000000
mkconf() { printf 'PHONE_CHANNEL=telegram\nPHONE_ACCOUNT=testacct\nPHONE_TARGET=TESTTARGET-12345\nPHONE_RENOTIFY_SEC=21600\n' > "$1/stream-notify.conf"; chmod 600 "$1/stream-notify.conf"; }
setup() { # $1=name
  export STUB_DIR="$S/$1/stub" WATCH_DIR="$S/$1/wd" WATCH_LOG_MD="$S/$1/LOG.md" WATCH_STATUS_CMD="$T/stub-status.sh" WATCH_NOTIFY_CMD="$T/stub-notify.sh" \
    WATCH_DIAGNOSE_CMD="$T/stub-diagnose.sh" WATCH_PHONE_CMD="$T/stub-phone.sh" HEALTH_STATE="$S/$1/wd/stream-health-state.json"
  rm -rf "${S:?}/${1:?}"; mkdir -p "$S/$1/stub" "$S/$1/wd"; : > "$S/$1/LOG.md"; mkconf "$S/$1/wd"; TICK=0; RCS=""
}
tick() { echo "$1" > "$STUB_DIR/mode"; WATCH_NOW=$((T0 + TICK*1800)) "$W" >> "$S/watch.out" 2>&1; RCS="$RCS$?"; TICK=$((TICK+1)); }
cnt() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }
phones() { [[ -f "$STUB_DIR/phone.log" ]] && cnt "$STUB_DIR/phone.log" || echo 0; }
macs() { [[ -f "$STUB_DIR/notify.log" ]] && cnt "$STUB_DIR/notify.log" || echo 0; }
allrc0() { [[ "$RCS" =~ ^0*$ ]] && echo "watch rc 全部=0(${#RCS} 次)" || echo "⚠️ watch rc 有非 0:$RCS"; }

echo "################ P1 狀態機 + 手機 stub(verdict=escalate)################"
setup p1; echo escalate > "$STUB_DIR/verdict"
for i in 1 2 3; do tick ok; done; echo "ok×3 後:phone=$(phones) mac=$(macs)"
tick bad; echo "bad#1:phone=$(phones) mac=$(macs)"
tick bad; echo "bad#2(診斷→escalate→首次升級):phone=$(phones) mac=$(macs)"
echo "  訊息1:$(sed -n 1p "$STUB_DIR/phone.msgs")"
for i in $(seq 1 11); do tick bad; done; echo "再 11 tick(5.5 小時,距升級 <6h):phone=$(phones) mac=$(macs)"
tick bad; echo "再 1 tick(滿 6 小時):phone=$(phones) mac=$(macs)"
echo "  訊息2:$(sed -n 2p "$STUB_DIR/phone.msgs")"
tick ok; echo "恢復 tick:phone=$(phones) mac=$(macs)"
echo "  訊息3:$(sed -n 3p "$STUB_DIR/phone.msgs")"
echo "  stream-notify.log:"; sed 's/^/    /' "$WATCH_DIR/stream-notify.log" 2>/dev/null || echo "    (冇)"
allrc0

echo; echo "---- P1b 診斷後下一 tick 即 ok(fixed-pending-verify):手機應 0 條"
setup p1b; echo fixed-pending-verify > "$STUB_DIR/verdict"
tick bad; tick bad; tick ok; echo "phone=$(phones) mac=$(macs)(預期 0/0)"; allrc0

echo; echo "---- P1c conf 缺(opt-in 未開):升級照出 Mac 通知+警報檔,手機 0 條,watch rc=0"
setup p1c; rm -f "$WATCH_DIR/stream-notify.conf"; echo escalate > "$STUB_DIR/verdict"
tick bad; tick bad; echo "phone=$(phones) mac=$(macs) alert=$([[ -f "$WATCH_DIR/STREAM-ALERT.md" ]] && echo yes || echo no) notify.log=$([[ -f "$WATCH_DIR/stream-notify.log" ]] && echo 有 || echo 無)"; allrc0
echo "---- P1d conf 缺欄(冇 PHONE_TARGET)"
setup p1d; sed -i '' '/PHONE_TARGET/d' "$WATCH_DIR/stream-notify.conf"; echo escalate > "$STUB_DIR/verdict"
tick bad; tick bad; echo "phone=$(phones) mac=$(macs)"; allrc0

echo; echo "---- P1e status 帶形態④(selfheal 已判④):訊息應指明換 VPN server"
setup p1e; echo escalate > "$STUB_DIR/verdict"
tick bad4; tick bad4; echo "phone=$(phones)"; echo "  訊息:$(cat "$STUB_DIR/phone.last")"
for i in $(seq 1 12); do tick bad4; done; echo "  6 小時後重發:phone=$(phones) 訊息:$(tail -1 "$STUB_DIR/phone.msgs")"; allrc0

echo; echo "################ P2 手機渠道失敗 / hang(watch 唔受影響)################"
setup p2a; echo escalate > "$STUB_DIR/verdict"; echo fail > "$STUB_DIR/phone-mode"
tick bad; tick bad
echo "[exit 1] phone 嘗試=$(phones) mac=$(macs) alert=$([[ -f "$WATCH_DIR/STREAM-ALERT.md" ]] && echo yes || echo no) SUPERVISION 🔴 行=$(grep -c '🔴' "$WATCH_LOG_MD")"; allrc0
echo "  notify.log:"; sed 's/^/    /' "$WATCH_DIR/stream-notify.log"
echo "  notify.log 有冇漏 target 原值/token:$(grep -c 'TESTTARGET-12345\|abcd1234secretvalue' "$WATCH_DIR/stream-notify.log")(預期 0)"
setup p2b; echo escalate > "$STUB_DIR/verdict"; echo hang > "$STUB_DIR/phone-mode"
tick bad; s=$(date +%s); tick bad; e=$(( $(date +%s) - s ))
echo "[hang 61s,cap 預設 30] 升級 tick 耗時=${e}s;phone 嘗試=$(phones) mac=$(macs) alert=$([[ -f "$WATCH_DIR/STREAM-ALERT.md" ]] && echo yes || echo no)"; allrc0
echo "  notify.log:"; sed 's/^/    /' "$WATCH_DIR/stream-notify.log"
sleep 1; echo "  殘留 stub 'sleep 61' process:$(pgrep -f 'sleep 61' | wc -l | tr -d ' ')(預期 0:process group 已殺)"

echo; echo "################ P4 文字過濾(JWT / \$() / 反引號 / U+202E / Authorization / 長度)################"
setup p4
LONG="$(printf 'x%.0s' $(seq 1 900))"
JWT='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
RLO="$(printf '\xe2\x80\xae')"
MSG="🔴 reason $JWT \$(touch $S/PWNED1) \`touch $S/PWNED2\` ${RLO}live Authorization: Bearer abc123def456ghi  line2
$LONG"
( . "$REPO/ops/stream/stream-watch-lib.sh"; wlib_notify_phone p4 "$MSG"; echo "wlib_notify_phone rc=$?" )
python3 - "$STUB_DIR/phone.last" <<'PY'
import sys
t = open(sys.argv[1], encoding='utf-8').read()
print("  收到 -m 長度(字元)=%d(<=400)" % len(t))
print("  含 [REDACTED-JWT]=%s  含原 JWT 片段=%s" % ('[REDACTED-JWT]' in t, 'SflKxwRJSM' in t))
print("  含 U+202E=%s  含換行(第三輪起保留,預期 True)=%s  含 abc123def456ghi=%s" % ('‮' in t, '\n' in t, 'abc123def456ghi' in t))
print("  $() 與反引號字面保留(冇被 shell 展開)=%s" % ('$(touch' in t))
print("  開頭 60 字:" + t[:60].replace('\n', ' '))
PY
echo "  PWNED 檔(預期都冇):$(ls "$S" | grep -c PWNED)"
echo "  watch 路徑:escalate reason 帶 JWT/RLO"
setup p4w; printf '#!/usr/bin/env bash\necho engine=stub; echo "VERDICT: escalate"; echo "REASON: bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c \\$(id) \xe2\x80\xaeevil"; echo "ACTIONS: none"\n' > "$S/p4w/diag.sh"; chmod +x "$S/p4w/diag.sh"
WATCH_DIAGNOSE_CMD="$S/p4w/diag.sh" tick bad; WATCH_DIAGNOSE_CMD="$S/p4w/diag.sh" tick bad
echo "  phone=$(phones);訊息:$(cat "$STUB_DIR/phone.last")"; echo "  含 U+202E:$(grep -c "$RLO" "$STUB_DIR/phone.last")(預期 0) 含 JWT 片段:$(grep -c 'SflKxwRJSM' "$STUB_DIR/phone.last")(預期 0)"

echo; echo "################ P5 R1 形態④(selfheal + 規則診斷)################"
NOW=$(date +%s)
iso() { python3 -c "import datetime,sys;print(datetime.datetime.fromtimestamp($NOW+int(sys.argv[1]),datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'))" "$1"; }
mklog() { # $1=檔 $2=錨相對現在秒(負=過去) $3=bot-check 事件數(每事件 2 行)
  { echo "[stream] $(iso "$2") id=42 status=206"
    for ((i=1; i<=$3; i++)); do
      echo "ERROR: [youtube] vid$i: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication."
      echo "⚠️ YouTube rate-limit/bot-check 偵測到 id=vid$i strategy=default —— 全局冷卻 30s,停晒呢次剩低嘅 strategy"
    done
    echo "[resolve] ok strategy=default id=zzz ms=3000"; } > "$1"; }
mkdir -p "$S/p5"; mklog "$S/p5/bot-recent.log" -120 3; mklog "$S/p5/bot-stale.log" -10800 3; mklog "$S/p5/bot-none.log" -120 0
echo "== 計數器直測"
for f in bot-recent bot-stale bot-none; do echo "  $f.log(30 分鐘窗)→ $(python3 -I "$T/../stream-botcheck-count.py" "$S/p5/$f.log" 30)"; done
echo "  真 /tmp/hymn_backend.log(唯讀,30 分鐘窗)→ $(python3 -I "$T/../stream-botcheck-count.py" /tmp/hymn_backend.log 30)"
sh_case() { # $1=name $2=logfile $3=healthy_a $4=healthy_b $5=midfail [$6=detail(預設 B:x:resolve-fail) $7=health.json]
  local d="$S/p5/$1"; rm -rf "${d:?}"; mkdir -p "$d/wd" "$d/stub"; ln -s "ytdlp-venv-a/bin/yt-dlp" "$d/yt-dlp"
  local hj='{"consecutiveFail":3}'; [[ -n "${7:-}" ]] && hj="$7"; echo "$hj" > "$d/health.json"
  ( export STUB_DIR="$d/stub" WATCH_DIR="$d/wd" SELFHEAL_STATE="$d/sh.json" HEALTH_STATE="$d/health.json" YTDLP_LINK="$d/yt-dlp" SELFHEAL_BACKEND_LOG="$2" \
      SELFHEAL_APPLY_CMD="$T/stub-cmd.sh apply" SELFHEAL_RESTART_CMD="$T/stub-cmd.sh restart" SELFHEAL_RECHECK_SLEEP=0
    "$SH" --healthy-a "$3" --healthy-b "$4" --mid 0 --midfail "$5" --ok 0 --fail 3 --detail "${6:-B:x:resolve-fail}" >/dev/null 2>&1; echo "  selfheal rc=$?" )
  python3 - "$d/sh.json" "$d/stub/cmd.calls" "$d/wd/SUPERVISION-LOG.md" <<'PY'
import json, sys, os
d = json.load(open(sys.argv[1])); a = d['alert']
calls = open(sys.argv[2]).read().strip().splitlines() if os.path.exists(sys.argv[2]) else []
sup = open(sys.argv[3]).read() if os.path.exists(sys.argv[3]) else ''
print("  lastAction=%s alert.form=%s swapsToday=%s restartsToday=%s" % (d['lastAction'], a['form'], d['swapsToday'], d['restartsToday']))
print("  apply/restart 被 call 次數=%d %s" % (len(calls), [c.split(' ', 2)[1:] for c in calls]))
print("  alert.message 含「VPN」=%s 含「換 yt-dlp 無用」=%s" % ('VPN' in a['message'], '換 yt-dlp 無用' in a['message']))
print("  SUPERVISION 行含④=%s" % ('形態④' in sup))
import re
m = re.search(r'backend log 近 30 分鐘 (\d+) 條 \+ 健康檢查 Layer B (\d+) 條', a['message'])
print("  ④訊息分開寫(第三輪 #7)=%s" % (('backend log %s 條 + Layer B %s 條' % m.groups()) if m else '(非④或冇此句)'))
PY
}
echo "== 案1(正控)近期 bot-check ×6 行,A/B 都死,midfail=3"; sh_case c1 "$S/p5/bot-recent.log" 0 0 3
echo "== 案2(負控)冇 bot-check 行:同樣輸入 → 形態①(apply 被 call、swapsToday=1)"; sh_case c2 "$S/p5/bot-none.log" 0 0 3
echo "== 案3(負控)bot-check 行有但錨係 3 小時前(舊事故殘留)→ 形態①"; sh_case c3 "$S/p5/bot-stale.log" 0 0 3
echo "== 案4(負控)有近期 bot-check 行但 Layer B 健康(healthy_b=1)、A 死 → 形態②(restart 被 call)"; sh_case c4 "$S/p5/bot-recent.log" 0 1 0
echo "== 案5(第二輪#8 正控)backend log 冇 bot-check 行,但 healthcheck state.botcheckB=3(Layer B 自己 stderr)→ ④"; sh_case c5 "$S/p5/bot-none.log" 0 0 3 "B:x:resolve-fail B:y:resolve-fail B:z:resolve-fail" '{"consecutiveFail":3,"botcheckB":3}'
echo "== 案6(第二輪#8 負控)backend log 近期 bot-check×6 但 Layer B 失敗以 403 為主(resolve-fail 1 < 403 ×2)→ 形態①(真 yt-dlp 過舊 + 背景噪音唔誤判)"; sh_case c6 "$S/p5/bot-recent.log" 0 0 3 "B:x:resolve-fail B:y:403 B:z:403"
echo "== 規則診斷"
mkfacts() { # $1=BOTCHECK_RECENT $2=out [$3=HEALTHY_B(預設0) $4=B_RESOLVE_FAIL(預設3) $5=B_403(預設0) $6=BOTCHECK_B(預設0)]
  printf 'BACKEND_PID=123\nHEALTH_HTTP=200\nRATE403=0.0\nRESOLVE_TOTAL=5\nRESOLVE_FAIL=5\nYTDLP_ACTIVE=2026.09.27\nYTDLP_IDLE=2026.10.10\nBOTCHECK_RECENT=%s\nHEALTHY_B=%s\nB_RESOLVE_FAIL=%s\nB_403=%s\nBOTCHECK_B=%s\n' "$1" "${3-0}" "${4-3}" "${5-0}" "${6-0}" > "$2"; }
rules_case() { # $1=標籤 $2=facts
  export STUB_DIR="$S/p5"; rm -f "$S/p5/cmd.calls"
  echo "-- $1"; REMEDY_CMD="$T/stub-cmd.sh" STREAM_WATCH_TEST=1 "$RULES" "$2" 2>/dev/null | sed 's/^/   /'
  echo "   remedy stub 被 call 次數=$([[ -f $S/p5/cmd.calls ]] && cnt $S/p5/cmd.calls || echo 0)"
}
mkfacts 5 "$S/p5/f5.env";            rules_case "BOTCHECK_RECENT=5 HEALTHY_B=0 resolve-fail=3 403=0(正控 → ④ escalate,零 swap)" "$S/p5/f5.env"
mkfacts 0 "$S/p5/f0.env";            rules_case "BOTCHECK_RECENT=0(resolve 5/5 fail、候選較新 → swap)" "$S/p5/f0.env"
mkfacts 5 "$S/p5/fh1.env" 1;         rules_case "第二輪#7 負控:BOTCHECK_RECENT=5 但 HEALTHY_B=1(Layer B 健康)→ 唔判④(走 swap)" "$S/p5/fh1.env"
mkfacts 5 "$S/p5/fhx.env" "" ;       rules_case "第二輪#7 負控:HEALTHY_B 空(未知)→ 唔判④(fail-safe)" "$S/p5/fhx.env"
mkfacts 5 "$S/p5/f403.env" 0 1 2;    rules_case "第二輪#8 負控:resolve-fail=1 < 403=2(真 yt-dlp 過舊形)→ 唔判④(走 swap)" "$S/p5/f403.env"
mkfacts 2 "$S/p5/fb.env" 0 3 0 1;    rules_case "第二輪#8 正控:backend log 2 + healthcheck Layer B stderr 1 = 3 → ④ escalate" "$S/p5/fb.env"
echo "-- diagnose.sh 寫 facts(BACKEND_LOG=近期 fixture,DIAG_FORCE_RULES;remedy 全 dry-run)"
( export STUB_DIR="$S/p5/stub"; mkdir -p "$S/p5/stub" "$S/p5/dwd"
  echo '{"consecutiveFail":3,"botcheckB":1,"bResolveFail":3,"b403":0,"healthyB":0}' > "$S/p5/health-fix.json"
  HEALTH_STATE="$S/p5/health-fix.json" STREAM_WATCH_TEST=1 WATCH_DIR="$S/p5/dwd" DIAG_DIR="$S/p5/inc" REMEDY_DRY_RUN=1 REMEDY_LOG="$S/p5/dwd/r.log" REMEDY_STATE="$S/p5/dwd/rs.json" SELFHEAL_STATE="$S/p5/sh2.json" \
    REMEDY_STATUS_CMD="$T/stub-status.sh" STATUS_CMD="$T/stub-status.sh" OPS_METRICS_FILE=/dev/null DIAG_FORCE_RULES=1 BACKEND_LOG="$S/p5/bot-recent.log" HYMN_STREAM_BASE=http://127.0.0.1:9 \
    "$T/../stream-diagnose.sh" p5 2>/dev/null | tail -3 | sed 's/^/   /'
  echo "   facts.env:$(grep -E "BOTCHECK|HEALTHY_B|B_RESOLVE|B_403" "$S/p5/inc/facts.env" | tr "\n" " ")  bundle 含 bot-check 證據行 句:$(grep -c 'bot-check 證據行' "$S/p5/inc/bundle.md") 行" )

echo; echo "################ P6 R3 出口 IP(healthcheck 測試模式 + watch + 手機 stub)################"
setup p6; touch "$WATCH_DIR/stream-watch.on"; echo ok > "$STUB_DIR/mode"
printf '#!/usr/bin/env bash\ncat "%s/p6/ip" 2>/dev/null\n' "$S" > "$S/p6/ipcmd.sh"; chmod +x "$S/p6/ipcmd.sh"
hc() { echo "$1" > "$S/p6/ip"; env HC_IP_CMD="$S/p6/ipcmd.sh" SELFHEAL_DRY_RUN=1 SELFHEAL_STATE="$S/p6/sh.json" HYMN_STREAM_BASE=http://127.0.0.1:9 "$HC" >/dev/null 2>&1; local rc=$?
  printf '  ip輸入=%-12s hc rc=%s | state.exitIp=%s ipChanged=%s | log尾欄:%s | ℹ️行=%s | phone=%s\n' "$1" "$rc" \
    "$(python3 -c "import json;print(json.load(open('$WATCH_DIR/stream-health-state.json')).get('exitIp'))")" \
    "$(python3 -c "import json;print(json.load(open('$WATCH_DIR/stream-health-state.json')).get('ipChanged'))")" \
    "$(tail -1 "$WATCH_DIR/stream-health.log" | grep -o 'ip=[^ ]*')" "$(grep -c 'ℹ️' "$WATCH_DIR/SUPERVISION-LOG.md" 2>/dev/null || true)" "$(phones)"; }
hc 203.0.113.10; hc 203.0.113.10; hc 198.51.100.7; hc '?'; hc 198.51.100.7; hc 203.0.113.99
echo "  SUPERVISION ℹ️ 行:"; grep 'ℹ️' "$WATCH_DIR/SUPERVISION-LOG.md" | sed 's/^/    /'
echo "  手機訊息:"; sed 's/^/    /' "$STUB_DIR/phone.msgs"; cp "$STUB_DIR/phone.last" "$S/p9-ipchange.txt"
echo "  watch.log:"; sed 's/^/    /' "$WATCH_DIR/watch.log"

echo; echo "################ P7a R5(a) healthcheck 少探(--verbose 數 A/B 探測行)################"
python3 "$T/stub-a-server.py" > "$S/p7.port" & SRV=$!; sleep 0.6; PORT="$(cat "$S/p7.port")"
printf '#!/usr/bin/env bash\necho 403\n' > "$S/cdn403.sh"; chmod +x "$S/cdn403.sh"
p7() { # $1=label $2=prev_consecutiveFail $3=base $4=cdn-cmd(空=預設 206)
  setup "p7_$1"; echo "{\"consecutiveFail\": $2}" > "$WATCH_DIR/stream-health-state.json"
  local out; out="$(env HC_IP_CMD= HYMN_STREAM_BASE="$3" ${4:+HC_CDN_FETCH_CMD="$4"} SELFHEAL_DRY_RUN=1 SELFHEAL_STATE="$S/p7_$1/sh.json" "$HC" --verbose 2>&1)"
  printf '  %-34s A探測=%s B探測=%s | 結果:%s | state.consecutiveFail=%s | log:%s\n' "$1(prev=$2)" "$(echo "$out" | grep -c '^  A id=')" "$(echo "$out" | grep -c '^  B [A-Za-z0-9_-]* → ')" \
    "$(echo "$out" | grep -o 'A ok=[0-9]* fail=[0-9]* | B mid=[0-9]* midfail=[0-9]*')" "$(python3 -c "import json;print(json.load(open('$WATCH_DIR/stream-health-state.json'))['consecutiveFail'])")" "$(tail -1 "$WATCH_DIR/stream-health.log" | grep -o 'consecutiveFail=.*')"; }
p7 baseline-全探-健康 0 "http://127.0.0.1:$PORT"
p7 baseline-全探-A死 1 "http://127.0.0.1:9"
p7 light-A死-B死 2 "http://127.0.0.1:9" "$S/cdn403.sh"
p7 light-A死-B過 2 "http://127.0.0.1:9"
p7 light-A過-B死 2 "http://127.0.0.1:$PORT" "$S/cdn403.sh"
p7 light-A過-B過-恢復 2 "http://127.0.0.1:$PORT"
p7 light-prev7 7 "http://127.0.0.1:9" "$S/cdn403.sh"
p7 due-prev13-新14全探 13 "http://127.0.0.1:9" "$S/cdn403.sh"
p7 due-prev1-新2全探 1 "http://127.0.0.1:9" "$S/cdn403.sh"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null

echo; echo "################ P8 R7 canary 告示 fixture ################"
for c in 0 1 2 5; do echo "{\"consecutiveFail\": $c}" > "$S/hs$c.json"; echo "-- consecutiveFail=$c:"; "$REPO/ops/ytdlp/canary-note.sh" "$S/hs$c.json" | cut -c1-120; done
echo 'garbage' > "$S/hsbad.json"; echo "-- state 壞:"; "$REPO/ops/ytdlp/canary-note.sh" "$S/hsbad.json" | cut -c1-80
echo "-- state 唔存在:"; "$REPO/ops/ytdlp/canary-note.sh" "$S/nonexist.json" | cut -c1-80
echo "(update-ytdlp.sh 本身會 pip install + 打 YouTube,唔行;只驗 canary-note.sh 同 bash -n)"

echo; echo "################ P9 第三輪:手機訊息白話化(四款 × 形態①②③④)斷言 ################"
P9FAIL=0
chk() { # $1=標籤 $2=訊息檔 $3...=必須包含嘅字串(以 || 分隔不用;逐個參數);另外固定檢查:<=400 字、冇內部字眼
  local label="$1" f="$2"; shift 2
  python3 - "$label" "$f" "$@" <<'PY' || P9FAIL=$((P9FAIL+1))
import sys
label, f, *need = sys.argv[1:]
t = open(f, encoding='utf-8').read()
bad = [n for n in need if n not in t]
for w in ('rc=', 'ignored', 'selfheal', 'alert-', 'verdict', 'escalate', '形態', 'Layer'):
    if w in t: bad.append('不應含內部字眼:' + w)
if len(t) > 400: bad.append('超 400 字:%d' % len(t))
print("  [%s] %s | %d 字 | 行數=%d" % (label, 'PASS' if not bad else 'FAIL ' + str(bad), len(t), t.count('\n') + 1))
if bad: print(t); sys.exit(1)
PY
}
for f in 1 2 3 4; do
  setup p9$f; echo escalate > "$STUB_DIR/verdict"; tick bad$f; tick bad$f
  cp "$STUB_DIR/phone.last" "$S/p9-down$f.txt"
  for i in $(seq 1 12); do tick bad$f; done; cp "$STUB_DIR/phone.last" "$S/p9-renotify$f.txt"
  tick ok; cp "$STUB_DIR/phone.last" "$S/p9-recover$f.txt"
done
chk "首發④" "$S/p9-down4.txt" "🔴 Odely 播歌出問題（由 " "起）" $'\n原因：VPN 出口 IP 被 YouTube 當機械人擋住' $'\n自動修復：已判斷換 yt-dlp 無用，未自動修' $'\n要你做：可以先等 30–60 分鐘（揀另一個城市），換完等 30 分鐘會自動確認'
chk "重發④" "$S/p9-renotify4.txt" "🔴 Odely 播歌仍未恢復（由 " "已 6.5 小時）" $'\n原因：VPN 出口 IP 被 YouTube 當機械人擋住' $'\n要你做：可以先等 30–60 分鐘'
chk "首發①" "$S/p9-down1.txt" $'\n原因：播歌程式版本過舊' $'\n要你做：請叫 Claude 跟進'
chk "首發②" "$S/p9-down2.txt" $'\n原因：伺服器死咗' $'\n要你做：請叫 Claude 跟進'
chk "首發③" "$S/p9-down3.txt" $'\n原因：YouTube 嗰邊有問題' $'\n要你做：通常等 30–60 分鐘會自己好'
chk "恢復" "$S/p9-recover4.txt" "✅ Odely 播歌已恢復（" $'\n停咗大約 7.0 小時'
chk "IP變" "$S/p9-ipchange.txt" "ℹ️ Odely 網絡出口 IP 變咗" $'\n要你做：暫時唔使做'
echo "  IP變訊息含 IP 數字=$(grep -cE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' "$S/p9-ipchange.txt")(預期 0)"
echo "  P9 FAIL 項數=$P9FAIL(預期 0)"
