# 「檢查新版本」in-app APK 更新提示 — 規劃(APP-UPDATE-CHECK-PLAN)

> 狀態:Eric 已批准(2026-08-08),Fable 5 規劃 → Sonnet 5 落地 → Opus 5 驗收 → deploy gate 上線。
> 背景:app 靠側載派 APK,冇 store 自動更新;現有 UpdateBanner 只覆蓋 EAS OTA(細更新)。大更新(新 APK)用戶零感知,要人手搵 link。今次補呢個窿。
> 紅線:**OTA 機制一啖都唔准郁**(Updates.useUpdates 嗰個 banner 照舊)。

## 1. 設計

### 1.1 Backend:version manifest
- **來源檔**:`backend/public/app-version.json`(同 app.apk 擺埋一齊,換 APK 時一齊更新),內容:
  ```json
  { "versionCode": 53, "versionName": "1.5.0", "url": "https://api.odemusics.com/downloads/app.apk" }
  ```
- **Endpoint**:`GET /api/app-version` — 讀呢個檔回 JSON,加 `Cache-Control: no-store`(唔好俾 CDN/瀏覽器 cache 住舊 manifest)。檔案唔存在/壞 JSON → 回 404,**唔准 crash**。
- **發佈配套**:新增 `ops/deploy/apk-publish.sh <apk路徑>`:核對 APK 存在 → cp 去 `backend/public/app.apk`(舊嗰隻自動 `.bak-<ver>-<date>`)→ 提示人手輸入/由參數收 versionCode+versionName → 寫 app-version.json → 印 md5。以後換 APK 一律行呢個 script,唔會again 換咗 APK 唔記得更新 manifest。

### 1.2 Frontend:檢查 + 提示
- **時機**:cold start 完成初始 render 之後(唔阻塞開 app),fetch `${API_BASE}/api/app-version`,timeout 8s,**任何失敗靜默**(斷網/404/壞 JSON 一律當冇更新)。
- **比較**:`manifest.versionCode > Number(Constants.nativeBuildVersion)` 先算有新版。⚠️ 必須用 `nativeBuildVersion`(二進制 versionCode)——唔准用 `Constants.expoConfig.version`,因為 OTA 會令 JS 版本先行於二進制,用 JS 版會誤判。
- **UI**:重用現有 UpdateBanner 嘅視覺/位置 pattern(flow 排喺 TabBar 之前,**唔准 absolute**——App.js 2570 行嗰段註釋講咗撞過遮 tab 掣)。文案:「有新版本 vX.X.X,撳一下下載安裝」。撳 → `Linking.openURL(manifest.url)`(瀏覽器落 APK,Android 會引導安裝;大更新冇得全靜默,呢個係系統限制)。
- **兩個 banner 撞期**:OTA banner(isUpdatePending)優先;OTA banner 顯示緊就唔出 APK banner(OTA 撳一下即完成,體驗好過叫人落 APK)。
- **頻率/騷擾控制**:每次 cold start 檢查一次;用戶撳 ✕(dismiss)後同一 session 唔再出,下次 cold start 再出(mmkv 唔使記,keep simple)。foreground 切返嚟唔重查(避免煩)。
- **位置**:同 UpdateBanner 並列做一個 `ApkUpdateBanner` component(App.js 內或独立檔),邏輯 hook 化。

### 1.3 明確唔做
- 唔做強制更新/最低版本封鎖(冇需求)。
- 唔做 runtime-2(舊 God Music APK)backport OTA——技術上可以令舊用戶都收到「有新版本」提示,但要由 pre-rebrand commit 開分支另推 runtime-2 OTA,同 Q4「唔推 rebrand OTA」決策有張力,**留俾 Eric 另決**(見 §4)。
- 唔郁 EAS OTA 機制、唔郁 UpdateBanner。

## 2. 驗收要點(Opus)
1. Manifest endpoint:兩域都 200、no-store header、JSON 啱;檔案剷走時 404 唔 crash。
2. 無新版(manifest 53 = 裝機 53):**冇 banner**。
3. 有新版(manifest 暫時較做 54 測試):banner 出現、文案啱、撳落開瀏覽器去落 APK;dismiss 後今 session 唔再出;cold start 再出。**測完即刻較返 53 並確認 banner 消失**。
4. OTA banner 優先:isUpdatePending 時唔會兩條 banner 疊。
5. 斷網/endpoint 死:app 正常開,零 error UI,logcat 零 FATAL。
6. OTA 機制冇被郁到(diff 核對 UpdateBanner/Updates 相關 code 零改動)。
7. `apk-publish.sh`:dry 行一次核對行為(backup/manifest/md5)。

## 3. 上線
- 前端:純 JS → gate approve ota → `ota-publish.sh`(runtime 3)。
- Backend:gate approve backend → `backend-restart.sh`。
- 初始 manifest:versionCode 53(= 現行 APK),即上線後冇人會見到 banner,直到下次出新 APK——正確行為。

## 4. runtime-2 backport — ❌ 唔做(Eric 拍板 2026-08-08)
原本諗住舊 God Music APK 用戶可能要 backport 一個「有新版本」提示 OTA;Eric 確認**而家得佢一個人裝咗 app,冇其他用戶**,所以唔使做,維持本 plan 原範圍。如果日後真係有一批舊 APK 用戶先再議。

## 5. 第二輪修正記錄(2026-08-08,Sonnet 5 落地,等 Opus 驗收)

### 5.1 致命 bug:`Constants.nativeBuildVersion` 已喺 expo-constants 56 剷走
Opus 驗收發現 §1.2 嗰句「比較用 `Constants.nativeBuildVersion`」喺 expo-constants
56 已經失效——呢個 field 已經由套件剷走(types 淨返 deprecation 註解),runtime
讀到嘅係 `undefined`。`Number(undefined)` = `NaN`,`Number.isFinite` guard 令
比較永遠 false,banner **永遠唔會觸發**,成個 feature 靜默失效。

**修法**:改用 `expo-application` 嘅同名 field(`Application.nativeBuildVersion`)。
但⚠️出街緊嗰隻 APK(53)冇 embed 呢個 native module——如果直接 top-level
`import * as Application from 'expo-application'`,module import 果吓就會
throw,一推呢個修正做 OTA(runtime 3),現役 app 即刻死。所以 `App.js` 改用
**guarded require**(唔用 top-level import):

```js
let _nativeBuildVersion = null;
try {
  _nativeBuildVersion = require('expo-application').nativeBuildVersion;
} catch (e) {
  // native module 未存在(現役 APK 53)—— 靜默
}
```

比較嗰句都要留神:`_nativeBuildVersion` 喺 guard 失敗時係 `null`,而
`Number(null) === 0`(**唔係 `NaN`**!)—— 如果照舊直接 `Number(_nativeBuildVersion)`,
`installedCode` 會變成 `0`,任何 `remoteCode > 0` 都會誤判有更新,喺 APK 53
上彈出 banner。要顯式將 `null`/`undefined` 導去 `NaN`:
`_nativeBuildVersion != null ? Number(_nativeBuildVersion) : NaN`。

效果:APK 53(冇 expo-application native module)靜默唔出 banner,冇 crash;
下一隻含 expo-application 嘅 APK 上,banner 正常運作。

**下一隻 APK 出貨 checklist**(留俾監督 session 執行,呢輪修正**冇郁呢啲**):
1. `app.json` runtimeVersion `"3"` → `"4"`。
2. Android `versionCode` bump 去 54(即 build.gradle,build 前執行)。
3. Build release APK,行 `ops/deploy/apk-publish.sh <apk> 54 <versionName>` 換上去。
4. 之後可以拆走上面 guarded require,改返用正常 top-level import(因為所有
   仲用緊嘅 APK 已經有 expo-application native module)。

### 5.2 `ops/deploy/apk-publish.sh` 參數保護 —— 事故已還原
Opus 驗收期間親身踩中:`apk-publish.sh <apk> 54 --dry-run` 漏咗 versionName,
舊版 script 攞「頭 3 個 arg」做位置參數,`--dry-run` 被當成 versionName 食咗,
`DRY_RUN` 永遠冇被設做 1,**變咗真執行**,換走咗 prod 嘅 `backend/public/app.apk`。
事故已即時發現並還原(舊 APK backup 喺 `app.apk.bak-v1.1.0-20260808`)。

修法:
1. 改做「先掃一次全部 arg,`--` 開頭嘅一律當 flag 抽走,淨返先當位置參數」;
   位置參數數量唔啱好 3 個就直接 abort(唔會再靜默錯配)。
2. `versionName` 加格式檢查,拒絕以 `--` 開頭(防守性,理論上唔會再發生,但
   留返呢層)。
3. 次序改做 atomic:manifest 先寫去 temp 檔 → APK cp 成功 → 先 `mv` temp
   manifest 落實際位置(`mv` 係同 filesystem 上嘅 atomic rename)。中途
   (例如 cp 果吓)fail 唔會再留低「新 APK + 舊 manifest」呢種唔一致組合;
   trap 保證失敗時清埋 temp 檔。
4. Backup 檔名由 `app.apk.bak-<版本>-<日期>` 加返時分秒
   (`app.apk.bak-<版本>-<日期>-<時分秒>`)——同一日重行唔會覆蓋上一次嘅
   backup。

呢四項已用 fake repo(scratchpad,唔郁真 `backend/public/`)逐個錯誤 case
驗過,包括原句照打一次重現 Opus 個事故(而家會被正確 abort)。

### 5.3 backend 三個 pre-existing 修正(`backend/server.js`)
1. **動態 APK 檔名**:`/downloads/app.apk` 同 `/app.apk` 嘅
   `Content-Disposition` 以前寫死 `hymn-app-v1.3.0-week2.apk`(rebrand 前、
   W2 個陣殘留),同實際版本完全脫節。改由 `app-version.json` 讀
   `versionName` 動態砌(例 `Ode-v1.5.0.apk`),manifest 讀唔到/壞 JSON 就
   fallback `Ode.apk`。
2. APK 下載兩條 route 加 `Cache-Control: no-store`——換新 APK 後 Cloudflare
   之前會 cache 住舊版 4 個鐘,用戶落到舊版又會再觸發 update banner,同新
   推嘅 APK 形成死循環。
3. 剷走 `app.use('/downloads', express.static('public'))`——呢句令
   `backend/public/` 成個目錄任何檔案(包括 `.bak-*` 歷史 APK)都可以由
   `/downloads/<檔名>` 直接公開讀取。剷走後 `/downloads/` 淨係識派
   `/downloads/app.apk` 呢條專屬 route,其他一律 404。已 grep 全 repo 確認
   冇其他地方依賴 `/downloads/` 底下 app.apk 以外嘅檔案(分享頁/邀請文案
   全部指返 `/downloads/app.apk`)。

三項已用臨時 port(39281)起真 `server.js`驗過:filename 動態砌啱、兩條
APK route 都有 `no-store`、`/downloads/app-version.json`(以前 static mount
會派到)而家 404、`/api/app-version` 本身不受影響。
