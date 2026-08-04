# backfillAlbumFromPlaylists apply 報告 —— org=讚美之泉

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 05:18:02

- approved playlist 數:55
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):905 首
- album 已非空(保護規則,冇覆寫):63 首
- DB 搵唔到對應 youtube_id:570 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 215 | bWOBTBdURZo | 這是我們的敬拜 |
| 4101 | ikQR5bQaBZE | 這是我們的敬拜 |
| 210 | BUAl5KsR-VI | 這是我們的敬拜 |
| 4087 | 5MbwlftMWig | 這是我們的敬拜 |
| 716 | bxtO97hA6Hc | 這是我們的敬拜 |
| 4088 | 6nkfZUaSX7I | 這是我們的敬拜 |
| 4089 | Yspgt392WSk | 這是我們的敬拜 |
| 4090 | OytAWXgbmzM | 這是我們的敬拜 |
| 4091 | lMXeS5AZcco | 這是我們的敬拜 |
| 4092 | 1qlZAw-L3ng | 這是我們的敬拜 |
| 4099 | uMAsfjcw7EU | 這是我們的敬拜 |
| 4100 | yI3oZiUf22M | 這是我們的敬拜 |
| 4102 | BXEujGWfN3c | 這是我們的敬拜 |
| 4103 | VTTcS_lS27Q | 這是我們的敬拜 |
| 4104 | eK4dYZi6kFo | 這是我們的敬拜 |
| 4111 | gD9rmThKf5A | 這是我們的敬拜 |
| 4112 | VtkBvHS9t50 | 這是我們的敬拜 |
| 4113 | 6eNiVEag8YM | 這是我們的敬拜 |
| 4114 | IJZpTe5uqqA | 這是我們的敬拜 |
| 4115 | 9GsGWPq2vUI | 這是我們的敬拜 |
| 4116 | 4G-nBRv2S5Q | 這是我們的敬拜 |
| 4123 | mYXedsCXN38 | 這是我們的敬拜 |
| 4124 | FeNwMXvz3XY | 這是我們的敬拜 |
| 4125 | TS7ipeIWBx8 | 這是我們的敬拜 |
| 4126 | PCAw5pJIbi8 | 這是我們的敬拜 |
| 4127 | 7HpN5QyEZts | 這是我們的敬拜 |
| 4128 | 341P7cRTFiU | 這是我們的敬拜 |
| 4135 | 5PT4qPGw3s4 | 這是我們的敬拜 |
| 4136 | 0L8E2HbbYUU | 這是我們的敬拜 |
| 4137 | k0e7VVu3th8 | 這是我們的敬拜 |
| 4138 | kCVVVIYwFJI | 這是我們的敬拜 |
| 217 | 3LIs-V8zQHU | 深愛耶穌 |
| 4222 | sZTAHWca92Q | 深愛耶穌 |
| 4207 | dnsbaB1dtio | 深愛耶穌 |
| 4223 | X8gAuY5yZeA | 深愛耶穌 |
| 4195 | AFZmF8d9p9M | 深愛耶穌 |
| 4200 | veF1gBLuwv0 | 深愛耶穌 |
| 4211 | pYyAWPTxg_w | 深愛耶穌 |
| 4184 | wfRTudoNLkc | 深愛耶穌 |
| 4183 | CEcmjFlQTMA | 深愛耶穌 |
| 4188 | yq8YK9O8WLQ | 深愛耶穌 |
| 4212 | RAacozf9irg | 深愛耶穌 |
| 4196 | q01p1cR7vQg | 深愛耶穌 |
| 4208 | rhvqjM8Ov6Q | 深愛耶穌 |
| 4172 | jcGEFyU1ng8 | 深愛耶穌 |
| 4176 | Rxrq8pGy9w8 | 深愛耶穌 |
| 4219 | y5aMAbQe5JQ | 深愛耶穌 |
| 4220 | f_Zcl01ivog | 深愛耶穌 |
| 4197 | bKuz6nFeuqk | 深愛耶穌 |
| 4221 | 1rSsM9d9KyI | 深愛耶穌 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。
