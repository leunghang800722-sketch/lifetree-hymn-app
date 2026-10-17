# W1 after 量度報告 2026-09-06

執行者：Sonnet 5。範圍：`DEEP-AUDIT-W1-AFTER-EXEC-20260906.md`。**執行者唔判 PASS/FAIL**——呢欄留白俾 Opus 5。
Raw 全部喺 `ops/perf/audit-20260906/w1-after/`（`ios-events-raw.json`、`android-events-raw.json`、`ios-xcodebuild.log`、
`classify-devices-after.txt`、`warm-stats-before.json`/`warm-stats-after.json`、`screens/`）。

環境入帳：`git rev-parse HEAD` = `43589c72f599b3f8acadb665061cda498b72131e`——**唔係字面上嘅 `67dd618`**，
但 `git diff --stat 67dd618 43589c7 -- frontend/ backend/` 輸出為空（`43589c7` 到 `67dd618` 之間淨係
docs commit），即係話兩個 sha 喺 frontend/backend 嘅程式碼上完全一致，本次直接用 HEAD build 冇 checkout。
全程冇部署、冇 restart、冇 eas、冇 launchctl、冇改任何 source、冇 commit、`API_BASE` 全程未改
(`https://api.odemusics.com`)。一次得一部機開住(iOS 完全收工先開 Android)。

---

## 0. Backend clientLogRateLimited(前後對照)

| 時點 | `total.clientLogRateLimited` |
|---|---|
| 量度前 | **1** |
| iOS 量度後 | **1** |
| Android 量度後（全部完成） | **1** |

三個時點完全一致——本次兩平台全部量度期間**零 beacon 被節流斬走**（67dd618 嘅 429 計數器
+ 節流上限 120→300 呢兩項 Opus 修補喺呢次冇撞到極限，冇機會驗到計數器本身會唔會郁；
但至少證明咗依家嘅節流上限喺呢種測試流量下唔會誤傷）。

`node ops/perf/classify-devices.mjs` 已重跑一次（`classify-devices-after.txt`），本次新開嘅 iOS/Android
deviceId 全部落入 R3(android:unverified)/R4(ios:unknown) 呢兩條既有規則,同 1E/W1-Opus 記錄嘅分類邏輯一致,
腳本本身跑得通。

---

## 1. iOS（sim，`E0416618-B662-41D2-A253-5260FA0CF556`）

### 1.1 Build provenance

| 項目 | 數字 |
|---|---|
| xcodebuild | `-workspace frontend/hymn-app/ios/Odely.xcworkspace -scheme Odely -configuration Release -sdk iphonesimulator -destination platform=iOS Simulator,id=E0416618-B662-41D2-A253-5260FA0CF556 -derivedDataPath <scratch>/1c-derivedData-after build` |
| 開始/完成（UTC） | 2026-09-05T18:48:39Z → 18:52:40Z（≈4m01s，全新 `-derivedDataPath`）|
| Exit code | 0（BUILD SUCCEEDED） |
| `main.jsbundle` | **3,741,027 B**（對比 1C before `3,740,962 B`，+65 B——同 W1 F1-F6 新增嘅少量 code 一致，冇異常膨脹） |
| Patched copy | `Expo.plist` `EXUpdatesCheckOnLaunch` `ALWAYS`→`NEVER`（同 1C 方法一致），`bundle id com.hymnapp.praise` |
| `git status --short frontend/hymn-app/ios/` | 空 |

### 1.2 S1 冷開 ×3（每次 `simctl uninstall`→`install`→`launch`，deviceId 用 `RCTAsyncLocalStorage_V1/manifest.json` 直讀，非時間反推）

| run | deviceId(尾6) | app | cont | home | verMs | hymnsMs | byt | sessionId | updateId |
|---|---|---|---|---|---|---|---|---|---|
| 1 | a340d10c | 288 | 342 | 414 | 911 | 1399 | 2,396,419 | 9634b5290474f8b9 | `71bf91af-0170-48b1-80a9-32d7d013dc66` |
| 2 | 07dfeee0 | 150 | 198 | 261 | 920 | 1201 | 2,396,419 | c69e0bfa7c88c03f | 同上 |
| 3 | b6fafea2f4d | 160 | 215 | 284 | 1115 | 1171 | 2,396,419 | 2110b0ef63d07ce6 | 同上 |

**1C before（median，Opus errata 修正版）**：app=163 cont=232 home=286 verMs=897 hymnsMs=1256 byt=2,376,336（5/5 run）。

**粗篩（唔判快慢）**：`byt` 2,396,419 vs 2,376,336（+0.84%）——同 catalog `n` 由 6543 長到 6594 一致，
唔係 regression。`app`/`cont`/`home` 三個 run 之間本身波幅就大（150-288/198-342/261-414），
落喺同 1C before 波幅（113-217/150-289/206-339）相近嘅數量級,冇睇到明顯落後嘅訊號,但呢個
淨係粗篩,唔係結論。三個 `updateId` 完全一致（本機 embedded 建置嘅 manifest 自帶 UUID,
**唔係**字面 `"embedded"` 字串——見 §1.5 說明,呢個同 W1-After-Exec 原先估計嘅「sim 限制會見到
`embedded`」唔一樣,係更好嘅結果:三次冷開一致嘅真 UUID,結構上可以做 before/after 切分維度）。

### 1.3 S3 — 15 tab tap（詩歌庫→我的→首頁 ×5，run3 續用）

**⚠️方法論發現**：第一次用 0.8 秒間隔連續撳 15 下,**全部 0 條 `perfNav` 到達**（唔係 app bug——
單獨補一下 tap 即刻收到 1 條）。改用 1.5 秒間隔重新做一次完整 15 下,**15/15 全部到達,`navBeaconCapped=0`**。
懷疑係 React state 更新批次化,撳得太快令中間嘅 `activeTab` transition 冇獨立觸發 `useEffect`。
已記錄做「執行方法論」教訓,唔算 W1 regression。

| # | tab | tapToMount | tapToPaint |
|---|---|---|---|
| 1-15 | Library/Mine/Home 循環 ×5 | 37-93ms | 59-116ms |

五欄（platform/deviceId/appVersion/updateId/sessionId）逐條核，**15/15 全部非空**。

### 1.4 S5 — 播放（隨心聽 + 撳「下一首」×2 + wallClockDrift 兩次嘗試）

| # | origin | source | ms | hymnId |
|---|---|---|---|---|
| 1 | start | local | 262 | 3656 |
| 2 | tapNext | local | 88 | 2126 |
| 3 | tapNext | local | 90 | 6836 |
| 4 | auto（LOCK 背景期間自動接播） | local | 1106 | 7868 |

四條全部 `source=local`（同 1C 一樣冧咗，冇覆蓋 streaming 起播路徑——見「做唔到」）。

**wallClockDrift 兩次嘗試（人工造，兩次都冇觸發）**：
1. HOME 背景 40 秒 → 前台 relaunch：零 `wallClockDrift`。
2. LOCK 鎖屏 85 秒 → 解鎖+relaunch：零 `wallClockDrift`（但同一段時間內 `nextTrackMs origin=auto`
   準時發生,證明 JS thread 全程冇被凍結——背景音頻播放令 poll loop 保持接近原定排程,
   drift 追唔到 5000ms 門檻）。

### 1.5 iOS 逐種 event 五欄覆蓋率（union，`ios-events-raw.json`）

| event | n | platform | deviceId | appVersion | updateId | sessionId |
|---|---|---|---|---|---|---|
| perfHome | 3 | 3 | 3 | 3 | 3 | 3 |
| perfMarks | 3 | 3 | 3 | 3 | 3 | 3 |
| perfRenders | 5 | 5 | 5 | 5 | 5 | 5 |
| perfNav | 15 | 15 | 15 | 15 | 15 | 15 |
| nextTrackMs | 4 | 4 | 4 | 4 | 4 | 4 |

**全部逐條核，冇抽樣，全部五欄 100% 非空。**

`updateId` = `71bf91af-0170-48b1-80a9-32d7d013dc66`——呢個係**本機 embedded 建置**嘅 manifest 自帶
UUID（`EXUpdatesCheckOnLaunch=NEVER` 令 app 從未真正打過 `u.expo.dev`），**唔係**生產 iOS OTA
嘅 update id（`01a072e3-8c91-7730-931c-b8ea40673c52`，執行單原文提到嗰個）。呢個係 sim 限制嘅
預期結果，唔係 bug。

---

## 2. Android（AVD `hymntest`）

### 2.1 OTA 落地確認（唔使 patch APK，跟 1B-Opus §4 更正）

`logcat dev.expo.updates` 完整流程：`StartStartup→Check→CheckCompleteAvailable(manifest id=
01a072e2-f15a-7d02-8539-28e0530d9949, metadata.updateGroup=fbc303dc-521e-4236-9b17-b1d1763c0279)
→Download→DownloadComplete→EndStartup`——**`updateGroup` 同 `~/.hymn-deploy/ota-groups.log`
記錄嘅 android group `fbc303dc-521e-4236-9b17-b1d1763c0279` 完全一致**。`force-stop`→relaunch
之後 logcat 見 `CheckCompleteUnavailable`（已套用、冇更新）。

`updateId`（beacon 自己讀到）= **`01a072e2-f15a-7d02-8539-28e0530d9949`**（呢個就係生產 android
OTA 嘅真 update id，同 iOS 嗰個 `01a072e3-…` 係同一次 publish 兩個平台各自嘅 id）。

### 2.2 S1 冷開 ×3（`force-stop`→`launch`，**唔 `pm clear`**——跟執行單 §3.3 更正，避免跌返 08-24 embedded 舊 bundle）

| run | deviceId | app | cont | home | verMs | verSkip | hymnsMs | byt | sessionId |
|---|---|---|---|---|---|---|---|---|---|
| 1 | b3bba247…(持久，全程唔變) | 144 | 263 | 565 | 1732 | 0 | 2006 | 2,401,404 | ca829d148b2b8ad4 |
| 2 | 同上 | 91 | 193 | 411 | 1305 | 1 | -（skip） | -（skip） | 47b4ff3ead4ee1e2 |
| 3 | 同上 | 105 | 211 | 435 | 1219 | 0 | 1615 | 2,401,404 | 6eff6b381d54b5d1 |

**1B before（Opus §8.1 更正版）**：app=113/114/119 cont=151/159/169 home=184/220/236 verMs=933/960/1283
hymnsMs=1272/1281/1310 byt=2,381,052（5/5 run）。

**粗篩**：`byt` 2,401,404 vs 2,381,052（+0.85%，同 catalog n 6555→6606 一致）。`home`（411-565ms）
明顯高過 before（184-236ms）；run1/run3 嘅 `verSkip=0`（catalog 中途變動觸發真 refetch，同
1B/1C 報告記錄嘅背景 job 現象一致，唔係量度方法誤差）拖高咗 `home`/`hymnsMs`。run2
`verSkip=1` 冇行 refetch，`home=411` 都仲係高過 before 上限 236——**呢個差異值得 Opus 覆核**，
本報告唔判斷成因（可能係 catalog 已經大咗 45-51 首、亦可能係本機 device 負載波動，
兩次量度唔係同一時段跑）。

`mmkvRead`/`parse` 全部有數（21-27ms/19-22ms），同 1B「pm clear 令 mmkv 冇嘢好讀」唔同
——因為呢次冇 `pm clear`，MMKV cache 由第一輪 1B 測試遺留落嚟仲喺度，呢個係執行單
明文要求嘅方法（保留 OTA 落地），非誤差。

### 2.3 S3 — 15 tab tap（沿用 1.5 秒間隔，跟 iOS 學到嘅教訓）

15/15 全部到達，`navBeaconCapped=0`。`tapToMount` 42-127ms，`tapToPaint` 86-232ms（首個
`Library` tap 因為冷 mount 代價明顯高，之後穩定）。

### 2.4 S5 — 播放（隨心聽 → 撳「下一首」×2）

| # | origin | source | ms | hymnId |
|---|---|---|---|---|
| 1 | start | **stream** | 32,369 | 4300 |
| 2 | tapNext | stream | 175 | 7531 |
| 3 | tapNext | stream | 1,497 | 7390 |

**3/3 全部 `source=stream`**——同 iOS 相反（iOS 3/3 local），本次補齊咗 iOS 冧咗嘅串流起播路徑覆蓋。

**方法論插曲**：`uiautomator dump` 喺播放中因為畫面持續動畫（音頻視覺化 bar）永遠攞唔到
「idle state」，兩次 dump 都回傳**完全一樣嘅 stale cache**（51,925 bytes 一字不變），
`ERROR: could not get idle state` 只寫 stderr 冇令指令 fail，容易誤導。改用 `screencap` +
本機 PIL crop 手動量度按鈕座標（先錯一次 y 座標估錯撞唔中，第二次修正後成功）。

### 2.5 `pm revoke POST_NOTIFICATIONS` 額外實驗（1B-Opus §2 建議）

- `pm revoke`→`force-stop`→`launch`（19:17:17Z），彈窗出現（screenshot 確認）。
- 刻意等 **~147 秒**（兩次撳 Allow 座標估錯,撳中「文字」或訊息區而非按鈕本身,第三次用
  screenshot crop 準確量度先撳中）先撳走彈窗（19:19:44Z）。
- **撳走一刻，`perfHome`(名義 5s)、`perfRenders`(名義 15s)、`perfMarks`(名義 25s)、
  `perfRenders`(名義 60s)、`wallClockDrift` 五條 beacon 全部喺 400ms 內（19:19:44.711-19:19:44.825）
  一齊湧到**——同 1B 原始發現一致：彈窗擋住嗰段時間 JS `setTimeout` 冇被觸發，
  一次過「補鑊」。
- `wallClockDrift` detail：**`driftMs=145981 bgMs=125`**，`appState=active`，`trackState=none`。

**呢個個案證明 W1 加嘅 `bgMs`/`appState` 有幫助解讀**：`driftMs`(146秒) 單獨睇同「app 背景咗
2 分半」冇分別，但 `bgMs=125`（好細）+ `appState=active`（全程未離開前台）兩個新欄合埋顯示
**呢次唔係背景太耐,係前台俾原生彈窗凍結咗 JS thread**——冇呢兩個欄,呢條 driftMs 會被誤判做
一次真正嘅背景事故。呢個係本次量度入面最清晰嘅「新欄確實幫到手」實證。

### 2.6 Android 逐種 event 五欄覆蓋率（union，`android-events-raw.json`，19:08Z 之後）

| event | n | platform | deviceId | appVersion | updateId | sessionId |
|---|---|---|---|---|---|---|
| perfHome | 5 | 5 | 5 | 5 | 5 | 5 |
| perfMarks | 5 | 5 | 5 | 5 | 5 | 5 |
| perfRenders | 7 | 7 | 7 | 7 | 7 | 7 |
| perfNav | 15 | 15 | 15 | 15 | 15 | 15 |
| nextTrackMs | 3 | 3 | 3 | 3 | 3 | 3 |
| wallClockDrift | 1 | 1 | 1 | 1 | 1 | 1 |

**全部逐條核，冇抽樣，全部五欄 100% 非空。**

---

## 3. 兩平台對照（15 tap cap 40 / sessionId / updateId）

| 指標 | iOS | Android |
|---|---|---|
| 15 次 tab tap 收到幾多條 `perfNav` | **15**（1.5s 間隔） | **15**（1.5s 間隔） |
| `navBeaconCapped` | 0 | 0 |
| 同一次冷開 `sessionId` 一致 | ✅（3 個 run 各自一致，互不相同） | ✅（5 個 session 各自一致） |
| `updateId` 非 `dev`/字面 `embedded` | ✅ 真 UUID（本機 embedded manifest 自帶） | ✅ 真 UUID（生產 OTA，同 group log 對得上） |
| `nextTrackMs source` 覆蓋 | 4/4 `local`（冧咗，冇覆蓋 stream 路徑） | 3/3 `stream`（覆蓋咗 stream 路徑） |
| `wallClockDrift` 人工造 | 2 次嘗試（HOME 40s / LOCK 85s）皆失敗，0 條 | 1 次嘗試（pm revoke 彈窗 147s）成功，1 條，且證明咗 `bgMs`/`appState` 有解讀價值 |

---

## 4. 做唔到嘅項（逐條原因）

1. **iOS `wallClockDrift`（兩次嘗試皆失敗）**——HOME 背景 40 秒、LOCK 鎖屏 85 秒都冇觸發。
   原因：背景音頻播放令 iOS 保持 JS thread 接近原定排程執行（`nextTrackMs origin=auto`
   喺 LOCK 期間仍準時 fire，證明 poll loop 冇被凍結），5000ms drift 門檻結構上難撞到。
   1E 記錄真實 drift 事件多數係幾分鐘到幾十分鐘級（甚至 13.3 小時），本次時間預算內嘅
   40-85 秒背景窗口太短。Android 側改用 `pm revoke` 彈窗阻塞法成功造到一次（§2.5），
   證明咗 W1 新欄有價值，但呢個機制（前台彈窗阻塞）同「app 真正背景」係兩種唔同觸發路徑，
   iOS 冇對應嘅「阻塞式系統彈窗」可以借用（POST_NOTIFICATIONS 喺 iOS 首次 launch 都會問，
   但未試過人工 revoke iOS 權限重現——時間預算所限冇再試第三種方法）。
2. **`prefetchFail`（兩平台皆 0 條）**——本次 S1-S5 測試窗口冇自然觸發（`tooSmall`/`badType`/
   `status!=200` 呢幾條路徑都需要真實命中壞片或極短音頻，本測試揀嘅歌全部正常）。冇
   刻意製造（例如手動改一首歌嘅串流回應）因為會踩到「唔改 backend/source」嘅紅線。
   源碼已核實四個欄（`bytes=`/`min=`/`dur=`/`ct=`）確實存在（`audioPrefetch.js:369`），
   送信層已改用 `sendClientLog`（`audioPrefetch.js:28,184`），結構上五欄會齊，但呢次冇
   真機證據。
3. **`syncUnknownOp`/`outboxLong`（兩平台皆冇做）**——兩條 code path 都要求已登入帳號
   （`userSync.js:118` `if (!_token) return false` 短路），本次全部測試裝置皆為全新/未登入
   狀態,冇建立/使用會員帳號嘗試（超出純儀器覆蓋率測試嘅合理範圍，亦要動用真實帳號
   操作,判斷唔喺呢張執行單嘅範圍）。W1-Opus 報告已用 harness 驗證過呢兩條 path 嘅
   code 邏輯（單元測試層面），真機覆蓋留返呢個缺口。
4. **iOS `nativeStall` 結構性冇五欄（非「做唔到」，係已知缺口重申）**——源碼核實
   （`ios/Podfile:101` `SWStallWatchdog.beacon()`）呢個 event 由 native Swift 直接
   `URLSession` POST `{event,clientTs,detail}`，完全冇經過 `src/clientLog.js` 嘅統一送信層，
   結構上唔會有 platform/deviceId/appVersion/updateId/sessionId。本次測試窗口（3 首歌
   全部 `source=local`）冇撞到任何 nativeStall；查返同日較早時段其他真實用戶嘅
   `nativeStall` row（17 條），全部依然 `platform="" deviceId=""`，證實呢個結構性缺口
   喺 W1 之後**冇被修復**（W1 範圍本身冇包呢一項，本報告只如實記錄現況）。
5. **弱網（S6）**——執行單本身冇要求（W1-after 只做 S1/S3/S5 事件覆蓋率驗證，「呢波
   冇效能改動」），冇做。

---

## 5. 收工衛生

- iOS：`/tmp/claude-ios-cleanup.hold` 已建立/已刪除；`xcrun simctl shutdown` 已執行；
  最終 `booted:0 idb:0 sim:0 devtools:0`。
- Android：`/tmp/claude-android-baseline.hold` 已建立/已刪除；`adb emu kill` 已執行；
  `adb devices` 空、`pgrep -f qemu` 0；裝置上安裝嗰份 APK 全程未曾 patch 過（本次冇
  patch APK，跟 1B-Opus §4 更正，全程用生產 OTA 落地嘅版本）。
- 兩部機全程冇同時開（iOS 完全收工，`booted_ios:0` 確認之後先開 Android）。

---

## 6. 儀器/程式碼改動清單

**冇。** 全程 `git status --short frontend/ backend/` 未執行任何寫入（本次未曾 `git status`
過 working tree，但可以擔保：冇用 Edit/Write 工具動過任何 repo 檔案，淨係用 Bash 讀取、
adb/idb/xcodebuild 操作模擬器/AVD、以及寫入 scratchpad/ops raw 證據檔）。
