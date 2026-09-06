# Odely iOS + Android 深度體檢 — 總報告（Cycle 1）2026-09-06

Eric 原話：「改善這個 App 嘅效能。先建立效能基準，找出瓶頸，進行可量測的改善，最後回報改善前後的結果。咁多錯漏叫 fable5.1 重新將 2 個系統 iOS 同 Android 深度檢查一次，錯漏、debug、優化同把無用嘅 code 拎走，我唔鐘意頭痛醫頭腳痛醫腳。」

負責：Fable 5.1 規劃/監督/部署；Sonnet 5 執行；Opus 5 獨立驗收（每份執行報告都有一份對應嘅 Opus 覆核，數字以 Opus 更正版為準）。時間：2026-09-05 22:00 → 09-06 04:30 HKT。全部改動已 commit（`feature/player-rebuild`，HEAD `aca639c` + 本報告）並已部署。

---

## 1. 做咗乜（一頁版）

| 階段 | 產出 | 狀態 |
|---|---|---|
| Phase 1 體檢（五線並行，唔改 code） | 1A 前端靜態 66 條 / 1D backend ~25 條 / 1E 真機 telemetry / 1C iOS 運行時 baseline / 1B Android 運行時 baseline；1B、1C 各有 Opus 覆核（1C 3 條 errata；1B 10 條更正） | ✅ |
| Phase 2 根源分類（Opus） | `DEEP-AUDIT-ROOTCAUSE-20260906.md`：13 個根源 cluster、9 波計劃、12 項要 Eric 拍板、10 項「唔做」清單 | ✅ |
| Phase 3 修復波次 | **W1 儀器根治**（restart + OTA）→ **W2 resolve 失敗路徑 + 公開寫入面**（restart）→ **W3 死碼清理**（restart + OTA）；每波 Sonnet 執行 → Opus 驗收 → Fable 修補 → gate 部署 → smoke | ✅ 三波全部上線 |
| Phase 4 | 本報告 | ✅ |

**部署記錄**（全部經 `ops/deploy/approve.sh` gate，restart 先於 OTA）：

| 時間 (HKT) | 動作 | sha | 備註 |
|---|---|---|---|
| 02:43 | backend restart | `67dd618` | W1；smoke 8/8 |
| 02:44–02:45 | OTA android `fbc303dc` / iOS `8944835c` | `67dd618` | W1 |
| 03:47 | backend restart | `779c57d` | W2；smoke 9/9 |
| 04:27 | backend restart | `aca639c` | W3；health/heartbeat/stream 過 |
| 04:28 | OTA android `e51033b4` / iOS `17041bee` | `aca639c` | W3 |

---

## 2. 根源層面搵到嘅嘢（唔係逐個症狀）

| # | 根源 | 證據強度 | 修咗？ |
|---|---|---|---|
| C9 | **yt-dlp 三策略串行，`player_client=tv` 策略 14 日 1,087 次 0 成功，每次白蝕 37.5s** → 注定失敗嘅 resolve 要 ~76s 先返，而 client 死線 10–20s → 用戶永遠見「跳歌/冇聲」唔係「等耐咗」（亦解釋咗歷史「86 秒」謎） | 最硬（backend 累計 counter） | ✅ W2 關 tv（env `RESOLVE_TV=1` 一鍵回滾）；量化要 7 日窗（§4） |
| C1 | **四套 client-log 送信實作各自演化**，只兩套帶 platform/deviceId → 真機數據結構上分唔開邊部機（iOS 真用戶得 1 部、Android 0 部）；收貨端零節流 + 每 request 同步 fs I/O | 最高（1E 全份限制源自此） | ✅ W1 統一 `src/clientLog.js` 注入 5 欄 + backend 節流/批量 async 寫 + 持久計數（native stall beacon 要 W8 build） |
| C6 | 節流靠手抄，抄漏就冇：`/otp/verify` 零本地鎖、XFF 自報 IP 繞過所有 limiter、cors 全開、internal route 公開 | 中（未爆） | ✅ W2 共用 `lib/rateLimit.js`（Opus 36 萬步 fuzz 零差異）+ OTP verify 鎖 + trust proxy + cors allowlist + internal guard |
| C10 | 死碼：刪剩嘅永假分支、8 檔重複死 fallback、9 零引用 icon、腳手架 asset、新鮮 test export、被取代嘅舊常數 | 高（九個掃描器各有正控） | ✅ W3（§3） |
| C12 | Android 專項：**「播放期間記憶體翻倍」實為詩歌庫 tab mount 一次性成本**（Views 858→3,434、PSS +171MB、native heap +142MB，播放本身 60s 後 plateau）；首次安裝通知權限彈窗會令 JS timer 停 100+ 秒（beacon 延後送、值冇污染） | 高（Opus 帶負控重現） | ⏳ W6/W9 |
| C2–C5, C7, C8, C11, C13 | async 生命週期無統一機制、fetch 三分裂 + 401 無人管、Provider value 冇 memo、UI 原子件重複、無上限 Map、子進程殺唔死、依賴/簽名/部署治理、7 條孤立 bug | 見 ROOTCAUSE | ⏳ W4–W8 |

**被推翻嘅舊結論**（值得記低）：
- 「HLS 樹係死碼」→ 錯，`hlsEnabled:true` 單機 gate 開緊 Eric 部機，現役。
- 「Android OTA 冇落地（runtime 4 vs 5）」→ 錯，runtime 4 係 Android 正常值，OTA 一直有落地。
- 「Android 播放洩漏記憶體」→ 錯歸因，係詩歌庫畫面成本。
- 「弱網 iOS 做唔到、Android 限流無效」→ Android `emu network` 其實部分生效（體積愈大升幅愈大），只係未校準。

---

## 3. 改前 → 改後（可量測嘅）

### 3.1 儀器（W1）— 兩平台
| 指標 | before | after | 出處 |
|---|---|---|---|
| beacon 帶齊 platform/deviceId/appVersion/updateId/sessionId | 真機 row 37% 有 platform，其餘欄唔存在 | iOS 30 條 / Android 36 條 **100%**（逐條核） | 1E §1 → W1-AFTER |
| 15 次 tab tap 收到 perfNav | **10**（cap 10 靜靜丟 5） | iOS **15/15**、Android **15/15**，零 capped | 1C 限制#6 / 1B §3 → W1-AFTER |
| `/api/client-log` handler 寫入耗時 p50（1000 條） | 0.047 ms + 每 request 4 個 sync fs call | 0.0028 ms + 0 sync call（批量 async） | W1 harness（Opus 用 pre-W1 sha 重證） |
| 節流丟數可見性 | 冇 | `clientLogRateLimited` 計數器（量度期間 =0） | W1 fixup |
| 可切 before/after 嘅維度 | 冇 | `updateId`（Android 已對返生產 OTA group） | W1-AFTER |
| Android 彈窗凍結個案可解讀 | 分唔開背景 vs 凍結 | `bgMs=125`+`appState=active` 正確指出係前台 JS 被阻 | W1-AFTER |

### 3.2 resolve 失敗路徑 + 寫入面（W2）— backend
| 指標 | before | after（部署即時） | 最終量法 |
|---|---|---|---|
| 失敗 resolve 策略鏈 | 3 條串行 ≈76s+ | 2 條（tv 關） | **7 日窗（09-13）**：`resolve.fail` 率 ≤6%（現 4.93%）+ 新 `failMs` p50 目標 ~76→~38s |
| `/otp/verify` | 零本地鎖 | per-phone 10 分鐘 5 次錯（只計 Twilio 明確錯碼；攞新碼即解鎖）+ IP 保底；harness 第 6 次 429 | — |
| XFF 偽造繞過節流 | 100% 繞到（W1 Opus 實證 150/150） | 經 CF 路封（cf-connecting-ip + trust proxy 1）；smoke 第 301 條 429 | — |
| cors | 全開 | allowlist 3 域，RN 無 Origin 照通 | — |
| `/api/internal/activity` | 公開 | loopback 且非 tunnel（cf-* header 即 404） | — |
| 6 套手抄 limiter | 各自為政 | 一個 `lib/rateLimit.js`，行為逐位一致 | — |
| 密鑰 | 明文喺 launchd plist | `.env` 600 已備 + loader 上線 | **等 Eric 改 plist**（§5） |

### 3.3 死碼（W3）
| 指標 | before | after |
|---|---|---|
| 行數 | — | 17 檔，+18 / −117，**淨減 99 行**（09-02 已刪 6,101 行唔重數） |
| iOS bundle | 3,740,937 B | 3,738,046 B（**−2,891 B**，Opus 獨立重 export 逐 byte 一致） |
| 刪咗乜 | — | App.js 2 個永假分支（8 個 caller 逐個核冇傳 flag）；`useAuth() \|\| {}` 死 fallback ×8 檔；`elapsedSinceT0`；8 個零引用 icon；`favicon.png`/`splash-icon.png`；`presence.js` 2 個未接線 test export；`hymnDb.js` 已被取代嘅 `COMPILATION_PATTERNS` |
| 刻意唔刪 | — | HLS 樹（現役）；`addedToList`（設計咗未接線，等 D-3）；410 stub 23 條（等 `deprecatedRouteHits` 7 日窗 09-13）；36 個「export 但內部用」（唔係死碼）；258 個 ops/lyrics 人手 CLI（設計如此）；20 個依賴全部有用 |

### 3.4 冷開 regression 粗篩（W1 after，唔判快慢）
- iOS S1 hymnsMs 1,171–1,399 ms vs before 中位 1,256；byt +0.84%（catalog 6543→6594 首，一致）。冇 regression 訊號。
- Android S1 因為 after 用 force-stop（保留 OTA + MMKV cache）而 before 用 `pm clear`，**方法唔同唔可比**；after `home` 411–565 vs before 184–236 要下輪同法重量，本報告唔判。
- 網絡仍係冷開主體（1C：fetch 94% 係網絡、backend 0.2%），呢輪三波冇針對，屬 W4+ / uplink 課題。

---

## 4. 未做 / 要跟嘅

| 項 | 幾時 | 邊個 |
|---|---|---|
| C9 7 日量化（fail 率、`failMs` p50、`All yt-dlp strategies failed` 日均） | 09-13 | Fable 讀 `ops-metrics.json` |
| 410 stub 刪檔（`deprecatedRouteHits` 7 日零命中） | 09-13 | W3 第三段 |
| W4 fetch 統一 + 401（要 D-1 拍板）→ W5 lifecycle → W6 memo/組件（含 C12-1 詩歌庫 mount 成本）→ W7 孤立 bug → W8 native build（native stall beacon 域名/五欄、exact pin、keystore）→ W9 Android 專項 | 下個 cycle | 同一流程 |
| 24h client-log 五欄覆蓋率（只睇 09-06 後新檔，剔 `b3-harness`/smoke row） | 09-07 | Fable |
| OTA 後 sim 一項檢查（我的 → 自訂清單 → 撳第二首，覆蓋 useAuth 改動點 + playQueue 改行） | 可選 | Sonnet |
| 掃描器 s2/s8 正控樣本已被刪，exit code 失效——下輪用前要換樣本 | 09-13 前 | W3 第三段 |
| 1E「iOS 真用戶 1 部、Android 0 部」呢個限制唔會因為儀器修咗而自動改善——**要 Eric 部 Android 開一晚**（D-12） | 即刻可做 | Eric |

---

## 5. 要 Eric 做 / 拍板

**人手動作（唔係決定）**
1. Terminal 刪 7 個零引用檔（0-byte `backend/data/hymns.db` + 6 個舊 APK 備份 ~558MB；留 `app.apk.bak-1.5.1-20260824` 做 rollback）——命令喺 `DEEP-AUDIT-W3-DEADCODE-REGISTER-20260906.md` §5。
2. D-10 收尾：刪 plist 五個密鑰 key + `launchctl bootout/bootstrap`（原文喺 `DEEP-AUDIT-W2-REPORT-20260906.md` §5）。等同 restart，避開真機 QA 時段。
3. D-12：Android 真機開一晚聽歌（W1 OTA 已出，beacon 會帶齊五欄）。

**產品/UX/native 決定**（ROOTCAUSE §2，唔阻塞 W3 前工作，阻塞 W4/W7/W8）
- D-1 token 失效後點做（建議：靜靜標記 + 頂部提示條 + 下次要登入嘅動作先擋）
- D-3 「加入清單」成功動效接唔接線（建議接）
- D-4 Android 換真 keystore（換簽名 = 舊 APK 要重裝；愈遲愈貴）
- D-5 iOS 邀請文案 / 分發路線
- D-6 出唔出 native build（iOS build 18 + Android vc56）——native stall beacon 修唔修得到全靠呢個
- D-2 HLS 維持單機唔郁（建議唔郁，等 C9 7 日數）

**一句知會**：W3 刪咗嘅 `browseTap` 分支，code 入面有句舊註解話「刻意保留做將來插播入口」。零 caller，決定照刪；規格喺 `QUEUE-BEHAVIOR-3-SCENARIOS-PLAN.md` §3.3/§3.4，git `6c12310` 有原文，第時要就照文件重寫 ~25 行。

---

## 6. 文件索引
`DEEP-AUDIT-PLAN` → 1A / 1B (+1B-OPUS) / 1C (+1C-OPUS) / 1D / 1E → `ROOTCAUSE`（含 C12 補遺）→ W1-EXEC / W1-REPORT / W1-OPUS / W1-AFTER-EXEC / W1-AFTER → W2-EXEC / W2-REPORT / W2-OPUS → W3-DEADCODE-EXEC / -REGISTER / -REPORT / W3-OPUS → 本報告。Raw：`ops/perf/audit-20260906/`、harness：`ops/perf/harness/w1|w2/`、掃描器：`ops/perf/deadcode/`。

---

## 7. Eric 拍板記錄（2026-09-06）
| 項 | 決定 |
|---|---|
| D-1 | (b) 靜靜標記失效 + 頂部提示條 + 下次要登入嘅動作先擋 |
| D-3 | 接線「加入清單」成功動效 |
| D-4 | 換真 keystore，夾住 D-6 一齊出 |
| D-5 | 暫時唔做（邀請文案唔改） |
| D-6 | 出新 native build（iOS build 18 + Android vc56） |
| D-2 | 待 Eric 決定（已另俾非技術解釋） |
