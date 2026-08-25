# iOS「播完冇聲 / 唔自動跳下一首」根因報告(Opus 5 獨立覆查,2026-08-12)

> 覆查背景:Eric 明確推翻上一個 Sonnet session 嘅「一次性報錯 / one-time glitch」結論,
> 要求 Opus 級獨立重查,唔准照抄前兩個 session 嘅描述。
>
> **結論先講:呢個唔係一次性報錯。呢個係 100% 必然、每一首歌都中、幾秒鐘就重現到嘅
> 結構性 bug。我喺呢部機上面用真實 backend + 真實 AVFoundation 重現咗,而且用算術
> 對到單位小數點第 7 位。前兩個 session 嘅根因判斷係錯嘅,而兩個已經出咗街嘅
> watchdog 修補(`f1650d2`、`01626cc`)喺呢個真根因面前係完全冇效嘅——佢哋嘅觸發條件
> 永遠唔會成立。**

---

## 零、TL;DR(俾 Eric 睇嘅白話版)

1. 我哋 backend 由 YouTube 攞落嚟嘅音訊檔,係一種叫「分段式 MP4(fragmented MP4)」嘅格式。
2. 呢種檔案入面,「成首歌幾長」呢個數字被記錄咗兩次。**Android 識得處理,iPhone 唔識——
   iPhone 會將兩個數字加埋,即係將歌長當成雙倍。**
3. 所以「有一天」實際 5:57,iPhone 以為係 11:54(啱啱好雙倍)。**全庫每一首歌都係咁。**
4. 後果:首歌真係播完(5:57)嗰陣,iPhone 以為先至播咗一半,所以**唔會**發「播完喇」訊號,
   亦**唔會**自動跳下一首。個播放頭仲繼續行,但已經冇音訊資料,即係「畫面顯示播緊、
   進度條繼續行、但完全冇聲」——一路靜音行多 5 分 57 秒,行到假嘅 11:54 先至肯認自己播完。
5. Eric 見到嘅 5:55/11:54 截圖,**唔係另一個獨立嘅顯示問題,佢就係根因本身。**
6. 修法:backend 喺串流出去嗰陣改 12 個 byte(將重複記低嘅嗰個歌長清零),iPhone 就會
   讀返正確長度。呢個改動唔會改變檔案大細,唔會影響 Range 請求,亦符合 MP4 標準。

---

## 一、我獨立驗證咗乜、前兩個 session 邊度啱邊度錯

### 1.1 我親手做過嘅實驗(全部可重跑)

我冇信任何人嘅描述,自己寫咗四支 Swift 探針,**完全照 SwiftAudioEx 嘅寫法**
(`AVURLAsset(url:options:nil)` → `AVPlayerItem` → `AVPlayer`,再照
`AVPlayerWrapper.duration` 嗰條 fallback 鏈讀 duration),直接打去本機真 backend
(`127.0.0.1:3001`,即係 Eric 部 Mac 上面跑緊嘅 production backend)。

探針檔案喺 scratchpad:`probe.swift` / `probe2.swift` / `probe3.swift` / `probe4.swift`。

| 實驗 | 結果 |
|---|---|
| A. `yt-dlp -F 96WDXhk6qjU` | 只有 4 個音訊格式:139(HE-AAC 49k)、249/251(opus webm)、**140(AAC-LC 129k)** |
| B. `ffprobe` 兩個 m4a 原檔 | 兩個都誠實報 **357.1s**,冇任何 doubling |
| C. 用普通 range server 餵 `yt-dlp` 下載返嚟嘅 140 | AVFoundation 報 **5:57 ✅ 正確** |
| D. **用真 backend `/api/stream/49`** | AVFoundation 報 **11:54(714.244s)❌ 第一次就中** |
| E. 對照組:將 backend 吐出嚟嘅**原始 bytes** 用普通 range server 餵 | 一樣報 **11:54** → **proxy 無辜,問題喺檔案本身** |
| F. 解析原始 bytes 嘅 MP4 box 結構 | `ftyp / moov{mvhd, **mvex**, trak{tkhd, mdia{mdhd}}} / sidx / moof…` = **fragmented MP4**,而且**冇 `mehd`** |
| G. 將 `mvhd`/`tkhd`/`mdhd` 三個 duration 欄位改做 0(共 12 bytes,檔案大細不變) | AVFoundation 即刻報 **5:57 ✅ 修好** |
| H. seek 去 350s(真尾 357s)睇實際行為 | 播過咗真尾之後**position 繼續行**到 372s+,`timeControlStatus=playing`、`rate=1.0`、`likelyToKeepUp=Y`,**冇任何 event、冇聲** |
| I. seek 去 710s(假尾 714s) | 喺 714.244s **先至** fire `AVPlayerItemDidPlayToEndTime` |
| J. 試多幾首歌 | id 1→9:41、id 47→9:10、id 50→9:30、id 8425→11:54。**全部係雙倍。冇一首例外。** |
| K. 試 `AVURLAssetPreferPreciseDurationAndTimingKey: true` | **一樣係 11:54**,呢個 native option 救唔到 |
| L. 試 id 7511(backend 解到 itag 251 webm) | AVFoundation:`This media format is not supported`(另一單獨立 bug,見 §五) |

### 1.2 算術鐵證(呢個係最硬嘅證據)

- `mvhd`/`tkhd`/`mdhd` 宣稱嘅長度 = 15750144 / 44100 = **357.14612s**
- 修補後(只靠 fragment 計)AVFoundation 報 = **357.09800s**(差咗 encoder delay 2048 samples,正常)
- **357.14612 + 357.09800 = 714.24412**
- AVFoundation 實際報:**714.2443537414966**

即係話:**AVFoundation 係將「moov 宣稱嘅長度」同「所有 fragment 加埋嘅長度」兩個數
直接加埋。** 呢個唔係估、唔係約等於「大概雙倍」,係逐個小數位對到嘅重複計算
(double-counting)。因為 YouTube 每首歌嘅 moov 宣稱長度 = fragment 總長度,所以結果
永遠啱啱好係雙倍。

### 1.3 前兩個 session 邊度啱

- ✅ `AVWrapperItemPlaybackStalled()` 喺 `AudioPlayer.swift:441-443` **的確係完全空實作**。呢點讀得啱。
- ✅ `96WDXhk6qjU` 真身係單一首歌、真長度 5:57,唔係大合輯。呢點查得啱。
- ✅ 「單獨 request 驗證過實際媒體 bytes / moov duration 冇 doubling」——**技術上啱**
  (moov 入面寫住嘅的確係 357),但**結論推錯咗**(見下)。
- ✅ OTA 的確推咗上 iOS(我查過 `~/.hymn-deploy/deploy.log`,2026-08-11 11:12Z 同
  2026-08-12 01:12Z 兩次 `platform=ios` 都成功)。`0cb78ab` 冇整壞 iOS OTA。

### 1.4 前兩個 session 邊度錯(呢部分好重要)

| 前面講法 | 實情 |
|---|---|
| 「根因係 SwiftAudioEx 唔 fire `AVPlayerItemDidPlayToEndTime`,對應上游 #1995/#1598」 | **錯。** 個 notification **會** fire,而且 fire 得好準——只不過係喺**假嘅 714s** 度 fire(實驗 I 實測)。唔係 SDK 唔發訊號,係我哋餵咗個錯長度俾佢。 |
| 「11:54 係另一個獨立嘅 duration 顯示問題,同 stall recovery 根因冇直接關係」 | **完全掉轉。** 11:54 **就係**根因。因為 duration 錯咗雙倍,AVPlayer 先至喺真尾唔肯認播完。前面呢句判斷令調查行錯咗方向。 |
| 「下面個 fix 已經唔再靠信賴 reported duration,所以呢個獨立問題唔會影響 recovery 生效」 | **錯。** 新 watchdog 靠「position 連續 3 秒完全冇郁」,但實測 position **根本冇停過**,一路行到假尾。所以 recovery 永遠唔會觸發。 |
| 「可能係一次性手機側 glitch」 | **錯到底。** 100% 必然,全庫 6000+ 首每首都中,任何時候幾秒內重現。Eric 講「唔係第一次」係啱嘅。 |
| 「泛化 watchdog 就 cover 到中途 stall」 | 泛化本身冇害,但**對呢個 bug 完全無效**(見 §四)。 |

**另外一個前面漏咗、但好關鍵嘅位:** 前一個 session 讀過
`AVPlayerWrapper.swift:435-450` 個 `didChangeTimeControlStatus(.paused)`,話佢「刻意漏咗
track 啱啱行到 boundary 嗰吓」。實情係:嗰句守衛係

```swift
if (self.currentTime > 0 && self.currentTime < self.duration) {
    self.playWhenReady = false;
}
```

正常情況下,歌播到尾 `currentTime ≈ duration`,個條件係 **false**,所以會讓路俾
`itemDidPlayToEndTime` 處理——**設計係啱嘅**。但因為我哋個 duration 係雙倍
(357 < 714 = **true**),佢就會行咗「當係藍牙斷線之類嘅外部暫停」嗰條路,
`playWhenReady = false`,state 凍死。**即係話:雙倍 duration 直接破壞埋 SwiftAudioEx
自己嗰條 boundary 守衛。** 呢個就係 Eric 見到「鎖屏仲寫住播放緊、但完全冇聲」嘅
機制本身。

---

## 二、根因(可重現機制 + 重現步驟)

### 2.1 機制鏈

```
yt-dlp 攞到 googlevideo itag 140 URL
   ↓
backend/routes/stream.js 原封不動 proxy 呢啲 bytes(冇 remux)
   ↓
呢啲 bytes 係 YouTube DASH「分段式 MP4」:
   moov 入面有 mvex(宣告「後面有 fragment」)
   但 moov 嘅 mvhd/tkhd/mdhd **同時**寫住成首歌嘅完整長度 357.146s
   而且**冇 mehd**(fMP4 標準用嚟講「總長」嗰個 box)
   ↓
按 ISO/IEC 14496-12,fMP4 嘅 mvhd/tkhd/mdhd duration **應該係 0**,
總長要由 mehd 或者 fragment 計。YouTube 兩樣都做:既寫死 357,又有
足 357 秒嘅 fragment。
   ↓
ExoPlayer(Android):跟標準,見到 mvex 就當 mvhd duration 唔算數 → 357s ✅
AVFoundation(iOS):moov 宣稱嘅 357.146 + fragment 總長 357.098 = **714.244s** ❌
   ↓
AVPlayer 以為首歌 11:54。播到真尾 5:57 嗰陣,佢覺得「先至一半啫」:
   • 唔 fire AVPlayerItemDidPlayToEndTime
   • 唔轉 state,rate 維持 1.0,timeControlStatus 維持 .playing
   • position 繼續行(冇聲)
   • SwiftAudioEx 個 `currentTime < duration` 守衛失效 → playWhenReady=false,state 凍死
   ↓
用戶睇到:鎖屏/App 顯示「播放緊」、完全冇聲、唔自動跳下一首。
一路要等多成 5 分 57 秒(靜音)行到假嘅 11:54,先至真係跳。
```

### 2.2 重現步驟(任何人 3 分鐘做得到,唔使真機)

```bash
# 1) 確認 backend 跑緊(port 3001)
curl -sD - -o /dev/null http://127.0.0.1:3001/api/stream/49 | head -5

# 2) 用 scratchpad 嗰支 probe(照 SwiftAudioEx 寫法讀 duration)
cd <scratchpad>
swiftc -O probe.swift -o probe
./probe http://127.0.0.1:3001/api/stream/49 3
#   → wrapperDuration=11:54 (714.244s)   ← 實際歌長 5:57

# 3) 對照:同一首歌用 yt-dlp 下載返嚟(已 remux),用普通 server 餵
yt-dlp -f 140 -o s140.m4a "https://www.youtube.com/watch?v=96WDXhk6qjU"
node srv.mjs 8899 &          # 支援 Range 嘅簡單 static server
./probe http://127.0.0.1:8899/s140.m4a 3
#   → wrapperDuration=5:57 ✅

# 4) 證明係 moov 重複計:將原始 bytes 三個 duration 欄位清零(12 bytes,大細不變)
./probe http://127.0.0.1:8899/patched49.mp4 3
#   → wrapperDuration=5:57 ✅

# 5) 睇實際失效行為:seek 去 350s(真尾 357s)
./probe2 http://127.0.0.1:3001/api/stream/49 350 20
#   → 過咗 357s 之後 position 繼續行、rate=1.0、timeControlStatus=playing、
#     冇 DidPlayToEndTime、冇 PlaybackStalled、冇聲
```

**每次都中,冇一次唔中。** 我試過 5 首唔同嘅歌(id 1 / 47 / 49 / 50 / 8425),
全部係啱啱好雙倍。

### 2.3 點解而家先爆 / 點解 Android 冇事

- Android ExoPlayer 跟 fMP4 標準,一直冇事。所以呢個 bug 喺 Android-only 年代**永遠唔會出現**。
- iOS Phase 0/2 喺 **2026-08-11** 先至上機(`f869a7b` / `e6fe429` / TestFlight build 2)。
- Eric 第一次報「播完唔自動跳」就係 **2026-08-11**,即係 iOS 一上機就即刻報。
- 時序完全吻合:呢個唔係間歇性,係 **iOS 由第一日開始每首歌都中**。
- Eric 講「唔係第一次見」——完全成立,因為佢每首歌都會見到。

### 2.4 順帶洗清嘅嫌疑犯

- **`2bc1ce0`(warm 端點 buffer 頭 256KB)無辜。** 我實測過 warm 之後同冷路徑吐出嘅
  bytes **完全一模一樣**(`cmp` 過),content-length / content-range 全部正確。
  ⚠️ 但發現咗另一件事,見 §五.3。
- **`backend/routes/stream.js` 嘅 header 處理無辜。** Range `0-1`、無 Range、warm 三條路
  嘅 `Content-Length` / `Content-Range` / `Accept-Ranges` 我全部 curl 核對過,冇錯。
- **「network stall retry storm」唔係同一個病。** 我睇過 `stream.js:238-270` 個 retry 路徑,
  佢係「2 秒 backoff → bustCache → 重新 resolve → 再 fetch」。呢條路有另一個獨立危險
  (見 §五.2),但佢**唔會**造成呢次「播完冇聲」——因為呢次根本冇任何 fetch 失敗,
  由頭到尾一條連線順順利利吐完晒成個檔案。
- **`0cb78ab` 無辜。** iOS OTA 兩次都推成功,deploy.log 有記錄。
- **HE-AAC / itag 139 假設:我試過,唔成立。** itag 139 用普通 server 餵一樣報 5:57。
- **DB 資料無辜。** `hymns.db` id=49 個 `duration` 欄係 `"300"`(垃圾值),但 App 嘅播放器
  總長度**根本唔讀 DB**,只讀 `TrackPlayer.getProgress().duration`。(不過 DB duration
  係垃圾呢件事本身要處理,見 §三.2。)

---

## 三、修復建議

### 3.1 【首選】backend 喺串流時就地修正 moov(12 bytes,長度不變)

**原理:** 將 `mvhd` / `tkhd` / `mdhd` 三個 duration 欄位寫做 0。呢個係 fMP4 **標準
本來就要求嘅值**,唔係 hack。改完之後 AVFoundation 只會靠 fragment 計 → 357.098s ✅,
ExoPlayer 本來就唔睇呢三個欄位 → 不受影響。

**點解安全:**
- **長度完全不變**(4 bytes 寫 4 bytes 零),所以 `Content-Length` / `Content-Range` /
  任何 Range 請求嘅語義**完全唔使改**。呢點好關鍵,因為 `stream.js` 個 Range 語義係
  load-bearing(檔頭已經寫明)。
- 三個欄位全部喺檔案頭 **632 bytes 之內**(實測:mvhd@56、tkhd@216、mdhd@312),
  而 AVFoundation 第一個內容請求一定係由 byte 0 開始(實測 request pattern:
  `bytes=0-1` → `bytes=0-<end>` → 之後先至跳中段)。所以只要處理「range 由 0 開始」
  嘅請求就 100% 覆蓋到。

**新檔案 `backend/lib/fixFragmentedMp4Duration.js`(建議):**

```js
// YouTube DASH 音訊係 fragmented MP4(moov 有 mvex、冇 mehd),但 mvhd/tkhd/mdhd
// 又寫住成首歌嘅完整長度。按 ISO/IEC 14496-12,fMP4 呢三個欄位應該係 0。
// ExoPlayer 跟標準、無視佢哋;AVFoundation(iOS)會將「moov 宣稱長度」同
// 「fragment 總長度」加埋 → duration 變雙倍 → 播到真尾唔 fire
// AVPlayerItemDidPlayToEndTime → 卡住「播放緊但冇聲、唔跳下一首」。
// 呢個 helper 就地將三個欄位清零,長度完全不變(所以唔影響 Content-Length/Range)。
//
// 詳細根因同實測見 STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12.md
export function zeroFragmentedMp4Durations(head) {
  // head = 檔案頭 N bytes(建議 ≥4096)。原地修改,回傳有冇改過。
  let patched = false;
  let hasMvex = false;
  const fields = [];

  function walk(start, end) {
    let off = start;
    while (off + 8 <= end) {
      const size = head.readUInt32BE(off);
      const type = head.toString('latin1', off + 4, off + 8);
      if (size < 8 || off + size > end) return;
      const hdr = 8;
      if (type === 'moov' || type === 'trak' || type === 'mdia') walk(off + hdr, off + size);
      else if (type === 'mvex') hasMvex = true;
      else if (type === 'mvhd' || type === 'mdhd') {
        const ver = head[off + hdr];
        fields.push({ off: off + hdr + (ver === 0 ? 16 : 24), len: ver === 0 ? 4 : 8 });
      } else if (type === 'tkhd') {
        const ver = head[off + hdr];
        fields.push({ off: off + hdr + (ver === 0 ? 20 : 28), len: ver === 0 ? 4 : 8 });
      }
      off += size;
    }
  }
  try { walk(0, head.length); } catch (_) { return false; }

  // 唔係 fragmented(冇 mvex)就乜都唔好掂 —— 普通 MP4 個 mvhd duration 係唯一真相。
  if (!hasMvex) return false;
  for (const f of fields) {
    if (f.off + f.len > head.length) continue;
    head.fill(0, f.off, f.off + f.len);
    patched = true;
  }
  return patched;
}
```

**`backend/routes/stream.js` 兩處接駁:**

(a) 冷路徑 —— 而家係 `backend/routes/stream.js:307-309`:

```js
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => { if (!res.writableEnded) res.destroy(); });
    body.pipe(res);
```

改為(只喺「呢個 range 由 byte 0 開始」先處理,其餘一律行返原路):

```js
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => { if (!res.writableEnded) res.destroy(); });

    // iOS fMP4 duration doubling 修補:只有「由 byte 0 開始」嘅請求先會攞到 moov,
    // 其餘 range 原封不動 pipe(零行為改動)。
    const startsAtZero = !clientRange || /^bytes=0-/.test(clientRange);
    if (startsAtZero) {
      const HEAD_BYTES = 4096;
      let head = Buffer.alloc(0);
      let done = false;
      body.on('data', (chunk) => {
        if (done) return;
        head = Buffer.concat([head, chunk]);
        if (head.length < HEAD_BYTES) return;
        done = true;
        body.pause();
        try { zeroFragmentedMp4Durations(head); } catch (_) {}
        res.write(head);
        body.resume();
        body.pipe(res);
      });
      body.on('end', () => {
        if (!done) { // 成個檔案細過 4KB
          try { zeroFragmentedMp4Durations(head); } catch (_) {}
          res.end(head);
        }
      });
      return;
    }
    body.pipe(res);
```

(b) warm 路徑 —— `backend/routes/stream.js:165-172`,喺 `res.write(buf)` 之前:

```js
      const { buf, totalLength, contentType } = buffered;
      try { zeroFragmentedMp4Durations(buf); } catch (_) {}   // ← 加呢句
```

⚠️ 注意 `buf` 係 cache 入面共用嗰個 Buffer,原地改會改到 cache。因為改法係
idempotent(第二次清零冇分別)所以安全,但**建議喺 `warmBuffer()`
(`backend/lib/resolveAudio.js:260`)存入 cache 嗰刻就一次過修補好**,乾淨啲:

```js
    const buf = Buffer.from(await r.arrayBuffer());
    try { zeroFragmentedMp4Durations(buf); } catch (_) {}
```

**上線前必須驗:**
1. iOS:`./probe http://127.0.0.1:3001/api/stream/49` → 要見到 **5:57**。
2. **Android 迴歸測試(必做)**:emulator 播 3-4 首,確認總長度顯示正常、
   自動跳下一首正常、seek 正常。理論上零影響(ExoPlayer 唔睇呢三個欄位),
   但呢個係 production 串流層,唔可以只靠理論。
3. 如果想再保守啲:第一版可以用 `req.headers['user-agent']` 含 `AppleCoreMedia`
   先修補,確認 iOS 好返、Android 零風險之後,下一版再拆走呢個 gate。

### 3.2 【建議一齊做】backend 記低真實長度,唔好再靠客戶端估

googlevideo 條 URL 本身就帶住 **`dur=357.146`**(我喺 `backend/cache/resolve-cache.json`
入面每一條都見到)。呢個係免費、權威嘅真長度。

建議:
- `backend/lib/resolveAudio.js` 喺 `computeExpiresAt()` 隔籬順手 parse `dur=`,連 URL
  一齊存入 cache;
- `GET /api/stream/:id` 加一個 `X-Audio-Duration` response header;或者直接寫返落
  `hymns.duration` 欄(而家係 TEXT,6100 條係 `"300"` / `"5:55"` 之類嘅垃圾或格式不一,
  382 條係 null——根本唔可靠);
- App 有咗權威長度之後,可以做一個**真正有效**嘅 end-of-track watchdog
  (`position >= realDuration - 0.5` → 強制 `skipToNext()`),做 §3.1 嘅雙保險。

⚠️ 淨係做 §3.2 而唔做 §3.1 **唔夠**:進度條總長仲會顯示錯(11:54),用戶體驗仲係壞。

### 3.3 【客戶端】App.js 要清嘅嘢

⚠️ **重要:純 JS/OTA 係救唔到呢個 bug 嘅。** 我逐個試晒 AVFoundation 可以俾到 JS 嘅信號:

| 信號 | 真值 5:57 | 實測 | 用唔用得 |
|---|---|---|---|
| `getProgress().duration` | 357 | **714** | ❌ |
| `getProgress().buffered`(= `loadedTimeRanges` 尾) | 357 | **714.29** | ❌ |
| `seekableTimeRanges` | 357 | **714.24** | ❌ |
| `getProgress().position` 有冇凍 | 應該凍 | **冇凍,一路行** | ❌ |
| `AVURLAssetPreferPreciseDurationAndTiming: true` | — | **一樣 714** | ❌ |

**全部都係雙倍或者冇用。所以一定要 backend 出手(§3.1),或者 backend 餵真長度落嚟(§3.2)。**

`§3.1` 落地之後,以下 App.js 嘅嘢建議一齊執(全部係細嘢,但都係真 bug):

1. **`frontend/hymn-app/App.js:1000`** — `if (progress.duration > 0) setDuration(progress.duration);`
   換歌時**永遠唔會 reset**。如果新歌一時攞唔到 duration(例如載入失敗),UI 會繼續顯示
   **上一首歌**嘅長度,而且可以無限期維持。建議喺
   `PlaybackActiveTrackChanged`(`App.js:665`)入面 `setDuration(0)`,或者跟 track id 記住。
   > (我一度懷疑 11:54 就係呢個 stale 值,後來實驗 D 證明唔係——但呢個 bug 本身係真嘅,
   > 而且將來會製造一模一樣嘅「數字對唔上」誤導。)

2. **`frontend/hymn-app/App.js:920` `lastPollPositionRef`** — 換歌時冇 reset。新歌第一個
   poll 會攞新歌嘅 position(≈0)同舊歌最後嘅 position 比較。雖然實務上好難啱啱好差
   <0.05,但呢個係無謂嘅 race。建議喺 `App.js:975-978` 嗰個 reset effect 度一併
   `lastPollPositionRef.current = -1`。

3. **`frontend/hymn-app/App.js:975-978`** — `midStallNudgedRef` 個 reset effect 只 depend
   `currentQueueIndex`。**repeat-one 重播同一首歌時 index 唔變**,個 flag 唔會 reset,
   所以第二次 stall 會直接跳過 nudge、即刻 skip。建議連 track id 一齊睇。

4. **`f1650d2` / `01626cc` 兩個 watchdog 唔使拆**,佢哋對「真・網絡 stall」
   (position 真係凍死)仲有用。但要喺註解度**改正根因描述**——而家
   `App.js:878-916` 成段註解係基於錯誤診斷寫嘅(講到係 SwiftAudioEx 唔 fire
   notification),會誤導下一個接手嘅人。

### 3.4 修復優先次序

| 次序 | 改動 | 影響 | 風險 |
|---|---|---|---|
| P0 | §3.1 backend moov 修補 | **解決全部 iOS 播完唔跳 + 進度條錯** | 中(串流層,要 Android 迴歸) |
| P1 | §3.5 itag 251 webm 問題 | 修好 iOS 完全播唔到嘅歌 | 低 |
| P2 | §3.2 真長度入 DB/API | 資料質素 + 雙保險 watchdog | 低 |
| P3 | §3.3 App.js 四項清理 | 防止將來誤診 | 極低(純 JS,OTA) |

---

## 四、兩個已出街 watchdog 嘅審計(Eric 要求嘅獨立審查)

### 4.1 致命問題:兩個都**永遠唔會觸發**

兩個 watchdog 嘅共同觸發條件係 `frontend/hymn-app/App.js:1004`:

```js
const stalled = pos > 0 && Math.abs(pos - lastPollPositionRef.current) < 0.05;
```

即係「position 連續 3 秒完全冇郁」。但實驗 H 實測:**播過咗真尾之後,position
每秒穩定 +1.00 秒一路行落去**(350 → 372 秒,冇停過一格),`rate` 維持 1.0,
`timeControlStatus` 維持 `.playing`,`isPlaybackLikelyToKeepUp` 維持 `Y`。

**所以 `stalled` 永遠係 false,`f1650d2` 同 `01626cc` 兩個 watchdog 對呢個 bug
完全零作用。** `01626cc` 泛化嗰下(拆走 near-end gate)並冇令佢有機會 fire——
問題從來唔係 gate 太窄,而係「position 凍死」呢個前提本身就唔成立。

順帶:`f1650d2` 個 `nearEnd = dur > 0 && pos >= dur - 1.5` 喺 dur=714、pos=357 之下
一定 false,呢個前一個 session 講啱咗現象,但歸因錯咗。

### 4.2 recovery 本身嘅邏輯(如果真係 fire 到)

我逐句睇過,**recovery 動作本身係啱嘅**,冇「跳咗下一首但 audio session 仲爛」嗰類問題:

- `handleStuckTrackEnd`(`App.js:921-948`):`skipToNext()` 之後有明文 `TrackPlayer.play()`
  (`App.js:938`)——啱,因為 `QueuedAudioPlayer.next()` 唔會傳 `playWhenReady:true`。
- repeat-one 分支 `seekTo(0)` + `play()`——啱。
- queue 尾分支 `pause()` + `setTrackState(Paused)`——啱,UI 會歸位。
- `handleMidStreamStall`(`App.js:956-971`):nudge 用 `lastPollPositionRef.current`,
  而嗰個 ref 喺 `App.js:1009` 每 tick 都更新,所以讀到嘅係當刻位置,冇 stale 問題。
- poll effect 個 dependency array `[queueReady, handleStuckTrackEnd, handleMidStreamStall]`
  ——三個都係穩定 ref(`useCallback` deps 分別係 `[]` 同 `[handleStuckTrackEnd]`),
  唔會令個 `while` loop 重複開新 instance。✅ 冇 RN useEffect polling 常見嗰個 leak。

### 4.3 其餘細問題

見 §3.3 第 1-3 點(stale duration、`lastPollPositionRef` 唔 reset、repeat-one 下
`midStallNudgedRef` 唔 reset)。

---

## 五、順手揪出嘅其他真問題(唔係今次根因,但係真 bug)

### 5.1 有歌喺 iOS 上面**完全播唔到**(itag 251 / webm-opus)

`backend/lib/resolveAudio.js:61-65` 嘅 format selector:

```js
{ name: 'default',  fmt: 'bestaudio[ext=m4a]/bestaudio', ... }
```

`bestaudio[ext=m4a]` 攞唔到嗰陣會 fallback 去 `bestaudio`,而 YouTube 嘅 `bestaudio`
好多時係 **opus/webm(itag 251)**。**AVFoundation 完全播唔到 webm。**

實證:`backend/cache/resolve-cache.json` 401 條入面有 1 條係 itag 251
(`WMldIJEduXM` = hymn id **7511**「寶血誓約 - 大衛帳幕的榮耀」)。我用探針打去
`/api/stream/7511`,AVFoundation 即刻回:

```
Error Domain=AVFoundationErrorDomain Code=-11828 "Cannot Open"
NSLocalizedFailureReason=This media format is not supported.
```

Android 播得,iOS 播唔到。而且我喺 CLI 實測過,同一條片喺唔同時間 / 唔同 client 之下
`bestaudio[ext=m4a]` **會間歇性攞唔到**(YouTube 側 PO-token / bot 檢查),
即係**任何一首歌都有機會臨時掉落呢個 webm fallback**。

**建議:** format selector 收窄到「iOS 一定播得」嘅範圍,唔好靜靜地 fallback 去 webm:

```js
{ name: 'default', fmt: 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]', extra: '' },
```

三條 strategy 全部都要改(包括 `default-any` 嗰條 `fmt: 'bestaudio'`)。攞唔到 m4a
就寧願當 resolve 失敗(行返現有 failCache / retry / skip 邏輯),都好過餵一個
iOS 播唔到嘅檔案落去。

### 5.2 retry 路徑會中途換 format(同 `resolveAudio.js:32-38` 自己嘅警告矛盾)

`resolveAudio.js:32-38` 已經寫得好清楚:parallel resolve 關咗,就係因為
「同一首歌唔同時間 resolve 可能出唔同 format,byte offset 對唔上 → 播下停下」。

但 `backend/routes/stream.js:246-270` 個 retry 路徑做緊**一模一樣**嘅嘢:
`bustCache()` → `resolveAudioUrl()` → 攞條**可能係唔同 itag** 嘅新 URL → 再用
**客戶端按舊 format 大細計出嚟嘅 `clientRange`** 去 fetch。

如果 retry 換咗 format(例如 140 → 139,5.5MB → 2.1MB),客戶端就會喺一個
「以為係 5.5MB 檔案」嘅 offset 度收到另一個檔案嘅 bytes,同時收到一個
total 完全對唔上嘅 `Content-Range`。呢個係實實在在嘅串流損毀路徑。

**建議:** retry 之後比較新舊 URL 嘅 `itag` / `clen` query param;唔一樣就唔好
用舊 `clientRange` 續 —— 應該回 502 逼客戶端由頭嚟過(App 側已經有
`TrackPlayer.retry()` + skip 邏輯接得住)。

### 5.3 `2bc1ce0` 個 warm fast-path 喺 iOS 上面係**死碼**

`backend/routes/stream.js:164`:

```js
const buffered = (!isHead && !clientRange) ? getBufferedChunk(...) : null;
```

即係「客戶端**冇**send Range」先至行 fast-path。但我實測 AVFoundation 嘅請求序列
(srv.mjs 收到嘅真實 log):

```
GET Range=bytes=0-1
GET Range=bytes=0-5776760
GET Range=bytes=49152-5776760
GET Range=bytes=16156-5776760
GET Range=bytes=1080884-5776760
```

**AVFoundation 每一個請求都帶 Range,一次都冇漏。** 所以 `!clientRange` 喺 iOS
永遠唔成立 → `2bc1ce0` 嗰個 256KB 預熱**對 iOS 一秒都慳唔到**。
(`IOS-NEXT-TRACK-PRELOAD-PLAN` 方向 3 嘅目標係 iOS,但實際上只有 Android
ExoPlayer 首個無 Range 請求先食到。)

**建議:** 條件由 `!clientRange` 放寬到「clientRange 係由 byte 0 開始」
(`!clientRange || /^bytes=0-/.test(clientRange)`),先至真正對 iOS 生效。
呢個同 §3.1 (a) 嗰個 `startsAtZero` 判斷可以共用。

### 5.4 `hymns.db.duration` 係垃圾資料

`duration` 係 TEXT 欄:382 條 null、6100 條 text,而且格式唔統一
(`"300"`、`"5:55"`、`"45:52"`)。id 49「有一天」寫住 `"300"`(5:00),
真長度 5:57。§3.2 順手可以由 googlevideo 條 URL 嘅 `dur=` 一次過 backfill 乾淨。

---

## 六、我**冇**做到 / 仲欠嘅證據

為咗誠實,列清楚:

1. **我冇喺 Eric 部真 iPhone 上面重現。** 我用嘅係同一部 Mac 上面嘅 AVFoundation
   (macOS 26.5 SDK)。iOS 同 macOS 用同一套 CoreMedia / AVFoundation MP4 parser,
   而且個算術對到單位小數點第 7 位(357.146 + 357.098 = 714.244),我對呢個結論
   有**極高信心**。但如果要 100% 鐵證,喺 iOS Simulator 或者真機跑同一支探針就即刻確認到。
2. **我冇改任何 code、冇 commit、冇碰 backend 服務。** 呢個 repo 有多個 session 共用
   working tree,而且 backend 重啟要行 deploy gate。§3.1 嗰個 patch 我只寫咗
   proposed diff 喺呢份文件,**working tree 完全乾淨,我一個檔案都冇改過**。
3. **Eric 嗰次「卡喺 5:55」到底 position 有冇凍,我唔知。** 我嘅實驗顯示過咗真尾之後
   position 係**繼續行**嘅。有兩個可能:(a) 佢截圖嗰刻啱啱好係 buffer 剛用完、
   AVPlayer 短暫 `waiting` 嗰一兩秒(我喺 seek 之後見過呢個 `waiting` 狀態);
   (b) 真機上面(背景 / audio session / FGS)行為同 macOS 有少少差異。
   **呢點唔影響根因判斷**——無論 position 凍唔凍,`duration` 都係雙倍,
   `DidPlayToEndTime` 都係遲成一首歌先 fire。
4. **下次 Eric 再撞到,想再確認嘅話,要 capture 嘅嘢:**
   - 播放器畫面截圖(總長度數字)+ 該首歌 id;
   - Xcode Console / `idevicesyslog` 過濾 `AppleCoreMedia`;
   - App console:`[player] mid-stream stall detected @ ...`(如果冇呢行,
     就再一次證明 watchdog 冇 fire,同我 §4.1 嘅判斷一致);
   - 最直接:記低「歌真係冇聲之後,要等幾耐先自動跳」。
     **我預測係「等到大約等於歌長嘅時間」**(5:57 嘅歌要再等 5:57)。
     呢條就係呢份報告最可證偽嘅預測 —— 如果 Eric 肯等一次唔撳 skip,
     就即刻驗證到成個根因。

---

## 七、一句話總結

> **backend 原封不動 proxy YouTube 嘅 fragmented MP4;呢種檔案將歌長重複記錄咗兩次;
> ExoPlayer 跟標準無視重複、AVFoundation 加埋兩份,所以 iOS 見到嘅每一首歌都係雙倍長。
> 首歌真係播完嗰陣 iOS 以為先至播咗一半,唔發「播完」訊號、唔跳下一首、繼續靜音行落去。
> 修法係 backend 出街前將 moov 三個 duration 欄位清零(12 bytes,長度不變,符合 MP4 標準)。**

**唔係一次性報錯。係每首歌、每次都中。**
