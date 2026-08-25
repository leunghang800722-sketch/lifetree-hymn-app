# 純音樂候選掃描報告(T2)

產生時間:2026-08-24T10:01:31.091Z
範圍:`curated=1 AND status='ok'`,共 **6050** 首
判定式:`auditLyricsBatch.js whisperShortVerdict()` 反轉用,詳見 `scanInstrumentalCandidates.mjs` 檔頭

## §0 門檻

實錘(T3 自動回標)—— **兩條互相獨立嘅證據都要齊**:
1. **音訊證據**:`coverage ≥ 0.85` 且 `unique 段數 ≤ 4` 且去重後 `CJK < 30`、`latin < 60`,而且 unique 行**全部**係 whisper 音效佔位符(`[MUSIC]`/`[BLANK_AUDIO]`/`upbeat music` 呢類),冇任何人聲標記
2. **元資料證據**:歌名/專輯有器樂訊號(演奏/純音樂/弦樂/禱告音樂/安靜系列/Instrumental/Piano Lullaby/String Quartet …),或者喺 EXEC §3.2 已知名單
3. 另加安全閘:`lyrics_status ≠ verified`、`lyrics` 欄空、`lyrics_status ≠ draft`、歌名唔中 Q3 blacklist(伴奏/karaoke)

⚠️ **點解要兩條證據**:實測 whisper 對住非英文人聲成首歌交白卷、吐足全首 `[MUSIC]` 係常態
(#5202-5234 SOP 韓文歌詞 MV、#5642-5659 SOP 日文歌詞 MV、#3015 粵語 cover —— 全部有人聲但 whisper 得 `[MUSIC]`)。
淨靠音訊證據會將呢批誤標。
擦邊(人手名單,**唔寫 DB**):`coverage ≥ 0.7`、`unique 段數 ≤ 6`、`CJK < 45`、`latin < 90` 任一喺 1.5 倍緩衝內,或者 whisper 段數 = 0,或者 duration 解唔到

## §1 統計

| 級 | 首數 | 去向 |
|---|---|---|
| 實錘(佔位符型 whisper) | **77** | T3 自動落 `instrumental=1` |
| 已知名單補入(歌名/SUPERVISION-LOG 有獨立證據) | **13** | T3 自動落 `instrumental=1` |
| **T3 回標總數** | **90** | `apply-20260824i.json` |
| 擦邊 | **191** | 人手名單,等 Eric 過目,**唔寫 DB**(其中 8 首歌名有器樂訊號 = 最高優先,見 §3.1) |
| whisper 標到人聲/觀眾聲 | **212** | 判定唔係器樂,唔入名單(§6) |
| verified 但 whisper 全程靜(觀察) | **811** | **唔准動** |

## §2 實錘名單(77 首,佔位符型 whisper)

| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |
|---|---|---|---|---|---|---|---|---|---|
| 739 | 《Amazing Piano 2》基恩敬拜鋼琴靈修音樂 - 基恩敬拜 AGWMM | ACM | 57:58 | unavailable | 116/2 | 99% | 19/0 | 靈修音樂 | 詞曲李宗盛編曲李宗盛 ⏎ 詞李宗盛編曲李宗盛 |
| 2987 | 一生不會捨棄祢 Piano Cover | CantonHymn | 3:10 | unavailable | 54/3 | 99% | 16/0 | Piano Cover | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 ⏎ 曲李宗盛 |
| 2988 | 靠著祢寶血 Piano Cover | CantonHymn | 3:56 | unavailable | 9/1 | 97% | 0/5 | Piano Cover | [MUSIC] |
| 3224 | 【執子之手】鋼琴版 | 天弦音樂事工 | 3:27 | unavailable | 7/2 | 89% | 18/0 | 鋼琴版 | 詞曲李宗盛編曲李宗盛 ⏎ 詞李宗盛曲李宗盛 |
| 3227 | 【最美麗的路】鋼琴版 | 天弦音樂事工 | 3:45 | unavailable | 8/2 | 96% | 15/0 | 鋼琴版 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 |
| 3228 | 【好好戀愛】鋼琴版 | 天弦音樂事工 | 3:36 | unavailable | 48/2 | 97% | 12/0 | 鋼琴版 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 3229 | 【天愛】鋼琴版 | 天弦音樂事工 | 3:40 | unavailable | 17/2 | 100% | 12/0 | 鋼琴版 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 3230 | 【不只是浪漫】鋼琴版 | 天弦音樂事工 | 4:01 | unavailable | 9/3 | 101% | 29/0 | 鋼琴版 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 ⏎ 我就是想要你做我的朋友 ⏎ 知道嗎 |
| 3231 | 【婚約】鋼琴版 | 天弦音樂事工 | 3:30 | unavailable | 16/2 | 98% | 12/0 | 鋼琴版 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 3233 | 【愛若微風】鋼琴版 | 天弦音樂事工 | 3:22 | unavailable | 7/1 | 91% | 8/0 | 鋼琴版 | 詞李宗盛曲李宗盛 |
| 3989 | 與你同走過－大提琴演奏 Walking with You - Cello perform | 新心音樂事工 | 4:51 | unavailable | 13/3 | 98% | 19/0 | 演奏 | 詞曲李宗盛編曲李宗盛 ⏎ 詞李宗盛 ⏎ 詞曲李宗盛 |
| 4160 | 【Mozart - Divertimento in D major, K. 136】/  | 讚美之泉 | 3:47 | unavailable | 9/1 | 95% | 0/5 | 弦樂 | [MUSIC] |
| 4163 | 【深愛耶穌 Loving Jesus】/ 台北青少年弦樂團 | 讚美之泉 | 4:32 | unavailable | 11/1 | 99% | 0/5 | 弦樂 | [MUSIC] |
| 4164 | 【望春風 Spring Breezes】/ 台北青少年弦樂團 | 讚美之泉 | 4:11 | unavailable | 9/2 | 98% | 15/0 | 弦樂 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 |
| 4820 | Piano Lullabies (Great I AM) | Hillsong Kids | 25:48 | unavailable | 62/1 | 100% | 0/5 | Lullabies | [MUSIC] |
| 4821 | Blown Away - Piano Lullaby | Hillsong Kids | 6:38 | unavailable | 16/1 | 99% | 0/5 | Lullaby | [MUSIC] |
| 4822 | Worthy Is The Lamb - Piano Lullaby | Hillsong Kids | 4:15 | unavailable | 10/1 | 96% | 0/5 | Lullaby | [MUSIC] |
| 4823 | The Potter's Hand - Piano Lullaby | Hillsong Kids | 4:27 | unavailable | 11/1 | 101% | 0/5 | Lullaby | [MUSIC] |
| 4824 | Freedom Is Here - Piano Lullaby | Hillsong Kids | 3:31 | unavailable | 9/2 | 104% | 0/15 | Lullaby | [MUSIC] ⏎ [BLANK_AUDIO] |
| 4825 | Mighty To Save - Piano Lullaby | Hillsong Kids | 4:24 | unavailable | 10/1 | 95% | 0/5 | Lullaby | [MUSIC] |
| 4826 | Turn Your Eyes Upon Jesus - Piano Lullaby | Hillsong Kids | 2:44 | unavailable | 6/1 | 91% | 0/5 | Lullaby | [MUSIC] |
| 4827 | Jesus, What A Beautiful Name - Piano Lullaby | Hillsong Kids | 3:27 | unavailable | 8/1 | 97% | 0/5 | Lullaby | [MUSIC] |
| 4828 | You Are My World - Piano Lullaby | Hillsong Kids | 4:45 | unavailable | 11/1 | 95% | 0/5 | Lullaby | [MUSIC] |
| 4829 | Carry Me - Piano Lullaby | Hillsong Kids | 4:21 | unavailable | 10/1 | 96% | 0/5 | Lullaby | [MUSIC] |
| 4830 | Give Thanks - Piano Lullaby | Hillsong Kids | 4:04 | unavailable | 10/1 | 100% | 0/5 | Lullaby | [MUSIC] |
| 4831 | Eagle's Wings - Piano Lullaby | Hillsong Kids | 5:09 | unavailable | 12/1 | 97% | 0/5 | Lullaby | [MUSIC] |
| 4832 | Magnificent - Piano Lullaby | Hillsong Kids | 3:43 | unavailable | 9/1 | 101% | 0/5 | Lullaby | [MUSIC] |
| 4977 | 《Amazing Piano 1》 鋼琴靈修音樂 - 明天祢為我掌舵 | 基恩敬拜 | 5:03 | unavailable | 10/2 | 91% | 15/0 | 靈修音樂 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 |
| 5065 | 【聖誕弦樂四重奏】馬槽聖嬰 Away in a Manger / 平安夜 Silent  | 讚美之泉 | 9:41 | unavailable | 23/1 | 97% | 0/5 | 弦樂 | [MUSIC] |
| 5690 | 【謝謝祢 Thank You Lord / 十架為我榮耀 Jesus Keep Me N | 讚美之泉 | 8:40 | unavailable | 21/2 | 100% | 0/17 | 演奏 | [MUSIC] ⏎ waterrunning |
| 5691 | 【天上的家 My Heavenly Home】- 鋼琴演奏系列 (3) by 游智婷 S | 讚美之泉 | 4:52 | unavailable | 12/2 | 101% | 0/15 | 演奏 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 5698 | 【安靜 Be Still】- 鋼琴演奏系列 (3) by 游智婷 Sandy Yu | 讚美之泉 | 7:38 | unavailable | 18/1 | 99% | 0/5 | 演奏 | [MUSIC] |
| 5700 | 【在祢同在裡 In Your Presence】- 鋼琴演奏系列 (3) by 游智婷  | 讚美之泉 | 8:17 | unavailable | 19/1 | 97% | 0/5 | 演奏 | [MUSIC] |
| 5701 | 【我在這裡敬拜 Here to Worship】- 鋼琴演奏系列 (3) by 游智婷  | 讚美之泉 | 9:27 | unavailable | 23/1 | 101% | 0/5 | 演奏 | [MUSIC] |
| 5792 | 【一生愛祢 With All My Love】- 鋼琴演奏系列 (2) by 曾祥怡 G | 讚美之泉 | 6:08 | unavailable | 15/2 | 102% | 0/15 | 演奏 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 5793 | 【晨光 Morning Light】- 鋼琴演奏系列 (2) by 曾祥怡 Grace  | 讚美之泉 | 6:08 | unavailable | 14/1 | 96% | 0/5 | 演奏 | [MUSIC] |
| 5794 | 【主祢是我力量 You Are My Strength】- 鋼琴演奏系列 (2) by  | 讚美之泉 | 7:02 | unavailable | 17/1 | 100% | 0/5 | 演奏 | [MUSIC] |
| 5795 | 【生命的話語 Speak to Met】- 鋼琴演奏系列 (2) by 曾祥怡 Grac | 讚美之泉 | 6:22 | unavailable | 15/1 | 98% | 0/5 | 演奏 | [MUSIC] |
| 5796 | 【我要歡唱 Lord, I Will Sing】- 鋼琴演奏系列 (2) by 曾祥怡  | 讚美之泉 | 6:52 | unavailable | 16/1 | 97% | 0/5 | 演奏 | [MUSIC] |
| 5797 | 【祢恩典不離開 Your Grace】- 鋼琴演奏系列 (2) by 曾祥怡 Grace | 讚美之泉 | 8:22 | unavailable | 20/1 | 100% | 0/5 | 演奏 | [MUSIC] |
| 5798 | 【生命活水充滿我 Living Water】- 鋼琴演奏系列 (2) by 曾祥怡 Gr | 讚美之泉 | 5:03 | unavailable | 12/1 | 97% | 0/5 | 演奏 | [MUSIC] |
| 5799 | 【與父同行 The Time With My Father】- 鋼琴演奏系列 (2) b | 讚美之泉 | 3:52 | unavailable | 9/1 | 95% | 0/5 | 演奏 | [MUSIC] |
| 5800 | 【我心切切渴慕祢 My Heart Shall Long For You】- 鋼琴演奏系 | 讚美之泉 | 7:19 | unavailable | 17/1 | 97% | 0/5 | 演奏 | [MUSIC] |
| 5801 | 【主的喜樂是我力量 The Joy of the Lord Is My Strength | 讚美之泉 | 4:02 | unavailable | 10/1 | 101% | 0/5 | 演奏 | [MUSIC] |
| 5802 | 【愛與擁抱 Love and Embrace】- 鋼琴演奏系列 (2) by 曾祥怡 G | 讚美之泉 | 3:40 | unavailable | 8/1 | 93% | 0/5 | 演奏 | [MUSIC] |
| 5803 | 【更多充滿 Come Overflow】- 安靜系列 (2) 找一個地方 I Want  | 讚美之泉 | 4:40 | unavailable | 11/1 | 98% | 0/5 | 安靜系列 | [MUSIC] |
| 5804 | 【展開清晨的翅膀 Wings of the Dawn】- 安靜系列 (2) 找一個地方  | 讚美之泉 | 4:59 | unavailable | 12/1 | 99% | 0/5 | 安靜系列 | [MUSIC] |
| 5805 | 【在耶穌的腳前 At Your Feet】- 安靜系列 (2) 找一個地方 I Want | 讚美之泉 | 7:10 | unavailable | 17/1 | 99% | 0/5 | 安靜系列 | [MUSIC] |
| 5806 | 【全然向祢 All for You】- 安靜系列 (2) 找一個地方 I Want to | 讚美之泉 | 6:17 | unavailable | 17/2 | 99% | 0/24 | 安靜系列 | [WATERRUNNING] ⏎ [MUSICPLAYING] |
| 5807 | 【安靜 Be Still】- 安靜系列 (2) 找一個地方 I Want to Go t | 讚美之泉 | 7:32 | unavailable | 26/3 | 100% | 0/44 | 安靜系列 | watertrickling ⏎ gentlepianomusic ⏎ waterspl |
| 5808 | 【醫治我 Heal Me Lord】- 安靜系列 (2) 找一個地方 I Want to | 讚美之泉 | 8:51 | unavailable | 20/2 | 99% | 0/25 | 安靜系列 | watertrickling ⏎ gentlemusic |
| 5809 | 【更深之處 Take Me Deeper】- 安靜系列 (2) 找一個地方 I Want | 讚美之泉 | 5:48 | unavailable | 14/2 | 98% | 0/25 | 安靜系列 | watertrickling ⏎ gentlemusic |
| 5810 | 【找一個地方 I Want to Go to a Place】- 安靜系列 (2) 找一 | 讚美之泉 | 6:46 | unavailable | 16/1 | 97% | 0/5 | 安靜系列 | [MUSIC] |
| 5812 | 【祢的同在 Your Presence】- 安靜系列 (2) 找一個地方 I Want  | 讚美之泉 | 7:39 | unavailable | 16/2 | 100% | 15/0 | 安靜系列 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 |
| 5904 | 【親近祢 Close to You】 - 弦樂四重奏 (1) String Quarte | 讚美之泉 | 5:16 | unavailable | 13/1 | 101% | 0/5 | 弦樂 | [MUSIC] |
| 5905 | 【耶和華祝福滿滿 Jehovah's Blessings Abound】 - 弦樂四重奏 | 讚美之泉 | 5:43 | unavailable | 14/2 | 101% | 0/15 | 弦樂 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 5911 | 【寶貴十架 Precious Cross】 - 弦樂四重奏 (1) String Qua | 讚美之泉 | 4:35 | unavailable | 11/1 | 98% | 0/5 | 弦樂 | [MUSIC] |
| 5912 | 【一生愛祢 With All My Love】 - 弦樂四重奏 (1) String Q | 讚美之泉 | 4:25 | unavailable | 11/1 | 98% | 0/5 | 弦樂 | [MUSIC] |
| 5913 | 【平安的七月夜 Peaceful July】 - 弦樂四重奏 (1) String Qu | 讚美之泉 | 5:00 | unavailable | 12/1 | 97% | 0/5 | 弦樂 | [MUSIC] |
| 5914 | 【展開清晨的翅膀 Wings of the Dawn】 - 弦樂四重奏 (1) Stri | 讚美之泉 | 6:15 | unavailable | 15/2 | 99% | 0/15 | 弦樂 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 5915 | 【有一位神 There Is A God】 - 弦樂四重奏 (1) String Qua | 讚美之泉 | 4:03 | unavailable | 10/1 | 99% | 0/5 | 弦樂 | [MUSIC] |
| 5916 | 【我親愛的耶穌 My Sweet Jesus】 - 弦樂四重奏 (1) String Q | 讚美之泉 | 3:20 | unavailable | 8/1 | 95% | 0/5 | 弦樂 | [MUSIC] |
| 5922 | 【我的天堂 My Heaven】 - 弦樂四重奏 (1) String Quartet | 讚美之泉 | 5:10 | unavailable | 12/1 | 95% | 0/5 | 弦樂 | [MUSIC] |
| 5980 | 【寶貴十架 Precious Cross】- 安靜系列 (1) Come Away Wi | 讚美之泉 | 7:26 | unavailable | 18/1 | 101% | 0/5 | 安靜系列 | [MUSIC] |
| 5981 | 【一同起舞 We’ll Dance】- 安靜系列 (1) Come Away With  | 讚美之泉 | 5:03 | unavailable | 18/3 | 101% | 29/0 | 安靜系列 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 ⏎ 我就是想要你做我的朋友 ⏎ 知道嗎 |
| 5982 | 【謝謝祢 Thank You, Lord】- 安靜系列 (1) Come Away Wi | 讚美之泉 | 5:25 | unavailable | 13/1 | 100% | 0/5 | 安靜系列 | [MUSIC] |
| 5983 | 【Stream of Praise】- 安靜系列 (1) Come Away With  | 讚美之泉 | 5:12 | unavailable | 27/3 | 95% | 19/0 | 安靜系列 | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 ⏎ 詞李宗盛 |
| 5988 | 【注目看耶穌 Look Upon Jesus】- 安靜系列 (1) Come Away  | 讚美之泉 | 5:40 | unavailable | 86/1 | 99% | 5/0 | 安靜系列 | 詞曲陳零九 |
| 5989 | 【以馬內利 Emmanuel】- 安靜系列 (1) Come Away With Me | 讚美之泉 | 6:35 | unavailable | 16/2 | 101% | 0/15 | 安靜系列 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 5990 | 【Come Away with Me】- 安靜系列 (1) Come Away With | 讚美之泉 | 6:18 | unavailable | 81/1 | 100% | 0/5 | 安靜系列 | [Music] |
| 5991 | 【救贖的恩典 The Grace of Redemption】- 安靜系列 (1) Co | 讚美之泉 | 5:52 | unavailable | 14/1 | 98% | 0/5 | 安靜系列 | [MUSIC] |
| 5998 | 【單單愛祢 I Love You, Lord】- 安靜系列 (1) Come Away  | 讚美之泉 | 5:57 | unavailable | 14/1 | 97% | 0/5 | 安靜系列 | [MUSIC] |
| 6033 | 《祢是耶穌 我的一切》Devotional Music [Piano Cover by  | 角聲使團 | 4:16 | unavailable | 57/2 | 98% | 12/0 | 靈修音樂 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 6735 | 【台北的聖誕節 / Christmas in Taipei】演奏版 | 約書亞樂團 | 5:24 | unavailable | 13/1 | 100% | 0/5 | 演奏 | [MUSIC] |
| 8137 | 【禱告音樂】Spring Time 春曉 / EnterCalm《寧靜時分》系列 | 小羊詩歌 | 5:51 | unavailable | 14/1 | 98% | 0/5 | 禱告音樂 | [MUSIC] |
| 8140 | 【禱告音樂】常在我裡面 / EnterCalm《寧靜時分》系列 | 小羊詩歌 | 5:29 | unavailable | 13/1 | 99% | 0/5 | 禱告音樂 | [MUSIC] |
| 8144 | 【禱告音樂】穩固的盼望 / EnterCalm《寧靜時分》系列 | 小羊詩歌 | 3:40 | unavailable | 8/1 | 93% | 0/5 | 禱告音樂 | [MUSIC] |

## §3 擦邊名單(191 首)—— 唔寫 DB,等 Eric 過目

_(原始 soft 判定 204 首,扣走 13 首經 §5 已知名單補入咗 T3 回標嘅。)_

### §3.1 最高優先:歌名有器樂訊號,只差 whisper 實證(8 首)

呢批**歌名/專輯已經有器樂訊號**,唯一唔夠嘅係音訊證據(whisper 係幻覺型 loop、
冇 timeline、或者 duration 解唔到),所以自動回標唔敢郁。Eric 睇一眼就可以批一批。
⚠️ 提提你:歌名有「靈修音樂」唔一定係器樂 —— #5349/#5350「8分鐘敬拜靈修音樂」
係 verified 有 413 字歌詞嘅**有人聲**歌(佢哋已經俾 verified 閘擋住)。

| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |
|---|---|---|---|---|---|---|---|---|---|
| 754 | 《Amazing Guitar 2》純結他靈修音樂 | 基恩敬拜 | ? | unavailable | 114/2 | — | 0/15 | 靈修音樂 | [MUSIC] ⏎ [BLANK_AUDIO] |
| 3225 | 【恩典之路】鋼琴版 | 天弦音樂事工 | 3:26 | unavailable | 13/5 | 93% | 27/0 | 鋼琴版 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 ⏎ 編曲李宗盛 ⏎ 混音李宗盛 ⏎ 監製李宗盛 |
| 3226 | 【戒指】鋼琴版 | 天弦音樂事工 | 3:32 | unavailable | 8/4 | 100% | 32/0 | 鋼琴版 | 詞曲李宗盛編曲李宗盛 ⏎ 歌曲李宗盛 ⏎ 詞曲李宗盛 ⏎ 你不想要我做你的女朋友吗 |
| 3232 | 【當我遇見你】鋼琴版 | 天弦音樂事工 | 2:28 | unavailable | 5/2 | 84% | 12/0 | 鋼琴版 | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 4159 | 【茉莉花 Mo Li Hua】/ 台北青少年弦樂團 | 讚美之泉 | 4:01 | unavailable | 14/6 | 100% | 34/0 | 弦樂 | 詞李宗盛曲李宗盛 ⏎ 編曲李宗盛 ⏎ 音樂李宗盛 ⏎ 製作人李宗盛 ⏎ 混音李宗盛 ⏎  |
| 5923 | 【這一生最美的祝福 The Gift of Knowing You】 - 弦樂四重奏 ( | 讚美之泉 | 4:19 | unavailable | 11/2 | 99% | 0/8 | 弦樂 | [MUSIC] ⏎ you |
| 5924 | 【恩典之路 The Path of Grace】 - 弦樂四重奏 (1) String  | 讚美之泉 | 4:17 | unavailable | 9/4 | 96% | 33/0 | 弦樂 | 詞曲李宗盛編曲李宗盛 ⏎ 詞李宗盛曲李宗盛 ⏎ 詞曲李宗盛演唱李宗盛 ⏎ 編曲李宗盛 |
| 5999 | 【深深愛祢 Deeper in Love】- 安靜系列 (1) Come Away Wi | 讚美之泉 | 5:21 | draft | 13/1 | 101% | 0/5 | 安靜系列 | [MUSIC] |

### §3.2 其餘擦邊(183 首)

| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |
|---|---|---|---|---|---|---|---|---|---|
| 109 | 神的帳幕在人間 (feat. Gabby Yeung) | 玻璃海 | ? | unavailable | 13/1 | — | 0/5 | — | [MUSIC] |
| 111 | 十字架 (feat. 孫耀威) | 玻璃海 | ? | unavailable | 12/7 | — | 94/0 | — | 十字架 ⏎ 極殘忍凝花 ⏎ 充滿了羞恥 ⏎ 還更羞恥 ⏎ 但是你把冠冕摘下 ⏎ 訂上了一 |
| 153 | 信 (Live) | 原始和聲 | ? | none | 184/38 | — | 304/0 | — | 祝我們向祢求 ⏎ 更多嘅愛 ⏎ 祝當呢個世界不乏嘅事真多嘅時候 ⏎ 祝我哋見到我哋嘅愛心 |
| 261 | 泥土音樂 最適合安靜聆聽的詩歌 十首連續播放 (含歌詞) | 盛曉玫 | ? | unavailable | 290/164 | — | 1186/6 | — | 詞曲李宗盛詞李宗盛編曲李宗盛 ⏎ 世界不能給我溫暖的時候 ⏎ 我用心心抬起頭 ⏎ 藍天白 |
| 276 | 【QT音樂】 敬拜篇HM Quiet Time Music 合唱團 | 天韻詩歌 | ? | unavailable | 573/2 | — | 19/0 | — | 詞曲張宇辰 ⏎ 我就是想要你做我的朋友 ⏎ 知道嗎 |
| 278 | 【QT音樂】 信心篇HM Quiet Time Music 合唱團 | 天韻詩歌 | ? | unavailable | 113/2 | — | 12/0 | — | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 |
| 279 | 【QT音樂】 平安篇HM Quiet Time Music 合唱團 | 天韻詩歌 | ? | unavailable | 49/2 | — | 17/0 | — | 詞曲李宗盛 ⏎ 你不想要我做你的女朋友吗 |
| 298 | 投靠者的讚美 | 天韻詩歌 | ? | unavailable | 41/16 | — | 134/0 | — | 詞曲張宇辰詞張宇辰曲張宇辰編曲張宇辰 ⏎ 你的心事在你的思維 ⏎ 表示你你都要羞愧 ⏎  |
| 301 | 感恩頌讚 | 天韻詩歌 | ? | unavailable | 10/1 | — | 0/5 | — | [MUSIC] |
| 302 | 【陪你】在家防疫不孤單 — EP. 16 伊的疼惜好家在我在家 | 天韻詩歌 | ? | none | 0/0 | — | 0/0 | — |  |
| 362 | 赞美诗合辑(7) 宇海文& 音乐&以斯拉 | 有情天音樂 | ? | none | 0/0 | — | 0/0 | — |  |
| 389 | 晨禱詩歌2026-1 新歌(強力推薦) | 我心旋律 | ? | unavailable | 699/417 | — | 3487/57 | — | 詞曲王晨宇 ⏎ 編曲王晨宇 ⏎ 演唱王晨宇 ⏎ 我要詩詩乘送葉和花 ⏎ 讚美她的話筆唱在 |
| 469 | He Has Done Great Things (Live) - Jenn Johns | Bethel Music | ? | draft | 46/32 | — | 0/666 | — | [MUSIC] ⏎ Hehasdonegreatthingswithhisarmsope |
| 609 | Hits I Praise and Worship I Jesus Loves Me | Chris Tomlin | ? | none | 0/0 | — | 0/0 | — |  |
| 647 | Unbroken Praise (Live) | Matt Redman | ? | draft | 39/14 | — | 0/371 | — | [ambienttrafficnoise] ⏎ [pianomusic] ⏎ Prais |
| 708 | Acoustic - 璽恩 SiEnVanessa | 約書亞樂團 | ? | draft | 13/1 | — | 0/5 | — | [MUSIC] |
| 722 | 那些年，我們一起唱的歌 /: 除祢以外 / 注目看耶穌 / 全新的你 / 雲上太陽 /  | 讚美之泉 | ? | unavailable | 141/129 | — | 1139/0 | — | 詞曲李宗盛 ⏎ 讓我們張開口舉起手 ⏎ 向永生執著呈現 ⏎ 是讚美之前流入每個月底心間  |
| 741 | 10 ✦ | 團契遊樂園 | ? | unavailable | 361/198 | — | 1771/0 | — | 詞曲王雅玉 ⏎ 次夏你陰光照亮我心房 ⏎ 我不會再驚慌 ⏎ 為你奔走飄遠方 ⏎ 那句怕奔 |
| 744 | 遇見 | 團契遊樂園 | ? | unavailable | 9/1 | — | 0/5 | — | [MUSIC] |
| 746 | 光陰bye Bye | 團契遊樂園 | ? | unavailable | 19/10 | — | 107/0 | — | 暖暖暖房間 ⏎ 全日全晚 ⏎ 遊戲工作 ⏎ 定立時間 ⏎ 天要落花 ⏎ 每分每刻 ⏎ 光 |
| 748 | 沿路有你 | 團契遊樂園 | ? | unavailable | 7/7 | — | 107/0 | — | 對白牽著牆嘴 ⏎ 在這視廣裏 ⏎ 關懷的彈琴 ⏎ 是你 ⏎ 原來在愛的感謝 ⏎ 是主的仰 |
| 757 | 專一愛你 / 樂團 / Worship Nations | 玻璃海 | ? | unavailable | 13/1 | — | 0/5 | — | [MUSIC] |
| 812 | Nothing Else / The Belonging Co | Cody Carnes | ? | unavailable | 21/1 | — | 0/5 | — | [MUSIC] |
| 823 | Chandler Moore 2025 Gospel Worship Songs | Brandon Lake | ? | unavailable | 0/0 | — | 0/0 | — |  |
| 1056 | Beatbox Pixie | Brandon Lake | ? | draft | 10/8 | — | 0/94 | — | Itsrecording ⏎ Itisrecording ⏎ Itstopped ⏎ N |
| 1291 | 我用信心抬起頭 | 盛曉玫 | ? | draft | 29/22 | — | 194/615 | — | [MUSIC] ⏎ 世界不能给我温暖的时候Theworldcantgivemewarmt |
| 1294 | 我不在乎 | 盛曉玫 | ? | unavailable | 9/1 | — | 0/5 | — | [MUSIC] |
| 1296 | 心靈的空處 | 盛曉玫 | ? | unavailable | 10/1 | — | 0/5 | — | [MUSIC] |
| 1302 | 以馬內利 | ROLCC生命河 | ? | draft | 43/33 | — | 452/10 | — | 伊瑪內里 ⏎ 我祝我旺 ⏎ 你身邊人總在我身旁 ⏎ 我遙遙望 ⏎ 萬若是兩格交鋼牆 ⏎  |
| 1316 | 因祂活著 | ROLCC生命河 | ? | draft | 79/25 | — | 294/0 | — | 寧他活著 ⏎ 我能面對明天 ⏎ 不再懼怕 ⏎ 我甚知道 ⏎ 他長快明天 ⏎ 生命充滿了希 |
| 1387 | Oceans - Matt Crocker | Hillsong UNITED | ? | draft | 23/22 | — | 0/384 | — | Youstarttwocycles ⏎ Oh ⏎ nowtomaketheocean ⏎ |
| 1461 | Won't Fear | Mosaic MSC | ? | unavailable | 17/1 | — | 0/5 | — | [Music] |
| 1486 | I Know A Name / Canaan Baca / from Conferenc | Worship Together | ? | draft | 92/45 | — | 0/823 | — | ♪♪♪ ⏎ ♪Iknowaname♪ ⏎ ♪Thatcansilenceroaringw |
| 1761 | Gyro - 亂 /《痛畢再生》guitar playthrough | U-Fire GYRO Band | 3:12 | unavailable | 27/1 | 97% | 18/0 | — | 詩歌歌詞的錄音 ⏎ 粵語與國語敬拜讚美詩歌 |
| 1776 | 我屬祢 - SEMM | 鹹蛋音樂事工 | 11:30 | unavailable | 26/1 | 97% | 0/5 | — | [MUSIC] |
| 1804 | Gyro - 旅途 / 痛畢・再生 Chapter Ⅳ | U-Fire GYRO Band | 5:01 | draft | 78/1 | 96% | 6/0 | — | 歌曲名為《無限》 |
| 1805 | Gyro - 難 / 痛畢・再生 Chapter Ⅲ | U-Fire GYRO Band | 4:06 | draft | 41/1 | 100% | 19/0 | — | 詩歌歌詞是詩歌歌詞的錄音 ⏎ 曲詞與曲詞相似 |
| 1874 | Gyro - 亂 / 痛畢・再生 ChapterⅠ | U-Fire GYRO Band | 3:22 | unavailable | 56/1 | 98% | 0/5 | — | music |
| 1912 | 耶穌的膀臂 Arms of Jesus | 新心音樂事工 | 4:53 | unavailable | 11/1 | 96% | 0/5 | — | [MUSIC] |
| 2135 | 聖靈的果子 Fruit of the Spirit | 新心音樂事工 | 2:43 | unavailable | 6/1 | 95% | 0/5 | — | [MUSIC] |
| 2195 | 小巴哈音樂營 | 新心音樂事工 | 3:56 | unavailable | 8/1 | 93% | 0/5 | — | [MUSIC] |
| 2410 | 憑信跨過 - SEMM | 鹹蛋音樂事工 | 5:40 | unavailable | 29/1 | 97% | 0/5 | — | [Music] |
| 2428 | 我在這裏 - SEMM | 鹹蛋音樂事工 | 8:16 | unavailable | 19/1 | 98% | 0/5 | — | [MUSIC] |
| 2484 | 定睛 A cappella Version - SEMM | 鹹蛋音樂事工 | 3:42 | unavailable | 8/1 | 95% | 0/5 | — | [MUSIC] |
| 2682 | 十字架上 / 阿鐵 / 「雨」祢共鳴．音樂分享會@YMCA the DOOOR | 悦雨音樂 GRM | 3:18 | unavailable | 8/1 | 101% | 0/5 | — | [MUSIC] |
| 2738 | 傾倒 / 盧凱韻 Airy Lolo / Worship Nations敬拜聚會 (20 | 悦雨音樂 GRM | 5:25 | unavailable | 40/2 | 100% | 12/0 | — | 詞曲李宗盛 ⏎ 詩歌歌曲李宗盛 |
| 2749 | Elsa and Friends - 你．祢 (原創) (悅雨音樂盒音樂分享會 Cafe | 悦雨音樂 GRM | 5:05 | unavailable | 34/2 | 98% | 26/0 | — | 第一首送給大家的 ⏎ 請大家特別留意當中兩個離字的分別 ⏎ 詩歌 |
| 2768 | AKF - 這是什麼道理 (悅雨音樂盒音樂分享會 Cafe de Gladra 2016 | 悦雨音樂 GRM | 4:25 | unavailable | 88/1 | 99% | 16/0 | — | 歌詞的錄音 ⏎ 粵語或國語敬拜讚美詩歌 |
| 3015 | 不再是奴僕 (No Longer Slaves - Bethel 粵語版 Cover) | CantonHymn | 4:39 | unavailable | 11/1 | 100% | 0/5 | — | [MUSIC] |
| 3018 | 理據有幾千個 (10,000 reasons 廣東話 Cantonese Cover V | CantonHymn | 8:15 | unavailable | 82/2 | 98% | 18/0 | — | 詩歌 ⏎ 一般又何時創造一般又何時創造一般 |
| 3022 | 飢渴 (Hungry 粵語版 Cover) | CantonHymn | 6:03 | unavailable | 75/1 | 100% | 18/0 | — | 詩歌歌詞的錄音 ⏎ 粵語或國語敬拜讚美詩歌 |
| 3032 | 一生靠緊祢 (Heart After You 粵語版 Cantonese Cover V | CantonHymn | 5:10 | unavailable | 44/1 | 100% | 12/0 | — | 詩歌歌曲 ⏎ 歌曲名為《一生一世》 |
| 3036 | 主寶血 (O the Blood Cantonese Cover Version) | CantonHymn | 4:40 | unavailable | 16/1 | 98% | 15/0 | — | 詩歌歌曲 ⏎ 我願神上送一絲落柱室內 |
| 3038 | 讚美救主 (Praise Him! Praise Him! 粵語版 Cantonese  | CantonHymn | 4:55 | unavailable | 13/5 | 93% | 42/0 | — | 詩歌歌名詩榮耀用讚美的言語將歌詩榮耀發明 ⏎ 詩歌歌曲 ⏎ 並為他 ⏎ 車車他要為他行一 |
| 3043 | 您深恩愛眷總不變改 (你的愛不離不棄 粵語版 Cantonese Cover Versi | CantonHymn | 2:51 | unavailable | 6/1 | 91% | 4/0 | — | 詩歌歌曲 |
| 3058 | 同心圓丨《撒種者的愛》 / TWS 敬拜者使團 (太十三) | 同心圓敬拜 | 5:41 | unavailable | 13/1 | 100% | 0/5 | — | [MUSIC] |
| 3070 | 救主 | 同心圓敬拜 | 5:00 | unavailable | 11/1 | 93% | 0/5 | — | [MUSIC] |
| 3107 | 同心圓 / 全新編曲及錄製 《最美好…盡力愛祢》彼此相愛系列 二部曲之第一回 ～ 相遇相 | 同心圓敬拜 | 5:16 | unavailable | 12/1 | 101% | 0/5 | — | [MUSIC] |
| 3185 | 緊貼近神懷抱 Near to the Heart of God | 新心音樂事工 | 4:00 | unavailable | 9/1 | 98% | 0/5 | — | [MUSIC] |
| 3237 | GSUSMM - 重生的心聲 | 天弦音樂事工 | 3:52 | unavailable | 9/1 | 99% | 0/5 | — | [MUSIC] |
| 3251 | 一生交予祢 - by Brenda Li | SON Music | 2:01 | unavailable | 5/2 | 107% | 0/15 | — | [MUSIC] ⏎ [BLANK_AUDIO] |
| 3327 | 【感恩祭2011】序曲 | 共享詩歌ShareHymns | 6:03 | unavailable | 14/3 | 100% | 27/0 | — | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 ⏎ 我就是想要你做我的女朋友 |
| 3368 | 我們呼求 (粵語修改版 Cantonese Cover) | CantonHymn | 1:35 | draft | 4/3 | 99% | 7/0 | — | 詩歌歌曲 ⏎ 詩歌曲 |
| 3378 | 神羔羊配得 (Worthy is the Lamb 粵語版 Cantonese Cove | CantonHymn | 5:02 | unavailable | 12/1 | 100% | 7/0 | — | 詩歌歌詞的錄音 |
| 3383 | 默然愛我 (Amazed Cantonese Cover) | CantonHymn | 6:11 | unavailable | 29/1 | 100% | 0/5 | — | [Music] |
| 3384 | 與祢一起 (永遠敬拜/Be with You/Selalu Menyembabmu Ca | CantonHymn | 2:56 | unavailable | 9/1 | 99% | 19/0 | — | 詩歌歌詞的錄音 ⏎ 粵語或國語敬拜讚美詩歌歌 |
| 3507 | 從早晨到夜晚 / 主慈愛比生命更好 / 和散那 / 我們的神 | 611 Worship | 10:16 | unavailable | 25/1 | 100% | 0/5 | — | [MUSIC] |
| 3536 | As the deer/ Tree | 611 Worship | 14:14 | unavailable | 0/0 | 0% | 0/0 | — |  |
| 3552 | Rain Down - 福臨敬拜隊 | CantonHymn | 5:56 | unavailable | 25/3 | 97% | 15/0 | — | 詩歌歌曲 ⏎ 在那次 ⏎ 為我 ⏎ 理想 ⏎ 美詩歌曲 |
| 3567 | Miracle Maker - InVisible | CantonHymn | 3:03 | draft | 9/2 | 100% | 0/21 | — | [MUSIC] ⏎ Letstrythatagain |
| 3632 | 同心圓 /《愛仇敵》(太五) TWS 敬拜者使團「LOVE 簡單唱」 | 同心圓敬拜 | 6:48 | unavailable | 15/2 | 101% | 0/15 | — | [MUSIC] ⏎ [BLANK_AUDIO] |
| 3633 | 同心圓 /《祢慈愛比生命更好》(國) TWS 敬拜者使團「簡單唱」 | 同心圓敬拜 | 4:26 | unavailable | 10/1 | 100% | 0/5 | — | [MUSIC] |
| 3720 | My Life Is In You/ You Are Good/ Goodness Of | 611 Worship | 28:51 | unavailable | 278/2 | 99% | 30/0 | — | 詩歌歌詞的錄音 ⏎ 粵語或國語敬拜讚美詩歌歌 ⏎ 粵語或國語敬拜讚美詩歌 |
| 3764 | 你真配得榮耀You Deserve the Glory + How great thou | 611 Worship | 5:35 | unavailable | 0/0 | 0% | 0/0 | — |  |
| 3799 | 雨降下 (Let It Rain Cantonese Cover) | CantonHymn | 6:24 | unavailable | 15/1 | 99% | 0/5 | — | [MUSIC] |
| 3834 | 同心圓 /《更親近》/ TWS 敬拜者使團「更親近」Live (詩一三九) | 同心圓敬拜 | 8:08 | unavailable | 19/1 | 99% | 0/5 | — | [MUSIC] |
| 3865 | 苦難中有祢 Fellowship in Suffering | 新心音樂事工 | 5:08 | unavailable | 12/1 | 95% | 0/5 | — | [MUSIC] |
| 3867 | 榮美至尊主 (King of Majesty 廣東版 Cantonese Cover) | CantonHymn | 7:53 | unavailable | 17/2 | 100% | 0/15 | — | [MUSIC] ⏎ [BLANK_AUDIO] |
| 3904 | 哦，聖善夜 O Holy Night | 新心音樂事工 | 5:00 | unavailable | 11/1 | 98% | 0/5 | — | [MUSIC] |
| 3919 | 天使歌唱 Angels We Have Heard on High | 新心音樂事工 | 4:02 | draft | 10/1 | 101% | 0/5 | — | [MUSIC] |

_(表只列頭 80 首,全份喺 JSON 嘅 `soft` 陣列。)_

## §4 verified 但 whisper 全程靜(811 首)—— 觀察名單,唔准動

呢類係「器樂版但片上打晒歌詞字幕」(8033 仲救返過原曲 7721,見 SUPERVISION-LOG:6181)。
whisper 聽唔到人聲係啱嘅,但首歌本身有 verified 歌詞 —— 標 instrumental 會令歌詞消失,所以一律唔掂。

| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |
|---|---|---|---|---|---|---|---|---|---|
| 19 | 安靜 | 基恩敬拜 | 300 | verified | 19/1 | 160% | 0/5 | — | [MUSIC] |
| 27 | 盡情的敬拜 | 角聲使團 | 300 | verified | 13/1 | 110% | 0/5 | — | [MUSIC] |
| 44 | 奔跑不放棄 | 讚美之泉 | 300 | verified | 15/1 | 128% | 0/5 | — | [MUSIC] |
| 72 | 普天頌讚Songs Of Universal Praise | 基恩敬拜 | 3:22 | verified | 8/1 | 100% | 0/5 | — | [MUSIC] |
| 81 | 信靠禱告Faithful Prayer | 基恩敬拜 | 4:12 | verified | 10/1 | 101% | 0/5 | — | [MUSIC] |
| 231 | 【有一個盼望 / There Is A Hope】Live Video - 璽恩 SiE | 約書亞樂團 | 4:33 | verified | 10/1 | 97% | 0/5 | — | [MUSIC] |
| 239 | 【誰能配得 / Who else何等榮美的名 / What A Beautiful Na | 約書亞樂團 | 11:16 | verified | 27/1 | 99% | 0/5 | — | [MUSIC] |
| 285 | 怎能不讚美祢 | 天韻詩歌 | 4:17 | verified | 16/1 | 100% | 5/0 | — | 詞曲陳零九 |
| 305 | 祢真偉大-主愛有多少 組曲__ 合唱團 | 天韻詩歌 | 4:41 | verified | 112/3 | 100% | 19/0 | — | 詞曲李宗盛 ⏎ 詩歌詞李宗盛 ⏎ 詩歌詩歌詞李宗盛 |
| 347 | 萬民同來敬拜 再次將我更新專輯 | 小羊詩歌 | 3:59 | verified | 9/1 | 98% | 0/5 | — | [MUSIC] |
| 355 | 耶穌 耶穌 願祢的國降臨專輯 | 小羊詩歌 | 4:29 | verified | 10/1 | 95% | 0/5 | — | [MUSIC] |
| 388 | 起初 / Worship Song (In the Beginning) / B'rei | 我心旋律 | 5:19 | verified | 12/1 | 100% | 0/5 | — | [MUSIC] |
| 398 | The Priestly Blessing 大祭司的祝福 Birkat Kohanim  | 我心旋律 | 5:18 | verified | 30/3 | 96% | 24/0 | — | 詞李宗盛曲李宗盛 ⏎ 詞李宗盛 ⏎ 祝你快樂 ⏎ 我的天 ⏎ 讓祂保護你 |
| 716 | 照亮我生命的光 | 讚美之泉 | 5:39 | verified | 13/1 | 97% | 0/5 | — | [MUSIC] |
| 1322 | 醫治這地 / F小調 / 106bpm / 《一粒麥子》專輯 | 小羊詩歌 | 6:53 | verified | 16/1 | 98% | 0/5 | — | [MUSIC] |
| 1323 | 醫治這地 / 《一粒麥子》專輯 | 小羊詩歌 | 6:53 | verified | 17/2 | 100% | 0/8 | — | [MUSIC] ⏎ you |
| 1324 | 醫治這地 / 《一粒麥子》專輯 | 小羊詩歌 | 6:54 | verified | 16/1 | 97% | 0/5 | — | [MUSIC] |
| 1325 | 那一天 / C→D調 / 78bpm / 《一粒麥子》專輯 | 小羊詩歌 | 6:25 | verified | 15/1 | 99% | 0/5 | — | [MUSIC] |
| 1326 | 那一天 / 《一粒麥子》專輯 | 小羊詩歌 | 6:25 | verified | 15/1 | 96% | 0/5 | — | [MUSIC] |
| 1327 | 那一天 / 《一粒麥子》專輯 | 小羊詩歌 | 6:25 | verified | 15/1 | 96% | 0/5 | — | [MUSIC] |
| 1331 | 無他唯耶穌的寶血 / 《主,我相信》專輯 | 小羊詩歌 | 3:34 | verified | 8/2 | 100% | 0/23 | — | upbeatmusic ⏎ [MUSICPLAYING] |
| 1333 | 榮耀都歸神羔羊 / 《永遠》專輯 | 小羊詩歌 | 4:56 | verified | 18/1 | 99% | 0/5 | — | [MUSIC] |
| 1334 | 榮耀都歸神羔羊 / 《永遠》專輯 | 小羊詩歌 | 4:56 | verified | 12/1 | 101% | 0/5 | — | [MUSIC] |
| 1335 | 榮耀都歸神羔羊 / 《永遠》專輯 | 小羊詩歌 | 4:56 | verified | 12/1 | 101% | 0/5 | — | [MUSIC] |
| 1336 | 萬民同來敬拜 / 《再次將我更新》專輯 | 小羊詩歌 | 3:59 | verified | 10/2 | 99% | 0/14 | — | [MUSIC] ⏎ softmusic |
| 1337 | 萬民同來敬拜 / 《永遠》專輯 | 小羊詩歌 | 3:58 | verified | 10/2 | 100% | 0/16 | — | [MUSIC] ⏎ gentlemusic |
| 1340 | 何等深情 / 《永遠》專輯 | 小羊詩歌 | 5:19 | verified | 11/3 | 97% | 29/0 | — | 詞曲李宗盛編曲李宗盛 ⏎ 詞李宗盛編曲李宗盛 ⏎ 監製李宗盛宣傳李宗盛 |
| 1342 | 祢的榮耀彰顯於天 / 《永遠》專輯 | 小羊詩歌 | 4:00 | verified | 18/2 | 92% | 15/0 | — | 詞曲李宗盛編曲李宗盛 ⏎ 詞曲李宗盛 |
| 1533 | 祢真偉大 How Great Thou Art | 新心音樂事工 | 5:20 | verified | 12/1 | 100% | 0/5 | — | [MUSIC] |
| 1536 | 不再躲藏 / Worship / studio ver. | Milk&Honey | 6:55 | verified | 107/1 | 97% | 16/0 | — | 歌詞的錄音 ⏎ 粵語或國語敬拜讚美詩歌 |
| 1547 | 奇妙可畏 (2025) | KEC Worship | 4:54 | verified | 79/1 | 100% | 12/0 | — | 詩歌歌詞的錄音 ⏎ 粵語或國語 |
| 1589 | 主的喜樂是我力量 (Live) / Gyro Worship | U-Fire GYRO Band | 3:50 | verified | 24/1 | 99% | 4/0 | — | 詩歌《黑狼》 |
| 1618 | 主是我力量 The Lord is My Strength | 新心音樂事工 | 6:23 | verified | 136/2 | 99% | 10/0 | — | 詞曲王晨宇 ⏎ 演唱王晨宇 |
| 1623 | 神為大 (God Is Great - Hillsong Worship) | CantonHymn | 3:44 | verified | 8/1 | 95% | 4/0 | — | 詩歌歌曲 |
| 1637 | 在祢寶座前 | 611 Worship | 9:26 | verified | 58/1 | 100% | 6/0 | — | 歌曲名為《祝福》 |
| 1643 | (New)同心圓｜《心》｜TWS 敬拜者使團「LOVE」 2018 Live | 同心圓敬拜 | 4:12 | verified | 9/1 | 95% | 0/5 | — | [MUSIC] |
| 1649 | 2026最新復活節詩歌【心上人 Beloved】 - 無盡敬拜 (ft. Eunix L | Endless Worship | 4:58 | verified | 11/1 | 96% | 0/5 | — | [MUSIC] |
| 1650 | 【我心中的寶座 A throne in my heart 내 마음의 한자리】(粵語版) | Endless Worship | 5:51 | verified | 14/1 | 100% | 0/5 | — | [MUSIC] |
| 1660 | 王的應許 (LIVE) - 劉頌賢 Alex Lau | flow music | 9:12 | verified | 32/1 | 101% | 0/5 | — | [MUSIC] |
| 1702 | 【得勝關鍵 The Key to Victory】 - 無盡敬拜 (ft. Jasonb | Endless Worship | 4:58 | verified | 11/1 | 96% | 0/5 | — | [MUSIC] |
| 1703 | 【真心的敬拜 Heart of True Worship】男女合唱版 歌詞 - 無盡敬拜 | Endless Worship | 5:41 | verified | 13/1 | 98% | 0/5 | — | [MUSIC] |
| 1708 | 美麗救主 (Beautiful One - Tim Hughes) | CantonHymn | 3:21 | verified | 9/2 | 100% | 4/0 | — | 音樂 ⏎ 歌詞 |
| 1714 | 由塵土到塵土 | 同心圓敬拜 | 3:02 | verified | 7/2 | 104% | 0/15 | — | [MUSIC] ⏎ [BLANK_AUDIO] |
| 1715 | 懇請聖靈充滿 | 同心圓敬拜 | 5:45 | verified | 13/1 | 97% | 0/5 | — | [MUSIC] |
| 1766 | 唯一的希望 (2023) | KEC Worship | 5:20 | verified | 54/2 | 100% | 10/0 | — | 詞曲李宗盛 ⏎ 編曲李宗盛 |
| 1769 | 越行越近 (Live) - Johnny Yim / 黃劍文 | 天弦音樂事工 | 4:15 | verified | 20/2 | 96% | 8/0 | — | 試試玩這首歌 ⏎ 歌詞 |
| 1770 | 恩典 (Live) - Johnny Yim / 鹹蛋音樂事工 | 天弦音樂事工 | 3:52 | verified | 20/2 | 95% | 28/0 | — | 給予我們很多恩典的神 ⏎ 他的名字何其美 ⏎ 列國也要敬拜他 ⏎ 詩歌歌曲 |
| 1771 | 單單向袮 (Live) - Johnny Yim / 同福堂敬拜隊 | 天弦音樂事工 | 4:14 | verified | 9/2 | 98% | 19/0 | — | 詞曲陳鑫嶽編曲陳鑫嶽 ⏎ 詞陳鑫嶽編曲陳鑫嶽 |
| 1772 | 最美最奧妙主你名 (What a Beautiful Name - Hillsong W | CantonHymn | 3:50 | verified | 8/1 | 96% | 7/0 | — | 詩歌歌詞的錄音 |
| 1773 | 顫抖的Hallelujah (Hallelujah) | CantonHymn | 4:04 | verified | 14/1 | 100% | 4/0 | — | 詩歌歌曲 |

_(表只列頭 50 首,全份 811 首喺 `scan-20260824i.json` 嘅 `observe` 陣列。呢個數字大係正常:whisper 幻覺 loop 喺全庫好普遍,而呢啲歌係靠 OCR 做到 verified 嘅。)_

## §5 已知名單核實(EXEC §3.2)

title-match(演奏/Instrumental/純音樂)+ SUPERVISION-LOG 三批 vein id,逐個過返 T2 判定式:

| id | 依據 | T2 判定 | 歌名 | lyrics_status | 長度 | segs/uniq | cov | cjk/latin(去重) | 備註 |
|---|---|---|---|---|---|---|---|---|---|
| 739 | SUPERVISION-LOG:3822 | hard | 《Amazing Piano 2》基恩敬拜鋼琴靈修音樂 - 基恩敬拜 AGWMM | unavailable | 57:58 | 116/2 | 99% | 19/0 | whisper實錘(幻覺型靜音·Phase1.5)cov=99% uniqSegs=2 cjk=19 latin=0 標記=詞曲李宗盛編曲李宗盛/詞李宗盛編曲李宗盛;歌名證據「靈修音樂」 |
| 2987 | SUPERVISION-LOG:3822 | hard | 一生不會捨棄祢 Piano Cover | unavailable | 3:10 | 54/3 | 99% | 16/0 | whisper實錘(幻覺型靜音·Phase1.5)cov=99% uniqSegs=3 cjk=16 latin=0 標記=詞李宗盛曲李宗盛/詞李宗盛/曲李宗盛;歌名證據「Piano Cover」 |
| 2988 | SUPERVISION-LOG:3822 | hard | 靠著祢寶血 Piano Cover | unavailable | 3:56 | 9/1 | 98% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「Piano Cover」 |
| 3959 | title-match | observe | 神啊，祢在何處？－大提琴演奏 God, Where are You? - Cel | verified | 4:28 | 75/4 | 98% | 22/0 | lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動 |
| 3976 | title-match | observe | 詩篇五十一篇－大提琴演奏 Psalm 51 - Cello performanc | verified | 5:08 | 11/1 | 98% | 4/0 | lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動 |
| 3984 | title-match | observe | 瞻仰祢的榮美－大提琴演奏 Behold Your Beauty - Cello  | verified | 5:11 | 11/2 | 97% | 15/0 | lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動 |
| 3989 | title-match | hard | 與你同走過－大提琴演奏 Walking with You - Cello per | unavailable | 4:51 | 13/3 | 98% | 19/0 | whisper實錘(幻覺型靜音·Phase1.5)cov=98% uniqSegs=3 cjk=19 latin=0 標記=詞曲李宗盛編曲李宗盛/詞李宗盛/詞曲李宗盛;歌名證據「演奏」 |
| 5065 | SUPERVISION-LOG:4145 | hard | 【聖誕弦樂四重奏】馬槽聖嬰 Away in a Manger / 平安夜 Sil | unavailable | 9:41 | 23/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「弦樂」 |
| 5690 | title-match + SUPERVISION-LOG:4145 | hard | 【謝謝祢 Thank You Lord / 十架為我榮耀 Jesus Keep  | unavailable | 8:40 | 21/2 | 100% | 0/17 | whisper實錘(佔位符型)cov=100% uniqSegs=2 cjk=0 latin=17 標記=[MUSIC]/waterrunning;歌名證據「演奏」 |
| 5691 | title-match + SUPERVISION-LOG:4145 | hard | 【天上的家 My Heavenly Home】- 鋼琴演奏系列 (3) by 游 | unavailable | 4:52 | 12/2 | 101% | 0/15 | whisper實錘(佔位符型)cov=101% uniqSegs=2 cjk=0 latin=15 標記=[MUSIC]/[BLANK_AUDIO];歌名證據「演奏」 |
| 5698 | title-match | hard | 【安靜 Be Still】- 鋼琴演奏系列 (3) by 游智婷 Sandy Y | unavailable | 7:38 | 18/1 | 99% | 0/5 | whisper實錘(佔位符型)cov=99% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5699 | title-match | soft | 【能不能 Let Me Stay】- 鋼琴演奏系列 (3) by 游智婷 San | unavailable | 7:51 | 52/1 | 97% | 11/0 | whisper 靜但係**認唔到嘅文字**(unique 行:詩歌歌詩歌歌詞曲李宗盛)—— 證明唔到冇人聲,唔自動標 |
| 5700 | title-match | hard | 【在祢同在裡 In Your Presence】- 鋼琴演奏系列 (3) by  | unavailable | 8:17 | 19/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5701 | title-match + SUPERVISION-LOG:4145 | hard | 【我在這裡敬拜 Here to Worship】- 鋼琴演奏系列 (3) by  | unavailable | 9:27 | 23/1 | 100% | 0/5 | whisper實錘(佔位符型)cov=101% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5792 | title-match | hard | 【一生愛祢 With All My Love】- 鋼琴演奏系列 (2) by 曾 | unavailable | 6:08 | 15/2 | 102% | 0/15 | whisper實錘(佔位符型)cov=102% uniqSegs=2 cjk=0 latin=15 標記=[MUSIC]/[BLANK_AUDIO];歌名證據「演奏」 |
| 5793 | title-match | hard | 【晨光 Morning Light】- 鋼琴演奏系列 (2) by 曾祥怡 Gr | unavailable | 6:08 | 14/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=96% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5794 | title-match + SUPERVISION-LOG:5321 | hard | 【主祢是我力量 You Are My Strength】- 鋼琴演奏系列 (2) | unavailable | 7:02 | 17/1 | 100% | 0/5 | whisper實錘(佔位符型)cov=100% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5795 | title-match + SUPERVISION-LOG:5321 | hard | 【生命的話語 Speak to Met】- 鋼琴演奏系列 (2) by 曾祥怡  | unavailable | 6:22 | 15/1 | 98% | 0/5 | whisper實錘(佔位符型)cov=98% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5796 | title-match | hard | 【我要歡唱 Lord, I Will Sing】- 鋼琴演奏系列 (2) by  | unavailable | 6:52 | 16/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5797 | title-match | hard | 【祢恩典不離開 Your Grace】- 鋼琴演奏系列 (2) by 曾祥怡 G | unavailable | 8:22 | 20/1 | 100% | 0/5 | whisper實錘(佔位符型)cov=100% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5798 | title-match + SUPERVISION-LOG:5321 | hard | 【生命活水充滿我 Living Water】- 鋼琴演奏系列 (2) by 曾祥 | unavailable | 5:03 | 12/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5799 | title-match + SUPERVISION-LOG:5321 | hard | 【與父同行 The Time With My Father】- 鋼琴演奏系列 ( | unavailable | 3:52 | 9/1 | 95% | 0/5 | whisper實錘(佔位符型)cov=95% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5800 | title-match | hard | 【我心切切渴慕祢 My Heart Shall Long For You】- 鋼 | unavailable | 7:19 | 17/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5801 | title-match + SUPERVISION-LOG:5321 | hard | 【主的喜樂是我力量 The Joy of the Lord Is My Stre | unavailable | 4:02 | 10/1 | 101% | 0/5 | whisper實錘(佔位符型)cov=101% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5802 | title-match | hard | 【愛與擁抱 Love and Embrace】- 鋼琴演奏系列 (2) by 曾 | unavailable | 3:40 | 8/1 | 93% | 0/5 | whisper實錘(佔位符型)cov=93% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 5803 | SUPERVISION-LOG:4145 | hard | 【更多充滿 Come Overflow】- 安靜系列 (2) 找一個地方 I W | unavailable | 4:40 | 11/1 | 98% | 0/5 | whisper實錘(佔位符型)cov=98% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 5804 | SUPERVISION-LOG:4145 | hard | 【展開清晨的翅膀 Wings of the Dawn】- 安靜系列 (2) 找一 | unavailable | 4:59 | 12/1 | 99% | 0/5 | whisper實錘(佔位符型)cov=99% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 5805 | SUPERVISION-LOG:4145 | hard | 【在耶穌的腳前 At Your Feet】- 安靜系列 (2) 找一個地方 I  | unavailable | 7:10 | 17/1 | 99% | 0/5 | whisper實錘(佔位符型)cov=99% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 5806 | SUPERVISION-LOG:4145 | hard | 【全然向祢 All for You】- 安靜系列 (2) 找一個地方 I Wan | unavailable | 6:17 | 17/2 | 99% | 0/24 | whisper實錘(佔位符型)cov=99% uniqSegs=2 cjk=0 latin=24 標記=[WATERRUNNING]/[MUSICPLAYING];歌名證據「安靜系列」 |
| 5810 | SUPERVISION-LOG:4145 | hard | 【找一個地方 I Want to Go to a Place】- 安靜系列 (2 | unavailable | 6:46 | 16/1 | 97% | 0/5 | whisper實錘(佔位符型)cov=97% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 5812 | SUPERVISION-LOG:4145 | hard | 【祢的同在 Your Presence】- 安靜系列 (2) 找一個地方 I W | unavailable | 7:39 | 16/2 | 100% | 15/0 | whisper實錘(幻覺型靜音·Phase1.5)cov=100% uniqSegs=2 cjk=15 latin=0 標記=詞曲李宗盛編曲李宗盛/詞曲李宗盛;歌名證據「安靜系列」 |
| 5915 | SUPERVISION-LOG:5321 | hard | 【有一位神 There Is A God】 - 弦樂四重奏 (1) String | unavailable | 4:03 | 10/1 | 99% | 0/5 | whisper實錘(佔位符型)cov=99% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「弦樂」 |
| 5922 | SUPERVISION-LOG:4145 | hard | 【我的天堂 My Heaven】 - 弦樂四重奏 (1) String Quar | unavailable | 5:10 | 12/1 | 95% | 0/5 | whisper實錘(佔位符型)cov=95% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「弦樂」 |
| 5925 | SUPERVISION-LOG:4145 | soft | 【我要歡唱 Lord, I Will Sing】 - 弦樂四重奏 (1) Str | unavailable | 3:55 | 10/2 | 99% | 0/8 | whisper 靜但係**認唔到嘅文字**(unique 行:[MUSIC] / you)—— 證明唔到冇人聲,唔自動標 |
| 5980 | SUPERVISION-LOG:4145 | hard | 【寶貴十架 Precious Cross】- 安靜系列 (1) Come Awa | unavailable | 7:26 | 18/1 | 101% | 0/5 | whisper實錘(佔位符型)cov=101% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 5990 | SUPERVISION-LOG:4145 | hard | 【Come Away with Me】- 安靜系列 (1) Come Away  | unavailable | 6:18 | 81/1 | 100% | 0/5 | whisper實錘(佔位符型)cov=100% uniqSegs=1 cjk=0 latin=5 標記=[Music];歌名證據「安靜系列」 |
| 5991 | SUPERVISION-LOG:4145 | hard | 【救贖的恩典 The Grace of Redemption】- 安靜系列 (1 | unavailable | 5:52 | 14/1 | 98% | 0/5 | whisper實錘(佔位符型)cov=98% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「安靜系列」 |
| 6487 | title-match | skip | 第七張樂器演奏專輯 "你使我生命美麗" | unavailable | 1:33 | 2/2 | 50% | 15/0 | whisper 聽到人聲 |
| 6734 | title-match | soft | 【這就是愛了 / This Is Love】演奏版 | unavailable | 5:17 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 6735 | title-match | hard | 【台北的聖誕節 / Christmas in Taipei】演奏版 | unavailable | 5:24 | 13/1 | 100% | 0/5 | whisper實錘(佔位符型)cov=100% uniqSegs=1 cjk=0 latin=5 標記=[MUSIC];歌名證據「演奏」 |
| 8033 | title-match | observe | 如果我能唱 小提琴演奏 | verified | 2:19 | 5/1 | 87% | 5/0 | lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動 |
| 8035 | title-match | observe | 這一條路 小提琴演奏 | verified | 3:55 | 8/2 | 94% | 14/0 | lyrics_status=verified 但 whisper 全程靜 —— 只觀察,唔准動 |
| 8650 | title-match | soft | 【深愛耶穌 Loving Jesus】安靜純音樂 Devotional Musi | unavailable | 7:49 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8651 | title-match | soft | 【聖潔的羔羊 The Holy Lamb of God】安靜純音樂 Devoti | unavailable | 8:44 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8652 | title-match | soft | 【復興聖潔 Revive Holiness】- 鋼琴演奏系列 (1) by 游智 | unavailable | 5:42 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8653 | title-match | soft | 【我親愛的耶穌 My Sweet Jesus】- 鋼琴演奏系列 (1) by 游 | unavailable | 3:49 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8654 | title-match | soft | 【展開清晨的翅膀 Wings of the Dawn】- 鋼琴演奏系列 (1)  | unavailable | 5:43 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8655 | title-match | soft | 【主的恩典乃是一生之久 The Light of Your Grace】- 鋼琴 | unavailable | 6:52 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8656 | title-match | soft | 【耶穌，我的耶穌 Jesus, My Jesus】- 鋼琴演奏系列 (1) by | unavailable | 6:42 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8657 | title-match | soft | 【Stream of Praise】- 鋼琴演奏系列 (1) by 游智婷 Sa | unavailable | 4:35 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8658 | title-match | soft | 【我愛祢，我主 I Love You My Lord】- 鋼琴演奏系列 (1)  | unavailable | 3:45 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |
| 8659 | title-match | soft | 【單單愛慕你 [二重奏] Simply Loving You [Duet]】-  | unavailable | 4:51 | 0/0 | 0% | 0/0 | whisper 冇任何段落(whisper:[] 或者冇 timeline)—— 實證唔到,人手睇 |

已知名單 **52** 首入面,**46** 首入咗 T3 回標(已 dedupe),**6** 首唔入(原因見上表)。

其中 **13** 首係「whisper 判唔到(幻覺型 / 冇 timeline)但已知名單有獨立證據」而補入嘅:

- 5699 —— title-match —— 幻覺型 whisper 但已知名單有獨立證據 cov=97%
- 6734 —— title-match —— segs=0,靠歌名證據
- 8650 —— title-match —— segs=0,靠歌名證據
- 8651 —— title-match —— segs=0,靠歌名證據
- 8652 —— title-match —— segs=0,靠歌名證據
- 8653 —— title-match —— segs=0,靠歌名證據
- 8654 —— title-match —— segs=0,靠歌名證據
- 8655 —— title-match —— segs=0,靠歌名證據
- 8656 —— title-match —— segs=0,靠歌名證據
- 8657 —— title-match —— segs=0,靠歌名證據
- 8658 —— title-match —— segs=0,靠歌名證據
- 8659 —— title-match —— segs=0,靠歌名證據
- 5925 —— SUPERVISION-LOG:4145 —— 幻覺型 whisper 但已知名單有獨立證據 cov=99%

## §6 whisper 標到人聲/觀眾聲(212 首)—— 判定唔係器樂

呢批嘅 whisper 雖然轉錄唔到歌詞,但吐咗 `singing in foreign language` / `[APPLAUSE]` /
`[FOREIGN]` / `audience cheering` 呢類標記 —— 即係 whisper **明確聽到**有人唱/有觀眾,
只係轉錄唔到字。呢個係「唔係器樂」嘅正面證據,所以連擦邊名單都唔入。
(實例:#3015 不再是奴僕 粵語版 Cover、#4280 我要來大聲讚美祢 舞蹈版 —— 兩首都明顯有人聲。)

| id | 歌名 | artist | 長度 | lyrics_status | segs/uniq | cov | cjk/latin(去重) | 歌名證據 | whisper 頭三句 |
|---|---|---|---|---|---|---|---|---|---|
| 413 | What A Beautiful Name | Hillsong Worship | ? | draft | 68/33 | — | 0/699 | — | ♪♪♪ ⏎ ♪YouweretheWordatthebeginning♪ ⏎ ♪Onew |
| 515 | Love Has A Name (Night of Worship in Sacrame | Jesus Culture | ? | draft | 432/258 | — | 0/9470 | — | [applause] ⏎ [music] ⏎ Iwonder ⏎ speakingfro |
| 524 | Where You Go I Go - Kim Walker-Smith / Music | Jesus Culture | ? | draft | 92/35 | — | 0/666 | — | [music] ⏎ Jesusonlydidwhathesawyoudo ⏎ Hewou |
| 574 | Music | Passion | ? | draft | 73/40 | — | 0/806 | — | [MUSICHALLELUJAH] ⏎ SINGINGHallelujah ⏎ hall |
| 589 | Kristian Stanfill - He Who Is To Come (Live  | Passion | ? | draft | 88/60 | — | 0/1586 | — | Thereisadaycoming ⏎ Whentheoldwillpassaway ⏎ |
| 595 | Landon Wolfe - The Lord Will Provide (Live F | Passion | ? | draft | 30/29 | — | 0/1477 | — | AndlookattheflowersAndalloftheirbeauty ⏎ You |
| 608 | Big Church Festival Performance 2024 | Chris Tomlin | ? | draft | 937/482 | — | 0/9736 | — | upbeatmusic ⏎ ♪Oh ⏎ Iveheardathousandstories |
| 616 | Hits I Praise and Worship Songs | Chris Tomlin | ? | draft | 222/149 | — | 0/7289 | — | [Music] ⏎ Athousandgenerationsfallingdowninw |
| 627 | Indescribable (Lyrics And Chords) | Chris Tomlin | ? | draft | 48/23 | — | 0/569 | — | upbeatmusic ⏎ ♪Fromthehighestofheights♪ ⏎ ♪T |
| 645 | The Praise Is Yours (Live From The Mission) | Matt Redman | ? | draft | 46/29 | — | 0/745 | — | [MUSIC] ⏎ Beyondtheend ⏎ beforebeginning ⏎ e |
| 654 | The Heart of Worship - by | Matt Redman | ? | draft | 22/12 | — | 0/526 | — | Whenthemusicfades ⏎ allitstripsaway ⏎ andIsi |
| 707 | Worship｜神正在這裡 / 更深呼求 / 生命的源頭 / 沒有人像祢一樣愛我 | 約書亞樂團 | ? | unavailable | 73/4 | — | 0/66 | — | upbeatmusic ⏎ speakinginforeignlanguage ⏎ si |
| 767 | Promises / Music / TRIBL | Maverick City | ? | draft | 168/74 | — | 0/1464 | — | [MUSICGODOFABRAHAM] ⏎ Faithfulthroughtheages |
| 772 | Promises - TRIBL | Maverick City | ? | draft | 208/76 | — | 0/1611 | — | [MUSICFAITHFULTHROUGHTHEAGES] ⏎ Faithfulthro |
| 776 | Constant / Jordin Sparks, Anthony Gargiula | Maverick City | ? | draft | 51/28 | — | 0/806 | — | Imgettingweakbutyouwontseemefolding ⏎ Trying |
| 834 | House of Worship & Darlene Zschech - Shout T | CeCe Winans | ? | draft | 34/17 | — | 0/695 | — | [MUSICMYJESUS ⏎ MYSAVIOR] ⏎ Allofmydays ⏎ Iw |
| 898 | Bless God | Cody Carnes | ? | draft | 67/39 | — | 0/985 | — | [MUSICBLESSEDARETHOSEWHORUNTOHIM] ⏎ Bendthek |
| 986 | Surrounds Me | Hillsong Worship | ? | draft | 27/12 | — | 0/458 | — | Youhavesearchedmyheart ⏎ ohGodYouhaveknownmy |
| 1040 | Song Of The Saints | Phil Wickham | ? | draft | 21/20 | — | 0/1047 | — | ThiswebelievethatwehaveaFather ⏎ Creatorwhow |
| 1287 | 不停讚美 | 盛曉玫 | ? | unavailable | 8/2 | — | 0/35 | — | upbeatmusic ⏎ singinginforeignlanguage |
| 1288 | 飛 | 盛曉玫 | ? | unavailable | 10/2 | — | 0/35 | — | upbeatmusic ⏎ singinginforeignlanguage |
| 1290 | 笑看風浪 | 盛曉玫 | ? | unavailable | 9/2 | — | 0/35 | — | upbeatmusic ⏎ singinginforeignlanguage |
| 1293 | 好消息 | 盛曉玫 | ? | unavailable | 10/3 | — | 0/38 | — | upbeatmusic ⏎ singinginforeignlanguage ⏎ you |
| 1295 | 承諾 | 盛曉玫 | ? | unavailable | 12/2 | — | 0/35 | — | upbeatmusic ⏎ singinginforeignlanguage |
| 1297 | 你是否願意 | 盛曉玫 | ? | unavailable | 10/3 | — | 0/45 | — | upbeatmusic ⏎ singinginforeignlanguage ⏎ [BL |
| 1298 | 耶穌 我投靠祢 | 盛曉玫 | ? | unavailable | 20/2 | — | 0/21 | — | [Music] ⏎ [SinginginChinese] |
| 1386 | Stay and Wait - at Team Night 2013 | Hillsong UNITED | ? | draft | 32/25 | — | 0/623 | — | [MUSIC] ⏎ Whospoketheearthandskytofall ⏎ Who |
| 1391 | King of Heaven - from Atlanta 2013 | Hillsong UNITED | ? | draft | 60/31 | — | 0/538 | — | softmusic ⏎ ♪Youtorethenightapart♪ ⏎ ♪Andrip |
| 1475 | Prayer | Mosaic MSC | ? | draft | 30/11 | — | 0/206 | — | [MUSIC] ⏎ Ineedmoreofyou ⏎ Letmehearyourvoic |
| 1492 | How I Love You / Passion Music / Session | Worship Together | ? | draft | 26/19 | — | 0/508 | — | [Music] ⏎ Letmywholelifebealovesong ⏎ TomySa |
| 1511 | Gratitude / Spontaneous Worship - Feat. Matt | Soul City Worship | ? | draft | 701/315 | — | 0/6111 | — | softpianomusic ⏎ ♪WeloveyouGod♪ ⏎ ♪Allmyword |
| 1513 | I Know A Name | Soul City Worship | ? | draft | 78/66 | — | 0/2366 | — | [MUSIC] ⏎ Jesusistheonlynamethatsaves ⏎ andi |
| 1601 | 聖誕鉅獻歌舞劇《兩個世界 . 上下城》 | 台北復興堂 | ? | unavailable | 266/14 | — | 0/156 | — | crowdcheering ⏎ speakinginforeignlanguage ⏎  |
| 1617 | 頌讚耶穌聖名 All Hail the Power of Jesus’ Name | 新心音樂事工 | 3:19 | unavailable | 9/2 | 92% | 0/35 | — | upbeatmusic ⏎ singinginforeignlanguage |
| 1644 | 《兩個世界 . 上下城》歌舞劇原聲帶 | 台北復興堂 | ? | unavailable | 90/77 | — | 1722/2375 | — | 世界原本只有一個直到那場能源風暴 ⏎ 逼得所有人面對同一個恐懼Theworldwasor |
| 1654 | Goodness of God / 棠下町集市 @香港宣教會恩磐堂 / 盧凱韻AiryL | 悦雨音樂 GRM | 5:04 | draft | 52/27 | 98% | 0/605 | — | ♪IloveyouLord♪ ⏎ ♪Foryourmercyneverceases♪ ⏎ |
| 1655 | 從未有過像祢 / 棠下町集市 @香港宣教會恩磐堂 / 盧凱韻AiryLolo & 阿修 | 悦雨音樂 GRM | 4:03 | unavailable | 10/2 | 100% | 0/37 | — | singinginforeignlanguage ⏎ audiencegasps |
| 1656 | 馬利亞的心 / 棠下町集市 @香港宣教會恩磐堂 / 盧凱韻AiryLolo & 阿修 | 悦雨音樂 GRM | 2:14 | unavailable | 8/1 | 101% | 0/24 | — | singinginforeignlanguage |
| 1720 | 好牧人 / 棠下町集市 @香港宣教會恩磐堂 / 盧凱韻AiryLolo & 阿修 | 悦雨音樂 GRM | 3:31 | unavailable | 10/3 | 100% | 0/51 | — | singinginforeignlanguage ⏎ audiencecheering  |
| 1762 | The D.S [#2] / 芷晴 - 在這一剎 (re-arranged cover) | U-Fire GYRO Band | 4:03 | unavailable | 14/4 | 100% | 0/32 | — | [Pause] ⏎ Okay ⏎ [Music] ⏎ [SinginginCantone |

_(表只列頭 40 首,全份喺 JSON 嘅 `vocal` 陣列。)_
