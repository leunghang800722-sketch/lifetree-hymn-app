#!/usr/bin/env bash
# T11:san()/ctl 剷字元測試(STREAM-HARDEN 1b/1d)。用法:t11-san.sh <scratchdir>
#  remedy.log 嗰格(san 輸出)byte 級驗:正控原樣保留(含 ZWJ 組合 emoji)、負控剷走六種 Unicode 危險字元、
#  被 cut 切爛嘅 UTF-8 原樣保留 + stderr 零輸出、冇 LANG + 150 個「串」→ 非空 ≤200 byte、escalate 端到端;
#  另核對 stream-diagnose.sh 解析器 ctl regex 同一名單(ZWJ U+200D 唔喺剷走名單)。
set -u
. "$(dirname "$0")/testlib.sh" "$@"
S="${1:?}/t11"; T="$(cd "$(dirname "$0")" && pwd)"; R="$T/../stream-remedy.sh"; DG="$T/../stream-diagnose.sh"
rm -rf "$S"; mkdir -p "$S/wd"
ENVB=(STREAM_WATCH_TEST=1 REMEDY_STATE="$S/rs.json" REMEDY_LOG="$S/remedy.log" WATCH_DIR="$S/wd" SELFHEAL_STATE="$S/sh.json" REMEDY_INCIDENT=t11)
FAILS=0
lastfield() { python3 - "$S/remedy.log" <<'PY'
import sys
l = open(sys.argv[1], 'rb').read().rstrip(b'\n').split(b'\n')[-1]
i = l.index(b'requested reason='); sys.stdout.buffer.write(l[i+len(b'requested reason='):])
PY
}
# esc <label> <reason-bytes-file> <expected-bytes-file> [env prefix words...]
esc() {
  local label="$1" rf="$2" ef="$3"; shift 3
  rm -f "$S/remedy.log" "$S/err"
  (cd / && env -u CLAUDECODE "$@" "${ENVB[@]}" "$R" escalate "$(cat "$rf")" >/dev/null 2>"$S/err"); local rc=$?
  lastfield > "$S/got"
  if cmp -s "$S/got" "$ef"; then echo "  PASS $label rc=$rc got=$(wc -c < "$S/got" | tr -d ' ')B stderr=$(wc -c < "$S/err" | tr -d ' ')B"
  else echo "  FAIL $label rc=$rc got(hex)=$(xxd -p "$S/got" | tr -d '\n') want(hex)=$(xxd -p "$ef" | tr -d '\n')"; FAILS=$((FAILS+1)); fi
}
mk() { printf "$1" > "$2"; }
echo "=== 正控:原樣保留 ==="
mk '✅ 串流監察恢復 — incident x 已恢復' "$S/r1"; cp "$S/r1" "$S/e1"; esc "✅ 串流監察恢復(byte 不變)" "$S/r1" "$S/e1"
mk '\xf0\x9f\x91\xa8\xe2\x80\x8d\xf0\x9f\x91\xa9\xe2\x80\x8d\xf0\x9f\x91\xa7' "$S/r2"; cp "$S/r2" "$S/e2"; esc "ZWJ 組合 emoji 👨‍👩‍👧(byte 不變)" "$S/r2" "$S/e2"
mk '🎵 👍🏽 ok' "$S/r3"; cp "$S/r3" "$S/e3"; esc "普通 emoji + skin tone" "$S/r3" "$S/e3"
echo "=== 負控:六種危險字元剷走(a<c>b → ab)==="
for pair in "U+202E:\\xe2\\x80\\xae" "U+2028:\\xe2\\x80\\xa8" "U+0085:\\xc2\\x85" "U+200B:\\xe2\\x80\\x8b" "U+2066:\\xe2\\x81\\xa6" "BOM(U+FEFF):\\xef\\xbb\\xbf"; do
  mk "a${pair#*:}b" "$S/r"; mk 'ab' "$S/e"; esc "${pair%%:*}" "$S/r" "$S/e"
done
echo "=== 切爛 UTF-8:a\\xe4\\xb8 原樣保留 + stderr 零輸出 ==="
mk 'a\xe4\xb8' "$S/r"; cp "$S/r" "$S/e"; esc "被 cut 切開嘅半個中文字" "$S/r" "$S/e"
[[ -s "$S/err" ]] && { echo "  FAIL stderr 非空"; FAILS=$((FAILS+1)); }
echo "=== 無 LANG(launchd 等效)+ 150 個「串」:非空、≤200 byte ==="
python3 -c "import sys;sys.stdout.buffer.write(b'a'+('串'.encode())*150)" > "$S/r"
LC_no_LANG=(-u LANG -u LC_ALL -u LC_CTYPE); LC_LC_ALL_C=(LC_ALL=C); LC_UTF_8=(LANG=en_US.UTF-8)
for lc in no-LANG LC_ALL=C UTF-8; do
  case "$lc" in no-LANG) LA=("${LC_no_LANG[@]}") ;; LC_ALL=C) LA=("${LC_LC_ALL_C[@]}") ;; *) LA=("${LC_UTF_8[@]}") ;; esac
  rm -f "$S/remedy.log" "$S/err"; (cd / && env -u CLAUDECODE "${LA[@]}" "${ENVB[@]}" "$R" escalate "$(cat "$S/r")" >/dev/null 2>"$S/err"); rc=$?
  lastfield > "$S/got"; line="$(python3 -c "import sys;l=open(sys.argv[1],'rb').read().rstrip(b'\n').split(b'\n')[-1];f=l.split(b' | ',4)[-1];print(len(f) if sys.argv[2]!='UTF-8' else len(f.decode('utf-8','replace')))" "$S/remedy.log" "$lc")"
  n=$(wc -c < "$S/got" | tr -d ' ')
  if [[ $n -gt 0 && $line -le 200 && ! -s "$S/err" ]]; then echo "  PASS $lc rc=$rc reason 格 ${n}B、result 整格 ${line}B(≤200,UTF-8 locale 以字元計、其餘以 byte 計)、stderr 空、request 檔=$([ -s "$S/wd/stream-escalate.request" ] && echo 有 || echo 冇)"
  else echo "  FAIL $lc rc=$rc reason 格 ${n}B、整格 ${line}B stderr=$(wc -c < "$S/err" | tr -d ' ')B"; FAILS=$((FAILS+1)); fi
done
echo "=== stream-diagnose.sh 解析器 ctl regex(從原檔抽出來實跑)==="
grep -m1 '^ctl = re.compile' "$DG" > "$S/ctl.py"
python3 - "$S/ctl.py" <<'PY'
import sys, re
src = open(sys.argv[1]).read()
ns = {'re': re}; exec(src.split('#')[0], ns); ctl = ns['ctl']
strip = {'U+0085': '\x85', 'U+2028': '\u2028', 'U+2029': '\u2029', 'U+200B': '\u200b', 'U+200C': '\u200c', 'U+200E': '\u200e', 'U+200F': '\u200f',
         'U+202A': '\u202a', 'U+202E': '\u202e', 'U+2066': '\u2066', 'U+2069': '\u2069', 'BOM': '\ufeff'}
keep = {'✅ 串流監察恢復': '✅ 串流監察恢復', 'ZWJ U+200D': '\u200d', 'ZWJ family 👨‍👩‍👧': '👨\u200d👩\u200d👧'}
bad = 0
for k, v in strip.items():
    ok = ctl.sub('', 'a' + v + 'b') == 'ab'; print('  %s %s 剷走' % ('PASS' if ok else 'FAIL', k)); bad += (not ok)
for k, v in keep.items():
    ok = ctl.sub('', v) == v; print('  %s %s 保留' % ('PASS' if ok else 'FAIL', k)); bad += (not ok)
sys.exit(1 if bad else 0)
PY
[[ $? -eq 0 ]] || FAILS=$((FAILS+1))
echo "=== 總結:FAILS=$FAILS ==="
[[ $FAILS -eq 0 ]]
