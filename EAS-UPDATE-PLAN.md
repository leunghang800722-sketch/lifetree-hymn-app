# EAS Update（OTA）實作計劃

> 2026-07-27 Fable 5 規劃，等 Dispatch 指示 Sonnet 落地。
> 目標：JS/UI 改動可以 over-the-air 推去用戶部機，唔使每次重新 build APK 手動裝。
> Eric 已拍板要做（背景：`runtimeVersion: none` = 冇 OTA，Eric 裝咗舊 APK 睇唔到新改動）。

---

## 〇、現況（規劃時查證過）

| 項目 | 現況 |
|---|---|
| Expo SDK | 56（`expo ~56.0.8`，RN 0.85.3） |
| Workflow | **Bare**：`android/`、`ios/` 係 checked-in native project，唔係 CNG/prebuild 管理 |
| Build 方式 | 本地 `gradlew assembleRelease` 出 APK（見 `HYMN-APP-IRON-RULES.md`），**完全冇用 EAS Build** |
| 派發方式 | APK copy 去 `~/Desktop/詩歌App/`，手動 sideload（冇 Play Store） |
| expo-updates | **未裝**（package.json 冇） |
| eas.json | **冇** |
| Expo/EAS 帳號 | 未確認有——係前置條件，見下面「Eric 要做嘅嘢」 |
| app.json | `version: 1.3.8`、`versionCode: 49`、冇 `updates`/`runtimeVersion`/`extra.eas.projectId` |

因為係 bare + 本地 gradle build（唔行 EAS Build），接入方式同一般教學唔同：
config 要落埋 native file（AndroidManifest / strings.xml），channel 亦要手動寫死。

---

## 一、決策（Fable 5 建議，保守優先）

### 1. runtimeVersion：**明文 string，由 `"1"` 開始**

- 唔用 `appVersion`/`sdkVersion`/`fingerprint` policy：
  - bare project 嘅 native file 入面本身就要一個實實在在嘅 string（`strings.xml` 嘅 `expo_runtime_version`），policy 喺呢個 setup 度靠 prebuild 先解得出，我哋唔行 prebuild（紅線，見下）。
  - `appVersion` policy 仲會同而家「每次出 build bump version」嘅習慣相沖——每個 APK 版本自成一個 runtime，OTA 推唔到落舊 APK，成個機制廢咗。
  - `fingerprint` 喺共用 worktree、native 目錄成日有雜項改動嘅環境下會靜靜哋分裂 runtime，舊 APK 收唔到更新都冇人知。
- 明文 string 嘅安全性：OTA 更新只會派俾 **runtimeVersion 完全相同**嘅 APK。native 改咗就 bump 個數字（`"1"`→`"2"`），舊 APK 自動收唔到新 update——**最壞情況係用戶停留喺舊 JS，唔會 crash**。呢個 fail-safe 方向啱 Eric（非技術用戶）。
- 鐵律：**runtimeVersion 喺 app.json 同 `android/app/src/main/res/values/strings.xml` 兩度都要一致**，bump 嗰陣兩邊一齊改。

### 2. 檢查時機：**預設靜默 + 已下載提示**

- 保留 expo-updates 預設：`checkAutomatically: ON_LOAD`（每次冷啟動背景 check + 下載），`fallbackToCacheTimeout: 0`（唔阻開 app，即刻入 app）。下載完嘅 update 下次冷啟動自動生效。
- 加一個好薄嘅 UI 層（用 `Updates.useUpdates()` hook，~30 行）：偵測到「已下載新版本」就喺 app 內顯示一條小 banner／toast「已有新版本，撳一下即刻更新」→ 撳咗行 `Updates.reloadAsync()`。
  - 唔撳都冇所謂，下次開 app 一樣係新版——雙保險，Eric 唔使學任何嘢。
  - banner 樣式跟 app 現有 toast 風格，唔好彈 modal 阻住播歌。
- ⚠️ 動 App.js 係紅線檔案（HANDOFF §2.6），banner 呢部分改動要最小、唔掂播放核心。

### 3. Channel：**單一 `production`，唔分層**

- 用戶得 Eric + 少量教會朋友，全部裝同一條 APK，分 preview/production 只會增加出錯面。
- channel 喺 bare + 本地 build 係寫死喺 AndroidManifest 嘅 request header（下面有 key），冇 EAS Build 幫手注入。
- 測試流程照舊行 emulator/dev build（debug build 嘅 expo-updates 預設停用，唔會誤收 OTA），驗完先 `eas update` 推 production。
- 第日如果真係想「Eric 先試、之後全體」，先加 `preview` channel + 出一條指向 preview 嘅特別 APK——寫低做未來選項，而家唔做。

### 4. 托管：用 Expo 官方 EAS Update 服務（u.expo.dev）

- 唔自建 update server（expo-updates 支援 custom server，但工作量同風險完全唔值；backend 部 Mac 再托多樣嘢亦冇必要）。
- 免費 plan 對呢個用戶量綽綽有餘。

---

## 二、Eric 要做嘅嘢（得兩樣，一次性）

1. **開 Expo 帳號**（https://expo.dev，用佢 email 註冊，免費）→ 將登入資料經 Dispatch 交俾執行 session 行 `eas login`。（帳號密碼點交收由 Eric 決定；session 唔會代開帳號。）
2. **裝最後一次 APK**：configure 完出嘅第一條新 APK（v1.4.0）要手動裝一次——因為 OTA 機制本身係 native 改動。**裝完呢次之後，純 JS/UI 改動就唔使再掂 APK。**

---

## 三、實作步驟（Sonnet 跟住做）

> ⚠️ 開工前照規矩：`git status` 核對共用 worktree；只 add 自己改嘅 file。
> ⚠️ `frontend/hymn-app/AGENTS.md` 規定：寫 code 前必須讀 https://docs.expo.dev/versions/v56.0.0/ 對應章節（`expo-updates` SDK 頁 + bare 安裝指南 https://docs.expo.dev/bare/installing-updates/ + https://docs.expo.dev/eas-update/standalone-service/）。下面 snippet 係規劃時對照過文檔嘅，但落地以 v56 文檔為準。

### Step 1：裝套件 + 登入

```bash
cd frontend/hymn-app
npx expo install expo-updates        # 攞 SDK 56 對應版本
npm i -g eas-cli                     # 或者全程用 npx eas-cli
eas login                            # Eric 帳號
```

### Step 2：初始化 EAS project + 基本 config

```bash
eas init                 # 建立/連結 EAS project，寫 extra.eas.projectId 入 app.json
eas update:configure     # 寫 updates.url 入 app.json；bare project 佢會自動改 native file
eas channel:create production
```

- 行完**必須 `git diff frontend/hymn-app/android/`** 逐行檢查佢改咗 native 啲乜，唔明嘅改動要查文檔，唔好照單全收。
- 🔴 **絕對唔好行 `npx expo prebuild`**——會重寫 checked-in 嘅 `android/`（icon、track-player、allowBackup=false 嗰啲手動設定會冇晒）。所有 native config 一律手改。

### Step 3：app.json 補上 runtimeVersion（明文 string）

```json
"updates": {
  "url": "https://u.expo.dev/<projectId>",
  "requestHeaders": { "expo-channel-name": "production" }
},
"runtimeVersion": "1"
```

### Step 4：Android native config（手改，對照 update:configure 已做咗幾多）

`android/app/src/main/AndroidManifest.xml`（`<application>` 入面）：

```xml
<meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>
<meta-data android:name="expo.modules.updates.EXPO_UPDATE_URL" android:value="https://u.expo.dev/<projectId>"/>
<meta-data android:name="expo.modules.updates.EXPO_RUNTIME_VERSION" android:value="@string/expo_runtime_version"/>
<meta-data android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY"
           android:value="{&quot;expo-channel-name&quot;:&quot;production&quot;}"/>
```

`android/app/src/main/res/values/strings.xml`：

```xml
<string name="expo_runtime_version">1</string>
```

（channel header 個 key 名同 JSON escape 格式落地時要對返文檔／`update:configure` 產物核實。）

iOS 暫時唔使做（而家只出 Android APK）；`ios/` 留返第日先配。

### Step 5：加「已下載新版本」banner（薄層）

- 用 `Updates.useUpdates()`，`isUpdatePending` 為 true 時顯示 banner，撳咗 `Updates.reloadAsync()`。
- 放喺 App root level，唔掂播放核心 code path。
- `__DEV__`／debug build 下 expo-updates 停用，banner 邏輯要 guard 住唔好報錯。

### Step 6：出「最後一條手動 APK」

- bump `version` → `1.4.0`、`versionCode` → 50（呢次係 native 改動，理所當然出 APK）。
- 照 `HYMN-APP-IRON-RULES.md` 指令 build，copy 去 Desktop，交 Eric 裝。

### Step 7：驗證（emulator 行足全程先交貨）

1. emulator 裝 release APK（唔係 debug——debug 唔行 OTA）。
2. 改一個一眼睇到嘅 JS 位（例如某個 title 文案）。
3. `git status` 核對 worktree 乾淨（見第五節紅線）→ `eas update --channel production --message "test"`。
4. 冷啟動 app 一次（背景下載）→ 睇到 banner 就撳；唔撳就再冷啟動一次 → 確認改動出現。
5. 將呢個覆測流程寫入 HANDOFF.md。

---

## 四、以後日常點推更新

🔴 **2026-08-02 起，唔再手動 `git status` + `eas update`。** 同日發生 3 次
「未經 Eric 批准嘅 code 意外落 production」事故之後，落地咗部署批准 Gate
機制（`DEPLOY-GATE-PLAN.md`）：批准狀態落地做 `~/.hymn-deploy/approved.json`，
推送/restart 只准經 gate script，`.claude/settings.json` 嘅 PreToolUse hook
仲會硬攔截直接跑 `eas update`（deny）。

```bash
# 0. 攞到 Eric go 先（一次性，HEAD 有新 commit 就要再批一次）：
ops/deploy/approve.sh ota <HEAD sha> --confirm

# 1. 先 dry-run 驗（唔會真推，會檢查 frontend/hymn-app 乾淨 + HEAD == 已批准 sha）
ops/deploy/ota-publish.sh "v1.4.1 修正歌詞排版" --dry-run

# 2. 全過先真推
ops/deploy/ota-publish.sh "v1.4.1 修正歌詞排版"
```

`ota-publish.sh` 內部已經固定 `--platform android`，唔使自己加。**直接跑
`eas update`（唔經 gate script）會俾 PreToolUse hook deny** —— 呢個唔止靠自律，
係工具層面攔截；但 ⚠️ **已經開緊嘅長命 session 要重啟先受保護**。

用戶部機：下次開 app 自動攞到，或者見 banner 撳一下。**Eric 唔使做任何嘢。**

### OTA 定出新 APK？分界線（🔴 之後每次改完都要對一次呢張表）

| 改動類型 | OTA 得唔得 |
|---|---|
| `App.js` / `src/**` 純 JS/UI 改動 | ✅ OTA |
| JS 入面 require 嘅圖片/字型等 assets | ✅ OTA |
| 文案、樣式、排版、播放邏輯（JS 層） | ✅ OTA |
| `package.json` 加/升級 **任何** 依賴 | ⛔ 出 APK + bump runtimeVersion（除非 100% 肯定係純 JS 套件；唔肯定當 native） |
| `android/`、`ios/` 任何改動 | ⛔ 出 APK + bump runtimeVersion |
| app.json 影響 native 嘅欄位（icon、名、權限、plugins、versionCode…） | ⛔ 出 APK + bump runtimeVersion |
| Expo SDK / RN 升級 | ⛔ 出 APK + bump runtimeVersion |
| expo-updates 自身 config 改動 | ⛔ 出 APK + bump runtimeVersion |

**灰色地帶一律當 native 處理**：出 APK + bump runtimeVersion。代價只係一次手動裝；搏錯咗嘅代價係用戶部機 crash。

Bump runtimeVersion checklist：`app.json` 同 `strings.xml` 兩邊同步改 → build APK → Eric 裝 → 之後嘅 OTA 用新 runtime。

---

## 五、風險同紅線

1. 🔴 **共用 worktree 係 OTA 最大新風險**：`eas update` 係將**當刻 working tree** bundle 咗推出街。幾個 session 平行改緊嘢嘅話，會夾埋人哋未完成嘅嘢直接推去用戶部機。2026-08-02 起呢條唔再靠人手 `git status`/`git stash` 清場自律 —— `ops/deploy/ota-publish.sh` 會自動檢查 `frontend/hymn-app` 乾淨 + HEAD 等於已批准嘅 sha，唔乾淨/未批准直接 abort 並點名邊啲檔案/commit 有問題，詳見 `DEPLOY-GATE-PLAN.md`。呢條已入 HANDOFF §2.10 紅線。
2. 🔴 **唔好行 `expo prebuild`**（會毀掉手改嘅 native project）。
3. **runtimeVersion 唔記得 bump** = 最危險失誤（舊 APK 收到不相容 JS 會 crash）。靠上面張表 + 灰色地帶一律 bump 嚟防。
4. **Rollback**：推錯咗用 `eas update:republish` 揀返上一個好嘅 update 重推；device 端最壞情況可以重裝 APK（embedded bundle 一定喺度）。
5. **首次 gradle build**：裝完 expo-updates 第一次 `assembleRelease` 會多咗 bundle/manifest steps，用開嘅 JAVA_HOME=17 setup 應該冇事，但 build fail 嘅話先查 expo-updates gradle 整合，唔好亂改其他嘢。
6. **版本號習慣改變**：以後純 JS 改動唔再 bump `version`/`versionCode`（嗰啲留返俾 native release），改動追蹤靠 `eas update --message`。HANDOFF 嘅版本記錄方式要跟住轉（JS 改動記 update message，native 改動先記 v 號）。

---

## 六、交俾 Sonnet 前 Dispatch 要確認

- [ ] Eric 開咗 Expo 帳號未？login 方式點交收？（冇帳號成件事開唔到工）
- [ ] banner 提示（第一節第 2 點）照做定係 Phase 1 先淨係靜默？（建議照做，好薄）
- [ ] 邊個 session 負責落地 + 幾時出 v1.4.0 APK 交 Eric 裝？
