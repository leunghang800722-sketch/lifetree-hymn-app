# 「我的」頁 admin chip 重整 —— URL加歌 + 已下架(MYPAGE-ADMIN-CHIPS-PLAN)

> 2026-08-02 Eric 拍板需求,Opus(Fable 5)規劃,交 Sonnet 5 落地,Opus 5 驗收。
> 流程:三層(規劃→執行→驗收),驗收用 opus-verify 帳號(唔好開新 admin 帳號)。

## 〇、需求撮要(Eric 已逐輪確認)

1. 「我的」頁頂部嗰粒闊 button「貼連結加歌」→ 改做同「最愛」「我嘅清單」一樣嘅細 chip,字改「**URL加歌**」
2. 撳 chip 入去嘅畫面:URL 輸入框,貼咗 link **即刻**顯示縮圖+片名+頻道名預覽(參考 Eric 提供嘅截圖:圓角輸入框、貼完 link 下面出縮圖卡)
3. 同一畫面顯示「我加過嘅歌」列表,每首兩組狀態 badge:「已存入庫/未存」「已上架/未上架」
4. 新增 chip「**已下架**」:睇返 Eric 自己喺詩歌庫長按落架咗嘅歌
5. Eric confirm:落架照舊只係隱藏(`status='rejected'`),唔刪資料,後端落架邏輯**零改動**,呢度純加讀取 view

## 一、狀態定義(已核對 schema,同現有一致)

`hymns` view 定義(sqlite_master 實查):
`SELECT * FROM hymns_all WHERE curated = 1 AND status != 'dead' AND status != 'rejected'`

| 狀態 | 定義 | 備註 |
|---|---|---|
| **已存入庫** | 條 row 存在於 `hymns_all` | 經「確認入庫」成功後必然為真 |
| **未存** | 貼咗 link、出咗預覽但未撳「確認入庫」 | 只喺當前 preview 卡出現;撳完確認即轉「已存入庫」 |
| **已上架** | `curated=1 AND status NOT IN ('dead','rejected')` | 即係前台詩歌庫(`hymns` view)見到 |
| **未上架** | 存在但唔滿足上面條件 | 三種成因:落咗架(rejected)/條鏈死咗(dead)/curated=0 |

⚠️ 「已上架」判斷**唔好**淨係睇 `curated=1` —— 一定要跟足 view 三個條件,唔係 dead 嘅歌會顯示錯。

## 二、「我加過嘅」+「已下架」數據來源:audit log,唔係全表 scan

**關鍵事實**(2026-08-02 實查):`hymns_all` 有 **214 首** `status='rejected'`,絕大部份係批量清理 script(非歌內容清理三輪、C4 換血)直接改 DB 嘅,**唔係** Eric 長按落架。所以:

- ❌ 讀 `WHERE status='rejected'` —— 會混入 200+ 首 script 清理嘅歌,完全唔係 Eric 想睇嘅嘢
- ✅ 讀 `logs/admin-audit.log`(JSON lines,每行 `{ts, user_id, who, action, hymn_id, before, after}`)—— 只有經 admin API 嘅操作先會入到去,而且落架功能同 audit log 同一日(Phase2)上線,冇歷史缺口

`hymns_all` 冇 `added_by` 呢類欄,audit log 就係唯一嘅「邊個做過乜」記錄,唔使加欄、唔使 migration。

## 三、後端:兩個新 read-only endpoint

加喺 `routes/admin.js`(照舊行 `requireAuth + requireAdmin`):

### 3.1 GET `/api/admin/activity/added`

「我加過嘅歌」。⚠️ **路徑刻意唔用 `/hymns/added`** —— 現有 `GET /hymns/:id` 會食咗佢變 `bad_id` 400,用 `/activity/*` 避開 route 衝突。

邏輯:
1. 讀 `logs/admin-audit.log`(檔案唔存在→回空 list;逐行 `JSON.parse` 包 try/catch,壞行跳過)
2. filter:`user_id === req.user.id` 且 `action ∈ {'add','relist'}`(**用 req.user.id,唔好 hardcode** —— 咁 opus-verify 驗收時見到嘅係自己嗰份,唔會污染 Eric 嘅 view)
3. 每個 `hymn_id` 只留最新一條(按 ts),新→舊排,cap 100 條
4. fresh `openDb()`(read-only,**唔使攞 lock** —— 鎖規矩只管寫操作)batch `SELECT ... WHERE id IN (...)` 查 `hymns_all`
5. 每首回:hymn row(id/youtube_id/display_title/title/artist/curated/status)+ 衍生 flag:
   - `in_library`: row 存在
   - `listed`: `curated===1 && status!=='dead' && status!=='rejected'`(§一定義)
   - `acted_at`: audit ts

回 `{ items: [...] }`。

### 3.2 GET `/api/admin/activity/delisted`

「已下架」。同上,分別係:
- filter `action === 'delist'`
- join 完之後**只留 current `status==='rejected'`** 嘅(落完架又 relist 返嘅唔應該再喺呢度出現)
- 每首回 hymn row + `delisted_at`(audit ts)

### 3.3 前端 api.js

加 `adminListAddedHymns(token)`、`adminListDelistedHymns(token)`,照抄現有 `adminGetHymn` 嘅 fetch/`adminJson` 樣式。

## 四、前端:MineScreen chip 行

### 4.1 拆走闊 button

刪 `adminAddRow`/`adminAddText`(MineScreen.js:90-97 嗰嚿 + styles),`onOpenAdminAdd` prop 保留(chip 繼續用)。

### 4.2 segment 行變四粒 chip(admin 先見到後兩粒)

```
[最愛 N] [我嘅清單 N] [URL加歌] [已下架]     ← admin
[最愛 N] [我嘅清單 N]                        ← member/未登入(零變化)
```

- 視覺**完全照抄**現有 `segItem/segItemActive/segText/segTextActive`(MineScreen.js:238-245:borderRadius 16、paddingH 14、paddingV 8、card 底、active 轉 accent 底)
- admin 四粒可能爆闊度 → segment 外層改 `<ScrollView horizontal showsHorizontalScrollIndicator={false}>`(non-admin 兩粒照樣冇得撥,冇視覺差異)
- **URL加歌**:action chip,`onPress={onOpenAdminAdd}`(開現有 modal),icon `add-link` 或 `add-circle-outline`,**永遠冇 active 態**(佢唔係 tab)
- **已下架**:真 tab,`tab==='delisted'` 行 active 態,icon `visibility-off`

### 4.3 「已下架」tab 內容

FlatList,照抄現有最愛 row 嘅視覺(`Cover` 縮圖 + title + artist),另加細字副行「幾時落架」(`delisted_at` 格式化做 `YYYY-MM-DD`)。

- 數據:mount / tab 切入時 call `adminListDelistedHymns`(簡單 useState + loading spinner,唔使 context)
- Row **唔俾撳播放**(落咗架嘅歌唔應該播;純顯示)
- 空狀態:icon `visibility-off` + 「未有落架嘅歌」+ hint「喺詩歌庫長按一首歌可以落架」
- 唔做「重新上架」掣(超出今次範圍;Eric 要 relist 可以照舊喺 URL加歌貼返條 link,現有 relistable 流程會接手)

## 五、前端:AdminAddHymnScreen 改造(「URL加歌」畫面)

Header 標題「貼連結加歌」→「**URL加歌**」。核心改動兩個:

### 5.1 貼 link 即刻出縮圖(唔等 API)

- 前端加 `extractVideoId(url)`(照抄 admin.js:74 個 regex:`watch?v=` / `youtu.be/` / `shorts/` 三款,11 字元 id)
- `url` state 一變就試 extract;一拎到 id **即刻**顯示縮圖:`https://img.youtube.com/vi/{id}/mqdefault.jpg`(16:9 圓角大圖,可以直接用/仿 MineScreen 個 `Cover` 嘅 onError fallback 做法)——呢步純前端,零 API,所以「貼咗 link 即刻有嘢睇」
- 同時 **auto-trigger** `adminPreviewHymn`(debounce ~600ms,同一個 videoId 只 fire 一次)拎片名+頻道名 → 「查」掣可以拆走;preview 失敗時保留錯誤文案 + 一粒「重試」
- rate limit 唔使擔心:backend preview 限 10/min,auto-trigger 只喺「出現新有效 id」嗰下先 fire

預覽卡新 layout(跟 Eric 參考截圖):**縮圖大圖喺頂 → 片名 → 頻道名** → 之後先到現有嘅可編輯欄位(顯示歌名/團體/分類/語言/專輯/英文名)、warnings 黃底、「確認入庫」——現有嗰堆欄位同 exists/relistable/422 文案邏輯**全部保留唔郁**。參考截圖頂部個 search icon 係人哋 app 嘅嘢,我哋唔加(呢頁冇搜尋功能)。

### 5.2 「我加過嘅歌」列表 + 狀態 badge

URL 輸入框下面(冇 preview 卡displaying時)顯示「我加過嘅歌」section:

- mount 時 call `adminListAddedHymns`
- 每 row:`Cover` 縮圖 + display_title + artist + 兩粒 badge:
  - `in_library` → 「已存入庫」(accent 綠框細 badge)/「未存」(理論上唔會出現喺呢個 list,兜底 textSecondary)
  - `listed` → 「已上架」(accent)/「未上架」(danger 或 textSecondary 灰)
- badge 款式:細 pill(fontSize 11、paddingH 8、paddingV 2、borderRadius 8、1px 邊框),唔好搶咗歌名戲
- 當前 preview 卡都出一粒「未存」badge(§一:貼咗未確認=未存);「確認入庫」成功後 refresh 個 list,嗰首即刻以「已存入庫+已上架」姿態出現喺 list 頂 —— Eric 一眼見到閉環

## 六、Scope 界線

- 後端落架/入庫/relist 邏輯零改動(Eric confirm 過隱藏機制照舊)
- 唔加 `added_by` 欄、唔搞 migration
- 已下架 tab 唔做重新上架掣、唔做批量操作
- member/未登入用戶:呢次改動完全隱形(chip 都見唔到,API 有 requireAdmin 403 兜底)

## 七、落地注意(執行 session 必讀)

1. **多 session 共用 worktree**:唔好 `git add -A`,逐 file add;commit 前核對 working tree
2. backend 改咗 `routes/admin.js` 要重啟先生效 —— **必須行 ops/deploy/ gate 流程**(DEPLOY-GATE-PLAN,03c7fdf),唔准直接 restart
3. 前端出 OTA 照 EAS Update 流程,publish 前清場紅線(唔好夾埋其他 session 未 commit 嘢)
4. audit log 目錄係 700,backend process 自己讀冇問題;endpoint 記得處理檔案唔存在(全新環境)
5. `hymns.db` 呢次全部 read-only query,唔使攞 lock;但如果執行途中發現要寫,跟返 locked node script 規矩

## 八、驗收 checklist(Opus 5,emulator,opus-verify 帳號)

開波先驗 DEBUGGABLE(emulator 共用環境陷阱)。

1. non-admin(登出/member):見唔到「URL加歌」「已下架」chip,「最愛/我嘅清單」照舊兩粒
2. admin:四粒 chip 一行,款式同「最愛」一致,橫撥順暢;闊 button 已消失
3. 貼有效 YouTube link(watch/youtu.be/shorts 三款):縮圖**即刻**出,片名+頻道名跟住到;貼垃圾字串:冇縮圖冇 API call
4. preview 卡「未存」badge → 確認入庫 → 「我加過嘅歌」list 出現該歌,badge「已存入庫」+「已上架」
5. 用 opus-verify 喺詩歌庫長按落架一首自己啱啱加嘅歌 → 「已下架」tab 見到佢(連日期);「我加過嘅歌」度佢轉「未上架」;前台詩歌庫搵唔到佢
6. 將嗰首歌貼 link relist 返 → 「已下架」tab 消失、「我加過嘅歌」轉返「已上架」
7. 「已下架」tab **唔應該**見到批量清理嗰 214 首(audit log 冇佢哋);Eric 帳號同 opus-verify 帳號各自只見自己嘅記錄
8. exists(貼已上架嘅歌)/relistable/metadata_failed/rate limit 各文案照舊正常
9. 驗收完清場:落架咗嘅測試歌 relist 返或者確認唔影響正庫
