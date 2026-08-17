# backfillAlbumFromKeenCatalog 報告 —— Phase B(agwmm.org 官網 catalog)

> org=基恩敬拜/基恩敬拜祈禱仔。生成時間:2026-08-17 13:28:56(--dry,DB 未寫入)

- 候選 row 總數:349
- match 到單一專輯且已寫(或 --dry 模擬):0
- match 到但撞多隻專輯(衝突,冇寫):7
- match 到但 DB 已有 album(冇覆寫):256
- match 到但 album_source=manual/legacy(受保護,冇覆寫):0
- catalog 搵唔到:86
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):75.4%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 4897 | POapTMD_JXo | 華語詩歌《我的泉源在祢裡面》All My Fountains Are In You AGWMM | 我的泉源在祢裡面 | 永不疲乏 / Live Worship 2011 / Amazing Worship - Piano 1 |
| 4905 | f62TNspzyww | 華語詩歌《耶穌是主》Jesus The Saviour AGWMM | 耶穌是主 | 永不疲乏 / Amazing Worship - Piano 1 |
| 4907 | GpjIgFlemok | 華語詩歌《永不疲乏》Never Grew Weary AGWMM | 永不疲乏 | Amazing Guitar 2 / 靜默有時 / 永不疲乏 / Amazing Worship - Piano 1 |
| 4964 | vWXk9c0k8Y4 | 主賜平安 | 主賜平安 | Amazing Piano 1 / 主賜平安 / 主賜平安伴奏琴譜合集(PDF) |
| 4987 | K8RwitB8s5w | 主賜平安 | 主賜平安 | Amazing Piano 1 / 主賜平安 / 主賜平安伴奏琴譜合集(PDF) |
| 4995 | Yd9wqcVacug | 崇拜歌詞版《愛裡沒有懼怕》No Fear In Love (國語詩歌) AGWMM | 愛裡沒有懼怕 | 靜默有時 / 永不疲乏 / Amazing Worship - Piano 1 |
| 5123 | uE6dQlJVg-w | 《我心切慕祢》My soul longs for You - AGWMM | 我心切慕祢 | Amazing Guitar 2 / 永不疲乏 / Live Worship 2011 / Amazing Worship - Piano 1 |

(catalog 搵唔到嘅 86 首、DB 已有 album 冇覆寫嘅 256 首、
album_source=manual/legacy 受保護嘅 0 首,唔逐條列,見上面統計數字。)
