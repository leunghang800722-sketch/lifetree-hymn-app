# G-4 sidx 穩定性 — 2026-09-07

產生時間：2026-09-07T10:02:06.024Z
yt-dlp 呼叫次數：11/60
⚠️ **提早停手**：撞 403(googlevideo HEAD fetch)—— 即刻停手

## 方法
- 對每首歌獨立 shell out yt-dlp 兩次（同 production `default` strategy 一樣嘅 `-f` 參數），**完全唔用 resolveAudio.js 嘅 cache**（兩次天然就係兩次獨立 cold resolve，唔使額外 bustCache）。
- 對每條 resolve 到嘅 URL，attach Range HEAD fetch（256KB，唔夠再攞 1MB）解 sidx，讀 `content-range` 攞 `clen`。
- 比較：①兩次 resolve 出嚟嘅 URL 係咪同一條；②`clen` 是否一致；③`initSize` 是否一致；④頭 5 個 segment 嘅 offset/length 是否一致。

## 結果匯總
- 有齊兩次結構嘅樣本數：5
- sidx 完全一致（initSize + 頭5段 offset/length）：5/5 = 100.0%
- sidx 唔一致但 clen 都一樣（= 同一個 format，sidx 本身漂移 —— 對 N1 校驗係壞消息）：0
- sidx 唔一致而且 clen 都唔同（= 換咗 format/variant，屬預期、clen 校驗攔得住）：0

## 逐首結果
| id | title | url1==url2 | clen1 | clen2 | sameClen | initSize1 | initSize2 | sameInitSize | seg5Match | sameSidx |
|---|---|---|---|---|---|---|---|---|---|---|
| 104 | 【仍然相信祢 / Still Believing】HKACM Official Music Video | false | 5417342 | 5417342 | true | 632 | 632 | true | true | true |
| 203 | 每一天都是恩典敬拜詩歌 Worship Song感恩生命的讚美基督教音樂WorshipSongEveryDayIsGrace感恩生命神的信實平安詩歌基督徒敬拜感恩敬拜主的恩典 | false | 4627136 | 4627136 | true | 723 | 723 | true | true | true |
| 362 | 赞美诗合辑(7) 宇海文&有情天音乐&以斯拉 | false | 140232377 | 140232377 | true | 632 | 632 | true | true | true |
| 1550 | 你是快來君王 | false | 7297548 | 7297548 | true | 723 | 723 | true | true | true |
| 3669 | 詩篇一百五十篇 Psalm 150 (新心音樂事工) | false | 3373385 | 3373385 | true | 632 | 632 | true | true | true |
| 4330 | 【全然美麗 Beautiful】[進階舞蹈版] - 讚美之泉兒童敬拜讚美專輯 (10) 無止境 No Bounds | - | - | - | - | - | - | - | - | **錯誤:撞 403(googlevideo HEAD fetch)—— 即刻停手** |

## 決定 N1 key 用 `yt` 定 `yt+clen`
✅ **5/5 全部一致** —— 支持「key 用 `yt`、可以唔校驗」嘅方向。但執行單原文話明「執行者兩個 mode 都做」，
預設環境變數 `HLS_PLAYLIST_VERIFY` 仍然保持 `1`（校驗）不變 —— 樣本數細（≤30），一次性量度唔足以推翻「預設校驗」呢個保守立場，留返俾 Fable 睇呢份數據決定會唔會之後切 `0`。