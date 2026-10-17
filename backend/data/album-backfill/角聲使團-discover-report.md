# backfillAlbumFromPlaylists discover 報告 —— org=角聲使團

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=channel/UCXX3ZCTmJyrSE9DPEYMjRLA。生成時間:2026-08-04 14:09:59

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLAGb63n1zVCQt852WxaAkZbKop4zV4HUd | 角聲使團《心弦接觸》粤語專輯 | **(要人手填)** | 1 | 0 |
| PLAGb63n1zVCQ0RE-tlnsW6gbMrxC7KvAx | 角聲使團《生命陶匠》粤語專輯 (2004) | **(要人手填)** | 5 | 0 |
| PLAGb63n1zVCQ6TH1rp9N0ErGPu9YNU2Id | 角聲使團《全地至高是我主》粤語專輯 (2003) | **(要人手填)** | 4 | 0 |
| PLAGb63n1zVCTnMEnksmvl5j0bKL43oJTI | 角聲使團《讓愛留痕》粤語專輯 (2011) | **(要人手填)** | 14 | 1 |
| PLAGb63n1zVCTRN9-awUMYlVagjj-YKpkY | 角聲使團《振翅翱翔》粤語專輯 (2009) | **(要人手填)** | 6 | 2 |
| PLAGb63n1zVCTbUwuP6s_9DkZGHAWqj28g | 角聲使團《重投豐盛》粤語專輯 (2014) | **(要人手填)** | 15 | 3 |
| PLAGb63n1zVCRo8qO66Bey-nwmgZxwSkbO | 角聲使團《源來有祢》粤語專輯 (2018) | **(要人手填)** | 7 | 5 |

候選 7 個,合共 matched_in_db 11 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:7 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLAGb63n1zVCTSBf7lpehtuy-8PeVyfA2V | ⭑NEW⭑ 全新 MV | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQTVaAL-WY8TDr01zYRRZm_ | 《晨曦盼望》見證集 Playlist | 主題播放清單(唔係官方編號專輯) |
| PLAGb63n1zVCSkI1Tx5N9cunzbHYb4OYIJ | 角聲使團 鋼琴 Piano 系列 (Samuel) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQUaYPabtlKl_9dKkmDDgCZ | 角聲使團 歌唱 Vocal 系列 (Derrick) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCTuPBOkXfOfg3Xuh3D6ECjN | 角聲使團 Practice 花絮系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCTAxUKLaGFqsn3lt0ANdXLT | 角聲使團 Free Jam 即興系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQ-qtx7GmyOOoRnHh1EdLR8 | 角聲使團 2020 疫境共行詩歌精選 | 合輯/精選(全碟連續播放/最佳精選,唔係單一專輯) |
| PLAGb63n1zVCRUql0pZ9MZf3Nk1s7kiPty | 角聲詩歌 Kid SINGS 系列 [非官方] | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQ1VmcszzFUH47k-o8xiM16 | 角聲使團 Live Concerts 現場花絮系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCS0_cJzaGlrOxxp24vvlUfx | 角聲詩歌 Everyone PLAYS 系列 [非官方] | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCSOGYLMAxYOYM5LlbE-7ZcM | 角聲詩歌 Everyone SINGS 系列 [非官方] | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCSuBa-UfiX06YV8ojoH9Dg- | 角聲使團 - 分享及專訪 Story 系列 [官方] | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCRuF8vI9xw5Rx-3vaWqROpD | 角聲使團 低音結他 Bass系列 (Ah Sai) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQGkA2n-OWDE7IztL3wbg_Q | 角聲使團 鼓 Drum 系列 (Anson) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCTdmgTYzXfXrIDmeRuul0Bj | 角聲使團《燃動生命》粤語 EP (2015) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCTiFJaJGAm5CsRZThvI4bI9 | 角聲使團 色士風 Saxophone 系列 (梓杰) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCR4Ho29MIGgnv7lXbjoSZZh | 角聲使團 25 週年 [官方] | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLAGb63n1zVCQombtpx6d0NOrJGDwBs0X8 | 角聲使團 Promo Videos | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/角聲使團-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
