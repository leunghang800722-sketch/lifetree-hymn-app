# backfillAlbumFromPlaylists apply 報告 —— org=同心圓敬拜

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 15:03:43

- approved playlist 數:14
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):103 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):1 首
- DB 搵唔到對應 youtube_id:30 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):2 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 1716 | C04vOuMKXZg | The Very First 最起初的 |
| 1788 | 4ZNuknBYPiU | The Very First 最起初的 |
| 1847 | fW_-llbLF0U | The Very First 最起初的 |
| 3053 | EM_JdQq_P_Y | HOPE 盼望 |
| 3052 | c3mX0qJyJXk | HOPE 盼望 |
| 3051 | k9vMyKtLSTc | HOPE 盼望 |
| 3055 | 4PYDmgYCKaE | Guide Us 引領 |
| 3056 | A2xGf7nMN50 | Guide Us 引領 |
| 3057 | _xEoRNudqPU | Guide Us 引領 |
| 3059 | 5RWH8V8hMdY | Guide Us 引領 |
| 3058 | kyHz5EskJHg | Guide Us 引領 |
| 1714 | rS-lncr6hBA | Guide Us 引領 |
| 3065 | ACULQojpjyc | KINGDOM REBORN · SET FREE |
| 3069 | JosenZkC--4 | KINGDOM REBORN · SET FREE |
| 3071 | esBs9Vr8rZ4 | KINGDOM REBORN · SET FREE |
| 3073 | sEKZdy4hUHk | KINGDOM REBORN · SET FREE |
| 105 | wfAmoadlCo0 | KINGDOM REBORN · SET FREE |
| 3078 | NO2ZMLi4gdg | KINGDOM REBORN · SET FREE |
| 3081 | f7CdZaph24g | KINGDOM REBORN · SET FREE |
| 3082 | XCoooX3pyps | KINGDOM REBORN · SET FREE |
| 3083 | zfCDTCLhxFk | KINGDOM REBORN · SET FREE |
| 3077 | Jn2qxRxXn8Q | CHOSEN |
| 3085 | ifpH2cdcisw | CHOSEN |
| 3084 | bXnwoCj1c1g | CHOSEN |
| 3088 | VOYTKH5r0sQ | CHOSEN |
| 3122 | UXa90knhz9M | CHOSEN |
| 3094 | 6FrAsILUr7Y | CHOSEN |
| 3121 | tqigieJVp8E | CHOSEN |
| 3093 | PUyylJH3_eo | CHOSEN |
| 179 | ewpkz5cW7Co | CHOSEN |
| 3408 | vij9KnhNDpo | CHOSEN |
| 3399 | ki5ZEW2oSKQ | CHOSEN |
| 3124 | GycvnpjpG1E | CHOSEN |
| 3126 | Fwdr4Qz_8po | CHOSEN |
| 3123 | n-rMuv-Yc2Q | CHOSEN |
| 1641 | suQU3NgF0K0 | EXTOL尊崇 |
| 3063 | 3la0bh1HPGY | EXTOL尊崇 |
| 3419 | IMGWj5XhunY | EXTOL尊崇 |
| 3432 | qvz91cyC9hk | EXTOL尊崇 |
| 3433 | jQMexGA877k | EXTOL尊崇 |
| 3435 | R5zeexTZTn8 | EXTOL尊崇 |
| 3439 | V0VlHmy1gEw | HEART |
| 3422 | tErk66LUxps | HEART |
| 3437 | IBqCsgtutII | HEART |
| 3424 | V7SlOu4ItNE | HEART |
| 3428 | AuakUZSTie0 | HEART |
| 3438 | oO-dutjvxLY | HEART |
| 3445 | WmHPeyoj1WQ | HEART |
| 3436 | pS_JAjweVfI | HEART |
| 3440 | asc5ZqZsPno | HEART |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

| youtube_id | 撞中嘅專輯(playlist_title → proposed_album) |
|---|---|
| c6R5ct3hO8U | 「2015「Listen」高峰敬拜音樂會｜同心圓‧敬拜者使團 TWS」→LISTEN; 「2014「獻給祢」敬拜讚美音樂會｜同心圓‧敬拜者使團 TWS」→獻給祢 |
| CKAwkq7ZftA | 「2012「祝福自己」敬拜音樂會｜同心圓‧敬拜者使團 TWS」→祝福自己; 「2011「更親近」敬拜讚美音樂會｜同心圓‧敬拜者使團 TWS」→更親近 |

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
