# 非歌曲內容審核清單

> 交接文件 — 呢份清單留俾另一個獨立 session 做審核 + delist,呢個 session（display_title 清理 project）**冇喺度落手改任何收錄狀態**。

## 背景

喺 [HANDOFF.md](HANDOFF.md) 提到嘅 display_title 清理 project（見 `backend/lib/displayTitle.js` + `docs/SUPERVISION-LOG.md` 附近幾個 commit）入面,將 curated 庫入面「歌名清理唔到」嘅 293 條逐條人手睇過,搵到一批**根本唔係詩歌/敬拜歌曲**、混咗入 curated 庫嘅片 —— 講座、見證、工作坊、訪談、Preview 片、活動回顧等。

呢批片會混入嚟,係因為 `backend/lib/hymnDb.js` 嘅 `isCompilation()` 品質篩選(擋合輯/世俗歌/「第N集」/主日崇拜直播嗰類)冇擋到呢種「單條片、標題睇落似正常,但內容其實係教學/訪談/宣傳,唔係一首歌」嘅格式。**呢個屬於收錄篩選漏網,唔係 display_title 顯示格式問題**,所以獨立開呢份文件,唔喺 display_title project 度處理。

## 點樣睇呢份清單

⚠️ **呢份清單淨係憑標題文字判斷,冇睇過任何一條片嘅實際內容。** 分咗兩級信心,審核嗰陣建議:

- **Tier 1(高信心)**:標題本身已經好明確唔係歌(工作坊/訪談/Preview/公告呢類字眼),建議直接開條片核實,大機會要 delist(即係將 `curated` 設返 `0`,原始資料留喺 `hymns_all`,唔好整刪咗佢)。
- **Tier 2(中等信心)**:標題格式睇落似教學/精華輯/多首歌連播,但都有可能其實係一首歌(例如故事式歌詞、Rap 版聖經故事),**建議開返條片先確認**,唔好盲目跟晒 delist。

每條都附咗 `youtube_id`,可以直接砌返 `https://youtube.com/watch?v=<youtube_id>` 開嚟睇。

## Delist 做法提示(俾執行嗰個 session 參考)

跟 [HANDOFF.md](HANDOFF.md) §2.4「隱藏唔刪除」原則:
```sql
UPDATE hymns_all SET curated = 0 WHERE id = ?;
```
**唔好用 `DELETE`**,原始資料要留低(reversible)。改完記得跟 `backend/lib/hymnDb.js` 嘅 DB 寫入鎖規矩(`acquireDbLock`/`releaseDbLock`),同埋改完 DB 要 `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend` 先會生效。

---

## Tier 1 — 高信心(建議直接核實、大機會 delist)

### Asia for JESUS（5條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1568 | GrWYWV_2f0k | 國語 | Smart Financial Management \| Managing Your Finances Starts with Managing Your Mind! Chen Minli: T... | 理財講座 |
| 1576 | -cpn3I6OF20 | 國語 | 2025 青吶特會回顧影片｜Holy Fire Reloaded 聖火重載 | 大會回顧片 |
| 1577 | geGcmu1GiqA | 國語 | 領袖優勢工作坊－幫助個人與團隊提升效能, 發展天賦才幹 | 工作坊 |
| 1578 | 4yXI7MGox-U | 國語 | 約書亞樂團｜接待神同在｜2025 年度異象片 | 年度異象宣傳片 |
| 1583 | 3SdQBhdasbg | 國語 | 【優勢好好玩】EP7｜優勢特別篇：不一樣又怎樣？沒有紀律的人就完蛋嗎？... | Podcast/清談節目集數 |

### Kids on the Move（11條 —「Let's Talk About」系列 + 相關教學片段）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1621 | 5oDN-Vjdgoc | 兒童 | Let's Talk About a Man After God's Own Heart | 聖經教學片段 |
| 1622 | J4VMfQ9I_es | 兒童 | Let's Talk About Prayer | 聖經教學片段 |
| 1645 | ehBhysKXwdE | 兒童 | Let's Talk About the Kings of Israel | 聖經教學片段 |
| 1646 | 8NPhxH4stOw | 兒童 | Let's Talk About Silence and Solitude | 聖經教學片段 |
| 1729 | PFv0B-nP1tk | 兒童 | Let's Talk About the Fruit of the Spirit! | 聖經教學片段 |
| 2173 | hBJVFMmoaA4 | 兒童 | Let's Talk About Figs | 聖經教學片段 |
| 2190 | zVE5P9lhs3E | 兒童 | Let's Talk About The Good Samaritan | 聖經教學片段 |
| 2192 | ITDIoq_aie8 | 兒童 | Let's Talk About Spiritual Gifts | 聖經教學片段 |
| 2224 | 6l6iLDzeHuU | 兒童 | Let's Talk About Farming | 聖經教學片段 |
| 1663 | yJRRI3sB1o4 | 兒童 | Death in the Pot \| Bible Story | 聖經故事講述 |
| 1759 | 2tLmeRkrqno | 兒童 | Majunga Learns Puppetry | 木偶劇教學片 |

### Yancy（4條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1872 | fOFZay66M58 | 兒童 | HEARTBEAT Curriculum Features and Included Media (Teach the heart of worship) | 課程教材宣傳 |
| 1979 | yW_cjWGDZz8 | 兒童 | Perfect Volunteer / Teacher Gifts for Valentines, Easter, Christmas or any Thank You -Ripple Effect | 禮品推介 blog 片 |
| 2024 | JoVaie899Xw | 兒童 | Let's Get Started - 12 Video Countdowns for Kidmin PREVIEW -Perfect to kick off services & events | 課程資源 Preview |
| 2050 | vC66CzYlaOk | 兒童 | Today is my birthday and this is big news you don't want to miss. I have something for YOU! | 個人生日公告 |

### 共享詩歌ShareHymns（6條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1791 | -O4DoJ_N6dY | 粵語 | Preview CAL7 | 節目 Preview 片 |
| 1817 | KNLTMf6ITxU | 粵語 | CAL8 Preview | 節目 Preview 片 |
| 1819 | QIsTW5xT8GA | 粵語 | CAL8 preview revised | 節目 Preview 片(修訂版) |
| 1962 | 7zT8pbNYUGg | 粵語 | 2021:03 亞斯理堂長者佈道會 | 佈道會活動錄影 |
| 1963 | 1KJk9S8hwiE | 粵語 | 基智中學 2020年12月21日 網上音樂佈道會 | 佈道會活動錄影 |
| 2123 | e6HkWzieWgQ | 粵語 | ShareHymns Tour Highlight | 巡演精華輯 |

### 台北復興堂（5條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1590 | k81QnH2U98E | 國語 | 真愛家庭月 \| 才德與平凡 \| 簡春安教授 | 家庭月講座 |
| 1592 | QsNnOmmB3LM | 國語 | 真愛家庭月 \| 你快樂嗎？ \| 簡春安教授 | 家庭月講座 |
| 1599 | beoUReVB9gw | 國語 | 見證耶穌的神蹟 \| 復活節特別影片+見證故事 | 見證影片 |
| 1601 | CzDEUwBnlXw | 國語 | 聖誕鉅獻歌舞劇《兩個世界 . 上下城》 | 整套歌舞劇(非單曲) |
| 1644 | RX5ad6LwsoQ | 國語 | 《兩個世界 . 上下城》歌舞劇原聲帶 | 整套原聲帶合輯(非單曲) |

### 同心圓敬拜（3條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1787 | tYVujSfo6k0 | 粵語 | ❏ Facing GOD 2026 全港信徒山上敬拜峰會 ❏《生命的冠冕》峰會異象意念短片｜What is Facing GOD? ❏ | 大會異象宣傳片 |
| 1848 | 15ALjoggiYM | 粵語 | 【大埔火災特備節目】《流淚谷中的陪伴》\| DJ馬馬療癒之旅 \| 同心圓 | 災難關懷特備節目 |
| 1955 | tFUhZ919Cpw | 粵語 | 精彩回顧｜Facing GOD 2025 全港信徒山上敬拜峰會 | 大會回顧片 |

### 天弦音樂事工（7條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1884 | mSklNOu6UNE | 粵語 | 《救贖的聲音》敬拜音樂佈道會 | 佈道會活動錄影 |
| 1885 | _kc-Wck89J4 | 粵語 | 《好牧人》- 填詞人三吉介紹 | 詞曲人訪談 |
| 1971 | RQ9Mv8Woe_8 | 粵語 | 三吉 與 《超出預計的愛》 | 詞曲人訪談 |
| 1972 | LgiZmpQ5a8Q | 粵語 | 三吉 與 《恩典》 | 詞曲人訪談 |
| 1973 | k9DUxFFmxJc | 粵語 | 【想聽你救贖的聲音】- 李浩賢先生 分享見證 | 見證分享 |
| 2087 | yTtuAg8kt8Q | 粵語 | 看動漫信主？【救贖的聲音】- 10個夥伴機構與歌手的分享 - 伙石間 Part 2 | 座談會/訪談 |
| 2203 | L1L2wuT8S5E | 粵語 | 【The Sound Of Salvation 救贖的聲音】預售中！ | 預售公告 |

### 泥土音樂（2條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 941 | jy681BbUktg | 國語 | 算命與聖經預言 詩歌默想 新天地 | 講道/主題分享(標題似講題) |
| 1199 | Vtx0MOy3ZiE | 國語 | 盛曉玫的故事 好消息電視台 | 電視台人物紀錄片 |

### 玻璃海（1條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 114 | uVpLxuzjs7k | 粵語 | 平安夜敬拜節目2020 | 完整崇拜節目錄影(非單曲) |

### SON Music（2條）

| id | youtube_id | 語言 | 標題 | 內容類型 |
|---|---|---|---|---|
| 1531 | 4W_Eqkg9Z9Q | 粵語 | iPray 我向祢禱告敬拜音樂分享會 - 悉尼站 | 音樂分享會活動錄影 |
| 1756 | K6sEWbVXfUw | 粵語 | 感謝肇基用他的音樂與熱誠祝福了我們！ | 感謝致辭(非歌曲) |

**Tier 1 小計：46 條**

---

## Tier 2 — 中等信心（建議開片先確認,唔好盲目 delist）

### Kids on the Move（10條）

| id | youtube_id | 語言 | 標題 | 備註 |
|---|---|---|---|---|
| 1561 | xhB2Wl2Y7UY | 兒童 | What It Means To Be God's Child | Q&A式標題,可能係教學片,亦可能有歌 |
| 1584 | lo4_veI1SjM | 兒童 | What Happens When I Sin? | 同上 |
| 1585 | g-ObdvLr-Gc | 兒童 | Simple Steps for Following Jesus | 同上 |
| 1586 | Tr-O4CXlM2M | 兒童 | What is Salvation? | 同上 |
| 1620 | xLmxdiGAuYo | 兒童 | Parafries: Solomon Asks for Wisdom | "Parafries" 格式未知,可能係寓言短片 |
| 1647 | xmXZ2MXVgYU | 兒童 | Parafries: Philip and the Ethiopian Eunuch | 同上 |
| 1718 | DRV7rKF-XWc | 兒童 | Paul's Great Big Dangerous Adventure Supercut | "Supercut" = 精華輯,可能唔係單一首歌 |
| 2146 | XpSaH-CVl1w | 兒童 | The Lost Chicken | 可能係故事短片,亦可能係歌曲 |
| 2147 | 3Z8Oh7A7zSo | 兒童 | The Prodigal Son Rap | 標題帶 "Rap",反而可能真係一首歌,建議先聽 |
| 1665 | eASKEdmxwf8 | 兒童 | Elisha and the Widow's Oil \| Song Story | 帶 "Song" 字,有機會其實係歌,建議先聽 |

### ACM（1條）

| id | youtube_id | 語言 | 標題 | 備註 |
|---|---|---|---|---|
| 103 | 6sPD3Wlkq2c | 粵語 | 小小敬拜者齊唱兒歌DVD (官方動作版) | 睇落似一隻 DVD 合輯嘅宣傳,唔係單曲 |

### 共享詩歌ShareHymns（5條）

| id | youtube_id | 語言 | 標題 | 備註 |
|---|---|---|---|---|
| 2027 | 1vKAPN3ArCY | 粵語 | 22 敬拜 | 編號格式,似課程/系列某一節 |
| 2121 | GrY5GWZHrkY | 粵語 | 11 奉獻什麼 | 同上 |
| 2217 | WEWPz2Y4g-s | 粵語 | 周日音樂匯 - 05高唱入雲 | "周日音樂匯" 睇落似主日多首連唱,唔係單曲 |
| 2218 | 7uhLqDwS9bs | 粵語 | 周日音樂匯 - 04榮耀耶穌 | 同上 |
| 2219 | QPO3y_Duch4 | 粵語 | 周日音樂匯 - 03頌讚全能上帝 | 同上 |

### SingforGod薪火敬拜（7條 — 成個頻道標題都好殘缺,建議一齊人手核實）

| id | youtube_id | 語言 | 標題 | 備註 |
|---|---|---|---|---|
| 1580 | -zcaPBfvAnQ | 粵語 | my sweet | 標題殘缺,睇唔出內容 |
| 1581 | wncIu7aCA08 | 粵語 | pe doo.m2v | 睇落似原始檔案名冇改過 |
| 1582 | 5PQHD7Pk6Nc | 粵語 | birthdaysong | 標題殘缺 |
| 1666 | ts160kOXJQw | 粵語 | Bible | 標題過於簡短,睇唔出係咪歌 |
| 1667 | bZaHcGTGpIs | 粵語 | Karen New Year | 可能係少數族裔("克倫族")新年主題片,唔一定係詩歌 |
| 1668 | 5pQsRoDx4Ts | 粵語 | will my parent | 標題殘缺 |
| 1760 | KaXiqk6A9-M | 粵語 | clever child | 標題殘缺 |

> 呢個頻道成批標題都好似原始檔案名/未整理過,建議連埋成個頻道嘅收錄一齊覆核,唔止呢 7 條。

**Tier 2 小計：23 條**

---

## 總計

| Tier | 條數 |
|---|---|
| Tier 1（高信心） | 46 |
| Tier 2（中等信心,建議先開片確認） | 23 |
| **合計** | **69** |

（比對上次口頭報告嘅「約45條」多咗,因為呢次執行緊個 session 用返份完整 294 條清單再逐條人手覆核一次,搵到多幾條之前用關鍵字掃漏咗嘅,例如「三吉 與 《XX》」呢類冇撞到關鍵字嘅訪談片，以及新增咗 Tier 2 呢個中等信心分級，令覆蓋更完整。）

佔現時 curated 庫（1231 首,截至寫呢份文件嗰刻）嘅 **3.7%（Tier1）／ 5.6%（Tier1+2）**。

## 未列入呢份清單、但都可能值得留意嘅相關觀察

- **原始和聲**（id153/157/164 等）— 標題入面出現嘅「李漫渟 Manting Lee」「朱肇階 Daniel Chu」等係集體頻道底下嘅參與表演者名,唔喺 artist 表入面,但呢批**本身係真.歌曲**（有 "COMMON / GROUND"、"(Live)" 呢類正常歌曲標記）,冇被列入呢份清單。
- **天弦音樂事工** 嘅 "XX (Live) - Johnny Yim / <人名>" 系列（8條）都係真.歌曲演出,冇列入。
- 呢份文件淨係關於「內容類型」（係咪一首歌）,同 display_title 清理 project 本身嘅「顯示格式靚唔靚」係兩件唔同嘅事,執行嗰個 session 唔使理會格式,淨係判斷「應唔應該喺 curated 庫入面」。
