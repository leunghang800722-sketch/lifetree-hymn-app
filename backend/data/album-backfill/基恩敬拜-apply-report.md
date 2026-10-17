# backfillAlbumFromPlaylists apply 報告 —— org=基恩敬拜

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 13:54:00

- approved playlist 數:4
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):31 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):0 首
- DB 搵唔到對應 youtube_id:0 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 4083 | RFmhOJ3qzhY | 復活的盼望 |
| 4084 | 3XWJAQP9FCU | 復活的盼望 |
| 4097 | 9b19ZOj2Z40 | 復活的盼望 |
| 4106 | Cc0GoglHu7Y | 復活的盼望 |
| 4145 | jnl3izvrzsk | 復活的盼望 |
| 4154 | NL1Zkq22C6g | 復活的盼望 |
| 4156 | Wg5LDm12jqg | 復活的盼望 |
| 755 | DpLyKZvKwfI | 復活的盼望 |
| 4202 | P-Imy8_cBnI | 感恩的祭 |
| 4194 | S8gsP6__-xU | 感恩的祭 |
| 4203 | 0wKDysWrqcI | 感恩的祭 |
| 4201 | TnxsnSVEpHw | 感恩的祭 |
| 4193 | OUSycUVjVsU | 感恩的祭 |
| 4943 | ZzHrqn6ZOas | 晨禱 |
| 4847 | LGW2a1skmPA | 晨禱 |
| 4850 | sm1qXs-ni-s | 晨禱 |
| 4858 | XY17PcYTD0I | 晨禱 |
| 4859 | 8KtQjK0GFjE | 晨禱 |
| 4861 | d7L2u52N_lM | 晨禱 |
| 4871 | l8j2LxvL1Po | 晨禱 |
| 4894 | W4jDsMwkl3k | 晨禱 |
| 4895 | Wjneg7TLhGA | 晨禱 |
| 4872 | h8SqGnuCabI | 信心的宣告 |
| 4862 | WTLfvH1Ckrg | 信心的宣告 |
| 4869 | SvEz2IVMhYY | 信心的宣告 |
| 4893 | KdLAnPT2XD4 | 信心的宣告 |
| 4860 | H2MdsUc1SHE | 信心的宣告 |
| 4218 | NTiAthwhXBU | 信心的宣告 |
| 4870 | Hn_Mv7nY1OY | 信心的宣告 |
| 4834 | 21kibPDv9Lg | 信心的宣告 |
| 4216 | zzpQ6iYNm_I | 信心的宣告 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
