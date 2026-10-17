# PERF Stage 3 執行單：dead code 清理 2026-09-02（Fable 5.1 出，Sonnet 5 執行，Opus 5 驗收）

依據：PERF-BASELINE-1A-20260902.md §A4 + Errata、PERF-BASELINE-OPUS-20260902.md §4e。
規則：**每刪一樣先 grep 證零引用（正控必做）→ 刪 → 回歸 → 一項一 commit（pathspec-only）。** 執行者唔判 PASS/FAIL。

## 範圍（准刪）
| # | 目標 | 證據來源 | 回歸 |
|---|---|---|---|
| S3-1 | git tracked 備份：`frontend/hymn-app/App.js.fullbak` `.v134-expo-av` `.v135-youtube` `.v138-bak` `index.js.bak`；`backend/hymns.db.bak` `backend/hymns.db.backup-week1` | 1A A4 tracked-backups | `git rm`（history 保留）；grep 全 repo 冇人 require/讀呢啲檔名 |
| S3-2 | backend root 14 個舊 script（bulk_insert_hymns.js check_hymns.cjs e2_cn_batch.cjs e2_final.cjs expand_batch.cjs expand_hymns.cjs expand_hymns_v2.cjs fetch_songs.js fix_dead_ytdlp.cjs fix_missing.js generate_hymns.js seed.js update_db.js update_hymn_link.js）+ 佢哋獨有嘅依賴（例如 `backend/db.js` 如果刪完之後零引用；`hymn-check-report.txt`、`title-norm-diff-*.csv` 等產物如果係 tracked 而零引用） | 1A A4 root-scripts + Opus 4e | 逐個 grep（含 ~/Library/LaunchAgents/*.plist、ops/、package.json、docs）；刪後 `node --check` 全 backend；harness import server 路徑（2A 方法：dynamic import routes/lib，唔起 server.js）證明 boot 唔爆 |
| S3-3 | `backend/scripts/fetch{Keen,MusicBrainz,Sop,Tianyun,Xiaoyang,Xinxin}Catalog.js` + `oneoff-retireParkedInstrumentals-20260823.mjs` | 1A A4 scripts-usage | 同上；確認對應 `backfillAlbumFrom*Catalog.js` 唔 import 呢啲爬蟲（只讀 catalog JSON） |
| S3-4 | `backend/routes/search.js` `category.js` `audio.js`：**唔刪檔**（Opus 建議 access log 跑一日先），但將 A-4 之後已經 unreachable 嘅舊 handler/`queryDb()`/imports 剷走，淨返 410 stub + 一段註解講點解保留 | 2A A-4 | `node --check`；harness 打 410 |
| S3-5 | `frontend/hymn-app/src/deviceId.js :: __resetForTest`（grep 含 tools/ota-harness、tools/react-harness） | 1A A4 unused-exports | `npx expo export --platform ios --output-dir <scratchpad>`（唔准寫 dist/）成功 = bundle 編譯通過；記 hbc 大細 |
| S3-6 | 文檔：HANDOFF.md / docs 內提及被刪 script 嘅行，加「（已於 2026-09-02 Stage 3 移除）」註明，唔刪段落 | — | — |

## 唔准掂
- `frontend/hymn-app/src/**`（除 S3-5 deviceId.js 一行）同 `App.js`——2B 正在改。`src/perfMarks.js :: elapsedSinceT0` 留待收尾。
- backend/lib/**、backend/scripts 其他檔、hymns.db、任何 launchd plist。
- 碟上 11GB `hymns.db.bak-*`/`*.webm`（gitignored）——**唔刪**，等 Eric 拍板。`.git` gc 亦唔做。
- 唔部署。

## 產出
- 一項一 commit；`PERF-STAGE3-20260902.md`：表 `項 | 檔 | 行數 | 零引用證據(指令+正控) | 回歸指令+結果 | commit | Opus5判定(留空)`；總計刪走幾多檔/幾多行（`git diff --shortstat <before>..<after>`）。
