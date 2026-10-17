#!/usr/bin/env bash
# T10 / C-5:stream-remedy.sh 嘅 `#!/bin/bash -p` 令 SHELLOPTS/PS4、BASH_ENV 唔生效;負控=舊 shebang 副本(marker 會出現)。
# 另驗 REMEDY_ENGINE=ai 只准六個動作。全部 STREAM_WATCH_TEST=1 + scratch(REMEDY_DRY_RUN=1)。用法:t10-shebang-p.sh <scratchdir>
set -u
. "$(dirname "$0")/testlib.sh" "$@"   # STREAM-HARDEN §2.3:硬防呆(必須 source;第一個參數=scratch)
S="${1:?}/t10"; T="$(cd "$(dirname "$0")" && pwd)"; R="$T/.."
rm -rf "$S"; mkdir -p "$S/old/ops/stream" "$S/wd"
cp "$R/stream-remedy.sh" "$R/stream-watch-lib.sh" "$S/old/ops/stream/"; sed -i '' '1s|.*|#!/usr/bin/env bash|' "$S/old/ops/stream/stream-remedy.sh"
printf 'touch %s/marker-bashenv\n' "$S" > "$S/evil.sh"
export STREAM_WATCH_TEST=1 REMEDY_STATE="$S/wd/rs.json" REMEDY_LOG="$S/wd/r.log" WATCH_DIR="$S/wd" REMEDY_DRY_RUN=1
echo "shebang: new=$(head -1 "$R/stream-remedy.sh")  old(負控副本)=$(head -1 "$S/old/ops/stream/stream-remedy.sh")"
for which in new old; do
  [[ $which == new ]] && X="$R/stream-remedy.sh" || X="$S/old/ops/stream/stream-remedy.sh"
  rm -f "$S"/marker-xtrace "$S"/marker-bashenv
  env SHELLOPTS=xtrace PS4="\$(touch $S/marker-xtrace)" "$X" wait >/dev/null 2>&1; echo "$which SHELLOPTS=xtrace PS4='\$(touch marker)' rc=$? marker: $([[ -e $S/marker-xtrace ]] && echo PRESENT || echo ABSENT)"
  env BASH_ENV="$S/evil.sh" "$X" wait >/dev/null 2>&1; echo "$which BASH_ENV=evil.sh rc=$? marker: $([[ -e $S/marker-bashenv ]] && echo PRESENT || echo ABSENT)"
done
for a in wait drill-restart bogus; do REMEDY_ENGINE=ai "$R/stream-remedy.sh" $a >/dev/null 2>"$S/err"; echo "REMEDY_ENGINE=ai $a rc=$? $(head -c 100 "$S/err")"; done
