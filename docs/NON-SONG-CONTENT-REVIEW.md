# 非歌曲內容審核清單

由另一個 read-only 診斷任務產生（2026-07-26）。掃描全庫 curated 歌（`curated=1 AND status != 'dead'`），用「講座/見證/工作坊/Preview/課程/訪談/公告/回顧/紀錄片/峰會/Podcast/Workshop/Sale/Birthday/Trailer/花絮」等中英文關鍵字揪出疑似非歌曲內容（教學片段、見證分享、講座、工作坊、周邊促銷、頻道公告、活動回顧片等），供人手決定delist邊條。

**呢份文件淨係list嘢，未做任何delist/update。** 所有查詢都係 read-only SELECT。

共 **76 條**，按頻道分組，附信心程度（高/中/低）：
- **高** = 標題已經好明顯係教學/見證/講座/公告/宣傳片，唔係歌
- **中** = 睇標題好大機會唔係歌，但建議聽一聽/睇一睇先delist
- **低** = 資料唔夠（冇 tags/album,標題太簡短或含糊），需要人手打開片段確認

YouTube 連結格式：`https://youtu.be/{youtube_id}`

---

## Kids on the Move（17條，高信心為主）

「Let's Talk About...」系列係聖經故事教學討論片段，非歌曲：

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1621 | Let's Talk About a Man After God's Own Heart | 5oDN-Vjdgoc | 高 |
| 1622 | Let's Talk About Prayer | J4VMfQ9I_es | 高 |
| 1645 | Let's Talk About the Kings of Israel | ehBhysKXwdE | 高 |
| 1646 | Let's Talk About Silence and Solitude | 8NPhxH4stOw | 高 |
| 1729 | Let's Talk About the Fruit of the Spirit! | PFv0B-nP1tk | 高 |
| 2173 | Let's Talk About Figs | hBJVFMmoaA4 | 高 |
| 2190 | Let's Talk About The Good Samaritan | zVE5P9lhs3E | 高 |
| 2192 | Let's Talk About Spiritual Gifts | ITDIoq_aie8 | 高 |
| 2224 | Let's Talk About Farming | 6l6iLDzeHuU | 高 |
| 1620 | Parafries: Solomon Asks for Wisdom | xLmxdiGAuYo | 高 |
| 1647 | Parafries: Philip and the Ethiopian Eunuch | xmXZ2MXVgYU | 高 |
| 1663 | Death in the Pot \| Bible Story | yJRRI3sB1o4 | 高 |
| 1682 | The Kids on the Move Supercut \| Vol. 3 | uH5NOox_OJE | 中 |
| 1693 | The Kids on the Move Supercut \| Vol. 2 | Q3PCezPRhGg | 中 |
| 1695 | The Kids on the Move Supercut \| Vol. 1 | IjlO6-X_518 | 中 |
| 1718 | Paul's Great Big Dangerous Adventure Supercut | DRV7rKF-XWc | 中 |
| 1759 | Majunga Learns Puppetry | 2tLmeRkrqno | 中 |

> 備註：呢個頻道仲有大量「God's Animal - The XX \| Preschool」（~15條）同類短片，睇標題唔肯定係咪純教學定係有歌，冇放入呢份清單，如果想再篩多啲建議另外抽樣睇。

## 台北復興堂（4條，高信心）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1590 | 真愛家庭月 \| 才德與平凡 \| 簡春安教授 | k81QnH2U98E | 高（教授講座） |
| 1592 | 真愛家庭月 \| 你快樂嗎？ \| 簡春安教授 | QsNnOmmB3LM | 高（教授講座） |
| 1599 | 見證耶穌的神蹟 \| 復活節特別影片+見證故事 | beoUReVB9gw | 高（見證故事） |
| 1600 | 台北復興堂2025回顧影片 TRC 2025 Summary Film | c75ucMm1QHs | 高（年度回顧片） |

## 共享詩歌 ShareHymns（6條，高信心）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1791 | Preview CAL7 | -O4DoJ_N6dY | 高（試聽Preview，非完整曲） |
| 1817 | CAL8 Preview | KNLTMf6ITxU | 高（試聽Preview） |
| 1819 | CAL8 preview revised | QIsTW5xT8GA | 高（試聽Preview） |
| 1962 | 2021:03 亞斯理堂長者佈道會 | 7zT8pbNYUGg | 高（佈道會活動） |
| 1963 | 基智中學 2020年12月21日 網上音樂佈道會 | 1KJk9S8hwiE | 高（佈道會活動） |
| 2123 | ShareHymns Tour Highlight | e6HkWzieWgQ | 高（巡演花絮） |

## 天弦音樂事工（9條，高信心）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1884 | 《救贖的聲音》敬拜音樂佈道會 | mSklNOu6UNE | 高（佈道會活動） |
| 1885 | 《好牧人》- 填詞人三吉介紹 | _kc-Wck89J4 | 高（填詞人訪談介紹） |
| 1971 | 三吉 與 《超出預計的愛》 | RQ9Mv8Woe_8 | 高（創作人專訪） |
| 1972 | 三吉 與 《恩典》 | LgiZmpQ5a8Q | 高（創作人專訪） |
| 1973 | 【想聽你救贖的聲音】- 李浩賢先生 分享見證 | k9DUxFFmxJc | 高（見證分享） |
| 2087 | 看動漫信主？【救贖的聲音】- 10個夥伴機構與歌手的分享 - 伙石間 Part 2 | yTtuAg8kt8Q | 高（座談分享） |
| 2201 | Gsus Music Ministry 天弦音樂事工是什麼？ | fLkLYBsYnB8 | 高（機構介紹片） |
| 2202 | 天弦音樂事工創辦人Johnny Yim親自解說【救贖的聲音】專輯的寫作歷程 | dLuACXdAe44 | 高（創作人解說訪談） |
| 2203 | 【The Sound Of Salvation 救贖的聲音】預售中！ | L1L2wuT8S5E | 高（預售公告） |

## Asia for JESUS（5條）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1568 | Smart Financial Management \| Managing Your Finances Starts with Managing Your Mind! Chen Minli | GrWYWV_2f0k | 高（理財講座） |
| 1576 | 2025 青吶特會回顧影片｜Holy Fire Reloaded 聖火重載 | -cpn3I6OF20 | 高（大會回顧片） |
| 1577 | 領袖優勢工作坊－幫助個人與團隊提升效能, 發展天賦才幹 | geGcmu1GiqA | 高（工作坊） |
| 1583 | 【優勢好好玩】EP7｜優勢特別篇... | 3SdQBhdasbg | 高（訪談節目） |
| 1578 | 約書亞樂團｜接待神同在｜2025 年度異象片 | 4yXI7MGox-U | 中（年度異象宣傳片，需確認有冇完整歌） |

## 同心圓敬拜（3條）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1787 | ❏ Facing GOD 2026 全港信徒山上敬拜峰會 ❏《生命的冠冕》峰會異象意念短片 | tYVujSfo6k0 | 高（峰會異象宣傳短片） |
| 1848 | 【大埔火災特備節目】《流淚谷中的陪伴》\| DJ馬馬療癒之旅 | 15ALjoggiYM | 高（特備節目/療癒節目） |
| 1955 | 精彩回顧｜Facing GOD 2025 全港信徒山上敬拜峰會 | tFUhZ919Cpw | 高（峰會回顧片） |

## 泥土音樂（4條）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 967 | 泥土音樂 錄影花絮敬請期待正片 | rwNluCYJMR0 | 高（拍攝花絮） |
| 1068 | 如何取得盛曉玫/泥土音樂的歌譜 | p_2Zd81JP6I | 高（歌譜取得說明） |
| 1199 | 盛曉玫的故事 好消息電視台 | Vtx0MOy3ZiE | 高（人物故事/紀錄片） |
| 1209 | 好消息！盛曉玫 泥土音樂 最新專輯 重新來過 平安永不離開 發行了！ | 93rZJ373VSk | 高（新碟發行公告） |

## 玻璃海（3條，中/低信心）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 108 | 足本放送 置身玻璃海敬拜讚美會2015 | 7oGAnHoDeDM | 中（整場敬拜會足本，非單曲） |
| 114 | 平安夜敬拜節目2020 | uVpLxuzjs7k | 中（整個節目，非單曲） |
| 759 | 玻璃海 | LMo7qoJ4Wgg | 低（標題只有樂團名，需開片確認內容） |

## SON Music（4條，高信心）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1531 | iPray 我向祢禱告敬拜音樂分享會 - 悉尼站 | 4W_Eqkg9Z9Q | 高（分享會活動） |
| 1756 | 感謝肇基用他的音樂與熱誠祝福了我們！ | K6sEWbVXfUw | 高（感謝致詞） |
| 2184 | 呼求祢名 (錄音室花絮) \| SON Music 專輯 | OUrFXV8j8nQ | 高（錄音花絮） |
| 2185 | 《不變的應許。見證音樂會》綵排花絮 | XJ8hZcGLv6s | 高（綵排花絮） |

## Yancy（12條，高信心 — 比原估計的~4條多好多）

| id | title | youtube_id | 信心 |
|---|---|---|---|
| 1871 | Cotton Candy and Colorful Tie Dye Merch is here for all... | fKiGHgN2nEo | 高（周邊促銷） |
| 1872 | HEARTBEAT Curriculum Features and Included Media | fOFZay66M58 | 高（課程教材介紹） |
| 1873 | Stained Glass Kids Podcast with Yancy | 6s-NR1eg84Q | 高（Podcast訪談） |
| 1898 | Major news... aka Yancy's Annual Birthday Sale | eyXRdb-xzPE | 高（生日促銷公告） |
| 1934 | I'm back! Why I'm excited to be at Orange Conference in 2025 | bttT4_tQULg | 高（大會宣傳/近況公告） |
| 1942 | CHORUS - Worship Leader Coaching for Next Gen Ministry | _6BF-2z2GIk | 高（教練課程） |
| 1943 | Setting the table for my BIRTHDAY SALE! | gASe2dkuQCI | 高（促銷公告） |
| 1978 | Valentines gift ideas from Yancy | CLJ9NEFXRUE | 高（禮品促銷） |
| 1979 | Perfect Volunteer / Teacher Gifts for Valentines... | yW_cjWGDZz8 | 高（禮品推介） |
| 2014 | Yancy shares about Kidmin Worship Vol 8 Songs of Revival | duPOO3n8Ok0 | 高（專輯訪談） |
| 2015 | Yancy shares about the songs on Kidmin Worship Vol. 7 | WCzi5unScpc | 高（專輯訪談） |
| 2050 | Today is my birthday and this is big news... | vC66CzYlaOk | 高（生日公告） |

> 備註：2022/2023/2024（Kidmin Worship Vol.7/Vol.8 SONG PREVIEW、Let's Get Started PREVIEW）喺 Eric 原本嘅~45條估算入面已經計咗，呢度冇再重複列出，但都建議一併檢視（試聽Preview，非完整曲）。

## 其他頻道零星發現（非 Eric 原list提及,額外揪出）

| id | title | artist | youtube_id | 信心 |
|---|---|---|---|---|
| 2127 | Jesus Is My Superhero - 20th Birthday from Hillsong Kids \| Trailer | Hillsong Kids | SU4gk9GxI4U | 高（Trailer預告片） |
| 1901 | 憂傷痛悔的靈 (詩篇51) - MV製作 Behind the Scenes | Milk&Honey | -dNBBJFOUII | 高（MV製作花絮） |

## SingforGod薪火敬拜（7條，低信心 — 標題太簡短/含糊,需要人手開片確認）

呢個頻道所有 curated 條目標題都好短、冇 album/tags 資料輔助判斷，其中 `pe doo.m2v` 仲直接帶住檔案副檔名,似係入庫時漏執嘅原始檔名,唔似正常標題。建議人手逐條開片睇先決定去留,唔應該淨憑標題delist。

| id | title | youtube_id |
|---|---|---|
| 1580 | my sweet | -zcaPBfvAnQ |
| 1581 | pe doo.m2v | wncIu7aCA08 |
| 1582 | birthdaysong | 5PQHD7Pk6Nc |
| 1666 | Bible | ts160kOXJQw |
| 1667 | Karen New Year | bZaHcGTGpIs |
| 1668 | will my parent | 5pQsRoDx4Ts |
| 1760 | clever child | KaXiqk6A9-M |

---

## 總結

- 總共 **76條** 疑似非歌曲內容（比 Eric 原估計嘅 ~45 條多,因為 Yancy 頻道實際上多咗好多促銷/Podcast/公告類內容,另外都喺 Kids on the Move、天弦音樂事工揪到更多）：**高信心 60條**、**中信心 8條**、**低信心 8條**
- 建議處理順序：先delist「高信心」嗰60條（教學片段/講座/見證/公告/花絮/Preview）,「中」「低」信心嗰16條（Kids on the Move Supercut系列/Majunga、Asia for JESUS異象片、玻璃海整場節目、SingforGod全部）建議開片確認先決定
- 呢份清單淨係做建議,冇改動 `hymns.db` 任何資料,delist 需要人手（或另一個內容審核 session）執行
