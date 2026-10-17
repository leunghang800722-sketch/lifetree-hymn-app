# react-harness

`O1-O2-REPLAN-20260819.md` §6.2 拍板:呢個係 `src/hooks/useCachedHymns.js`(同
佢用嘅 `src/hooks/externalStore.js`)嘅 reconciler-level 回歸測試,喺 Node 用
`react-dom/client` + `jsdom` 起真 React reconciler,唔使裝置/emulator 就可以
30 秒重跑做 gate。

## 點解要有呢樣嘢

`useCachedHymns` 出過一次 P0 revert(`c9bd715` → `4f8b369`):兩個 consumer
(`App.js` AppContent + `MineScreen.js`)喺同一個 commit mount,舊版「用
`useState` 影一份 snapshot + `useEffect` 補訂閱」嘅 pattern 喺 render 同
effect 之間有窗口,child 嘅同步 broadcast 跌咗入呢個窗口,parent 訂閱遲咗
→ 永久卡喺初始值(首頁永久轉圈)。呢類時序 bug 靜態 review 睇唔出,要真
reconciler 跑先見到。詳細根因分析見 `O1-O2-REPLAN-20260819.md` §2.1/§2.3。

## 點跑

```bash
cd frontend/hymn-app/tools/react-harness
npm install   # 得 jsdom 一個 dev dep;react/react-dom 直接 require 上層 app 嘅 node_modules
npm test
```

`npm test` 會:
1. 運行時複製 `../../src/hooks/useCachedHymns.js`,sed 改兩條 import 做
   MMKV mock / config stub(見下面「維護紀律」),寫入 `.tmp/hooks/`
   (gitignored,唔會 commit)。
2. 逐個場景用 `react-dom/client` + `jsdom` render 真 component tree,
   斷言 hook 回傳嘅 `{hymns, loading}`。
3. 印晒每個場景 PASS/FAIL,任何一個 fail 就 `process.exit(1)`。

## Cover 咩場景(`scenarios/`)

| 場景 | 對應死因 |
|---|---|
| `killerPath.js` | §2.3 —— 有 cache + version 冇變,parent 包 child 兩個都直接用 hook。**呢個係硬性驗收場景**:必須對 `c9bd715` 舊版跑到紅,對新設計跑到綠。 |
| `coldBootNoCache.js` | 冷開機冇 cache,唯一 broadcast 喺網絡返嚟之後,兩邊早已訂閱好 —— regression safety net,唔係死因本身。 |
| `versionChanged.js` | MMKV 快 broadcast + 網絡慢 broadcast 兩次都經 setState,理論上冇窗口。 |
| `notifyHymnsChanged.js` | Admin 寫入完即刻刷新路徑,mount 完好耐先發生。 |
| `unmountNoWarning.js` | Unmount 之後先到嘅 broadcast 唔應該 throw / warn。 |

## 紅→綠驗收流程(一次性,證明 harness 捉得到 bug)

呢個唔係日常跑法,係執行 O2 嗰次要留底嘅證據:

```bash
# 紅:對住 c9bd715 嘅舊版 useCachedHymns.js 跑,killerPath 必須 FAIL
HARNESS_SOURCE_DIR=/path/to/c9bd715-checkout/frontend/hymn-app/src/hooks node run.js

# 綠:對住而家(新設計)嘅 src/hooks/ 跑,全部場景必須 PASS
node run.js
```

`HARNESS_SOURCE_DIR` 環境變數覆蓋 `prepareSource.js` 預設嘅
`../../src/hooks`(即係而家嘅源碼),指去一個包含 `useCachedHymns.js`
嘅目錄。

## 維護紀律(改呢個目錄或者 `useCachedHymns.js` 之前要知)

- `run.js` **每次都由 `src/hooks/useCachedHymns.js` 讀現行源碼**,唔准喺
  `tools/react-harness/` 底下 commit 一份手抄/過時嘅 copy —— 呢份 harness
  永遠測緊「而家嘅 code」。
- `lib/prepareSource.js` 淨係准許改兩條 import 行(MMKV → mock、
  `../config.js` → stub)。改完會 diff 返新舊版本,**如果改咗嘅行數唔係
  剛好 2 行,`prepareUseCachedHymns()` 會 throw**,擋住未來源碼改咗 import
  寫法之後呢度靜靜哋冇 patch 中。
- 場景 fail 會令 `run.js` `process.exit(1)`,可以直接當 CI/pre-commit gate
  用。
- `.tmp/` 係運行時產物,`.gitignore` 咗,唔會入 repo。
