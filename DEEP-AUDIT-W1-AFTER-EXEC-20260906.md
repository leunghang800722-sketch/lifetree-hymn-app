# W1 after 量度執行單 2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。驗收：Opus 5。
前提：W1 已部署——backend restart sha `67dd618`（02:43 HKT）、OTA android group `fbc303dc-521e-4236-9b17-b1d1763c0279` / iOS group `8944835c-11e7-473d-ad77-06cd51cc2441`（iOS update id `01a072e3-8c91-7730-931c-b8ea40673c52`），Opus 驗收 `DEEP-AUDIT-W1-OPUS-20260906.md` §4.3 列咗 after 要求。before 出處：`DEEP-AUDIT-1C-IOS-20260906.md`（iOS）、`DEEP-AUDIT-1B-ANDROID-20260906.md` + `DEEP-AUDIT-1B-OPUS-20260906.md` §8（Android，**只用 Opus 判有效嗰批數**）、`DEEP-AUDIT-1E-TELEMETRY-20260906.md` §1（37% row 帶 platform）。

## 0. 目的
證明 W1 儀器改動喺兩個平台真機路徑（sim/AVD → prod tunnel → backend）落到地：每種 event 五欄齊、nav cap 40 生效、新欄可以切 before/after。**唔係量效能**（呢波冇效能改動；順手記低 S1 數字做 regression 粗篩）。

## 1. 共同規則
- 一次只開一部機。iOS：`touch /tmp/claude-ios-cleanup.hold`；Android：`touch /tmp/claude-android-baseline.hold`。收工 shutdown/kill + 刪 hold + `pgrep` 核零。
- `API_BASE` 保持 prod（`https://api.odemusics.com`），唔准改。
- 唔部署、唔 restart、唔 eas、唔 launchctl、唔掂 Cloudflare。
- 每條 beacon 由 `backend/logs/client-log/client-log-2026-09-05.jsonl`（UTC 日期，注意跨日會去 `-06`）用 deviceId 撈返；**唔准用時間相近反推**（N-10）。
- 執行者唔判 PASS/FAIL，出證據表。
- 剔走 `smokeW1`/`smokeOld`/`smokeRate`/`opusVerifyProbe` 呢啲 smoke row。

## 2. iOS sim（照 1C 方法）
1. Release build，`-derivedDataPath` 全新，HEAD `67dd618`，`Expo.plist` `EXUpdatesCheckOnLaunch=NEVER`（同 1C 一樣行 embedded bundle；`updateId` 會係 `embedded`——記低，呢個係 sim 限制唔係 bug）。`simctl uninstall` 再 install，`get_app_container` 核 bytes。
2. S1 冷開 ×3（每次 uninstall/install）。每次記 deviceId、sessionId。
3. S3 tab 導航 15 tap（詩歌庫→我的→首頁 ×5）。
4. S5 撳「隨心聽」起播一首，等 30s。
5. 逐 deviceId 撈 jsonl，出表：每種 event（perfMarks/perfHome/perfNav/perfRenders/nextTrackMs/其他）→ 條數、`platform`/`deviceId`/`appVersion`/`updateId`/`sessionId` 五欄非空條數。**逐種 event 逐條核，唔抽樣。**
6. 核：同一次冷開所有 event `sessionId` 相同；三次冷開三個唔同 sessionId；15 tap 收到 15 條 perfNav、零 `navBeaconCapped`。
7. S1 數字表（app/cont/home/verMs/hymnsMs/byt）同 1C 並排，只做 regression 粗篩（wall-clock 浮動 55-106%，唔判快慢）。

## 3. Android AVD `hymntest`（照 1B 方法，Opus 更正後）
1. 開 AVD，原裝 vc55 APK 已裝。**唔使 patch APK**：production android OTA runtime 4 會自動落地。做法：launch → 等 logcat `dev.expo.updates` 見 download → force-stop → relaunch → 核 `CheckCompleteUnavailable`。
2. `pm grant android.permission.POST_NOTIFICATIONS`（避開權限彈窗，同 1B S1 一致）。
3. S1 冷開 ×3（`pm clear` + `pm grant`）——留意：`pm clear` 會清 OTA 記錄跌返去 embedded 舊 bundle（1B §0.1）。**所以 Android S1 用 force-stop 冷開（唔 pm clear）**，先驗 OTA 落地再量；如果要「無 cache」就只清 MMKV（`run-as` 唔得就記低做唔到）。
4. S3 15 tap、S5 起播（用 uiautomator dump 攞「下一首」真座標，1B 兩次撳錯）。
5. 同 §2.5–2.6 一樣出表。**`updateId` 必須等於 OTA android update id**（由 `~/.hymn-deploy/ota-groups.log` group `fbc303dc…` 對；update id 可由 beacon 自己讀返，記低係邊個值）。
6. 額外（1B Opus §2 對 C1 嘅建議）：一次 `pm revoke POST_NOTIFICATIONS` 冷開，唔撳彈窗 60 秒後先撳 Allow，記低 beacon 湧到時間同 `wallClockDrift` `driftMs`/`bgMs`/`appState`——證明 W1 加嘅欄喺呢個個案有冇幫助解讀。

## 4. backend 側
- 量度前後各記一次 `curl -s http://localhost:3001/api/audio/cache/warm-stats` 嘅 `total.clientLogRateLimited`（要維持 0——唔係 0 即量度期間有 beacon 被斬，所有「幾多條」數字要標 caveat）。
- 量完 `node ops/perf/classify-devices.mjs` 一次，記 android/iOS 新 deviceId 分類。

## 5. 交付
`DEEP-AUDIT-W1-AFTER-20260906.md`：兩平台證據表、before/after 對照（1E 37% → 新 row 五欄覆蓋率）、做唔到嘅逐條原因、收工衛生。Raw 放 `ops/perf/audit-20260906/w1-after/`。唔 commit（由 Fable 收）。
