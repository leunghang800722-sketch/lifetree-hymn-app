# backfillAlbumFromXinxinCatalog 報告 —— newheartmusic.org 官網 catalog

> org=新心音樂事工。生成時間:2026-08-11 10:19:54

- 候選 row 總數:448
- match 到單一專輯且已寫(或 --dry 模擬):63
- match 到但撞多隻專輯(衝突,冇寫):61
- match 到但 DB 已有 album(冇覆寫):249
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- catalog 搵唔到:75
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):83.3%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|
| 1923 | NWBgGjC1AI8 | 耶穌已足夠 Jesus is Enough | 耶穌已足夠 | 另一個世界 |
| 3969 | WY1Ff-tMCzA | 美好的時刻 Beautiful Moment | 美好的時刻 | 心的歸屬 |
| 3970 | r5bkyUByXkE | 一齊奔跑 Run | 一齊奔跑 | 牽我的手 |
| 3971 | rVdyaGph_Pc | 分別為聖 Sanctify Me | 分別為聖 | 牽我的手 |
| 3972 | 7pZeg8MZ3rg | 一無牽掛 Do Not Be Anxious | 一無牽掛 | 心的歸屬 |
| 3973 | nUga0oMfCh8 | 心的歸屬 Home Of My Heart | 心的歸屬 | 心的歸屬 |
| 3974 | gpYk4Vu53tY | 唯一的愛慕 One Desire | 唯一的愛慕 | 心的歸屬 |
| 3975 | DAclX6fnSh4 | 等候祢的救恩 Waiting for Your Salvation | Waiting for Your Salvation | 敬拜權能主 |
| 3978 | k1VhjV1xjQs | 平安的盟約 Covenant of Peace | 平安的盟約 | 敬拜權能主 |
| 3979 | NqDoBaYry24 | 宣信 Credo | 宣信 | 敬拜權能主 |
| 3980 | 27j8Hrpq2JM | 我相信祢 I Believe in You | I Believe in You | 敬拜權能主 |
| 3981 | kvkZ7dWe2dY | 詩篇一百零三篇 Psalm 103 | 詩篇一百零三篇 | 敬拜權能主 |
| 3985 | x79THcDSIPY | 詩篇四十二篇 Psalm 42 | 詩篇四十二篇 | 聖潔榮美 |
| 3987 | 72PrdU3I0S8 | 生命烈焰（慢版） Flames of Life (Slow) | 生命烈焰（慢版） | 聖潔榮美 |
| 3988 | J5rVsQkEw7A | 我們要讚美 We Will Praise the Lord | 我們要讚美 | 聖潔榮美 |
| 3994 | yB4FgTJG92A | 我怎麼能不讚美祢? How Could I Not Praise You? | How Could I Not Praise You? | 我定意跟從祢 |
| 3995 | gjQHmRSYxG8 | 耶穌的愛 The Love Of Jesus | 耶穌的愛 | 全靠恩典 |
| 3996 | h6VTL-K6yQM | 思想主的愛 Ponder His Love | 思想主的愛 | 昂然起步 |
| 3998 | 071Zh8BEuIo | 全靠恩典 All By Grace | 全靠恩典 | 全靠恩典 |
| 4003 | wGY3O6YeQbI | 慈愛信實神 Faithful Loving God | 慈愛信實神 | 美好的仗 |
| 4008 | MuGe-gFWt18 | 求差遣我 Send Me | 求差遣我 | 全靠恩典 |
| 4009 | w5t5Ov_il_8 | 浪子 The Prodigal | 浪子 | 無盡感恩 |
| 4010 | iam6x5QSM3s | 頌主恩 Praise His Grace | 頌主恩 | 美好的仗 |
| 4014 | 6hm3jy-cOtI | 從日出之地 From the Rising of the Sun | 從日出之地 | 如鷹展翅 |
| 4015 | 33g8gzPIlP4 | 一齊入到主的聖殿 Come Into His Temple | 一齊入到主的聖殿 | 無盡感恩 |
| 4016 | giQS-QVvrqk | 奇妙創造 Amazing Creation | 奇妙創造 | 美好的仗 |
| 4020 | 79gFQ3DK68A | 天地頌讚 Heaven And Earth | 天地頌讚 | 無盡感恩 |
| 4021 | _LYNKnHBkNU | 快樂來到主面前 Worship Joyfully | 快樂來到主面前 | 登上耶和華的山 |
| 4022 | umMZWL5DFO8 | 我們來讚美耶和華 Let's Praise the Lord | 我們來讚美耶和華 | 敬畏你的榮耀 |
| 4024 | qAs60kVUCDM | 神作王 The Lord Reigns | 神作王 | 如鷹展翅 |
| 4025 | iIrT-7D8Sk8 | 邀請耶穌 Invite Jesus | 邀請耶穌 | 專心愛你 |
| 4026 | A0mJwiIi6sU | 榮耀頌 Gloria | 榮耀頌 | 讓全世界知道 |
| 4030 | _E4drEj_J2w | 我們的神 Our God | 我們的神 | 牽我的手 |
| 4031 | bDvUiNjQaqk | 齊歡唱 Sing Joyfully | 齊歡唱 | 聖潔榮美 |
| 4036 | -6TgFVq-06U | 用心愛你 Love You with All My Heart | 用心愛你 | 竭誠獻上 |
| 4037 | QQeMbilMWY0 | 照常顯大 Be Magnified | 照常顯大 | 主我要信靠你 |
| 4038 | 01ijRJQAFCk | 我要歌唱你的慈愛 Sing Forever | 我要歌唱你的慈愛 | 專心愛你 |
| 4040 | 5Ba264nNEWs | 再遇你 Meet You Again | 再遇你 | 洪流砥柱 |
| 4041 | I2L05ES0J3c | 歡呼的子民 A People of Praise | 歡呼的子民 | 專心愛你 |
| 4042 | CvPq9gWRoQQ | 全靠恩典 All By Grace | 全靠恩典 | 全靠恩典 |
| 4044 | q3L_AkBZuGc | 忠心的僕人Faithful Servant | 忠心的僕人 | 讓全世界知道 |
| 4045 | klW4GqK6fes | 你不離棄 You Will Never Forsake | 你不離棄 | 登上耶和華的山 |
| 4046 | Ta2uPG-bT9Y | 耶和華是我的牧者 The Lord is My Shepherd | 耶和華是我的牧者 | 如鷹展翅 |
| 4047 | rqUTtwI46io | 呼喊！Shout! | 呼喊！ | 主我要信靠你 |
| 4048 | mRhW0s5jq_o | 求此刻靜聽 Help Me To Listen | 求此刻靜聽 | 全靠恩典 |
| 4049 | oswHjqkv-MY | 主的平安 Shalom | 主的平安 | 牽我的手 |
| 4050 | 8e9Fy8Qqsyg | 聖潔榮美 Holy and Beautiful | 聖潔榮美 | 聖潔榮美 |
| 4051 | S0nvpWEX7JY | 你對我的愛 Your Love For Me | 你對我的愛 | 主我要信靠你 |
| 4052 | 2mBUmVAibVY | 一生呈獻 My Offering | 一生呈獻 | 專心愛你 |
| 4053 | FkuUwao9eUw | 石頭必要讚美 The Stones will Cry Out | 石頭必要讚美 | 真愛的代價 |
| 4054 | HVC2vgOmYXM | 財寶 Treasure | 財寶 | 主我要信靠你 |
| 4056 | AOju5Cf3dx8 | 瞻仰你的榮美 Behold Your Beauty | 瞻仰你的榮美 | 讓全世界知道 |
| 4057 | qdsx1U5Qims | 歡唱為耶穌 Singing For Jesus | 歡唱為耶穌 | 登上耶和華的山 |
| 4058 | w-Qug__z6LU | 專心愛你 Undivided Love | 專心愛你 | 專心愛你 |
| 4061 | due9F4D_GGg | 我信不足，求主幫助 Help My Unbelief | 我信不足，求主幫助 | 聖潔榮美 |
| 4063 | b_ayUeM9f7g | 歡呼獻歌韻 A Joyful Shout! | 歡呼獻歌韻 | 洪流砥柱 |
| 4066 | UuMFGRj90XY | 獨白 Soliloquy | 獨白 | 洪流砥柱 |
| 4074 | nHtfYBOzoQI | 讓我們竭力追求 Acknowledge The Lord | 讓我們竭力追求 | 牽我的手 |
| 4075 | F2TBGNbsL_M | 盼望 Hope | 盼望 | 牽我的手 |
| 4076 | 6UsZy35NLEQ | 牽我的手 Hold My Hand | 牽我的手 | 牽我的手 |
| 8626 | -gDRnhMd_-w | 風暴的主宰 Lord of the Storm | 風暴的主宰 | 另一個世界 |
| 8627 | bM4RZKM7iSk | 主！惟有祢主！God and God Alone | God and God Alone | 看哪！你的神 |
| 8628 | Kzc4poOEZ38 | 神哪！我要讚美祢 O God! I Want to Praise You | O God! I Want to Praise You | 看哪！你的神 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 1533 | zBxiy0dgRns | 祢真偉大 How Great Thou Art | How Great Thou Art | 聖詩新唱 / 真愛的代價 |
| 1534 | 4KwlQUA2hN4 | 祢的信實廣大 Great is Thy Faithfulness | Great is Thy Faithfulness | 專心愛你 / 心弦一深長的愛 |
| 1544 | v2CRtiRRLRc | 我要唱耶和華的大慈愛 I Will Sing of the Mercies | 我要唱耶和華的大慈愛 | 專心愛你 / 你是我神 / 燃燒為主 |
| 1626 | da7eHRVPO20 | 主, 我高舉祢的名 Lord, I Lift Your Name on High | Lord, I Lift Your Name on High | 你是我神 / 燃燒為主 |
| 1627 | Wbt1lp7DLmA | 真神之愛 The Love of God | 真神之愛 | 看哪！你的神 / 燃燒為主 |
| 1628 | 3ILXfGarZi4 | 耶穌愛我, 我知道 Jesus Loves Me | 耶穌愛我, 我知道 | 聖詩新唱 / 看哪！你的神 / 燃燒為主 |
| 1827 | xRNFp04ZDVU | 我要唱耶和華的大慈愛 I Will Sing of the Mercies | 我要唱耶和華的大慈愛 | 專心愛你 / 你是我神 / 燃燒為主 |
| 1828 | gGAcs8VLGJk | 聖哉！聖哉！聖哉！ Holy, Holy, Holy | Holy, Holy, Holy | 聖詩新唱 / 你是我神 / 燃燒為主 |
| 1833 | bI16o1ycQCw | 聖哉！聖哉！聖哉！Holy, Holy, Holy | Holy, Holy, Holy | 聖詩新唱 / 你是我神 / 燃燒為主 |
| 1976 | CI3yJderQhA | 成為我異象 Be Thou My Vision | 成為我異象 | 聖詩新唱 / 讓全世界知道 / 無盡感恩 |
| 2204 | NYCC7TNKAOw | 真神之愛 The Love of God | 真神之愛 | 看哪！你的神 / 燃燒為主 |
| 2247 | 04cVvBfKpj8 | 我心頌讚 Praise of my Heart | 我心頌讚 | 真愛的代價 / 燃燒為主 / 心弦一深長的愛 |
| 2282 | DOXokiD-CAk | 成長 Maturity | 成長 | 聖詩新唱 / 主我要信靠你 |
| 2299 | k_ihyWgC-dA | 萬福源頭 Come Thou Fount | 萬福源頭 | 聖詩新唱 / 真愛的代價 / 洪流砥柱 / 心弦一深長的愛 |
| 2316 | A0gN44Ockuk | 倚靠耶和華 Rely on the Lord | 倚靠耶和華 | 今天為主活 / 無盡感恩 |
| 2336 | G2reG3Ttf9o | 萬福源頭 Come Thou Fount | 萬福源頭 | 聖詩新唱 / 真愛的代價 / 洪流砥柱 / 心弦一深長的愛 |
| 2344 | VmQB36LCrJY | 尋著祢 Finding You | Finding You | 今天為主活 / 全靠恩典 |
| 2357 | o5pBdVX8jk8 | 詩篇一百五十篇 Psalm 150 | 詩篇一百五十篇 | 你是我神 / 燃燒為主 |
| 2364 | 58Dy7WtfLl0 | 神, 我屬祢! You are My God | You are My God | 今天為主活 / 你是我神 / 燃燒為主 |
| 2372 | LXOdYM0GwZ8 | 歡呼來歌唱 A Joyful Shout! | 歡呼來歌唱 | 今天為主活 / 專心愛你 |
| 2374 | qm7hM8MXXFg | 讚美! 讚美! Praise Him! Praise Him! | 讚美! 讚美! | 看哪！你的神 / 燃燒為主 |
| 2381 | 7pfbrpU9tAw | 今天為主活 Living For You | 今天為主活 | 今天為主活 / 牽我的手 |
| 3153 | 6_wRG2i4ivI | 仰望神的人 He Who Relies on God | 仰望神的人 | 今天為主活 / 主我要信靠你 |
| 3155 | RBka3PW4td8 | 耶和華果然成就大事 Great Things He Has Done | 耶和華果然成就大事 | 今天為主活 / 讓全世界知道 |
| 3158 | lWanZWq6kMU | 我的神，我的父，我的磐石 My God, My Father, My Rock | 我的神，我的父，我的磐石 | 今天為主活 / 專心愛你 |
| 3161 | PNtBjGyfxBc | 我心頌讚 Praise of my Heart | 我心頌讚 | 真愛的代價 / 燃燒為主 / 心弦一深長的愛 |
| 3167 | XLpKMaqv8ao | 讚美上主 Praise to the Lord, the Almighty | 讚美上主 | 心的歸屬 / 聖詩新唱 |
| 3171 | gvnsG50I6-s | 祂能夠成就 He is Able | 祂能夠成就 | 真愛的代價 / 看哪！你的神 / 燃燒為主 |
| 3198 | DZFn_yG9Kfg | 向神歡呼 Shout for Joy | 向神歡呼 | 真愛的代價 / 洪流砥柱 |
| 3204 | zu22zZqWR_I | 你要等候 Wait on the Lord | 你要等候 | 看哪！你的神 / 心弦一深長的愛 |
| 3470 | usFBxa6VEGI | 成為我異象 Be Thou My Vision | 成為我異象 | 聖詩新唱 / 讓全世界知道 / 無盡感恩 |
| 3484 | LIeUdvVO4t8 | 教會唯一的根基 The Church's One Foundation | 教會唯一的根基 | 聖詩新唱 / 登上耶和華的山 |
| 3487 | W5i0kqqfV14 | 祂能夠成就 He is Able | 祂能夠成就 | 真愛的代價 / 看哪！你的神 / 燃燒為主 |
| 3666 | 4QpBnYlh968 | 我渴慕祢 I Long for You | I Long for You | 看哪！你的神 / 心弦一深長的愛 |
| 3669 | 4_ryBn7rDXU | 詩篇一百五十篇 Psalm 150 | 詩篇一百五十篇 | 你是我神 / 燃燒為主 |
| 3674 | dBjubik_xvI | 詩篇三十二篇 Psalm 32 (粵語) | 詩篇三十二篇 Psalm 32 (粵語) | 看哪！你的神 / 燃燒為主 / 心弦一深長的愛 |
| 3681 | x64jibCHOSI | 竭誠獻上 My Utmost For You | 竭誠獻上 | 今天為主活 / 竭誠獻上 |
| 3690 | sw_grxmo68I | 祢是我神 You Are My God | You Are My God | 今天為主活 / 你是我神 / 燃燒為主 |
| 3695 | dYw7dxE_5no | 破碎 Broken | 破碎 | 今天為主活 / 敬畏你的榮耀 |
| 3711 | 8Sh4HVH5MY4 | 一生在神手中 (2010) My Times Are In Your Hand (2010) | 一生在神手中 (2010) | 登上耶和華的山 / 你是我神 |
| 3846 | DnXxY-_6tVE | 轉回 Return to Your Love | 轉回 | 今天為主活 / 專心愛你 |
| 3853 | B7IVLz6rA4M | 哦，主耶穌祢深長的愛 Deep, Deep Love | Deep, Deep Love | 今天為主活 / 看哪！你的神 / 燃燒為主 / 心弦一深長的愛 |
| 3861 | Mmuf0jSkq2U | 奇妙十架 When I Survey the Wondrous Cross | 奇妙十架 | 聖詩新唱 / 全靠恩典 |
| 3877 | smc3zmPhiGs | 詩篇三十二篇 Psalm 32 | 詩篇三十二篇 | 看哪！你的神 / 燃燒為主 / 心弦一深長的愛 |
| 3920 | nvz6ImmaYUk | 奇妙十架 When I Survey The Wondrous Cross | 奇妙十架 | 聖詩新唱 / 全靠恩典 |
| 3928 | 9-5LyMHDxtM | 無盡感恩 Forever Thanks | 無盡感恩 | 今天為主活 / 無盡感恩 |
| 3943 | pQIxKME_-ac | 與祢同走過 Walking with You | Walking with You | 今天為主活 / 真愛的代價 / 心弦一與你同走過 |
| 3986 | -3VuFTK2arg | 倚靠耶和華 Rely On The Lord | 倚靠耶和華 | 今天為主活 / 無盡感恩 |
| 4032 | 46dG-gMcl7I | 歡呼來歌唱 A Joyful Shout! | 歡呼來歌唱 | 今天為主活 / 專心愛你 |
| 4043 | C-Io9ZHaB7g | 我心頌讚 Praise of My Heart | 我心頌讚 | 真愛的代價 / 燃燒為主 / 心弦一深長的愛 |
| 4055 | B3TC_yI1eYM | 尋著你 Finding You | 尋著你 | 今天為主活 / 全靠恩典 |
| 4059 | 1Xn7XLpxg-g | 今天為主活 Living For You | 今天為主活 | 今天為主活 / 牽我的手 |
| 4060 | ZGy0uEL6QrI | 成長 Maturity | 成長 | 聖詩新唱 / 主我要信靠你 |
| 4062 | Q9GBorVfDNU | 耶和華果然成就大事 Great Things He Has Done | 耶和華果然成就大事 | 今天為主活 / 讓全世界知道 |
| 4064 | kCIbvWm68AM | 仰望神的人 He Who Relies on God | 仰望神的人 | 今天為主活 / 主我要信靠你 |
| 4065 | yx4dsYSVtJ0 | 你是我神 You Are My God | 你是我神 | 今天為主活 / 你是我神 |
| 4067 | wUWAXIToy3c | 與你同走過 Walking with You | 與你同走過 | 今天為主活 / 真愛的代價 / 心弦一與你同走過 |
| 4069 | YGKAdp-i7TE | 我的神, 我的父, 我的磐石 My God, My Father, My Rock | 我的神, 我的父, 我的磐石 | 今天為主活 / 專心愛你 |
| 4070 | oOwAENjQ4xI | 倚靠耶和華 Rely On The Lord | 倚靠耶和華 | 今天為主活 / 無盡感恩 |
| 4072 | v0cS15Xv8_g | 轉回 Return To Your Love | 轉回 | 今天為主活 / 專心愛你 |
| 8631 | VcIMxBy7HAI | 主，我高舉祢的名 Lord, I Lift Your Name On High | Lord, I Lift Your Name On High | 你是我神 / 燃燒為主 |

## catalog 搵唔到嘅清單(頭 200 條,方便人手覆核係咪真係非專輯內容)

| id | youtube_id | title |
|---|---|---|
| 1617 | Ob48FBD40Zw | 頌讚耶穌聖名 All Hail the Power of Jesus’ Name |
| 1914 | iKBO8FHBusg | 祝福與咒詛—詩歌分享 |
| 1921 | j6TQjsWAfPo | 祝福與咒詛 Blessing and Curses |
| 1922 | eBUYFIE2jAo | 耶穌已足夠－詩歌分享 |
| 1931 | eRyJ9EW3ckw | 手 Hand |
| 1941 | NEml279J0vw | 伊甸 Eden |
| 2143 | hIdEIcOl1M4 | 【燃燒為主 Burning for Christ】歌詞版 |
| 2153 | gbYOFuOYJhg | 開展中的神蹟 An Unfolding Miracle |
| 2160 | xJdWH4Tf0eY | 我們的禱告 |
| 2161 | 9HNUeAvSaOQ | 無盡感恩話香港 |
| 2178 | ValclALWwPw | 新加坡義工團隊 |
| 2180 | dzNMLsc3y5I | 精打細算 |
| 2187 | nBFpsHG9PRg | 神的工作 神的供應 |
| 2189 | FNEwHQn0wG8 | 英語事工與JAM |
| 2195 | 4E_UBSfTIo4 | 小巴哈音樂營 |
| 2196 | Jt0EhEOgLek | 音樂學院 |
| 2197 | v6Ybi-6sG_o | 培訓的服事 |
| 2211 | Y5TwdV3gEtQ | 孩童的頌讚 |
| 2212 | _OlMB8uzKYs | 歌者心聲—忠心的服事 |
| 2221 | fA8099NPbyo | 神的話語與詩歌 |
| 2230 | DHTGkwXEOKI | 機緣巧合? (二) |
| 2231 | azBhrTxOXhc | 機緣巧合? (一） |
| 2239 | iuAjHPy601A | 重溫神的作為 |
| 3131 | 2PzUi2PpU-0 | 與你共聚 Let’s Get Together |
| 3133 | u5Hv1mzMtvU | 祢的同在 |
| 3136 | NcxK3IHC3dI | 配受讚美 Worthy of Praise |
| 3141 | rrtGEw_poXM | 神的眼目 God’s Eyes |
| 3148 | dMI4A6uKJxE | 全歸我王 Worthy |
| 3157 | YSG4x0Tnm98 | 我們來讚美耶和華 Let’s Praise the Lord |
| 3159 | YZQJKo7OADc | 齊來高聲唱 Let’s Sing Together |
| 3172 | LJxn4VhXAGA | 歡呼耶穌聖名 All Hail the Power of Jesus’ Name |
| 3183 | kQScva19Sqw | 一生屬於祢 I’m Yours |
| 3190 | wzg2V3E6jAE | 我的產業 My Inheritance ​ |
| 3208 | nrZ1BJuMHVo | 《二十天求復興》默想禱告集 第十九日 |
| 3447 | lURlSJdMs9Y | 《二十天求復興》默想禱告集 第十八日 |
| 3448 | f7uc-bQVH3c | 《二十天求復興》默想禱告集 第十七日 |
| 3450 | YYmqUEgPfBc | 《二十天求復興》默想禱告集 第十五日 |
| 3451 | 6oLyv0FrrGs | 《二十天求復興》默想禱告集 第十四日 |
| 3452 | fWh9NlCIDtw | 《二十天求復興》默想禱告集 第十三日 |
| 3456 | nOLp7Gw0sNo | 《二十天求復興》默想禱告集 第九日 |
| 3457 | I62AENNV5g4 | 《二十天求復興》默想禱告集 第八日 |
| 3458 | IWxPemQaHSE | 《二十天求復興》默想禱告集 第七日 |
| 3459 | aDwtEL_NioI | 《二十天求復興》默想禱告集 第六日 |
| 3461 | 2W7oKGcB3NI | 《二十天求復興》默想禱告集 第四日 |
| 3462 | L2pcnBX7ezw | 《二十天求復興》默想禱告集 第三日 |
| 3463 | jG_6hoUWsEc | 《二十天求復興》默想禱告集 第二日 |
| 3464 | XtXNy_9Xx9A | 《二十天求復興》默想禱告集 第一日 |
| 3491 | CJ0CKx_W7Y4 | 讚美！讚美！Praise Him！ Praise Him！ |
| 3493 | 3CroEK9kSTI | 耶穌的聖名 Holy Name of Jesus ​ |
| 3494 | u2Gk8W_GY0Y | 上帝的恩手 God’s Hand |
| 3658 | BnvuEUMnRwg | 耶和華我的救贖 Yahweh my Salvation ​ |
| 3676 | X7yKhbIS2iE | 神隱藏的道路 God’s Hidden Path |
| 3895 | SROCo70idYc | 《沈思集》：安靜等待 |
| 3902 | c2F0xl1mW_I | Jesus, o que posso oferecer-te? |
| 3909 | ozG_7ll_O0s | 和散那─基督之歌 Hosanna – Hymn of Christ |
| 3918 | oHrdw0mAcPA | 立定志向跟隨耶穌—作者分享 |
| 3933 | pJSm2SqA-Ek | 耶穌我要稱謝祢 Jesus Praise |
| 3934 | dKhU70rRsEs | 主耶穌，我的全部—作者分享 |
| 3942 | 4CkvZmmIXDs | 生命的珍寶—作者分享 |
| 3951 | BuPYmmln2QU | 主，我的神—作者分享 |
| 3957 | n71MQ-ACM0Q | 安靜等待—作者分享 |
| 3959 | gSsbD9QV_4I | 神啊，祢在何處？－大提琴演奏 God, Where are You? - Cello performance |
| 3976 | Nhv_9JkCdtw | 詩篇五十一篇－大提琴演奏 Psalm 51 - Cello performance |
| 3983 | fQN7auUqFV4 | 《沉思集》：來就上主羔羊 |
| 3984 | CgbLM_Ea0lY | 瞻仰祢的榮美－大提琴演奏 Behold Your Beauty - Cello performance |
| 3989 | LBIg1J1jh-8 | 與你同走過－大提琴演奏 Walking with You - Cello performance |
| 3990 | T8c5JmwiJcs | 《沉思集》－ 基督復活！ |
| 3992 | BaQK81zTMmw | 《沉思集》：寶架清影 |
| 3993 | BTq2P-ayZzM | Eu cantarei / We Will Sing - JAM Brazil Concert 2020 (New Heart Music Ministries) |
| 3997 | jvzpmstdhG8 | 主恩廿年─香港站 |
| 3999 | W_jPsBlvEFk | 尊崇我的神－作者分享 |
| 4000 | hgAk7tCeVJc | 滂渤的活水－作者分享 |
| 4002 | za65pjOV6VA | 神在我們之中－作者分享 |
| 4004 | H8boEawnRbk | 心的歸屬－作者分享 |
| 8629 | 8d7_NzVzRfw | 主耶穌，我愛祢 My Jesus, I Love Thee |

(DB 已有 album 冇覆寫嘅 249 首、album_source=manual/legacy 受保護嘅 0 首,唔逐條列,見上面統計數字。)
