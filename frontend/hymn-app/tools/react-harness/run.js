import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUseCachedHymns } from './lib/prepareSource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCENARIOS = [
  'killerPath.js',        // §2.3 死因場景 —— 硬性驗收:c9bd715 必須紅,新設計必須綠
  'coldBootNoCache.js',
  'versionChanged.js',
  'notifyHymnsChanged.js',
  'unmountNoWarning.js',
];

const { outPath, srcPath, changedLines } = prepareUseCachedHymns();
console.log(`[prepareSource] 已複製 ${srcPath}`);
console.log(`[prepareSource] → ${outPath}`);
console.log(`[prepareSource] sed diff 行號: ${changedLines.join(', ')}`);
console.log('');

const results = [];
for (const scenario of SCENARIOS) {
  const scenarioPath = join(__dirname, 'scenarios', scenario);
  const proc = spawnSync(process.execPath, [scenarioPath], {
    encoding: 'utf8',
    cwd: __dirname,
  });
  const pass = proc.status === 0;
  results.push({ scenario, pass, stdout: proc.stdout, stderr: proc.stderr });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${scenario}`);
  if (proc.stdout.trim()) console.log('  ' + proc.stdout.trim());
  if (!pass && proc.stderr.trim()) console.log('  stderr:\n' + proc.stderr.trim().split('\n').map((l) => '    ' + l).join('\n'));
}

console.log('');
const failed = results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log(`結果:${results.length - failed.length}/${results.length} 過,${failed.length} 個 fail`);
  process.exit(1);
} else {
  console.log(`結果:全部 ${results.length} 個場景過`);
  process.exit(0);
}
