# backfillAlbumSearch 報告 —— Phase C(web search fallback)

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 4。生成時間:2026-08-04 07:23:17

- 候選 row 總數:15
- claude CLI 可用:true
- 有出處且填咗(或 --dry 模擬):13

## 寫入清單(連 source_url,俾人日後覆核)

| id | youtube_id | title | album | source_url |
|---|---|---|---|---|
| 70 | K-zNT8BxkD4 | 再次站起來Standing up again - AGWMM | 再次站起來 | https://open.spotify.com/track/5sIAC2jtqo84nYYpGEWeE5 |
| 71 | Fzs1uHV0qPQ | 陪我渡過You Were With Me AGWMM | 明天祢為我掌舵 | https://open.spotify.com/track/4XHokQsSEwZBAqdqtBdVrD |
| 72 | BJ2N3Yigx4Q | 普天頌讚Songs Of Universal Praise AGWMM | 我們愛因為神先愛 | https://open.spotify.com/track/0z9J2TUvAhdDmK4zAe0lcz |
| 73 | 2KM6F_vQSD0 | 有祢同行With You by my side - AGWMM | 平安的路 | https://music.apple.com/gb/song/%E6%9C%89%E7%A5%A2%E5%90%8C%E8%A1%8C-with-you-by-my-side/1767124269 |
| 74 | 0mn6wvX1l18 | 信心的等待Wait with faith - AGWMM | 繼續向前行 | https://music.amazon.com/tracks/B09H9GS185 |
| 75 | QwJOAjuoHyI | 神大愛God's Magnificent Love (現場版) 禱告更新2025AGWMM Official Live | 神大愛 | https://music.apple.com/ca/album/%E7%A5%9E%E5%A4%A7%E6%84%9B-gods-magnificent-love/1767754890 |
| 76 | R5lI1X1kyQE | 復興我Revive Me - AGWMM | 我是泥土 | https://agwmm.org/product/050_03_redeemme/ |
| 77 | 7UkwavM5L1E | 惟獨祢Only You AGWMM | 惟獨祢 | https://agwmm.org/product/017_03_onlyyou/ |
| 80 | yRqg084NW1Q | 一生讚美祢Praise You All My Life AGWMM | 回到家裡 | https://agwmm.org/product/album-homeagain/ |
| 81 | ghGZkUVS8NE | 信靠禱告Faithful Prayer AGWMM | 我們愛因為神先愛 | https://open.spotify.com/track/1NAw2py8ctysl7M4AJgmHM |
| 82 | F5YTkBAU5os | 下雨天的平安Peace In Rainy Days (現場版) 禱告更新2024AGWMM Official Live | 我是泥土 | https://music.amazon.in/tracks/B0H4269GSF |
| 83 | wyC58S7-EPI | 俯伏敬拜祢Bow down and worship You - AGWMM | 我們愛因為神先愛 | https://music.apple.com/us/album/%E6%88%91%E5%80%91%E6%84%9B%E5%9B%A0%E7%82%BA%E7%A5%9E%E5%85%88%E6%84%9B-we-love-because-god-first-loved-us/1767272188 |
| 84 | s0h93HvF3aY | 請堅固我Lord Please Strengthen Me AGWMM | 主賜平安 | https://music.apple.com/us/song/%E8%AB%8B%E5%A0%85%E5%9B%BA%E6%88%91-lord-please-strengthen-me/1773241052 |
