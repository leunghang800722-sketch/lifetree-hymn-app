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
