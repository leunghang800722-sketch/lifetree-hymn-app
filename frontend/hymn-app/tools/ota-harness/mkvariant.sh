#!/bin/zsh
# Build one OTA-shaped bundle from a given App.js, with N injected updateOptions failures.
#   mkvariant.sh <App.js source> <failCount> <outName>
set -e
S=/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/2e9ba92c-2d46-4980-ac59-b1d1a374307e/scratchpad
W=$S/wt-fix/frontend/hymn-app
SRC="$1"; FAIL="$2"; NAME="$3"
HC=/Users/macbookpro/.openclaw/workspace/hymn-app/frontend/hymn-app/node_modules/hermes-compiler/hermesc/osx-bin/hermesc

python3 - "$SRC" "$W/App.js" "$FAIL" <<'PY'
import sys
src, dst, fail = sys.argv[1], sys.argv[2], int(sys.argv[3])
s = open(src).read()
inject = (
  "\n// ==== DIAG (harness only, never committed) ====\n"
  f"let __diagFail = {fail};\n"
  "const __diagUpdateOptions = (o) => (__diagFail-- > 0\n"
  "  ? Promise.reject(new Error('DIAG injected updateOptions failure'))\n"
  "  : TrackPlayer.updateOptions(o));\n"
  "// ==== /DIAG ====\n"
)
# put the helper after the final top-level import line
lines = s.split('\n')
last_import = max(i for i, l in enumerate(lines) if l.startswith('import ') or l.startswith('} from'))
lines.insert(last_import + 1, inject)
s = '\n'.join(lines)
n = s.count('TrackPlayer.updateOptions(')
# the helper itself contains one occurrence — replace only the call sites
s = s.replace('await TrackPlayer.updateOptions(', 'await __diagUpdateOptions(')
open(dst, 'w').write(s)
print(f'  injected fail={fail}, call sites patched (found {n} occurrences of TrackPlayer.updateOptions()')
PY

cd $W
npx expo export:embed --platform android --dev false --entry-file index.js \
  --bundle-output $S/v-$NAME.js --assets-dest $S/v-$NAME-assets >/dev/null 2>&1
$HC -emit-binary -O -g0 -out $S/v-$NAME.hbc $S/v-$NAME.js 2>/dev/null

rm -rf $S/exp-$NAME
mkdir -p $S/exp-$NAME/_expo/static/js/android $S/exp-$NAME/assets
cp $S/v-$NAME.hbc $S/exp-$NAME/_expo/static/js/android/index-$NAME.hbc
cp $S/exp-head/assets/* $S/exp-$NAME/assets/
cat > $S/exp-$NAME/metadata.json <<EOF
{"version":0,"bundler":"metro","fileMetadata":{"android":{"bundle":"_expo/static/js/android/index-$NAME.hbc","assets":[{"path":"assets/4e85bc9ebe07e0340c9c4fc2f6c38908","ext":"ttf"},{"path":"assets/a8c43a420812aa403c2b379a35f9a8de","ext":"png"},{"path":"assets/2815c31a39c0adb4a8a3490c0dd34c8b","ext":"png"}]}}}
EOF
echo "built exp-$NAME ($(stat -f%z $S/v-$NAME.hbc) bytes)"
