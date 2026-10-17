# backfillAlbumFromNituCatalog 報告 —— 泥土音樂(claymusic.org 官網 catalog)

> org=泥土音樂。生成時間:2026-08-11 10:24:37

- 候選 row 總數:336
- match 到單一專輯且已寫(或 --dry 模擬):36
- match 到但撞多隻專輯(衝突,冇寫):0
- match 到但 DB 已有 album(冇覆寫):109
- match 到但 album_source=manual/legacy(受保護,冇覆寫):65
- catalog 搵唔到:126
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):62.5%

## 已寫(或 --dry 模擬)清單

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|
| 1008 | DOgYhSWbGZs | 來找耶穌 Come to Jesus | 來找耶穌 | 來找耶穌 (Come to Jesus) |
| 1195 | DOgYhSWbGZs | 來找耶穌 Come to Jesus | 來找耶穌 | 來找耶穌 (Come to Jesus) |
| 8539 | e6O67h9QPSE | 天國的子民 (People of Heavenly Kingdom) / 泥娃娃 (Clay Music for kids) | 天國的子民 | 泥娃娃 #2 / Say Yes to Jesus |
| 8540 | 8s7cICZr6xk | 天國的子民 (People of Heavenly Kingdom 生活篇) / 泥娃娃 (Clay Music for kids) | 天國的子民 (People of Heavenly Kingdom 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8541 | F9sEE-pljoQ | 有一天 (One Day) / 泥娃娃 (Clay Music for kids) | 有一天 | 泥娃娃 #2 / Say Yes to Jesus |
| 8542 | Asyki8RMA5I | 有一天 (One Day 生活篇) / 泥娃娃 (Clay Music for kids) | 有一天 (One Day 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8543 | oxAr5ELkM30 | 不停讚美 (Endless Praise) / 泥娃娃 (Clay Music for kids) | 不停讚美 | 泥娃娃 #2 / Say Yes to Jesus |
| 8544 | d7KRP5eUiOw | 不停讚美 (Endless Praise 生活篇) / 泥娃娃 (Clay Music for kids) | 不停讚美 (Endless Praise 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8545 | XwnSFs4kwXE | 毛毛蟲 (Caterpillar) / 泥娃娃 (Clay Music for kids) | 毛毛蟲 | 泥娃娃 #2 / Say Yes to Jesus |
| 8546 | Dl5uFkO_3G4 | 毛毛蟲 (Caterpillar 生活篇) / 泥娃娃 (Clay Music for kids) | 毛毛蟲 (Caterpillar 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8547 | E-VQdYYxlm8 | Say Yes to Jesus / 泥娃娃 (Clay Music for kids) | Say Yes to Jesus | 泥娃娃 #2 / Say Yes to Jesus |
| 8549 | ljYws07uAyE | 腳步 (Footsteps) / 泥娃娃 (Clay Music for kids) | 腳步 | 泥娃娃 #2 / Say Yes to Jesus |
| 8550 | S7xN7SX37lE | 腳步 (Footsteps 生活篇) / 泥娃娃 (Clay Music for kids) | 腳步 (Footsteps 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8551 | lUcianwuhvw | 幸福 (Blessed) / 泥娃娃 (Clay Music for kids) | 幸福 | 泥娃娃 #2 / Say Yes to Jesus |
| 8552 | ULo-Q1R-Rgw | 幸福 (Blessed 生活篇) / 泥娃娃 (Clay Music for kids) | 幸福 (Blessed 生活篇) | 泥娃娃 #2 / Say Yes to Jesus |
| 8554 | zbgYllK5i1g | 主恩典 /泥娃娃 | 主恩典 | 泥娃娃 #1 / Clay Kids #1 |
| 8555 | 08OBuYzWbG4 | 做與不做 / 泥娃娃 | 做與不做 | 泥娃娃 #1 / Clay Kids #1 |
| 8556 | ZRcKyGg2Lpg | 活出愛/泥娃娃 | 活出愛 | 泥娃娃 #1 / Clay Kids #1 |
| 8557 | GvH2b4fb5wI | 好心情 /泥娃娃 | 好心情 | 泥娃娃 #1 / Clay Kids #1 |
| 8558 | YDR7d6h3aDg | 看見神的愛 / 泥娃娃 | 看見神的愛 | 泥娃娃 #1 / Clay Kids #1 |
| 8559 | 0Rj8JAStjxc | 今天可以不一樣 /泥娃娃 | 今天可以不一樣 | 泥娃娃 #1 / Clay Kids #1 |
| 8573 | tekHUUKss3g | 榮耀歸神 平安給人/Glory to God, Peace to Men, 盛曉玫 /Amy Sand, 音 | 榮耀歸神 平安給人 | 親密的朋友 |
| 8574 | vR8q7WUGjHQ | 愛祢到底/Love You til The End,盛曉玫 /Amy Sand, 專輯 7：好心情 | 愛祢到底 | 好心情 |
| 8575 | ddvkzBhdty4 | 最珍貴的禮物/The Most Precious Gift, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 最珍貴的禮物 | 好心情 |
| 8576 | sEUfnrbR_zo | 盼望/ Hope, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 盼望 | 好心情 |
| 8577 | EQePgGUhLT4 | 生命的花朵/Flower of Life, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 生命的花朵 | 好心情 |
| 8580 | 4tNZBfAn9JY | 天國的子民/People of the Heavenly Kingdom, 盛曉玫 /Amy Sand, 專輯 4:就在這裡 | 天國的子民 | 就在這裡 |
| 8581 | l4KwzNXnsFA | 腳步/Footsteps, 盛曉玫 /Amy Sand, 專輯 3：腳步 | 腳步 | 腳步 |
| 8583 | eGAeeQxZ6FM | 因為祢/ Because of you,盛曉玫 /Amy Sand, 專輯 7：好心情 | 因為祢 | 好心情 |
| 8585 | KOS6j6Mh6cA | 讓我說聲謝謝你/Let Me Say Thank You, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 讓我說聲謝謝你 | 好心情 |
| 8587 | flh1lMnNf-k | 祢最酷/ You are So Cool, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 祢最酷 | 好心情 |
| 8588 | LU-Kg36fgBA | 越久越甘甜 ,盛曉玫 /Amy Sand, 專輯 7：好心情 | 越久越甘甜 | 好心情 |
| 8589 | zdGb_4lziwc | 醫治的愛/Healing Love,盛曉玫 /Amy Sand, 專輯 7：好心情 | 醫治的愛 | 好心情 |
| 8590 | K3pCNKk_FwQ | 做與不做/Do or Don't do, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 做與不做 | 好心情 |
| 8595 | M3mR8cr6qIU | 好心情 / Feeling Happy, 盛曉玫 /Amy Sand, 專輯 7：好心情 | 好心情 | 好心情 |
| 8597 | 5Pe2csSjlXU | 恩典的記號 /Mark Of Grace 盛曉玫/ 專輯6: 幸福/Blessed | 恩典的記號 | 幸福 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|

## Catalog 搵唔到清單(頭 150 條)

| id | youtube_id | title |
|---|---|---|
| 48 | CZr_ltR2vos | 祂為我開路 |
| 54 | t36MZy7X9Xw | 好好戀愛 |
| 56 | eMIuVXVYqgc | 有誰能像祢 |
| 58 | Z73wG7GxuJU | 避難所 |
| 60 | Jr5t8sw9RrM | 主祢是我的一切 |
| 62 | J1qOzdoRbpg | 信心 |
| 64 | WU0rXGXF8YM | 馬拉松 |
| 258 | 8z2syVwy4C4 | 新創作組曲12首 一次聽 |
| 260 | JCpnnZJ-vnY | 心靈舒壓組曲 45分鐘連續播放 |
| 261 | cLjXQsomj6k | 泥土音樂 最適合安靜聆聽的詩歌 十首連續播放 （含歌詞） |
| 871 | 2X5UNRA_zxo | 不變的愛 走出原生家庭的陰霾和過去的失敗 |
| 941 | jy681BbUktg | 算命與聖經預言 詩歌默想 新天地 |
| 967 | rwNluCYJMR0 | 錄影花絮敬請期待正片 |
| 1052 | w7kT-68GlFo | 上好的福份 送給忙碌的你 我多麼需要有祢 |
| 1068 | p_2Zd81JP6I | 如何取得盛曉玫/ 的歌譜 |
| 1199 | Vtx0MOy3ZiE | 盛曉玫的故事 好消息電視台 |
| 1201 | jy681BbUktg | 算命與聖經預言 詩歌默想 新天地 |
| 1202 | w7kT-68GlFo | 上好的福份 送給忙碌的你 我多麼需要有祢 |
| 1204 | 2X5UNRA_zxo | 不變的愛 走出原生家庭的陰霾和過去的失敗 |
| 1206 | p_2Zd81JP6I | 如何取得盛曉玫/ 的歌譜 |
| 1207 | rwNluCYJMR0 | 錄影花絮敬請期待正片 |
| 1209 | 93rZJ373VSk | 好消息！盛曉玫 最新專輯 重新來過 平安永不離開 發行了！ |
| 4080 | onU_-LJ69Ds | 會 2026 歐洲巡迴音樂會來了！ 6/20 - 6/28 共7場 |
| 8352 | WK5qKoyG8QU | 2026盛曉玫+ 台灣巡迴 場場留下主恩典的記號 |
| 8353 | yZXNGEDe6JQ | 盛曉玫在高雄福氣教會 - 台灣巡迴 |
| 8354 | SVAqYoy476Y | 感恩音樂會 - 西雅圖地區的朋友們， 會來了！ 美西時間 11/21 ～ 11/22 共三場 |
| 8355 | JFOvWZuHpks | 神蹟音樂會 - 台灣巡迴音樂會美好見證 |
| 8356 | BEIsb6edMK8 | 亞特蘭大地區的朋友們， 會來了！ 美西時間 9/5 ～ 9/7 共兩場 |
| 8357 | UvvyqjQJxtI | 好消息！北加州的朋友們！ 會來了！ 美西時間 5/23-5/25 共三場 |
| 8360 | ACNhuuTaqxU | 你很在意別人的眼光嗎？ ：世界聽不懂的歌 |
| 8361 | W-EDUjHdd7E | 恩典的記號 中英歌詞版 Amy Sand - Marks of Grace (Selected hymns with English lyrics) |
| 8362 | _fB9sMWhzHI | 讓世界看見希望 中英歌詞版 Amy Sand - Let The World See Hope (Selected hymns with English lyrics) |
| 8363 | ileiAGGTIi0 | Amy Sand - Water and Fire (Selected hymns with English lyrics) |
| 8366 | L1N6fxsbSGk | 的禱告 |
| 8368 | gbTPuwaNImY | 離此不遠 Not too far from here |
| 8369 | PRYHUwGzqZQ | 無人知我心 No one knows my heart |
| 8370 | E2doDt4vdRc | 常常喜樂 Rejoice Always |
| 8371 | PPm74qZadEM | 為主來夢想 Dream for the Lord |
| 8372 | xBHrHz9kg8s | 輕輕鬆鬆 Taking My Time |
| 8375 | wDGuEZa4b0w | 天父 Heavenly Father |
| 8378 | MvsH8kSNVKQ | 牽我手 Hold My Hand 感謝天上的父親 牽著我們的手，走人生的道路 |
| 8379 | U5vq0p5Gq3w | 當我讚美我的主 Praise looks good on you |
| 8380 | OtoG3oiKs68 | 美東巡迴恩典簿 |
| 8382 | KNQ2uQwal5k | 多一點 A little more 獻給全天下辛苦的爸爸媽媽 |
| 8384 | kngt5b8q0Qg | 耶穌 我投靠祢 Jesus I Run To You 為台灣地震禱告 |
| 8386 | -QvW1JQgANg | 創作的故事 釘痕手Nail-pierced Hands 專輯：脚步 |
| 8388 | Ga52OBLiEUc | 好好的過 (Live Well) 你是個容易憂慮的人嗎? |
| 8392 | 0d2AnlQ5r9I | 愛你到底 Love You Till The End（官方版）盛曉玫 Amy Sand 專輯：好心情 |
| 8397 | 5Jfj6UG7S9g | 一起走 Walk with me（官方版）婚禮的祝福 盛曉玫 Amy Sand 專輯：就在這裡 |
| 8406 | gtIAQgG-DQk | 我願跟隨祢 I Will Follow You（官方版）盛曉玫 Amy Sand 專輯：腳步 |
| 8409 | twU-vOhrQt0 | 當我禱告 When I Pray （官方版）曉玫 Amy Sand 專輯：平安永不離開 |
| 8411 | OE3msixC_Zw | 有你比什麼都好 I'd Rather Have You （官方版）盛曉玫 Amy Sand 專輯：平安永不離開 |
| 8416 | rB3yYf95xlg | 音樂會消息 2023 盛曉玫 歐洲巡迴音樂會 5/7 ～ 5/20 |
| 8417 | CGfM91RIDXg | Is there really a God? Amy Sand [Happiness Hotline] / How beautiful your name is |
| 8418 | ca3EWSNesmU | 3 分鐘唱出聖誕節的意義 Jesus is reason for the season！ |
| 8419 | iITXP84Uhxc | 5 分鐘唱出心中的感恩， 祝大家感恩節快樂！ |
| 8424 | PbEk2vW4--4 | 心動時刻 Connie Kwok 愛車受傷記 |
| 8427 | C8qyWvRlTLc | 如何數算你的日子? 盛曉玫 【幸福熱線】 第十集 / 擁抱新的每一天 |
| 8428 | rM9xGB5h7lE | 愛を形に (活出愛) 盛曉玫の賛美歌 日語版 |
| 8430 | nz1TH7tVEqo | 恵みのしるし (恩典的記號) 盛曉玫の賛美歌 日語版 |
| 8432 | SCxlrvjrVic | あなたを思う (想起你) 盛曉玫の賛美歌 日語版 |
| 8433 | 2ocL5e-mizM | 世界越來越亂 哪裡有平安? 盛曉玫 【幸福熱線】 第九集 / 幸福 |
| 8434 | 5-0_udjibbs | 恵みの道 (腳步) 盛曉玫の賛美歌 日語版 |
| 8435 | bK6_znsAywk | もしも (有一天) 盛曉玫の賛美歌 日語版 |
| 8436 | meWc72JdTuw | 首張日語專輯 活出愛 （愛を形に）發行了！ 向日本朋友傳福音 |
| 8437 | sbcoerTAK24 | 真神？假神？ 盛曉玫 【幸福熱線】 第八集 / 神羔羊 |
| 8439 | F6HYwlE7RK8 | 讀聖經有什麼好處？ 盛曉玫 【幸福熱線】 第七集 / 袮最酷 |
| 8441 | 8_Uf1o7DoQA | 人生舞台的金像獎 盛曉玫 【幸福熱線】 第六集 / 活出愛 |
| 8443 | lO77duLURjo | 禱告未蒙應允，神還愛我嗎？ 盛曉玫 【幸福熱線】 第五集 / 依然愛我 |
| 8445 | 9m6BmfRh0lY | 關乎人生的壞消息和好消息 盛曉玫 【幸福熱線】 第三集 / 好消息 |
| 8446 | odSklXElkso | 等我老了再來信耶穌吧？ 盛曉玫 【幸福熱線】 第二集 / 至寶 |
| 8447 | 88dGiOy6S6Q | 信耶穌就可上天堂？ 盛曉玫 【幸福熱線】 第一集 / 為何對我這麼好 |
| 8453 | 9H9DGun3n3Y | 心動時刻 Lulu Ding 大人在做 小孩在看 ～蛋塔的啟發 |
| 8455 | nJKdY-fF49Q | 心動時刻 Michael Li 奇異恩典 臨到廟前小販 |
| 8457 | 3UaG96ZaCCg | 心動時刻 Tom Yang 昨日的恩典 今日的力量 明日的盼望 |
| 8461 | bDH4RUBiY7Q | 邀請您，在自己安全舒適的家中，收看 會直播！ |
| 8462 | AFw1H3IxPNQ | 心動時刻 Sandra Tsai 兒子與燎原山火搏鬥 神的話安慰母親的心 |
| 8463 | LzEy4KHOpG0 | 我不在乎 I Don’t Mind 盛曉玫 Amy Sand 專輯 5：信心 |
| 8464 | DJCocoCsKRQ | 心動時刻 Connie Kwok 偶遇賣藝的人 竟聽見神的聲音 |
| 8465 | W-H0QsuY2vY | 心動時刻 David Lu 神的話 好像一道亮光 |
| 8467 | CYgmabH_8aw | 心動時刻 Iris 你害怕失敗嗎 |
| 8469 | E-a1n2xC7Go | 心動時刻 Choe Hung 在朋友圈勇敢為主作見證 |
| 8471 | l_IcoTRRKKE | 心動時刻 Jimmy Wang 每早晨與天父相遇的心動時刻 |
| 8473 | NUCi6g7kBHY | 心動時刻 Connie 神的心意 到最終都是美好的 |
| 8475 | GULCHUE2Xbo | 心動時刻 Tom Yang : 踏出信心腳步 進入神的應許 |
| 8477 | 4fMAng1Hk50 | 心動時刻 林亞青 Katherine Lin: 馬太福音 25:14-30 良善忠心的人 |
| 8479 | DvnWI64-tnM | 心動時刻 Michael Li: 帶不走的要知足 帶的走的要追求 |
| 8482 | _LTfx5URuE8 | 新聞快報 - 網路直播音樂會又來囉！ |
| 8487 | RZJKNvKTKA0 | 新年好消息 - 新年的祝福 盛曉玫 Amy Sand |
| 8507 | 0aiDMwvgur0 | 盛曉玫 疫情心情 完結篇： 專訪 領隊 Michael Li - 你在怕什麽？你穿了屬靈的防護衣嗎？你打了抗罪的疫苗嗎？ |
| 8508 | yIQyzxmxkb4 | 盛曉玫 疫情心情 第七集： 專訪 團員 Tom - 十幾年前的金融風暴和焦慮症，是神給的期中考。這次的疫情是期末考？ |
| 8509 | 9kkJouUA6Pc | 盛曉玫 疫情心情 第六集： 專訪 團員 Sean & 曉燕 - 巧手做口罩，譜曲慰人心。你，也能成為別人的祝福！ |
| 8510 | SFPgUbugaLI | 盛曉玫 疫情心情 第五集： 專訪 團員 Jason - 一向勝算在握的成功人士，疫情初期也慌了！他如何走出驚恐，活出盼望？ |
| 8511 | Y-T0VirE9YY | 盛曉玫 疫情心情 第四集： 專訪 團員 George & Sandra - 疫情把已成年，已離家的孩子又送回家了！此時父母還能做什麼？ |
| 8513 | jPZGANufJG4 | 盛曉玫 疫情心情 第三集： 專訪 團員 Connie - 打拼多年的事業，可能被迫關門。她還能對神有信心嗎？ |
| 8514 | V3Xm0J6_9ZQ | 盛曉玫 疫情心情 第二集： 專訪 團員 Luis & Katherine - 一位是理財顧問，一位是內科醫生。這對優秀的夫妻如何化解衝突？ |
| 8515 | UNSaOx2xICc | 盛曉玫 疫情心情 第二集： 專訪 團員 Luis & Katherine - 一位是理財顧問，一位是內科醫生。這對優秀的夫妻如何化解衝突？ |
| 8516 | 53POSAU1NNM | 盛曉玫 疫情心情 第一集： 專訪 團員 Iris - 只剩兩個月生活費了，神卻應許：罈𥚃的麵不減少，瓶裡的油不短缺？ |
| 8518 | 16vdnJIwtlo | 真情報平安 盛曉玫 Amy Sand 在疫情中一個溫馨的問候 |
| 8523 | 6cAO7wIqlIc | 看見神的愛 I’ve seen God’s love 盛曉玫 Amy Sand 專輯 2：有一天 |
| 8530 | 2J-AC7TAVj8 | 盛曉玫 神奇的沙幣 (Sand Dollar) 開箱分享 |
| 8548 | 65KthHgfcuY | Say Yes to Jesus (生活篇) / 泥娃娃 (Clay Music for kids) |
| 8553 | g9xTLg9BSDo | ˊ盛曉玫/ 上 LA Living 洛城18台電視節目 09072009 |
| 8560 | 8oi0MMVrGEA | 泥娃娃2: Say Yes to Jesus 宣傳短片 |
| 8561 | WUuhREEvmLk | 五分鐘靈修小站 No. 17 有福的人 耶利米書 17 : 7 - 8, 2:13 |
| 8562 | S1eFEdDAcrM | 五分鐘靈修小站 No. 15 不能隔絕的愛 羅馬書 8 :35 - 38 |
| 8563 | XJ3W32B6gK8 | 五分鐘靈修小站 No. 14 神聽見 瑪拉基書 3: 13 - 18 |
| 8564 | V3E9WpOC9c0 | 五分鐘靈修小站 No. 11 今天過得不一樣 耶利米哀歌 3 : 23 |
| 8565 | MBGiwGQu8Qs | 五分鐘靈修小站 No. 10 新酒舊皮袋 馬太福音 9: 16 - 17 |
| 8566 | ESrf7Ba2XH4 | 五分鐘靈修小站 No.9 活在主前 詩篇 16: 1 - 11 |
| 8567 | Szq5jWtsNCw | 五分鐘靈修小站 No.6 數算日子 詩篇 90 : 12 , 14 箴言 9 : 10 |
| 8568 | jME0Jm91o-E | 五分鐘靈修小站 No. 5 神與人 詩篇 90 : 1 - 10 |
| 8569 | h7lAvjmz-1A | 五分鐘靈修小站 No. 4 對主說 Yes 加拉太書 5:16 - 26 |
| 8570 | kOaz9w2B4iI | 五分鐘靈修小站 No. 3 試探 馬太福音 4: 1 - 11 |
| 8571 | AohuO2NcqvU | 五分鐘靈修小站 No. 2 主知我軟弱 希伯來書 4: 14 - 16 |
| 8572 | WOJnitC2Tpk | 五分鐘靈修小站 No.1窯匠與 耶利米書18:1-6 |
| 8578 | Y1jQpao-rl8 | 見證分享 - Natalie Chang 盛小慧 |
| 8579 | 4X0ziRDJSOw | 見證分享 - ALBERT LEE 李政勳 |
| 8582 | NvWhkW8nU9A | 2016 泥娃娃 No.1 Promo Video |
| 8584 | fuoaQXwgkks | 1/15 -1/17/16 多倫多巡迴 |
| 8586 | vjOwPauyiBo | 11/14-15/15 @ FECC Michigan |
| 8591 | xOjkdeq_Po4 | 2015歐洲巡迴 - 踏踢篇 |
| 8592 | OvUW4TM0llc | 9/21/15 @南愛爾蘭都柏林基督教會 |
| 8593 | tKLAkQ2_dZI | 9/20/15 @瑞士洛桑華人教會 |
| 8594 | l5M-qhxvRFY | 一起來QT, 9/14/15 結2:1-10 |
| 8596 | uMelRod_WPw | About us: Sandra Tsai - 蔡美玲 |

(DB 已有 album 冇覆寫嘅 109 首、album_source=manual/legacy 受保護嘅 65 首,唔逐條列,見上面統計數字。)
