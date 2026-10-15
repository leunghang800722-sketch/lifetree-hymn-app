# STREAM-PHONE-NOTIFY 獨立驗收（Opus）2026-10-15

範圍：2b19120 / e428dcf / 699ef46。冇改 code、冇做 git 寫入、冇真發 Telegram、冇打 ifconfig.me（真 tick 已經證實 launchd 下攞到 IP）、冇打 YouTube、冇 restart。

## 判詞：**有條件**
- **ops 部分（2b19120）：可以留喺 live，可以做真發測試。**
- **backend 部分（e428dcf）：未修兩點之前唔好 gate restart**（見 R5b 🔴）。

## 0. 改動後第一個真 tick（15:42 HKT）
- `stream-health.log` 新行尾欄有 `ip=<IPv4>`，其餘格式不變。
- state 有 `exitIp`，冇 `ipChanged`：首次記錄，正確唔觸發。
- watch-state 同秒更新（15:42:06），`.tick-ctx` 已清，watch log 冇 REFUSED/error，冇 STREAM-ALERT.md，冇 stream-notify.log。
- 呢個 tick `midfail=3`（B 3/3 resolve-fail）⇒ consecutiveFail 0→1，SUPERVISION-LOG 多咗一行舊有嘅 🔴 健康警報。**原因係上游，唔係改動**：
  - Layer B 嘅 code 只係將 loop 包成 `probe_b()`；prev=0 ⇒ LIGHT=0 ⇒ 全探；IP echo 喺探測之後先行。
  - backend log 07:2x–07:41Z 有 9 條 `not a bot`；`stream-botcheck-count.py` 07:44Z 計得 20；協調者 env -i 重現到 429。
  - 今日 06:11–06:41Z 健康時段都已經有 13 條 bot-check。

## 1. Telegram 推送
- stub 驗過以下失敗路徑，全部 return 1，唔影響 caller：缺 conf、缺欄、測試模式冇 cmd、binary 唔存在（rc127）、rc=3、hang（cap2 → rc124，4s）。
- sanitize：換行、U+202E、JWT、URL path 全部剷走；`$()` 同反引號保留字面，因為經 argv 傳，唔會展開；截 400 字元（1200 byte = 400 個 CJK 字）。
- mask：rc≠0 時 log 內 target 一律顯示為 `<target>`。
- launchd 等效環境（`cd / && env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`）+ 真 openclaw `--dry-run --json`：rc=0，耗時 4s，payload `"to": "telegram:<target>"`、`dryRun: true`。
- PHONE_TARGET（原值同數字核心）喺以下地方 `grep -cF` 全部 = 0：報告/規劃/執行單、SUPERVISION-LOG、health/selfheal/watch log、watch-state、git log -p、我同執行者嘅 scratch。
- 6h 共用計時：RENOTIFY 同 Mac 通知同一個 action。t14 實測升級 1、5.5h 仍係 1、6h → 2、恢復 → 3。恢復只喺 `esc==1` 先發。escalate 只喺 `escalatedFor != incidentId` 先發。
- ipChanged 旗：healthcheck 每 tick 重寫 state 即消失，所以只消耗一次。前提係 watch 每 tick 只由 healthcheck 叫一次，已核實 plist 只得 healthcheck 一個入口。
- 現況：**conf 已存在、watch.on 同 ai-on 都開咗 ⇒ 下一個事故升級會真發。**

## 2. R1 形態④
- 10-14 fixture（--now）：02:57Z=78、03:27Z=116、10:57Z=20，全部判④；12:00Z 恢復後=0；07:30Z（今日事故前）=0。負控：10-14 殘留行唔會觸發今日（錨行太舊 ⇒ 0）。
- 低估上限 = 錨行間隔（每鐘 8–12 個錨），閾值 3，夠用。
- 🟡 **盲點 1**：證據只嚟自 backend log。healthcheck 自己 Layer B 嘅 429/not a bot 唔入 backend log；如果 backend 冇 traffic，就會跌返①。
  - 後果：update-ytdlp canary 唔過 ⇒ 現役唔郁，最多食 1 次配額。fail-safe，同改動前一樣。
  - 建議：healthcheck 將 B stderr 嘅 bot-check 計數寫入 state，selfheal 同 diagnose 一齊用。
- 🟡 **盲點 2**：今日健康時段 30 分鐘內已經有 13 條背景 bot-check 噪音，而④優先過①。如果將來同時出現真 yt-dlp 過舊（B 403 而 resolve 得）加 IP 半擋，會誤判④，唔 swap。
  - 建議：④ 再加一個條件，要求 B 失敗以 `resolve-fail` 為主，唔好用 mid-range 403。
- rules 嘅 1b 冇 `healthy_b==0` 條件（selfheal 有）；規則診斷只會喺事故中行，屬次要。
- ④分支零 apply/restart/配額（t14 P5 + code 核對）。

## 3. R3 出口 IP
- launchd 下 curl 正常（真 tick 攞到 IPv4）。失敗 `?` 唔覆蓋；A→B 只觸發一次；首次唔觸發（t14 P6 + 真 tick）。
- 對原有判斷零影響：IP 喺判定之後先算，只係 append 尾欄。
- 🟡 建議改 `curl -4`：如果 dual-stack 下 v4/v6 交替，每 tick 都會誤報「IP 變」。
- 外部依賴：每 30 分鐘打一次 ifconfig.me，只露出口 IP，可接受。

## 4. R5
- (a) 補探邏輯正確，`ok>=2` 唔會卡死，due tick 全探。
  - 🟡 但 B 首探 id 7UkwavM5L1E 健康時都有約 12% 間歇 403（10 月 684 tick 入面 80 次）⇒ 恢復有約 12% 機會慢 1 個 tick。報告講「恢復偵測冇慢一個 tick」係講大咗。
- (b) node --check OK；t15 序列 30→1800 MATCH。我自己 harness（真 module 複製去 scratch）揾到三點：
  - 🔴 **HLS 路徑冇受保護**：`routes/hls.js:386` 冇傳 playbackRetry ⇒ 受長冷卻（最多 30 分鐘）擋住，仲寫咗 failCache。HLS 預檢降級去 progressive 嘅時候，同一首歌 60s 內會撞 `Known-bad`。hlsEnabled=true，2 部 device（Eric iPhone）⇒ Eric 換 VPN 之後，最壞要等到長冷卻自然到期（≤30 分鐘）先播到。Android/progressive 最壞 ≈30–90s。
  - 🔴 **並發令 streak 暴升**：5 個並發背景 resolve 撞 bot-check ⇒ streak=5 ⇒ 即刻 480s。即係零星 bot-check（例如今日健康時段嗰種）都可能一下跳去長冷卻。
  - 🟡 **成功唔解除冷卻**：只歸零 streak，until 冇清，背景同 HLS 仍然被擋（實測成功後仲剩 440s）。code 註釋寫「背景即刻恢復」，同實際行為唔符。
  - 建議修法：成功時清 `ytRateLimitedUntil`；hls.js 改用 base gate；streak 每個冷卻窗只加一次。
- opsMetrics：botCheck 用 `||=` lazy 建立，冇加入 blankBucket/normalizeBucket。純觀測冇讀者，屬 🟡 小事（同 W1 教訓唔一致）。

## 5. R7
- canary-note：cf 3 → ⚠️ 版本；cf 1 同 state 唔存在 → 原句。update-ytdlp.sh 用 `$REPO` 接線正確（靜態核對）。

## 6. 回歸
- t1–t15 全部 rc=0、`PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0（t13 FAILS=0；t15 MATCH）。t16 由我手動等效跑過（見 §1）。
- `bash -n` 全部通過；py_compile、node --check 通過。
- diff 範圍符合（stream-status.sh 嘅改動係別人未 commit 嘅，唔屬今次範圍）。

## 7. 部署評估（e428dcf）
- restart 只清 in-memory 嘢：warm bufferCache、presence Map、冷卻 state；resolve-cache 同 hot-ids 會由碟載返。
- 唔影響 users.db 同 JWT_SECRET ⇒ 唔會令全員登出。
- **但而家唔好 restart**：出口 IP 正被 429/bot-check，restart 之後冷 resolve 會再撞；加上上面兩個 🔴（HLS 冷卻 + 並發 streak）未修。建議修完兩個 🔴、IP 回復之後先經 gate restart。

## 其他發現
- healthcheck 舊有嘅警報文字將 B 全部 resolve-fail 都寫成「典型 1MiB 病，先查 yt-dlp」，喺 IP 被擋嘅情況會誤導人。
- 建議：detail 全部係 `resolve-fail` 嘅時候，改寫「疑出口 IP 被擋」。

## 側效應
- 讀過：`~/.hymn-deploy/stream-notify.conf`（只讀；只取 key 名、長度，以及在記憶體內用作 grep 核對）、/tmp/hymn_backend.log（複製一份去 scratch）。
- 真 openclaw `--dry-run --json` 跑過 1 次。openclaw 自己可能寫佢本身嘅 state，我冇睇 ~/.openclaw。
- scratch 測試檔；寫入本檔。prod 零寫入。
