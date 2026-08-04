# backfillAlbumFromPlaylists apply 報告 —— org=新心音樂事工

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 13:53:39

- approved playlist 數:28
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):328 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):0 首
- DB 搵唔到對應 youtube_id:27 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 1532 | chLUFB54CJw | 另一個世界 |
| 1546 | QgKwd4-diCk | 另一個世界 |
| 1832 | TdUPAPNb03w | 另一個世界 |
| 1834 | IBLNp1cfdkk | 另一個世界 |
| 1860 | cSO9cEB-Ah0 | 另一個世界 |
| 1957 | tbXjuN-NCGQ | 盼望不熄 |
| 1948 | NIPaG3H1Yeo | 盼望不熄 |
| 1912 | 3j5l5wjaq7E | 盼望不熄 |
| 1941 | NEml279J0vw | 盼望不熄 |
| 1940 | xg5IHotE6pA | 盼望不熄 |
| 1932 | lUqqNhfOS0w | 盼望不熄 |
| 1904 | KrOGPtxwGB0 | 盼望不熄 |
| 1939 | yMmPaPwNL1I | 盼望不熄 |
| 1949 | TX3R1mdsN-U | 盼望不熄 |
| 1897 | iGao41GGpog | 盼望不熄 |
| 1905 | CCWY3Wk9qHA | 盼望不熄 |
| 1950 | 39mUEK2fImE | 盼望不熄 |
| 1913 | 4ENyDIPT7AU | 盼望不熄 |
| 2135 | Vesu3qCXHjo | 聖靈的果子 |
| 2133 | LRRqrYJfKyo | 聖靈的果子 |
| 2125 | _xSqWJBeU0c | 聖靈的果子 |
| 2117 | OOb9MOt3MBA | 聖靈的果子 |
| 2108 | 5OiOz56SWn0 | 聖靈的果子 |
| 2089 | s4P60c5Sbz4 | 聖靈的果子 |
| 2073 | Qsv1emqaJsU | 聖靈的果子 |
| 2048 | 3mpFaKUiO4E | 聖靈的果子 |
| 2029 | dS-xJ0dDzrw | 聖靈的果子 |
| 2010 | 5W9XNQYJHvE | 聖靈的果子 |
| 1985 | Rzrv9H2RB18 | 聖靈的果子 |
| 2152 | NhwNx4W3nSA | 英雄 |
| 2151 | l-MMKtyBV5Y | 英雄 |
| 2144 | IVc1i1IqufE | 英雄 |
| 2142 | NhPdMtZ0Wx0 | 英雄 |
| 2134 | tUgr9FunnUE | 英雄 |
| 2126 | rYXB0N-UUPc | 英雄 |
| 1975 | LVkdOyLAuqc | 英雄 |
| 1974 | 0hhiMWbTWBU | 英雄 |
| 1967 | wI3y9LwfI1g | 英雄 |
| 1966 | bHsjuOXBCfQ | 英雄 |
| 1965 | lm2OtDTWtRw | 英雄 |
| 1958 | yxh7NA2aewc | 英雄 |
| 1956 | _z9aNO7yEXc | 英雄 |
| 3713 | Zc1_c11Rjqo | 我定意跟從祢 |
| 3864 | iwO0ZwJJzlE | 我定意跟從祢 |
| 3966 | f9bmKpGPFeY | 我定意跟從祢 |
| 3685 | NFyoYt-ev1s | 我定意跟從祢 |
| 3967 | 8r7BfF6fO7c | 我定意跟從祢 |
| 3961 | WIb0LWORDrg | 我定意跟從祢 |
| 3963 | QZ_w_VaVwdY | 我定意跟從祢 |
| 3493 | 3CroEK9kSTI | 我定意跟從祢 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
