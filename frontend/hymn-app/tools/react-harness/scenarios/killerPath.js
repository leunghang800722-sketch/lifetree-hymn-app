// O1-O2-REPLAN-20260819.md §2.3 —— 「有 cache + version 冇變」嘅死因場景:
// Parent(對應 App.js AppContent)包住 Child(對應 MineScreen.js),兩個都直接
// call useCachedHymns()。React mount effects 由 child flush 去 parent,
// c9bd715 舊版度 child 嘅 kick effect 同步 broadcast 咗一次,but parent 嗰陣
// 重未訂閱到,之後 canSkip 令冇下一次 broadcast → parent 永久卡喺初始值。
import { setupDom, flushMicrotasks, makeFetchMock } from '../lib/testEnv.js';

setupDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { __harnessReset } = await import('../mocks/mmkvMock.js');
const { useCachedHymns } = await import('../.tmp/hooks/useCachedHymns.harness.js');

const HYMNS = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];

__harnessReset({
  allHymns: JSON.stringify(HYMNS),
  allHymnsVersion: 'v1',
});

global.fetch = makeFetchMock([
  ['http://harness.invalid/api/version', { dataVersion: 'v1' }], // 同 cache 版本一樣 → canSkip
  ['http://harness.invalid/api/hymns', { data: HYMNS, dataVersion: 'v1' }],
]);

const capture = { parent: null, child: null };

function Child() {
  capture.child = useCachedHymns();
  return null;
}
function Parent() {
  capture.parent = useCachedHymns();
  return React.createElement(Child, null);
}

const container = document.getElementById('root');
const root = createRoot(container);

await act(async () => {
  root.render(React.createElement(Parent, null));
});
await act(async () => {
  await flushMicrotasks();
});

const ok = !!capture.parent && capture.parent.hymns.length > 0 && capture.parent.loading === false
  && !!capture.child && capture.child.hymns.length > 0 && capture.child.loading === false;

console.log(JSON.stringify({ scenario: 'killerPath', ok, parent: capture.parent, child: capture.child }));

await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
