# Phase 1:播放核心重建 — 技術執行方案

> 撰寫:Claude Fable 5(規劃 session),2026-07-15
> 執行:另一個 Claude Code session(sonnet,已完成 repo audit/清理)
> 依據:`REDESIGN-PLAN.md` 第 3 章(Eric 已拍板,見第 8 章決定表)
> 分支建議:由 `develop-v211` 開新分支 `feature/player-rebuild`

---

## 0. 目標一句話

**撳播放嗰刻將成個清單交俾 TrackPlayer 原生 queue;next/previous/repeat/背景自動下一首全部交俾原生處理;App 端唔再有任何「臨場計下一首」嘅 JS 邏輯。** 為咗做到呢點,backend 加一個穩定串流端點 `/api/stream/:hymnId`,令每首歌喺排隊嗰刻已經有一個永久有效嘅 URL。

### 驗收標準(全過先算完成)

1. 播一個 ≥5 首嘅清單,熄芒放低,連續播完 3 首都自動接落去(唔會 loop 同一首)。
2. Repeat 三態:Off(播完隊尾停)/ All(隊尾接返隊頭)/ One(單曲 loop)——三態喺前景同背景行為一致。
3. Shuffle 開:即刻重新洗牌,之後 next 唔會重複已播;Shuffle 關:回復原順序;兩個操作都唔打斷播緊嗰首。
4. 播放頁清單顯示嘅順序 = 實際播放順序,highlight 跟得上 track 轉換(包括背景自動轉換後返嚟睇)。
5. 通知欄/鎖屏嘅 next/previous 同 App 內嘅掣行為完全一致。
6. 一首歌 stream 失敗(死鏈),自動跳下一首,唔彈大 alert、唔 crash;連續 5 首失敗先停低提示。
7. `REDESIGN-PLAN.md` §6.1 十關測試 2–7 全過。

---

## 1. 而家點解壞(root cause,俾你對返 code)

而家嘅「JIT queue」設計:TrackPlayer 隊入面**任何時刻只有 1–2 首歌**(現播嗰首 + best-effort prefetch),下一首靠 JS 端揀:

- `App.js` `changeToSong()`(約 line 468–537):`TrackPlayer.reset()` 之後只 `add()` 一首。
- `App.js` `PlaybackQueueEnded` handler(約 line 334–366):播完隊(=播完嗰一首)先喺 JS 度計下一首再 `changeToSong()`。**App 喺背景時 JS 執行唔可靠 → 呢段唔行。**
- 同時 `App.js` line 656–667 將 `repeatMode` sync 落 `TrackPlayer.setRepeatMode()`:repeat-all=`Queue` 情況下,單首歌嘅 queue 會被原生引擎自己 loop,`PlaybackQueueEnded` 根本唔會 fire → **背景無限 loop 同一首嘅直接成因**。
- 「下一首係邊個」嘅計算散喺三處(`PlaybackQueueEnded`、`handleNextTrack` line 605–629、`prefetchNextTrack` line 540–584),各自維護 `currentQueueIndexRef` / `shuffleHistoryRef` / `customQueueRef`,好易走位。
- 通知欄嘅 next(`src/track-player-service.js` line 8)直接 `TrackPlayer.skipToNext()`——同 App 內嗰套 JS 邏輯係**兩個唔同宇宙**,單首 queue 下 skipToNext 冇嘢跳,所以通知欄 next 廢咗。
- UI 顯示嘅 queue(context value `queue: getQueue(hymns)`,line 676)係**成個歌庫**,但實際播放可能用緊 `customQueueRef`(playlist)——「播放頁清單唔跟」嘅成因。

點解當初唔整條完整隊?因為每首歌嘅 googlevideo URL 要臨場經 yt-dlp 抽,而且會過期。**解法 = backend stream proxy(§2),俾每首歌一個穩定 URL。**

---

## 2. Backend:stream proxy 層

### 2.1 新檔案 `backend/lib/resolveAudio.js`(抽取共用 resolver)

將 `backend/routes/audio.js` 入面嘅 cache + yt-dlp 三策略抽出嚟做共用 module:

```js
// 對外 API
export async function resolveAudioUrl(youtubeId) // → string URL 或 throw
export function bustCache(youtubeId)
export const cache // 保留 export 俾 server.js pre-cache 用
```

實作要求:

1. **改用 async `exec`(promisify),唔准用 `execSync`**。而家 `routes/audio.js` 用 `execSync`,會 block 成個 event loop——stream 端點係高頻+並發,一首歌 resolve 緊會卡死晒其他人嘅串流,呢個必須改。
2. **In-flight dedup**:一個 `Map<youtubeId, Promise>`,resolve 緊嘅 ID 再有請求嚟就等同一個 promise,唔好開多條 yt-dlp。ExoPlayer 開播時可能對同一 URL 連環發幾個 range request,冇 dedup 會炒。
3. **TTL 跟真實過期時間**:googlevideo URL query string 有 `expire=<unix秒>`。parse 佢,cache entry 嘅 `expiresAt = min(expire*1000 - 10分鐘, now + 5小時)`;parse 唔到就 fallback `now + 4小時`。(而家寫死 6 小時,有機會用到過期 URL。)
4. 三個 yt-dlp 策略(`player_client=tv` → default m4a → default any)照搬;**唔使**攞 metadata(`--print-json` 嗰下慳返,stream 唔需要 title/thumbnail,慳一半延遲)。
5. 全部策略失敗 → throw(俾 route 回 502)。

`routes/audio.js` 改為 import 呢個 module(保留 `/api/audio/:youtubeId` 端點運作,過渡期間舊 APK 仲用緊佢;Phase 2 先考慮落架)。`server.js` 開機 pre-cache loop(line 102–150)都改用 `resolveAudioUrl`,行為不變。

### 2.2 新檔案 `backend/routes/stream.js`

```
GET /api/stream/:hymnId        ← hymnId 係 hymns table 嘅 DB id(唔係 youtube_id)
```

用 DB id 嘅原因:將來用戶上載嘅歌冇 youtube_id,呢個端點到時只需要按 `來源` 欄分流,App 端完全唔使改。

route factory 跟 `authRoutes` 現有 pattern,接收 `getDb`:

```js
// server.js
import streamRoutes from './routes/stream.js';
app.use('/api/stream', streamRoutes(getDb));
```

Handler 流程(pseudocode,關鍵細節都喺註解):

```js
router.get('/:hymnId', async (req, res) => {
  // 1. 驗證 + DB lookup
  const id = Number(req.params.hymnId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad id' });
  const hymn = /* SELECT youtube_id FROM hymns WHERE id = ? (sql.js prepare/bind) */;
  if (!hymn?.youtube_id) return res.status(404).json({ error: 'not found' });

  // 2. resolve(行 cache,冷嘅先落 yt-dlp)
  let url;
  try { url = await resolveAudioUrl(hymn.youtube_id); }
  catch { return res.status(502).json({ error: 'resolve failed' }); }

  // 3. 向 googlevideo 發請求,轉發 Range header(ExoPlayer seek 靠佢)
  const doFetch = (u) => fetch(u, {
    headers: req.headers.range ? { Range: req.headers.range } : {},
    signal: abortController.signal,   // 見第 5 點
  });
  let upstream = await doFetch(url);

  // 4. URL 過期/被拒 → bust cache 重 resolve 一次,唔得先放棄
  if (upstream.status === 403 || upstream.status === 410) {
    bustCache(hymn.youtube_id);
    url = await resolveAudioUrl(hymn.youtube_id);   // throw → 502
    upstream = await doFetch(url);
  }
  if (!(upstream.status === 200 || upstream.status === 206)) {
    return res.status(502).json({ error: `upstream ${upstream.status}` });
  }

  // 5. 轉發 status + headers,pipe body
  res.status(upstream.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (!upstream.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
  if (!upstream.headers.get('content-type')) res.setHeader('Content-Type', 'audio/mp4');
  Readable.fromWeb(upstream.body).pipe(res);   // Node 18: import { Readable } from 'stream'
});
```

必須處理嘅兩個位:

- **Client 斷線要斬上游**:每個請求開一個 `AbortController`,`req.on('close', () => controller.abort())`,唔係嘅話用戶跳歌會留低一堆 zombie 上游連線食晒頻寬。
- **點解用 proxy-pipe 而唔係 302 redirect**:googlevideo URL 通常綁定「邊個 IP resolve 就邊個 IP 落」。Server(Zeabur)resolve、電話 IP 去攞 → 403。所以一定要由 server 代抽代傳。頻寬成本:音訊 ~128kbps,試用人數 <100 完全冇問題;呢個都係將來換自家音源時唔使改 App 嘅同一個端點。

### 2.3 Backend 驗收(curl,喺實裝 frontend 之前先過呢關)

```bash
# 揀一個known生存嘅 hymn id(例如 FALLBACK_HYMNS 對應嗰啲)
curl -sI http://localhost:3001/api/stream/1                          # 期望 200,有 content-type
curl -s -H "Range: bytes=0-1023" -o /dev/null -w "%{http_code} %{size_download}\n" \
     http://localhost:3001/api/stream/1                              # 期望 206 1024
curl -sI http://localhost:3001/api/stream/999999                     # 期望 404
curl -sI http://localhost:3001/api/stream/abc                        # 期望 400
# 死鏈 hymn(揀 DEAD_LINKS.md 一個)                                  # 期望 502
# 並發:同時開 4 個 curl 唔同 id,確認冇互相 block(execSync 已除嘅證明)
```

---

## 3. Frontend:App.js 播放核心重寫

**所有改動集中喺 `App.js` 嘅 `PlayerProvider` 同 `AppContent`,唔好順手重組檔案結構**(拆檔留返 Phase 3;一次只改一件事)。UI 佈局/動畫/樣式一律唔郁,`BLUEPRINT.md` 同 `HYMN-APP-IRON-RULES.md` 鐵律繼續有效。

### 3.1 API_BASE 收歸一處

`App.js` line 36 寫死咗 serveo URL。改為 `import { API_BASE } from './src/config.js'`(`src/config.js` 已存在,確保佢係唯一源頭;`src/hooks/useCachedHymns.js` 一樣)。

### 3.2 新核心:`playQueue(list, startIndex)`

取代 `changeToSong` 做唯一「開始播嘢」入口:

```js
const toTrack = (song) => ({
  id: String(song.id),
  url: `${API_BASE}/api/stream/${song.id}`,     // 穩定 URL,唔使臨場 resolve
  title: song.title || 'Unknown',
  artist: song.artist || '',
  artwork: getAlbumCoverUrl(song.youtube_id),
});

async function playQueue(list, startIndex = 0) {
  if (!Array.isArray(list) || list.length === 0) return;
  setIsLoading(true);
  setQueue(list);                    // ← 新 state,UI 顯示同播放共用呢一份(§3.5)
  originalQueueRef.current = list;   // shuffle 還原用
  setIsShuffled(false);              // 換清單 = 洗牌狀態歸零
  await lazyEnsurePlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add(list.map(toTrack));
  if (startIndex > 0) await TrackPlayer.skip(startIndex);
  await TrackPlayer.play();
  // isLoading 唔喺度清——喺 PlaybackState listener 見到 Playing 先 setIsLoading(false),
  // 咁樣 loading 指示先真係反映「未出聲」
}
```

`lazyEnsurePlayer` 保留(lazy init 係 v211 啟動優化,唔好郁),但喺 `updateOptions` 加埋:

```js
import { ..., AppKilledPlaybackBehavior } from 'react-native-track-player';
// updateOptions 入面加:
android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
```

(用戶由 recent apps 掃走 App 都繼續播——背景播放可靠性嘅一部分。)

### 3.3 Next / Previous / Repeat:全部轉原生

```js
async function handleNextTrack() {
  try { await TrackPlayer.skipToNext(); }
  catch {
    // 隊尾 + repeat off:唔使做嘢(同通知欄行為一致)
    if (repeatModeRef.current === 1) { await TrackPlayer.skip(0); await TrackPlayer.play(); }
  }
}

async function handlePrevTrack() {
  const { position } = await TrackPlayer.getProgress();
  if (position > 3) { await TrackPlayer.seekTo(0); return; }   // 標準 UX:播咗3秒後prev=返歌頭
  try { await TrackPlayer.skipToPrevious(); }
  catch { await TrackPlayer.seekTo(0); }                        // 隊頭:返歌頭
}
```

Repeat:**保留** line 656–667 嘅 `repeatMode → TrackPlayer.setRepeatMode` sync(Off/Queue/Track),呢個而家先係唯一嘅 repeat 邏輯。UI 三態掣(`fsStyles` 嗰個)唔使改,佢本身已經 cycle 0→1→2。

### 3.4 刪除清單(成塊剷走,唔好留屍)

| 刪咩 | 位置(約) | 點解 |
|------|-----------|------|
| `PlaybackQueueEnded` handler 成個 | line 334–366 | 原生 queue+repeat 接手;呢個 handler 正係背景 loop 元兇 |
| `prefetchNextTrack()` 成個 + 兩處呼叫 | line 540–584, 329, 531 | 隊已經預先排晒,冇嘢好 prefetch |
| `shuffleHistoryRef` 及所有讀寫 | line 189, 174, 344–354, 494–497, 610–623 | shuffle 改為真洗牌(§3.6) |
| `customQueueRef` 及所有讀寫 | line 188, 484, 606, 631, 1268, 1318–1320 | `playQueue(list, idx)` 已涵蓋 playlist 場景 |
| `changeToSong()` 成個 | line 468–537 | 由 `playQueue` + `skipToQueueIndex` 取代 |
| `fetchAudioUrl()` + AppContent 嘅 warm-up effect | line 120–149, 1280–1286 | App 唔再需要臨場攞 URL;warm-up 由 server pre-cache 負責 |
| `getQueue()` helper + `STATIC_PLAYLIST` 嘅 queue fallback 用法 | line 156–158 | queue 只嚟自 `playQueue` 嘅入參 |
| `handleNextTrack`/`handlePrevTrack` 入面成套 JS 揀歌邏輯 | line 605–637 | 換成 §3.3 嘅原生版 |

`FALLBACK_HYMNS`/`STATIC_PLAYLIST`(line 69–90)本身可以保留做「server 攞唔到歌庫時嘅顯示清單」,但注意佢啲 fake id(+1000/+2000/+3000)stream 會 404 → 觸發自動跳歌。**建議直接刪埋 STATIC_PLAYLIST 嘅重複三份,fallback 得返原 15 首**(id 1–15 係 DB 真 id,播到)。

### 3.5 Queue 嘅單一真相:`queue` state + track 轉換同步

- 新 state:`const [queue, setQueue] = useState([])`——**係 hymn objects 嘅 array**(有 youtube_id、lyrics 等,UI 要用),只由 `playQueue` 同 shuffle 寫入。Context value 嘅 `queue: getQueue(hymns)` 改為呢個 state。
- `PlaybackActiveTrackChanged` handler(line 303–333)簡化:

```js
TrackPlayer.addEventListener(TPEvent.PlaybackActiveTrackChanged, (event) => {
  if (typeof event?.index !== 'number') return;
  setCurrentQueueIndex(event.index);
  currentQueueIndexRef.current = event.index;
  const song = queueRef.current[event.index];   // queueRef = queue state 嘅 ref 鏡像
  if (song) { setHymn(song); setCurrentHymn(song); }
});
```

  (`queueRef` 用 `useRef` 鏡住 `queue` state,event handler 先攞到最新值——照抄而家 `repeatModeRef` 嘅做法。)
- `handlePlayFromQueue(item)`(播放頁清單撳一首):改為 `const idx = queue.findIndex(...); await TrackPlayer.skip(idx); await TrackPlayer.play();` ——唔 reset、唔重建隊。Context 入面改名做 `skipToQueueIndex(idx)` 亦可,但要同步更新 `FullScreenPlayerOverlay` 呼叫處(line ~1091)。

### 3.6 Shuffle:真洗牌,唔打斷現播

```js
async function toggleShuffle() {
  const activeIdx = await TrackPlayer.getActiveTrackIndex();
  const q = queueRef.current;
  if (activeIdx == null || !q.length) { setIsShuffled(s => !s); return; }

  if (!isShuffledRef.current) {
    // 開:現播嗰首做隊頭,其餘 Fisher-Yates 洗勻跟後
    const rest = q.filter((_, i) => i !== activeIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const newQ = [q[activeIdx], ...rest];
    await rebuildAroundActive(newQ, 0, activeIdx);
    setQueue(newQ); setIsShuffled(true);
  } else {
    // 關:回復 originalQueueRef 順序,現播嗰首位置不變咁繼續播
    const orig = originalQueueRef.current || q;
    const curSong = q[activeIdx];
    const origIdx = Math.max(0, orig.findIndex(s => s.id === curSong.id));
    await rebuildAroundActive(orig, origIdx, activeIdx);
    setQueue(orig); setIsShuffled(false);
  }
}

// 唔打斷播放咁重排:剷走現播以外全部,再喺前後插返新順序
async function rebuildAroundActive(newQ, newActiveIdx, oldActiveIdx) {
  const n = (await TrackPlayer.getQueue()).length;
  const others = [...Array(n).keys()].filter(i => i !== oldActiveIdx);
  if (others.length) await TrackPlayer.remove(others);   // 現播變咗 index 0,冇停過
  const before = newQ.slice(0, newActiveIdx).map(toTrack);
  const after  = newQ.slice(newActiveIdx + 1).map(toTrack);
  if (before.length) await TrackPlayer.add(before, 0);   // 插喺現播之前
  if (after.length)  await TrackPlayer.add(after);       // append 喺後
}
```

注意:`TrackPlayer.remove(array)` 同 `add(tracks, insertBeforeIndex)` 係 RNTP v4 API,實裝前對返 v4.1.2 文檔確認簽名;如果 `remove` 唔食 array 就逐個由大 index 剷落細。

### 3.7 死鏈自動跳 + 斷路器

保留 `PlaybackError` listener(line 369–397)但簡化,並加「連環失敗斷路器」:

```js
const errorSkipCountRef = useRef(0);
TrackPlayer.addEventListener(TPEvent.PlaybackError, async () => {
  errorSkipCountRef.current += 1;
  if (errorSkipCountRef.current >= 5) {
    await TrackPlayer.pause();
    Alert.alert('播放中斷', '連續幾首歌都載入唔到,請檢查網絡或者稍後再試');
    errorSkipCountRef.current = 0;
    return;
  }
  try { await TrackPlayer.skipToNext(); } catch { /* 隊尾,算 */ }
});
// PlaybackActiveTrackChanged 度:成功轉 track 時 errorSkipCountRef.current = 0
// (放喺 setHymn 嗰段之後;正常播放會不斷歸零,唔會誤觸)
```

大 alert 換 toast 係 Phase 3 UI 嘢,而家用 Alert 頂住先,但只有斷路器先彈。

### 3.8 呼叫點改造(邊個 screen 點入queue)

| 呼叫點 | 而家 | 改成 |
|--------|------|------|
| `AppContent.handlePlayHymn(h, opts)` line 1305–1327 | rotate playlist + `customQueueRef` + `changeToSong` | `const list = opts.playlist?.length ? opts.playlist : (allSongs || FALLBACK_HYMNS); const idx = Math.max(0, list.findIndex(s => s.id === h.id)); playQueue(list, idx);` **唔好再 rotate**——原生 skip(idx) 保留清單自然順序,prev 都跳得返之前嘅歌 |
| `HymnListScreen` onPlayHymn(line 1385)| `changeToSong(hymn)` | `playQueue(hymnListData.hymns, idx)`(成個列表做 queue) |
| `PlaylistScreen` 播全清單/shuffle 播(line 45, 181, 206)| 經 `onPlayHymn(item, { playlist })` | 唔使改——`handlePlayHymn` 改咗佢就自動啱;line 181 佢自己 pre-shuffle 個 array 再傳入,行為照舊 OK |
| `FullScreenPlayerOverlay.handlePlayFromQueue` | 經 context | 改用 `skipToQueueIndex`(§3.5) |
| video mode(`opts.mode === 'video'`) | `Linking.openURL` | 照舊唔郁 |

### 3.9 已知 legacy 檔案,唔好掂

`src/context/PlayerContext.js`、`src/screens/FullScreenPlayerScreen.js`、`src/screens/PlayerScreen.js`、`src/context/AudioContext.js` 等係舊代殘留(App.js 冇 import 佢哋;`src/hooks/usePlayer.js` 係 re-export App.js 嘅)。你 audit 過 repo 應該心裡有數——**Phase 1 唔好清佢哋**,免得混入無關 diff;留返俾清理專項。

---

## 4. 實施順序(每步一個 commit,壞咗易 bisect)

1. `backend/lib/resolveAudio.js` 抽取 + `routes/audio.js`/`server.js` 改用(行為不變)— 驗證:舊 `/api/audio/:ytid` curl 照常
2. `backend/routes/stream.js` + mount — 驗證:§2.3 成套 curl
3. Frontend `playQueue` + `toTrack` + queue state + ActiveTrackChanged 新 handler(舊邏輯暫存並行)— 驗證:入 App 播到歌
4. 斬舊:§3.4 刪除清單 + §3.3 native next/prev + 呼叫點改造 — 驗證:十關 2、3、6
5. Shuffle 重寫(§3.6)— 驗證:十關 4
6. PlaybackError 斷路器(§3.7)+ `AppKilledPlaybackBehavior` — 驗證:十關 5、7 + 死鏈跳歌
7. Build APK(指令喺 `HYMN-APP-IRON-RULES.md`),真機行晒十關 2–7 + §0 驗收 1–6

Commit message 用返現有風格(`v215 Step N: ...`);**版本號自 v215 起,同 git tag 一致**(REDESIGN-PLAN §6.1 規矩 4)。

## 5. 邊界情況備忘

- **單首歌嘅 queue**:repeat All 同 One 效果一樣(loop 自己),skipToNext throw → catch 住 no-op。OK。
- **播緊途中 URL 過期**(聽超過~5小時同一首之後 seek):ExoPlayer 會發新 range request → server 撞 403 → bust+重 resolve → 透明恢復。唔使 App 端做嘢。
- **飛行模式播歌**:stream 連唔上 → PlaybackError → 斷路器 5 次後停低提示。
- **sql.js 注意**:`getDb()` 回傳嘅係成個 DB 常駐記憶體,prepare 完記得 `stmt.free()`(跟 `server.js` `/api/hymns` 現有寫法)。
- **Zeabur 上 yt-dlp 可能被 YouTube 封 IP**——呢個係 Phase 2 十首歌測試要驗嘅嘢,唔喺 Phase 1 範圍;Phase 1 用本機 backend 驗收就得。

## 6. 明確唔喺 Phase 1 範圍(唔好順手做)

- 歌庫死鏈清理/`狀態`欄位(Phase 2)
- 部署/API_BASE env 化 build pipeline(Phase 2;§3.1 只係收歸 config.js 一處)
- UI 色板/四 tab/首頁改版(Phase 3)
- 歌詞頁實裝(Phase 3)
- 最愛/清單雲端同步(Phase 4)
- legacy 檔案清理(§3.9)

有嘢卡住或者發現呢份方案同實際 code 對唔上(例如 RNTP v4.1.2 API 簽名有出入),喺 commit message 或者留言記低你點樣偏離咗方案同點解,唔使停低等指示。
