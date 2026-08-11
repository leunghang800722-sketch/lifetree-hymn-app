# backfillAlbumFromACMCatalog 報告 —— ACM(HKACM Official YouTube channel 專輯 playlist)

> org=ACM/ACM兒童詩歌。生成時間:2026-08-11 09:56:22

- 候選 row 總數:355
- match 到單一專輯且已寫(或 --dry 模擬):128
- match 到但撞多隻專輯(衝突,冇寫):0
- match 到但 DB 已有 album(冇覆寫):26
- match 到但 album_source=manual/legacy(受保護,冇覆寫):2
- catalog 搵唔到(youtube_id 唔喺任何已收錄嘅專輯 playlist 入面):199
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):43.9%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | album |
|---|---|---|---|
| 4353 | 8wJzYyMyL60 | 天黑黑 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4354 | LcrFonbYw4g | 風吹雨打不用怕 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4355 | uiuWu_d4OPM | 歡笑感恩﹣齊唱兒歌DVD (官方動作版) | 齊唱兒歌1 |
| 4357 | yWLWWy8vcFU | 腳印﹣齊唱兒歌DVD (官方動作版) | 齊唱兒歌3 |
| 4358 | kExK9QpSUqY | 耶穌恩光 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4359 | 8oJfEm69fno | 尊貴神兒女 - 官方完整版 | 齊唱兒歌4 |
| 4360 | Z5Q8Tu2ggGk | 跟主天際飛 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4361 | rijBi0MVE88 | 將溫暖贈送 - ACM 齊唱兒歌4 (官方完整CD版) | 齊唱兒歌4 |
| 4362 | eu8YBym1aO8 | ACM小天使之歌﹣齊唱兒歌DVD (官方動作版) | 齊唱兒歌1 |
| 4365 | YJDvycMs_Mg | 小小敬拜者 - 官方完整版 | 齊唱兒歌4 |
| 4366 | HYi2VpJI90A | 小寶貝 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4367 | az-o3J5I5ks | 你是我的好朋友 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4368 | rNqIDAEGMRc | 無盡的愛 (試聽版)﹣《ACM齊唱兒歌4》﹣送給親愛的爸爸媽媽！ | 齊唱兒歌4 |
| 4369 | BXKqwQUfNnI | 萬物同和應 - 官方完整版 | 齊唱兒歌4 |
| 4370 | o9OgnBaChJA | 腳印 - ACM 齊唱兒歌3 (官方完整CD版) | 齊唱兒歌3 |
| 4372 | X6ZCcq5ORto | 戰勝巨人 - 官方完整版 | 齊唱兒歌4 |
| 4374 | 2gZmdyMzcng | 齊齊分享More and More - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4375 | vTp5pxoSKOA | 真了不起 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4376 | Ik65jY5cs-A | 無盡的愛 - ACM 齊唱兒歌4 (官方完整CD版) | 齊唱兒歌4 |
| 4377 | 7iSEMyPilW0 | 歡笑感恩 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4378 | qAVGcmQQuIc | 抱抱Mammy親親Daddy - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4379 | u_M2s5kUnHc | 創造奇觀 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4380 | 5vYr7tIMoFo | 全情敬拜 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4381 | xTZCREij5-s | 彩色拼圖 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4382 | h8Ai5oRJXwk | 不得了﹣齊唱兒歌DVD (官方動作版) | 齊唱兒歌1 |
| 4383 | XD2DM6YarFA | 有隻蟻 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4384 | Kc4qY08oooA | 飛得更高 - ACM 齊唱兒歌4 (官方完整CD版) | 齊唱兒歌4 |
| 4385 | zpw3dHqioNg | 珍惜 - ACM 齊唱兒歌2 (官方完整CD版) | 齊唱兒歌2 |
| 4386 | xW7IwK7y2go | 願你知道 - 導師手語版 | 齊唱兒歌3 |
| 4387 | PhK7Pl3y5Bg | 繽紛可愛樂園 - ACM 齊唱兒歌2 (官方完整CD版) | 齊唱兒歌2 |
| 4388 | __j9FurH1LU | 是祢是祢 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4389 | HuL7KDPv9mI | 軍裝 - ACM 齊唱兒歌 (官方完整CD版) | 齊唱兒歌1 |
| 4390 | MK5ZEm_58bU | 空空的墳墓 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4391 | BAxACHA2As0 | 學習愛 - ACM 齊唱兒歌3 (官方完整CD版) | 齊唱兒歌3 |
| 4392 | 1zfQp50xBAA | 常常愛護我 - ACM 齊唱兒歌3 (官方完整CD版) | 齊唱兒歌3 |
| 4393 | NwEEMJvI3wc | 五餅小魚 - ACM 齊唱兒歌5 (官方完整CD版) | 齊唱兒歌5 |
| 4394 | lJyyAwrWwnI | 美麗創造 - ACM 齊唱兒歌2 (官方完整CD版) | 齊唱兒歌2 |
| 4395 | jv9VjA8h-5o | 齊掛笑臉 - ACM 齊唱兒歌2 (官方完整CD版) | 齊唱兒歌2 |
| 4396 | a2rP9R51aYc | 無比忠心 - ACM 齊唱兒歌4 (官方完整CD版) | 齊唱兒歌4 |
| 4397 | ChBdIz0X-yo | 闖闖這天 - ACM 齊唱兒歌2 (官方完整CD版) | 齊唱兒歌2 |
| 4398 | V_llLSWL2nI | 向耶穌祈求－導師手語版 | 齊唱兒歌3 |
| 4399 | vferiN3Jcm8 | 向耶穌祈求﹣齊唱兒歌DVD (官方動作版) | 齊唱兒歌3 |
| 4411 | MmrqOTKsWQk | 【絕世好爸】HKACM 兒童事工 ｜齊唱兒歌 3（官方完整CD版） | 齊唱兒歌3 |
| 4412 | QAQ2T9QAT2g | 【Hallelujah讚美主】HKACM 兒童事工 ｜齊唱兒歌 2（官方完整CD版） | 齊唱兒歌2 |
| 4413 | YcdKtM9BkBA | 【祢是彌賽亞（兒童敬拜版）】HKACM 兒童事工 ｜齊唱兒歌 2（官方完整CD版） | 齊唱兒歌2 |
| 4414 | r2r8oMgZVJ8 | 【主愛在我心】HKACM 兒童事工 ｜齊唱兒歌 2020（官方完整CD版） | 齊唱兒歌2020 |
| 4415 | bcJLR3OZcZs | 【老師都Like你】HKACM 兒童事工 ｜齊唱兒歌 2020 (官方完整CD版) | 齊唱兒歌2020 |
| 4419 | uSD5RrvwAA8 | 【將溫暖贈送】抗疫送暖行動 | 齊唱兒歌4 |
| 4420 | RHs8lAjI__Q | 歡欣頌讚 - ACM 齊唱兒歌2020 (官方完整CD版) | 齊唱兒歌2020 |
| 4421 | 95C3GEMhYCk | 你是為愛而生 | 齊唱兒歌3 |
| 5241 | pO35KBD-TEM | 【My Second Chance】- HK x 護心喜藥團《有故事的歌 3》 | 有故事的歌 |
| 5245 | bemJ6DgU9_Q | 【GOD WILL BE with you】- HK x 香港基督教更新會《有故事的歌 3》 | 有故事的歌 |
| 5277 | ZTaJuIHVNmo | 【今我靜靜離去睡了】- HK 《有故事的歌 2》 | 有故事的歌 |
| 5278 | 9HImTljgVjA | 【千迴】- HK 《有故事的歌 2》 | 有故事的歌 |
| 5279 | Pr-DP2N-zHs | 【異數】- HK 《有故事的歌 2》 | 有故事的歌 |
| 5280 | _YdPVcrTqPA | 【再生】- HK 《有故事的歌 2》 | 有故事的歌 |
| 5303 | Vi42RIg-IXk | 從心底讚頌 | THE WAY |
| 5304 | wyT-s1zCZ3g | 【再生】HK / 《有故事的歌 2》歌曲 | THE WAY |
| 5305 | QTyqM_zFrJw | 日光之上 | THE WAY |
| 5314 | dCHGbVpZHw4 | 【最後的情書 The Last Journey】- HK 《有故事的歌》 | 有故事的歌 |
| 5317 | ujYBIwlqlzY | 【原來對我這麼的好 Brotherhood】- HK 《有故事的歌》 | 有故事的歌 |
| 5324 | 7NqtcRnTVc0 | 【毋須掛慮 Born In Grace】- HK 《有故事的歌》 | 有故事的歌 |
| 5325 | cqkoe3rRbZs | 如今屈膝 / Kneeling Before You | THE WAY |
| 5326 | xMeuoWhdkUI | 黃劍文 Kimman Wong【孭 Piggyback】- HK 《有故事的歌》 | 有故事的歌 |
| 5360 | OxWAp9Fj7lk | I Will Not Be Shaken | 站立得穩 |
| 5361 | YB4bmUGAH40 | 確信 | 站立得穩 |
| 5362 | 4dDzV5LFNn4 | 【沉】- HK | 站立得穩 |
| 5363 | BqI1TTnfYf0 | 勇敢如常 | 站立得穩 |
| 5388 | G3acVlrBbvk | 【望見天虹】HK ｜齊唱敬拜讚美 8 - 得勝者 | 得勝者 |
| 5389 | 4w1euafmQWo | 【神伴你每天】HK ｜齊唱敬拜讚美 6 - 同在的神－以馬內利 | 同在的神─以馬內利 |
| 5396 | CheR2TDaHrY | 【安穩在主裡】HK Official \|《和平之君》齊唱敬拜讚美5專輯 | 和平之君 |
| 5397 | cRkfuaJTQpY | 黑暗終必過去 | 黑暗中的盼望 |
| 5399 | vnWFT4VcK4U | 【無條件的愛】"同在的神－以馬內利" - 官方完整版 | 同在的神─以馬內利 |
| 5400 | uAoCdYmZQQs | 【祝福你天天讚美】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5410 | Tw4P5BrCovQ | 「黑暗中的盼望」聚會精華 | 黑暗中的盼望 |
| 5411 | _eZICJR2EU0 | 【獻呈我靈】2019年敬拜詩歌 - Lyric | 黑暗中的盼望 |
| 5412 | -EDqo1YAieU | 【光芒】送給黑暗世代中的基督徒 - Lyric | 黑暗中的盼望 |
| 5423 | m65svbeETYc | 【轉向祢】HK \|《黑暗中的盼望》齊唱敬拜讚美14專輯 | 黑暗中的盼望 |
| 5425 | rvSl1bysp1Q | 【黑暗終必過去】HK \|《黑暗中的盼望》齊唱敬拜讚美14專輯 | 黑暗中的盼望 |
| 5432 | X4sVDKp6ecg | 《黑暗中的盼望》製作特輯 | 黑暗中的盼望 |
| 5433 | v8nPr2hdZkY | 【讓主牽引】牧我一生 - 齊唱敬拜讚美(12) | 牧我一生 |
| 5446 | d4QeI6QDwtg | 【永活真神】"得勝者" - 官方完整版 | 得勝者 |
| 5449 | lh8xmI5gFV4 | 【榮耀里程】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5456 | dpYE5BUpbqE | 【頌讚主聖名】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5457 | TmqryI62HyY | 主禱文-【全屬於祢】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5458 | VlM0SyPAQNA | 【神是我這生供應者】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5459 | r-ZgxbHyenA | 【永恆國度】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5460 | UZ-VMvymWeo | 【我們在天上的父】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5468 | qnniqZQDWD4 | 【祢是誰】 "傳承使命" - 官方完整版 | 傳承使命 |
| 5469 | 3DYH_k3pH5c | 【駕著雲彩】"傳承使命" - 官方完整版 | 傳承使命 |
| 5470 | 1Xi5yXOoYTc | 【傳頌千里】 "傳承使命" - 官方完整版 | 傳承使命 |
| 5471 | Iz477EjWNX4 | 【傳承使命】 - 官方完整版 (大使命) | 傳承使命 |
| 5472 | v7qaWyPz9p8 | 【一】HK \|《傳承使命》齊唱敬拜讚美13專輯 | 傳承使命 |
| 5473 | mR2WWSA2EgQ | 【相信祢】HK \|《傳承使命》齊唱敬拜讚美13專輯 | 傳承使命 |
| 5480 | perL2xvs3qc | 【天地喝采】HK \|《傳承使命》齊唱敬拜讚美13專輯 | 傳承使命 |
| 5481 | h4F61vDJwcI | 【憑信看見】 "傳承使命" - 官方完整版 | 傳承使命 |
| 5482 | ph5sR8nOFpk | 【祢是誰】手寫歌詞 "傳承使命" | 傳承使命 |
| 5483 | xDeRZna5ncg | 【傾倒的愛】HK \|《傳承使命》齊唱敬拜讚美13專輯 | 傳承使命 |
| 5484 | QXblIgncypU | 【在地若天】HK \|《傳承使命》齊唱敬拜讚美13專輯 | 傳承使命 |
| 5492 | ODbLm3KSKqM | 為這地祈福 - 官方完整版 | 和平之君 |
| 5493 | OD2vmUx92-I | 靠向我主 - 官方完整版 | 和平之君 |
| 5505 | a_bcbbmO5SE | 【讓祢愛充滿我】全是祢的 - 齊唱敬拜讚美(11) | 全是祢的 |
| 5508 | MuA-YgyYuqw | 敬拜 - 官方完整版 | 敬拜Crossover |
| 5509 | LQF4zstrYyI | 【響應】HK \|《敬拜》齊唱敬拜讚美7專輯 | 敬拜Crossover |
| 5516 | 5rXJNVUfgFs | 【祢是我的神】HK \|《敬拜》齊唱敬拜讚美7專輯 | 敬拜Crossover |
| 5517 | CAtJ-5RNVYI | 高聲宣揚 - 官方完整版 | 同在的神─以馬內利 |
| 5518 | xLNGGFfQlBY | 【我願意】 "我願意" - 官方完整版 | 我願意 |
| 5519 | SCPasgOJ4A0 | 【詩篇145】 "錫安城" (Official) - 官方完整版 | 錫安城 |
| 5520 | Jb7Uh_G4_DE | [建立] Official - 官方完整版 | 錫安城 |
| 5542 | NMndq_hSVFc | 【歸向錫安山】 "錫安城" Official - 官方完整版 | 錫安城 |
| 5545 | SdQAindB-Qg | [釋放] "錫安城" Official - 官方完整版 | 錫安城 |
| 5555 | PmClgfs9bWA | 【我要讚頌】 "錫安城" Official - 官方完整版 | 錫安城 |
| 5556 | bQzgWCFD6Bk | 【錫安之主】 "錫安城" Official - 官方完整版 | 錫安城 |
| 5557 | Huh7x3XNNbQ | 【萬有主】 "錫安城" Official - 官方完整版 | 錫安城 |
| 5589 | nyqatiGb5Go | 仰望神 - 官方完整版 | 同在的神─以馬內利 |
| 5590 | zh2v3vjxk8g | 為祢爭戰 - 官方完整版 | 我願意 |
| 5591 | RK-gI8PiPNM | 【靠近祢】 "我願意" - 官方完整版 | 我願意 |
| 5592 | 8l211tfz0Qc | 【惟有祢】"得勝者" - 官方完整版 | 得勝者 |
| 5629 | BAzLKkfKXVQ | 【一生都足夠】牧我一生 - 齊唱敬拜讚美(12) | 牧我一生 |
| 5636 | KJIkpF7G9mQ | 【從今相信】牧我一生 - 齊唱敬拜讚美(12) | 牧我一生 |
| 5637 | 3Ln6-I8E5lU | 【忠心至死】HK \|《牧我一生》齊唱敬拜讚美 (12) | 牧我一生 |
| 5638 | ucCCgh2Mf2k | 【來呈獻、來讚聲】牧我一生 - 齊唱敬拜讚美(12) | 牧我一生 |
| 5639 | EwZK_3t8s2k | 【無可相比】HK \|《牧我一生》齊唱敬拜讚美12專輯 | 牧我一生 |
| 5640 | QDjUp9K8Wis | 【牧我一生】HK \|《牧我一生》齊唱敬拜讚美12專輯 | 牧我一生 |
| 5648 | Cl1cCV_f1Ls | 頌讚主聖名 (Worship Dance) | 全是祢的 |
| 5694 | zJj0f3dbifw | 我們在天上的父 (Worship Dance) | 全是祢的 |
| 5707 | RpCrSorxx4Q | 《全是祢的》試聽版及2012年伊館聚會練習情況 | 全是祢的 |
| 5709 | UF33f-tvBPU | 《全屬於你》 - 主禱文詩歌 | 全是祢的 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | 撞中嘅專輯 |
|---|---|---|---|

(catalog 搵唔到嘅 199 首、DB 已有 album 冇覆寫嘅 26 首、
album_source=manual/legacy 受保護嘅 2 首,唔逐條列,見上面統計數字。)
