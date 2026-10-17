# backfillAlbumFromPlaylists discover 報告 —— org=CantonHymn

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=@cantonhymn。生成時間:2026-08-04 14:09:18

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLuns9UYDPrdJtS2XhlRkhOl-Pi2mzU0Nn | 恢復粵語敬拜共建專輯系列 | 恢復粵語敬拜共建專輯系列 | ⚠️ 64 | 8 |

候選 1 個,合共 matched_in_db 8 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:1 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLuns9UYDPrdIFLDTKqYvWqCRDhnB8x3C9 | 詩歌推介榜 每週重溫 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLoUPFUN8T44bOFLF2XomsV | 新城詩歌有Guide詩歌榜2026年曾上榜詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLjzszTd5Znxfu8N4pqdLus | 同哭 - 求主撫慰心碎 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdISIgMfN2sUhk0VrVqOWDyv | 為大埔火災祈禱 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJS71FsVzZhxHsYa3jyLZ8w | 新城詩歌有Guide詩歌榜2025年曾上榜詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIN3G1sfA60pnhngmeO5ejc | 被譯成外語的廣東話詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJK2HI51f2ivyXIKmH_lcyU | 新城詩歌有Guide詩歌榜2024年上榜人氣詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJqezt8awgXOIgFPWp7xPQu | 新城詩歌有Guide詩歌榜最新一週上榜詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdK8vjQkaOm_i_9JH8X4NNZn | 粵譯擂台 (第1-152回合) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJuUoWl1PB64mZmHh_bDWhD | CantonHymn x ChoirDB AI Cover Series | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIUTbrtG4LCOiVdddA0q_jR | 經典廣東話詩歌的原曲 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLfVlqSfxuf41vwIUEiJzzs | Elevation Worship 粵語版 Cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdI_iqg9-NvCjU8ueN5SKzqF | 廣東話機構團隊 - 翻譯詩歌作品 (以點擊排序) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLhZMIZ9hP6P320K0TY6bQu | 泰澤詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJTm2M9WgASd0_AK9vGQjNV | JPCC Worship / True Worshippers 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJhNJT7Fs9ke62Y0Ko4nGnr | 堂會投稿 Demo Cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIeJBi9872qpSmeaOaq93o0 | 婚禮詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKzhzQLVuTd0PQhdT9TISjB | 韓語詩歌粵語翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLpEU8JIvin_Sjp99X5sBwy | 日語詩歌粵語翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLXg5y9dZ_PKeKhqms1BnxP | 官方核准粤語版 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJV3HmwGY7ydUAM-5rSnxc_ | Chris Tomlin 粵語版 Cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdI9rP0W23cLWEqIEQfl0NIU | IHOP 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdK3AYjitzZZhldbq8LpbsEl | PlanetShakers 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdL1ViEd0hTGZ-_469ARJOnW | CHC 粵語版 Cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdI17dgrSKxjji07OHIilOXG | 約書亞樂團 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKjnzQgVQa3uC0ZcYRgECT- | Jesus Fashion 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKPvXfsUR7KldXH0contSHC | Hillsong 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJfNX4J0fLchH8d572mgytG | 讚美之泉 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJgQRUxPvajhKyLWGsLhBKG | Bethel Music 粵語版 Cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKdA36enJofvGxSZ0_xl7YT | J-US 粵語版 cover | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdL6LCE6tMqM62r3l88726Ub | 兒童詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLeYC0DjqDP3GT2L8RRObh4 | 安息禮拜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKn1blNa_e786ZXGpxcHdq_ | 彩虹約定 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdI5EZQidhL9xJN5dJ5085sa | 堂會詩歌創作 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIyBuplQRblRVyyczZi4bcV | 廣東話敬拜快歌 活動剪片/舞蹈常用詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIFXsyRhvETDOVmU4XSqZ1V | 最受歡迎福音粵曲 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKCSVcTQqEbqpO__6I9z-Fx | 小羊詩歌 粵語版 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJx2170elju7yeXT2NEELDy | Milk & Honey x CantonHymn | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdKui-LOoTTpzIkcjUCrna0e | HKBC | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdL8zp8OQpdiZNKZ2FxpGf5D | 宣教詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIp2w9NvC6SLut7c9V8MkV9 | 玻璃海樂團 / Worship Nations x CantonHymn | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdJyKNiDbBDhxZxvLsrEuaGf | 受難復活 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdINNC7IIPTIuYfynrLy-aVG | 聖誕歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdIfmnvA6ul7DqCluyOVDhdO | 5月5日敬拜馬拉松 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdLiNTNcXCUJ_Ga3Lvv53PzX | CantonHymn Worship Band | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLuns9UYDPrdK7NPpW3RqrE_LKtqSp3jIL | 最新訪問及活動 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL5B28B0617B510870 | SON Music x CantonHymn | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL31D195FC137D242A | 敬拜創作區 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLA9269AA464A10FBF | CantonHymn運動 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL6F4612952E7EB365 | 舊歌新詞 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| FL49U-nN5hleNNH-Z9wm0G3w | Favorites | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL909D4E577221CCF6 | 其他歌曲粵語詩歌翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL24012FAD2A0B931F | 國語詩歌粵語翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL7EF35B668B15B51A | 英文詩歌粵語翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL4182E8A7F8D3A96F | 印尼詩歌粵語翻譯 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/CantonHymn-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
