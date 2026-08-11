# backfillAlbumFromPlaylists apply 報告 —— org=讚美之泉兒童

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-11 10:30:29

- approved playlist 數:23
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):59 首
- album 已非空(保護規則,冇覆寫):193 首
- album_source=manual/legacy(受保護,冇覆寫):35 首
- DB 搵唔到對應 youtube_id:110 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 4238 | 6kY0qOmuiTw | 唱出耶穌的偉大 |
| 4235 | QmBxI-KK-vc | 唱出耶穌的偉大 |
| 4236 | O4UTnns3fT0 | 唱出耶穌的偉大 |
| 4230 | nhe98jfgC2g | 唱出耶穌的偉大 |
| 4231 | Tb8NenNEjkU | 唱出耶穌的偉大 |
| 4228 | AVGTZvAPR28 | 唱出耶穌的偉大 |
| 4227 | c9ldm4NzF9Y | 唱出耶穌的偉大 |
| 4226 | a8JcMe_xq38 | 唱出耶穌的偉大 |
| 4225 | 1xdtEgylEyo | 唱出耶穌的偉大 |
| 4255 | 4FOrsKzHJ_I | 耶穌是我最好的朋友 |
| 4273 | 6QMyR94v4To | 耶穌是我最好的朋友 |
| 4266 | cOdOdmjtSlg | 耶穌是我最好的朋友 |
| 4249 | qAahIVJAcyg | 耶穌是我最好的朋友 |
| 4269 | GUi6uy8uOKM | 耶穌是我最好的朋友 |
| 4270 | jemA0jIrp5M | 耶穌是我最好的朋友 |
| 4251 | WofrGc1recc | 耶穌是我最好的朋友 |
| 4256 | 0ugPcAQZvy8 | 耶穌是我最好的朋友 |
| 4263 | rfaj5UUN8o8 | 耶穌是我最好的朋友 |
| 4276 | BSexXbzCVgM | 耶穌是我最好的朋友 |
| 4275 | VRiW_Ce1OEM | 耶穌是我最好的朋友 |
| 4268 | JbF58KRlJEY | 耶穌是我最好的朋友 |
| 4258 | vbkeGAokfxQ | 耶穌是我最好的朋友 |
| 4267 | P6jwx4plxlM | 耶穌是我最好的朋友 |
| 4272 | gns8ugW4GPI | 耶穌是我最好的朋友 |
| 4271 | 3zsD0WLiudI | 耶穌是我最好的朋友 |
| 4260 | H2H7otrZ8vQ | 耶穌是我最好的朋友 |
| 4261 | Pe4Uv0VkXIE | 耶穌是我最好的朋友 |
| 4248 | Le8JgkBZhJk | 耶穌是我最好的朋友 |
| 4247 | CUW_E0ljnLs | 耶穌是我最好的朋友 |
| 4246 | TR3gvDDPN-U | 耶穌是我最好的朋友 |
| 4245 | xt8yUMqGX3w | 耶穌是我最好的朋友 |
| 4244 | SSWkmumrrWU | 耶穌是我最好的朋友 |
| 4243 | kMxgjf1cJxc | 耶穌是我最好的朋友 |
| 4242 | jcQSgMA8ZHY | 耶穌是我最好的朋友 |
| 4241 | kt6npFxqRPc | 耶穌是我最好的朋友 |
| 4278 | B7djTjnLACQ | 盡情地微笑 |
| 4282 | 861NbtV-JMU | 盡情地微笑 |
| 4280 | i4HXLT9bAC8 | 盡情地微笑 |
| 4279 | j5H2nYNmsZ8 | 盡情地微笑 |
| 4281 | 8ymNiIy7Jyg | 盡情地微笑 |
| 4277 | fKaZKJbHMJM | 盡情地微笑 |
| 4285 | zzRRyNg20lE | 盡情地微笑 |
| 4284 | rZQwdaKvfhw | 盡情地微笑 |
| 4316 | THJUgfxHIdY | 放晴了 |
| 4314 | oJKkk5cIPxc | 放晴了 |
| 4315 | hI9c_0FqAHI | 放晴了 |
| 4324 | 6EKWAOnZggY | 放晴了 |
| 4325 | 0RDqrCXhDG8 | 放晴了 |
| 4340 | H1Olybu_8Bs | 陽はてるよ雲の上 |
| 4344 | pdX34_IM-g8 | 陽はてるよ雲の上 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
