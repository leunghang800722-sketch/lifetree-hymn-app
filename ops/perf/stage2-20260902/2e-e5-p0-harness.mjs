// E-5 P0 正控 —— 模擬 MMKV,直接驗證 useCachedHymns.js 兩條分支嘅
// canSkip 判斷(cachedVersion 讀返嚟嗰句同 refresh() 入面嘅
// `hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion`
// 一字不易抄過嚟)。
//
// 場景:第一次開機成功 merge(allHymnsVersion='v1')。第二次開機 lyrics fetch
// 失敗,但 DB 版本冇變(serverVersion 仍然係 'v1')。
//   WITHOUT fix(舊碼,唔 delete):cachedVersion 仍然讀到 'v1' → canSkip=true
//     → 永久卡喺 lite-only,冇歌詞。
//   WITH fix(而家,失敗時 s.delete('allHymnsVersion')):cachedVersion 變
//     undefined/null → canSkip=false → 落次會再全套嘗試一次。
function makeMockMMKV() {
  const map = new Map();
  return {
    set(k, v) { map.set(k, v); },
    getString(k) { return map.has(k) ? map.get(k) : undefined; },
    delete(k) { map.delete(k); },
  };
}

function canSkip(hadCache, serverVersion, cachedVersion) {
  return !!(hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion);
}

function simulate({ withFix }) {
  const s = makeMockMMKV();

  // 第一次開機:成功 merge。
  s.set('allHymns', JSON.stringify([{ id: 1, lyrics: 'x' }]));
  s.set('allHymnsVersion', 'v1');

  // 第二次開機:讀 cache。
  const hadCache = true;
  const cachedVersionAtStart = s.getString('allHymnsVersion') || null;

  // ...lite fetch 成功,lyrics fetch 失敗(斷網/逾時)。
  s.set('allHymns', JSON.stringify([{ id: 1 }])); // lite-only,冇 lyrics
  if (withFix) {
    s.delete('allHymnsVersion'); // E-5 P0 修法
  }
  // (withFix=false 就完全唔郁 allHymnsVersion,模擬修之前嘅碼)

  // 第三次開機:DB 版本冇變,serverVersion 仍然係 'v1'。
  const serverVersionNextBoot = 'v1';
  const cachedVersionNextBoot = s.getString('allHymnsVersion') || null;
  const skip = canSkip(hadCache, serverVersionNextBoot, cachedVersionNextBoot);

  return { cachedVersionAtStart, cachedVersionAfterFail: s.getString('allHymnsVersion'), canSkipNextBoot: skip };
}

const withoutFix = simulate({ withFix: false });
const withFix = simulate({ withFix: true });

console.log(JSON.stringify({ withoutFix, withFix }, null, 2));

let fail = false;
if (!(withoutFix.cachedVersionAfterFail === 'v1' && withoutFix.canSkipNextBoot === true)) {
  console.error('FAIL: 舊碼(冇 delete)理應留低 stale v1 並且 canSkip=true(呢個先係要修嘅 bug)');
  fail = true;
}
if (!(withFix.cachedVersionAfterFail === undefined && withFix.canSkipNextBoot === false)) {
  console.error('FAIL: 修法(delete)理應令 allHymnsVersion 變 undefined,canSkip=false(落次會重試)');
  fail = true;
}
console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS(bug 重現 + 修法生效,兩者都證明咗)');
process.exit(fail ? 1 : 0);
