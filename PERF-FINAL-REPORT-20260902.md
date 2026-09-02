# Odely 效能改善工程 — 改前→改後總結 2026-09-02

Fable 5.1 總負責；Sonnet 5 執行（1A/1B/2A/2B/2C/2D/2E/Stage 3）；Opus 5 獨立驗收（baseline/2A/2B/2C/2D/Stage 3）。
全部改動已 commit 喺 `feature/player-rebuild`；**2026-09-02 11:01Z 已部署**（Eric 拍板「隨時」）：backend restart sha d89b3ad（health OK，PID 16266），smoke 10/10 過，OTA android group `18e4d7aa-0c80-4488-96d5-ee06ae604d98` / ios group `16f388e7-f525-4589-9eff-6256cff60607`（sha d89b3ad）。碟上 179 個 .webm（10GB）+ 21 個舊 DB/lock 備份已刪（Eric 拍板），`backend/backups/` 7 日輪替保留。
文件索引見 §7。

## 1. 一句話
開機要落嘅歌庫 wire bytes 由 **1,474,227 B 縮到 371,984 B（−74.8%）**（raw 5,567,646 → 2,839,533 B，−49%），server 側每次 request 由 **78–132ms 縮到 0–1ms**（`[access]`），熱開首屏 render median 由 **856ms → 376ms**，同時剷走 **29 個死檔 6,101 行** 同四組零引用 backend route；三個現存 bug（body 下載冇 timeout、live DB 版本落後 10.86 小時、死 route 每 request 重開 61MB DB）一併修好。

## 2. Baseline（改前，2026-09-02 15:00–15:36，Opus 驗收後）
| 指標 | 數字 | 出處 |
|---|---|---|
| /api/hymns payload | 5,567,646 B raw / 1,474,227 B gzip（CF edge 壓，origin 送原文）；2A/2C 量到 5,567,648 B（差 2 byte 係 dataVersion 字串長度） | 1A, 2A |
| lyrics 佔 payload | 47.85%（bytes；1A 原報 23.85% 係字元數，Opus 更正） | 2A-Opus |
| /api/hymns server 側 | SELECT+getAsObject 97–158ms + stringify 7–19ms；local total 85–140ms | 1A |
| prod 每 request 地板 | ~0.75s（tunnel RTT，/api/health 都係） | 1A |
| 冷開無 cache：全量 fetch（sim 經 prod） | 單次 3.7–11.6s（1B）；D-1 拆時 ttfb ~520ms、body 3.2–6.2s、parse 25ms（純傳輸）；單一離群 body 9.5s（2B F-1 A/B） | 1B, D-1, 2B |
| 熱開：MMKV 讀 / parse / 首屏 mount | 18ms / 19ms / **938ms**（1B）；2B BEFORE build 856ms | 1B, 2B |
| 三個 tab | 開機全部 mount；Library 有資料首 render 174–186ms、Mine <1ms | D-1 |
| Re-render | 播歌 60s 六個 component 同步 4→8；PlayerProvider=AppContent | 1B, F-2 |
| backend RSS | 穩態 ~250–360MB；1A 壓測約 35 個 /api/search + /api/category request（每 request 重開 61MB DB）後 live process 尖峰 736MB；A-4 harness 5 次 category = +157,616 KB | 1A + Opus |
| 死 route | /api/search /api/category /api/audio /api/home×9：前端零引用（Opus 四條獨立證據鏈） | 1A, 2A-Opus |
| access log | 冇（/api/version /health /app-version 完全冇 log） | 1B |
| JS bundle | 2,654,414 B（reanimated 26.6% + react-native 25.8%）；Release main.jsbundle 3.70MB | 1A |
| Dead code 候選 | backend root 14 script 1,561 行、7 個 scripts、7 個 tracked 備份、3 個零引用 export | 1A |

## 3. 瓶頸（按實證）
1. **歌庫傳輸 bytes**（冷開 85–92% 時間係 body 下載；Mac 上行 ~0.5–0.65MB/s 係天花）
2. **首屏同步 render 兩個睇唔到嘅 tab**（Library 174–186ms）
3. **server 每 request 重做 SELECT/stringify**（130ms）+ 冇 origin 壓縮
4. **死 route 每 request 重開 61MB DB**（記憶體尖峰 + 35MB response）
5. 非效能但同期發現：body 下載冇 timeout；live dataVersion 落後真檔 10.86h；backend 冇 access log

## 4. 改動清單（commit）與改前→改後
### Backend（2A + 2C；Opus 2A/2C/C-6 全 PASS，C-7 PASS 見 PERF-FINAL-OPUS §B，b0f7931 係必要前置；部署 GO）
| 項 | commit | 改前 → 改後 |
|---|---|---|
| A-1 /api/hymns response cache（dataVersion key） | 06d0cb8 | loopback curl total 78–132ms → 12ms（hit；run1 冷 compute 134.9ms）；server 側 SELECT+stringify 105–177ms → 0（hit） |
| A-2 origin gzip（排除 stream/hls/audio/apk） | 8f56b02 | origin→edge 5,567,648 B → 1,474,227 B；stream 206 不受影響 |
| A-3 /api/* access log | 5943880, c55cfa9 | 冇 → 有（method path status ms bytes aborted） |
| A-4 死 route 410 + 停止重開 DB | ebe29ba, 78e7acb | category/mandarin 35MB/280ms → 410/<1ms；5 次 RSS +154MB（+157,616 KB） → +1.6MB（+1,648 KB）；兩條診斷 route 還原 |
| A-5 Cache-Control | 77fa5ee | 無害（前端冇 If-None-Match） |
| C-1 `/api/hymns?lite=1` + `/api/hymns/lyrics` | 8d7a2d4 | 開機 wire bytes 1,474,227 → 371,984 B（−74.8%）；歌詞 992,859 B 撳歌先要 |
| C-4 dataVersion 自動追 out-of-process 寫入 | ab78c98 | live 落後 10.86h → 下一個 request 即追（lock 檔存在時唔 reload） |
| C-5 預壓縮 cache（gz） | 0519814 | gzip hit 117/30/86ms → 18/7/9ms（median；full/lite/lyrics）；server 側 `[access]` ~0–1ms |
| C-7 reloadDb 舊 DB 延遲 close（每次 reload 漏 58MB，C-4 令佢每日發生）+ 冷開並發 miss in-flight dedupe | 7eab3c1 | 5 輪 reload RSS 112→346MB（每輪 +58MB） → 112.7–112.9MB 完全企定；3 並發 miss SELECT 3 次 → 1 次（三條 route） |
| C-6 route-scoped ETag / brotli / async 壓縮 / getDb dedupe / stale-lock 告警 | feb0060 | ETag 共用 bug 修（lite 用 full tag 200 唔係 304）；br q5 1,083,708 B（比 gzip −26.5%）；miss 路徑 197ms 同步 → 73ms；3 並發 getDb 3 次 load → 1 次；lock >30min 每 10min 告警一次 |

### Frontend（2B + 2D + 2E；Opus 2B/2D PASS「可出街」；2E 見 PERF-FINAL-OPUS §A：E-1/E-2/E-3/E-4/E-5(1) PASS、E-5(2) 有保留、E-5(3) 由 b7eb419 補齊）
| 項 | commit | 改前 → 改後 |
|---|---|---|
| 儀器 perfMarks（beacon 經 /api/client-log） | 0ad1a3f, d51c3bc, fcfb62e, 8a2e729, bda9f9e | — |
| F-4 Library lazy-mount（Mine 不變） | d547279 | 熱開首屏 mount median **856 → 376ms**（5/5 都改善，AFTER 361–414）；Library 首撳 tapToPaint 72 → 539ms（2E idle pre-mount 收返） |
| F-3 SongCard React.memo | b9e0f64 | 未量化（代碼審查安全） |
| F-1 body 下載 30s timeout（headers 仍 8s） | 4321f46 | 舊碼 body 從來冇 timeout；2E 補 abort race 令佢真正可 catch |
| F-2 診斷 | 297bf52 | PlayerProvider=AppContent=9 → 唔做 useMemo（Opus：4 次/60s 唔係瓶頸） |
| A-6 client：lite 先畫、歌詞背景補拉、播放器 fallback | d375f9a | 開機首屏 bytes −74.8%；loopback 實測 body 125→35ms（比值 0.28≈bytes 比 0.25，Opus 證實 body 時間 ∝ bytes）；代入 tunnel 數估首屏 ~6.6s → ~2.1s；Opus 判可 OTA（P0 一行修由 E-5 落） |
| E-1 body timeout abort race（expo/fetch text() 唔 reject） | b0e3411 | harness：hang route 2,059ms 內 AbortError（生產 30s）；正常 route 不受影響 |
| E-2 Library idle pre-mount（首屏後空閒先 mount） | a829ed8, 925c98f | Library 首撳 tapToPaint **544 → 57ms**（5/5 交錯）；熱開首屏 414 vs 422ms 不變；idle mount 喺開機後 684–897ms fire（全部喺 home mark 385–474ms 之後，結構上唔影響首幀）；歌詞索引預熱恢復 |
| E-3/E-4 註解更正 + PERF_MARKS 拍板 | 0875920 | — |
| E-5 Opus 2D P0：lyrics 失敗刪 allHymnsVersion；lyrics 延後 8s 讓路預載；剷 liteMs | 1b66931 | 永久冇歌詞 cache 路徑封死（harness 雙向正控）；beacon 截斷要連 client slice 一齊改 |
| P1（FINAL-OPUS）：perfMarks detail 300→400（配合 backend b0f7931）+ lyrics 延後 15s hard cap | b7eb419 | beacon 唔再截尾；runAfterInteractions 永不 fire 嘅靜默失效堵死 |

### Dead code（Stage 3，Opus 全 PASS）
| 項 | commit | 數字 |
|---|---|---|
| tracked 舊備份 7 檔 | d8b7f04 | App.js.×4 / index.js.bak / hymns.db.bak ×2 |
| backend root 14 script + db.js | 5baf3e1 | −1,660 行 |
| 6 個目錄爬蟲 + 1 oneoff | 3227fc3 | −1,074 行 |
| home.js 死 code / deviceId 零引用 export / docs 標註 / .dockerignore | b13088f, bbaeec8, 2c47252, 20a9ba0 | — |
| **總計** | | 前 6 個 commit **35 檔 +30/−6,138、29 檔移除（−6,101 行）**；連 .dockerignore 尾巴 20a9ba0 共 **36 檔 +30/−6,147**（Opus 重算一致） |

## 5. 部署計劃（Opus PERF-FINAL-OPUS §D，GO 有條件）
1. **前置**：唔喺 Eric 真機 HLS QA 進行緊嗰陣做；HEAD = b7eb419；`approve.sh backend <sha> --confirm` → `backend-restart.sh --dry-run` → 真 restart。gate 係 per-sha，restart 前 `git log <approved>..HEAD` 核一次有冇夾帶其他 session 嘅 commit。
2. **① backend restart**（2A A-1..A-5 + 2C C-1..C-7 + Stage 3 + b0f7931）→ 15 分鐘 smoke：`/api/version` 追返真檔 dataVersion（一次過跳變係預期）；`?lite=1` gzip ≈371,984 B 且首個 object 冇 lyrics key；`/api/hymns/lyrics` ≈992,859 B；`/api/hymns`（舊 client）6,405 首有 lyrics；四組死 route 410、兩條診斷 route 200；backend RSS。
3. **② OTA**（2B + 2D + 2E + b7eb419，同一 sha）→ 記低 android/ios group id 供 `ota-rollback.sh`。**restart 必須先於 OTA**（反轉唔會壞，有 isFull fallback，但收益落空）。
4. **監察 48h**：`[access]` 三條 hymns route 0–1ms + bytes；`[deprecated-route]` 410 命中（零命中先刪 stub 檔）；`🗜️ async compress` 每次 miss 後 100–200ms 內出 + CF 對 origin 嘅 Accept-Encoding 有冇 br；`[db] stale lock`；backend RSS 唔再見 +58MB 階梯；client-log `perfMarks`（merged=1 佔比、lyricsFail、byt 跌到 lite、att/ok1）；`perfHome libIdle` 真機 ~0.7–1.5s。
5. **回滾**：backend 任一 hymns route 5xx / bytes 唔對 / RSS 反升 / 舊 client 攞唔到 6,405 首 → approve 前一個 sha + restart；OTA `n≠6405` / merged 佔比跌 / home 惡化 >20% / 歌詞睇唔到 → ota-rollback.sh。⚠️ backend 唔可以長期停喺舊版而 client 已 OTA（每次開機會拉全量）。

## 6. 未做 / 要 Eric 拍板
- 碟上 11GB `backend/hymns.db.bak-*` + `*.webm`（gitignored）刪唔刪；`.git` 1.1GB loose objects 要唔要 gc。
- 部署時機：backend restart（一次過出 2A+2C+Stage 3）→ 之後 OTA（2B+2D+2E）。紅線：restart 先於 OTA。
- 出街後監察：`[access]`、`[deprecated-route]`（48h 零命中先刪 stub 檔）、`[db] stale lock`、RSS、CF 對 origin 送嘅 Accept-Encoding（brotli）。
- Phase 2.5 規劃（開 App 第一首）：baseline 見首次撳播 205ms `source=local`（預載已生效），建議暫緩。
- 後續 P1/P2（PERF-FINAL-OPUS §E）：version 變時 lite 唔好蓋走 MMKV 舊 lyrics（開機一段時間冇歌詞窗口）；E-1 加 bodyTimeout note；E-2 timer scope；收爐後 `PERF_MARKS_ENABLED=false`。
- 真機第一晚要睇：993KB 歌詞背景落載同第一首歌預載搶上行（已延後 8–15s，未實測）。
- 未量化：真機 tunnel 環境下 A-6 嘅秒數收益（估算：body 時間 ∝ bytes，3–9s → 0.8–2.3s）。

## 7. 方法論教訓（入 memory）
- 同 bundle id `simctl install` 唔會真換二進制：A/B 要 uninstall + get_app_container 核 bytes。
- prod 秒數同時段浮動 55–106%：wall-clock 對比一定交錯量；bytes / server ms / render 次數先係穩定指標。
- 「衍生數字要第二個人重算」：三個 baseline 錯全部係算出嚟唔係量出嚟。
- SQLite `length()` 係字元唔係 bytes；CJK 內容百分比會低估一倍。
- zsh `--include=*.js` 會 glob 展開令正控回 0——grep 前先做正控。

## 8. 文件索引
PERF-IMPROVEMENT-PLAN / PERF-BASELINE-1A / 1B / OPUS / PERF-STAGE2-EXEC / 2A / 2A-OPUS / 2B / 2B-OPUS / 2C / 2C-OPUS / 2C6-OPUS / 2D / 2D-OPUS / 2E / PERF-STAGE3-EXEC / STAGE3 / STAGE3-OPUS / PERF-FINAL-OPUS（全部 `*-20260902.md`，raw 喺 `ops/perf/`）。
