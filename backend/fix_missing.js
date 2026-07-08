const { execFileSync } = require('child_process');
const path = require('path');

const MISSING = [
  { artist:'ACM', q:'ACM 讚美我父', title:'讚美我父', cat:'粵語' },
  { artist:'玻璃海', q:'玻璃海 祢是我的盾牌', title:'祢是我的盾牌', cat:'粵語' },
  { artist:'基恩敬拜', q:'基恩敬拜 我要歌頌讚美祢', title:'我要歌頌讚美祢', cat:'粵語' },
  { artist:'角聲使團', q:'角聲使團 主我高舉你的名', title:'主我高舉你的名', cat:'粵語' },
];

function searchOne(query) {
  const js = [
    'const yt = require("yt-search");',
    'new Promise((r, x) => {',
    '  const t = setTimeout(() => x(new Error("timeout")), 6000);',
    `  yt.search({ query: ${JSON.stringify(query)}, pageStart: 1, pageEnd: 1 })`,
    '    .then(v => { clearTimeout(t); r(JSON.stringify(v?.videos?.slice(0, 5).map(x => ({ id: x.videoId, secs: x.duration?.seconds })) || [])); })',
    '    .catch(e => { clearTimeout(t); x(e); });',
    '}).then(console.log).catch(() => console.log("[]"));',
  ].join('\n');

  try {
    const out = execFileSync('node', ['-e', js], {
      encoding: 'utf-8', timeout: 10000, cwd: __dirname, maxBuffer: 1024 * 1024,
    });
    const lines = out.trim().split('\n').filter(l => l.startsWith('['));
    if (!lines.length) return null;
    const data = JSON.parse(lines[lines.length - 1]);
    for (const v of data) {
      if (!v?.id || !v?.secs || v.secs < 120 || v.secs > 600) continue;
      const m = Math.floor(v.secs / 60);
      const s = String(v.secs % 60).padStart(2, '0');
      return { vid: v.id, dur: `${m}:${s}` };
    }
  } catch (e) {}
  return null;
}

async function main() {
  for (const m of MISSING) {
    const v = searchOne(m.q);
    if (v) {
      console.log(`✅ ${m.artist} - ${m.title} => ${v.vid} ${v.dur}`);
    } else {
      console.log(`❌ ${m.artist} - ${m.title} => NOT FOUND`);
    }
  }
}
main().catch(e => console.error(e));
