// Admin 寫入完成即刻刷新(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7):mount 完好耐
// 之後先發生嘅普通訂閱路徑,確保 notifyHymnsChanged() 會通知晒全部已訂閱
// 嘅 consumer(parent + child)。
import { setupDom, flushMicrotasks } from '../lib/testEnv.js';

setupDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { __harnessReset } = await import('../mocks/mmkvMock.js');
const { useCachedHymns, notifyHymnsChanged } = await import('../.tmp/hooks/useCachedHymns.harness.js');

const HYMNS_A = [{ id: 1, title: 'A' }];
const HYMNS_B = [{ id: 1, title: 'A-edited' }, { id: 2, title: 'B-new' }];

__harnessReset({}); // 冷開機,mount 完之後先 admin 改嘢

let hymnsCallCount = 0;
global.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('http://harness.invalid/api/version')) {
    return { ok: true, json: async () => ({ dataVersion: 'v1' }) };
  }
  if (u.startsWith('http://harness.invalid/api/hymns')) {
    hymnsCallCount += 1;
    const body = hymnsCallCount === 1
      ? { data: HYMNS_A, dataVersion: 'v1' }
      : { data: HYMNS_B, dataVersion: 'v2' };
    return { ok: true, json: async () => body };
  }
  return { ok: false, json: async () => ({}) };
};

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

const mountedOk = capture.parent?.hymns?.length === HYMNS_A.length && capture.child?.hymns?.length === HYMNS_A.length;

await act(async () => {
  notifyHymnsChanged('v2');
  await flushMicrotasks();
});

const ok = mountedOk
  && capture.parent?.hymns?.length === HYMNS_B.length
  && capture.child?.hymns?.length === HYMNS_B.length
  && capture.parent.hymns[1]?.title === 'B-new'
  && capture.child.hymns[1]?.title === 'B-new';

console.log(JSON.stringify({ scenario: 'notifyHymnsChanged', ok, mountedOk, parent: capture.parent, child: capture.child }));

await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
