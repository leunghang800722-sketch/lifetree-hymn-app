# DEEP-AUDIT-1B-OPUS-20260906 — Opus 5 獨立驗收：`DEEP-AUDIT-1B-ANDROID-20260906.md`

驗收者：Opus 5（獨立，唔係執行者）。範圍：Phase 1B Android 運行時 baseline。
**冇改任何 source、冇 commit、冇部署、冇掂 Cloudflare/DNS/cert/token、冇跑任何 `eas`/`launchctl` 指令。**
唯一寫入動作：本文件 + `DEEP-AUDIT-ROOTCAUSE-20260906.md` §1.0/§3/§4/§6 嘅增量編輯（任務 B 部分）。

**開過 AVD**（任務明文批准）：`hymntest` 一部，`2026-09-05T18:15Z`→`18:31Z`（本地 09-06 02:15-02:31）。
`touch /tmp/claude-android-baseline.hold` 先開機、收工 `adb emu kill` + 刪 hold + `pgrep -f qemu` = 0 + `adb devices` 空 + iOS sim booted = 0（全部已驗）。
裝置留返原狀：原裝 vc55 APK（signature `FA:C6:17:45:…`，v2-only）、生產 OTA 已落地、`POST_NOTIFICATIONS granted=true`。

驗收方法：①逐格對返 `ops/perf/audit-20260906/1b-raw/` 原文同 `backend/logs/client-log/client-log-2026-09-05.jsonl` 嘅 android row；②所有 min/median/max 我自己由零重算，唔信報告嘅算術；③報告冇引嘅 raw 欄位我自己揾返（S1 meminfo × 15、S2 native TotalTime、`wallClockDrift`、合併 manifest）；④兩個關鍵推論（§1.0 計時器凍結、§4.2 記憶體）我喺 AVD **帶負控**重現。

---

## 0. 一句判詞

**S1、S2 逐 run 表、S3 逐 tap 表、S5/S6 起播數、§4.3 三行 dumpsys、§6 bundle/簽名表全部對得返 raw，量度誠實、偏差有記錄；但有 2 條結論係錯歸因／錯前提（一條令報告最大嗰個「方法論妥協」根本唔存在，一條將「詩歌庫畫面成本」當咗「播放洩漏」），4 個 summary 數字算錯，1 張表（§2.2 perfHome）有兩行係拼湊出嚟、對唔返任何一條 beacon，2 條 nextTrackMs 漏報，另加 §4.3/§5 有 5 項結論完全冇原始證據入 archive（其中一句明文引用一批唔存在嘅截圖）。**

修正之後，1B **可以**做 Phase 3 嘅 Android 改前基準 —— 但只有 §8 表列嗰批；§4.2 記憶體要**全部改用我重量嗰組**，§5 弱網線同 §4.3 三行（logcat/返回鍵/鍵盤）不合格。

---

## 1. ① 逐 run 對數

### 1.1 §0 建置 provenance —— 全中

| 報告值 | 我獨立核 | 結果 |
|---|---|---|
| APK 101,239,729 B | `ls -la frontend/hymn-app/android/app/build/outputs/apk/release/Odely-v1.5.1-vc55.apk` | ✅ |
| SHA-256 `ba87d8f8…` | `shasum -a 256` → `ba87d8f836678c3afe0f4ade4c5ec0efb8a4ebd83f7aa034c7acfc0aa47514b3` | ✅ |
| `assets/index.android.bundle` = 3,021,684 B | `unzip -l` 同一數字 | ✅ |
| minSdk 24 / targetSdk 36 | `apkanalyzer manifest print` → `android:minSdkVersion="24" android:targetSdkVersion="36"` | ✅ |
| debug keystore `CN=Android Debug` | 裝置 `dumpsys package` → `Signatures: [FA:C6:17:45:DC:09:…]`、`version:2` only | ✅（同報告 `fac61745…` 對得上） |
| app.json runtimeVersion android=4 / ios=5 | `app.json` 頂層 `"runtimeVersion":"4"`，`ios.runtimeVersion="5"`，android **冇** override | ✅ |
| §6 bundle 差 +682,956 B = +22.6% | 682,956 / 3,021,684 = 22.60% | ✅ 算術啱 |

### 1.2 §1.1 S1 五個 run × 13 欄 —— **全中**（唯獨 deviceId 一欄抄錯 5/5）

逐 run 對 `client-log-2026-09-05.jsonl` 17:39:29–17:41:41Z 嘅 `perfMarks`：

| run | 報告 dev(尾6) | raw 真值(尾6) | 其餘 12 欄 |
|---|---|---|---|
| 1 | `8544c8` | **`b544c8`** | 全中 |
| 2 | `47fd6`（得 5 位） | **`047fd6`** | 全中 |
| 3 | `03d56f6`（7 位） | **`3d56f6`** | 全中 |
| 4 | `c6639`（5 位） | **`bc6639`** | 全中 |
| 5 | `852fb`（5 位） | **`1852fb`** | 全中 |

欄頭寫「尾6」但實際出現 5/6/7 位混雜，五個全部同 raw 對唔上。**單獨睇係抄寫瑕疵，但佢會遮蔽一件事**：run5 嘅 `1852fb` 就係 S2 全程用嗰個 deviceId（`46f355885b87a2cd599f99803f1852fb`）—— 因為 S1 run5 之後冇再 `pm clear`。呢個連續性係 S1→S2 可比嘅一個好證據，報告因為抄錯咗睇唔到。

min/median/max 我全部重算，**十欄全中**（`app` 113/114/119、`cont` 151/159/169、`home` 184/220/236、`verMs` 933/960/1283、`hymnsMs` 1272/1281/1310、`a1t` 389/390/399、`a1b` 857/879/908、`a1p` 12/13/16、`lyrMs` 1165/1244/1871、native TotalTime 441/458/473；`byt` 5 run 全 2,381,052；`ok1` 5/5）。
S1 全部 `mmkvRead=0 parse=- cacheReady=-`，`verSkip=0`，同報告一致。

### 1.3 §2.1 S2 五個 run —— 逐格全中，**summary 行四個 max 錯**

逐 run（1852fb，17:44:55/17:45:27/17:45:58/17:46:30/17:47:01Z）全中。17:44:22Z 嗰條（app=196 verMs=2861）係報告講嘅 priming relaunch，冇當 run，正確。

`run3 verSkip=0` 嘅解釋成立：run3 條 beacon `byt=2383380`（S1/priming 係 2381052），run4 `n=6561`（之前 6555）。**catalog 真係中途大咗，唔係量度誤差** ✅。

**🔴 錯 #1 —— summary 行四個 max 全部漏咗 run3**

| 欄 | 五個實測值 | 報告 min/med/max | 正確 min/med/max |
|---|---|---|---|
| `cont` | 204, 209, **233**, 208, 219 | 204/209/**219** | 204/209/**233** |
| `mmkvRead` | 22, 21, **31**, 22, 23 | 21/22/**23** | 21/22/**31** |
| `cacheReady` | 202, 208, **231**, 205, 216 | 202/208/**216** | 202/208/**231** |
| `verMs` | 1226, **1229**, 1198, 1195, 1221 | 1195/1221/**1226** | 1195/1221/**1229** |

median 四欄都啱。`app` / `parse` / `home` 三欄全中。

### 1.4 §2.2 perfHome —— **🔴 錯 #2：兩行係拼湊，一個 run 整行消失**

`1852fb` 喺 S2 窗口實際有 5 條 `perfHome`（每 run 一條，T0+5s）：

| # | ts | chips | pages | today | recent | lib | libIdle |
|---|---|---|---|---|---|---|---|
| run1 | 17:44:35.528 | 4.770 | 2.852 | 13.879 | 5.939 | 219.091 | 857 |
| run2 | 17:45:07.008 | 4.193 | 3.733 | 15.078 | 5.209 | 219.228 | 860 |
| **run3** | 17:45:38.579 | 4.146 | 3.082 | 16.184 | 5.901 | **205.270** | 871 |
| run4 | 17:46:10.083 | 3.293 | 2.787 | 14.394 | 5.327 | 211.635 | 840 |
| run5 | 17:46:41.605 | 3.094 | 3.379 | 16.382 | 5.719 | 208.824 | 867 |

報告張表：row1 = run1 ✅、row2 = run2 ✅、row3 = **run4**（標錯做 run3）、
row4 = `2.11 / 2.74 / 15.03 / 5.76 / 208.82 / 867` —— **冇任何一條 beacon 有呢六個值**：`lib`+`libIdle` 係 run5 嘅，頭四欄最接近嘅係 `03e558@17:57:05`（S6 嗰部機，chips=2.110 pages=2.742）但 `today`/`recent` 又對唔上；
row5 = `3.09 / 3.38 / 16.38 / 5.72 / 211.65 / 871` —— 頭四欄係 run5、`lib` 係 run4、`libIdle` 係 run3。**三個 run 嘅欄位撈埋一齊。**

後果：**真正嘅 run3（`lib=205.27`，五個 run 入面最細）成行從未出現**，所以報告寫「`lib` 208.82-219.23ms」係錯。
正確：**205.27 – 219.23，median 211.64**。（結論「同 1C iOS S2 197-217ms 屬同一數量級」仍然成立，但要用返啱嘅範圍。）

### 1.5 §2.3 perfRenders —— 全中

run3 `Home=9 Library=6 Mine=9` vs run1/2/4/5 `Home=5 Library=2 Mine=5` ✅ 逐條對得返（17:44:45 / 17:45:17 / 17:45:48 / 17:46:20 / 17:46:51Z）。「同 `verSkip=0` 觸發額外 render 一致」呢個內部一致性推論成立。

### 1.6 §3 S3 perfNav —— 10 條逐條全中，**median 兩個算錯**

10 條 `perfNav`（1852fb，17:48:40.292 → 17:48:54.045Z）逐個 `tab` / `tapToMount` / `tapToPaint` **全中**。
`perfMarks.js:280` `if (navBeaconsSent >= 10) return;` —— cap 10 屬實 ✅，報告引用嘅行號正確。

**🔴 錯 #3 —— n=10 嘅 median 要取第 5、6 位平均，報告兩個都取錯**

| 欄 | 排序 | 報告 median | 正確 median |
|---|---|---|---|
| `tapToMount` | 42,75,75,77,**83,86**,88,95,107,113 | 83.5 | **84.5** |
| `tapToPaint` | 99,101,102,118,**122,125**,134,146,149,232 | 125 | **123.5** |

min/max 兩欄都啱（42/113、99/232）。

### 1.7 §4.1 S5 `nextTrackMs` —— **🔴 錯 #4：漏咗兩條**

`1852fb` 喺嗰晚實際有 **4** 條 `nextTrackMs`，報告只列 2：

| ts | detail | hymnId | 報告有冇 |
|---|---|---|---|
| 17:49:37.393 | `ms=6242 origin=start source=stream surface=shuffle first=1` | 4048 | ❌ 漏（喺 S5 launch 之前，屬 S3 之後嗰段） |
| 17:50:13.310 | `ms=7084 origin=start source=stream surface=shuffle first=1` | 7454 | ✅ |
| 17:53:26.010 | `ms=1 origin=auto source=stream` | 7664 | ✅ |
| 17:55:11.722 | **`ms=0 origin=auto source=stream`** | 4254 | ❌ 漏 |

`tap_shuffle_ts=1788630605.92` = `17:50:05.92Z`，+7.084s = `17:50:13.0` → 報告揀 7084 做 S5 正選係啱 ✅。
但 Android progressive 起播嘅**樣本數實際係 4 個（6057 / 6235 / 6242 / 7084 ms）唔係 3 個**，`auto` 接播係 **2 次**唔係 1 次。呢個對 baseline 有實質分別（樣本 +33%）。

「兩次人手撳下一首都冇留低 `origin=tapNext`」屬實（17:50:26 / 17:50:46 前後冇任何 `nextTrackMs`）✅，誠實記錄 ✅ —— 但「撳中咗播放清單抽屜手柄」呢個解釋嘅 `uiautomator dump` 冇入 archive，屬未佐證嘅推測（見 §3 證據缺口）。

「`hlsStartupKick`/`hlsFallback`/`midStallNudge`/兩個 `giveup`/`PlaybackError` 全部 0 條」屬實 ✅ —— 該日 android row 得 6 種 event（`perfRenders` 38 / `perfHome` 27 / `perfMarks` 25 / `perfNav` 17 / `wallClockDrift` 6 / `nextTrackMs` 6），列出嗰六種一條都冇。
⚠️ 但同一組 event 入面有 **`wallClockDrift` × 6** 報告完全冇提，其中一條就係 §1.0 嗰單嘅硬證據（見 §2）。

### 1.8 §4.3 三行 dumpsys —— 全中；一句輕微報大

| 行 | raw（`1b-s5.log` L205/246/305 起） | 結果 |
|---|---|---|
| MediaSession | `Media button session is com.hymnapp.praise/KotlinAudioPlayer`、`active=true`、`controllers: 8` | ✅ |
| 通知 | `channel=kotlin_audio_player`、`category=transport`、`actions=5`、`android.title=String (居住在我心 / Inside of Me)` | ✅ |
| FGS | `isForeground=true foregroundId=1 types=00000002`、`createTime=-3m15s750ms` | ✅ |

⚠️ 「有齊歌名、進度、控制按鈕」嘅「**進度**」冇直接欄位支持 —— extras 只有 `android.progressIndeterminate=Boolean (false)`，冇 `android.progress`/`android.progressMax`。真正令 seekbar 出到嘅係 `android.mediaSession=Token`。輕微報大，改為「歌名 + 5 個控制掣 + MediaSession token（seekbar 由佢驅動）」。

### 1.9 §5 S6 —— 逐格全中

S6-S1 三個 run（`aa55aa` / `ff039a` / `03e558`）同 S6-S5 兩條 `nextTrackMs`（6235 / 6057）逐格對得返 ✅，min/med/max 十欄全部重算後全中 ✅，native TotalTime 1697 / 442 / 418 對得返三個 raw 檔 ✅。
（結論部分有問題，見 §4。）

---

## 2. ② §1.0「通知權限彈窗凍結 JS 計時器」—— 我喺 AVD 重現咗，**帶負控**

### 2.1 報告冇引嘅硬證據：佢自己個儀器已經量到

`client-log-2026-09-05.jsonl`：

```
{"ts":"2026-09-05T17:37:45.343Z","event":"wallClockDrift","appState":"active",
 "trackState":"none","detail":"driftMs=103998","platform":"android",
 "deviceId":"1953debedad89e39bd62205e52e3f4d8"}
```

`e3f4d8` 就係報告講嗰個「首次不帶 `pm grant` 嘅測試 run」。同一部機同一刻另外三條 beacon（`perfMarks` 17:37:44.972、`perfHome` 17:37:45.049、`perfRenders` ×2 17:37:44.969/45.344）—— **四條喺 375ms 內湧到**，同報告「400ms 內」嘅描述吻合 ✅。

`wallClockDrift` 嘅定義（`App.js` @`75f8f95` L2096-2107）：
```js
const drift = nowTs - lastTickTsRef.current - lastPollTargetMsRef.current;
if (drift > 5000) { … logDiag('wallClockDrift', …) }
```
即「呢個 poll loop 隔咗幾耐先再行到，減去佢應該瞓幾耐」。**`driftMs=103998` = poll loop 停咗 104 秒**。
報告寫「本次觀測到嘅一次凍結咗至少 55 秒」—— **呢個 55 冇出處，而佢自己個儀器已經俾咗 104 秒**。用返 104。

### 2.2 我嘅重現（正控）

**唔使 `pm clear`**：`pm revoke android.permission.POST_NOTIFICATIONS` 就可以令對話框再出，app data / OTA 狀態完全保留。

```
18:20:07Z  am force-stop; pm revoke POST_NOTIFICATIONS; am start -W  → TotalTime: 258
18:20:15Z  dumpsys window → mCurrentFocus=Window{… com.google.android.permissioncontroller/
                            …permission.ui.GrantPermissionsActivity}
           uiautomator → text="Allow Odely to send you notifications?"
                         permission_allow_button bounds=[133,1231][947,1378]
18:20:07 → 18:22:01Z（114 秒，對話框一直喺頂）
           backend client-log 新增 android row：**0 條**
           （應到未到：perfHome T0+5s、perfRenders t=15、perfMarks T0+25s、perfRenders t=60）
18:22:20Z  input tap 540 1304（Allow）
18:22:22.088Z  perfMarks   app=173 cont=271 mmkvRead=25 parse=21 cacheReady=270
                           home=569 verMs=1516 hymnsMs=1397 att=1 ok1=1
18:22:22.143Z  perfRenders t=15
18:22:22.144Z  perfHome    lib=229.01
18:22:22.464Z  wallClockDrift appState=active trackState=none **driftMs=131162**
18:22:22.470Z  perfRenders t=60
```

**5 條 beacon 喺 382ms 內全部到**，`driftMs=131162` ≈ 對話框在頂嘅 132 秒。**現象 100% 重現。**

### 2.3 負控 —— 呢個先係新嘢：**唔係「背景就凍」**

同一部機、同一份 OTA、冇對話框，單純撳 HOME：

```
18:16:03Z  am start -W → TotalTime: 432（COLD）
18:16:39Z  input keyevent KEYCODE_HOME
18:16:44Z  dumpsys activity activities → topResumedActivity 空、
                                          Task visible=false visibleRequested=false
18:17:04.606Z  perfRenders t=60 到達 ← setTimeout(60000) **準時 fire，背景咗 25 秒之後**
18:18:21Z  重新 am start
           全程冇任何 wallClockDrift
```

**所以「Activity onPause 令 RN JS timer 凍結」呢個最直觀嘅機制被推翻。** 我讀過條 source：
`frontend/hymn-app/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt:72-76`
```kotlin
override fun onHostPause() { isPaused.set(true); clearFrameCallback(); maybeIdleCallback() }
```
`clearFrameCallback()`（L140-150）有一個 `&& !headlessJsTaskContext.hasActiveTasks()` 條件；`react-native-track-player@4.1.2` 嘅 `MusicService`（`android/…/service/MusicService.kt:45,98,806-807`）係 `HeadlessJsTaskService`，`HeadlessJsTaskConfig(TASK_KEY, …, 0, true)`（timeout=0＝永不自動完）。**呢條係一個可能解釋，但我唔會寫落根源文件當已知** —— 因為我個負控只證明咗「HOME 唔凍」，冇證明「點解對話框凍」。

**判**：
- 現象：✅ 真、可重現、有儀器數（drift ≈ 阻塞時長，兩次獨立觀測 104s / 131s）。
- 報告寫嘅機制（「RN JS thread 計時器疑似俾系統凍結」）：**未證實，而且最直觀嗰個版本被我個負控推翻**。原文用咗「疑似」，誠實 ✅，但唔可以升格做結論。
- **真用戶影響：低。** ①首次安裝一次；②mark **值**冇被污染 —— 18:22:22 嗰條 `perfMarks`（app=173 cont=271 home=569 verMs=1516 hymnsMs=1397）同正常 warm run 同一 family，只係**送**遲咗，唔係量錯。
- **對儀器嘅影響：中。** 任何 beacon 都可以無限期遲到，`t=15`/`t=60` 呢啲 label 唔可以當「真係過咗 15/60 秒」。→ 見 §6 對 C1 嘅建議。

### 2.4 順手更正 N-7（`wallClockDrift` 「永遠解讀唔到」）

該日 6 條 android `wallClockDrift` **全部 `trackState="none"`**。即係話 **`trackState` 已經係一個現成嘅第一層判別欄位**，唔使等 W1 加嘢就已經答到「呢條 drift 有冇播緊歌」。加上我今次證實咗喺「前台被外來 Activity 阻塞」呢類個案，`driftMs` 係一個**準確**嘅阻塞時長計（131162 vs 132 秒）。
N-7 寫「現狀係一個永遠解讀唔到嘅 event」講得太死 —— 應改為「加 `appState`/`bgMs` **之外保留 `trackState` 做第一層分流**，唔好剷」。

---

## 3. ③ 正控核實 + 證據 archive 缺口

### 3.1 「零 FATAL / ANR / PlaybackError」嘅正控 —— **無法核實**

報告 §4.3 話「同一份 log 入面 grep 到 `DeadObjectException`×23、`AiAiAutofill SecurityException`×1、`raiseSoftException`×4，證明 grep 方法本身有效」。**邏輯上呢個正控設計係啱嘅**（memory `feedback-exec-sheet-evidence-format` 嘅「儀器正控」要求），但：

```
$ grep -rl "FATAL\|logcat\|network speed\|uiautomator" ops/perf/audit-20260906/1b-raw/
（零命中）
$ ls ops/perf/audit-20260906/1b-raw/
1b-s1-run{1..5}.log  1b-s2-run{1..5}.log  1b-s5.log  1b-s6-s1-run{1..3}.log  1b-s6-s5-run{1..2}.log
```

**`1b-raw/` 入面完全冇 logcat 檔。** 「12,178 行」、四個 0、三個正控數字全部係轉述，冇一個第三者可以覆核。加上報告自己講 buffer 已經 wrap 咗 S1/S2 早段 —— 呢行**唔可以做 Phase 3 嘅 before**，要重做並且存檔。

### 3.2 §4.3 返回鍵行 —— **引用咗一批唔存在嘅截圖**

原文：「（`1b-screens` 內截圖對比，撳前顯示詩歌庫列表, 撳後顯示首頁每日金句卡+隨心聽卡）」

```
$ ls ops/perf/audit-20260906/1b-screens/
s1-run1-t3s.png  s1-run1-t30s.png  s5-after-3min.png
```

**三張全部係 S1/S5，冇任何返回鍵前/後截圖。** 呢句係假引用。返回鍵行為結論唔可以引用。

### 3.3 其餘冇 archive 嘅

| 項 | 原文位置 | 狀態 |
|---|---|---|
| `uiautomator dump` tab bar bounds（180/540/900, 2238） | §3 開頭 | 冇 archive |
| 「第二次撳擊落咗喺播放清單抽屜手柄」嘅 `uiautomator dump` | §4.1 | 冇 archive；屬未佐證推測 |
| `adb emu network speed/delay/status` 三段輸出 | §5.1 | 冇 archive |
| 鍵盤 dismiss 截圖 | §4.3 | 冇 archive（而且執行者自己講撞唔中歌曲行，本身已 void） |

**整體判**：1B 最「Android 專項」嗰一節（§4.3，正正就係總規劃書派俾 1B 嘅獨有價值）同埋 §5 全節，**係全份報告入面 archive 最薄嗰兩節**。S1/S2/S3/S5 數字線嘅證據鏈反而好扎實（beacon 全部喺 backend log 度，第三者查得返）。

### 3.4 「S6 限流無效」有冇更直接證據 —— 有，而且方向同報告相反

報告嘅推論係「hymnsMs 冇數量級變慢 → 限流可能冇生效」。**raw beacon 入面其實有更直接嘅分項數，而且顯示限流係有部分生效**：

| 欄 | S1（無限流，5 run） | S6-S1（限流，3 run） | 比 |
|---|---|---|---|
| `a1t`（ttfb） | 389 / 390 / 399 | 388 / 389 / **635** | 1.0× ~ 1.6× |
| `a1b`（body） | 857 / 879 / 908 | **1009 / 1048 / 1625** | 1.2× ~ 1.8× |
| `lyrMs` | 1165 / 1244 / 1871 | **2997 / 3282 / 3412** | 1.8× ~ 2.6× |
| `hymnsMs` | 1272 / 1281 / 1310 | 1447 / 1655 / 2026 | 1.1× ~ 1.5× |
| 起播 ms | 7084（1 個） | 6235 / 6057 | ~0.9× |

**四個網絡欄全部方向一致上升，體積愈大升幅愈大**（`a1t` ttfb 幾乎唔郁 → `a1b` body 1.2-1.8× → `lyrMs` 1.3MB 2.6×）。呢個係頻寬限流（唔係延遲限流）嘅典型指紋。所以：

- ✅ 報告「唔可以當已驗證嘅 1Mbps/3G 代理」——**成立，保留**。
- 🔴 報告「限流無效」/「效果遠低於顯示數字」——**講得太死**。正確講法：**限流有部分生效（body-size 相關嘅欄位一致升 1.2-2.6×），但幅度未經校準，遠低於 console 顯示嘅 3kbps 所暗示。**
- 🔴 **根本問題係 S6 冇儀器正控**：由頭到尾冇獨立量過 shaping 開住嗰陣嘅實際吞吐（例如喺 shaping 期間 `adb shell` 計時下載一個已知大細嘅檔）。冇正控就冇資格出「限流無效」呢個判斷。呢條係執行單紅線（memory `feedback-exec-sheet-evidence-format`「儀器正控」）。

---

## 4. ④ 方法論審：S1（patched APK）vs S2-S6（生產 OTA）—— **🔴 呢個分歧根本唔存在**

### 4.1 錯 #5（最重大）：嗰個 OTA 嘅 commit 十秒查得到，就係 HEAD

報告 §0.1 + 限制#1：「呢個生產 android OTA 嘅實際 git commit 查唔到 …… 呢個係本報告方法論同 1C 最大分歧 …… 兩者比較時要留意呢個差異，唔可以假設全程同一份 JS。」

**`~/.hymn-deploy/ota-groups.log` 最後一條 android publish：**

```
2026-09-05T16:53:28Z | publish | platform=android |
  sha=75f8f950618373495f74e8e8d7050c2da4581935 |
  group=115eba6d-6c6a-46cd-b26c-e78ee32122dc |
  message=在線 sheet 下滑收起（RNGH Pan）+ ✕ 關閉掣（75f8f950…）
```

`~/.hymn-deploy/deploy.log:535` 同一條。報告自己記錄 AVD 收到嘅係 `createdAt=2026-09-05T16:53:27Z` —— **差 1 秒**（EAS server 起 update 嘅時間 vs `ota-publish.sh` 收工落 log 嘅時間），而 16:53 之後直到量度完（18:00Z）冇再 publish 過 android。

**所以 S2-S6 行嘅 JS 就係 `75f8f95` = HEAD = S1 patched bundle 同一個 commit。**

後果：
1. **限制 #1 作廢。** 1B 同 1C 一樣係單一 commit，全份報告內部可比，S1 ↔ S2-S6 嘅比較全部有效。
2. §0.1「方法論決定（已記錄，兩條路徑並用）」呢段嘅風險警告可以刪。
3. S1 patch APK 嗰個工序**仍然係必要嘅**（`pm clear` 會令 app 跌返去 08-24 嘅內嵌 bundle，冇 `perfMarks` 儀器）—— 呢個判斷冇錯，錯嘅只係「S2-S6 commit 未知」。

### 4.2 兩條可行路徑都冇試過

- `ops/deploy/guard-bash.sh:57` `grep -qE 'eas[[:space:]]+update'` → deny。**報告話唯讀 `eas update:list` 都被擋，呢句係啱嘅** ✅（pattern 冇分讀寫）。
- 但 (a) `eas branch:view` **唔含 `eas update` 字串，唔會被擋** —— memory `project-ota-backlog-2026-08-23` 明文記錄過「`channel:view` 只吐一個 group，要用 `branch:view`」；(b) **本地 `~/.hymn-deploy/ota-groups.log` 先係權威來源**，`ops/deploy/ota-publish.sh:27` 同 `ota-rollback.sh:18,79` 都寫明佢係 rollback 推算嘅依據，memory index 亦有「OTA publish 記 group id」。
- 兩條都冇試就落「查唔到」呢個結論。**呢個係 gate 造成嘅盲點：撞咗一次 deny 就當死路，冇問「有冇第二個 source of truth」。**

### 4.3 反而有一個真嘅 S1 混淆變數，報告冇提

`1b-screens/s1-run1-t3s.png` 底部見到 OTA banner「已有新版本，撳一下更新」。呢個 banner 係 `UpdateBanner()`（`App.js` @`75f8f95` L4411-4413：`if (!isUpdatePending || dismissed) return null;`）—— 唔係 APK 側載嗰個（`ApkUpdateBanner` 要 `remoteCode > installedCode`，而 `backend/public/app-version.json` `versionCode=55` = 裝機 55，唔會 fire）。

即係話 **launch 後 3 秒內，OTA 已經下載完並且 pending**。`pm clear` 每個 run 都清走已下載更新 → **S1 五個 run 每個都有一次並行嘅 OTA bundle 背景下載**，同 `hymnsMs`/`lyrMs` 嘅量度窗口重疊。

`lyrMs` 正好係 S1 入面 run-to-run 波幅最大嗰欄（1165→1871，1.6×）。→ **S1 嘅 `lyrMs`（同較細程度上 `hymnsMs`/`a1b`）要標明「含並行 OTA 下載」**，after 量度要用同一條件（照樣 `pm clear`）先可比。

---

## 5. ⑤ §4.2「PSS 播放期間 +103%」—— **🔴 錯 #6：歸因錯，我喺 AVD 分離咗**

### 5.1 報告嘅數同算術冇錯

`1b-s5.log` L46/114/178：318,677 → 474,529 → 646,389 KB。318,677 → 646,389 = **+102.8%** ✅ 算術啱，raw 對得返 ✅。

### 5.2 但報告冇用自己 raw 入面現成嘅分層數（限制 #11 講「冇分層」係唔啱）

`1b-s5.log` 三個時點嘅 `App Summary` 一路都喺度：

| | +6s | +66s | +181s | Δ |
|---|---|---|---|---|
| Java Heap | 39,172 | 45,568 | 59,224 | +20,052 |
| **Native Heap** | **139,768** | **258,748** | **395,500** | **+255,732（佔總增長 78%）** |
| Code | 19,536 | 23,212 | 23,476 | +3,940 |
| Private Other | 101,140 | 124,952 | 145,656 | +44,516 |
| **Views** | **755** | **858** | **3,434** | **×4.0** |

限制 #11 寫「冇 Android Studio Profiler 記憶體分層」—— **分層數 raw 一直有，唔使 Profiler，唔使開機重跑。** 而且 `Views: 755 → 858 → 3,434` 呢個係全份 raw 入面最強嘅單一訊號，報告完全冇睇。

### 5.3 S1 raw 有一個現成嘅「無播放」負控，報告亦冇用

`1b-s1-run{1..5}.log` 每個 run 都有 +3s / +20s / +30s 三個 meminfo（共 15 個），報告一個都冇引：

| | +3s | +20s | +30s |
|---|---|---|---|
| TOTAL PSS | 283,241 – 312,984 | 349,223 – 352,473 | 344,186 – 345,573 |
| Native Heap（run1） | 185,132 | 196,784 | 196,788 |
| **Views（run1 / run5）** | **758 / 758** | **763 / 763** | **763 / 763** |

**冇播放、留喺首頁 30 秒：Views 由 758 升到 763 就停。** 呢個負控令下面個實驗企得穩。

### 5.4 我嘅重現：同一部 AVD、同一份 OTA、逐項分離

**A. 播歌 3 分鐘、全程唔撳「詩歌庫」**（launch 18:23:30Z，tap 隨心聽 18:23:37Z）

| | +6s | +66s | +181s |
|---|---|---|---|
| TOTAL PSS | 320,655 | 459,293 | **468,825**（+46.2%） |
| Native Heap | 179,428 | 261,776 | **267,260** |
| **Views** | 755 | 858 | **858** |

`+66s` 時 `dumpsys activity services` → `isForeground=true types=00000002`，確認真係播緊。
**播放本身 60 秒後就 plateau：+66s→+181s 只加 9.5MB PSS / 5.5MB native heap，Views 完全唔郁。**

**B. 跟住撳「詩歌庫」tab**（18:27:12Z）

| 撳完幾耐 | TOTAL PSS | Native Heap | Views |
|---|---|---|---|
| +10s | **639,774** | **409,720** | **3,434** |
| +30s | 632,754 | 409,820 | 3,434 |
| +60s | 640,172 | 407,316 | 3,434 |
| +120s | 642,956 | **402,248**（回落） | 3,434 |

**10 秒內：Views 858 → 3,434、PSS +170.9MB、native heap +142.5MB。之後 110 秒完全 plateau**（Views 一格都唔郁、PSS 632-643MB 無趨勢、native heap 反而慢慢跌）。

**C. 撳返「首頁」tab**（18:31:11Z，+25s 後量）

| | Views | Native Heap | TOTAL PSS |
|---|---|---|---|
| 離開詩歌庫後 | **858**（還原） | **401,048（唔還）** | 649,151 |

### 5.5 判

1. **`3,434` 呢個數同 1B S5 嘅 `3,434` 一模一樣**（兩次獨立 session、獨立 launch），確定性極高。
2. 1B S5 嘅時序：`tap_library_ts=17:51:01`（launch+61s）→ `+66s` 量到 Views 仍係 858（詩歌庫啱啱 mount）→ `+181s` 量到 3,434。**兩個 stray tap（+26s / +46s，報告話撳開咗 queue 抽屜）都喺 `+66s` 之前，而 `+66s` 個 Views 仍係 858 → 抽屜排除。** `+66s → +181s` 之間唯一新嘢就係詩歌庫畫面。
3. **所以 §4.2 嘅「+103%」唔係播放造成，係撳「詩歌庫」tab 嗰下。** 播放單獨嘅成本係 +46%（而且 60 秒就到頂）。
4. **唔係洩漏。** 詩歌庫係一次性、10 秒內到頂、之後 110 秒零增長。
5. **但係一個真嘅 Android 記憶體足印問題**：詩歌庫 mount 一次 = **+170.9MB PSS / +2,576 Views**，而且**離開 tab 之後 View 釋放咗、~140MB native heap 唔釋放**。候選 = RN/Fresco 嘅 native bitmap pool（3,434 個 row 嘅封面圖）。**證據強度：中**（native heap 唔隨 View 釋放呢個形狀符合 bitmap pool，但我冇量過 Fresco counter），**唔可以當實錘**。
6. 報告「同 1C iOS 方向相反（iOS RSS 播放期間下跌）」呢個對照 —— **前提已經冇咗**（Android 呢邊唔係播放造成），呢句要刪。
7. 總 PSS 峰值 **~646MB**（1B）/ **~649MB**（我）：對低階 Android 機係實質嘅 OOM／被系統回收風險，值得入 W9。

---

## 6. ⑥ 對其他 cluster 嘅影響

| Cluster | 1B 帶嚟嘅改動 |
|---|---|
| **C1（儀器）** | ✅ **要加 `sinceLaunchMs`**。§2 證實：`t=15`/`t=60`/`perfMarks@25s` 全部只係**名義** delay，實際到達時間可以遲 132 秒而且冇任何痕跡（drift beacon 係另一條 event，唔會同 perfMarks 綁埋）。建議每條 beacon 加 `sinceLaunchMs = Date.now() - T0`（`perfMarks.js:29` `T0` 現成）。**唔使加 `dialogBlockedMs`** —— `sinceLaunchMs − 名義 delay` 就係，加多一個欄係重複。 |
| **C1（cap 10）** | ✅ 1B 獨立第二次撞到（1C 已撞一次），W1 `navBeaconsSent` cap 10→40 呢條無需改動，證據由「1 個平台」變「兩個平台」。 |
| **C4/C6（render / Library）** | ⚠️ §5 個發現落喺呢一區：09-02 做咗「Library idle pre-mount」（`libIdle` 840-871ms、`lib0` 有值）。**pre-mount 只 mount 個殼，`Views` 喺撳 tab 之前一直係 755-858** —— 即係 pre-mount 冇預先付 row 嘅代價，真代價全部集中喺撳 tab 嗰 10 秒。W6 掂 render/memo 嗰陣要連呢個一齊睇。 |
| **C11（建置治理）** | ➕ 我補咗合併 manifest 核實（§6 要求 1B 答，1B 冇答）：`FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` / `WAKE_LOCK` / `POST_NOTIFICATIONS` / `INTERNET` / `ACCESS_NETWORK_STATE` / `VIBRATE` 全部在，`MusicService android:foregroundServiceType="0x2"`（= dumpsys `types=00000002`）→ **Android 14+ FGS 型別要求已滿足，唔使拍板**。`allowBackup="false"`、`enableOnBackInvokedCallback="false"` 確認。⚠️ 新細項：release manifest 嘅 `<queries>` 帶住 `androidx.test.orchestrator` / `androidx.test.services` / `com.google.android.apps.common.testing.services`（androidTest manifest 併咗入 release）。 |
| **N-7（`wallClockDrift`）** | 🔴 要放寬：`trackState` 已經係現成判別欄（6/6 android drift 全部 `trackState="none"`），而且前台阻塞個案嘅 `driftMs` 準到 131162 vs 132 秒。唔好剷。 |
| **N-8（弱網）** | ⚠️ 要補一句：Android emulator **有** shaping 而且**部分生效**（§3.4 四欄一致 1.2-2.6×），但**未校準、冇正控**。N-8「唔做」嘅理由（Mac 冇 sudo / 冇 NLC）對 iOS 仍然成立，但 Android 嗰邊唔係「做唔到」，係「做咗冇正控」。 |
| **C9 / stall 線** | ➖ 冇改。1B 呢個窗口零 stall／零救援訊號，只可以講「呢 30 分鐘冇撞到」，**唔可以**當 Android stall 率 baseline（樣本 4 首歌）。 |
| **C12 / W9** | 見任務 B 部分寫入 `DEEP-AUDIT-ROOTCAUSE-20260906.md` §1.0 / §6 / §3。 |

**另一個一定要寫低嘅前提**：`backend/public/app-version.json` = `{"hlsEnabled":true,"hlsDeviceIds":["e1b6dc8a6948c3018036565007ad87d4"]}` —— 單機閘。AVD 嗰堆 deviceId 冇一個喺名單。
→ **1B 全部 `source=stream` 起播數（6057 / 6235 / 6242 / 7084 ms）都係 progressive，唔係 HLS。** 報告冇講呢句；唔寫低就一定會有人攞去同 HLS 數比。

---

## 7. ⑦ 限制段誠實度

12 條限制入面：**7 條準確**（#2 `pm grant` 跳過彈窗、#4 冇 `tapNext` 樣本、#6 鎖屏冇獨立驗、#7 鍵盤撞唔中歌曲行、#8 logcat buffer wrap、#9 `am start -W` vs iOS T0 唔可比、#10 catalog run3 變大）——呢七條都係主動自曝、raw 支持得返，係好嘢。

**要改嘅五條**：

| # | 原文 | 判 |
|---|---|---|
| 1 | 「S1/S2-S6 唔係同一個 commit，本報告最大嘅方法論妥協」 | 🔴 **作廢**（§4.1，兩截都係 `75f8f95`） |
| 3 | S6 「network status 顯示同實測對唔上」 | 🟠 **一半啱**：「唔可以當已驗證弱網代理」保留；「限流無效」要改為「部分生效、未校準」（§3.4） |
| 5 | 「Android PSS/RSS 喺播放期間持續上升(+103%)…冇工具去分層」 | 🔴 **兩處錯**：歸因錯（係詩歌庫唔係播放，§5），「冇工具分層」錯（分層數自己 raw 一直有） |
| 11 | 「只用 TOTAL PSS/RSS，冇記憶體分層」 | 🔴 **同上**，`App Summary` 分項 15+3 個時點全部喺 raw |
| — | **漏咗一條**：S1 五個 run 各有一次並行 OTA 背景下載（§4.3） | ➕ 要補 |

**冇喺限制段出現、但應該出現嘅**：§4.3 logcat / 返回鍵 / 鍵盤三行同 §5 網絡狀態，**冇任何 raw 入 archive**（§3）。報告承認咗「時間預算所限」（#6）同「撞唔中歌曲行」（#7），但冇承認「呢啲結論冇存證據」。

---

## 8. ⑧ 可以做「改前基準」嘅項目清單（after 量度用呢批）

**前提（每次引用都要一齊寫）**：commit `75f8f95`（S1 = patched embedded bundle，S2-S6 = 生產 OTA，**同一 commit**）；AVD `hymntest` 1080×2400；經 production tunnel `https://api.odemusics.com`；catalog n=6555-6561；**`source=stream` 全部係 progressive，唔係 HLS**。

### 8.1 S1 冷開·無 cache（5 run，`pm clear` + `pm grant`）

| 欄 | min / median / max |
|---|---|
| `app` | 113 / 114 / 119 |
| `cont` | 151 / 159 / 169 |
| `home` | 184 / 220 / 236 |
| `verMs` | 933 / 960 / 1283 |
| `hymnsMs` | 1272 / 1281 / 1310 |
| `a1t` / `a1b` / `a1p` | 389/390/399 · 857/879/908 · 12/13/16 |
| `lyrMs` ⚠️ | 1165 / 1244 / 1871（**含並行 OTA 下載**，after 要同條件） |
| native `am start -W TotalTime` | 441 / 458 / 473 |
| `byt` | 2,381,052（5 run 全同） | 
| `ok1` | 5/5 |
| `mmkvRead` / `parse` / `cacheReady` | 0 / 冇 fire / 冇 fire |

### 8.2 S2 熱 data · 冷 process（5 run，`force-stop`；⚠️ raw `LaunchState` 五個 run 全部 **COLD**，1B 冇量過真正嘅 warm resume）

| 欄 | min / median / max |
|---|---|
| `app` | 109 / 118 / 124 |
| `cont` | 204 / 209 / **233**（更正） |
| `mmkvRead` | 21 / 22 / **31**（更正） |
| `parse` | 18 / 20 / 22 |
| `cacheReady` | 202 / 208 / **231**（更正） |
| `home` | 446 / 448 / 464 |
| `verMs` | 1195 / 1221 / **1229**（更正） |
| `verSkip` | 4/5 = 1（run3 例外：catalog 真變大） |
| native TotalTime | **407 / 419 / 445**（raw 有，1B 冇引；同 S1 441-473 幾乎一樣 → 冷/暖差異全部喺 JS 側） |

### 8.3 S2 perfHome（**用重算版**）

| 欄 | 5 run | min / median / max |
|---|---|---|
| `lib` | 219.09 / 219.23 / **205.27** / 211.64 / 208.82 | **205.27 / 211.64 / 219.23** |
| `libIdle` | 857 / 860 / 871 / 840 / 867 | 840 / 860 / 871 |
| `chips` | 4.77 / 4.19 / 4.15 / 3.29 / 3.09 | 3.09 / 4.15 / 4.77 |
| `pages` | 2.85 / 3.73 / 3.08 / 2.79 / 3.38 | 2.79 / 3.08 / 3.73 |
| `today` | 13.88 / 15.08 / 16.18 / 14.39 / 16.38 | 13.88 / 15.08 / 16.38 |
| `recent` | 5.94 / 5.21 / 5.90 / 5.33 / 5.72 | 5.21 / 5.72 / 5.94 |

### 8.4 S3 導航（10 條 perfNav；⚠️ 15 tap 得 10 條，W1 修完 after 要收足 15）

`tapToMount` **42 / 84.5 / 113**（median 更正）；`tapToPaint` **99 / 123.5 / 232**（median 更正）。首個 tap `tapToPaint=232` 明顯高，之後 99-149。

### 8.5 播放（progressive，非 HLS）

- `origin=start source=stream surface=shuffle`：**6057 / 6235 / 6242 / 7084 ms**（n=4，兩個無限流 + 兩個 S6 限流；限流組唔慢）。
- `origin=auto`：**0 ms / 1 ms**（n=2，本地命中）。
- 呢個 3 分鐘窗口：`hlsStartupKick` / `hlsFallback` / `midStallNudge` / 兩個 `giveup` / `PlaybackError` 全部 0 條 —— **只可以講「呢 4 首歌冇撞到」，唔可以做 stall 率 baseline**。

### 8.6 記憶體（**全部用我 §5.4 嘅分離量度，唔好用 1B §4.2**）

| 場景 | +6s | +66s | +181s |
|---|---|---|---|
| 播歌、留首頁：TOTAL PSS | 320,655 | 459,293 | 468,825 |
| 播歌、留首頁：Native Heap | 179,428 | 261,776 | 267,260 |
| 播歌、留首頁：Views | 755 | 858 | 858 |
| **無播放負控**（S1 raw，+3/+20/+30s）：PSS | 283-313k | 349-352k | 344-346k |
| **無播放負控**：Views | 758 | 763 | 763 |

**詩歌庫 mount 一次性成本**：+170.9MB PSS / +142.5MB native heap / **+2,576 Views**（10 秒內到頂，之後 110 秒零增長）。
**離開詩歌庫**：Views 還原 858，native heap **唔還**（401,048KB）。
**峰值 TOTAL PSS ≈ 646-649MB。**

### 8.7 Bundle / 簽名 / manifest

APK 101,239,729 B（SHA-256 `ba87d8f8…`）；embedded bundle 3,021,684 B；HEAD 重編 Hermes bytecode 3,704,740 B（+22.6%）；vc55 / 1.5.1；minSdk 24 / targetSdk 36；debug keystore `CN=Android Debug`，裝置上 v2-only。
合併 manifest 權限（我補）：`INTERNET` / `POST_NOTIFICATIONS` / `VIBRATE` / `WAKE_LOCK` / `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` / `ACCESS_NETWORK_STATE`；`MusicService foregroundServiceType="0x2"`；`allowBackup="false"`；`enableOnBackInvokedCallback="false"`。

### 8.8 Android 專項（可引用嗰批）

MediaSession `active=true controllers=8`；Now Playing 通知 `channel=kotlin_audio_player category=transport actions=5`、`android.title` 有歌名、`android.mediaSession=Token`；FGS `isForeground=true foregroundId=1 types=00000002`、3 分 15 秒持續存活。

---

## 9. ⑨ 唔可以引用嘅數字 / 結論

| # | 項 | 理由 |
|---|---|---|
| 1 | §2.1 `cont`/`mmkvRead`/`cacheReady`/`verMs` 四個 max | 算錯，用 §8.2 更正值 |
| 2 | §2.2 perfHome 表 row 3 / 4 / 5，同「208.82-219.23ms」呢個範圍 | 拼湊，用 §8.3 重算版 |
| 3 | §3 兩個 median（83.5 / 125） | 算錯，用 84.5 / 123.5 |
| 4 | §4.1「nextTrackMs 得 2 條」 | 漏 2 條，實際 4 條（§1.7） |
| 5 | §4.2 全表 + 「播放期間 +103%」+ 「同 1C 方向相反」 | 歸因錯，用 §8.6 |
| 6 | 限制 #1「S1 同 S2-S6 唔同 commit」及所有由佢引申嘅警告 | 前提錯（§4.1） |
| 7 | 限制 #5 / #11「冇工具做記憶體分層」 | 分層數 raw 一直有 |
| 8 | §4.3 logcat 行（0 FATAL / 0 ANR / 0 PlaybackError + 三個正控數） | 冇 archive，無法覆核（§3.1） |
| 9 | §4.3 返回鍵行 | 引用嘅截圖唔存在（§3.2） |
| 10 | §4.3 鍵盤行 | 執行者自己講撞唔中歌曲行 |
| 11 | §5 全節嘅「限流無效」判斷；`network status` 顯示數字 | 冇儀器正控（§3.4）。**限流部分生效呢個修正版可以引** |
| 12 | §1.2「launch+3s 已經係完整內容」 | 報大：t3s 封面圖全部空白、「今日為你預備」三張卡空、金句卡未出；t30s 先齊。3s→30s 補齊嘅唔止金句卡，仲有**全部封面圖** |
| 13 | §1.0「凍結咗至少 55 秒」 | 冇出處；用 `driftMs=103998`（104 秒），我嘅重現係 131 秒 |
| 14 | §1.0「RN JS thread 計時器俾系統凍結」呢個機制 | 現象真，機制未證實，最直觀嗰版被我負控推翻（§2.3） |
| 15 | §4.3「通知有齊……進度」 | `android.progress` 唔存在；改為「MediaSession token 驅動 seekbar」 |

---

## 10. ⑩ 環境交代（我改咗嘅嘢）

1. AVD `hymntest` 開過 16 分鐘，收工全清（見文首）。
2. **`pm revoke` → 撳 Allow 重新授權**：`POST_NOTIFICATIONS` 最終 `granted=true, flags=[USER_SET|…]`（`USER_SET` 係我撳 Allow 留低嘅，原本係 `pm grant` 冇 `USER_SET`）。功能上等價。
3. AVD 上 app data **冇** `pm clear`，OTA 狀態保留，deviceId `…03e558` 沿用。
4. 我嘅測試向 production `/api/client-log` 寫咗 **10 條** android beacon（18:16:09 – 18:22:22Z）。做 after 統計嗰陣要剔走呢段時間窗（同 1B 自己嗰批一樣，靠 ts + deviceId 區分）。
5. **冇**跑過任何 `eas` / `launchctl` / 部署 / restart 指令；**冇**掂 Cloudflare / DNS / cert / token；**冇**改 `API_BASE`；**冇**開 iOS 模擬器；**冇**改 `frontend/hymn-app/src`、`App.js`、`backend/lib`、`backend/routes`、`ops/perf/harness`。
