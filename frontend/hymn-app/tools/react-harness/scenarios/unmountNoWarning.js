// Unmount 之後先到嘅 broadcast 唔應該 throw / 印 React 「setState on
// unmounted component」warning —— uSES 嘅 subscribe cleanup 會自動喺
// unmount 嗰陣攞走個 listener,所以 unmount 之後 store 入面應該已經冇
// 呢兩個 consumer 嘅 listener 至啱。
import { setupDom, flushMicrotasks, makeFetchMock } from '../lib/testEnv.js';

setupDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { __harnessReset } = await import('../mocks/mmkvMock.js');
const { useCachedHymns, notifyHymnsChanged } = await import('../.tmp/hooks/useCachedHymns.harness.js');

const HYMNS = [{ id: 1, title: 'A' }];

__harnessReset({
  allHymns: JSON.stringify(HYMNS),
  allHymnsVersion: 'v1',
});

global.fetch = makeFetchMock([
  ['http://harness.invalid/api/version', { dataVersion: 'v1' }],
  ['http://harness.invalid/api/hymns', { data: HYMNS, dataVersion: 'v2' }],
]);

const errors = [];
const originalConsoleError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };

let thrown = null;

function Child() {
  useCachedHymns();
  return null;
}
function Parent() {
  useCachedHymns();
  return React.createElement(Child, null);
}

const container = document.getElementById('root');
const root = createRoot(container);

try {
  await act(async () => {
    root.render(React.createElement(Parent, null));
  });
  await act(async () => {
    await flushMicrotasks();
  });

  await act(async () => {
    root.unmount();
  });

  // Unmount 之後先觸發一次同步+一次網絡 broadcast,兩者理論上都應該搵唔到
  // listener(0 consumer),唔會 throw。
  notifyHymnsChanged('v2');
  await flushMicrotasks();
} catch (e) {
  thrown = e;
} finally {
  console.error = originalConsoleError;
}

const ok = !thrown && errors.length === 0;

console.log(JSON.stringify({ scenario: 'unmountNoWarning', ok, thrown: thrown ? String(thrown) : null, errors }));

process.exit(ok ? 0 : 1);
