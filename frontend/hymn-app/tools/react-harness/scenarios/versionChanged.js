// version 有變:MMKV 舊 cache(v0)+ server 話而家係 v1。MMKV 快 broadcast
// (child 先訂閱到)+ 網絡慢 broadcast(兩邊都訂閱好先到)—— 兩次都經
// setState,理論上兩個時序都冇窗口(§2.3 逐步推演)。
import { setupDom, flushMicrotasks, makeFetchMock } from '../lib/testEnv.js';

setupDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { __harnessReset } = await import('../mocks/mmkvMock.js');
const { useCachedHymns } = await import('../.tmp/hooks/useCachedHymns.harness.js');

const OLD_HYMNS = [{ id: 1, title: 'Old A' }];
const NEW_HYMNS = [{ id: 1, title: 'New A' }, { id: 2, title: 'New B' }];

__harnessReset({
  allHymns: JSON.stringify(OLD_HYMNS),
  allHymnsVersion: 'v0',
});

global.fetch = makeFetchMock([
  ['http://harness.invalid/api/version', { dataVersion: 'v1' }], // 唔同 cache 版本 → canSkip=false
  ['http://harness.invalid/api/hymns', { data: NEW_HYMNS, dataVersion: 'v1' }],
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

const ok = !!capture.parent && capture.parent.hymns.length === NEW_HYMNS.length && capture.parent.loading === false
  && !!capture.child && capture.child.hymns.length === NEW_HYMNS.length && capture.child.loading === false;

console.log(JSON.stringify({ scenario: 'versionChanged', ok, parent: capture.parent, child: capture.child }));

await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
