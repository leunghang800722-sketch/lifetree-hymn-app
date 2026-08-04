# legacy album_source 垃圾值清理報告

> ALBUM-BACKFILL-ACCEL-PLAN.md Opus 5 擴展批次驗收 followup①。生成時間:2026-08-04 14:26:14(--dry,DB 未寫入)

- album_source='legacy' 總數:259
- (a) 完全垃圾,清空(album='' album_source=''):50
- (b) 帶殘留編號,剝走前綴(album_source 維持 legacy):36
- grey area,冇掂:10

## (a) 完全垃圾(清空,交返俾 Phase A/backfillMeta 重新填)

| id | youtube_id | title | 而家嘅 album 值 | 判定原因 |
|---|---|---|---|---|
| 153 | 3_z9GEHgZwg | 信 (Live) | 信 | 單一字符/標點(「信」) |
| 183 | DYlo2qztLAs | 【祢的恩典夠我用 Your Grace Is Enough】現場敬拜MV (Live Worship MV) - 讚美之泉敬拜讚美 (23) | https: | URL 碎片(https: 開頭) |
| 385 | K5vRvnoLmao | 迎春花 - 有情天音樂世界 【今年會更好】專輯 | 》 | 單一字符/標點(「》」) |
| 1324 | iwR3iJNU_Ak | 醫治這地 \| 小羊詩歌《一粒麥子》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 1326 | ifc8Cy6CAq8 | 那一天 \| 小羊詩歌《一粒麥子》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 1334 | tXSSLDnbJtY | 榮耀都歸神羔羊 \| 小羊詩歌《永遠》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 1337 | 0nK4TOGyVaU | 萬民同來敬拜 \| 小羊詩歌《永遠》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 1340 | gQ75W2nCui0 | 何等深情 \| 小羊詩歌《永遠》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 1342 | 38KVF68hrzM | 祢的榮耀彰顯於天 \| 小羊詩歌《永遠》專輯 | (Karaoke) | 純技術英文詞(「(Karaoke)」) |
| 3437 | IBqCsgtutII | 同心圓 \|《哀歌》TWS 敬拜者使團「HEART」Live 專輯 (詩四十二) | (詩四十二) | 成個值淨係括號包住嘅內容(「(詩四十二)」),唔係專輯名 |
| 3439 | V0VlHmy1gEw | 同心圓 \|《平安》TWS 敬拜者使團「HEART」專輯 (約十四、彼前二) | (約十四、彼前二) | 成個值淨係括號包住嘅內容(「(約十四、彼前二)」),唔係專輯名 |
| 3604 | MTnSkJkLG5U | 同心圓 \|《不是倚靠勢力》TWS 敬拜者使團「LOVE」專輯Live ( 亞四) | Live | 純技術英文詞(「Live」) |
| 3609 | ji60jTEiMCE | 同心圓 \|《起初的愛》TWS 敬拜者使團「MERCY 憐憫」Live 專輯 (賽一) | (賽一) | 成個值淨係括號包住嘅內容(「(賽一)」),唔係專輯名 |
| 3610 | wPh-djQTmhM | 同心圓 \|《世代的禱告》TWS敬拜者使團「MERCY 憐憫」Live 專輯 (尼一) | (尼一) | 成個值淨係括號包住嘅內容(「(尼一)」),唔係專輯名 |
| 3624 | qvOy_1H1N2E | 同心圓 \|《求主興起禱告的心》(詞) TWS 敬拜者使團「LISTEN」專輯Live (賽四十二；耶三十二) | Live | 純技術英文詞(「Live」) |
| 3643 | xDSLvXPVuTE | 同心圓 \|《不要憂慮 (太六) 》TWS 敬拜者使團「LISTEN」專輯 Live | Live | 純技術英文詞(「Live」) |
| 3648 | bNpIBHgvBN4 | 同心圓 \|《天國在人間/天國近了》TWS 敬拜者使團「獻給祢」專輯 Live | Live | 純技術英文詞(「Live」) |
| 3651 | 7QA2XTzRJt8 | 同心圓 \|《神恩典夠我用》TWS 敬拜者使團「獻給祢」專輯 Live (林後十二) | Live | 純技術英文詞(「Live」) |
| 3656 | 1FpP1binbLA | 同心圓 \|《在祢面前蒙悅納》TWS 敬拜者使團「獻給祢」專輯Live (詩十九) | Live | 純技術英文詞(「Live」) |
| 3812 | VpkiIhx93go | 同心圓 \|《獻給我天上的主 ＋謝謝我主》TWS 敬拜者使團「獻給祢」專輯 Live | Live | 純技術英文詞(「Live」) |
| 4340 | H1Olybu_8Bs | 【いつだってさんび When I Praise You, I’m Filled with Joy】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4341 | Enc9opQf3WI | 【主のみざで  Before Your Throne】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4342 | tjm7voci6Co | 【よろこびがここに A Joyful Song】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4343 | r8woIfGjFG8 | 【とうときじゅうじか Precious Cross 】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4344 | pdX34_IM-g8 | 【どんなときも主が  He Is My Protector】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4345 | fgOlrKK1vpU | 【あなたがいるから If My God Is with Me 】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4346 | f3d5VLpc9I8 | 【栄光がここに Glory】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4347 | d5xvJ8ru-0U | 【ここにいます Send Me Lord 】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4348 | LstMPOspeQA | 【いやしぬし イエス Jesus, My Jesus】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4349 | 35rveyObNUE | 【陽はてるよ 雲の上 The Sun Above the Clouds 】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4350 | 2FN1-XUKCrU | 【いとしいイエス Deeper In Love 】さんびの泉・SOPキッズワーシップ (2) | https: | URL 碎片(https: 開頭) |
| 4982 | CiZG2oPGfko | 【來歡呼讚美 Come and Worship】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (13) | https: | URL 碎片(https: 開頭) |
| 4984 | iCY_YB1jouY | 【喜樂泉源 Fountain of Joy】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (13) | https: | URL 碎片(https: 開頭) |
| 5186 | woY0JPOgVlk | 【生命劇場 Life Theater】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5187 | qJwNJjRg450 | 【差遣我 Send Me, Lord】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5188 | o47twMs54Ic | 【喜樂的旋律 Joyful Melody】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5189 | _XgP0p-S4S8 | 【主啊，我要跟隨祢 Lord, I Want To Follow You】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5190 | S3pkoWdwA9M | 【萬國得知祢的救恩 Let the World Know】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5191 | MH4QM21qtXk | 【永遠唱著讚美 Forever Sing Your Praise】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5198 | KCEpDBUm8jM | 【天天讚美 Praise My Lord】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5199 | Jh_rdk3EHLQ | 【緊緊抓住祢 Holding On To You】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5200 | 8hd6ymlcnQI | 【祝你生日快樂 Happy Birthday To You】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5201 | 1mTY9Nl-7u4 | 【最深愛的主 The Love of My Life】官方歌詞版MV (Official Lyrics MV) - 讚美之泉G.L.O.W 系列專輯 (1) | (1) | 成個值淨係括號包住嘅內容(「(1)」),唔係專輯名 |
| 5764 | j69OWSfUlhM | 【I Believe [我相信] 】官方歌詞版MV (Official Lyrics MV) - 讚美之泉敬拜讚美 (24) | https: | URL 碎片(https: 開頭) |
| 6037 | K7jI1PwBruo | 【從早晨到夜晚Morning to Night】現場敬拜MV (Live Worship MV) - 讚美之泉敬拜讚美 (22) | https: | URL 碎片(https: 開頭) |
| 6058 | C3YgMILRUOk | 2017 讚美之泉敬拜讚美專輯(22) 從早晨到夜晚 Morning to Night 宣傳短片 | https: | URL 碎片(https: 開頭) |
| 6082 | uMb1TA5R88E | 【從早晨到夜晚Morning to Night】試聽 - 讚美之泉敬拜讚美 (22) | https: | URL 碎片(https: 開頭) |
| 6254 | imDCRO-kcDk | 2016 讚美之泉敬拜讚美專輯(21) 我要看見 I Want to See 宣傳短片 | https: | URL 碎片(https: 開頭) |
| 6329 | V3-HT9y7Ods | 2015 讚美之泉敬拜讚美專輯(20) 新的事將要成就 Made New 宣傳短片 | https: | URL 碎片(https: 開頭) |
| 6422 | j4Yv_kRFi80 | 2014 讚美之泉敬拜讚美專輯(19) 這裡有榮耀 Glory 宣傳短片 | https: | URL 碎片(https: 開頭) |

## (b) 帶殘留編號(剝走 "(N) " 前綴,album_source 維持 legacy)

| id | youtube_id | title | 而家嘅 album 值 | 改做 |
|---|---|---|---|---|
| 6125 | QcANpXoEbr8 | 【新的一天 A Brand New Day】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (7) 彩虹 | (7) 彩虹 | 彩虹 |
| 6263 | qHKPP6tl7uY | 【彈琴歌唱讚美祢 Praise Him】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6264 | mjYygRc-WHo | 【求主充滿我 Come and Fill Me Up】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6265 | lH4djpGDT3w | 【我們是光明之子 We Are the Children of Light】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6266 | jXQVD7ynsWw | 【爸爸媽媽的愛 The Love of Dad and Mom】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6267 | THjJb92RHh4 | 【進入豐盛 Into His Abundance】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6268 | QTJRkVWMKd8 | 【祢的同在 Your Presence】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6269 | E_Pr9BHYFco | 【親愛的，要記得 My Son, Remember】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6270 | CQ8B9x1pntc | 【有一位神 There Is a God】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6271 | 2snwgN7yYU4 | 【如果你想知道 If You Want to Know】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6272 | i4kDWy3nYq4 | 【喔！十字架 In the Cross】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (3) 有一位神 | (3) 有一位神 | 有一位神 |
| 6273 | RpoHR83Igog | 【在祢寶座前 Before Yout Throne】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6274 | _D5AeBL5-ro | 【寶貴十架 Precious Cross】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6275 | YYVlbgNi-sQ | 【耶穌愛你 Jesus Loves You】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6276 | VynlDDgUdw8 | 【天父的花園 The Father's Garden】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6277 | Oi8yimZtBrw | 【我們愛 We Will Love】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6278 | OIRD05pbWNw | 【認識祢真好 Good to Know You】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6279 | LFVIG_LFhmQ | 【讓讚美飛揚 Let Praise Arise】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6280 | BOgbx4G4t3o | 【看見復興 Until We See You】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6282 | 3WYUNM3FE9M | 【賜福與你 Blessings to You】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (2) 認識祢真好 | (2) 認識祢真好 | 認識祢真好 |
| 6283 | cgCzgu5rY8c | 【最深愛的主 Love of my Life】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6284 | ALaKGrO-laI | 【滿有能力 I Am Strengthened in Him】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6285 | 7-sWACxPoIs | 【雲上太陽 The Sun Above the Clouds】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6286 | lCRiNpruQe0 | 【主的喜樂是我的力量 The Joy of the Lord is My Strength】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6287 | i6-4bsVHvwI | 【讚美之泉 Stream of Praise】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6288 | dsyE7PeVlmw | 【Shaky Shaky Time】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6289 | XhWosWnQ-zI | 【天天讚美 Praise My Lord】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6290 | 06s5SI_ngus | 【我要向高山舉目 Lift My Eyes Up to the Hills】 舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (1) 小小的夢想 | (1) 小小的夢想 | 小小的夢想 |
| 6291 | T3-vhpi7jSI | 【喜樂 & 自由 Joy & Freedom】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (6) 讚美的孩子最喜樂 | (6) 讚美的孩子最喜樂 | 讚美的孩子最喜樂 |
| 6366 | RodBNYQ8rRM | 【歡呼 Shout For Joy】音樂教室 - 讚美之泉兒童敬拜讚美專輯 (5) 新造的人 | (5) 新造的人 | 新造的人 |
| 6425 | mkkb9FilGNY | 【多麼奇妙 Marvelous】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |
| 6427 | jhjDkvbyDe8 | 【把冷漠變成愛 Fill Our Hearts With Love】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |
| 6428 | TDUDmlrKYzc | 【有人在等你 Someone is Waiting】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |
| 6429 | R1ZGOxeMZNM | 【將天敞開 Open Heaven】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |
| 6431 | Mcbxfofcj-Q | 【專心仰望耶穌 Focus On Jesus】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |
| 6433 | 1k_lK9ZFHDw | 【何等有福 How Blessed】舞蹈教室 - 讚美之泉兒童敬拜讚美專輯 (4) 把冷漠變成愛 | (4) 把冷漠變成愛 | 把冷漠變成愛 |

## 冇掂嘅可疑值(grey area,DB 完全未碰,俾人手覆核)

| id | youtube_id | title | 而家嘅 album 值 | 點解冇掂 |
|---|---|---|---|---|
| 366 | xJDiQup3BJ0 | 悅納的時候有情天音樂世界專輯7起來, 與我同去 | －起來 | 開頭係破折號,睇落似 parse 剩底嘅殘留,唔夠肯定 |
| 537 | Xh7kWHwDZ-I | Holy | Consumed | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 598 | JorKkcHLH_A | passion (Speed Up) | passion | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 641 | 8-Gxjtd6Wp4 | Revelation Song - Kari Jobe (Official Live Video) | Kari Jobe | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 1811 | rxafxHHh0VY | 榮耀頌 - 鹹蛋音樂事工SEMM🍳//《道成肉身》 年曆詩歌專輯 1st Track | st Track | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 3254 | PLPEi4XU1-k | 我的心渴想祢 (Soft-Rock Demo) - 【渴想祢】敬拜專輯 - Brenda Li | Brenda Li | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 3256 | RZalOYbv55o | 我的唯一 - Son Music [愛的揀選] 敬拜專輯 －Brenda Li | －Brenda Li | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 3260 | huj1OzUmDio | 唯獨耶穌 (廣東話)－Son Music [愛的揀選] 敬拜專輯 － Brenda Li | － Brenda Li | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 3948 | -6NybfBYZBc | 這地的主 Cover - Milk&Honey // - 我把我所見都拍下來 (God of this City - Chris Tom | Hello Love | 純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯) |
| 6417 | 4dsz2UGMzl0 | 讚美之泉弦樂四重奏專輯 (1) 恩典之路宣傳短片 | (1) 恩典之路宣傳短片 | (N) 編號剝走之後嘅殘留值「恩典之路宣傳短片」本身撞非歌/促銷關鍵字,懷疑成條片根本唔係一首歌 |
