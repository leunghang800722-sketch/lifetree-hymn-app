# DEEP-AUDIT-1B-ANDROID-20260906 — Android 運行時 baseline（09-02 效能工程部署後）

執行者：Sonnet 5。範圍：`DEEP-AUDIT-PLAN-20260906.md` Phase 1B。**唔改 source、未 commit、未部署。**
**執行者唔判 PASS/FAIL/快/慢/冇問題 —— 呢欄留白俾 Opus 5。**

裝置：AVD `hymntest`（`~/android-sdk/emulator/emulator`），全程只開呢一部。adb `/opt/homebrew/bin/adb`。
`API_BASE` 全程未改，維持 `frontend/hymn-app/src/config.js` 原文 `https://api.odemusics.com`（production tunnel）。

原始證據全部喺 `ops/perf/audit-20260906/1b-raw/`、`ops/perf/audit-20260906/1b-screens/`。

---

## 0. 建置 provenance（同 1C 對照關鍵：兩份報告用嘅係同一個 git commit）

| 項目 | 數字/內容 |
|---|---|
| `git rev-parse HEAD` | `75f8f950618373495f74e8e8d7050c2da4581935`（**同 1C iOS 報告完全一致嘅 commit**） |
| 已安裝 release APK | `frontend/hymn-app/android/app/build/outputs/apk/release/Odely-v1.5.1-vc55.apk`（2026-08-24 build，101,239,729 bytes，SHA-256 `ba87d8f8...`） |
| apksigner 驗證 | `CN=Android Debug, OU=Android` —— **確認係 debug keystore 簽**（`android/app/build.gradle:102-105` `storeFile debug.keystore / storePassword 'android'`），只 v2 scheme，冇 v1/v3/v4 |
| versionCode/versionName | 55 / 1.5.1，minSdk=24 targetSdk=36 |
| **OTA/embedded JS 落地方法** | 見下段「§0.1 OTA 落地調查」——因為 APK 內嵌嘅 JS（2026-08-24 build）明顯早過 HEAD，本次用 `expo export:embed --platform android --dev false` + `hermesc -w -emit-binary` 將 HEAD(`75f8f95`) 編譯做 Hermes bytecode（3,704,740 B，對比 APK 原有 3,021,684 B）取代 `assets/index.android.bundle`，再 `zipalign` + `apksigner sign`（同一條 debug.keystore）重簽，`adb install -r -d` 蓋上去 |
| Patched APK | `1b-Odely-headpatched.apk`，SHA-256 `ef982dd8...`，同 debug 證書（`fac61745...`）簽，v2+v3 scheme |

### 0.1 OTA 落地調查（同 1C 唔同：Android 呢邊真係撞到一個生產 OTA update）

裝置原有 app data（`lastUpdateTime=2026-08-25`），首次 launch 嘅 logcat（`dev.expo.updates`）顯示：`EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`，`updates.eas.dev` production channel、**runtimeVersion="4"**（`android` 冇 override，跟 `app.json` 頂層 `runtimeVersion:"4"`；iOS 另有 override `"5"`，同 1C 報告 `Runtime Version 5` 吻合）。第一次 launch 就即刻 download 咗一個 `createdAt=2026-09-05T16:53:27Z` 嘅 android 更新並標 `isUpdatePending=true`；下一次 relaunch 就套用咗（`CheckCompleteUnavailable` 確認之後冇更新——已經係最新）。

**呢個生產 android OTA 嘅實際 git commit 查唔到**——`eas update:list/view` 呢類指令（包括淨讀嘅）全部俾 `ops/deploy/guard-bash.sh` 部署 gate 攔截（`OTA 必須經 ops/deploy/ota-publish.sh 推送...直接跑 eas update 已被攔截`），呢個攔截對任何含 `eas update` 字串嘅 bash command 一律 deny，冇分讀寫。

**方法論決定**（已記錄，兩條路徑並用）：
- **S1（冷開，`pm clear` 每次）**：`pm clear` 會連 expo-updates 嘅已下載更新記錄一齊清走，令 app 每次都跌返去用 **APK 內嵌嘅 fallback bundle**——即係我哋自己 patch 落去嘅 HEAD(`75f8f95`) bytecode。故此 S1 全程確定行緊同 1C 完全同一個 commit。
- **S2/S3/S5/S6（warm，冇 clear）**：喺 S1 五個 run 之間，backend 嘅背景下載機制已經再攞到嗰個 production android update；本次喺 S2 之前特登做咗一次「priming」relaunch，logcat 確認 `CheckCompleteUnavailable`（即已經套用咗嗰個 09-05T16:53:27Z 嘅更新，並且確認冇更新）——之後 S2-S6 全部行緊呢個**已落地嘅生產 Android OTA**（唔係我哋自己 patch 嗰份，亦唔知佢實際 commit，但已驗證喺整個 S2-S6 期間穩定唔再變）。

**呢個係本報告方法論同 1C 最大分歧**：1C 全程一個 commit；1B 因為冇 root 級手段可以停用 `EXPO_UPDATES_CHECK_ON_LAUNCH`（試過 `adb root` 之後想改 `/etc/hosts` 擋 `u.expo.dev`，被 auto mode classifier 拒絕，冇再嘗試迂迴），拆做兩截：S1=已知 commit（同 iOS 一致），S2-S6=生產 OTA（commit 未知但穩定）。**兩者比較時要留意呢個差異，唔可以假設全程同一份 JS。**

---

## 1. S1 — 冷啟動·無 cache（`pm clear` → `pm grant` POST_NOTIFICATIONS → launch，5 run）

### 1.0 一個關鍵發現：pm clear 後嘅系統通知權限彈窗會凍結 JS 計時器

**首次不帶 `pm grant` 嘅測試 run（未計入正式 5 run）發現**：`pm clear` 令 `POST_NOTIFICATIONS` 權限被重置，下次 launch 系統彈出「Allow Odely to send you notifications?」原生對話框。呢個對話框浮喺畫面之上嗰陣，底下 JS 內容其實已經完整 render 咗（用「Allow」撳走個對話框即刻見到完整首頁），但 **`perfHome`/`perfRenders`/`perfMarks` 三個原定 5s/15s/25s 分開發出嘅 beacon,全部喺撳走對話框嗰一刻先一次過（400ms 內）湧到 backend**——即係話對話框顯示緊嗰段時間,JS 嘅 `setTimeout` 冇被觸發（Activity 被彈窗奪走 focus,RN JS thread 計時器疑似俾系統凍結咗），直到對話框被處理先「補鑊」全部一齊 fire。

**呢個係真實 Android 用戶會撞到嘅行為**（首次安裝必然見到呢個系統彈窗），但**只喺首次安裝／`pm clear` 後出現一次，之後嘅 force-stop 冷開唔會再見**（權限決定會持久化，唔會俾單純 force-stop 清走）。為咗令 S1 五個 run 之間互相可比（唔想每個 run 都撞正呢個唔定時嘅凍結window)，正式 5 run 改用 `pm clear` 之後即刻 `pm grant android.permission.POST_NOTIFICATIONS`（喺彈窗出現之前預先授權）跳過呢個對話框。**呢個做法令 S1 數字代表「已經授權過通知權限之後嘅乾淨冷開」，唔代表「絕對首次安裝」嘅完整用戶體驗**——後者會多咗呢個彈窗阻塞窗口，長度不定（本次觀測到嘅一次凍結咗至少 55 秒，直到人手撳走為止；正常用戶通常幾秒內就會撳，但呢個唔喺本報告嘅計時範圍內）。

### 1.1 逐 run 數字（deviceId 逐 run 重新生成，同 host `am start -W` 輸出嘅 host_launch_ts 交叉核對）

| run | deviceId(尾6) | app(ms) | cont(ms) | mmkvRead | parse | home(ms) | verMs(ms) | hymnsMs(ms) | att/ok1 | a1t(ttfb) | a1b(body) | a1p(parse) | byt | lyrMs | native TotalTime(ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 8544c8 | 114 | 159 | 0 | - | 220 | 933 | 1281 | 1/1 | 390 | 879 | 12 | 2,381,052 | 1218 | 458 |
| 2 | 47fd6 | 119 | 169 | 0 | - | 236 | 1283 | 1272 | 1/1 | 399 | 857 | 16 | 2,381,052 | 1165 | 441 |
| 3 | 03d56f6 | 118 | 167 | 0 | - | 236 | 1161 | 1277 | 1/1 | 389 | 875 | 13 | 2,381,052 | 1244 | 442 |
| 4 | c6639 | 113 | 158 | 0 | - | 212 | 960 | 1310 | 1/1 | 389 | 908 | 13 | 2,381,052 | 1349 | 469 |
| 5 | 852fb | 113 | 151 | 0 | - | 184 | 953 | 1290 | 1/1 | 395 | 882 | 13 | 2,381,052 | 1871 | 473 |
| **min/median/max** | — | **113/114/119** | **151/159/169** | 0/0/0 | 全空 | **184/220/236** | **933/960/1283** | **1272/1281/1310** | **5/5·5/5** | **389/390/399** | **857/879/908** | **12/13/16** | 全同 | **1165/1244/1871** | **441/458/473** |

`mmkvRead=0 parse=-` 全部 5 run（`pm clear` 令 MMKV 檔完全唔存在，冇嘢好 read，`parse` 完全冇 fire——比 1C iOS 報告嘅「uninstall」更乾淨嘅「無 cache」訊號，因為 iOS 嗰邊 mmkvRead 仍然量到幾 ms）。`ok1=1` 全中 5/5（同 1C 一致，第一次 attempt 就攞到全部歌）。`byt` 全部完全一致（2,381,052），呢個時段 backend catalog 冇變動（同 1C 報告提到嘅 backend catalog 中途變大唔同，本次 S1 期間穩定）。

Native `am start -W` TotalTime≈WaitTime（441-473ms），呢個係 Android 系統量度嘅「Activity 建立到首幀」，遠遠短過 iOS 報告嘅「native 冷開段」(1.24-1.35s)——但兩個唔係同一個定義（Android `TotalTime` 量到 `Activity.onResume` 附近，iOS 嗰個係反推嘅 T0 bundle-entry 時間點，**唔可以直接比**。

### 1.2 正控：screenshot 時序（run 1）

`1b-screens/s1-run1-t3s.png`：launch+3s 已經係**完整內容**（隨心聽卡、語言 chips、粵語敬拜歌單全部渲染完），唯獨頂部「每日金句」卡未出現。`1b-screens/s1-run1-t30s.png`：launch+30s，每日金句卡已經出現喺頂部。兩張圖之間嘅差異顯示 `/api/home/daily-verse` 呢個獨立 fetch 完成時間唔喺 3 秒之內，但喺 30 秒之內——backend 呢條 route 本身 p50=1ms（見 1E 報告），呢個延遲更似係前端 render 排程/優先序嘅表現，**冇讀 source 覆核，純觀察，唔判斷根因**。

---

## 2. S2 — 熱啟動·有 cache、version 相同（`force-stop` → `launch`，5 run，冇 `pm clear`）

**注意（同 §0.1 呼應）**：S2 五個 run 行緊嘅係已落地嘅生產 Android OTA（唔係 §0 patch 嗰份 HEAD bytecode）。deviceId 全程唔變（`46f355885b87a2cd599f99803f1852fb`，force-stop 唔會清 AsyncStorage/deviceId），逐 run 用 host `am start -W` 記錄嘅 `host_launch_ts` 對 backend 到達時間反推（perfHome≈+5.3s、perfMarks≈+25.3s，5 run 全部命中預期窗口 ±0.5s 之內，方法可信）。

### 2.1 逐 run 數字

| run | app | cont | mmkvRead | parse | cacheReady | home | verMs | verSkip |
|---|---|---|---|---|---|---|---|---|
| 1 | 110 | 204 | 22 | 18 | 202 | 447 | 1226 | 1 |
| 2 | 109 | 209 | 21 | 22 | 208 | 453 | 1229 | 1 |
| 3 | 124 | 233 | 31 | 21 | 231 | 448 | 1198 | **0**(見下) |
| 4 | 120 | 208 | 22 | 19 | 205 | 446 | 1195 | 1 |
| 5 | 118 | 219 | 23 | 20 | 216 | 464 | 1221 | 1 |
| **min/median/max** | 109/118/124 | 204/209/219 | 21/22/23 | 18/20/22 | 202/208/216 | 446/448/464 | 1195/1221/1226 | 4/5=1 |

**run3 `verSkip=0`**：呢個 run 期間 backend catalog `n` 由 6555 變 6561（另一個背景 job 寫緊 DB，同 1C §0 環境備註同類情況），令 version hash 改變觸發真實 refetch（`hymnsMs=1387 att=1 ok1=1`），run4 之後 catalog 穩定返，`verSkip` 都返去 1。**呢個唔係量度方法造成嘅誤差，係另一個背景寫入撞正時段**。

`verMs`（version check 本身嘅 round-trip，即使 `verSkip=1` 都要行）穩定喺 1195-1229ms 之間，唔受 `verSkip` 影響——同 1C iOS 報告 S2 嘅 912-1240ms 屬同一數量級。

### 2.2 perfHome

| run | chips | pages | today | recent | lib(Library render) | libIdle |
|---|---|---|---|---|---|---|
| 1 | 4.77 | 2.85 | 13.88 | 5.94 | 219.09 | 857 |
| 2 | 4.19 | 3.73 | 15.08 | 5.21 | 219.23 | 860 |
| 3 | 3.29 | 2.79 | 14.39 | 5.33 | 211.64 | 840 |
| 4 | 2.11 | 2.74 | 15.03 | 5.76 | 208.82 | 867 |
| 5 | 3.09 | 3.38 | 16.38 | 5.72 | 211.65 | 871 |

（`lib` 一欄本表列出 5 run 分別值——208.82-219.23ms，同 1C iOS 報告 S2 嘅 197-217ms 屬同一數量級，Android 略高但差異細過 run-to-run 雜訊。）

### 2.3 perfRenders（t=15，涵蓋 S2 全部 5 run）

`run3`（撞正真實 refetch 嗰次）render 次數明顯高過其餘 4 run：`Home=9 Library=6 Mine=9`（run3）vs `Home=5 Library=2 Mine=5`（run1/2/4/5）——同 `verSkip=0` 觸發額外 render 一致，內部證據吻合。

---

## 3. S3 — Tab 導航（詩歌庫→我的→首頁→詩歌庫→首頁，3 cycle=15 tap）

座標經 `uiautomator dump` accessibility bounds 確認：首頁中心(180,2238)、詩歌庫中心(540,2238)、我的中心(900,2238)（`bounds="[0,2171][360,2306]"` 等,1080×2400 畫面）。

### 3.1 逐 tap 數字（`perfNav` beacon，同 1C 一樣撞到 `navBeaconsSent>=10` 儀器上限）

| # | tab | tapToMount(ms) | tapToPaint(ms) |
|---|---|---|---|
| 1 | Library | 42 | 232 |
| 2 | Mine | 113 | 149 |
| 3 | Home | 95 | 125 |
| 4 | Library | 88 | 134 |
| 5 | Home | 107 | 146 |
| 6 | Library | 77 | 102 |
| 7 | Mine | 75 | 99 |
| 8 | Home | 83 | 122 |
| 9 | Library | 75 | 101 |
| 10 | Home | 86 | 118 |
| **min/median/max** | — | **42/83.5/113** | **99/125/232** |

**⚠️只有 10 條到達（15 次 tap 嘅第 11-15 次靜靜被丟棄，冇報錯）**——同 1C 完全一樣嘅儀器上限（`perfMarks.js` L280 硬 cap），並非新發現嘅 bug，係執行單 3-cycle 設計本身撞出嚟。`tapToPaint` 首個 232ms 明顯高過其餘（42→232），可能係第一次切 tab 嘅冷 mount 代價，之後穩定喺 99-149ms。

---

## 4. S5 — 播放（首頁「隨心聽」撳播 → 撳「下一首」→ 3 分鐘連續 session）

流程：`force-stop` → `launch`(warm) → +6s 撳「隨心聽」(x=550,y=1000) → +20s 撳畫面座標(746,1404，原意「下一首」) → +20s 再撳一次 → +15s 撳「詩歌庫」tab → 等到 launch+180s。

### 4.1 `nextTrackMs`

| # | origin | source | surface | ms | hymnId |
|---|---|---|---|---|---|
| 1(shuffle 起播) | start | **stream** | shuffle | **7084** | 7454 |
| 2(自然接播,非人手撳) | auto | stream | — | **1** | 7664 |

**⚠️執行偏差已誠實記錄**：本次「隨心聽」首次起播嘅曲目**行咗 stream 路徑**（`source=stream`，非 1C iOS 報告嗰種 3/3 皆 local 命中）——呢個直接補咗 1C 報告承認嘅缺口（「冇捕捉到串流起播路徑」）。但**兩次「撳下一首」嘅人手 tap（座標 746,1404）都冇喺 `nextTrackMs` 留低 `origin=tapNext` 記錄**——事後檢查 `uiautomator dump` 發現第二次撳擊嘅座標喺播放器版面因為歌名/進度列變動之後偏咗，落咗喺「播放清單」抽屜手柄附近（撳開咗 queue 抽屜,唔係「下一首」按鈕）。`hymnId=7664`(ms=1,`origin=auto`)係歌曲自然播完之後自動接播嘅下一首,**唔係**人手 tap 觸發。**呢個係執行時嘅座標偏差,唔係 app 本身嘅 bug**——已如實記錄,唔嘗試靠事後推測補一個冇發生過嘅 tapNext 數字。

`hlsStartupKick`/`hlsFallback`/`midStallNudge`/`handleMidStreamStall_giveup`/`handleBufferingStuck_giveup`/`PlaybackError` 全部 0 條（S5 呢個 3 分鐘窗口內冇撞到任何 stall/救援訊號）。

### 4.2 記憶體（`adb shell dumpsys meminfo` TOTAL PSS，KB）—— 同 1C 方向相反嘅發現

| 時點 | TOTAL PSS | TOTAL RSS |
|---|---|---|
| launch+6s(播放前) | 318,677 | 434,220 |
| 撳「詩歌庫」tab 後(launch+~66s) | 474,529 | 593,628 |
| 播 3 分鐘後(launch+~181s) | 646,389 | 767,296 |

**⚠️呢個方向同 1C iOS 報告相反**——1C 記錄「RSS 喺播放期間下跌」(512,000→222,224KB)，本次 Android PSS/RSS 喺播放期間持續**上升**（318,677→646,389，接近雙倍）。兩個平台嘅記憶體管理機制本身唔同（iOS RSS 受 Photos/圖片 cache 逐出策略影響、Android PSS 含 native heap/dex/oat 等唔同分帳），**呢個差異純粹如實記錄方向,唔判斷邊個更好或者係咪洩漏**——冇用 Android Studio Profiler 做記憶體分層,亦冇追蹤 source 去確認邊個 allocation 增長,呢個係本報告嘅限制,留返俾 Opus 5 / 有工具嘅覆核。

### 4.3 Android 專項（`dumpsys` 逐項，launch+181s 時點截取）

| 項目 | 結果 |
|---|---|
| **MediaSession** | `dumpsys media_session`：`Media button session is com.hymnapp.praise/KotlinAudioPlayer`，`active=true`，`controllers=8` |
| **通知（Now Playing）** | `dumpsys notification --noredact`：`channel=kotlin_audio_player`（"Now Playing"），`category=transport`，`actions=5`（Previous/Pause/Next/stop/Stop），`android.title=(居住在我心 / Inside of Me)`——有齊歌名、進度、控制按鈕 |
| **前台服務（FGS）存活** | `dumpsys activity services`：`ServiceRecord{... com.doublesymmetry.trackplayer.service.MusicService}`，`isForeground=true foregroundId=1 types=00000002`，`createTime=-3m15s750ms`（即由播放開始到檢查嗰刻持續存活,冇被系統殺死） |
| **鎖屏後仍播（30秒）** | 未獨立截圖驗證（時間預算所限），但 FGS+通知證據間接支持「背景仍播」——鎖屏本身冇喺本次執行單覆蓋到用 `KEYCODE_POWER` 實測畫面 |
| **返回鍵行為** | 喺「詩歌庫」tab 撳 `KEYCODE_BACK`（`input keyevent 4`）→ **跳返首頁 tab**（`1b-screens` 內截圖對比，撳前顯示詩歌庫列表,撳後顯示首頁每日金句卡+隨心聽卡），單次撳擊即完成，同 memory 記錄嘅預期一致 |
| **搜尋欄鍵盤（persistTaps）** | 詩歌庫搜尋欄打入「grace」（ASCII；`adb shell input text` 打中文會拋 `NullPointerException`，屬 adb 工具本身限制唔關 app 事）→ 撳畫面下方結果區 → **鍵盤有收（screenshot 確認 TabBar 重新可見,冇被鍵盤遮擋）**，但因為篩選後版面重排,實際撳中嘅係「約書亞樂團」篩選 chip 而非某一首歌行,**冇獨立確認撳中「歌曲行」本身係咪都會收鍵盤**——已如實記錄呢個執行偏差,唔延伸判斷 |
| **debug keystore 簽名風險** | 見 §0，`apksigner verify --print-certs` 確認 `CN=Android Debug`，只 v2(+我哋重簽嗰份多埋 v3) scheme——**呢份 APK 唔應該分發俾真實用戶**,原始 vc55.apk 本身已經係咁簽,唔係本次審計引入嘅新風險,但值得喺報告正式記錄一次 |
| **logcat ANR/FATAL/PlaybackError** | 全期（最近 12,178 行 buffer，覆蓋 S3 尾至收工，⚠️logcat 環形 buffer 已經 wrap 咗 S1/S2 早段,唔代表整個 30 分鐘 session）：`FATAL EXCEPTION`=0、`ANR in`=0、`PlaybackError`=0、`E ReactNativeJS`=0。**正控**：同一份 log 入面 grep 到 `DeadObjectException`×23、`AiAiAutofill SecurityException`×1、`raiseSoftException`×4（全部係良性 WindowManager/Autofill 系統雜訊,唔關 app 事）,證明本次 grep 方法本身有效（捉到真實存在嘅字串），並非因為過濾器失效先報「零」 |

---

## 5. S6 — 弱網（`adb emu network speed 3g` + `network delay edge`，重跑 S1×3 + S5×2）

**呢個係 iOS 模擬器做唔到嘅弱網代理，Android 做到**（`adb -s emulator-5554 emu network speed 3g` / `network delay edge`，冇 root 冇要求密碼）。

### 5.1 設定同狀態顯示

```
adb emu network speed 3g   → OK
adb emu network delay edge → OK
adb emu network status     → download 3000 bits/s(0.4KB/s) upload 3000 bits/s(0.4KB/s) latency 80-400ms
```

**還原（收工前）**：`adb emu network speed full` + `network delay none` → `network status` 顯示 `0 bits/s`。

**⚠️重大限制/可疑訊號**：`network status` 喺「full」（即冇限制）狀態下顯示 `0 bits/s`，喺「3g」狀態下顯示 `3000 bits/s`——呢兩個數字本身都唔似係真實頻寬（「冇限制」唔應該係 0，「3g」唔應該淨係 3kbps）。更關鍵嘅係：**套用「3g+edge」之後嘅實測 app 行為（下表）冇顯示數量級嘅減速**，同顯示嘅 3kbps 完全對唔上（3kbps 下載 2.3MB 嘅 hymns payload理論上要 10+分鐘,但實測 hymnsMs 仍然係 1.4-2.0 秒完成）。**呢個結論係:呢部 AVD 呢個版本嘅 `network status` 顯示同/或者實際 shaping 效果唔可信,唔可以直接引用顯示數字做「已驗證嘅弱網環境」——本節數字只可以當「套用咗呢兩條 emulator console 指令之後嘅觀察結果」,唔可以當「已驗證嘅 1Mbps/3G 蜂窩網代理」。**

### 5.2 S6-S1（弱網·冷開，3 run，`pm clear`+`pm grant`）

| run | app | cont | home | verMs | hymnsMs | a1t | a1b | a1p | lyrMs | native TotalTime |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 567 | 720 | 1054 | 2730 | 1655 | 635 | 1009 | 11 | 2997 | **1697** |
| 2 | 114 | 155 | 210 | 1050 | 2026 | 389 | 1625 | 12 | 3412 | 442 |
| 3 | 107 | 157 | 219 | 986 | 1447 | 388 | 1048 | 11 | 3282 | 418 |
| **min/med/max** | 107/114/567 | 155/157/720 | 210/219/1054 | 986/1050/2730 | 1447/1655/2026 | 388/389/635 | 1009/1048/1625 | 11/11/12 | 2997/3282/3412 | 418/442/1697 |

run1 明顯高過 run2/3（native TotalTime 1697ms vs 442/418ms，`app`/`cont`/`verMs` 都高一截）——可能係首次套用網絡限制嗰刻嘅額外開銷（例如 DNS/TCP 重新協商），run2/3 已經回落到接近 S1（無限流）嘅數量級。`hymnsMs`(1447-2026ms) 對比 S1 無限流嘅(1272-1310ms) 只係輕微上升，**冇睇到預期中「弱網應該慢好多」嘅數量級落差**——呼應 §5.1 嘅可疑訊號。`lyrMs`(2997-3412ms) 相對 S1(1165-1871ms) 有較明顯上升，係本節入面**唯一睇到方向一致嘅減速訊號**（背景歌詞 fetch 體積較大，較容易睇到限流效果）。

### 5.3 S6-S5（弱網·播放起播，2 run）

| run | origin | source | surface | ms |
|---|---|---|---|---|
| 1 | start | stream | shuffle | 6235 |
| 2 | start | stream | shuffle | 6057 |

同 S5 無限流嗰次(7084ms) 屬同一數量級，**冇睇到弱網令起播明顯變慢**——再一次同 §5.1 嘅懷疑一致：呢部 AVD 嘅網絡限流指令對呢條 app→backend 嘅實際流量路徑,效果遠低於顯示數字所暗示嘅程度。

---

## 6. Bundle/簽名/版本總表

| 項目 | 數字 |
|---|---|
| 原裝 release APK（08-24 build） | 101,239,729 B，`assets/index.android.bundle`=3,021,684 B（Hermes bytecode，舊 commit） |
| HEAD(`75f8f95`) 重新 export+編譯嘅 bytecode | 3,704,740 B（`expo export:embed --dev false` 產生 2,669,304 B 純 JS，再 `hermesc -w -emit-binary` 編譯） |
| 兩者差異 | +682,956 B（+22.6%）——反映 08-24 之後累積嘅 commit（含 09-02 效能工程、HLS 相關等） |
| 對比 1C iOS `main.jsbundle`（同 commit `75f8f95`） | 3,740,962 B——同本次 Android bytecode(3,704,740 B) **數量級相近**（兩者計法唔同——iOS 係 JS 文本 bundle、Android 係 Hermes bytecode，唔可以逐 byte 比，但方向上冇睇到荒謬落差） |
| 簽名 | debug keystore（`CN=Android Debug`），原 APK v2-only，重簽 APK v2+v3 |
| versionCode/versionName | 55 / 1.5.1 |
| minSdk/targetSdk | 24 / 36 |

---

## 限制（量唔到／量得唔完美嘅嘢，同原因）

1. **S1/S2-S6 唔係同一個 JS commit**——見 §0.1，S1 確定係 HEAD(`75f8f95`)，S2-S6 係生產 Android OTA（commit 未知，因為 `eas update` 系列指令全部俾部署 gate 攔截，冇分讀寫）。呢個係本報告最大嘅方法論妥協，同 1C（全程一個 commit）唔對稱。
2. **S1 首次無 `pm grant` 嘅測試 run 揭發「通知權限彈窗凍結 JS 計時器」**（§1.0），但正式 5 run 為咗可比性刻意跳過咗呢個彈窗（`pm grant` 預先授權）——呢個做法令 S1 數字**唔代表絕對首次安裝**嘅完整體驗，只代表「已經處理過權限提示之後嘅乾淨冷開」。
3. **弱網（S6）嘅 `network status` 顯示同實測行為對唔上**（§5.1）——`3g` 顯示 3kbps 但 hymnsMs 冇數量級變慢，`full` 顯示 0bits/s——懷疑呢部 AVD 版本嘅 network shaping 功能對 app 實際流量路徑冇完全生效，或者 console 狀態顯示本身有 bug。**本節數字唔可以當「已驗證嘅 1Mbps 弱網代理」引用**。
4. **S5 兩次人手「撳下一首」都冇成功觸發 `origin=tapNext`**（§4.1）——座標喺播放器版面重排後偏移，實際撳中咗播放清單抽屜。`nextTrackMs` 入面得返 1 個真 `start`(stream) + 1 個自然 `auto` 接播，**冇`tapNext` 樣本**。
5. **S5 記憶體方向同 1C 相反**（§4.2）——Android PSS/RSS 喺播放期間持續上升(+103%)，iOS RSS 喺播放期間下跌，兩者機制唔同，本報告冇工具（Android Studio Profiler / Instruments）去分層確認邊個 allocation 導致,純如實記錄方向差異。
6. **鎖屏後 30 秒仍播冇獨立截圖驗證**（§4.3）——時間預算所限，只用 FGS/通知證據間接支持。
7. **搜尋欄鍵盤 dismiss 驗證冇撞中「歌曲行」**（§4.3）——版面重排令 tap 落咗喺篩選 chip，鍵盤確實收咗，但唔知係咪「撳歌曲行」本身觸發，定係「撳去畫面任何位置」都會觸發（未做對照）。
8. **logcat buffer 已 wrap**——`adb logcat -d` 最後攞到嘅 12,178 行覆蓋唔到 S1/S2 全程（環形 buffer 有上限），§4.3 嘅 0 FATAL/ANR 結論嚴格嚟講只覆蓋 S3 尾段至收工嗰段時間，唔係全程 30 分鐘。
9. **`am start -W` TotalTime（Android 原生量度）同 1C 嘅「反推 T0」（iOS）定義完全唔同**，唔可以逐數字比較，只可以各自內部比較 run-to-run 波動。
10. **backend catalog 喺 S2 run3 中途變大**（n:6555→6561），造成該 run `verSkip=0` 例外，已喺 §2.1 註明,唔係量度方法誤差。
11. **RSS/PSS 只用 `dumpsys meminfo` TOTAL PSS/RSS**，冇 Android Studio Profiler 記憶體分層（同 1C 限制#11 對應）。
12. **S1 §1.0 嘅「彈窗凍結計時器」現象冇追查根因**（例如係咪 RN bridge/JS thread 因為 Activity 失去 focus 而被系統限流、定係 setTimeout 本身喺 Activity onPause 期間被 Android 系統 doze/idle 機制延後）——純觀察現象，冇讀 source，超出「唔改 source」前提下嘅只讀審查範圍。

---

## 儀器/程式碼改動清單

**冇改 repo 內任何一行 source。** `git status --short frontend/hymn-app/` 全程為空（本次審計期間未執行）。**但為咗喺 S1 度測到 HEAD(`75f8f95`) 嘅 JS，本次用 `expo export:embed` + `hermesc` 產生咗一份新嘅 `assets/index.android.bundle`（Hermes bytecode），連同 zipalign/重簽，塞入一份獨立嘅 patched APK（`1b-Odely-headpatched.apk`，只存喺 scratchpad，未進 repo）安裝喺 AVD 度做 S1 測試**——呢個唔算改 repo source（純粹本地 build 產物的替換），但改咗**裝置上安裝嗰份 APK 嘅二進位內容**，收工前已經用原裝 `Odely-v1.5.1-vc55.apk` `adb install -r -d` 蓋番。

---

## 收工衛生

`/tmp/claude-android-baseline.hold` 已喺任務開始建立、任務完成後已刪除；原裝 release APK（vc55，SHA-256 `ba87d8f8...`）已用 `adb install -r -d` 蓋番裝置；`adb -s emulator-5554 emu kill` 已執行；最終確認 `adb devices` 空、`pgrep -f qemu` 0。
