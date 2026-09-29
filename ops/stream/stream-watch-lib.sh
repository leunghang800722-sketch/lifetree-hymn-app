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
