# backfillAlbumFromPlaylists discover 報告 —— org=ACM

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=channel/UCIGCKTWZFjtQB-zGylKGiXg。生成時間:2026-08-04 13:49:11

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLKztYP2DMa7h8sF9I4WUs3Dm8NU8T52ij | ACM 40周年創作專輯【REBIRTH】 | 【REBIRTH】 | 17 | 16 |
| PLKztYP2DMa7h0rvr0963TMu4ztpBqdxHW | 新專輯《站立得穩》Live Session | 新專輯《站立得穩》Live | 5 | 5 |

候選 2 個,合共 matched_in_db 21 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLV50HGqEgcJA | 《經典重製》系列 📽️ 以全新MV齊唱經典詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7j3fYXfiobGFzt6pZWlbLu0 | ACM最新敬拜詩歌❤️‍🔥 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jg0lT65nvyK5BIwojyVDxO | 《THE WAY》HKACM齊唱敬拜讚美16 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7isjbpXPClo0ExcyWeQWPbu | 《齊唱兒歌》系列 👶🏻 小小敬拜者 出動！ | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gxbcdVCPIdllxLL9jpgy8- | 《有故事的歌》系列 🪽 以歌譜出每個生命故事 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7i2wfBFpw7S88UlYwaNrPNm | 《靈修音樂》系列 🕊️ 讓祢愛在我四周環繞 | 純音樂/靈修背景音樂(冇編號,非正式專輯) |
| PLKztYP2DMa7jzPxKZ8Da6H-ENia09Fcc2 | 《疫流敬拜》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hqUEwERmMGilONwH-NcfOV | 《站立得穩》HKACM齊唱敬拜讚美15 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iZweW4ZDE05UKk5hsxSHCd | 《齊唱兒歌合唱本》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iTvTdxWNxghRpuKmFlQjNB | 《歲月流情》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iDBK5DqUlXbNj2Uhwtedq0 | 請聽我的誓言 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gTr1gTsR_LAEW6dyLQSp9j | 《齊唱兒歌2020》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hPB003fgWoEkX8-Xn98jK3 | 鋼琴伴奏版 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hRlQVIMXLKj2w6G-VtqwHF | 《同在的神 ─ 以馬內利》HKACM 齊唱敬拜讚美06 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gglAMFVcafgucSE2AMWKgN | 《和平之君》HKACM 齊唱敬拜讚美05 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7h0ux1mzJTi5mVa3l3GyB1g | ACM Live Music | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7i0TOw--VGmbwQ17V2ZD20T | 「轉向祢」疫流敬拜音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLKztYP2DMa7gxk8GDZNs1oRuOSpVblWYk | ACM詩班分部示範 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gAJYvpnEoGul_p-pR9usyL | 2020抗疫詩歌推介（粵語） | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jcT57REB2LuIwcz3u_mQe_ | 2019兒童詩班周年音樂會Live | 巡迴/演唱會歌單,唔係專輯 |
| PLKztYP2DMa7isZLJHvUeTWbedAX_s0qOi | ACM「讓主牽引」系列三部曲 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iB8SuNTgo1z6K2ITBer4iN | 《黑暗中的盼望》HKACM 齊唱敬拜讚美14 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hzq7qtnrhXAb6A2pmCxOec | ACM Little Band | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iuluu_5uBNHlRCGFfdu6mh | ACM樂隊系列 (Band Cover) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iMhmD-EM9DK-urk-u0MJhw | ACM 純音樂系列 | 純音樂/靈修背景音樂(冇編號,非正式專輯) |
| PLKztYP2DMa7grGIgGlhYrILG0PyDyxE_8 | 絲絃樂章 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hMP43P-16vCd4xakWLsXXT | 預苦期、復活期詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7igh8DvlZnigRgJ_W0IDZ2j | 《敬拜Crossover》HKACM 齊唱敬拜讚美07 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7i_7ihd75nWLArVUuIT9pxo | 《我願意》HKACM 齊唱敬拜讚美09 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jOPd94pNXzK3VTAgO23w0b | 《得勝者》HKACM 齊唱敬拜讚美08 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iCBTXefhfinGDeNMAhxWXT | 好聽現代粵語基督教流行敬拜讚美詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jg7Kde0xD4IpoAn-HZJNAw | HKACM - 詩歌 (大使命系列/復活信息) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jwSEKZhFd_BpHjqbSwXETI | HKACM - 詩歌 (詩篇23篇系列) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iD8GCADBEzYhH_4xHUmax- | HKACM - 詩歌 (主禱文系列) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jo8O9iKdFR7vGFcJWJj7Dd | 聖誕主題詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gVUSfYha7ZOnWmN0jRjusD | 《齊唱兒歌5》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hEGeZcjeKoV0NRa8CyNk4I | 《敬拜精選100 USB》 歌單 | 合輯/精選(全碟連續播放/最佳精選,唔係單一專輯) |
| PLKztYP2DMa7idpsANDjeTwBK7O8zh-wXa | 《ACM齊唱兒歌》系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gnnzBLGBzS0vC6aIHxgv0a | 《齊唱兒歌2》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hBgizSIzdXsJ4ivFWlR5cr | 《齊唱兒歌1》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hUNczGlcPdqaFFKmO0NA3k | ACM Drum Cover系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7iWIXfNVfHOWcHDLyYE5dC4 | 《齊唱兒歌DVD》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gVXNi4TtzFtjIsNzD0SDk2 | 《齊唱兒歌3》 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jnxIhVnzyQ040LH54iyZlk | 《全是祢的》HKACM 齊唱敬拜讚美11 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gU_pmgngRoY7z4zoHdMgwy | 《傳承使命》HKACM 齊唱敬拜讚美13 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hi5U5I1WuZsObehsoHuxe5 | ACM「傳承使命」專訪系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7heuMwE0o0m2W90KUPrwcpZ | ACM 齊唱新歌系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7i-GWeWbv0_Bed7gAJR5dKi | 在乎你系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hxKIagJ55Y3BVAjs29IbO1 | ACM兒童詩班十周年音樂會－現場片段HD高清版 | 巡迴/演唱會歌單,唔係專輯 |
| PLKztYP2DMa7jrLqNT39Iunm-d0u76d9gY | 《齊唱兒歌4》- 小小敬拜者(大衛篇) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7gKIAZMZ97VqmR-DSUYp_Du | 《牧我一生》HKACM 齊唱敬拜讚美12 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7jLEOvZHY0akN_1sYb9B6yM | ACM 詩歌創作大賽 2015 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hF0eVfQB-I_v0bZk9msfuc | 《牧我一生》Live Worship@ICA | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7j2sjZmKQcanDDP9b9HULJ3 | ACM Worship Dance | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hqBOj396Rb-rBzixEzh1ur | 「齊唱」金曲管弦夜籌款音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLKztYP2DMa7jF2Dsn_S9E7C6EGa_ldaE0 | ACM 課程簡介 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7hJZrbU5CKjxbgLQqLpqVJz | ACM 30周年唱歌比賽 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLKztYP2DMa7i6j7HeN4Zb3ctgzV5_29Ik | ACM 30周年音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLKztYP2DMa7j1yKCEUEF1aWx29rItfq2c | ACM暑期音樂聖經班 (2013) 我是小小敬拜者 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLE6A780625589014B | 《齊唱敬拜讚美》系列 ACM | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL681069CB2BC7757B | ACM 30週年感恩晚宴 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLC812225879AD4BE1 | ACM 兒童詩班 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL30F71DD520D9C9AE | YME 青少年系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL2E4C8D348A8A9DE3 | 《錫安城》HKACM 齊唱敬拜讚美10 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/ACM-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
