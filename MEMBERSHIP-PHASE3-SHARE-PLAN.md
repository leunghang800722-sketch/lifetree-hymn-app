# 會員系統 Phase 3:分享播放清單(MEMBERSHIP-PHASE3-SHARE-PLAN)

> 2026-08-03 Fable 5 出稿。規劃文件,未落地;Eric 拍板後交 Sonnet 5 執行,完成後 Opus 5 驗收。
> 母規劃:`MEMBERSHIP-PLAN.md` §6.2 / §8 Phase 3。
>
> **✅ 已落地 + Opus 5 驗收通過(2026-08-03)**:三個 commit `7847d1a`(backend)/
> `40707fc`(前端 OTA)/`cf62f59`(native config),backend restart 由 Eric 行 gate,
> Sonnet 八項 curl 自驗 + Opus §6 八條 checklist 全 PASS。
> 驗收樣本:phase3-verify-a/b 兩個測試帳戶 + 4 條 token 留喺 users.db(將來 regression 用)。
>
> **✅ 四小修 + 全套上線(2026-08-03)**:Opus 揪出嘅四個小項(⋯ menu 三粒還原、
> flush race 用 outbox 分辨、429 顯示「操作太密」、限速 Map sweep)已修
> `6058701`/`a59b686`,Opus 抽驗全過。backend restart + OTA 都行咗 deploy gate:
> OTA update group `2b824ae8-6644-4042-9957-b37aa03e4b2d`(runtime 2,branch
> production,commit a59b686)。剩一項純文字 follow-up:share.js 頂部限速註釋講反咗
> (share POST 實際有食 /api/me 60/min 限速,mount 次序 me.js 先過 share.js)。
>
> ⚠️ **出 versionCode 53 APK 嗰個 session 必讀**:`cf62f59` 只改咗 `app.json`,
> `android/AndroidManifest.xml`(bare workflow,有 commit 入 git)**未有** intent filter。
> Build APK 之前**必須行 `npx expo prebuild -p android`** 令 manifest 生成 deep link
> 註冊,唔行嘅話 APK 會靜靜哋冇 deep link、零錯誤提示。另 prebuild 會剷走 manifest
> 入面 `POST_NOTIFICATIONS` 嗰段中文註解(permission 本身保留),要手動加返。
>
> 範圍(Eric 已拍板):清單頁「分享」掣 → 生成 `https://api.god-music.com/p/<token>` →
> 系統 share sheet 掟入 WhatsApp。收到嘅人:裝咗 app 開 link 睇清單、一撳「儲存做我嘅清單」
> (copy 一份,各自修改);未裝 app 見網頁預覽 + 「下載 App」掣。連結制,唔綁好友。

---

## 0. 現況盤點 + 三個關鍵發現(影響成個設計)

### 0.1 已有嘅地基(Phase 1 留低,啱啱好夠用)

| 嘢 | 位置 | 對 Phase 3 嘅意義 |
|---|---|---|
| `users.db` 嘅 `playlists` 表:`(user_id, id TEXT)` PK,`songs_json` 一舊過存 slim 歌物件 `{id,title,artist,youtube_id,lang}`,`deleted` soft delete | `backend/lib/userDb.js` | **songs_json 已經齊晒渲染網頁 + 儲存副本要嘅嘢**,唔使 join hymns.db;soft delete 令「清單刪咗 link 點算」有得答 |
| 同步 API + outbox(`pl_upsert` 全量 PUT) | `backend/routes/me.js` / `src/sync/userSync.js` | 分享前 flush 一下就保證 server 版係最新;儲存副本行返現成 `pl_upsert`,零新同步邏輯 |
| `requireAuth` + `/api/me` 限速 | `backend/lib/requireAuth.js` | 生成 token 嘅 API 直接掛落去 |
| 播放器 pill row 已經有「分享」掣(分享單曲純文字) | `App.js:1670` | share sheet 用法有先例(RN `Share.share`),清單分享照抄 pattern |
| backend 識 serve APK(`/downloads/app.apk`) | `server.js` | 網頁「下載 App」掣直接指過去,順手做埋拉新入口 |

### 0.2 🔴 發現一:APK 冇 deep link 能力,呢部分 OTA 推唔到

`app.json` **冇 `scheme`、冇 `android.intentFilters`** —— 即係而家 Eric 部真機嗰個
APK(versionCode 52)撳 `https://api.god-music.com/p/xxx` 只會開瀏覽器,冇任何辦法
彈返入 app。scheme/intentFilter 係 AndroidManifest 嘅嘢,**一定要出新 APK**(versionCode 53),
OTA bundle 改極都改唔到。

處理方法(唔使卡住成個 Phase 3):

- **分層落地**:網頁預覽 + 分享掣 + app 內接收 link 嘅 JS handler 全部先行
  (backend restart + OTA);JS handler 喺舊 APK 上面係 dormant code,唔會爆。
- **新 APK 遲啲先出**:`STREAM-403-FGS-CRASH-PLAN.md` 本身已經要出新 APK
  (RNTP patch-package),**兩樣夾埋一次過出 versionCode 53**,唔使 Eric 裝兩次。
- **未有新 APK 之前體驗照通**:收 link 嘅人(無論裝咗 app 未)撳 link 開網頁預覽,
  網頁上面有「喺 App 開啟」掣(intent:// URL)——新 APK 裝咗先有反應;未裝新 APK
  嘅人喺網頁都睇晒個清單,唔會斷路。**emulator 驗收唔受影響**(debug build 由
  source 編 manifest,新 intentFilter 即刻生效)。

### 0.3 發現二:release build 用緊 debug.keystore 簽名

`android/app/build.gradle` 嘅 release signingConfig 指住 `debug.keystore`(commit 咗落 repo)。
對 Android App Links 驗證(`assetlinks.json`)嚟講反而簡單:SHA-256 指紋穩定、
`keytool` 一句攞到。安全影響(任何人攞到 repo 都簽到「同一個 app」)係本身已存在嘅
事實,唔係 Phase 3 引入,呢度只係記低。

### 0.4 發現三:分享要登入先做到(設計上冇得避)

Token 指向 **server 上面** 嘅 `(user_id, playlist_id)`。未登入用戶啲清單純本地 MMKV,
server 根本冇嘢俾 token 指。所以:

- 分享掣人人見到,但未登入撳落去 → 提示「登入先可以分享清單」+ 跳去登入頁。
- Eric 係 user #1 已登入,親友收到 link **睇 + 儲存副本唔使登入**(儲落本地 MMKV,
  第日登入先跟身)——「未係會員都用到」呢個目標唔受影響,只係「發起分享」呢下要帳戶。

---

## 1. Backend 設計

### 1.1 Token:生成、儲存、生命週期

**表**(落 `users.db`,`initSchema()` 加,`CREATE TABLE IF NOT EXISTS` 零遷移):

```sql
CREATE TABLE IF NOT EXISTS playlist_shares (
  token       TEXT PRIMARY KEY,      -- crypto.randomBytes(16).toString('base64url') → 22 字元,128-bit
  user_id     INTEGER NOT NULL,
  playlist_id TEXT NOT NULL,         -- 對應 playlists.id(client 生成嘅 pl_xxx)
  created_at  TEXT DEFAULT (datetime('now')),
  revoked     INTEGER DEFAULT 0      -- Phase 3 唔出「取消分享」UI,留返後路(DB 有欄,API 有 route)
);
```

**生命週期規則(建議默認,§7-1/2/3)**:

- **一個清單一條 token**:再撳分享會攞返同一條(SELECT 有 revoked=0 嘅就重用,冇先 INSERT)。
  好處:Eric 上星期掟落家庭群組條 link,今日再分享都係同一條,唔會滿天神佛。
- **永久有效,冇過期時間**:親友場景條 link 係「屋企個歌單」,半年後撳開仲想用到。
  失效途徑得兩條:清單刪咗(§4-1)、或者將來撤銷(revoked=1)。
- **live view 唔係 snapshot**:token 指住清單本身,開 link 見到嘅永遠係最新版
  (改名/加減歌即時反映)。§4 詳細講點解。

### 1.2 API 一覽(新 route file:`backend/routes/share.js`)

```
POST /api/me/playlists/:id/share   [requireAuth + 現有 /api/me 限速]
  → 驗清單屬於 req.user.id 且 deleted=0(唔係 404)
  → 重用/生成 token,saveUserDb()
  → { url: "https://api.god-music.com/p/<token>", token }

DELETE /api/me/playlists/:id/share [requireAuth]   ← 撤銷,revoked=1(俾將來 UI 用,今次唔出掣)

GET /p/:token                      [公開,per-IP 限速 §5.2]
  → 網頁預覽(伺服器端 render,§3)
  → 搵唔到 share / revoked / 清單 deleted → 410 頁「呢個清單已經唔存在」

GET /api/p/:token                  [公開,同一限速]
  → JSON 版俾 app 用:{ name, owner, songs: [...], song_count }
  → 同樣情況回 410 JSON { error: 'gone' }
```

- 點解 SSR 唔係 SPA:一頁靜態 HTML(template string)已經夠晒,零 build 步驟、
  WhatsApp crawler 直接讀到 OG meta(§3.2)、唔使引入任何前端框架落 backend。
  呢個係成個 app 第一頁「俾外人睇」嘅網頁,簡單就係美德。
- `owner` 用 `users.username`(冇就唔俾)——網頁/app 顯示「由 XXX 分享」。
  電話/email 絕對唔出街(母 plan §5.8)。
- 兩個公開 endpoint 都要 `Cache-Control: no-store`(清單會變,token 頁唔好俾
  中間層 cache 住舊版)。

### 1.3 實作要點(俾 Sonnet)

- Token 生成:`crypto.randomBytes(16).toString('base64url')`。**唔好**用 `Math.random`
  或者 uuid v4 字串(帶 `-`,而且得 122-bit)。
- 寫操作跟足 Phase 0 pattern:改完即刻 `saveUserDb(db)`。`users.db` 得 server
  一個寫入者,唔使掂 hymns.db 嘅 lock 協議。
- `GET /p/:token` 查兩步:`playlist_shares`(token, revoked=0)→ `playlists`
  (user_id+playlist_id, deleted=0)。任何一步 miss 都係同一頁 410,唔好透露
  「token 啱但清單刪咗」同「token 錯」嘅分別(no oracle)。
- HTML **全部欄位過 escape**(name/title/artist 係用戶輸入,一個 `escapeHtml()`
  helper 搞掂)。呢頁唔使任何 `<script>`,順手落個
  `Content-Security-Policy: default-src 'none'; img-src https://img.youtube.com; style-src 'unsafe-inline'`。
- route 掛入 `server.js`:`/api/me/playlists/:id/share` 要喺 `meRoutes` 個
  `app.use('/api/me', ...)` middleware 之後掛先食到 requireAuth+限速——最簡單係
  share.js 自己 import requireAuth 逐條 route 掛,唔好依賴掛載次序。

---

## 2. 前端(React Native)

### 2.1 分享掣 UI

**位置:`PlaylistDetailSheet.js`**,兩個入口(改動最細、最順手):

1. Header 個 ⋯ menu(`showMenu()` 嘅 `Alert.alert`)加一項「分享清單」——
   同「改名/刪除」並列,zero 新組件。
2. 「播全部」隔籬加一個 share icon 圓掣(`MaterialIcons share`)——分享係 Phase 3
   嘅主打動作,收埋喺 ⋯ 入面唔夠當眼;搬 Spotify 同款。

MineScreen 清單行嘅長按 menu(`MineScreen.js:69`)**唔加**——入口太多冇益,
入到詳情頁先分享係自然流程。

### 2.2 分享流程

```
撳「分享」
  → 未登入?→ Alert「登入先可以分享清單」+「去登入」掣 → 完
  → 空清單?→ Alert「加咗歌先分享啦」→ 完
  → await flush()             // 保證 server 係最新版(outbox 可能仲有未推嘅改動)
  → POST /api/me/playlists/:id/share
  → Share.share({ message: `【${pl.name}】詩歌清單(${songs.length} 首)\n${url}` })
```

- flush 失敗(冇網)→ Alert「而家冇網,遲啲再試」。分享係 online 動作,
  唔好嘗試離線排隊(排隊生成唔到 URL,冇意義)。
- URL 直接擺入 message 度(Android `Share.share` 嘅 `url` field 係 iOS-only)。

### 2.3 接收:deep link + SharedPlaylistSheet(新組件)

**Deep link 註冊(⚠️ 呢部分要新 APK 先生效,§0.2)** —— `app.json`:

```jsonc
"scheme": "godmusic",
"android": {
  "intentFilters": [{
    "action": "VIEW",
    "autoVerify": true,
    "data": [{ "scheme": "https", "host": "api.god-music.com", "pathPrefix": "/p/" }],
    "category": ["BROWSABLE", "DEFAULT"]
  }]
}
```

配套:backend serve `/.well-known/assetlinks.json`(package `com.hymnapp.praise` +
debug.keystore 嘅 SHA-256 指紋,`keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android` 攞)。
autoVerify 過咗 → WhatsApp 撳 link 直接開 app;驗證唔過(sideload 各種玄學)→
fallback 開瀏覽器 → 網頁有「喺 App 開啟」掣(§3.1)行 `godmusic://` scheme,雙保險。

**App.js 接收(OTA 得,舊 APK dormant)**:

- mount 時 `Linking.getInitialURL()` + `Linking.addEventListener('url')`。
- Parse 兩款:`https://api.god-music.com/p/<token>` 同 `godmusic://p/<token>`,
  token 格式驗 `/^[A-Za-z0-9_-]{20,24}$/`。
- 中咗 → `setSharedToken(token)` → render `<SharedPlaylistSheet token={...} />`。

**SharedPlaylistSheet(新 file,抄 `PlaylistDetailSheet` 個殼)**:

- 開頁 fetch `GET /api/p/<token>`;loading / 410(「清單已經唔存在」)/ 網絡錯三態。
- 顯示:清單名、「由 XXX 分享 · N 首」、歌列表(同款 row,冇移除掣)。
- 動作:①撳歌/「播全部」→ `handlePlayHymn(hymn, { explicit: true, playlist: songs })`
  ——收 link 唔使儲存都聽到,呢下先係「掟 link 入群組」嘅爽位
  ②主 CTA「儲存做我嘅清單」→ 見 §2.4 ③關閉。
- 唔使登入 —— 睇 + 播 + 儲存全部唔使帳戶。

### 2.4 儲存副本:`PlaylistsContext` 加 `importPlaylist(name, songs)`

現有 `createPlaylist(name, firstSong)` 得一首起步,加一個 import 版:

- 整個新 `pl_<Date.now()>`,songs 照抄(slim object 原樣,cap 30 —— 分享源頭
  本身 ≤30,呢個 cap 係防禦性),`updated_at` 而家。
- `persist` + `syncUpsert` 行返現成路:登入用戶自動同步上帳戶,未登入純 MMKV。
- 名照用原名,唔加「(分享)」後綴 —— id 唔同,同名唔會炒;用戶想改名有現成改名功能。
- 儲存完 toast/Alert「已儲存到我的清單」,閂 sheet。**副本從此同原清單無關**(§4-3)。

---

## 3. 網頁預覽頁(`GET /p/:token`)

### 3.1 內容(一頁過,唔使靚,夠用)

```
┌────────────────────────────┐
│  God Music 詩歌             │   ← app 名,細字
│  【清單名】                  │
│  由 XXX 分享 · 8 首詩歌      │
│                            │
│  [▶ 喺 App 開啟]            │   ← intent://p/<token>#Intent;scheme=godmusic;
│  [⬇ 下載 App (Android)]     │      package=com.hymnapp.praise;S.browser_fallback_url=<下載頁>;end
│                            │   ← 下載掣 → /downloads/app.apk
│  ── 歌列表 ──               │
│  [縮圖] 歌名                 │   ← 縮圖 img.youtube.com/vi/<id>/mqdefault.jpg
│         團體                 │      (同 app 內 Cover 一致,零 bandwidth 成本)
│  ...                       │
└────────────────────────────┘
```

- 純 HTML + inline CSS,dark 底(跟 app 觀感),mobile-first(收 link 99% 係手機)。
- 冇 JavaScript。「喺 App 開啟」用 `intent://` URL(Android Chrome / WhatsApp
  內置瀏覽器都食);iOS 用戶撳咗冇反應係已知限制 —— app 本身得 Android APK,
  iOS 親友資訊已經係「網頁睇晒」,唔使再引導。
- 410 頁同款皮:「呢個清單已經唔存在」+「下載 App」掣(拉新唔嘥流量)。

### 3.2 OG meta(WhatsApp 卡片,呢頁最重要嘅門面)

```html
<meta property="og:title" content="【清單名】· 8 首詩歌">
<meta property="og:description" content="XXX 喺 God Music 同你分享咗一個詩歌清單">
<meta property="og:image" content="https://img.youtube.com/vi/<第一首歌id>/mqdefault.jpg">
```

WhatsApp 掟 link 出嚟嗰下有靚卡片,呢個係家庭群組場景嘅第一印象,成本三行。

---

## 4. 邊界 case(逐條答)

| # | Case | 行為 | 點解咁設計 |
|---|---|---|---|
| 1 | **清單刪咗,舊 link?** | 死。410「清單已經唔存在」 | soft delete(`deleted=1`)天然支持;分享者刪清單 = 收回意願,link 跟住死係最唔出奇嘅語義 |
| 2 | **改名/加減歌,舊 link?** | 照用,見最新版(live view) | 家庭場景「屋企歌單」會持續執靚;snapshot 反而要解釋「點解 link 睇到嘅同 app 唔同」。代價係冇「當日版本」概念 —— 收嘅人想鎖住個版本咪儲存副本囉,啱啱好自洽 |
| 3 | **分享者刪歌,人哋已儲嘅 copy?** | 完全唔受影響 | 儲存 = 完整 copy(新 id、新 owner、songs 抄晒),同原清單零關聯,冇任何 live 連結 |
| 4 | 歌被 delist(庫度落架) | 網頁照列(songs_json 有 title/縮圖);app 入面播嗰陣先失敗 | 同分享者自己清單入面嘅 delist 歌一模一樣行為,Phase 3 唔另開新路;母 plan §2.2「灰態」係全 app 統一改進,唔屬今次範圍 |
| 5 | 空清單分享 | 前端擋(「加咗歌先分享啦」) | 空清單網頁冇嘢睇,冇意義 |
| 6 | 收嘅人未登入就儲存 | 得,落本地 MMKV;第日登入行現有 merge 上傳 | 「未係會員都用到」係拍板目標 |
| 7 | 收嘅人已有 30 個清單/同名清單 | 冇上限(清單數目本身冇 cap),同名任存(id 唔同) | 現有 context 語義,唔加新限制 |
| 8 | 分享者未登入 | 撳分享 → 引導登入 | §0.4,結構性冇得避 |
| 9 | outbox 未推完就分享 | flush() 先行,失敗就唔出 sheet | 唔會分享咗個舊版出去 |
| 10 | 同一清單分享兩次 | 同一條 token/URL | §1.1,token 唔膨脹 |

## 5. 安全考量

1. **Token 猜唔猜到**:128-bit 隨機(22 字元 base64url)。就算對手每秒試 100 萬條,
   期望命中時間都係 10²² 年量級 —— 亂估唔係威脅。真正威脅係 **link 外洩 = 睇到**
   (連結制設計如此):曝光面得清單名+歌名+分享者 username,冇任何聯絡資料,
   風險同母 plan §6.2 評估一致,可接受。
2. **Rate limit**:`GET /p/:token` + `GET /api/p/:token` 公開,加 per-IP 限速
   (in-memory,抄 `loginRateLimit.js` pattern:**每 IP 每 15 分鐘 60 次**,超額 429)。
   目的唔係防 brute force(上面計過冇可能),係防 scraper 兜 hymns 縮圖/煩擾 backend。
   ⚠️ 記住 backend 喺 Cloudflare tunnel 後面 —— 要用 `CF-Connecting-IP` header 攞真
   IP(fallback `req.ip`),唔係全世界共用一個 tunnel IP 一齊食 429。
3. **生成 token 嘅 API** 行現有 requireAuth + `/api/me` 60/min 限速,並且驗清單
   ownership(`user_id = req.user.id`)—— 唔會有人幫你分享你嘅清單。
4. **XSS**:SSR 頁全欄位 escape + 零 script + CSP(§1.3)。呢頁係全 app 唯一
   render 用戶內容嘅公開網頁,係唯一新增攻擊面,擺明寫入驗收項。
5. **無 enumerate oracle**:410 唔分「token 錯」定「清單刪咗」(§1.3)。
6. **assetlinks.json** 係公開標準檔,冇秘密可言;內容係 package name + cert 指紋。

---

## 6. 落地分工(Sonnet 5 執行;三個 commit,逐個可驗)

> ⚠️ 多 session 共用 worktree:唔好 `git add -A`,逐個 file add。
> backend restart / OTA publish 必須行 `ops/deploy/` gate。

**Commit 1 — backend**(`userDb.js` + 新 `routes/share.js` + `server.js` 掛載 + `/.well-known/assetlinks.json`)
- §1 全部 + §3 網頁(escape + OG + 410 + CSP + Cache-Control)+ §5.2 限速。
- 自驗:curl 齊 happy path / 410 / 限速 / ownership 驗證;真機前 backend restart 行 gate。

**Commit 2 — 前端 OTA 部分**(`PlaylistDetailSheet` 分享掣 + `PlaylistsContext.importPlaylist` + 新 `SharedPlaylistSheet` + App.js Linking handler)
- §2 全部。舊 APK 上 Linking handler dormant,零風險。

**Commit 3 — native config**(`app.json` scheme + intentFilters,versionCode 唔郁——留返俾出 APK 嗰個 session 統一 bump)
- 呢個 commit 只係改 config 入 git;**新 APK 同 STREAM-403 嘅 RNTP patch 一齊出**,
  唔屬 Phase 3 驗收範圍(emulator debug build 已經驗到 deep link)。

**Opus 5 驗收 checklist**
1. Eric 帳戶分享清單 → WhatsApp share sheet 出現,URL 開得
2. 網頁預覽:歌列表齊、OG meta 齊、escape 驗過(整個清單名叫 `<img src=x onerror=alert(1)>` 試)
3. 410:刪咗清單 / 亂作 token 兩款都係 410,一樣嘅頁
4. emulator(debug build):撳 `adb shell am start -a android.intent.action.VIEW -d "https://api.god-music.com/p/<token>"` → app 開 SharedPlaylistSheet
5. Sheet 內:播全部 explicit 隊列正常;「儲存做我嘅清單」→ 出現喺「我的」頁;改副本唔影響原清單
6. 未登入帳戶(小心 emulator 共用環境,用 opus-verify 帳戶登出狀態):睇 + 儲存都得;分享掣引導登入
7. 分享者刪一首歌 → 網頁刷新即見少咗;早前儲低嘅副本原封不動
8. 限速:短時間 curl 61 次 `/p/` → 429

---

## 7. 建議默認(Eric 一次過 confirm,唔使逐項問)

1. **Live view 唔係 snapshot** —— 開 link 見最新版;清單刪咗 link 即死(§4-1/2)
2. **一個清單一條 token,永久有效** —— 冇過期時間;「取消分享」DB/API 留定後路但今次唔出 UI(§1.1)
3. **分享動作要登入**(結構性冇得避,§0.4);**睇/播/儲存唔使登入**
4. **儲存副本純 copy**,同原清單從此無關(§4-3)
5. **Deep link 要新 APK(versionCode 53),同 STREAM-403 嘅 RNTP patch APK 一齊出**;
   之前網頁預覽已經全功能,唔阻上線(§0.2)
6. 網頁預覽顯示分享者 username(冇 username 就唔顯示);電話/email 永不出街
