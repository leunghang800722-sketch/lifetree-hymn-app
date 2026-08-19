// 冷開機冇 cache:唯一 broadcast 喺網絡返嚟之後,兩邊(parent/child)早已
// 訂閱好,呢個場景本身冇 race —— 用嚟確保新設計冇喺呢條路徑度整壞嘢
// (regression safety net,唔係死因場景本身)。
import { setupDom, flushMicrotasks, makeFetchMock } from '../lib/testEnv.js';

setupDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { __harnessReset } = await import('../mocks/mmkvMock.js');
const { useCachedHymns } = await import('../.tmp/hooks/useCachedHymns.harness.js');

const HYMNS = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, title: 'C' }];

__harnessReset({}); // 冇 allHymns / allHymnsVersion

global.fetch = makeFetchMock([
  ['http://harness.invalid/api/version', { dataVersion: 'v1' }],
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

const ok = !!capture.parent && capture.parent.hymns.length === HYMNS.length && capture.parent.loading === false
  && !!capture.child && capture.child.hymns.length === HYMNS.length && capture.child.loading === false;

console.log(JSON.stringify({ scenario: 'coldBootNoCache', ok, parent: capture.parent, child: capture.child }));

await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
