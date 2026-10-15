#!/usr/bin/env bash
# ops/stream/stream-watch-lib.sh — stream-watch / diagnose / remedy 共用小函數(只 source,唔直接行)
# STREAM-WATCH-EXEC-20260929;STREAM-WATCH-FIX-EXEC-20260929 H1/M4
#
# H1:launchd 只俾 /usr/bin:/bin:/usr/sbin:/sbin,搵唔到 node/claude(/opt/homebrew/bin)。
#     所有 source 呢個 lib 嘅 script 統一補 PATH。(healthcheck/selfheal 本身嘅 PATH 唔喺本層改。)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# launchd 冇 USER:claude 用帳戶名搵 keychain 憑證,冇 USER 會報 Not logged in(09-29 實測)。全線 source 者受惠。
export USER="${USER:-$(id -un)}"

WATCH_DIR="${WATCH_DIR:-$HOME/.hymn-deploy}"

# ── 合法 caller 憑證(STREAM-HARDEN-EXEC-20260929 §2.2)──────────────────
# 「忘記設 env = 寫 prod」係錯方向。remedy/diagnose 非測試模式(=prod)必須:
#   (i) $WATCH_DIR/.watch-ctx(stream-watch tick 內寫,tick 結束刪)存在、普通檔、mtime<30 分鐘、入面 pid 仍生存;或
#   (ii) 人手明示 REMEDY_MANUAL=1 / DIAG_MANUAL=1。
# 另:Claude 工具 shell(CLAUDECODE 非空)冇明示 MANUAL 一律拒(兩次事故同 Fable 誤觸都喺 Claude shell)。
# 拒絕 = stderr 印 REFUSED、exit 2、零寫入(呼叫前唔准做任何 mkdir/log)。
wlib_ctx_valid() { # $1=ctx 檔路徑
  local f="$1" pid ts now m
  [[ -f "$f" && ! -L "$f" ]] || return 1
  m="$(stat -f %m "$f" 2>/dev/null)" || return 1
  now="$(date +%s)"; (( now - m < 1800 )) || return 1
  pid="$(sed -n 's/^pid=\([0-9][0-9]*\).*$/\1/p' "$f" 2>/dev/null | head -1)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}
wlib_prod_guard() { # $1=ctx 檔 $2=MANUAL 值 $3=MANUAL 變數名(訊息用)
  if [[ "$2" == "1" ]]; then return 0; fi
  if [[ -z "${CLAUDECODE:-}" ]] && wlib_ctx_valid "$1"; then return 0; fi
  echo "REFUSED: prod 模式只准由 stream-watch tick 內呼叫;人手用請設 $3=1" >&2
  exit 2
}
# 本 uid 帳戶真 home(絕對路徑 dscl,唔信 caller HOME/PATH);攞唔到印空
wlib_real_home() {
  local u h; u="$(/usr/bin/id -un 2>/dev/null)"
  h="$(/usr/bin/dscl . -read "/Users/$u" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')"
  [[ "$h" == /* && -d "$h" ]] && printf '%s' "$h"
}

# 密鑰/URL 過濾(M4:pattern 級遮蓋,唔再成行刪走——正常診斷字眼同 🔴 行骨架要保留)。stdin → stdout。
# 遮蓋:JWT / Twilio AC|SK+32hex / Authorization / Bearer / URL query sig|signature|token|key|lsig /
#       ://user:pass@ / (secret|password|passwd|token|api_key)=值;最後 URL 只留 scheme://host。
# 值字元類 [^\s"',;\\&] 令一行 JSON 都唔會被食過界。
wlib_filter() {
  perl -pe '
    my $v = q{[^\s"\x27,;\\\\&<>]+};
    s/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/[REDACTED-JWT]/g;
    s/\b(?:AC|SK)[0-9a-fA-F]{32}\b/[REDACTED-TWILIO]/g;
    s/(Authorization\s*[:=]\s*)(?:(?:Basic|Bearer)\s+)?$v/$1\[REDACTED]/ig;
    s/(Bearer\s+)$v/$1\[REDACTED]/ig;
    s/([?&](?:sig|signature|token|key|lsig)=)$v/$1\[REDACTED]/ig;
    s{(://)[^/@\s"\x27]+@}{$1\[REDACTED]@}g;
    s/\b((?:[A-Za-z0-9]+[_-])*(?:secret|password|passwd|token|api[_-]?key)(?:[_-][A-Za-z0-9]+)*\s*[=:]\s*)$v/$1\[REDACTED]/ig;
    s{(https?://[^/\s"\x27?<>]+)[^\s"\x27<>]*}{$1/[url-path-stripped]}g;
  '
}

# perl alarm 頂硬上限(macOS 冇 GNU timeout)。用法:wlib_capped <sec> cmd args...
# (只殺直接子 process;要殺成個 process group 用 wlib_capped_pg)
wlib_capped() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@"; }

# L4:process group 級 timeout。喺自己新開嘅 pgid 入面行 cmd,逾時 kill -TERM/-KILL 呢個 pgid
# (只係自己起嘅 group,唔會掂其他 process)。stdin/stdout/stderr 照舊繼承。逾時 exit 124。
wlib_capped_pg() {
  perl -e '
    use POSIX qw(setsid :sys_wait_h);
    my $t = shift;
    my $pid = fork();
    die "fork" unless defined $pid;
    if ($pid == 0) { setsid(); exec @ARGV or exit 127; }
    my $timed = 0;
    local $SIG{ALRM} = sub { $timed = 1; kill "TERM", -$pid; select(undef,undef,undef,2); kill "KILL", -$pid; };
    alarm $t;
    waitpid($pid, 0); my $st = $?;
    alarm 0;
    # 收埋同 group 嘅殘餘(只限自己嘅 pgid)
    kill "KILL", -$pid if $timed;
    exit 124 if $timed;
    exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
  ' "$@"
}

wlib_now() { echo "${WATCH_NOW:-$(date +%s)}"; }
wlib_ts() { date -r "$(wlib_now)" '+%Y-%m-%d %H:%M' 2>/dev/null || date '+%Y-%m-%d %H:%M'; }

# ── 手機推送(STREAM-PHONE-NOTIFY-EXEC-20261015 §1;Telegram 經 openclaw)─────────────────
# conf:$WATCH_DIR/stream-notify.conf(prod = ~/.hymn-deploy/,600;opt-in:冇檔/缺欄 = 唔發)。只 grep 白名單 key,唔 source。
#   PHONE_CHANNEL= PHONE_ACCOUNT= PHONE_TARGET= [PHONE_RENOTIFY_SEC=21600]
# 🔴 PHONE_TARGET 值任何輸出/log 一律遮成 <target>(本 lib 唔印佢;log 內出現嘅 target 以 perl 遮走)。
# env override(測試):WATCH_PHONE_CMD(取代 openclaw 二進位)WATCH_PHONE_CONF WATCH_PHONE_LOG(log 檔)WATCH_PHONE_CAP(秒,預設 30)PHONE_DRY_RUN=1(加 --dry-run)
#   測試模式(STREAM_WATCH_TEST=1)而冇 WATCH_PHONE_CMD → 結構上唔發(return 1)。
# 失敗(rc≠0 / hang)只寫 stream-notify.log 一行,一律 return(唔 exit),唔影響 caller。
wlib_phone_conf_get() { # $1=KEY → 印值(白名單字元;冇/壞印空)
  local f="${WATCH_PHONE_CONF:-$WATCH_DIR/stream-notify.conf}" v
  [[ -f "$f" && ! -L "$f" ]] || return 0
  v="$(grep -E "^$1=" "$f" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")"
  [[ "$v" =~ ^[-A-Za-z0-9_:@.+]{1,64}$ ]] && printf '%s' "$v"
  return 0
}
wlib_phone_sanitize() { # stdin → stdout:保留換行(第三輪:白話分行訊息)、tab/CR→空格、剷其他控制字元/bidi/零寬、過密鑰 filter、截 400 字元
  perl -CSD -0777 -pe 's/[\r\t]+/ /g; s/\n{3,}/\n\n/g; s/[\x00-\x09\x0b-\x1f\x7f\x{85}\x{2028}\x{2029}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]//g' \
    | wlib_filter | perl -CSD -0777 -pe '$_ = substr($_, 0, 400)'
}
wlib_phone_mask() { # stdin → stdout:遮走 $1(target)同其數字核心
  PM_T="$1" perl -CSD -pe 'BEGIN{ $t=$ENV{PM_T}; ($d)=($t=~/(\d{5,})/); } if(length $t){ s/\Q$t\E/<target>/g; } if(length $d){ s/\Q$d\E/<target>/g; }'
}
# 用法:wlib_notify_phone <kind> <text>   kind=escalate|renotify|recover|ipchange|… (只入 log)。return 0=已送出 rc0;1=冇發/失敗
wlib_notify_phone() {
  local kind="${1:-msg}" text conf ch acct tgt cmd cap log rc t0 dt out args
  conf="${WATCH_PHONE_CONF:-$WATCH_DIR/stream-notify.conf}"
  [[ -f "$conf" && ! -L "$conf" ]] || return 1
  ch="$(wlib_phone_conf_get PHONE_CHANNEL)"; acct="$(wlib_phone_conf_get PHONE_ACCOUNT)"; tgt="$(wlib_phone_conf_get PHONE_TARGET)"
  [[ -n "$ch" && -n "$acct" && -n "$tgt" ]] || return 1
  cmd="${WATCH_PHONE_CMD:-}"
  if [[ -z "$cmd" ]]; then
    [[ "${STREAM_WATCH_TEST:-0}" == "1" ]] && return 1     # 測試模式冇 stub = 唔發
    cmd=/opt/homebrew/bin/openclaw
  fi
  cap="${WATCH_PHONE_CAP:-30}"; [[ "$cap" =~ ^[0-9]{1,4}$ ]] || cap=30
  log="${WATCH_PHONE_LOG:-$WATCH_DIR/stream-notify.log}"
  text="$(printf '%s' "${2:-}" | wlib_phone_sanitize)"
  [[ -n "$text" ]] || return 1
  args=(message send --channel "$ch" --account "$acct" --target "$tgt" -m "$text")
  [[ "${PHONE_DRY_RUN:-0}" == "1" ]] && args+=(--dry-run --json)   # dry-run 加 --json 先印 payload(驗收 to/channel/account)
  out="$(mktemp "${TMPDIR:-/tmp}/phonenotify.XXXXXX" 2>/dev/null)" || out=/dev/null
  t0=$(date +%s)
  wlib_capped_pg "$cap" "$cmd" "${args[@]}" >"$out" 2>&1 </dev/null; rc=$?
  dt=$(( $(date +%s) - t0 ))
  {
    printf '%s kind=%s rc=%s dur=%ss cap=%ss dry=%s len=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$kind" "$rc" "$dt" "$cap" "${PHONE_DRY_RUN:-0}" "${#text}"
    # rc≠0 或 dry-run 才記輸出(遮 target + 過 filter + 截 300);成功真發唔記輸出
    if [[ "$rc" != 0 || "${PHONE_DRY_RUN:-0}" == "1" ]]; then
      if [[ "$out" != /dev/null ]]; then head -c 1500 "$out" | tr -d '\000' | wlib_phone_mask "$tgt" | wlib_filter | tr '\n' ' ' | cut -c1-600 | sed 's/^/  out: /'; echo; fi
    fi
  } >> "$log" 2>/dev/null
  [[ "$out" != /dev/null ]] && rm -f "$out"
  [[ "$rc" == 0 ]]
}
