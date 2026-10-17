# 「我的」頁播放清單管理 — 規劃文件

> 2026-07-23 由 Fable 5 規劃,交 Sonnet 實作。
> Eric 原話:「這個頁面應該能夠改動或增加播放清單」——指底部第 4 個分頁「我的」。
> 而家清單淨係可以喺播放頁嘅 AddToPlaylistSheet 建立/加歌;「我的」頁只能瀏覽。
> 目標:「我的」頁本身可以**建立、改名、刪除、管理**清單,唔使繞經播放頁。

---

## 0. 現況盤點(實作前必讀)

### 0.1 兩套清單系統並存 —— 只可以掂新嗰套

| | 新(live) | 舊(legacy,唔好掂) |
|---|---|---|
| Context | `src/context/PlaylistsContext.js`(MMKV,key `playlists.v1`) | `src/context/PlaylistContext.js`(AsyncStorage) |
| 資料形狀 | `{ id, name, songs: [slim hymn] }` | `{ id, name, hymns: [...] }` |
| 用緊嘅 UI | MineScreen、AddToPlaylistSheet | 淨係 `PlaylistScreen.js`(**冇任何地方 import,死 code**) |

- 所有新功能一律行 `PlaylistsContext`(`usePlaylists` from `../context/PlaylistsContext`)。
- `App.js:1803` 仲 mount 緊舊 `PlaylistProvider`——**今次唔好拆**(驚有隱藏依賴),
  只喺文件記低。日後獨立 cleanup:刪 `PlaylistScreen.js` + `PlaylistContext.js` + App.js 個 mount。

### 0.2 現成 bug:MineScreen 讀錯欄位(P0,今次順手修)

`MineScreen.js:126,132` 用 `item.hymns`,但新資料模型係 `item.songs`:

- 每個清單首數永遠顯示「0 首」;
- 撳清單行 `item.hymns?.length` 永遠 falsy → 咩都唔發生。

即係「我嘅清單」個 tab 而家係壞嘅,唔止係「冇管理功能」。修法見 §2。

### 0.3 已有嘅積木

- `PlaylistsContext` 已有:`createPlaylist(name, firstSong?)`、`addToPlaylist`(30 首上限
  + duplicate 檢查)、`removeFromPlaylist(playlistId, hymnId)`、`deletePlaylist(playlistId)`、
  `MAX_PLAYLIST_SONGS = 30`。**未有:rename、reorder。**
- `AddToPlaylistSheet` 已有:native `Modal`(任何 z-order 都彈到最面)、鍵盤避讓
  (`keyboardDidShow` + `KB_EXTRA = 52`,v242 踩坑產物)、開新清單嘅名字輸入框。
- `MineScreen` 收 `onPlayHymn` prop;`onPlayHymn(hymn, { explicit: true, playlist })`
  = 照清單次序播晒(v231 語義,見 App.js `handlePlayHymn` 註解)。
- 列表視覺樣板:`HymnListScreen.js`(深林綠底、52px 封面、18pt 歌名、行尾動作掣)。

---

## 1. 總設計一覽

```
「我的」頁(MineScreen)
├─ 帳戶卡(不變)
├─ chip:最愛 N │ 我嘅清單 N        ← chip 本身不變,唔加 +(見 §3 決策)
└─ 清單 tab
   ├─ [＋ 新播放清單] 列            ← 新增:永遠喺列表最頂(ListHeaderComponent)
   ├─ 清單行 × N:撳 → 清單詳情;行尾 ⋯ → 改名/刪除
   └─ 空狀態:文案改 + 保留頂部 ＋ 掣做入口

清單詳情(PlaylistDetailSheet,MineScreen 內部 Modal,新檔)
├─ header:返回 │ 清單名 + 「N / 30 首」 │ ⋯(改名/刪除)
├─ [▶ 播全部] 掣(explicit: true)
└─ 歌曲行 × N:撳 → 由該首開始照次序播;行尾 ⊖ 移除(即時,唔使確認)

AddToPlaylistSheet 泛化做三個 mode(共用 Modal + 鍵盤避讓 + 輸入框)
├─ open(hymn)        → 'add' mode:原有行為,一 pixel 都唔變
├─ openCreate()      → 'create' mode:淨係顯示名字輸入框,建立空清單
└─ openRename(pl)    → 'rename' mode:輸入框預填舊名,確認改名
```

---

## 2. PlaylistsContext 改動(`src/context/PlaylistsContext.js`)

新增一個 method,其餘不變:

```js
// 改名:淨係改 name,songs 不動。空名 fallback 返原名。
const renamePlaylist = useCallback((playlistId, name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  persist(playlists.map((p) => (p.id === playlistId ? { ...p, name: trimmed } : p)));
}, [playlists, persist]);
```

- 記得加入 Provider `value`。
- **唔使**改 storage schema/版本——`playlists.v1` 形狀無變,舊資料直接兼容。
- reorder(清單次序/清單內歌曲次序)今次**唔做**,見 §6。

---

## 3. 「我的」主頁面改動(`src/screens/MineScreen.js`)

### 3.1 決策:建立入口擺邊度?

**揀 B:清單 tab 列表頂一行「＋ 新播放清單」,chip 唔加 +。**

- A(chip 隔籬加細 +)否決:chip 係 13pt 細字 pill,再塞個 + 目標區細過 44pt,
  又同「切 tab」呢個動作撈亂——撳 + 係想開清單定想切去清單 tab?語義含糊。
- B 嘅好處:同 AddToPlaylistSheet 底部「＋ 新播放清單」**同字眼、同視覺**
  (accent 色 add icon + 文字),用戶喺兩個地方見到嘅係同一件事;空清單同
  有清單兩種狀態都天然有入口;唔使掂 chip 佈局。

### 3.2 具體改動

1. **修 §0.2 bug**:清單行改用 `item.songs`:
   - 首數:`{item.songs?.length || 0} 首`
   - 有歌先播:`item.songs?.length && ...`(不過見下,行為直接改開詳情)
2. **清單行 onPress 改為開詳情**(唔再係直接播第一首)。原本「撳即播」係因為
   冇詳情頁焗住咁做;有詳情之後,「撳入去睇 → 詳情入面播」先係標準預期
   (Spotify/YT Music 一致)。播嘢由詳情頁嘅「播全部」/單曲行負責。
3. **清單行行尾**:`chevron-right` 換做 `more-vert`(⋯)掣,`hitSlop` 8,撳落彈
   native `Alert.alert(pl.name, null, [改名, 刪除, 取消])`:
   - 改名 → `openRename(pl)`(§5)
   - 刪除 → 二次確認 `Alert.alert('刪除清單', `「${pl.name}」同入面 N 首歌都會刪走`,
     [取消, 刪除(destructive) → deletePlaylist(pl.id)])`
   - 用 Alert 而唔係另開 action sheet:選項得兩個,Alert 夠用,零新組件
     (同 MineScreen 帳戶卡登出一致做法)。
4. **ListHeaderComponent(playlists tab)**:一行「＋ 新播放清單」,視覺照抄
   AddToPlaylistSheet 嘅 `newRow`/`newText` style(add icon 22 + accent 700 字),
   onPress → `openCreate()`(§5)。
5. **空狀態文案**改:「仲未有清單 - 撳上面「＋ 新播放清單」開一個;喺播放頁撳
   「清單」都可以加歌」。(＋列喺 header,空狀態時都會顯示,所以指返上面。)
6. **新增 PlaylistDetailSheet**(§4)嘅 state + Modal,掛喺 MineScreen 入面
   (唔使掂 App.js——`onPlayHymn` MineScreen 已經有)。

### 3.3 唔改嘅嘢

- 最愛 tab、帳戶卡、chip 佈局全部不變。
- `useAddToPlaylist` 喺最愛行嘅 playlist-add 掣(line 102)照舊。

---

## 4. 清單詳情 — 新檔 `src/screens/PlaylistDetailSheet.js`

**呈現方式**:full-screen native `Modal`(`animationType="slide"`),由 MineScreen
控制 `visible`,傳入 `playlistId`(**唔好傳成個 playlist object**——刪歌/改名之後
要即時反映,所以組件內部用 `usePlaylists()` 按 id 搵返最新版;搵唔到(被刪)就
自動 close)。視覺跟 HymnListScreen:深林綠底、返回列、52px 封面、18pt 歌名。

結構:

1. **Header**:`arrow-back` 返回 │ 清單名(numberOfLines 1)+ 副題「N / 30 首」│
   `more-vert` ⋯ → 同 §3.2(3) 一樣嘅 Alert(改名/刪除);刪除成功後 close Modal。
2. **播全部掣**:list header 一粒 accent pill「▶ 播全部」,
   `onPlayHymn(songs[0], { explicit: true, playlist: songs })`;空清單時 disabled(0.45 透明度)。
3. **歌曲行**:Cover(52)+ 歌名/歌手,撳行 →
   `onPlayHymn(item, { explicit: true, playlist: songs })`(v231 語義會由該首個 index 開始照次序播);
   行尾 `remove-circle-outline` 掣 → 直接 `removeFromPlaylist(playlistId, item.id)`,
   **唔使二次確認**(re-add 好易,Spotify 同款;刪成個清單先要確認)。
4. **空狀態**:「呢個清單仲未有歌 - 喺播放頁或者最愛度撳 ≡♪ 加歌入嚟」。

Cover 組件:MineScreen/HymnListScreen 各有一份幾乎一樣嘅 `Cover`——今次照抄第三份
即可(3 份都係 ~15 行,抽共用組件係另一單 cleanup,唔好喺今次 scope 做)。

---

## 5. AddToPlaylistSheet 泛化(`src/components/AddToPlaylistSheet.js`)

**目標:一個 Modal、一套鍵盤避讓、一個輸入框,三種用途。唔准另起一套建立流程。**

### 5.1 API

```js
// context value 由 { open } 擴充做:
{
  open,        // (hymn) => 'add' mode,原有行為完全不變
  openCreate,  // () => 'create' mode:建立空清單
  openRename,  // (playlist) => 'rename' mode:改名,輸入框預填 playlist.name
}
```

`useAddToPlaylist()` 嘅 fallback 由 `{ open: () => {} }` 補埋兩個 no-op。

### 5.2 內部改動

- state 加 `mode`('add' | 'create' | 'rename')同 `renameTarget`;
  `visible` 由 `!!target` 改做 `mode !== null` 之類(小心:add mode 依賴 `target`,
  keep 原有 `open(hymn)` 條 guard `hymn?.id`)。
- **'add' mode**:render 分支完全照舊(清單列表 + 底部＋新播放清單 + 30 首上限邏輯)。
- **'create' / 'rename' mode**:唔 render 清單 FlatList,淨係 render:
  handle + 標題(「新播放清單」/「改清單名」)+ 現有 `createBox`(輸入框 + 確認掣,
  確認掣字眼 create→「建立」、rename→「改名」),`autoFocus`。
  - create 確認:`createPlaylist(name)`(唔傳 firstSong → 空清單),close。
  - rename 確認:`renamePlaylist(renameTarget.id, name)`,close。
  - 兩個 mode 都自動食到現有 `kbHeight + KB_EXTRA` 鍵盤避讓——呢個係共用嘅
    最大價值,唔使再踩一次 v242 Android 鍵盤工具列個坑。
- `close()` reset 埋 `mode`/`renameTarget`。

### 5.3 點解係擴充 sheet 而唔係另寫組件

- 建立清單嘅名字輸入 UI、40 字上限、「未命名清單」fallback、鍵盤避讓全部已經
  喺呢度,另寫一份實會分叉(placeholder 唔同、上限唔同、鍵盤又檔住)。
- Provider 已經喺 App 根部(`App.js:1803`),MineScreen 已經 import 緊
  `useAddToPlaylist`,zero 新接線。

---

## 6. 今次唔做(P2,寫低先)

- **清單本身 reorder**:MMKV array 次序就係顯示次序,日後加「上/下移」或者拖曳
  都好易;但而家用戶清單數量近乎零,拖曳(要引 draggable list 或者自製手勢)
  成本遠大於價值。**等 Eric 真係多清單先做。**
- **清單內歌曲 reorder**:同上;queue sheet 嗰套拖曳(v242)係 gorhom 體系,搬過嚟
  唔係順手嘢。
- **抽共用 `Cover` 組件**、**拆舊 PlaylistContext/PlaylistScreen 死 code**:獨立
  cleanup,唔好混入今次 diff。

---

## 7. 未登入 × 將來登入同步(方向,唔使今次實作)

而家清單係裝置本地 MMKV(`playlists.v1`),同用戶無關——未登入照用,呢個係
刻意嘅(app 主流程唔迫登入)。將來電話 OTP 登入(見 PHONE-AUTH-PLAN.md)落地後:

- **方向:本地優先 + 登入時合併上傳。** 登入嗰刻將本地清單 POST 上 backend
  (keyed by user id),之後改動雙寫(本地即時、server 盡力);登入時 server 有
  同名/同 id 清單就以「兩邊聯集、server 名為準」合併,唔好靜靜哋覆蓋任何一邊。
- 本地 `pl_${Date.now()}` id 格式將來要配一個 server id 欄位(加欄位唔使 migrate,
  形狀向後兼容)。
- 登出**唔清**本地清單(同 favorites 一致做法)。
- 今次實作唯一要顧:**唔好寫任何假設「清單屬於某個 user」嘅 code**,keep 佢純本地。

---

## 8. 實作順序 + 驗收清單(俾 Sonnet)

順序:Context(§2)→ Sheet 泛化(§5)→ MineScreen(§3)→ 詳情頁(§4)。

驗收(裝置上逐項過,參考 HANDOFF.md 版本號慣例 bump 一個 v):

- [ ] 「我嘅清單」tab:清單首數顯示正確(唔再係永遠 0)
- [ ] 列表頂「＋ 新播放清單」→ 彈 sheet 輸入名 → 建立空清單即時出現;鍵盤冇檔住輸入框
- [ ] 空狀態都見到 ＋ 入口,文案已更新
- [ ] 清單行 ⋯ → 改名:sheet 預填舊名,改完列表即時更新
- [ ] 清單行 ⋯ → 刪除:有二次確認,刪完即時消失
- [ ] 撳清單行 → 詳情頁:名、N / 30 首正確
- [ ] 詳情頁「播全部」→ 照次序播(explicit 語義);空清單 disabled
- [ ] 詳情頁撳單曲 → 由嗰首開始照清單次序播
- [ ] 詳情頁移除歌:即時消失,首數更新;喺詳情頁改名/刪除清單行為正確,刪除後自動返回
- [ ] 播放頁原有「清單」pill 流程(add mode)行為一 pixel 都冇變:揀清單、30 首滿、
      duplicate 提示、底部＋新播放清單照舊
- [ ] 最愛 tab、帳戶卡完全不受影響
- [ ] 冷啟重開 app,新建/改名/刪除結果都persist(MMKV)

⚠️ 多 session 共用 worktree:commit 前 `git status` 核對,唔好 `git add -A`
(見 memory:project-concurrent-sessions-share-worktree)。
