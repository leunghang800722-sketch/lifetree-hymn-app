# backfillAlbumFromPlaylists discover 報告 —— org=新心音樂事工

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=user/NewHeartMusic。生成時間:2026-08-04 13:48:20

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLU2bY5aReSV_8Cdi9OThikUTvdzKS5u-a | 另一個世界 (國語專輯) | 另一個世界 (國語專輯) | 16 | 5 |
| PLU2bY5aReSV9q682yBErcVZMGG9H8EVFH | 盼望不熄 (國語專輯) | 盼望不熄 (國語專輯) | 13 | 13 |
| PLU2bY5aReSV8dnbHjuPZTWxxB09bB2h1C | 聖靈的果子 (兒童專輯) | 聖靈的果子 (兒童專輯) | 11 | 11 |
| PLU2bY5aReSV8iOaQDkCL02Xv4-kaj6fnP | 英雄 (國語專輯) | 英雄 (國語專輯) | 14 | 13 |
| PLU2bY5aReSV_9JcD04fDoQtjwTD3bscik | 我定意跟從祢 (國語專輯) | 我定意跟從祢 (國語專輯) | 12 | 12 |
| PLU2bY5aReSV_k-RocTuLDnmyGTpGXcLv9 | 敬拜權能主 (國語專輯) | 敬拜權能主 (國語專輯) | 13 | 13 |
| PLU2bY5aReSV-H7UYL-McvzDjSYEpBbjwv | 心的歸屬 (國語專輯) | 心的歸屬 (國語專輯) | 18 | 17 |
| PLU2bY5aReSV9w5AwtNUSuxnxZ2OGZb4cJ | 牽我的手 (國語專輯) | 牽我的手 (國語專輯) | 17 | 17 |
| PLU2bY5aReSV9yT_nEsMGJMeaU2HBKjkrn | 登上耶和華的山 (國語專輯) | 登上耶和華的山 (國語專輯) | 13 | 13 |
| PLU2bY5aReSV9s0M963RYlLT1qqB3-HgKT | 主我要信靠祢 (國語專輯) | 主我要信靠祢 (國語專輯) | 12 | 12 |
| PLU2bY5aReSV-InzcsgFbVbNyO-SeQTZoP | 讓全世界知道 (國語專輯) | 讓全世界知道 (國語專輯) | 13 | 13 |
| PLU2bY5aReSV_8B6MA86nYoai2V3ApA7l0 | 專心愛祢 (國語專輯) | 專心愛祢 (國語專輯) | 12 | 12 |
| PLU2bY5aReSV9iztAEGfT9rFFF_RTA4MTA | 真愛的代價 (國語專輯) | 真愛的代價 (國語專輯) | 12 | 11 |
| PLU2bY5aReSV8tQsSr_AxESyFyh6pQgauy | 竭誠獻上 (國語專輯) | 竭誠獻上 (國語專輯) | 10 | 8 |
| PLU2bY5aReSV9et-1oFVz7S8PrE8QSqx_f | 燃燒為主 (粵語專輯) | 燃燒為主 (粵語專輯) | 16 | 16 |
| PLU2bY5aReSV-eToG3dTCw0pc8LwyvbSpu | 洪流砥柱 (粵語專輯) | 洪流砥柱 (粵語專輯) | 12 | 12 |
| PLU2bY5aReSV_UgT6lo1zfhui-a9mppKZm | 全靠恩典 (粵語專輯) | 全靠恩典 (粵語專輯) | 13 | 13 |
| PLU2bY5aReSV-Ge3r4t_sHO2TovlTo7NJw | 如鷹展翅 (粵語專輯) | 如鷹展翅 (粵語專輯) | 12 | 12 |
| PLU2bY5aReSV9LreKi9_6UrSky-mMrE_qQ | 聖潔榮美 (粵語專輯) | 聖潔榮美 (粵語專輯) | 13 | 13 |
| PLU2bY5aReSV_1NEQMgYfBekAvTTbjTi4z | 美好的仗 (粵語專輯) | 美好的仗 (粵語專輯) | 13 | 13 |
| PLU2bY5aReSV-MYC_EpFIPqyRoBFkqHLMe | 無盡感恩 (粵語專輯) | 無盡感恩 (粵語專輯) | 12 | 12 |
| PLU2bY5aReSV-p_zGJ5qyu4Yxcngoo0eEA | 昂然起步 (粵語專輯) | 昂然起步 (粵語專輯) | 13 | 13 |
| PLU2bY5aReSV8r2TpA9LlIIv3Dr2xdJ0kC | 看哪！你的神 (國語專輯) | 看哪！你的神 (國語專輯) | 11 | 9 |
| PLU2bY5aReSV-YGzS-H-HGsOHxCYg811D1 | 祢是我神 (國語專輯) | 祢是我神 (國語專輯) | 12 | 3 |
| PLU2bY5aReSV8M-_6I4FpAfvXQ9x02vzpm | 聖詩新唱 (聖詩專輯) | 聖詩新唱 (聖詩專輯) | 6 | 6 |
| PLU2bY5aReSV9ODiRkCOWqN8N9NglvN_PN | 敬畏祢的榮耀 (國語專輯) | 敬畏祢的榮耀 (國語專輯) | 13 | 13 |
| PLU2bY5aReSV-7LZNeOw2S8ySSN8xrfSbq | 聖誕新心 (聖誕專輯) | 聖誕新心 (聖誕專輯) | 12 | 12 |
| PLU2bY5aReSV_4yjLX1KVUuL8mklRhPpFJ | 主耶穌，我的全部 (國語專輯) | 主耶穌，我的全部 (國語專輯) | 11 | 11 |

候選 28 個,合共 matched_in_db 328 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLU2bY5aReSV9B_3KE0rw5zmneFRXLCYot | 國語單曲 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_PpLppU57etuiKMud2AHHP | 大齋期默想 (粵語) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-iCSD5oFpmsB0gYGCDhgOY | 廿五週年 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-T93-OcUEZHqWI8ILdQl69 | 迎接聖誕十二天 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-OAgSGse2BRmZHlS04zBSV | 二十天求復興 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_-ptBjKkOVR0LpRbIiSQgF | 教會 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9fbN9NHXj3emhOpR9NbY0q | 救恩 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-hOfII7kd_5Mrb4IsmMxmQ | 與神同行 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8GatpgllqCCdzPsly6f33M | 順服 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_31QyZ01JDrnNiBUHGzRZP | 永恆的家 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9Xu939owaftoX5739LqP1V | 大齋期默想 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-IEH1i9btDyVJD_H6reD80 | 十字架 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8I-_TU9k3CiGXmUeDWCjuE | 主耶穌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_SlJU63bfbKRCcSLxGV5Z6 | 優先次序 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8UxaJrNOk7HccsQ5ASWujX | 寬恕 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_w9N_GUBmlXiiXE6PYW_Ff | 作者分享 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV899cNNBPmqIols4jq5Nxp1 | 安靜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-5LmwhKsFqeiLIfi9U08Ew | 神的話 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8Tc7jJFAN0nPiNstVVGP8k | 困難 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8APJJMN0mLMNzheaFQ_E3c | 苦難 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_V2oXp2zxmPWR8s442LUaS | 傳統聖詩 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV94tDL9MO1uRsxMKlOvi5sg | 等候 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV82r6z7vpalfa4dVtjSdkQo | 永恆 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_SrXY7PFNYoZ70Bn4ZN8Lq | 禱告 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9KpADpMMMK_BXpJRLyl6KG | 潔淨 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_LkqreBnngDlojVf6rsRG9 | 盼望 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_6pGonrfR93FzB8dH0s3XK | 榮耀 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_uRzfnhedIrZPDT9ZIztuH | 應許 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-oomAWIUovKY1_x_6nYmy5 | 神的主權 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8M1yj1Kd__eyEBUu-WMQY7 | 生命與詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-Rz8dET1ZDHKWr0rkoAPLq | 粵語敬拜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-RrNwMGXZ0o1r481b-Z3z2 | 器樂演奏 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8tR2S2TVF_OIiz12DHohJs | 國語敬拜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9mY_AwZe9R4KSX2IyxMoOB | 默想 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_Vl3Vw_0JcRiZhN9CqzCTF | 成長 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9N90oJffqZ9-DiaE3cb2fB | 聖誕 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-DA-O5T_3NiL97tmDjVicQ | 聖靈 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8UHIK26uFWb4iRc3ado0Az | 佈道 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8ao4UG14sw9cB2Vb_JZ_lm | 認罪 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_WP-Ub0SO2UWwuKbbbuZxV | 感恩 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-Ex5yK49-uqQsAnIM-iInK | 恩典 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV-VnZzyxIB-D5Nsd1tv3Yfw | 敬拜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_uRHVRnwY80NSxs2MumB-L | 相信 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_t425K8dumw6hJ1c-WhLmQ | 成為祝福 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8mdIBEYhWQdQrxGaL_Y0VQ | 帶領 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_GQ6l6fI4xX5IlNYec_zW8 | 力量 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9izc0eTfiPh3i0lRTAG91k | 讚美 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8bj4nGPr4Gru3kQGnuCo4N | 奉獻 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV8iQEwb-2PsgbYIq2Ex13z3 | 安慰 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV9YeR6p_D70yEhuFjkJEhGJ | 愛 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU2bY5aReSV_kpLNLhgXZEO9CeXgZG2ij | 醫治 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/新心音樂事工-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
