# OTA harness — 喺本機重現／驗收「OTA bundle 專屬」嘅 bug

2026-08-01 起。用嚟診斷 Eric 報嘅「㩒 Home 掣之後左上角 mini player 冇咗、歌照播」
(OTA-MEDIA-NOTIFICATION)。當時症狀**只有喺 OTA 落嚟嘅 JS bundle 先出現**,
用 Metro 或者 APK 自帶 bundle 都重現唔到,所以要一個受控嘅 update server。

## 點解需要佢

`eas update` 推去 production 會直接影響 Eric 部機,唔可以攞嚟做 A/B。呢個 harness
自己做返一個 expo-updates(protocol v1)server,行喺 `10.0.2.2:4747`,你可以
即刻換住服邊個 bundle,重複試幾多次都得。

## 一次性設定:出一個指向本機嘅 release APK

改兩處 `android/app/src/main/AndroidManifest.xml`(**唔好 commit**):

1. `expo.modules.updates.EXPO_UPDATE_URL` → `http://10.0.2.2:4747/manifest`
2. `<application ...>` 加 `android:usesCleartextTraffic="true"`

跟住 `cd android && ./gradlew assembleRelease`,出到 `app-release.apk` 就
`git checkout -- android/app/src/main/AndroidManifest.xml` 還原。

⚠️ 一定要用 **release** build。debug build 會令個 bug 消失(實測過),
唔係 apples-to-apples。

## 用法

```bash
# 1. 開 server(SERVE_DIR 指住一個 `expo export` 出嚟嘅資料夾)
SERVE_DIR=/path/to/export node update-server.js

# 2. 換 bundle 唔使重開 server
curl "http://127.0.0.1:4747/_set?dir=/path/to/another-export"

# 3. 跑一次 trial(pm clear → 開一次(embedded)→ 重開(行 OTA)→ 播歌 → 讀狀態)
./trial.sh "label" ota
./trial.sh "label" embedded   # 對照組:唔行 OTA
```

`trial.sh` 出嘅一行包含判斷 media notification 生死嘅幾個關鍵指標:

| 欄位 | 正常 | 壞咗 |
|---|---|---|
| `notif` | 2 | 0 |
| `fgSvc` | 1 | 0 |
| `stopAction` | 1 | 0 |
| `actions` | 6554039 | 2360143(media3 預設,即係 updateOptions 冇 apply) |
| `mediaChannel` | `kotlin_audio_player` | `NONE` |

## 注入故障做 A/B

`mkvariant.sh <App.js> <失敗次數> <名>` 會用指定嘅 App.js 起一個
OTA 形狀嘅 bundle(`expo export:embed` → `hermesc -O -g0`),
並且令頭 N 次 `TrackPlayer.updateOptions()` 掟錯,用嚟模擬 production 個失敗。

```bash
./mkvariant.sh /tmp/App.OLD.js   1 OLDfail1
./mkvariant.sh /tmp/App.FIXED.js 1 NEWfail1
```

2026-08-01 嘅結果:`OLDfail1` 出到同 production **一模一樣**嘅壞簽名
(notif=0 / actions=2360143 / 冇 STOP action),`NEWfail1` 完全正常。

## 已知限制

- 用 `adb shell input swipe` 喺呢部 AVD **撳唔郁** recents 張卡(task 冇被剷),
  所以「swipe 走要即停」呢條要求今次冇喺 harness 上面重驗過。
- `console.warn` 喺 release build 唔會出現喺 logcat;要睇 JS log 就要 debug build,
  但 debug build 會令個 bug 消失。所以修復嘅保障係**重試**,唔係個 log。
