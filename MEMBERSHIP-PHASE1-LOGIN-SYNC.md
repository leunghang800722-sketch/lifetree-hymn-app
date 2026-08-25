# 會員系統 Phase 1 落地規格:登入 + 跨裝置同步

> 2026-07-28 Fable 5 出稿,Eric 已拍板 go。母文件 `MEMBERSHIP-PLAN.md`(§3 同步設計、§8 路線圖)。
> 交 Sonnet 執行:分 **W1(backend)→ W2(frontend)** 兩個工作包,順序做,每包獨立驗收。
>
> ⚠️ 共用 worktree 紅線照舊:開工前 `git status`,只 add 自己改嘅檔,**唔准 `git add -A`**。
> ⚠️ backend 重啟要用 launchd(`launchctl kickstart`),完咗要 curl 驗返,唔可以齋 `&`。

---

## 0. 起點(2026-07-28 現況,唔使自己考古)

- **Phase 0 已落地(fc9a31b)**:`backend/lib/userDb.js`(獨立 `users.db`,write-through atomic save,
  已 gitignore)、`backend/lib/authSecret.js`(JWT_SECRET 冇 env 即拒開機)、auth.js/otpAuth.js 已搬上
  users.db、login 有 IP 限速。register→restart→login 已實測通過。
- **Twilio 等緊第三條 key**:Account SID + Auth Token 已入咗 Eric 部 Mac 嘅 launchd plist(唔喺 repo);
  仲欠 `TWILIO_VERIFY_SERVICE_SID`(Eric 未開 Verify Service)。三條唔齊,OTP endpoint 回 503,唔阻其他嘢。
- **前端已有**:`AuthContext`(register/login/logout/requestOtp/verifyOtp,token 存 AsyncStorage)、
  `AuthScreen`(email/password,login/register 切換)、`PhoneLoginScreen`(兩步 OTP UI,寫好晒)、
  MineScreen 有「未登入/登入後」入口、App.js 有 auth Modal。`PHONE_AUTH_ENABLED=false`(src/config.js)。
- **最愛/清單現況**:`FavoritesContext`(MMKV key `favorites`,存**full hymn objects**)、
  `PlaylistsContext`(MMKV key `playlists.v1`,存 `{id:'pl_<ts>', name, songs:[slim hymn]}`,cap 30)。
- App.js 已有 AppState listener 先例(App.js:690);**冇** NetInfo dependency,唔好加。

## 0.1 範圍(in / out)

**In**:同步 API(backend)、前端 outbox 同步改造、登入時合併上傳、MineScreen/AuthScreen 細執、
`PHONE_AUTH_ENABLED` 開閘(等第三條 key 到先,獨立一 commit)。
**Out**(後 phase):好友、分享、admin、邀請碼、email OTP 通道、密碼重設。Registration 照而家咁開
(app 未公開,冇風險;邀請碼閘係 Phase 4)。

---

## 1. W1 — Backend 同步 API(半日)

### 1.1 Schema(加落 `lib/userDb.js` 嘅 `initSchema`,CREATE IF NOT EXISTS 照舊)

```sql
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL,
  hymn_id    INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, hymn_id)
);

-- ⚠️ 清單 id 係 client 生成嘅 TEXT(而家前端已經係 'pl_<timestamp>')。
-- 用 (user_id, id) 做 PK:唔使做 server↔client id remap,前端零遷移。
CREATE TABLE IF NOT EXISTS playlists (
  user_id    INTEGER NOT NULL,
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  position   INTEGER DEFAULT 0,
  songs_json TEXT NOT NULL DEFAULT '[]',   -- [{id,title,artist,youtube_id,lang}] slim objects,cap 30
  updated_at TEXT NOT NULL,                -- client 提供嘅 ISO timestamp(LWW 用)
  deleted    INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
```

設計取捨(諗過,唔使再議):
- **清單啲歌用 `songs_json` 一舊過,唔開 `playlist_songs` 表**。清單 cap 30 首、成個清單永遠一齊讀寫
  (LWW 都係成個清單做單位),行 relational 拆表冇任何好處,反而多咗 position 維護。母 plan §2.2
  嗰個 `playlist_songs` 表係俾將來(分享/協作)先需要,Phase 1 唔起佢。
- **favorites 淨存 `hymn_id`**,前端負責 hydrate(§2.4);**playlists 存 slim objects**——
  因為清單要保留次序同「歌被 delist 後仲顯示到名」,slim object 係而家前端已有嘅格式,照搬。

### 1.2 `requireAuth` middleware(新檔 `backend/lib/requireAuth.js`)

- 驗 `Authorization: Bearer <jwt>`(secret 用 `authSecret.js`),decode 出 `id`。
- 由 users.db SELECT 確認用戶存在,順手 `UPDATE last_seen_at`(冇呢欄就 ALTER 加,try/catch 照舊)。
- 掛 `req.user = { id, username, email, phone }`。401 統一 `{ error: 'unauthorized' }`。
- auth.js 個 `/api/auth/me` 可以順手改用佢(唔強制,唔好為改而改)。

### 1.3 Endpoints(新檔 `backend/routes/me.js`,server.js 掛 `meRoutes(app)`)

全部行 `requireAuth`;每個寫操作完即刻 `saveUserDb(db)`(Phase 0 pattern)。

```
GET  /api/me/data
  → { favorites: [hymn_id...],
      playlists: [{ id, name, position, songs, updated_at }] }   // deleted=1 唔出
POST /api/me/favorites/:hymnId      → 加(INSERT OR IGNORE;冪等)
DELETE /api/me/favorites/:hymnId    → 減(冪等,唔存在都回 200)
PUT  /api/me/playlists/:id
  body { name, position, songs, updated_at }
  → LWW upsert:server 有呢個 (user_id,id) 而且 server.updated_at >= body.updated_at
    → 唔寫,回 { ok:true, stale:true, server: {...} }(俾 client 用 server 版覆蓋本地)
    否則寫入(deleted 重設 0),回 { ok:true }
    validation:songs cap 30、name trim 後 1-40 字元、id ^pl_[A-Za-z0-9_-]{1,40}$
DELETE /api/me/playlists/:id        → soft delete(deleted=1,updated_at=now;冪等)
POST /api/me/sync                   → 登入時一次性合併上傳(§1.4)
```

### 1.4 `POST /api/me/sync` 合併語義(登入嗰刻行一次)

body:`{ favorites: [hymn_id...], playlists: [{id,name,position,songs,updated_at}] }`(client 全量本地數據)

- favorites:**union**。逐個 INSERT OR IGNORE;server 已有嘅一律保留(唔會因為 client 冇而剷)。
- playlists:逐個行 §1.3 嘅 LWW upsert 邏輯;server 有而 client 冇嘅清單一律保留。
  server 度 deleted=1 而 client 又推返上嚟?→ 睇 updated_at:client 較新就復活,否則維持刪除。
- 回 response:直接回 `GET /api/me/data` 同一個 shape(俾 client 一個 round-trip 攞埋合併結果)。
- 冪等:同一份 body 推兩次結果一樣(union+LWW 天然冪等)——斷網重試唔會爆炸。

### 1.5 限速/防呆

- `/api/me/*` 全部:每 user 每分鐘 60 次(in-memory Map,超咗 429)。正常使用遠遠掂唔到,
  純粹防前端 sync loop 走火(outbox bug 狂 flush 嗰類)。
- body 用 `express.json({ limit: '256kb' })` 現有 global 就夠(30 首 slim × 10 清單 <100kb)。

### 1.6 W1 驗收(Sonnet 自己行完先交)

寫個一次過腳本 `backend/tools/test-me-api.sh`(curl,行喺 localhost:3001):
1. register 個 test 用戶 → 攞 token
2. POST sync 推 fixture(3 favorites + 2 清單)→ GET data 核對
3. PUT 清單 A 用**舊** updated_at → 預期 `stale:true`,內容冇變
4. PUT 清單 A 用**新** updated_at → 內容變咗
5. DELETE favorite + DELETE 清單 → GET data 反映咗
6. **`launchctl kickstart` 重啟 backend → GET data 一模一樣**(persist 證明,Phase 0 嘅延續)
7. 冇 token / 爛 token → 401
交貨標準:七步全綠,腳本留低喺 repo 俾下次 regression 用。

---

## 2. W2 — Frontend 同步改造(1 日)

### 2.1 新模組 `src/sync/userSync.js`(唔係 context,係俾兩個 context 共用嘅 lib)

單一職責:outbox 持久化 + flush + pull。**唔掂 UI state** —— UI 永遠讀 context 嘅本地 state,
離線體驗同而家一模一樣(呢條係 FavoritesContext 入面「MMKV 掛咗都唔准 no-op」嗰課嘅延續)。

```
MMKV keys:
  sync.outbox.v1   — [{ op, ...payload, ts }] append-only queue
  sync.owner.v1    — 上次同步嘅 user id(§2.5 換帳戶保護)

ops:
  { op:'fav_add',    hymn_id }
  { op:'fav_remove', hymn_id }
  { op:'pl_upsert',  playlist: {id,name,position,songs,updated_at} }  // 成個清單一舊
  { op:'pl_delete',  id }

flush():
  - 冇 token / queue 空 → no-op
  - 順序逐個 op 打對應 API;成功先 shift 走;fail(網絡/5xx)即停,keep queue,下次再嚟
  - pl_upsert 收到 stale:true → 用 response.server 覆蓋本地嗰個清單(callback 俾 PlaylistsContext),
    個 op 當完成
  - 同一清單連續多個 pl_upsert 可以 collapse 淨最後一個(順手優化,唔做都唔錯)
  - 併發保護:flush 進行中再叫 flush → set 個 pending flag,完咗再行一round

觸發點(全部 fire-and-forget,唔 block UI):
  ① 每個寫操作 enqueue 之後即刻 flush
  ② App 開機(token 載入完)
  ③ AppState → 'active'(跟 App.js:690 現成 pattern)
  ④ 登入完成(§2.3 merge 之後)
冇 NetInfo:斷網 flush 自然 fail 留 queue,靠 ①③ 再試,夠用,唔加 dependency。
```

### 2.2 兩個 context 嘅改動(改動面刻意收窄)

- `FavoritesContext.toggleFavorite`:現有邏輯全部保留,尾部加
  `enqueue({op: added?'fav_add':'fav_remove', hymn_id: hymn.id}); flush();`
- `PlaylistsContext`:每個 mutation(create/rename/addSong/removeSong/reorder/delete)嘅 `persist` 之後
  enqueue 對應 op。**同時要開始寫 `updated_at`**:每次 mutation 將該清單 `updated_at = new Date().toISOString()`
  (加落本地 playlist object,MMKV 一齊持久化;舊數據冇呢欄,首次 sync 時當 `1970-01-01` —— 即係
  server 版本永遠贏舊本地格式,啱:舊格式只會喺未登入裝置存在)。
- 兩個 context 各 expose 一個 `replaceAll(data)`(pull/merge 落地用,內部就係 setState+MMKV persist)。

### 2.3 登入合併(一次過,Eric 無縫遷移就係呢步)

喺 App.js 加一個 effect 監察 `user`:由 null → 有:
1. `POST /api/me/sync` 推晒本地 favorites(id list)+ playlists(全量)
2. 用 response(=合併後全量)`replaceAll` 覆蓋本地
3. `sync.owner.v1 = user.id`;清空 outbox(merge 已含晒)
4. Toast/console:「已同步 N 首最愛、M 個清單」(用現有 toast 機制,冇就 Alert 都得,唔好為佢起新 component)

失敗處理:merge fail(冇網)→ 唔覆蓋本地、唔設 owner,下次 app active 再試(effect 加 retry flag)。
登入咗但 merge 未成功嘅窗口期,寫操作照入 outbox,唔會跌。

### 2.4 Pull-on-open + hydrate

- App 開機 & AppState active,而且有 token:`GET /api/me/data` → **先 replay 檢查**:outbox 有嘢就先 flush,
  flush 清晒先至用 server 版 `replaceAll`(順序:flush → pull → replace;確保唔會用舊 server state 冚掉未推嘅本地改動)。
- favorites hydrate:server 俾 `hymn_id` list,前端由 ①現有本地 favorites cache ②app 已載入嘅
  library(/api/hymns 全量,而家本身有)揾返 full object。兩邊都揾唔到(歌 delist 咗)→ 保留一個
  `{id, title:'(已下架)', unavailable:true}` 佔位,UI 灰態唔畀播 —— 唔好靜靜哋跌走(用戶心心唔見咗會以為 bug)。
- 節流:pull 每 60 秒最多一次(app 前後台切嚟切去唔好狂拉)。

### 2.5 換帳戶/登出保護(家人共用一部機嘅 edge case)

- 登出:本地數據**保留**(降返做訪客數據,同而家未登入一樣)。outbox 清空、owner 唔郁。
- 再登入時:`user.id === sync.owner.v1` → 正常 merge(§2.3)。
  **唔同** → 呢部機啲數據係上手用戶嘅:**唔准 merge**,直接 pull server 版 `replaceAll`
  (即係新帳戶見返自己啲嘢,唔會食咗上手嘅)。UI 唔使問,靜靜哋做啱嘅嘢。
- 首次登入(owner 未設過)→ merge(§2.3),呢個先係 Eric 遷移 case。

### 2.6 UI 執漏(細,順手做)

- MineScreen 帳戶格:登入後副標題由「撳一下管理帳戶」改埋顯示同步狀態
  (「已同步」/「N 項等緊同步」——讀 outbox length,俾 Eric 有得肉眼驗證)。
- AuthScreen 已登入 view:user 冇 username(OTP 新用戶)顯示電話尾四位,唔好出 `?`。
- **唔做**:設定頁同步開關、手動「立即同步」掣、任何 spinner。全自動,冇嘢俾用戶較。

### 2.6a 登入頁顯示「實際行緊嘅版本」(Eric 2026-07-28 加嘅需求)

背景:今日撞單「以為部機收咗新 OTA 其實仲係舊版」烏龍。而家 SettingsScreen 淨顯示
`Constants.expoConfig.version`(app.json 嘅 1.4.0)—— **OTA update 推咗佢都唔會變**,
所以呢個數字答唔到「部機 actual 行緊邊個 update」。要用 `expo-updates` 嘅 runtime API
(package 已裝,`expo-updates ~56.0.23`,唔使加 dependency)。

**新 component `src/components/VersionTag.js`**(一行灰字,居中,可以周圍插):

```js
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
// 內容三段:
//   v{Constants.expoConfig?.version}            → 「v1.4.0」(native build 版本)
//   OTA 部分:
//     __DEV__ 或 Updates.isEmbeddedLaunch 或 !Updates.updateId
//       → 「內置包」(即係未收過任何 OTA,行緊 build 入面嗰個 bundle)
//     否則 → 「OTA {Updates.createdAt 格式化 MM-DD HH:mm 香港時間} · {Updates.updateId 頭 8 位}」
// 例:「v1.4.0 · OTA 07-28 14:32 · a1b2c3d4」 / 「v1.4.0 · 內置包」
// Updates.* 全部包 try/catch(dev client/舊 build 上唔好 crash 個登入頁)。
```

- updateId 頭 8 位就夠:Eric(或者我哋)對返 `eas update:list` 頭 8 位就知裝冇裝到。
- 插三個位:①AuthScreen email form 底部 ②PhoneLoginScreen 底部(佢係 early-return 另一棵樹,
  要自己 render 一次)③AuthScreen 已登入 profile view 底部。
- **順手修埋源頭**:SettingsScreen 個「版本」row 改用同一個 component(而家嗰行淨 version
  嘅顯示就係害 Eric 估錯嘅嘢)。四個位一個 component,以後唔會各自走樣。

### 2.7 `PHONE_AUTH_ENABLED=true`(獨立最後一 commit,有條件)

- 條件:Eric 交齊第三條 Twilio key(`TWILIO_VERIFY_SERVICE_SID`)入 plist + restart + 
  `GET /api/auth/otp/status` 回 `configured:true`,先准 flip。
- 未齊 key 唔阻 W1/W2 交貨:email/password login 已經行到成條同步線,Eric 可以先用 email 帳戶測試
  (不過佢正式帳戶等 OTP,唔好叫佢用 email 註冊個「真身」—— 免得將來又要搬)。
  ⚠️ 所以驗收用 test 帳戶,**Eric 本人嘅正式登入等 OTP 通咗先做**,一步到位電話號碼做身份。

### 2.8 W2 驗收

Emulator(Sonnet 自己行):
1. 未登入加 3 個最愛 + 開 1 個清單 → register/login(test 帳戶)→ backend `users.db` 見到數據(curl `/api/me/data` 核對)
2. Emulator 清 app data(模擬重裝/第二部機)→ login 同一帳戶 → 最愛/清單返晒嚟
3. 飛行模式加最愛 → 見 MineScreen「1 項等緊同步」→ 關飛行 + app 前後台切一下 → curl 核對已上 server
4. 清單 LWW:兩邊裝置(emulator + 清 data 再入)先後改同一清單名 → 後改嗰個贏
5. 登出 → 本地嘢仲喺度;用**另一個** test 帳戶登入 → 見到嘅係帳戶 B 自己(空)嘅數據,唔係帳戶 A 嘅
6. 全程 `adb logcat` 冇 sync 相關 crash/loop(留意 flush 唔准打爆 429)
6a. 版本顯示(§2.6a):emulator 開登入頁見到 `v1.4.0 · …` 一行;dev/emulator 環境預期係
   「內置包」。**真正驗證喺 W2 出 OTA 嗰下**:publish 完,部機收 update 後登入頁嘅
   updateId 頭 8 位要對得返 `eas update:list` 最新嗰條 —— 呢個就係 Eric 個 use case 本身。

真機(Eric,OTP 通咗之後):
7. Eric 部機 OTP 登入 → 佢幾年嘅最愛/清單自動上帳戶(toast 數目啱)→ 第二部裝置/重裝後登入見返晒
8. 部機 A 加心心 → 部機 B 切前台 → 60 秒內見到

---

## 3. 交俾 Sonnet 嘅拆法

| 工作包 | 內容 | 預估 | 交貨證據 |
|---|---|---|---|
| **W1** | §1 全部(schema+requireAuth+me.js+test script) | 半日 | test-me-api.sh 七步全綠 output |
| **W2** | §2.1-2.6a(sync 模組+context 改造+merge+UI+VersionTag) | 1 日 | §2.8 第 1-6a 步 emulator 證據 |
| **W3(flip)** | §2.7(flag 開閘)+ Eric 真機流程(§2.8 第 7-8 步) | 半粒鐘 | Eric 口頭確認 |

規則(寫俾 Sonnet 睇):
- W1 完成並驗收先開 W2 —— W2 全程打真 API,唔好 mock。
- backend 改完:`launchctl kickstart gui/$(id -u)/com.hymnapp.backend`,然後 curl `/api/health` 
  同 `/api/hymns` 200 先算完(detach+驗證鐵律)。
- 前端改動係純 JS → 可以行 EAS Update OTA(睇 `EAS-UPDATE-PLAN.md`,⚠️ 內有共用 worktree publish 紅線:
  publish 前必須核對 working tree 冇其他 session 嘅嘢);穩陣起見 W2 都出埋 local build 俾 Eric sideload。
- 唔好掂:`hymns.db`、任何 `scripts/`(夜晚 job)、`resolveAudio`、播放器相關檔案。
  同 repo 有其他 session 行緊,只 add 自己嗰幾個檔。
- 新檔預期:`backend/lib/requireAuth.js`、`backend/routes/me.js`、`backend/tools/test-me-api.sh`、
  `frontend/hymn-app/src/sync/userSync.js`、`frontend/hymn-app/src/components/VersionTag.js`;
  改檔:`userDb.js`、`server.js`、兩個 context、`App.js`(effect+MineScreen 格)、
  `AuthScreen.js`(細執+VersionTag)、`PhoneLoginScreen.js`(VersionTag)、
  `SettingsScreen.js`(版本 row 換 VersionTag)、最後 `config.js`(flag)。

## 4. 依賴/等緊嘅嘢

1. **Twilio Verify Service SID**(Eric,`ERIC-TODO-PHONE-AUTH.md` §A2)—— 只 block W3,唔 block W1/W2。
2. Eric 正式帳戶嘅首次登入(=佢數據遷移嗰下)要等 W3;之前所有測試用 test 帳戶。
3. 冇其他拍板位 —— 同步策略/衝突規則呢份文件已定晒,Sonnet 照做唔使問。
