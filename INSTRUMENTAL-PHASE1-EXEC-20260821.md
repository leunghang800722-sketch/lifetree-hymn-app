# 純音樂 Phase 1 執行指引(schema + 存量回標)

日期:2026-08-21
執行者:Sonnet5 code session
規劃正本:`INSTRUMENTAL-CATEGORY-PLAN-20260821.md`(§8 六條政策 Eric 已全部拍板;本檔只覆蓋 §9 嘅 Phase 1)
驗收:Opus5(驗收清單見 §6)

---

## §1 目標同範圍

四件事,全部係 backend/DB 層,**零前端改動、零新歌入庫、零 backend restart、零 OTA**:

1. **T1** migration:`hymns_all` 加 `instrumental INTEGER DEFAULT 0` 欄 + 重建 `hymns` view
2. **T2** whisper 全庫掃描(read-only):用現成 `lyrics_timeline.whisper` 出「純音樂候選」報告
3. **T3** 存量回標(locked write):已知器樂 + whisper 實錘嘅落 `instrumental=1`;擦邊個案出名單**唔寫**,等 Eric 過目
4. **T4** 歌詞 pipeline query 加 exclusion(10 個位)

### 停位(唔准做)

- ❌ 前端任何改動(tab/chip/admin 表單係 Phase 2,連同 server.js SELECT 加欄一齊做)
- ❌ `server.js:206` 條 SELECT **唔好**喺 Phase 1 加 `instrumental` 欄(出街欄位改動要跟 OTA 節奏,屬 Phase 2)
- ❌ 唔入任何新歌、唔起 discover pipeline(Phase 4)
- ❌ 唔改 `displayTitle.js`(Phase 4 嘅 4a)
- ❌ 唔改串流/預載 code(Phase 3)
- ❌ 唔 restart backend、唔行 deploy gate(Phase 1 完全唔需要:server 係讀 in-memory 副本,`/api/hymns` 未出新欄,回標對 App 零可見影響)
- ❌ 唔准掂 Cloudflare/DNS/cert/token(標準禁令)
- ❌ AskUserQuestion 工具唔准用(non-interactive session 會卡死)

做完 T1-T4 + §6 自驗就收工 commit,唔好自行延伸落 Phase 2。

---

## §2 T1:migration script

新檔 `backend/scripts/migrate-instrumental.js`,**完全照抄 `scripts/migrateTaxonomy.js` 骨架**:

1. backup `hymns.db` **同** `users.db`(照 `migrateTaxonomy.js:44-56`,timestamp 後綴)
2. `acquireDbLock('migrate-instrumental')`
3. 由碟 fresh `openDb()`(鎖內先開,唔准用鎖前嘅 snapshot)
4. idempotent `ALTER TABLE hymns_all ADD COLUMN instrumental INTEGER DEFAULT 0` —— 先 `PRAGMA table_info(hymns_all)` 查欄存唔存在,存在就 skip(照 `migrateTaxonomy.js:64-76`)
5. **重建 `hymns` view**:`DROP VIEW hymns` + 原句 `CREATE VIEW hymns AS SELECT * FROM hymns_all WHERE curated = 1 AND status != 'dead' AND status != 'rejected'`。⚠️ 呢步唔可以慳:view 係 `SELECT *`,建立時已凍結欄位清單,唔重建就永遠見唔到新欄(`migrate-lyrics.js:13-15` 明文;參考 `scripts/migrate-hymns-view.js` 做法)
6. `saveDb()` → `releaseDbLock()`

紀律:
- 鎖內零網絡、零慢工序([[feedback-hymnsdb-writes-need-lock]];`fetchLyrics.js:20-38` 血淚註解)
- **唔使停 backend**:已核實 `lib/serverDb.js` 係純讀 in-memory 副本,而 `lib/adminHymns.js:4` 鐵律「永遠唔好將 server 記憶體副本寫落碟」—— 所有寫路徑都係鎖內 fresh openDb,長駐 process 唔會剷返走個新欄。growLibrary/fetchLyrics 呢啲係逐次 spawn 嘅 script,下次行自然見到新 schema。
- ⚠️ 揀 R1 歌詞班唔喺 apply/restart 窗口嘅時候行(佢哋都會攞同一個 DB lock,撞咗會等,唔會壞,但唔好夾時間)。

自驗:`sqlite3 -readonly backend/hymns.db "PRAGMA table_info(hymns_all)"` 見到 `instrumental`;`SELECT instrumental FROM hymns LIMIT 1` 行到(證明 view 重建咗);`SELECT COUNT(*) FROM hymns` 前後一致(6102,除非期間有班出過歌)。

---

## §3 T2 + T3:whisper 掃描 + 存量回標

### 3.1 T2 掃描 script(read-only,零網絡、零落片)

新檔 `backend/scripts/scanInstrumentalCandidates.mjs`,唔攞鎖(唔寫嘢),輸出兩份檔:
- `backend/data/instrumental/scan-20260821.json`(機讀)
- `backend/data/instrumental/scan-20260821-report.md`(人讀,俾 Eric 過目擦邊名單)

對每行 `hymns_all` `curated=1 AND status='ok'` 且 `lyrics_timeline` 有 whisper array 嘅:

```
durationSec = parse(duration)          // ⚠️ duration 係 TEXT "M:SS",純分鐘制(62:30 = 62分30秒),要自己 parse
wText       = segs.map(s => s.text).join('\n')   // ⚠️ 一定要 '\n' join,唔准空格 join(auditLyricsBatch.js:132-137 已修 bug)
coverage    = max(seg.t1) / durationSec
cjkChars    = CJK 字數;latinChars = 拉丁字元數(參考 auditLyricsBatch.js:100-160 whisperShortVerdict() 嘅實作,反轉用)
```

三級判定:
| 級 | 條件 | 去向 |
|---|---|---|
| **實錘** | `coverage ≥ 0.85 AND cjkChars < 30 AND latinChars < 60 AND lyrics_status != 'verified'` | T3 自動回標(Eric Q6 批咗唔使問) |
| **擦邊** | coverage 0.70-0.85,或字數喺門檻 1.5 倍內,或 `whisper:[]`(segs=0) | 落 report 人手名單,**唔寫** |
| 唔係 | 其餘 | 略過 |

⚠️ `lyrics_status='verified'` 一律唔入候選(唔理 whisper 講乜)—— 保護 3959/3976/3984/8033 呢類「器樂版但片上打晒歌詞字幕」個案(8033 仲救返過原曲 7721,見 SUPERVISION-LOG:6181)。report 可以另開一個「verified 但 whisper 靜」嘅觀察名單,但唔准動。

### 3.2 已知名單(同 T2 實錘 union、dedupe)

- title-match 27 首(`演奏/Instrumental/純音樂`),當中 4 首 verified(3959/3976/3984/8033)**剔走唔標**
- SUPERVISION-LOG 三批死症 vein id(讚美之泉 鋼琴演奏系列/安靜系列/弦樂四重奏/青少年弦樂團):
  - `:4145` → 5065, 5690, 5691, 5701, 5803, 5804, 5805, 5806, 5810, 5812, 5922, 5925, 5980, 5990, 5991
  - `:3822` → 739, 2987, 2988(其餘同上重複)
  - `:5321` → 5794, 5795, 5798, 5799, 5801, 5915
- ⚠️ 已知名單都要過一次 T2 判定式核實(有 whisper timeline 嘅睇實證;冇 timeline 嘅照 SUPERVISION-LOG 人手判定紀錄入「實錘」,喺 report 註明依據行號)

### 3.3 T3 回標 script(locked write)

新檔 `backend/scripts/applyInstrumentalFlags.mjs`,**照抄 `ops/lyrics/delist-batch.mjs` 嘅安全 pattern**:輸入 `[{id, reason}]` JSON(reason 必填,寫明「whisper實錘 cov=0.97 cjk=3」呢類實據)、`--dry` 先出 before/after report、冪等(再行一次零改動)、逐條 log。

每條寫:
```sql
UPDATE hymns_all SET instrumental = 1,
  lyrics_status = 'unavailable',        -- 只限原值唔係 'verified'(script 硬 gate,雙保險)
  lyrics_source = 'instrumental'
WHERE id = ?
```

紀律:
- 鎖內 fresh openDb → 逐條 UPDATE → saveDb → 放鎖;慢嘢(如有)全部鎖外做
- **長片照標**:739(57:58)、5065 呢類已上架長器樂片照落 flag —— Q2 個 10 分鐘上限係**新歌入庫**嘅 gate,唔係存量;呢啲歌今日已經咁樣播緊,回標零行為改變(串流長檔應對係 Phase 3/5 嘅事)
- **ledger 同步**(「改 DB 但唔清 ledger 等於冇改」—— `oneoff-resetDlDead403-20260819.mjs:12-16` 教訓):
  - `backend/data/lyrics-requeue-priority.json`:`parkedInstrumentals` 名單正式退役 —— 嗰 7 首(5699/5700/5794/5795/5799/5801/6734)落咗 flag 後,將個 `parkedInstrumentals` key 整體移除,喺 commit message 註明由 instrumental flag 接手
  - 檢查 `backend/data/lyrics-dl-failures.json` 有冇回標 id 殘留,有就清埋

### 3.4 執行次序

`--dry` 出 report → 自己核對(§6 checklist)→ 真跑 → report 連擦邊名單一齊 commit。**擦邊名單唔寫 DB**,留返俾 Eric 過目後另開一轉。

---

## §4 T4:歌詞 pipeline query exclusion

以下 10 位加 `AND (instrumental IS NULL OR instrumental = 0)`(shell 嗰三條係嵌入式 SQL,照樣加):

| # | 檔案:行(2026-08-21 行號,執行時自行重新定位) | Query |
|---|---|---|
| 1 | `backend/scripts/fetchLyrics.js:306-310` | `pickCandidates`(CC 層) |
| 2 | `backend/scripts/fetchLyrics.js:318-321` | `pickOcrCandidates`(OCR/whisper 層) |
| 3 | `backend/scripts/fetchLyrics.js:265-270` | `report()` 統計(instrumental 另外單獨數一行,report 先睇得明) |
| 4 | `backend/scripts/reviewLyrics.js:52-56` | `--export` 複核隊 |
| 5 | `ops/lyrics/bi-freeze.mjs:64-65` | `--refresh` |
| 6 | `ops/lyrics/bi-freeze.mjs:88-89` | `--filter`(同款 query 第二份) |
| 7 | `ops/lyrics/producer-keeper.sh:170` | `POOL` 計數 |
| 8 | `ops/lyrics/producer-keeper.sh:171` | `CCLEFT` 計數 |
| 9 | `ops/lyrics/producer-keeper.sh:179` | `DRAFTS` fallback 計數 |
| 10 | `ops/lyrics/requeue-pending-count.mjs:23-24` | 重做隊 pending |

**刻意唔加**:`alignBackfill.js` / `alignLyrics.js` —— timeline 係人聲偵測證據,繼續做冇壞,而且佢哋候選只揀 `draft/verified`,instrumental(`unavailable`)天然入唔到。喺 code comment 註明呢個係刻意決定,唔係漏。

註:理論上 `lyrics_status='unavailable'` 已經係終態(兩條候選 query 硬性要 `'none'`),呢 10 刀係雙保險 + 語意清晰,唔係修 bug —— comment 寫清楚,免得下手誤會。

---

## §5 Git 紀律

- 多 session 共用 worktree:**唔准 `git add -A`**,一律 `git commit -- <pathspec>` 指名檔案([[feedback-concurrent-git-add-collision]])
- 建議分兩個 commit:①T1 migration + T4 query exclusions(code);②T2/T3 scripts + data 產物 + `hymns.db`(回標結果)。`hymns.db` 係二進制,commit 前核對 working tree 冇夾到其他 session 嘅嘢
- backup 檔(`hymns.db.bak-*`)唔好 commit

---

## §6 自驗 checklist(Opus5 驗收都照呢份行)

1. `PRAGMA table_info(hymns_all)` 有 `instrumental`;`SELECT instrumental FROM hymns LIMIT 1` 行到(view 重建實錘)
2. `SELECT COUNT(*) FROM hymns` 同 migration 前一致;`SELECT COUNT(*) FROM hymns_all WHERE instrumental=1` 同 T3 report 條數啱
3. 回標行抽 5 首驗:`instrumental=1 AND lyrics_status='unavailable' AND lyrics_source='instrumental'`;**3959/3976/3984/8033 四首 verified 一定係 `instrumental=0` 未被郁**
4. `--dry` report 同真跑 report diff 一致;再行一次 script = 零改動(冪等)
5. `lyrics-requeue-priority.json` 冇咗 `parkedInstrumentals`;`lyrics-dl-failures.json` 冇回標 id
6. 10 條 query grep 到 exclusion;`producer-keeper.sh` 三條數字行一次驗到唔會 syntax error
7. 擦邊名單 report 存在、格式清楚(id/title/coverage/字數/建議),**無一首擦邊個案被寫入 DB**
8. live `/api/hymns` 抽一首回標歌:response **唔應該**有 `instrumental` 欄(Phase 1 唔出街),而佢嘅 `lyrics` 欄本身就係空 —— App 端零可見變化

---

## §7 已知風險提示(執行時對照)

- sql.js 全檔 last-writer-wins:所有寫必須鎖內 fresh openDb(三晚 36 首得返 1 首嘅前科)
- 同 run 唔可以用舊 snapshot 揀候選(`fetchLyrics.js:645-652` 教訓)
- whisper 幻覺方向安全:幻覺=有字=唔會誤標做 instrumental,只會落擦邊名單 —— 唔使額外處理
- `duration` TEXT parse 要處理異常值(NULL/空串/怪格式),parse 唔到就落擦邊名單唔好估
