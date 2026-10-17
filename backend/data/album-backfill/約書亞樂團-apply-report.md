# backfillAlbumFromPlaylists apply 報告 —— org=約書亞樂團

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 14:08:47

- approved playlist 數:63
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):119 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):1 首
- DB 搵唔到對應 youtube_id:561 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 6595 | _7JtJTP-87Y | Lift High Your Name |
| 6596 | AQv3esy8ofg | Lift High Your Name |
| 6602 | nRCtpKHqSIU | Lift High Your Name |
| 6608 | nl1Aj8lTE0s | Lift High Your Name |
| 6609 | H-jcdaaQ4nk | Lift High Your Name |
| 6626 | ExsWuaPtfqw | 呼喊自由 |
| 6618 | FpYs-DvsJsk | 呼喊自由 |
| 6619 | LMaodqo7m50 | 呼喊自由 |
| 6617 | cSP5_aRJ3fE | 呼喊自由 |
| 6616 | qlXQl-f2IYU | 呼喊自由 |
| 6620 | 6WCNR4fx5TI | 呼喊自由 |
| 6621 | 533Kbp_gf4s | 呼喊自由 |
| 6614 | PmFCPiTxW90 | 呼喊自由 |
| 6610 | O_FJKYouip8 | 呼喊自由 |
| 6562 | 2Q3DOw4t0mg | 呼喊自由 |
| 6640 | iZduiGVErVo | 卸下冠冕 |
| 6638 | tJ3EUh_ZVQI | 卸下冠冕 |
| 6642 | aRORJZFeCmE | 卸下冠冕 |
| 6641 | IlTNtBxfo-0 | 卸下冠冕 |
| 6639 | n1PbYAu56LE | 卸下冠冕 |
| 6630 | sROgYOmoqcY | 卸下冠冕 |
| 6634 | _nTWaBTky0w | 卸下冠冕 |
| 6635 | 4o1FdazyCdw | 卸下冠冕 |
| 6633 | Q-5b9DA75ns | 卸下冠冕 |
| 6632 | RSw_Aw9_AfU | 卸下冠冕 |
| 6631 | SU9GGq4G5QA | 卸下冠冕 |
| 6636 | -lK5fsMIsCo | 卸下冠冕 |
| 6597 | ic-aVE98r2E | 呼喊自由 |
| 6600 | I2wjbDsVj5I | 呼喊自由 |
| 6603 | 8h5OSqfypVg | 呼喊自由 |
| 225 | wIHWPKZKc1Q | 呼喊自由 |
| 6612 | GaLVih4qj80 | 呼喊自由 |
| 6613 | WRb3ZgStW_Y | 呼喊自由 |
| 6624 | EGMV2y4UE50 | 呼喊自由 |
| 6625 | H-FAhX4ZLBA | 呼喊自由 |
| 6644 | 9rXGuL8yqvw | 呼喊自由 |
| 6570 | zeA2aodqPNo | 卸下冠冕 |
| 239 | DZEHiy6vNi0 | 卸下冠冕 |
| 6579 | Jb0OWPlB8XU | 卸下冠冕 |
| 6583 | oTkKr84_hd4 | 卸下冠冕 |
| 6623 | j-k7Kw1_YY0 | 卸下冠冕 |
| 6628 | zWDeBYImRSQ | 卸下冠冕 |
| 6637 | _UTuLAdWv48 | 卸下冠冕 |
| 6643 | _x7DAfoGap8 | 卸下冠冕 |
| 6645 | 2DaDVFv0LZ4 | 卸下冠冕 |
| 6660 | Kv2BcJzc-sQ | You Fight For Me |
| 6665 | zAFKxC5Y6m0 | You Fight For Me |
| 6667 | nmDV588T2D8 | You Fight For Me |
| 6668 | h4isNLJPFZw | You Fight For Me |
| 6669 | 6f_DCDOc8w8 | You Fight For Me |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
