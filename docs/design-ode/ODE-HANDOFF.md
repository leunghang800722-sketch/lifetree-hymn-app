# Odely 改名 + 重新設計 — 交付說明（給 Claude Code）

設計檔（唯一 source of truth）：專案內 `Ode Home Design.dc.html`
本資料夾附帶：`odeTheme.js`（色板 / 字級 / 間距 token）、`odeIcons.js`（全套 icon path）

**採用嘅方案 = 設計檔第 2 輪（2a 首頁 + 2b token 表）。**
第 3、4 輪（3a／3b／4a）係替代版面探索，**唔要落實**；第 5–8 輪係其餘畫面同 icon，**要落實**。

---

## 0. 一句話

> **⚠ 2026-08-10 改名更新**：新名由 `Ode` 改為 **`Odely`**（Ode 已有人用）。所有字標、app 名、store listing、splash、icon 字樣全部要用 odely。Logo **圖形不變**。

App 由 **God Music** 改名為 **Odely**。版面結構、資訊層級、導航（3 tab）**全部唔變**；變嘅係品牌名、logo、色板（深林綠 → 靛紫 + 暖光）、字體、卡片／按鈕／間距質感、同一整套 icon。

---

## 1. 改名要改嘅位

| 位置 | 由 | 改成 |
|---|---|---|
| App header 文字 | `God Music` / `ode` | `odely`（Sora 200 / **30px** / letterSpacing 1.2，全小寫） |
| 播放器頂 title | `God Music` | logo 環 22dp + `odely` 17px |
| 「關於 God Music」 | — | 「關於 Odely」 |
| `app.json` name / slug、splash、store listing | God Music | Ode |
| Android `package id` / iOS bundle id | `com.hymnapp.praise` | **不變**（改會斷開現有用戶更新） |

字體：**Sora 200** 做拉丁字標同所有數字；中文 UI 用 **Noto Sans TC**；金句同歌詞用 **Noto Serif TC**。

---

## 2. 色板（取代 `src/theme/designSystem.js`）

照抄 `odeTheme.js`。要點：

- **綠色全退場**：`#3DB389`、`#00C9A7` 一個唔留。
- **冇金色**：`#E8B86D` 移除；每日金句嘅「重要感」改用宋體 + 留白 + 一條 1px 暖光細線。
- **暖光 `#EFE4D2` = 光**：只用喺主 CTA、播放掣、進度條已播部分、選中 tab、選中 chip。唔好做卡片底色。
- **主色 `#B9A6F2`**：已收藏、選中狀態、連結。
- **危險色 `#E8896D`** 沿用，只出現喺登出／刪除。

## 3. 質感（同舊版嘅具體分別）

| 項目 | 舊 | 新 |
|---|---|---|
| 卡片圓角 | 8 | **18** |
| 封面圓角 | 5–6 | 列表 **9**／格子 **14**／hero **20** |
| 卡與卡間距 | 12 | **20** |
| 頁邊 | 16 | **18** |
| 分區標題 | 19px 粗體 | 12px / 500 / letterSpacing 2.5 / `#A79CD0` |
| 主 CTA | 實色綠 pill、深色字 | 暖光 pill + `0 0 22px rgba(255,227,194,.16)` 外發光 |
| 封面 | 直接貼 | 一律加 `inset 0 0 0 1px rgba(255,255,255,.07)` 內描邊 |
| 每日金句 | 左邊 3px 金線 | 無左線；宋體 17px / 行高 1.85 + 暖光 18×1px 短線 + 經節 |
| Header | 26px 圖示 + 21px 粗體字 | logo 環 **52dp** + `ode` 32px，gap 13，padding 12·18·20，頭像 40dp |

排版下限（沿用舊規矩）：正文 ≥ 15、歌名 ≥ 15.5、播放頁歌名 26、歌詞行高 1.95、點擊區 ≥ 44dp。

### 3.1 ⚠ Header logo — 必讀（目前落實錯咗）

實機截圖見到 logo 環只有約 **28dp**、而且係「自己畫嘅細圓環」。正確做法：

```
[  logo 環 52×52  ] ←13px→ [ odely  Sora 200 / 30px / ls 1.2 ]        [ 頭像 40×40 ]
         ↑ 由原圖 assets/ode-logo.jpeg 裁出，唔可以用 View + borderRadius 自己畫
```

| 屬性 | 值 |
|---|---|
| logo 環尺寸 | **52 × 52 dp**（現時約 28，要放大近一倍） |
| 來源 | `assets/ode-logo.jpeg` 原圖，`resizeMode="cover"` + 圓形裁切，只顯示中央日蝕環，**唔要包住底部「ode」字樣** |
| 裁切比例 | 圖放大到 **1.6 倍** 容器尺寸（52 → 83.2），位移 `left: -15.6, top: -13.3`，外層 `borderRadius: 26` + `overflow: hidden` |
| 圖形↔字標 gap | **13 dp** |
| 字標 | `odely` 全小寫 · Sora 200 · **30px** · letterSpacing 1.2 · `#EDE7FA` |
| Header padding | top **12** / 左右 **18** / bottom **20** |
| 頭像 | **40 × 40**，底 `#221B3E`，1px 邊 `#3A3060`，字 Sora 200 / 17px |

同一個裁環規則喺其他位嘅尺寸：播放器頂 **22dp**、Splash **156dp**（放大 1.766 倍、位移 -59.7 / -51.9）。

**唔准**：用 emoji、用 `<View>` 畫圓環代替、用 icon font、重新繪製環形。Logo 圖形係 Eric 原設計，一律由原圖出。

---

## 4. 畫面清單（設計檔對應）

| 畫面 | 設計檔 id | 落實備註 |
|---|---|---|
| 首頁 | **2a** | 版面同現狀 1:1（每日金句 → 隨心聽 → 即刻揀歌 + 播全部 → 今日為你預備 → 最近加入），只換 token |
| 詩歌庫 | **5a** | 搜尋欄 16 圓角、語言 chips、團體 chips、歌單；chips 橫向可捲 |
| 播放器全螢幕 | **5b** | 封面 342 / 圓角 22 / 陰影；四個動作 pill；進度 4px + 14px 拖鈕；主掣 76dp |
| 歌詞頁 | **5c** | 宋體 19 / 1.95，段落之間 26px；當前段 `#F7F2E9`、其餘 `#EFEAE0`／`#BDB4D6`；底部迷你播放器 |
| 我的（最愛） | **5d** | chips + 播全部 pill + 歌單 + 迷你播放器 |
| 我的（設定卡） | **8a** 下半 | 帳戶／個人資料／一般三組卡，行高 52 |
| Splash | **5e** | 日蝕環 156 + `odely` 40 / letterSpacing 4 + 「你嘅隨身詩歌本」宋體 14 |
| App icon | **5f** | 見下 |

未畫（如需要再開）：播放清單 sheet、加入清單 sheet、好友、URL 加歌、個人資料編輯。

---

## 5. Icon

全部係 24×24 viewBox、線寬 1.75、`stroke-linecap/join: round`、圖形四邊留 2px。顯示尺寸：播放器動作 17–26dp、tab 22dp、列表 18–20dp、設定列 22dp。點擊區一律 44dp。

狀態色：閒置 `#C3BADF`、次要 `#8F88AB`、啟用 `#EFE4D2`、已收藏 `#B9A6F2`、停用 opacity 0.4、危險 `#E8896D`。

Path 全部在 `odeIcons.js`，key 對照：

- 播放器：`heart` `lyrics` `share` `queue` `shuffle` `repeat` `prev` `next` `play` `pause` `playSmall`
- Tab：`home` `library` `me`（各有 stroke／fill 版 —— 選中用 fill + `#EFE4D2`）
- 列表：`addToList` `addedToList` `search` `more`
- 我的：`synced` `invite` `logout` `about` `gender` `birthYear`
- 導航 / 通用：`chevronRight` `chevronLeft` `chevronDown` `chevronUp` `back` `close` `plus` `check`
- 編輯 / 清單：`trash` `edit` `sort` `dragHandle` `playlistTile` `link` `friends`
- 狀態 / 其他：`nowPlaying`（正在播放三條 bar，0.9s 動畫）`stop` `clock` `bell` `volume` `musicNote`

合共 **45 個** key。舊 UI 用嘅 emoji／文字符號（`≡₊` `♥` `♡` `⌕` `⌂` `♫` `☺` `=` `›` `⌄` `⌃` `✕` `＋` `■`）全部要換成對應 icon。

建議放 `src/icons/OdeIcon.tsx`，一個 component 讀 `ODE_ICONS[name]`，props：`name` / `size` / `color` / `filled`。**唔要 icon font，唔要第三方 icon 包**（現狀四個掣線重唔一，就係因為混用）。

---

## 6. App icon / splash 資源

Logo 圖形 = Eric 原設計（日蝕環），**唔准重畫**。原圖：`assets/ode-logo.jpeg`（1024×1024）；App 內所有 logo 標記都係由原圖裁環（見設計檔 header）。

- **iOS**：1024×1024，無 alpha、無圓角 → 用原圖（含字樣版本）。
- **Android adaptive**：
  - foreground = **只有環**（透明底），主體限中央 66×66dp 安全區
  - background = 純色 `#0B0913`（**唔再用** `#E3E8EE`）
  - monochrome = 環嘅單色剪影，線寬加粗約 1.3 倍
- **細 size**：24dp 時原圖底部「ode」字樣讀唔到 → 出兩版：store icon 保留字樣，裝機 icon 只留環。
- Splash icon：只留環，底色 `#0B0913`，下面 `odely` 字標由 app 畫（唔要燒入圖）。
- 需要真實 PNG 切圖（`icons/` 現有檔案要重出）：foreground/background/monochrome、notification、splash、favicon。

---

## 7. 驗收清單

- [ ] 全 repo `grep` 唔再有 `#3DB389`、`#00C9A7`、`#E8B86D`、`#0B0F0E`、`#121A17`、`#E3E8EE`
- [ ] 全 repo 唔再有面向用戶嘅 `God Music` 或 `ode`（單獨字標）字串（package id 除外）
- [ ] Header logo 環實測 **52dp**（唔係 28dp），且係由原圖裁切、唔係自己畫嘅圓環
- [ ] `odely` 字標 30px / Sora 200；頭像 40dp
- [ ] 首頁／詩歌庫／播放器／歌詞／我的 對得上 2a、5a、5b、5c、5d
- [ ] 所有 icon 由 `OdeIcon` 出，冇混用其他 icon 包
- [ ] `grep` 唔再有 emoji／文字符號當 icon 用（`≡₊ ♥ ♡ ⌕ ⌂ ♫ ☺ › ⌄ ⌃ ✕`）
- [ ] 深色底上所有封面都有 1px 內描邊
- [ ] 點擊區 ≥ 44dp；正文 ≥ 15px；歌詞行高 1.95
- [ ] Android 圓形 / 方形 / 水滴 mask 下環形冇被切
- [ ] 淺色模式**未做**（設計檔 1c 只係探索）—— 唔要順手加

---

## 8. 未拍板 / 要 Eric 決定

1. 「Odely」名字未做商標同 store 撞名檢查；`god-music.com` 域名處理未定。
2. 情境分類（安靜獨處／感恩讚美／親子時光／車程路上，設計檔 4a）係提案，未落實。
3. 淺色模式、播放清單 sheet 等未設計。
