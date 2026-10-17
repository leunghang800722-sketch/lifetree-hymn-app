# 會員系統 Phase 2 執行方案:備份欠單 + admin 地基 + 管理員功能

> 2026-07-31 Fable 5 出稿。跟一貫三層流程:呢份係規劃,交 Sonnet 落地,Opus 驗收。
>
> 背景:Eric 拍板 —— **跨裝置同步驗收暫緩**(等佢搵到第二部 Android 機),其他嘢照做。
> 呢份方案涵蓋三項:
> - **A. Phase 0 欠單**:`users.db` 每日自動備份(母 plan §5.7,唯一未剔嘅 Phase 0 項)
> - **B. Phase 1/2 交界欠單**:`users` 表加 `role` 欄 + `setAdmin.js`(母 plan §4.1)
> - **C. Phase 2 主體**:管理員功能 —— App 內改歌名/分類、貼 YouTube 連結加歌、落架
>   (母 plan §4.2-4.5、§8 Phase 2),配合 Eric 谷緊嘅 3000 首擴庫目標
>
> **唔做**:Phase 3/4(分享清單/好友/邀請碼)—— 等歌庫夠 3000 首先做。
> 母 plan:`MEMBERSHIP-PLAN.md`。已落地部分:Phase 0(fc9a31b 等)、W1/W2 同步(`MEMBERSHIP-PHASE1-LOGIN-SYNC.md`)。

---

## 0. 落筆前已核實嘅現況(Sonnet 唔使自己再考古)

| 事實 | 對設計嘅影響 |
|---|---|
| `hymns` 係 **view**(`hymns_all WHERE curated=1 AND status!='dead'`,`migrate-hymns-view.js`) | 落架 = `UPDATE hymns_all SET curated=0`,全 App 自動消失,唔使新機制;**所有寫入落 `hymns_all`**(view 唔寫得) |
| 記憶體副本有**兩份**:`server.js` 同 `routes/home.js` 各自有 module-level `dbPromise`;`category.js`/`search.js` 每 request 由碟重讀;`stream.js`/`audio.js` 用 server.js 嗰份 | `reloadDb()` 要兩份一齊清,漏一份就會「詩歌庫改咗、首頁未改」呢類半生熟狀態 |
| `dataVersion`(App cache-bust 機制)係 server.js **開機時**由 hymns.db mtime+size 算一次 | admin 改完 DB 如果唔重算 dataVersion,App 端 MMKV 永遠唔知要 refetch —— 呢個係「其他裝置刷新即見」驗收項嘅命脈 |
| `hymns.db` 寫入鎖:`hymnDb.js` `acquireDbLock()`,但預設**最多等 5 分鐘** | HTTP request 唔可以等 5 分鐘,要加短 timeout 參數(見 §3.2) |
| `users.db` 係「**server process 單一寫入者**」:server 開機讀入記憶體,每個寫操作即刻全量 export 落碟 | CLI script 直接改 users.db 檔案,會俾 server 下一次 save 冚走(lost update)—— `setAdmin.js` 要配套重啟(見 §2.2) |
| `requireAuth.js` 每個 request 已經由 users.db 重新 SELECT 用戶(唔齋信 token) | `requireAdmin` 只需喺同一次 SELECT 攞埋 `role`,天然滿足母 plan「每次由 DB 核實 role」要求,零額外 query |
| 入庫 pipeline 現成:`backfillCore.js` 有「篩選→resolveAudioUrl 驗活→INSERT curated=1」全套;`displayTitle.js` 有 `cleanDisplayTitle()` | admin 貼連結加歌重用呢啲件,唔另起爐灶;INSERT 欄位形狀照抄 backfillCore(§3.4) |
| 夜晚 job 用 launchd plist(`~/Library/LaunchAgents/com.hymnapp.*.plist`),有現成格式範本 | 備份 cron 跟同一格式,唔用 crontab |
| 前端:`AuthContext` 有 `user`/`token`(冇 role);詩歌庫行尾係心心+加清單掣(冇 long-press);`MineScreen` 係「我的」頁;sheet 範本有 `AddToPlaylistSheet.js` | admin UI 落點見 §3.7 |

---

## A 項(§1):users.db 每日備份 cron

### 1.1 點解要做

用戶數據(帳戶、最愛、清單)冇得重建 —— 歌庫爛咗可以重 scrape,用戶數據爛咗就係 2026-07-25
Auto Backup 食清單嗰單嘢嘅 server 版。而家 `users.db` 得一份,一次碟壞/誤刪就冇晒。

### 1.2 做法

**新檔 `backend/scripts/backupUsersDb.js`**:

1. `fs.copyFileSync(users.db → backend/backups/users-YYYYMMDD.db)`。
   直接 copy 係安全嘅:server 寫入係 tmp+rename(atomic),任何時刻碟上嗰份都係完整
   snapshot,唔會 copy 到半寫狀態。唔使停 server、唔使鎖。
2. copy 完用 sql.js 開返份 backup 行一句 `SELECT COUNT(*) FROM users` 做完整性 sanity
   check —— 開唔到/count 讀唔到就 `process.exit(1)` 並且**唔好**行第 3 步(唔好俾一份
   爛 backup 頂走一份好嘅舊 backup)。
3. Prune:剷走 `backups/` 入面超過 14 日嘅 `users-*.db`(用檔名日期判斷,唔用 mtime
   —— mtime 會俾 Time Machine/copy 搞亂)。
4. Log 一行去 stdout(launchd 收去 log 檔):`✅ backup users-20260731.db (N users, M bytes), pruned K`。

**新檔 `~/Library/LaunchAgents/com.hymnapp.usersbackup.plist`**:照抄 `com.hymnapp.growlibrary.plist`
格式(node 路徑/WorkingDirectory/PATH env/log 去 `/tmp/hymn_usersbackup.log`),但用
`StartCalendarInterval` 每日 **03:30**(deadlinkcheck 04:00 之前、避開 backend 重啟時段;
其實同邊個撞都冇所謂,備份唔掂 hymns.db 唔攞鎖,純粹揀個半夜靜嘅鐘數)。

**配套**:
- `backend/backups/` 入 `.gitignore`(入面係用戶 PII + bcrypt hash,**絕對唔可以上 git**);
  `chmod 700 backend/backups`。
- script 開頭 `fs.mkdirSync(backupsDir, { recursive: true })`,第一次行自己開目錄。

### 1.3 驗收(Opus)

1. 手動 `node scripts/backupUsersDb.js` → `backups/users-YYYYMMDD.db` 出現,log 有 user count。
2. 擺個假舊檔 `backups/users-20260101.db` 再行一次 → 假舊檔被 prune,今日嗰份仲喺度。
3. 將 `users.db` 換成垃圾 bytes 行一次(用完即刻還原)→ exit 1、冇 prune 發生。
4. `launchctl list | grep usersbackup` 見到 job 載入咗;`plutil -lint` plist 過。
5. **翌日**(或者 `launchctl kickstart` 手動觸發)check log 有成功條目。
6. `git status` 確認 backups/ 冇被 track。

---

## B 項(§2):`role` 欄 + `setAdmin.js`

### 2.1 Schema 改動(`lib/userDb.js` `initSchema`)

跟現有 migration pattern(try/catch ALTER):

```js
try { db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'"); } catch (_) {}
```

- 現有行 ALTER 之後讀出嚟係 `'member'`(SQLite ADD COLUMN 帶 DEFAULT 對舊行生效),
  但 code 讀 role 一律寫 `row.role || 'member'` 做保底,唔賭 driver 行為。
- **冇任何 HTTP API 可以寫 role**,連 admin API 都冇 —— 唯一途徑係 §2.2 個 CLI script。
  呢個係母 plan §4.1 嘅核心:越權攻擊面直接唔存在。

### 2.2 `backend/scripts/setAdmin.js`

用法:

```
node scripts/setAdmin.js <email 或 E.164 電話>            # 標做 admin
node scripts/setAdmin.js <email 或 E.164 電話> --revoke   # 褫奪返做 member
```

行為:

1. 開 `users.db`,搵 email/phone 完全匹配嘅用戶;搵唔到就列出現有用戶(id/email/phone/role)
   俾人肉眼對,exit 1。
2. `UPDATE users SET role=...` → atomic save(抄 `saveUserDb` 做法)。印 before/after。
3. **⚠️ 單一寫入者衝突處理**(§0 核實過嘅陷阱):server 記憶體嗰份唔知碟上改咗,
   佢下一次任何寫操作(邊個登入/撳個心心)就會用舊記憶體冚返落碟,role 改動即刻消失。
   所以 script 收尾**自動重啟 backend**:
   `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend`,加 `--no-restart` flag 俾人
   揀手動。重啟後 server 由碟重讀,一致返。呢個 script 一年用唔到幾次(標 Eric 一次、
   驗收標/褫奪測試帳戶幾次),重啟成本完全可接受;而堅持行 CLI+重啟而唔開
   「localhost-only API」嘅原因:backend 喺 cloudflared tunnel 後面,tunnel 進嚟嘅
   request 喺 socket 層*就係* localhost,齋 check remoteAddress 會俾遠端請求扮本機,
   呢類半桶水保護唔要都罷。
4. `--revoke` 係俾驗收用完即走(§5 會用),亦都係將來萬一 token 洩露要即時褫奪嘅開關
   (requireAdmin 每 request 讀 DB,revoke 即時生效,唔使等 30 日 token 過期)。

### 2.3 role 流通落前端

- `requireAuth.js` SELECT 加 `role` 欄(一行改動,順手 `|| 'member'`)。
- `auth.js` 三個位(register/login/`/api/auth/me`)response 嘅 `user` object 加 `role`;
  `otpAuth.js` 發 token 嗰個 response 同樣加。JWT payload **唔加** role —— 反正唔會信佢,
  唔好俾將來邊個手快快 decode 咗當真。
- 前端 `AuthContext`:`user.role` 跟住而家嘅 AsyncStorage 持久化行(零新機制);
  暴露 `isAdmin = user?.role === 'admin'`。App 開機已有 `/api/auth/me` 刷新用戶嘅話,
  role 變動(褫奪)最遲下次開 app 生效;冇嘅話 admin API 反正每次都 403 兜底,UI 遲啲
  隱藏冇安全後果。

### 2.4 驗收(Opus)

1. `setAdmin.js` 對唔存在嘅 email → exit 1 + 列用戶清單。
2. 對 `opus-verify` 測試帳戶(用返呢個,唔好開新帳戶 —— 之前拍板)標 admin →
   script 印 before=member after=admin,backend 有重啟(check `launchctl` PID 變咗)。
3. 重新登入該帳戶 → `/api/auth/me` response 有 `role:'admin'`。
4. `--revoke` → 即時(唔使重新登入)admin API 全部變 403(證明「每 request 讀 DB」真係生效)。
5. 全 codebase grep 確認冇任何 route 寫 `role`。

---

## C 項(§3):Phase 2 管理員功能

### 3.1 `lib/requireAdmin.js`

```js
// 疊喺 requireAuth 後面用:app.use('/api/admin', requireAuth, requireAdmin, ...)
export default function requireAdmin(req, res, next) {
  if ((req.user?.role || 'member') !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
```

`req.user.role` 係 requireAuth 啱啱先由 DB SELECT 返嚟嘅(§2.3),唔係 token payload ——
母 plan「每次由 DB 重新核實」呢度已經齊,唔使第二次 query。另加 per-user 限速
(抄 `me.js` 嗰個 Map pattern,60/min;preview 另有更緊嘅,見 §3.4)。

### 3.2 `hymns.db` 寫入層:`lib/adminHymns.js`(新檔)

呢個係全 Phase 2 最危險嘅交界位(母 plan §4.3 標咗 🔴),規則四條:

1. **永遠唔好將 server 記憶體副本寫落碟。** server 開機嗰份已經舊(夜晚 job 之後加咗歌),
   export 佢等於冚走夜晚新增。寫入一律:攞鎖 → `openDb()` **由碟開新鮮副本** → 改 →
   `saveDb()` → 放鎖。同夜晚 script 平起平坐行同一套 `hymnDb.js` 協議。
2. **鎖內唔准有網絡操作。** yt-dlp metadata、resolveAudioUrl 驗活全部喺攞鎖**之前**做完
   (2026-07-25 fetchLyrics 搶鎖冚寫嗰課嘅變奏:持鎖時間必須係「開檔改嘢寫檔」呢兩三秒,
   唔係幾十秒)。
3. **HTTP 唔等 5 分鐘。** `acquireDbLock()` 加第二個參數 `maxWaitMs`(預設維持而家嘅
   5 分鐘,夜晚 script 行為零改動);admin 寫入傳 `10_000` —— 10 秒攞唔到鎖就回
   `503 { error: 'db_busy' }`,前端 toast「背景維護行緊,一陣再試」。日頭 admin 改嘢
   基本上冇 job 行緊,呢個 503 一年見唔到幾次。
4. **寫完即 call `reloadDb()`**(§3.3),唔使重啟 backend。

提供三個 function,全部回 `{ before, after }` 俾 route 層寫 audit:
`updateHymn(id, fields)` / `insertHymn(fields)`(或 re-list,見 §3.4)/ `delistHymn(id)`。

### 3.3 `reloadDb()`:抽記憶體副本做一個模組

新檔 `lib/serverDb.js`,將而家**兩份重複嘅** lazy-loader(server.js `getDb` + home.js
`getDb`)合併做一份:

```js
export async function getDb()        // lazy singleton,行為同而家一樣
export function getDataVersion()     // 而家 server.js 個 module-level dataVersion 搬入嚟
export function reloadDb()           // dbPromise = null + 由 hymns.db mtime+size 重算 dataVersion
```

- `server.js`/`home.js` 改 import 呢個模組;`stream.js` 照舊由 server.js 傳 `getDb` 落去
  (或者直接 import,Sonnet 睇邊樣改動細);`category.js`/`search.js` 每 request 重讀,
  唔使掂 —— admin 寫完佢哋下一個 request 自動見到新嘢。
- `/api/version` 同 `/api/hymns` 改讀 `getDataVersion()`。
- **dataVersion 重算係成件事嘅膊頭位**:App 端 `useCachedHymns` 靠 version 對唔上先肯
  refetch。reload 唔重算 = 其他裝置永遠見唔到改動 = §8 Phase 2 驗收直接肥佬。
- 開機 precache 同 keep-warm 嗰兩段用自己獨立讀嘅副本/`getDb()`,reload 後 keep-warm
  下個 tick 自然攞到新 handle,唔使特別處理。

### 3.4 Admin API(`routes/admin.js`,新檔;全部 `requireAuth + requireAdmin`)

```
GET   /api/admin/hymns/:id        — 由 hymns_all 讀全行(包 curated/status,編輯 sheet 預填;
                                     view 睇唔到已落架嘅,admin 要睇到)
PATCH /api/admin/hymns/:id        — 改歌 metadata
POST  /api/admin/hymns/preview    — 貼 URL 攞 metadata + 過濾預警(唔寫 DB)
POST  /api/admin/hymns            — 確認入庫
POST  /api/admin/hymns/:id/delist — 落架
```

**PATCH `/api/admin/hymns/:id`**
- 可改欄位白名單:`title, display_title, artist, category, lang, album, title_en`。
  白名單以外一律 400(尤其 `curated`/`status`/`youtube_id` —— 呢啲有自己嘅專屬通道,
  唔准由 generic edit 掂)。
- 驗證:string、trim 後非空(album/title_en 可以清空)、≤200 字元、strip 控制字元
  (同 §5.6 display_name 一致);最少一個欄位;id 要喺 `hymns_all` 存在。
- 寫入行 §3.2;response `{ ok, hymn, dataVersion }` —— 帶新 dataVersion 俾前端即刻
  invalidate 本地 cache(§3.7)。

**POST `/api/admin/hymns/preview`** — 加歌流程上半場(母 plan §4.4)
- Body `{ url }`。**唔好將原始 URL 掟落 shell**:先用 regex 由
  `youtube.com/watch?v=` / `youtu.be/` / `youtube.com/shorts/` 抽 11 字元 video id
  (`[A-Za-z0-9_-]{11}`),抽唔到就 400。之後一律用 server 自己砌嘅
  `https://www.youtube.com/watch?v=<id>` + `execFile`(參數陣列,唔行 shell string)
  叫 yt-dlp `--print "%(id)s|%(duration)s|%(title)s|%(channel)s"`。
- 撞庫 check:`hymns_all` 已有呢個 youtube_id →
  - `curated=1`:回 `{ exists: true, hymn }`,前端話「已經喺庫」完場。
  - `curated=0`(之前落架/未 curate):回 `{ relistable: true, hymn }`,前端俾 Eric 揀
    「重新上架」(行 POST 嘅 re-list 分支)。
- 過濾預警(**提示唔係攔截** —— 母 plan §4.4:規則係幫 Eric 唔係限佢):逐個 signal 行
  `isInSongDurationBand` / `isCompilation` / `isNonWorship`,命中就落 `warnings:[...]`
  (例:「片長 34 分鐘,超出正常歌帶」「標題似合輯/節目」),Eric 睇完照加得。
- Response:`{ youtube_id, title, display_title: cleanDisplayTitle(title, channel), channel, duration, warnings }`
  —— 全部欄位喺前端 preview 度可以即場改。
- 限速:呢條 route 每下都 spawn yt-dlp(燒住家 IP 嘅預算),per-user 10/min。

**POST `/api/admin/hymns`** — 加歌流程下半場
- Body `{ youtube_id, title, display_title, artist, category, lang, album? }`(preview 改完
  嘅最終值;validation 同 PATCH 一致,youtube_id 再過一次 11 字元 regex)。
- 攞鎖**之前**:`resolveAudioUrl(youtube_id)` 驗活(preview 過嘅多數已經 warm,呢下順手
  暖埋 URL cache —— 入完庫即刻播都係 warm 路徑);resolve 唔到回 422「拎唔到音訊」。
- 鎖內:重覆 check youtube_id(preview 到 confirm 之間夜晚 job 可能啱啱收咗佢)——
  - 唔存在:INSERT,欄位形狀**照抄 `backfillCore.js`**
    (`curated=1, status='ok', last_checked=today, fail_streak=0, duration=formatDuration(...)`)。
  - 存在但 `curated=0`:re-list 分支 —— `UPDATE ... SET curated=1, status='ok'` + 更新
    metadata 欄位(唔好 INSERT 第二行,youtube_id 唔可以孖生)。
  - 存在且 `curated=1`:409。
- response `{ ok, hymn, dataVersion }`。

**POST `/api/admin/hymns/:id/delist`**
- `UPDATE hymns_all SET curated=0 WHERE id=?`。**唔掂 `status`** —— `'dead'` 係
  deadlink checker 嘅語義(佢會維護 fail_streak/last_checked),admin 落架同「條鏈死咗」
  係兩回事,混咗會搞亂夜晚 job 嘅簿記。`curated=0` 已經足夠令 view 剔走佢。
- 已經 curated=0 → 冪等,照回 ok。
- 用戶最愛/清單入面指住呢首歌:維持現有 delist 行為(App 端 join 唔到就唔顯示)——
  唔喺呢個 phase 加新機制。

### 3.5 Audit log(母 plan §4.2)

- 新檔案(唔係 code,係產物):`backend/logs/admin-audit.log`,JSON lines,一個寫操作一行:

```json
{"ts":"2026-07-31T14:02:11Z","user_id":3,"who":"eric@…","action":"edit","hymn_id":123,"before":{"display_title":"舊名"},"after":{"display_title":"新名"}}
```

- `action` ∈ `edit | add | relist | delist`;`before/after` 淨係記改咗嘅欄位(edit)、
  全新行嘅 key 欄位(add)、`{curated:1→0}`(delist)。
- 實作:route 層寫完 DB 成功先 `fs.appendFileSync`;append 失敗 `console.error` 但唔
  fail 個 request(audit 係追溯用,唔係交易條件 —— 得 Eric 一個 admin,可用性行先)。
- `backend/logs/` 入 `.gitignore` + 第一次用自動 mkdir。唔做 UI,出事 grep 有得追就夠。

### 3.6 同夜晚 job 嘅交界(risk 總結)

| 風險 | 點防 |
|---|---|
| admin 寫入同 grow/deadlink/lyrics 互相冚 | 行同一個 `acquireDbLock`,同 script 平起平坐(§3.2 規則 1) |
| admin request 卡死等鎖 | `maxWaitMs=10s` → 503 + toast(§3.2 規則 3) |
| 持鎖太耐反冚夜晚 job | 鎖內零網絡操作,持鎖 <3 秒(§3.2 規則 2) |
| server 舊記憶體副本寫落碟 | 寫入一律開新鮮副本,in-memory 副本永遠 read-only(§3.2 規則 1) |
| 改完 App 見唔到 | `reloadDb()` + dataVersion 重算(§3.3);驗收 §5 指定要「唔重啟 backend」下驗證 |
| preview→confirm 之間狀態變咗 | confirm 鎖內重 check youtube_id(§3.4) |

### 3.7 前端(最細改動版,母 plan §4.5:唔起「管理後台 tab」)

- **`isAdmin` gate**:所有 admin UI 由 `AuthContext.isAdmin` 包住,member/未登入完全
  見唔到(安全上唔靠佢 —— API 有 403 兜底 —— 純粹 UI 清潔)。
- **入口一:歌曲行 long-press**(`LibraryScreen` + `HymnListScreen` 嘅 row)——
  admin 先有 `onLongPress`,彈新 sheet `AdminEditHymnSheet.js`(照 `AddToPlaylistSheet.js`
  嘅殼):
  - 預填 `GET /api/admin/hymns/:id`;欄位:顯示歌名(display_title)/團體(artist)/
    分類(category,picker 現有分類 + 自由輸入)/語言(lang,粵語/國語/英文 picker)/
    專輯(album)/英文名(title_en)。原始 `title` 顯示唔俾改(嗰個係 YouTube 原題,
    留返做對照)。
  - 「儲存」→ PATCH;「落架呢首」紅字掣 → confirm dialog → delist。
- **入口二:「我的」頁(`MineScreen`)admin 區**,一格「➕ 貼連結加歌」→ 新 sheet/頁
  `AdminAddHymnScreen.js`:貼 URL → 撳「查」→ preview 卡(歌名/團體/片長/warnings
  黃底提示,全欄位可改,分類 picker)→「確認入庫」→ 成功 toast +(理想)即場撳得播。
  `exists`/`relistable`/`db_busy`/422 各自有清楚文案。
- **改完點刷新**:admin 寫入 response 帶 `dataVersion`,前端直接攞佢同 MMKV 存嗰個比,
  唔同就即刻 trigger `useCachedHymns` 嘅全量 refetch —— 改完自己部機即時見到,
  其他裝置跟現有 pull-on-open 機制下次開 app 見到(驗收「其他裝置刷新即見」係指呢個)。
- **API helpers**:`api.js` 加 admin 五條 call,行現有 Bearer token 機制。
- 純 JS 改動,**冇 native 變更 → 可以行 EAS Update OTA**(跟 `EAS-UPDATE-PLAN.md` 流程,
  記住 publish 前清場紅線:淨 stash 自己嘅檔,唔好夾埋其他 session 未 commit 嘢)。

---

## 4. 安全考量總表

| # | 威脅 | 對策 | 落喺邊 |
|---|---|---|---|
| 1 | 越權攞 admin | role 冇任何 API 寫得,只有摸到部 Mac 嘅 CLI | §2.1/2.2 |
| 2 | 舊 token 冒 admin | requireAuth 每 request 由 DB 重讀 role,revoke 即時生效 | §2.3/3.1 |
| 3 | member 打 admin API | requireAdmin 403;UI 另外收埋 | §3.1/3.7 |
| 4 | URL 注入 shell | 先抽 11 字元 video id,execFile 參數陣列,永不 shell string | §3.4 preview |
| 5 | 亂改欄位(curated/status/role) | PATCH 白名單,白名單外 400 | §3.4 |
| 6 | admin 帳戶被盜亂改庫 | audit log 逐筆 before/after 有得追 + 有得人手還原;setAdmin --revoke 即時斬 | §3.5/2.2 |
| 7 | 寫入互冚(夜晚 job) | 同一把鎖 + 鎖內零網絡 + 新鮮副本 | §3.2/3.6 |
| 8 | 備份洩露 PII | backups/ + logs/ 都喺 .gitignore,目錄 700,唔離開部 Mac | §1.2/3.5 |
| 9 | preview 濫用燒 IP | per-user 10/min(admin 本身得一個人,呢個係防 UI bug loop) | §3.4 |

---

## 5. 驗收方法(Opus checklist)

> ⚠️ 環境紀律(過往踩過嘅雷):backend 係 **prod**(Eric 真用緊)。驗收設計成
> 「自包自清」:加歌測試用一條已知正常嘅詩歌 video,跟手就用佢做 edit/delist 對象,
> 最後 delist 咗佢就等於清場,唔會污染 Eric 個庫。admin 帳戶用 `opus-verify`
> (唔好開新帳戶),驗完 `setAdmin.js --revoke`。emulator 開波先驗 DEBUGGABLE
> (共用環境可能裝住 release APK)。

A/B 項驗收見 §1.3/§2.4。C 項:

1. **403 基線**:member token(或無 token)打晒五條 admin route → 全部 401/403。
2. **加歌全流程**:App 內貼一條唔喺庫嘅詩歌 URL → preview 出 title/channel/duration →
   改個 display_title → 確認 → 200 + 首歌即刻喺詩歌庫搵到 + **撳得播**(resolveAudioUrl
   已暖);`hymns_all` 有新行 `curated=1, status='ok'`;audit log 有 `add` 行。
3. **預警唔攔截**:貼一條長片(例如 30 分鐘 live set)→ preview 有 warning,但照入到庫
   (入完即 delist 清場)。
4. **撞庫**:貼返步驟 2 嗰首 → `exists: true`,冇重複行。
5. **編輯**:long-press 步驟 2 嗰首 → 改歌名/分類 → 儲存 → **唔重啟 backend** 之下:
   `/api/hymns` 見到新值、`/api/version` 嘅 dataVersion 變咗、App 內即時反映、
   首頁(home.js 嗰份副本)都係新值;audit log 有 `edit` 行連 before/after。
6. **落架**:sheet 內落架 → 首歌由詩歌庫消失、`hymns_all` 行仲喺度 `curated=0`、
   `status` 冇被掂;audit log 有 `delist`。
7. **re-list**:對啱啱落架嗰首再貼 URL → `relistable` → 重新上架 → 再出現;再 delist 清場。
8. **鎖衝突**:手動擺個新鮮 lockfile(`hymns.db.lock`,跟 `owner:pid:ts:random` 格式用
   一個生存 pid)→ admin PATCH → ~10 秒後 503 `db_busy`,App toast 正確;刪 lockfile
   → 再試即成功。
9. **鎖唔會殘留**:成功寫入之後 `hymns.db.lock` 唔存在;503 嗰次都唔存在(冇攞到鎖
   就唔應該有嘢要放)。
10. **驗證拒絕**:PATCH 白名單外欄位(`curated`)→ 400;preview 貼非 YouTube URL → 400;
    刪淨所有欄位 → 400。
11. **夜晚 job 迴歸**:驗收全部做完之後,confirm 下一輪 growLibrary run log 正常
    (攞到鎖、有進度)—— 證明 admin 寫入冇整污糟鎖協議或者 DB。
12. **清場覆核**:test 歌已 delist、`opus-verify` 已 revoke、working tree 冇多餘改動。

---

## 6. 執行順序(交 Sonnet)

按依賴排,四個獨立 commit(方便逐件驗收/回滾):

1. **A 項**:backupUsersDb.js + plist + .gitignore(完全獨立,先做先安全)
2. **B 項**:role migration + setAdmin.js + requireAuth/auth/otpAuth/AuthContext 帶 role
3. **C 後端**:serverDb.js 抽取 + reloadDb + acquireDbLock maxWaitMs + adminHymns.js +
   requireAdmin + routes/admin.js + audit log
4. **C 前端**:AdminEditHymnSheet + AdminAddHymnScreen + long-press 入口 + MineScreen 入口
   + api.js helpers(JS-only,行 OTA)

工作紀律(一貫規矩,寫埋喺度俾 Sonnet 對):
- 多 session 共用 worktree:**唔好 `git add -A`**,逐個檔 add;commit 前核對 working tree。
- backend 重啟用 launchd(`launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend`),
  唔好自己 nohup 起第二個 process;長 process 一定要 detach + 驗證。
- 掂 `server.js` 嘅抽取(§3.3)係最容易整冧 prod 嘅一步 —— 改完即刻
  `curl localhost:3001/api/health` + `/api/version` + `/api/hymns` 對返行數,
  再 check `/tmp/hymn_backend*` log 冇 error 先算完。
