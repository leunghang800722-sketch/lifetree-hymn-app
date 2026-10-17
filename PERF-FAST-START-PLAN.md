# 加速方案 v2:開 App + 聽歌 5秒+ → 目標 1.5-2.5秒(唔存音檔版)

> 設計文件,交執行 session(Sonnet)實作。2026-07-20 v2:
> **Eric 已拍板「唔存副本」版權原則,v1 嘅本地音檔 cache 方案已撤回。**
> 本版全部手段只係 cache「YouTube 音源 URL」(一串網址,唔係音訊內容)同優化連線,
> 音訊永遠即時由 YouTube 串流過,唔落地。
> 相關背景:HANDOFF.md #231-245(stream.js Range 語義係 load-bearing,唔准郁)、
> server.js #107-118(IP 被 YouTube ban 過嘅教訓,所有 yt-dlp 流量要守紀律)。

## 0. 而家啲時間去咗邊(唔存檔嘅天花板喺邊)

```
撳歌
 ├─ TrackPlayer lazy setup(第一次播先 init)          ~0.3-0.5s  ← §3.3 慳到
 ├─ ExoPlayer GET /api/stream/:id(經 tunnel)          ~0.1-0.3s  ← §3.1 慳握手
 ├─ backend resolveAudioUrl(yt-dlp)
 │   ├─ cache 命中:                                    ~0s       ← §1 目標:100% 命中
 │   └─ cache 未命中(冷):                              ~3-6.5s   ← §2 縮到 ~2-3.5s
 ├─ backend fetch googlevideo 首 byte                   ~0.3-1s   ← §4 預開連線慳少少
 └─ 音訊經 tunnel 回傳 + ExoPlayer buffer → 開聲         ~0.5-1s   ← §3.4 可微調
```

唔存音檔嘅話,**物理天花板 ≈ tunnel 雙程 + googlevideo 首 byte + buffer ≈ 1.2-2 秒**。
方案目標:令「幾乎每一次播放」都行 warm 路徑,貼住呢個天花板;冷路徑變罕見兼縮短。
Eric 話「快多一秒都要」—— 下面每一項都獨立計到賺幾多。

## 1. URL cache:由「開機熱 50 首」升級做「全庫長期保溫」(最大單項,平均賺 3-5 秒)

而家三個缺口:prewarm 只 50/150 首、in-memory 重啟即冷、URL 4-5 小時過期後又冷。
三味藥:

### 1a. resolve cache 持久化落碟(半日,零風險)
`resolveAudio.js` 個 Map 每次寫入後 debounce flush 落 `backend/cache/resolve-cache.json`
(gitignore),開機讀返、棄過期。存嘅只係 googlevideo **網址**同過期時間,唔係音訊。
→ 堵住「backend 重啟即全冷」。

### 1b. 開機 prewarm 由 50 → 全 curated 庫 150 首
server.js `PRECACHE_MAX` 上調至 200(cap),照舊 concurrency 2、由 1a 熱起,
開機時其實只需補「過期咗嗰啲」,唔係 150 首全做 —— 開機負擔反而細咗。

### 1c. 保溫 loop:過期前自動續熱(核心新件)
新增一個 backend 內部 interval(唔使新 process):
- 每 60 秒望一眼 cache,揾出「30 分鐘內就過期」嘅 entry
- 每次 tick 最多續 1 首(concurrency 1,天然 rate limit:最密都係 1 次/分鐘)
- 只喺 **07:00-23:59** 行(夜晚俾返個窗口畀 grow job,又冇人聽歌);
  朝早 07:00 第一輪自然會逐首補返夜晚過期嗰啲,~2.5 小時內全庫返熱
- env 開關 `URL_KEEPWARM=1` + `KEEPWARM_MAX_PER_DAY`(建議 800)熔斷

**流量帳(俾 Eric 安心)**:150 首 × URL 壽命約 4.5 小時 × 17 個活躍鐘 ≈ 每日約 550 次
resolve,平均每分鐘 0.4 次,永遠單線程。對比:被 ban 嗰次係「每次開機 1518 首 × concurrency 4」
嘅爆發式流量。呢個係細水長流,同一個真人用戶碌 YouTube 差唔多。但因為有前科,
所以有熔斷 env,亦建議執行 session 頭一星期每日睇一次 resolve 成功率 log。

→ §1 做齊:**日常播放 100% warm**,即撳即入 1.5-2.5 秒區間。

## 2. 冷 resolve 由 ~6.5s 縮到 ~2-3.5s(罕見情況嘅保底)

做完 §1,冷路徑只剩「啱啱入庫嘅新歌」同「熔斷後」:

- **2a. strategy 平行 race**(而家係順序試三個 strategy,一個 fail 晒先到下一個):
  改成 `youtube:player_client=tv` 同 `default` **同時開跑,鬥快**,邊個先返 URL 用邊個,
  第三個 `default-any` 留做順序後備。冷 resolve 期望值大約砍半。
  代價:每次冷 resolve 對 YouTube 係 2 個請求 —— §1 令冷 resolve 好罕見,總量反而跌。
- **2b. timeout 30s → 12s**(HANDOFF #907-908 想做未做嗰項):死鏈全 fail 嘅時間
  由最壞 90 秒縮到 36 秒;正常歌 12 秒綽綽有餘(實測冷 resolve 6.6s)。
- **2c.(可選實驗)Node 原生 resolver**:`youtubei.js`(Innertube)喺 Node 內直接查
  player API,免每次起 Python process,實測界通常 0.3-0.8 秒。掛喺 yt-dlp **前面**做
  primary,任何 error 即刻 fallback 返 yt-dlp 三 strategy(現有路徑一步都唔改)。
  env flag `RESOLVER_INNERTUBE=1`,預設關。YouTube 改嘢佢死得快過 yt-dlp,
  所以只可以做「錦上添花層」,唔可以做依賴。

## 3. 前端:握手、init、預熱、buffer(合共賺 0.5-1.5 秒)

- **3a. 開 App 熱身 ping**:App mount 背景 `fetch(API_BASE+'/api/health')` fire-and-forget,
  預先找數 DNS+TLS+tunnel 握手,第一下撳歌慳 ~0.3-0.5s。
- **3b. 預熱端點**:backend 新增 `POST /api/stream/warm { ids }`(上限 10,即回 202,
  背景逐首行 resolveAudioUrl)。App 兩個時機用:
  ①開機:「繼續收聽」嗰首 + 「今日為你預備」6 首;
  ②每次 `playQueue`/`playSingle` 起播後:隊列下 3 首 —— 令自動接續/撳「下一首」永冇冷嘅。
  (§1 保溫做齊後呢步近乎零成本,但佢兼顧咗未入保溫網嘅新歌。)
- **3c. TrackPlayer 提早 init**:App mount 後 idle 時預先 `setupPlayer`(重用 lazyEnsurePlayer,
  只係提早叫)。⚠️ 動手前 `git log -S lazyEnsurePlayer` 查當初改 lazy 嘅原因,
  如果係避 crash 就保留 lazy、放棄呢項。
- **3d.(最後先試)buffer 參數**:`setupPlayer` 加 `playBuffer: 1.5`(ExoPlayer 開播
  所需 buffer,預設 2.5s)。網差時重 buffer 機會增加,AB 完唔掂即還原。

## 4. 連線層:預開 upstream + 預驗 URL(賺 0.3-0.8 秒,兼殺埋 403 慢死路徑)

warm(§1c/§3b)每首歌完成 resolve 後,加一步 **1-byte 預驗**:
向 googlevideo 發 `Range: bytes=0-0` 嘅 GET(收 1 byte 即棄,唔存任何嘢):
- URL 已失效(403/410)→ 即場 bust + 重 resolve,**唔使等到用戶撳播先發現**
  (而家 stream.js 撞 403 要「fetch→fail→重 resolve→再 fetch」,play 路徑白蝕 2-7 秒)
- 順手令 googlevideo 嗰邊 CDN 節點行完 TLS 握手/定位檔案,正式播放嘅首 byte 快啲

## 5. 環境 checklist(執行 session 部署時逐項核對)

- **Mac 唔准瞓**:`pmset -g` 確認插電時 `sleep 0`(唔係就要 Eric 或有 sudo 環境設
  `sudo pmset -c sleep 0`)。Mac 一瞓,乜嘢優化都冇意義。
- cloudflared 用緊 QUIC(`cloudflared tunnel info` / config `protocol: quic`),
  同埋 `launchctl` 有 KeepAlive。
- 專案根目錄 700MB+ 影片檔(HANDOFF #892)照舊建議搬走,唔關 perf 事但阻住 git。
- `backend/cache/` 入 gitignore(入面係 URL json,唔係音訊,但都唔應該 commit)。

## 6. 預期效果(誠實版)

| 情境 | 而家 | 做完 §1-§4 |
|---|---|---|
| 開 App → UI 可用 | ~1s(已快) | 不變 |
| 撳歌(warm,以後係常態) | ~1.5-2.5s | **~1.2-2s** |
| 撳歌(冷,而家係常態) | ~5-8s | 罕見;發生時 ~2.5-4s |
| backend 重啟後第一播 | ~5-8s | ~1.5-2.5s(cache 由碟載返) |
| 自動接續下一首 | 可能冷 ~5s+ | 永遠 warm(§3b②) |

即係:由「成日 5 秒+」變「幾乎次次 1.5-2.5 秒,間中 3-4 秒」。
再快就要存音檔(已否決)或者搬 backend 出屋企(另一單嘢),呢版係唔存副本下嘅盡頭。

## 7. 實施次序

1. §1a 持久化 + §3a 熱身 ping(半日,零風險,即刻有感)
2. §1b/§1c 全庫保溫 loop(一日,連流量監察 log)
3. §3b warm 端點 + §4 預驗(半日)
4. §2a/§2b 冷路徑優化(半日)
5. §3c/§3d/§2c 可選項,逐個 AB
