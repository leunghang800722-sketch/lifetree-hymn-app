#!/usr/bin/env bash
# T13:healthcheck + selfheal 三層防呆(STREAM-HARDEN2-EXEC-20260929)。用法:t13-hc-selfheal-guard.sh <scratchdir>
#  (a) 真 repo healthcheck:CLAUDECODE=1 冇 HC_MANUAL / 測試模式 WATCH_DIR=真 home → REFUSED exit 2 零寫入(唔用 env -i 跑真 healthcheck)
#  (b) 真 repo selfheal:冇 env / 半設 / CLAUDECODE / 偽造 .tick-ctx(HOME=/tmp/x)→ 全部 REFUSED 零寫入
#  (c) 測試模式全鏈:healthcheck → .tick-ctx 出現 → selfheal 形態② → RESTART_CMD stub 被 call → tick 完 ctx 消失;kill -9 → 殘留 ctx pid 死 → REFUSED
#  (d) 假 repo 副本(sed 換 home)prod 模式:有效 .tick-ctx → selfheal 行到(stub restart);冇/死/過期/symlink/CLAUDECODE → REFUSED
#  安全網:每個「真 script + 預期 REFUSED」嘅 case,先喺 scratch 假 repo 副本(同一份 code)確認真係 REFUSED,先敢跑真 repo 嗰個
#  (萬一 guard 壞咗,真 script 會落 prod)。真 launchd tick 會寫 ~/.hymn-deploy/.tick-ctx:存在就 SKIP 真 repo 嘅 case。
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t13"; T="$(cd "$(dirname "$0")" && pwd)"; SRC="$T/.."; REPO="$(cd "$T/../../.." && pwd -P)"
HC="$REPO/ops/lyrics/stream-healthcheck.sh"; SH="$SRC/stream-selfheal.sh"
rm -rf "$S"; mkdir -p "$S"
REALHOME="$(/usr/bin/dscl . -read "/Users/$(/usr/bin/id -un)" NFSHomeDirectory | /usr/bin/awk '{print $2}')"
FAILS=0
chk() { if [[ "$2" -eq 0 ]]; then echo "  PASS $1"; else echo "  FAIL $1"; FAILS=$((FAILS+1)); fi; }
prodsig() { # 真 prod 檔摘要(md5+行數+檔清單)
  { find "$REALHOME/.hymn-deploy" -mindepth 1 2>/dev/null | LC_ALL=C sort | while IFS= read -r f; do [[ -f "$f" ]] && /sbin/md5 -q "$f" || echo "DIR $f"; done
    /sbin/md5 -q /tmp/hymn_stream_watch.log 2>/dev/null; wc -l < /tmp/hymn_stream_watch.log 2>/dev/null
    /sbin/md5 -q "$REPO/docs/SUPERVISION-LOG.md" 2>/dev/null
    for f in "$REPO"/backend/data/stream-*.json "$REPO"/backend/data/stream-*.log; do [[ -e "$f" ]] && /sbin/md5 -q "$f"; done; } | /sbin/md5 -q
}
if [[ -e "$REALHOME/.hymn-deploy/.tick-ctx" || -e "$REALHOME/.hymn-deploy/.watch-ctx" ]]; then SKIPREAL=1; echo "SKIP 真 repo 嘅 case:真 ~/.hymn-deploy 有 .tick-ctx/.watch-ctx(launchd tick 正喺行);稍後重跑"; else SKIPREAL=0; fi
NOENV=(env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME")   # 完全冇 STREAM_WATCH_TEST 等
mkdir -p "$S/z"; ZDIR="$S/z"   # 「唔應該被建」嘅偵測目錄

# ── 假 repo(同一份 code):healthcheck + selfheal;HOME 相關取值 sed 換去假 home ─────────────
FR="$S/fr"; FH="$S/fh"; mkdir -p "$FR/ops/lyrics" "$FR/ops/stream" "$FR/docs" "$FR/backend/data" "$FH/.hymn-deploy"
cp "$HC" "$FR/ops/lyrics/"; cp "$SH" "$FR/ops/stream/"
sed -i '' 's|^  export HOME="\$_sh_home"$|  export HOME="'"$FH"'"|' "$FR/ops/stream/stream-selfheal.sh"
grep -q "export HOME=\"$FH\"" "$FR/ops/stream/stream-selfheal.sh"; chk "假 repo selfheal 已 patch 真 HOME 取值(其餘 guard 邏輯原封不動)" $?
FHC="$FR/ops/lyrics/stream-healthcheck.sh"; FSH="$FR/ops/stream/stream-selfheal.sh"; FCTX="$FH/.hymn-deploy/.tick-ctx"
diff <(sed 's|^  export HOME=.*$||' "$SH") <(sed 's|^  export HOME=.*$||' "$FSH") >/dev/null; chk "假 repo selfheal 除 HOME 一行外同真 script 逐字一樣" $?
FENV=(env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$FH")
fake() { (cd / && "${FENV[@]}" "$@") >"$S/out" 2>"$S/err"; }
refused_fake() { # <label> <cmd...>  在假 repo 行,期望 exit 2 + REFUSED
  local label="$1"; shift; fake "$@"; local rc=$?
  if [[ $rc -eq 2 ]] && grep -q '^REFUSED' "$S/err"; then echo "  PASS [fake] $label → exit 2 REFUSED"; return 0; fi
  echo "  FAIL [fake] $label rc=$rc err=$(head -c 200 "$S/err")"; FAILS=$((FAILS+1)); return 1; }
refused_real() { # <label> <fakeok:0|1> <cmd...>  真 repo;期望 exit 2 + REFUSED + prod 摘要不變 + scratch 偵測目錄不變
  local label="$1"; shift; local before after rc
  before="$(prodsig)"; (cd / && "$@") >"$S/out" 2>"$S/err"; rc=$?; after="$(prodsig)"
  if [[ $rc -eq 2 ]] && grep -q '^REFUSED' "$S/err" && [[ "$before" == "$after" ]]; then echo "  PASS [real] $label → exit 2 REFUSED、prod 摘要不變($(head -c 90 "$S/err"))"
  else echo "  FAIL [real] $label rc=$rc err=$(head -c 200 "$S/err") 摘要變=$([[ "$before" == "$after" ]] && echo no || echo YES)"; FAILS=$((FAILS+1)); fi; }

# 自起活 pid(測試尾巴自己收)
/bin/sleep 300 & LIVE=$!; sleep 0.3; echo "測試自起 live pid=$LIVE  $(ps -o pid=,ppid=,lstart=,command= -p $LIVE)"
/bin/sleep 0.1 & DEAD=$!; wait $DEAD 2>/dev/null

echo "=================== (a) 真 repo healthcheck ==================="
# 先喺假 repo 副本確認 guard 真係擋(每個 case),先跑真 repo。假 repo 用 STREAM_WATCH_TEST 唔設 + CLAUDECODE=1。
refused_fake "healthcheck CLAUDECODE=1 冇 HC_MANUAL" env CLAUDECODE=1 "$FHC"; A1=$?
[[ ! -e "$FCTX" && ! -e "$FR/docs/SUPERVISION-LOG.md" && -z "$(ls -A "$FR/backend/data")" ]]; chk "[fake] 拒絕時零寫入(冇 .tick-ctx、冇 SUPERVISION-LOG、冇 backend/data 檔)" $?
refused_fake "healthcheck 測試模式 WATCH_DIR 唔喺 tmp(用寫唔入嘅 /usr/local 路徑)" env STREAM_WATCH_TEST=1 WATCH_DIR=/usr/local/t13-nonexistent "$FHC"; A2=$?
refused_fake "healthcheck 測試模式 YTDLP_BIN=真 yt-dlp 路徑" env STREAM_WATCH_TEST=1 WATCH_DIR="$S/a-wd" YTDLP_BIN="$REPO/backend/tools/yt-dlp" "$FHC"; A3=$?
refused_fake "healthcheck 測試模式 HYMN_STREAM_BASE=真 backend :3001" env STREAM_WATCH_TEST=1 WATCH_DIR="$S/a-wd" HYMN_STREAM_BASE=http://127.0.0.1:3001 "$FHC"; A4=$?
[[ ! -e "$S/a-wd" ]]; chk "[fake] 測試模式 guard 拒絕時連 WATCH_DIR 都冇建" $?
if [[ $SKIPREAL -eq 0 && $A1 -eq 0 && $A2 -eq 0 && $A3 -eq 0 && $A4 -eq 0 ]]; then
  refused_real "healthcheck CLAUDECODE=1、冇 HC_MANUAL(env -u STREAM_WATCH_TEST)" env -u STREAM_WATCH_TEST CLAUDECODE=1 "$HC"
  refused_real "healthcheck STREAM_WATCH_TEST=1 WATCH_DIR=真 ~/.hymn-deploy" "${NOENV[@]}" STREAM_WATCH_TEST=1 WATCH_DIR="$REALHOME/.hymn-deploy" "$HC"
  refused_real "healthcheck 測試模式 YTDLP_BIN=真 yt-dlp" "${NOENV[@]}" STREAM_WATCH_TEST=1 WATCH_DIR="$S/a-wd" YTDLP_BIN="$REPO/backend/tools/yt-dlp" "$HC"
  refused_real "healthcheck 測試模式 HYMN_STREAM_BASE=:3001" "${NOENV[@]}" STREAM_WATCH_TEST=1 WATCH_DIR="$S/a-wd" HYMN_STREAM_BASE=http://127.0.0.1:3001 "$HC"
  [[ ! -e "$S/a-wd" ]]; chk "[real] 拒絕時連 tmp WATCH_DIR 都冇建" $?
else echo "  (SKIP 真 repo healthcheck:SKIPREAL=$SKIPREAL 假 repo 預檢=$A1$A2$A3$A4)"; fi

echo "=================== (b) 真 repo selfheal ==================="
SHARGS=(--healthy-a 1 --healthy-b 1 --mid 3 --midfail 0 --ok 3 --fail 0 --detail t13)
mkdir -p "$S/b"
refused_fake "selfheal 冇 env(無憑證)" "$FSH" "${SHARGS[@]}"; B0=$?
refused_fake "selfheal 半設[缺 WATCH_DIR]" env STREAM_WATCH_TEST=1 SELFHEAL_STATE="$S/b/s.json" HEALTH_STATE="$S/b/h.json" "$FSH" "${SHARGS[@]}"; B1=$?
refused_fake "selfheal 半設[缺 HEALTH_STATE]" env STREAM_WATCH_TEST=1 SELFHEAL_STATE="$S/b/s.json" WATCH_DIR="$S/b/wd" "$FSH" "${SHARGS[@]}"; B2=$?
refused_fake "selfheal 半設[缺 SELFHEAL_STATE]" env STREAM_WATCH_TEST=1 HEALTH_STATE="$S/b/h.json" WATCH_DIR="$S/b/wd" "$FSH" "${SHARGS[@]}"; B3=$?
refused_fake "selfheal 三個齊但缺 STREAM_WATCH_TEST" env SELFHEAL_STATE="$S/b/s.json" HEALTH_STATE="$S/b/h.json" WATCH_DIR="$S/b/wd" "$FSH" "${SHARGS[@]}"; B4=$?
refused_fake "selfheal CLAUDECODE=1" env CLAUDECODE=1 "$FSH" "${SHARGS[@]}"; B5=$?
refused_fake "selfheal SELFHEAL_DRY_RUN=1 唔算憑證" env SELFHEAL_DRY_RUN=1 "$FSH" "${SHARGS[@]}"; B6=$?
# 偽造 .tick-ctx:HOME=/tmp/x(scratch)+ 有效 ctx(live pid)。假 repo selfheal HOME 已 patch 成 FH,所以呢個 case 要用「HOME 唔 patch」版本證明 HOME 搬唔走:
FR2="$S/fr2"; mkdir -p "$FR2/ops/stream" "$FR2/backend/data" "$S/forgedhome/.hymn-deploy"; cp "$SH" "$FR2/ops/stream/"
printf 'pid=%s ts=%s\n' "$LIVE" "$(date +%s)" > "$S/forgedhome/.hymn-deploy/.tick-ctx"
(cd / && env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$S/forgedhome" "$FR2/ops/stream/stream-selfheal.sh" "${SHARGS[@]}") >"$S/out" 2>"$S/err"; rc=$?
[[ $rc -eq 2 ]] && grep -q '^REFUSED' "$S/err" && [[ ! -e "$FR2/backend/data/stream-selfheal-state.json" ]]; chk "[fake2 未 patch HOME] 偽造 HOME=$S/forgedhome + 有效 ctx → 因 HOME 被重設成真 home(無真 ctx)→ REFUSED 零寫入 rc=$rc" $?
if [[ $SKIPREAL -eq 0 && $B0$B1$B2$B3$B4$B5$B6 == 0000000 ]]; then
  refused_real "selfheal 冇 env" "${NOENV[@]}" "$SH" "${SHARGS[@]}"
  refused_real "selfheal 半設[缺 WATCH_DIR]" "${NOENV[@]}" STREAM_WATCH_TEST=1 SELFHEAL_STATE="$S/b/s.json" HEALTH_STATE="$S/b/h.json" "$SH" "${SHARGS[@]}"
  refused_real "selfheal 半設[缺 HEALTH_STATE]" "${NOENV[@]}" STREAM_WATCH_TEST=1 SELFHEAL_STATE="$S/b/s.json" WATCH_DIR="$S/b/wd" "$SH" "${SHARGS[@]}"
  refused_real "selfheal 半設[缺 SELFHEAL_STATE]" "${NOENV[@]}" STREAM_WATCH_TEST=1 HEALTH_STATE="$S/b/h.json" WATCH_DIR="$S/b/wd" "$SH" "${SHARGS[@]}"
  refused_real "selfheal 缺 STREAM_WATCH_TEST" "${NOENV[@]}" SELFHEAL_STATE="$S/b/s.json" HEALTH_STATE="$S/b/h.json" WATCH_DIR="$S/b/wd" "$SH" "${SHARGS[@]}"
  refused_real "selfheal CLAUDECODE=1" "${NOENV[@]}" CLAUDECODE=1 "$SH" "${SHARGS[@]}"
  refused_real "selfheal 偽造 .tick-ctx(HOME=$S/forgedhome、有效 live pid ctx)" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$S/forgedhome" "$SH" "${SHARGS[@]}"
  refused_real "selfheal 偽造 .tick-ctx + WATCH_DIR 指去偽造 home(prod 模式應忽略 WATCH_DIR)" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$S/forgedhome" WATCH_DIR="$S/forgedhome/.hymn-deploy" "$SH" "${SHARGS[@]}"
  [[ ! -e "$S/b/wd" && -z "$(ls -A "$S/b")" ]]; chk "[real] 半設 env 指去嘅 scratch 路徑冇被建(零寫入)" $?
else echo "  (SKIP 真 repo selfheal:SKIPREAL=$SKIPREAL 假 repo 預檢=$B0$B1$B2$B3$B4$B5$B6)"; fi

echo "=================== (c) 測試模式全鏈(真 repo healthcheck + 真 selfheal,全部 stub)==================="
WD="$S/c/wd"; STUBS="$S/c/stub"; mkdir -p "$WD" "$STUBS"
CALLS="$S/c/restart.calls"
cat > "$STUBS/restart.sh" <<EOF
#!/usr/bin/env bash
# 假 restart:記錄被 call 時 .tick-ctx 存在嘅內容 + 參數;唔真 restart
# 沿祖先鏈搵 stream-healthcheck.sh 嘅 pid(唔靠固定層數:command substitution/eval 會多一層 subshell)
a=\$\$; hc=none; for _ in 1 2 3 4 5 6; do a="\$(ps -o ppid= -p "\$a" 2>/dev/null | tr -d ' ')"; [[ -z "\$a" || "\$a" == 1 ]] && break; case "\$(ps -o command= -p "\$a")" in *stream-healthcheck.sh*) hc=\$a; break ;; esac; done
echo "restart-stub args=\$* | ctx=\$(cat "$WD/.tick-ctx" 2>/dev/null || echo MISSING) | hc-ancestor=\$hc" >> "$CALLS"; exit 0
EOF
chmod +x "$STUBS/restart.sh"
printf '{"consecutiveFail": 2}\n' > "$WD/stream-health-state.json"
echo '(c1) healthcheck(測試模式,base=死 port,Layer B stub 206)→ .tick-ctx 出現 → selfheal 形態② → restart stub(帶 --dry-run)'
before="$(prodsig)"
( cd / && env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 WATCH_DIR="$WD" HYMN_STREAM_BASE=http://127.0.0.1:9 \
    SELFHEAL_STATE="$WD/stream-selfheal-state.json" SELFHEAL_RESTART_CMD="$STUBS/restart.sh restart --dry-run" SELFHEAL_RECHECK_SLEEP=0 \
    "$HC" ) >"$S/c/out" 2>"$S/c/err" &
HCPID=$!; wait $HCPID; rc=$?
echo "  healthcheck pid=$HCPID rc=$rc"
echo "  --- restart.calls:"; sed 's/^/    /' "$CALLS" 2>/dev/null
grep -q -- "args=restart --dry-run" "$CALLS" 2>/dev/null; chk "RESTART_CMD stub 被 call 且帶 --dry-run" $?
[[ "$(head -1 "$CALLS" 2>/dev/null)" =~ ctx=pid=([0-9]+)\ ts=[0-9]+\ \|\ hc-ancestor=([0-9]+)$ && "${BASH_REMATCH[1]}" == "${BASH_REMATCH[2]}" ]]; chk "stub 被 call 嗰刻 .tick-ctx 存在,內容 pid = 祖先鏈上嘅 stream-healthcheck.sh pid(即 healthcheck 自己)" $?
[[ ! -e "$WD/.tick-ctx" ]]; chk "tick 完 .tick-ctx 消失" $?
echo "  --- \$WD 內容:$(ls -A "$WD" | tr '\n' ' ')"
echo "  --- stream-health-state.json:$(tr -d '\n ' < "$WD/stream-health-state.json")"
echo "  --- stream-selfheal-state.json:action=$(python3 -c "import json;d=json.load(open('$WD/stream-selfheal-state.json'));print(d['action'] if 'action' in d else d.get('lastAction'), 'restartsToday=',d['restartsToday'],'form=',d['alert']['form'])" 2>/dev/null)"
echo "  --- stream-selfheal.log:"; sed 's/^/    /' "$WD/stream-selfheal.log" 2>/dev/null
echo "  --- SUPERVISION-LOG.md(測試模式落 \$WD):"; sed 's/^/    /' "$WD/SUPERVISION-LOG.md" 2>/dev/null | cut -c1-160
[[ "$before" == "$(prodsig)" ]]; chk "(c1) 前後真 prod 摘要不變" $?
grep -q "restart-backend\|backend-restart-" "$WD/stream-selfheal.log" 2>/dev/null; chk "selfheal 走咗形態②(history 有 backend-restart-*)" $?
echo '(c2) selfheal 直接跑測試模式,SELFHEAL_RESTART_CMD 未設 + SELFHEAL_DRY_RUN=1 --verbose:睇預設 restart 指令帶唔帶 --dry-run(dry-run 唔會真行)'
printf '{"consecutiveFail": 3}\n' > "$WD/h2.json"
( cd / && env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 WATCH_DIR="$WD" SELFHEAL_STATE="$WD/s2.json" HEALTH_STATE="$WD/h2.json" \
    SELFHEAL_DRY_RUN=1 "$SH" --healthy-a 0 --healthy-b 1 --mid 3 --midfail 0 --ok 0 --fail 3 --detail t13 --verbose ) >"$S/out" 2>&1
grep '會行' "$S/out" | sed 's/^/    /'
grep -q "backend-restart.sh --same-code --dry-run" "$S/out"; chk "測試模式預設 restart 指令 = backend-restart.sh --same-code --dry-run" $?
echo '(c3) 測試模式 YTDLP_LINK 指真 yt-dlp / HYMN_STREAM_BASE=:3001 → REFUSED'
refused_real "selfheal 測試模式 YTDLP_LINK=真 yt-dlp" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 WATCH_DIR="$WD" SELFHEAL_STATE="$WD/s3.json" HEALTH_STATE="$WD/h2.json" YTDLP_LINK="$REPO/backend/tools/yt-dlp" "$SH" "${SHARGS[@]}"
refused_real "selfheal 測試模式 HYMN_STREAM_BASE=:3001" env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 WATCH_DIR="$WD" SELFHEAL_STATE="$WD/s3.json" HEALTH_STATE="$WD/h2.json" HYMN_STREAM_BASE=http://127.0.0.1:3001 "$SH" "${SHARGS[@]}"
echo '(c4) kill -9 healthcheck(由 Layer B stub 殺 ctx 內 pid,核 PPID 鏈)→ 殘留 .tick-ctx、pid 死 → selfheal(假 repo prod 模式)REFUSED'
WD4="$S/c4/wd"; mkdir -p "$WD4"; printf '{"consecutiveFail": 2}\n' > "$WD4/stream-health-state.json"
cat > "$STUBS/killhc.sh" <<EOF
#!/usr/bin/env bash
# Layer B 直打 CDN stub:核 ctx pid 係我哋 healthcheck(命令行含 stream-healthcheck.sh,且係本 process 嘅祖先)先 kill -9
p="\$(sed -n 's/^pid=\([0-9][0-9]*\).*\$/\1/p' "$WD4/.tick-ctx" | head -1)"
cmd="\$(ps -o command= -p "\$p" 2>/dev/null)"; a=\$\$; pp=none; for _ in 1 2 3 4 5 6; do a="\$(ps -o ppid= -p "\$a" 2>/dev/null | tr -d ' ')"; [[ "\$a" == "\$p" ]] && { pp=\$p; break; }; [[ -z "\$a" || "\$a" == 1 ]] && break; done
if [[ "\$cmd" == *stream-healthcheck.sh* && "\$pp" == "\$p" ]]; then echo "killhc: kill -9 \$p(\$cmd)" >> "$S/c4/kill.log"; kill -9 "\$p"; else echo "killhc: 唔殺(p=\$p cmd=\$cmd pp=\$pp)" >> "$S/c4/kill.log"; fi
echo 206
EOF
chmod +x "$STUBS/killhc.sh"
( cd / && env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$REALHOME" STREAM_WATCH_TEST=1 WATCH_DIR="$WD4" HYMN_STREAM_BASE=http://127.0.0.1:9 HC_CDN_FETCH_CMD="$STUBS/killhc.sh" \
    SELFHEAL_STATE="$WD4/sh.json" "$HC" ) >"$S/c4/out" 2>&1 &
HC4=$!; wait $HC4 2>/dev/null; rc=$?
cat "$S/c4/kill.log" 2>/dev/null | sed 's/^/    /'
echo "  healthcheck pid=$HC4 wait-rc=$rc(137=SIGKILL);殘留 ctx:$(cat "$WD4/.tick-ctx" 2>/dev/null || echo 冇)"
[[ $rc -eq 137 && -f "$WD4/.tick-ctx" ]] && ! kill -0 "$HC4" 2>/dev/null; chk "healthcheck 被 kill -9、.tick-ctx 殘留、pid 已死" $?
[[ ! -e "$WD4/stream-health.log" ]]; chk "被殺後冇行到 selfheal/寫 history(stream-health.log 不存在)" $?
cp -p "$WD4/.tick-ctx" "$FCTX" 2>/dev/null; rm -f "$FR/backend/data/stream-selfheal-state.json"
refused_fake "殘留 ctx(pid 死)+ 假 repo prod 模式 selfheal" "$FSH" "${SHARGS[@]}"
[[ ! -e "$FR/backend/data/stream-selfheal-state.json" && ! -e "$FR/backend/data/stream-selfheal.log" ]]; chk "REFUSED 零寫入(假 repo state/log 冇出現)" $?
rm -f "$FCTX"

echo "=================== (d) 假 repo 副本 prod 模式(有效 .tick-ctx → 行到;否則 REFUSED)==================="
FCALLS="$S/d/restart.calls"; mkdir -p "$S/d"; : > "$FCALLS"
cat > "$STUBS/frestart.sh" <<EOF
#!/usr/bin/env bash
echo "frestart args=\$*" >> "$FCALLS"; exit 0
EOF
chmod +x "$STUBS/frestart.sh"
printf '{"consecutiveFail": 3}\n' > "$FR/backend/data/stream-health-state.json"
DENV=(SELFHEAL_RESTART_CMD="$STUBS/frestart.sh restart" HYMN_STREAM_BASE=http://127.0.0.1:9 SELFHEAL_RECHECK_SLEEP=0)
DARGS=(--healthy-a 0 --healthy-b 1 --mid 3 --midfail 0 --ok 0 --fail 3 --detail t13d)
rm -f "$FCTX"; refused_fake "(d0) 冇 .tick-ctx" env "${DENV[@]}" "$FSH" "${DARGS[@]}"
[[ ! -s "$FCALLS" && ! -e "$FR/backend/data/stream-selfheal-state.json" ]]; chk "(d0) 冇動作、零寫入" $?
printf 'pid=%s ts=%s\n' "$LIVE" "$(date +%s)" > "$FCTX"; chmod 600 "$FCTX"
fake env "${DENV[@]}" "$FSH" "${DARGS[@]}"; rc=$?
[[ $rc -eq 0 ]] && grep -q "frestart args=restart" "$FCALLS"; chk "(d1) 有效 ctx(live pid=$LIVE、剛寫)→ selfheal 行到,restart stub 被 call(rc=$rc)" $?
echo "     假 repo 寫咗:$(ls "$FR/backend/data" | tr '\n' ' ') | $(tail -1 "$FR/backend/data/stream-selfheal.log" 2>/dev/null | cut -c1-120)"
printf 'pid=%s ts=%s\n' "$DEAD" "$(date +%s)" > "$FCTX"; : > "$FCALLS"; rm -f "$FR/backend/data/stream-selfheal-state.json" "$FR/backend/data/stream-selfheal.log" "$FR/docs/SUPERVISION-LOG.md"
refused_fake "(d2) ctx pid 已死" env "${DENV[@]}" "$FSH" "${DARGS[@]}"
touch -t "$(date -v-31M +%Y%m%d%H%M.%S)" "$FCTX"; printf 'pid=%s ts=1\n' "$LIVE" > "$FCTX.new"; mv "$FCTX.new" "$FCTX"; touch -t "$(date -v-31M +%Y%m%d%H%M.%S)" "$FCTX"
refused_fake "(d3) live pid 但 mtime 31 分鐘前" env "${DENV[@]}" "$FSH" "${DARGS[@]}"
rm -f "$FCTX"; printf 'pid=%s ts=1\n' "$LIVE" > "$S/realctx"; ln -s "$S/realctx" "$FCTX"
refused_fake "(d4) ctx 係 symlink" env "${DENV[@]}" "$FSH" "${DARGS[@]}"
rm -f "$FCTX"; printf 'garbage\n' > "$FCTX"
refused_fake "(d5) ctx 內容壞" env "${DENV[@]}" "$FSH" "${DARGS[@]}"
printf 'pid=%s ts=%s\n' "$LIVE" "$(date +%s)" > "$FCTX"
refused_fake "(d6) 有效 ctx + CLAUDECODE=1(冇 MANUAL)" env CLAUDECODE=1 "${DENV[@]}" "$FSH" "${DARGS[@]}"
fake env CLAUDECODE=1 SELFHEAL_MANUAL=1 "${DENV[@]}" "$FSH" "${DARGS[@]}"; rc=$?; [[ $rc -eq 0 ]]; chk "(d7) 有效 ctx + CLAUDECODE=1 + SELFHEAL_MANUAL=1 → 行到 rc=$rc" $?
rm -f "$FCTX" "$FR/backend/data/stream-selfheal-state.json" "$FR/backend/data/stream-selfheal.log" "$FR/docs/SUPERVISION-LOG.md"
fake env SELFHEAL_MANUAL=1 SELFHEAL_DRY_RUN=1 "${DENV[@]}" "$FSH" "${DARGS[@]}"; rc=$?; [[ $rc -eq 0 ]]; chk "(d8) 冇 ctx + SELFHEAL_MANUAL=1 + DRY_RUN → 行到 rc=$rc" $?

echo "=== (d9) 假 repo healthcheck prod 模式(HC_MANUAL=1 CLAUDECODE=1,base=死 port,yt-dlp stub 回 127.0.0.1:9)→ .tick-ctx 寫落假 home、tick 完刪 ==="
cat > "$S/d/ytstub.sh" <<EOF
#!/bin/sh
[ "\$1" = "--version" ] && { echo stubprod; exit 0; }
[ -e "$FCTX" ] && echo "ctx-present-during-tick: \$(cat "$FCTX")" >> "$S/d/ytctx.log"
echo "http://127.0.0.1:9/x"
EOF
chmod +x "$S/d/ytstub.sh"; rm -f "$FR/backend/data"/* "$FR/docs/SUPERVISION-LOG.md"
fake env HC_MANUAL=1 CLAUDECODE=1 HYMN_STREAM_BASE=http://127.0.0.1:9 YTDLP_BIN="$S/d/ytstub.sh" "$FHC"; rc=$?
[[ $rc -eq 0 ]]; chk "(d9) 假 repo prod 模式 healthcheck exit 0" $?
grep -q "ctx-present-during-tick: pid=" "$S/d/ytctx.log" 2>/dev/null; chk "(d9) tick 內 $FCTX 存在(prod 路徑 = \$HOME/.hymn-deploy/.tick-ctx)" $?
[[ ! -e "$FCTX" ]]; chk "(d9) tick 完 ctx 消失" $?
echo "     prod 路徑檔案落假 repo:$(cd "$FR" && find backend docs -type f | tr '\n' ' ')(預期 backend/data/stream-health-state.json、stream-health.log、docs/SUPERVISION-LOG.md)"

echo "=== 收尾:殺自己起嘅 sleep pid=$LIVE(核 PPID=$$ + 命令行)==="
ps -o pid=,ppid=,command= -p "$LIVE"; if [[ "$(ps -o ppid= -p "$LIVE" | tr -d ' ')" == "$$" && "$(ps -o command= -p "$LIVE")" == "/bin/sleep 300" ]]; then kill "$LIVE"; wait "$LIVE" 2>/dev/null; echo killed; fi
echo "=== 總結:FAILS=$FAILS ==="
[[ $FAILS -eq 0 ]]
