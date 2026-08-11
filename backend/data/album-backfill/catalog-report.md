# backfillAlbumFromCatalog 報告 —— Phase B(sop.org catalog)

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 3。org=讚美之泉/讚美之泉兒童/讚美之泉粵語/讚美之泉 Stream Of Praise Music Ministries。生成時間:2026-08-11 10:12:10(--dry,DB 未寫入)

- 候選 row 總數:1399
- match 到單一專輯且已寫(或 --dry 模擬):0
- match 到但撞多隻專輯(衝突,冇寫):170
- match 到但 DB 已有 album(冇覆寫):470
- match 到但 album_source=manual/legacy(受保護,冇覆寫):9
- catalog 搵唔到:750

## 已寫(或 --dry 模擬)清單

| id | youtube_id | title | album |
|---|---|---|---|

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | 撞中嘅專輯 |
|---|---|---|---|
| 33 | b3oivk4W7EY | 有一位神 | 讓讚美飛揚 / 有一位神 |
| 38 | kYHmfN8tXPM | 我要看見 | 我要看見 / 一閃一閃亮晶晶 |
| 40 | V7MIkQD7fvg | 這裡有榮耀 | 這裡有榮耀 / 讚美的孩子最喜樂 |
| 41 | kp0nbIAnhn0 | 我們歡迎君王降臨 | 這裡有榮耀 / 彩虹 |
| 42 | PG_J_0gsMXA | 榮耀大君王 | 新的事將要成就 / High to the Sky |
| 45 | OVUPLFLdmpE | 將天敞開 | 將天敞開 / 把冷漠變成愛 |
| 66 | 61e4JlANH2Q | 雲上太陽 | 全能的創造主 / 小小的夢想 |
| 171 | trgS6ACbTig | 我的生命獻給祢 (粵語版 - 官方譯本) | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 172 | 2vCYXbbq8mw | 我們的神 (粵語版 - 官方允准譯本) | 讚美中信心不斷升起 / 盡情地微笑 |
| 214 | QOJ2WCZY1xc | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 4171 | tQ8416-jL9I | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4172 | jcGEFyU1ng8 | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4230 | nhe98jfgC2g | Stay [停留] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4231 | Tb8NenNEjkU | Mighty [祢愛有能力] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4235 | QmBxI-KK-vc | Stay [停留] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4236 | O4UTnns3fT0 | Mighty [祢愛有能力] | 深愛耶穌 / 唱出耶穌的偉大 |
| 4249 | qAahIVJAcyg | 大聲敬拜 Shout Out Your Praise | 我能給你什麼？ / 耶穌是我最好的朋友 |
| 4255 | 4FOrsKzHJ_I | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4258 | vbkeGAokfxQ | 大聲敬拜 Shout Out Your Praise | 我能給你什麼？ / 耶穌是我最好的朋友 |
| 4263 | rfaj5UUN8o8 | 有你在的地方 Home Is Where You Are | 深愛耶穌 / 耶穌是我最好的朋友 |
| 4266 | cOdOdmjtSlg | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4269 | GUi6uy8uOKM | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 4270 | jemA0jIrp5M | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4288 | BKJ3nJLwNvg | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 4291 | nqXv_-hjols | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 4292 | k_rDziurd9M | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 4914 | l-QB8A5vJbM | 大聲敬拜 Shout Out Your Praise | 我能給你什麼？ / 耶穌是我最好的朋友 |
| 4915 | MN13hDmHs54 | 大聲敬拜 Shout Out Your Praise | 我能給你什麼？ / 耶穌是我最好的朋友 |
| 4924 | v2jhUrdN-dU | 展開清晨的翅膀 Wings of the Dawn | 展開清晨的翅膀 / 只願見祢 |
| 4951 | f6rW1Um5IOQ | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4952 | jQgKhdipEQQ | 是耶穌的名 We Lift Up Your Name (It's Jesus) | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4959 | IGnfJWVKJow | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4960 | hyjcNF1dxzM | 和散那 Hosanna | 恢復敬拜 / 耶穌是我最好的朋友 |
| 4989 | GS0FZHX8BFU | 我相信 [閩南語] I Believe | 似乎在天堂 / 寶貴十架 |
| 4990 | 4g746j4s7Rs | 彩虹下的約定 The Covenant Under the Rainbow | 彩虹下的約定 / 只願見祢 |
| 5032 | fNTutnHAc34 | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 5033 | lSbdu2Bq5Gc | 榮耀榮耀榮耀 Glory, Glory, Glory | 讚美中信心不斷升起 / 盡情地微笑 |
| 5056 | kvrRtRe9AoU | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 5057 | 3QSUYtAcJjk | 在祢沒有難成的事 Nothing Is Impossible | 讚美中信心不斷升起 / 盡情地微笑 |
| 5064 | nzsMY2_td4Y | 我們的神 You Are Our God | 讚美中信心不斷升起 / 盡情地微笑 |
| 5102 | mZtw8-OBbuQ | 耶和華作王 Our God Reigns | 聽見這世代的呼喚 / 盡情地微笑 |
| 5105 | l8QtshEeAmk | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 5114 | 3O9mPEWNgDk | 不動搖的信心 Unshakeable Faith | 聽見這世代的呼喚 / 盡情地微笑 |
| 5137 | YrcWk_8LXlg | 耶和華作王 Our God Reigns | 聽見這世代的呼喚 / 盡情地微笑 |
| 5138 | x5elrTM-t6k | 我的生命獻給祢 I Will Offer You My Life | 聽見這世代的呼喚 / 耶穌是我最好的朋友 |
| 5139 | XUZN4RUpSOk | 盡情地微笑 Smile | 聽見這世代的呼喚 / 盡情地微笑 |
| 5140 | H9OdfU5I9yQ | 不動搖的信心 Unshakeable Faith | 聽見這世代的呼喚 / 盡情地微笑 |
| 5150 | yYlFWW4nhbU | 新的事將要成就 You Do a New Thing [Remix] | 新的事將要成就 / 彩虹 |
| 5153 | YaJ5gof0YNQ | 恩典之路 The Path of Grace | 不要放棄．滿有能力 / 新造的人 |
| 5162 | m5dvHpq5Fg4 | 歌頌 Sing and Praise | 不要放棄．滿有能力 / 新造的人 |
| 5163 | ToAiGNAC0m4 | 祢的愛長闊高深 Your Love Is Deep and Wide | 不要放棄．滿有能力 / 新造的人 |
| 5235 | tCKvXnD4XeY | 認識祢真好 It's Good To Know You | 耶和華祝福滿滿 / 認識祢真好 |
| 5238 | fE0pVMc5kQQ | 全然向祢 All For You | 讓讚美飛揚 / 只願見祢 |
| 5247 | d0WWNpHQe54 | 耶和華祝福滿滿 Jehovah's Blessings Abound | 耶和華祝福滿滿 / 祢是信實的上帝 |
| 5248 | cyo4B6MsK3g | 彩虹下的約定 The Covenant Under the Rainbow | 彩虹下的約定 / 只願見祢 |
| 5259 | sGF7twYuuxM | 彩虹下的約定 The Covenant Under the Rainbow [Pop版] | 彩虹下的約定 / 只願見祢 |
| 5271 | wFfQFp5HhgQ | 光明之子 Children of Light | 讓讚美飛揚 / 差遣我 |
| 5272 | jKrWdZsVQU0 | 愛，我願意 I Receive Your Love | 彩虹下的約定 / 讚美的孩子最喜樂 |
| 5283 | YvETeAd6ctE | 除祢以外 Whom Have I But You | 耶和華祝福滿滿 / 只願見祢 |
| 5294 | ZxFEsYcWgk8 | 平安的七月夜 Peaceful July | 甦醒 / 祢是信實的上帝 |
| 5295 | Wmb_HtayZV4 | 注目看耶穌 Look Upon Jesus | 甦醒 / 把冷漠變成愛 |
| 5296 | U_D3qRW-M9A | 我對祢的愛永不變 My Love for You Will Never Change | 彩虹下的約定 / 彩虹 |
| 5323 | affOVkHjWpA | 我們是光明之子 We Are the Children of Light | 讓讚美飛揚 / 有一位神 |
| 5333 | 4nO8vnxWthI | 馨香晚祭 The Evening Sacrifice | 彩虹下的約定 / 只願見祢 |
| 5345 | 1UO9srprYJc | 我是天父的孩子 I Am A Child Of God | 我在這裡 / 放晴了 |
| 5346 | a2F71ozfUNY | 我是天父的孩子 I Am A Child Of God | 我在這裡 / 放晴了 |
| 5381 | gmDZjQ8JOyU | 我們高舉耶穌的名 Lift Up The Name Of Our King | 我在這裡 / 放晴了 |
| 5382 | ri--and1V8M | 我們高舉耶穌的名 Lift Up The Name Of Our King | 我在這裡 / 放晴了 |
| 5383 | qeWrBRGK_Lg | 當祢走進我們當中 When Your Presence Comes Upon Us | 我在這裡 / 放晴了 |
| 5390 | pk-lzqmiofM | 當祢走進我們當中 When Your Presence Comes Upon Us | 我在這裡 / 放晴了 |
| 5393 | yW323r5pMHs | 把冷漠變成愛 Fill Our Heart With Love | 全新的你 / 把冷漠變成愛 |
| 5405 | OSjjpGHiozM | 耶穌愛你 Jesus Loves You | 全新的你 / 認識祢真好 |
| 5429 | JqTjvgmZHRo | 專心仰望耶穌 Focus on Jesus | 全能的創造主 / 把冷漠變成愛 |
| 5443 | xugw9VE0pjc | 展開清晨的翅膀 Wings of the Dawn | 展開清晨的翅膀 / 只願見祢 |
| 5452 | VG8nE8Ttyrk | 耶穌，我的耶穌 Jesus, My Jesus | 展開清晨的翅膀 / 把冷漠變成愛 |
| 5453 | homljdAOovs | 彈琴歌唱讚美祢 Praise Him | 展開清晨的翅膀 / 有一位神 |
| 5465 | IHuoUm3ihcI | 如果你想知道 If You Want To Know (Where Love is) | 展開清晨的翅膀 / 有一位神 |
| 5466 | AcKMRfsYERY | 展開清晨的翅膀 Wings of the Dawn [Pop版] | 展開清晨的翅膀 / 只願見祢 |
| 5512 | Wi4YiY_Hfcc | 主的恩典乃是一生之久 The Light of Your Grace | 讓愛走動 / 只願見祢 |
| 5522 | glIEsTt2A84 | 讓愛走動 Love Overflows | 讓愛走動 / 把冷漠變成愛 |
| 5537 | 4-uLKCcufRU | 進入豐盛 Into His Abundance | 深觸我心 / 有一位神 |
| 5539 | KLdSuKezMgs | 凡事都能做 All Things are Possible | 深觸我心 / 無止境 |
| 5547 | xZ3-_Tx0Kfg | 求主充滿我 Come and Fill Me Up | 深觸我心 / 有一位神 |
| 5551 | MEHMGqHh9ZY | 主的喜樂是我力量 The Joy of the Lord is My Strength | 深觸我心 / 小小的夢想 |
| 5558 | fgHBHUPiaJI | 一生愛祢 With All My Love | 深觸我心 / 只願見祢 |
| 5560 | AvECAFFJVik | 我的救贖者活著 My Redeemer Lives | 深觸我心 / 只願見祢 |
| 5561 | zb_ykrrL4Ow | 看見復興 Until We See You | 深觸我心 / 認識祢真好 |
| 5575 | tvAe-5WfvYg | 祢的同在 Your Presence | 單單只為祢 / 有一位神 |
| 5587 | xtUZ-f9M-HE | 親近祢 Close To You | 單單只為祢 / 只願見祢 |
| 5598 | Pvt6OLIaM30 | 耶和華是我牧者 Lord, You Are My Shepherd | 單單只為祢 / 認識祢真好 |
| 5609 | 80uNFuY_aL4 | 全然美麗 Beautiful | 似乎在天堂 / 無止境 |
| 5611 | en_VC0q3O8o | 我相信 I Believe | 似乎在天堂 / 寶貴十架 |
| 5621 | UJgHrXiSQfQ | 祢恩典不離開 Your Grace | 似乎在天堂 / 只願見祢 |
| 5632 | CtEmco5_7Ys | 祢的慈愛 Unfailing Love | 似乎在天堂 / 有一位神 / 只願見祢 |
| 5633 | CPryH5-Ud7s | 祢是我的一切 You Are Everything To Me | 似乎在天堂 / 只願見祢 |
| 5655 | FDzO1GOWdoc | 我的聲音帶有能力 My Voice Has Power - SOP NEXT | 從早晨到夜晚 / High to the Sky |
| 5656 | 6UcZ3KEkzY0 | 最深愛的主 The Love of My Life - SOP NEXT | 小小的夢想 / 差遣我 |
| 5750 | F_sbLMN6g2I | 來歡呼來讚美 Let Us Shout | 我相信 / 放晴了 |
| 5756 | QOsfDTYQosk | 十字架 The Cross | 我相信 / 放晴了 |
| 5764 | j69OWSfUlhM | I Believe [我相信] | 我相信 / 無止境 |
| 5767 | CNL-CyDEpPo | 十字架 The Cross | 我相信 / 放晴了 |
| 5768 | i_z3k1g9taU | 大山為我挪開 Mountains Move for Me | 我相信 / 無止境 |
| 5775 | _xJkYVZ50p0 | 大山為我挪開 Mountains Move for Me | 我相信 / 無止境 |
| 5777 | nTYUAqq-72g | I Believe [我相信] | 我相信 / 無止境 |
| 5824 | v5wnpajW6jo | 榮耀的呼召 Glorious Calling | 新的事將要成就 / 彩虹 |
| 5827 | uTGPl8f-reQ | 滿有能力 I Am Strengthened in Him | 不要放棄．滿有能力 / 小小的夢想 |
| 5834 | u2M-zzt1Whc | 何等恩典 How Could It Be | 不要放棄．滿有能力 / 讚美的孩子最喜樂 |
| 5838 | -O0jRF7CQCQ | 最美的禮物 The Most Precious Gift | 不要放棄．滿有能力 / 放晴了 |
| 5839 | MP_0qHJW-Gw | 愛可以再更多一點點 More Love | 愛可以再更多一點點 / 把冷漠變成愛 |
| 5840 | JHniREYlHcE | 耶穌的名 Jesus, Your Name | 愛可以再更多一點點 / 新造的人 |
| 5845 | byWidixIwBE | 神羔羊 Lamb of God | 愛可以再更多一點點 / High to the Sky |
| 5853 | uu44U9z-azg | 相信有愛就有奇蹟 Believe in Love, You Will See Miracles | 相信有愛就有奇蹟 / 新造的人 |
| 5860 | AzPxz-2g94U | 我有喜樂 A Joyful Song | 從心合一 / 讚美的孩子最喜樂 |
| 5861 | YLMK92nrhbw | 新的一天 A Brand New Day | 從心合一 / 彩虹 |
| 5862 | YU0aBuY_L2Q | 齊來讚美 Praise Your Holy Name | 從心合一 / 新造的人 |
| 5863 | UqhiMn-LTxk | 聖靈的江河 Holy Spirit, Come | 從心合一 / 彩虹 |
| 5868 | 3mCWiQGJtYM | 極大的聲音 Praise You With My Everything | 這裡有榮耀 / 無止境 |
| 5926 | D365p9i7T9U | 小小的夢想 Little Dream | 寶貴十架 / 小小的夢想 |
| 5934 | izOAxx2bRIc | 主祢是我力量 You Are My Strength | 寶貴十架 / 讚美的孩子最喜樂 |
| 5935 | OVgfb379eSw | 在祢寶座前 Before Your Throne | 寶貴十架 / 認識祢真好 |
| 5938 | 4gxxSK5uwts | 喔！十字架 In The Cross | 寶貴十架 / 有一位神 |
| 5946 | 0YJZUyVOQVY | 寶貴十架 Precious Cross | 寶貴十架 / 認識祢真好 |
| 5956 | Y3eE_e5rMvc | 祢是配得 (聖哉聖哉全地唱) You Are Worthy | 永遠尊貴 / 相信有愛就有奇蹟 |
| 5966 | u1oZG23ub7E | 耶穌的名 Jesus, Your Name | 愛可以再更多一點點 / 新造的人 |
| 5967 | mm4c1bojIi0 | 神羔羊 Lamb of God | 愛可以再更多一點點 / High to the Sky |
| 6000 | tzf7VCIpnsw | 在這裡 You Are Here | 從早晨到夜晚 / High to the Sky |
| 6010 | xfy_ciLKnlo | 滿有能力 I Am Strengthened In Him | 不要放棄．滿有能力 / 小小的夢想 |
| 6013 | PedRwSvcWRI | 何等恩典 How Could It Be | 不要放棄．滿有能力 / 讚美的孩子最喜樂 |
| 6023 | kpIFVSlC9qI | 我的聲音帶有能力 My Voice Has Power | 從早晨到夜晚 / High to the Sky |
| 6026 | lo-eFsNtW4I | 喜樂河流 River of Joy | 從早晨到夜晚 / 一閃一閃亮晶晶 |
| 6035 | ZzjucjDQQDY | 圍繞我 You Surround Me | 從早晨到夜晚 / 放晴了 |
| 6036 | 7mrMh_2tXCI | 美好的創造 Beautifully Made | 從早晨到夜晚 / 無止境 |
| 6049 | 6astoRRUU5I | 美好的創造 Beautifully Made | 從早晨到夜晚 / 無止境 |
| 6061 | nJBLeMrhu9w | 在這裡 You Are Here | 從早晨到夜晚 / High to the Sky |
| 6075 | cXCSVBN9nS8 | 圍繞我 You Surround Me | 從早晨到夜晚 / 放晴了 |
| 6094 | egRnTHQiZW0 | 喜樂河流 River of Joy | 從早晨到夜晚 / 一閃一閃亮晶晶 |
| 6099 | usHsWo5sY0U | 耶穌我愛祢 Jesus I Love You | 永遠尊貴 / 認識祢真好 |
| 6114 | -wxmIAkXioc | 震動天地 Shake the Heaven and Earth | 永遠尊貴 / 讚美的孩子最喜樂 |
| 6116 | N7ggr892lEk | 祢是配得 You Are Worthy | 永遠尊貴 / 相信有愛就有奇蹟 |
| 6123 | kszbPoctPbo | 新的事將要成就 You Do a New Thing | 新的事將要成就 / 彩虹 |
| 6191 | 8Y6e0xJlROI | 只要有祢在我左右 If My God Is With Me | 新的事將要成就 / 彩虹 |
| 6199 | vjrMTpacP7w | 賜福與你 Blessings of God Be Upon You | 沙漠中的讚美 / 認識祢真好 |
| 6205 | fUijjKO3lYU | 我們愛 (讓世界不一樣) We Will Love (We Can Make a Difference) | 沙漠中的讚美 / 認識祢真好 |
| 6214 | XYTtbthM4KI | 行神蹟的神 God of Miracles | 我要看見 / High to the Sky |
| 6216 | 6wc9xUOO0HU | 這世代要呼求祢 Here We Stand | 我要看見 / 無止境 |
| 6223 | 1VOBEx3m7Ro | 我要看見 I Want to See | 我要看見 / 一閃一閃亮晶晶 |
| 6247 | lZ-s10eaSug | 這世代要呼求祢 Here We Stand | 我要看見 / 無止境 |
| 6251 | b01SqJBHEjM | 行神蹟的神 God of Miracles | 我要看見 / High to the Sky |
| 6301 | hNO5l4mjDHc | 敬拜讓世界震動 With Our Praises Shake the World | 新的事將要成就 / 一閃一閃亮晶晶 |
| 6303 | WQtpV632qyY | 榮耀大君王 Glory to You | 新的事將要成就 / High to the Sky |
| 6326 | XpmU73jYhrE | 只要有祢在我左右 If My God Is with Me | 新的事將要成就 / 彩虹 |
| 6331 | HUBC6SN5BXw | 新的事將要成就 You Do a New Thing | 新的事將要成就 / 彩虹 |
| 6419 | ADg-yNGjPVA | 極大的聲音 Praise You with My Everything | 這裡有榮耀 / 無止境 |
| 6420 | a5X4uawExEA | 我們歡迎君王降臨 We Long to Meet | 這裡有榮耀 / 彩虹 |
| 6421 | 61tcxSdsVjw | 這裡有榮耀 Glory | 這裡有榮耀 / 讚美的孩子最喜樂 |
| 6446 | Kt8wU0COPTI | 齊來讚美 Praise Your Holy Name | 從心合一 / 新造的人 |
| 6448 | pLl0rSQ4oR4 | 聖靈的江河 Holy Spirit Come | 從心合一 / 彩虹 |
| 6449 | PrO_sNIJKU4 | 我有喜樂 A Joyful Song | 從心合一 / 讚美的孩子最喜樂 |
| 6454 | te2M8oWej80 | 回家 Coming Home | 從心合一 / 新造的人 |
| 6455 | mPcKQnEQKuQ | 天上的家 My Heavenly Home | 從心合一 / 無止境 |
| 6492 | XvND3uisjho | 我已得自由 I Have Been Set Free | 將天敞開 / 讚美的孩子最喜樂 |
| 6503 | mlSygmrZnok | 耶和華沙龍 Jehovah Shalom | 愛可以再更多一點點 / 新造的人 |
| 6509 | 3zIYhQAs1z8 | 我的家要榮耀主 My House Will Praise You | 愛可以再更多一點點 / 讚美的孩子最喜樂 |
| 6515 | TaHTuEZmQ60 | 日日夜夜 Day and Night | 將天敞開 / 無止境 |
| 6527 | e_efJu4ds2k | 相信有愛就有奇蹟 Believe in Love, You Will See Miracles | 相信有愛就有奇蹟 / 新造的人 |
| 6538 | vAGcc8XE4d0 | 我們愛 | 沙漠中的讚美 / 認識祢真好 |
| 6539 | u2k_zSg2d-Q | 滿有能力 | 不要放棄．滿有能力 / 小小的夢想 |
| 6540 | dgaMBDJSe5A | 何等恩典 | 不要放棄．滿有能力 / 讚美的孩子最喜樂 |
| 6541 | Do7NwFKVpgw | 寶貴十架 | 寶貴十架 / 認識祢真好 |
| 6542 | wh6WwSrlkhw | 恩典之路 | 不要放棄．滿有能力 / 新造的人 |

(catalog 搵唔到嘅 750 首、DB 已有 album 冇覆寫嘅 470 首、
album_source=manual/legacy 受保護嘅 9 首,唔逐條列,見上面統計數字。)
