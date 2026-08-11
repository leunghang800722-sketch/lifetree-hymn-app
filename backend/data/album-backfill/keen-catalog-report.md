# backfillAlbumFromKeenCatalog 報告 —— Phase B(agwmm.org 官網 catalog)

> org=基恩敬拜/基恩敬拜祈禱仔。生成時間:2026-08-11 10:17:42

- 候選 row 總數:349
- match 到單一專輯且已寫(或 --dry 模擬):19
- match 到但撞多隻專輯(衝突,冇寫):133
- match 到但 DB 已有 album(冇覆寫):111
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- catalog 搵唔到:86
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):75.4%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|
| 4685 | tKOHuPXTV5g | 《歡迎你》Welcome-祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 歡迎你 | 祈禱仔唱詩歌 6 |
| 4686 | BWTk8FJ6FNg | 《禱告得力》Prayer For Strength-祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 禱告得力 | 祈禱仔唱詩歌 6 |
| 4687 | 7FOrUpFW5VE | 《美麗世界》Beautiful World-祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 美麗世界 | 祈禱仔唱詩歌 6 |
| 4700 | lSFaXJH5B6o | 《尋找耶穌BABY的腳蹤》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 尋找耶穌BABY的腳蹤 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4701 | KEPlkvtS8Vw | 《福音顏色》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 福音顏色 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4702 | 7121ce11rrM | 《奉獻身心》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 奉獻身心 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4703 | axKhioCZovc | 《主的吩咐》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 主的吩咐 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4704 | G3Dngndd44M | 《迷路小孩》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 迷路小孩 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4705 | 4Ho-efvEIqU | 《天父爸爸》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 天父爸爸 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4706 | lWhpv1bivKQ | 《敬拜讚美歌頌主》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 敬拜讚美歌頌主 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4707 | DqwMqd61Ugk | 《祈禱仔》- 基恩敬拜AGWMM - 祈禱仔兒童敬拜系列 | 祈禱仔 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4708 | 6_vhTVPub7A | 《禱告得力》- 基恩敬拜AGWMM | 禱告得力 | 祈禱仔唱詩歌 6 |
| 4709 | zfmjBaoTIyk | 《祈禱仔》- 基恩敬拜 AGWMM | 祈禱仔 | 祈禱仔尋找耶穌Baby的腳蹤 |
| 4712 | uG-Ic70Vuwg | 美麗世界 - 2017 祈禱仔家庭敬拜日 | 美麗世界 | 祈禱仔唱詩歌 6 |
| 4713 | Uouyp0Wk7cc | 《萬物高歌讚美祢》- 基恩敬拜AGWMM | 萬物高歌讚美祢 | 祈禱仔唱詩歌 5 |
| 4714 | CqK764fZHUQ | 天父必保守你 - 祈禱仔唱詩歌 | 天父必保守你 | 祈禱仔唱詩歌 5 |
| 4715 | UOWltQEZZHc | 美麗世界 - 祈禱仔唱詩歌 | 美麗世界 | 祈禱仔唱詩歌 6 |
| 4716 | IHpU6tQIiNY | 我要做個小天使 - 2017 祈禱仔家庭敬拜日 | 我要做個小天使 | 祈禱仔唱詩歌 6 |
| 4717 | lFNiFbgL87A | 打那美好的仗 - 2017 祈禱仔家庭敬拜日 | 打那美好的仗 | 祈禱仔唱詩歌 5 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 755 | DpLyKZvKwfI | 《應許與我同在》You Promised To Be With Me AGWMM | 應許與我同在 | Live Worship 2025 / 復活的盼望 |
| 4082 | QN1EyTQ5MHk | 《有祢同行》現場版 With You By My Side - Live Worship AGWMM | 有祢同行 | Amazing Piano 1 / 靜默有時 3 / Amazing Guitar 4 / 平安的路 |
| 4086 | WRGv0-qPcTE | 《更新我心》現場版 Renew My Heart - Live Worship AGWMM | 更新我心 | 我們愛因為神先愛 / Amazing Guitar 4 |
| 4093 | lKnNX1Ht04U | 《永恆的主》現場版 Everlasting God - Live Worship AGWMM | 永恆的主 | Amazing Guitar 3 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 4120 | cAOXH9y2rS8 | 《請堅固我》《陪我渡過》(現場版)｜ 禱告更新2025｜AGWMM Official Live | 請堅固我 | 主賜平安 / 靜默有時 / 惟獨祢 / Amazing Worship - Piano 1 / 主賜平安伴奏琴譜合集(PDF) / Amazing Guitar 4 |
| 4121 | To5tVvZf2NA | 《平安的路》Path Of Peace (現場版)｜ 禱告更新2025｜AGWMM Official Live | 平安的路 | Amazing Piano 1 / 靜默有時 3 / Live Worship 2025 / Amazing Guitar 4 / 平安的路 |
| 4122 | DYhHRJo2NY8 | 《放下擔子》Lay Down The Burden (現場版)｜ 禱告更新2025｜AGWMM Official Live | 放下擔子 | Amazing Piano 2 / 主賜平安 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Live Worship 2025 |
| 4129 | m0MPMPJ9cwM | 《普天頌讚》Songs Of Universal Praise (現場版)｜ 禱告更新2025｜AGWMM Official Live | 普天頌讚 | 我們愛因為神先愛 / Live Worship 2025 |
| 4130 | ZhoobG3VhIE | 《應許與我同在》You Promised To Be With Me (現場版)｜ 禱告更新2025｜AGWMM Official Live | 應許與我同在 | Live Worship 2025 / 復活的盼望 |
| 4131 | 0tjSMgvMRTQ | 《賜我力量》Give Me Strength (現場版)｜ 禱告更新2025｜AGWMM Official Live | 賜我力量 | Live Worship 2025 / 平安的路 |
| 4132 | dBAxCnJd4kk | 《晨禱》Morning Prayer (華語版)｜ 禱告更新2025｜AGWMM Official Live | 晨禱 | 晨禱 / 華語詩歌2021 / Live Worship 2025 / Amazing Guitar 4 |
| 4133 | e8Xlbd8ocgc | 《祢是我惟一的倚靠》I Put My Trust In You (現場版)｜ 禱告更新2025｜AGWMM Official Live | 祢是我惟一的倚靠 | Amazing Guitar 3 / 再次站起來 / Live Worship 2025 |
| 4134 | oNrR2b9pMwY | 《恩典的暴風》Grace In The Storm (現場版)｜ 禱告更新2025｜AGWMM Official Live | 恩典的暴風 | Live Worship 2025 / 信心的宣告 |
| 4141 | mya-6hWOw4c | 《給爸爸的信》Letter To My Father (現場版)｜ 禱告更新2025｜AGWMM Official Live | 給爸爸的信 | 我能痊癒 / Live Worship 2025 |
| 4158 | E4d2jRtZbEU | 《慈繩愛索》The Rein Of Love, The Rope Of Grace (現場版)｜ 禱告更新2024｜AGWMM Official Live | 慈繩愛索 | Amazing Piano 2 / 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / Amazing Worship - Piano 1 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 4166 | nh4fwUgBQqk | 《寶貴恩典》Precious Grace Of God (現場版)｜ 禱告更新2024｜AGWMM Official Live | 寶貴恩典 | 靠主愛誇勝 / Amazing Guitar 4 |
| 4168 | t6yH1zT4ir0 | 《親眼看見祢》My Eyes Have Seen You (現場版)｜ 禱告更新2024｜AGWMM Official Live | 親眼看見祢 | Amazing Piano 2 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Live Worship 2011 / Amazing Worship - Piano 1 / Amazing Guitar 4 |
| 4169 | eWVAegybc4A | 《謝謝祢的愛》Thank You For Your Love (現場版)｜ 禱告更新2024｜AGWMM Official Live | 謝謝祢的愛 | 主賜平安 / 靜默有時 3 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Amazing Guitar 4 |
| 4170 | CJguyOs1hbw | 《因為祢先愛我們》As You First Loved Us (現場版)｜ 禱告更新2024｜AGWMM Official Live | 因為祢先愛我們 | Amazing Piano 1 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 4177 | oK9BHbCLpZ4 | 《信心的等待》Wait With Faith (現場版)｜ 禱告更新2024｜AGWMM Official Live | 信心的等待 | Amazing Piano 1 / 繼續向前行 / Amazing Guitar 4 |
| 4204 | bqp4OB6ZxsA | 【聖誕節全新編曲！】《願您平安》May Peace Be With You AGWMM | 願您平安 | Amazing Guitar 2 / 神大愛 / Amazing Worship - Piano 1 / 祈禱仔唱詩歌 3 |
| 4213 | XnTax9GusDs | 《親眼看見祢》 讚美 ＿ 放下擔子音樂佈道會＿ | 親眼看見祢 | Amazing Piano 2 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Live Worship 2011 / Amazing Worship - Piano 1 / Amazing Guitar 4 |
| 4214 | TrWG8DdwBZk | 《良牧》The Good Shepherd (Amazing Grace CHOIR 聯合獻詩) | 良牧 | Amazing Guitar 4 / 信心的宣告 |
| 4688 | MUsQ9pnAyhc | 《八福》（粵語版）The Beatitudes (Cantonese)-祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 八福 | 不要怕 / 祈禱仔唱詩歌 5 |
| 4689 | GF7jVz52x4M | 《耶穌，我愛祢》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 耶穌，我愛祢 | 靜默有時 / 不要怕 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 4690 | oATt2zf54m8 | 《牽引》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 牽引 | Amazing Piano 1 / 主賜平安 / Amazing Guitar 2 / 惟獨祢 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 靜默有時 2 / 主賜平安伴奏琴譜合集(PDF) |
| 4691 | TLgOd22a-XI | 《叫、拍、和》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 叫、拍、和 | 祈禱仔唱詩歌 4 / 放開雙手 |
| 4692 | EdACHJzgbEU | 《主禱文》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 主禱文 | 祈禱仔生活篇 2 / 我們愛因為神先愛 / 不要怕 / 祈禱仔唱詩歌 4 / 靜默有時 2 |
| 4693 | uzIJDteunAA | 《祢的心意》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 祢的心意 | 在祢寶座前 / 祈禱仔唱詩歌 4 |
| 4694 | s_UQn2uVojg | 《親眼看見祢》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 親眼看見祢 | Amazing Piano 2 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Live Worship 2011 / Amazing Worship - Piano 1 / Amazing Guitar 4 |
| 4695 | Lmpz4A6gbS4 | 《一生獻作活祭》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 一生獻作活祭 | 靜默有時 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 放開雙手 |
| 4696 | nhNBV9I-NX0 | 《祢的名在全地何其美》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 祢的名在全地何其美 | 靜默有時 / 永不疲乏 / 祈禱仔唱詩歌 4 |
| 4697 | _3_RD8khbF8 | 《我們要去》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 我們要去 | 繼續向前行 / 祈禱仔唱詩歌 4 / Live Worship 2011 |
| 4698 | h8jqtmCAMog | 《神的榮耀》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 神的榮耀 | 不要怕 / 祈禱仔唱詩歌 4 |
| 4699 | ZN0rbVFd31w | 《高聲頌揚》- 祈禱仔兒童敬拜系列 基恩敬拜AGWMM | 高聲頌揚 | 神大愛 / 祈禱仔唱詩歌 4 |
| 4710 | JtOUk0XtPfM | 一生獻作活祭 - 2017 祈禱仔家庭敬拜日 | 一生獻作活祭 | 靜默有時 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 放開雙手 |
| 4711 | J3ER8p8dcTY | 牽引 - 2017 祈禱仔家庭敬拜日 | 牽引 | Amazing Piano 1 / 主賜平安 / Amazing Guitar 2 / 惟獨祢 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 靜默有時 2 / 主賜平安伴奏琴譜合集(PDF) |
| 4718 | mYuYqtcE97I | 讚美聲不停 - 2014 基恩敬拜十周年聚會 | 讚美聲不停 | 我是泥土 / 祈禱仔唱詩歌 3 |
| 4719 | uaa_h6L1p0Y | 願主愛圍繞您 - 2014 祈禱仔家庭敬拜日 | 願主愛圍繞您 | 繼續向前行 / Live Worship 2011 / 祈禱仔唱詩歌 3 |
| 4720 | qSxxYBOh1zM | 數算恩典 - 祈禱仔唱詩歌 | 數算恩典 | 主賜平安 / 在祢寶座前 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 4721 | tbWT5X8ruL8 | 讚美聲不停 - 2013 基恩敬拜禱告更新 | 讚美聲不停 | 我是泥土 / 祈禱仔唱詩歌 3 |
| 4836 | MgEN6brIjng | 《寶貴恩典》Precious Grace Of God AGWMM | 寶貴恩典 | 靠主愛誇勝 / Amazing Guitar 4 |
| 4860 | H2MdsUc1SHE | 恩典的暴風 | 恩典的暴風 | Live Worship 2025 / 信心的宣告 |
| 4862 | WTLfvH1Ckrg | 良牧 | 良牧 | Amazing Guitar 4 / 信心的宣告 |
| 4873 | wCClaSHm29w | 【新年平安版！全新編曲！】《願主愛圍繞您》May God’s Love Enfold You AGWMM | 願主愛圍繞您 | 繼續向前行 / Live Worship 2011 / 祈禱仔唱詩歌 3 |
| 4874 | 5gRiXusLvYs | 《耶和華祢配得稱頌》- 祈禱仔兒童敬拜系列 AGWMM | 耶和華祢配得稱頌 | Amazing Guitar 2 / 不要怕 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 4884 | U0K-lNJGMuA | 主的恩典 | 主的恩典 | 主賜平安 / 靜默有時 / 神大愛 / Amazing Worship - Piano 1 / 主賜平安伴奏琴譜合集(PDF) |
| 4885 | 9jJi9DVbUyA | 《放下擔子》Lay Down The Burden AGWMM | 放下擔子 | Amazing Piano 2 / 主賜平安 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Live Worship 2025 |
| 4886 | wcO7mOlhhNs | 牽引 | 牽引 | Amazing Piano 1 / 主賜平安 / Amazing Guitar 2 / 惟獨祢 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 靜默有時 2 / 主賜平安伴奏琴譜合集(PDF) |
| 4897 | POapTMD_JXo | 華語詩歌《我的泉源在祢裡面》All My Fountains Are In You AGWMM | 我的泉源在祢裡面 | 永不疲乏 / Live Worship 2011 / Amazing Worship - Piano 1 |
| 4905 | f62TNspzyww | 華語詩歌《耶穌是主》Jesus The Saviour AGWMM | 耶穌是主 | 永不疲乏 / Amazing Worship - Piano 1 |
| 4906 | fnKyMGaltus | 華語詩歌《祢的名在全地何其美》How Beautiful Art Thy Name AGWMM | 祢的名在全地何其美 | 靜默有時 / 永不疲乏 / 祈禱仔唱詩歌 4 |
| 4907 | GpjIgFlemok | 華語詩歌《永不疲乏》Never Grew Weary AGWMM | 永不疲乏 | Amazing Guitar 2 / 靜默有時 / 永不疲乏 / Amazing Worship - Piano 1 |
| 4910 | ePHUIMtNO0k | NEW! 全新華語詩歌《晨禱》Morning Prayer AGWMM | 晨禱 | 晨禱 / 華語詩歌2021 / Live Worship 2025 / Amazing Guitar 4 |
| 4921 | nnr5BY1vCew | 華語詩歌《願萬民稱謝祢》Let All The People Praise Thee AGWMM | 願萬民稱謝祢 | 當讚美進入祂的院 / 靜默有時 2 |
| 4922 | lO8q8JMjgxA | 華語詩歌《當讚美進入祂的院》Enter His Courts With Praise AGWMM | 當讚美進入祂的院 | 當讚美進入祂的院 / 靜默有時 2 |
| 4930 | OeweeiOQ69I | 回到家裡 | 回到家裡 | 靜默有時 3 / 回到家裡 |
| 4931 | AgpTmGKMRGc | 必得見光 | 必得見光 | 在祢寶座前 / 靜默有時 2 |
| 4932 | fmLNcCIRaJw | 信心 | 信心 | Live Worship 2011 / 放開雙手 |
| 4934 | L8DVg0nLLq0 | 《來投靠耶穌》Come Seek Refuge In Jesus - AGWMM | 來投靠耶穌 | Amazing Guitar 2 / 在祢寶座前 / 祈禱仔唱詩歌 3 / 靜默有時 2 |
| 4941 | oG1vnVfXU6E | 《陪我渡過》You Were With Me (Amazing Grace CHOIR 聯合獻詩) | 陪我渡過 | Amazing Piano 2 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 4942 | 4TlK4REGxZI | 自由飛翔 | 自由飛翔 | Amazing Piano 1 / 明天祢為我掌舵 |
| 4943 | ZzHrqn6ZOas | 晨禱 | 晨禱 | 晨禱 / 華語詩歌2021 / Live Worship 2025 / Amazing Guitar 4 |
| 4944 | VAGUmX6hEZQ | 《明天祢為我掌舵》You take the helm of my future AGWMM | 明天祢為我掌舵 | Amazing Piano 1 / 明天祢為我掌舵 |
| 4945 | GUc0VtvLC_I | 華語詩歌《晨禱》Morning Prayer AGWMM | 晨禱 | 晨禱 / 華語詩歌2021 / Live Worship 2025 / Amazing Guitar 4 |
| 4946 | TgVLGclmwIg | 《數算恩典》Count Your Blessings AGWMM | 數算恩典 | 主賜平安 / 在祢寶座前 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 4953 | 5ZGPuIeWr34 | 《伴我前行》May You Walk With Me AGWMM | 伴我前行 | 主賜平安 / 神大愛 / 主賜平安伴奏琴譜合集(PDF) |
| 4954 | g0W4TYQX7NM | 《慈繩愛索》The Rein Of Love, The Rope Of Grace AGWMM | 慈繩愛索 | Amazing Piano 2 / 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / Amazing Worship - Piano 1 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 4955 | FdU55Jj_WrA | 從不丟棄我 | 從不丟棄我 | 主賜平安 / 靜默有時 / 我是泥土 / 主賜平安伴奏琴譜合集(PDF) |
| 4956 | IROOfBNdCOE | 《請聽我傾訴》May You Listen To My Prayers AGWMM | 請聽我傾訴 | 主賜平安 / 惟獨祢 / Live Worship 2011 / Amazing Worship - Piano 1 / 主賜平安伴奏琴譜合集(PDF) |
| 4964 | vWXk9c0k8Y4 | 主賜平安 | 主賜平安 | Amazing Piano 1 / 主賜平安 / 主賜平安伴奏琴譜合集(PDF) |
| 4966 | gSzCGmryDW8 | 《靠主愛誇勝》With The Love Of Christ, We Triumph AGWMM | 靠主愛誇勝 | Amazing Piano 1 / 主賜平安 / Amazing Guitar 3 / 靜默有時 3 / 靠主愛誇勝 / 主賜平安伴奏琴譜合集(PDF) |
| 4973 | s4fuvnKwnyE | 崇拜歌詞版《彼此相愛》Love One Another AGWMM | 彼此相愛 | 祈禱仔生活篇 2 / 再次站起來 |
| 4975 | dpPgWzmrVp4 | 崇拜歌詞版《願平安充滿你》May Peace Be With You AGWMM | 願平安充滿你 | 靜默有時 3 / 靠主愛誇勝 |
| 4978 | x5PC2zb_kLM | 《謝謝祢的愛》Thank You for Your Love AGWMM | 謝謝祢的愛 | 主賜平安 / 靜默有時 3 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Amazing Guitar 4 |
| 4985 | 28O8_1WTuN8 | 《一生在神手裡》My Life is in Your hand AGWMM | 一生在神手裡 | Amazing Guitar 3 / 回到家裡 |
| 4986 | CK9nJBVjugc | 復興我 | 復興我 | 主賜平安 / 我是泥土 / 主賜平安伴奏琴譜合集(PDF) |
| 4987 | K8RwitB8s5w | 主賜平安 | 主賜平安 | Amazing Piano 1 / 主賜平安 / 主賜平安伴奏琴譜合集(PDF) |
| 4994 | TYUpFlASmes | 崇拜歌詞版《更新我心》Renew My Heart AGWMM | 更新我心 | 我們愛因為神先愛 / Amazing Guitar 4 |
| 4995 | Yd9wqcVacug | 崇拜歌詞版《愛裡沒有懼怕》No Fear In Love (國語詩歌) AGWMM | 愛裡沒有懼怕 | 靜默有時 / 永不疲乏 / Amazing Worship - Piano 1 |
| 4996 | dw3LZf_d1Iw | 崇拜歌詞版《我能痊癒》I Will Be Healed AGWMM | 我能痊癒 | Amazing Guitar 3 / 我能痊癒 |
| 4997 | O9tcXjy4gao | 《神大愛》God's Magnificent Love AGWMM | 神大愛 | 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 5003 | Ru-Hydfc6Dk | 崇拜歌詞版《永恆的主》Everlasting God AGWMM | 永恆的主 | Amazing Guitar 3 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 5005 | Vuc85oVY_rs | 崇拜歌詞版《天父知道》Heavenly Father Knows (國語詩歌) AGWMM | 天父知道 | 當讚美進入祂的院 / 靜默有時 2 |
| 5010 | JOc3Y9GRZZw | 崇拜歌詞版《信心的等待》Wait With Faith AGWMM | 信心的等待 | Amazing Piano 1 / 繼續向前行 / Amazing Guitar 4 |
| 5011 | ucC14tnxbG0 | 崇拜歌詞版《耶穌，我愛祢》Jesus, I Love You (國語詩歌) AGWMM | 耶穌，我愛祢 | 靜默有時 / 不要怕 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 5012 | Mia4RqZmBbQ | 崇拜歌詞版《我得自由》I Have Been Set Free (國語詩歌) AGWMM | 我得自由 | Amazing Guitar 3 / 愛是永不止息 |
| 5013 | i-p7k4HPfRA | 崇拜歌詞版《祢是我惟一的倚靠》I Put My Trust In You AGWMM | 祢是我惟一的倚靠 | Amazing Guitar 3 / 再次站起來 / Live Worship 2025 |
| 5019 | SweaSPtY7Qk | 崇拜歌詞版《我的牧者》The Lord Is My Shepherd (國語詩歌) AGWMM | 我的牧者 | 不要怕 / Amazing Guitar / Amazing Worship - Piano 1 |
| 5020 | 2rC9qErydv0 | 崇拜歌詞版《一心稱謝祢》Praise You With All My Heart (國語詩歌) AGWMM | 一心稱謝祢 | Amazing Guitar 3 / 愛是永不止息 |
| 5021 | NjJSF_sqVC4 | 崇拜歌詞版《相信祢應許》Believe In Your Promise (國語詩歌) AGWMM | 相信祢應許 | Amazing Guitar 3 / 愛是永不止息 |
| 5026 | FU72nStYbfk | 崇拜歌詞版《平安的路》Path Of Peace AGWMM | 平安的路 | Amazing Piano 1 / 靜默有時 3 / Live Worship 2025 / Amazing Guitar 4 / 平安的路 |
| 5027 | m5h5tOaXnz4 | 崇拜歌詞版《有祢同行》With You by my side AGWMM | 有祢同行 | Amazing Piano 1 / 靜默有時 3 / Amazing Guitar 4 / 平安的路 |
| 5053 | bhTftWWTHSA | 《因為祢先愛我們》As You First Loved Us - AGWMM | 因為祢先愛我們 | Amazing Piano 1 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 5071 | XsJSBP_bCnw | 不要怕 | 不要怕 | Amazing Guitar 2 / 靜默有時 / 不要怕 |
| 5075 | yD6UY9eVWj0 | 《相信祢應許》Believe In Your Promise - AGWMM | 相信祢應許 | Amazing Guitar 3 / 愛是永不止息 |
| 5084 | bTXgc8mKvyU | 我信 | 我信 | Amazing Guitar 3 / 我能痊癒 |
| 5085 | GXD2WdTji0Q | 主禱文 | 主禱文 | 祈禱仔生活篇 2 / 我們愛因為神先愛 / 不要怕 / 祈禱仔唱詩歌 4 / 靜默有時 2 |
| 5086 | w8zucHubD9o | 小鳥再飛 | 小鳥再飛 | Amazing Piano 1 / Amazing Guitar 3 / 我能痊癒 |
| 5087 | rvYnI9pYeUE | 我能痊癒 | 我能痊癒 | Amazing Guitar 3 / 我能痊癒 |
| 5094 | 7TVHzX5KvsU | 《給爸爸的信》Letter to my Father - AGWMM | 給爸爸的信 | 我能痊癒 / Live Worship 2025 |
| 5099 | Nmg5Sbg7iXU | 《歌唱耶和華慈愛》Sing of The Lord's unfailing love - AGWMM | 歌唱耶和華慈愛 | 靜默有時 3 / 再次站起來 / 祈禱仔唱詩歌 6 |
| 5106 | C5Lt4OAsUjQ | 求主用我 | 求主用我 | Amazing Piano 1 / 回到家裡 |
| 5108 | 14jogqwJgx4 | 《我得自由》I have been set free - AGWMM | 我得自由 | Amazing Guitar 3 / 愛是永不止息 |
| 5109 | szBB3WqM9x4 | 《我們愛因為神先愛》We love because God first loved us - AGWMM | 我們愛因為神先愛 | Amazing Piano 2 / 我們愛因為神先愛 / 靜默有時 2 / Amazing Guitar 4 |
| 5120 | -1hotIathug | 賜我力量 | 賜我力量 | Live Worship 2025 / 平安的路 |
| 5123 | uE6dQlJVg-w | 《我心切慕祢》My soul longs for You - AGWMM | 我心切慕祢 | Amazing Guitar 2 / 永不疲乏 / Live Worship 2011 / Amazing Worship - Piano 1 |
| 5130 | nXuUEAO8K6A | 《祢是我惟一的倚靠》I put my trust in You - AGWMM | 祢是我惟一的倚靠 | Amazing Guitar 3 / 再次站起來 / Live Worship 2025 |
| 5132 | r6OF36e0-f4 | 《親眼看見祢》My eyes have seen You 詩班版 - AGWMM | 親眼看見祢 | Amazing Piano 2 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Live Worship 2011 / Amazing Worship - Piano 1 / Amazing Guitar 4 |
| 5134 | 6aBGG78osSw | 《恩典窄路》Narrow path of grace - AGWMM | 恩典窄路 | Amazing Piano 1 / Amazing Guitar 3 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 5135 | Z7fi04kByU0 | 永恆的主 - 2018 禱告更新｜詩班獻詩 | 永恆的主 | Amazing Guitar 3 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 5144 | OxF1O_xboSA | 萬國萬民讚美主 - 2018 禱告更新｜詩班獻詩 | 萬國萬民讚美主 | 再次站起來 / 祈禱仔唱詩歌 6 |
| 5148 | Hgy3GDAzYw8 | 陪我渡過 | 陪我渡過 | Amazing Piano 2 / 明天祢為我掌舵 / Amazing Guitar 4 |
| 5157 | gKuhJrUmHe8 | 祢是我的神 - 2017 禱告更新 | 祢是我的神 | 不要怕 / Amazing Worship - Piano 1 |
| 5159 | CcIiTEoL5ew | 神大愛 - 2017 禱告更新 | 神大愛 | 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 5168 | 8s_SWHeHGNw | 一生在神手裡 - 2017 禱告更新 | 一生在神手裡 | Amazing Guitar 3 / 回到家裡 |
| 5169 | DC5m_Cz0WoY | 一生讚美祢 - 2017 禱告更新 | 一生讚美祢 | Amazing Piano 2 / 回到家裡 |
| 5181 | n6aW7FdJ1D8 | 親眼看見祢 - 2016 禱告更新 | 親眼看見祢 | Amazing Piano 2 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Live Worship 2011 / Amazing Worship - Piano 1 / Amazing Guitar 4 |
| 5182 | KNHF89C9C08 | 萬國萬民讚美主 - 2016 禱告更新 | 萬國萬民讚美主 | 再次站起來 / 祈禱仔唱詩歌 6 |
| 5183 | 6xk_o1bsluY | 再次站起來 - 2016 禱告更新 | 再次站起來 | Amazing Piano 2 / Amazing Guitar 3 / 靜默有時 3 / 再次站起來 |
| 5184 | stxT5SoyqM0 | 歌唱耶和華慈愛 - 2016 禱告更新 | 歌唱耶和華慈愛 | 靜默有時 3 / 再次站起來 / 祈禱仔唱詩歌 6 |
| 5192 | Ei2jXaUkmuY | 寶貴恩典 - 2015 禱告更新 | 寶貴恩典 | 靠主愛誇勝 / Amazing Guitar 4 |
| 5195 | -w8j-knBryI | 放下擔子 - 2014 十周年聚會 | 放下擔子 | Amazing Piano 2 / 主賜平安 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Live Worship 2025 |
| 5197 | QsMRxYYdBjI | 謝謝祢的愛 - 2014 禱告更新 | 謝謝祢的愛 | 主賜平安 / 靜默有時 3 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Amazing Guitar 4 |
| 5206 | dFpMtYkMuZk | 牽引 - 2013 禱告更新 | 牽引 | Amazing Piano 1 / 主賜平安 / Amazing Guitar 2 / 惟獨祢 / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 / 靜默有時 2 / 主賜平安伴奏琴譜合集(PDF) |
| 5207 | sReKmU9OjFU | 我的哀哭變為跳舞 - 2013 禱告更新 | 我的哀哭變為跳舞 | Amazing Piano 2 / 當讚美進入祂的院 / 靜默有時 2 |
| 5220 | s184yStxUao | 數算恩典 - 2010 禱告更新 | 數算恩典 | 主賜平安 / 在祢寶座前 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 5221 | gMdeRH4I9EM | 慈繩愛索 - 2010 禱告更新 | 慈繩愛索 | Amazing Piano 2 / 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / Amazing Worship - Piano 1 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 5228 | 4EkD6XgbWh0 | 神大愛 - 2010 禱告更新 | 神大愛 | 主賜平安 / Amazing Guitar 2 / 靜默有時 / 神大愛 / Live Worship 2011 / 祈禱仔唱詩歌 3 / 主賜平安伴奏琴譜合集(PDF) |
| 5229 | UekCLrdeJu4 | 因為祢先愛我們 - 2010 禱告更新 | 因為祢先愛我們 | Amazing Piano 1 / 靜默有時 / 不要怕 / Amazing Guitar / 祈禱仔唱詩歌 4 / Amazing Worship - Piano 1 |
| 5230 | y5h8A5jrqWs | 必得見光 - 2010 禱告更新 | 必得見光 | 在祢寶座前 / 靜默有時 2 |
| 5231 | 2Nkn5GI-hK0 | 不要怕 - 2010 禱告更新 | 不要怕 | Amazing Guitar 2 / 靜默有時 / 不要怕 |
| 8630 | SXAoXasIRQM | 《謝謝祢的愛》現場版 Thank You For Your Love - Live Worship AGWMM | 謝謝祢的愛 | 主賜平安 / 靜默有時 3 / 恩典充滿這地 / 主賜平安伴奏琴譜合集(PDF) / Amazing Guitar 4 |

(catalog 搵唔到嘅 86 首、DB 已有 album 冇覆寫嘅 111 首、
album_source=manual/legacy 受保護嘅 0 首,唔逐條列,見上面統計數字。)
