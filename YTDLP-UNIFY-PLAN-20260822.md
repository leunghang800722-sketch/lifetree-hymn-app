# YTDLP-UNIFY-PLAN-20260822 — yt-dlp 版本統一 + 串流健康檢查補盲點

> 背景:2026-08-22 全庫 100% 播歌失敗事故。根因 = 串流路徑用緊系統 brew `yt-dlp`
> 2026.07.04(太舊),YouTube 新版 player 簽出嚟嘅 URL 只開放**頭 1MiB**,再攞落去
> 全部 403。`brew upgrade yt-dlp`(→2026.8.19,改用 VISIONOS client)已止血,
> 30/30 抽驗過,零代碼零 restart。本文檔規劃**結構性解決**,唔係止血紀錄。
> 事故細節見 memory `project-stream-outage-ytdlp-stale-2026-08-22`。
>
> **狀態:✅ 已執行(2026-08-22 晚,Opus 5)。Eric 三條拍板見下面 §0.5;執行結果見文末 §7。**

---

## §0.5 Eric 2026-08-22 拍板(三條,對應 §5)

1. **統一方向:保守做法。** 選項 C 嘅結構(單一 repo binary + 每日 canary),但
   **canary 過都唔自動換 binary** —— 淨係寫警報/通知,等人手(Eric/session)批咗
   先真正切換(`update-ytdlp.sh --apply`)。唔做「canary 過自動換」嗰個激進版本。
2. **健康檢查頻率:6 小時 → 3 小時。**
3. **時機:即刻做**,唔等下一個 restart 窗 —— P0(healthcheck 補盲點 + 更新機制)
   同 P1(統一 binary 路徑 + preVerify)兩樣即刻一齊做,P1 自己開一次 restart 窗。

## §0 TL;DR(俾 Eric 一眼睇晒)

兩個病,兩劑藥:

| 病 | 藥 | 使唔使 restart backend |
|---|---|---|
| **病1:兩條 code path 各自對住唔同版本 yt-dlp**(串流用 brew 系統版,歌詞線用 8/19 凍結嘅 nightly binary),今次串流嗰邊先冧 | **全部 code path 統一指向一個 repo 管理嘅 binary**(`backend/tools/yt-dlp`),配一個**每日自動更新 + 更新前 canary 驗證 + 驗唔過自動 rollback** 嘅更新機制 | 改 `resolveAudio.js` 嗰步要(行 deploy gate);更新機制本身唔使 |
| **病2:6 小時健康檢查全程假陽性**——佢淨係攞 `bytes=0-65535`(64KB),啱啱好喺舊版仍開放嘅頭 1MiB 之內,所以「resolve 得、頭段得、但 1MiB 之後 403」呢種病完全睇唔到 | 健康檢查加 **Layer B:繞過 backend cache,直接向 googlevideo 攞一段 1MiB 之後嘅 mid-range**(64KB @ offset 2MiB),用同一個統一 binary resolve。呢下今次事故第一 tick 就會響 | 唔使(純 shell script,launchd 每次重新讀) |

三件事想 Eric 拍板,詳見 §5:
1. **統一方向**:全部指向單一 repo binary(nightly channel)+ 每日 canary-gated 自動更新 —— 定係保守啲,兩個 binary 照舊、只加版本比對警報?(我推薦前者,理由 §2.2)
2. **健康檢查頻率** 6 小時 → 3 小時(成本幾乎零,worst-case 盲窗減半)
3. **P1 嗰批 backend 代碼改動**(統一 binary 路徑 + `preVerifyUrl` 補洞)要一次 backend restart,照常行 deploy gate,搭下一個 restart 窗口

---

## §1 現況盤點(全部今日查實,附行號)

### 1.1 兩條(其實係兩條半)yt-dlp

| binary | 路徑 | 版本(2026-08-22 查實) | 邊個用緊 |
|---|---|---|---|
| brew 系統版 | `/opt/homebrew/bin/yt-dlp` | **2026.8.19**(今日事故先升,之前係 2026.07.04) | 串流 resolve + 大部份 pipeline(見 1.2) |
| repo「nightly」 | `backend/tools/yt-dlp-nightly`(37MB standalone,未 commit 落 git、亦未寫入 gitignore) | **2026.08.18.122307** | 淨係 `fetchLyrics.js` 落載片嗰一步 |

⚠️ 兩個諷刺位,證明「兩條 binary」呢個結構本身有病:
- 所謂 nightly binary 其實係 **8/19 凍結咗嘅 snapshot,冇任何機制會更新佢**。今日 brew 一升級,佢反而變咗**全機最舊**嗰個。下一次 YouTube 郁 player,先冧嘅會係歌詞線。
- 連 `fetchLyrics.js` 自己內部都係分裂嘅:落載片用 nightly([fetchLyrics.js:466](backend/scripts/fetchLyrics.js:466)),但 `--list-subs`([:338](backend/scripts/fetchLyrics.js:338))同 `--write-subs`([:357](backend/scripts/fetchLyrics.js:357))用返 bare `yt-dlp`(即 brew 版)。

### 1.2 bare `yt-dlp`(靠 PATH 搵 brew 版)嘅全部 call site

**關鍵運行時(播歌命脈)**
- [resolveAudio.js:159](backend/lib/resolveAudio.js:159) — 串流 resolve(`--get-url`),今次事故正主
- [admin.js:238](backend/routes/admin.js:238) — admin preview(`execFile('yt-dlp', …)`)

**Pipeline / 排程 job**(`--flat-playlist` 列表類,唔行 player 簽名,今次冇中招,但為咗「單一版本」不變量一齊統一)
- [hymnDb.js:327](backend/lib/hymnDb.js:327)
- [reconcileCore.js:45](backend/lib/reconcileCore.js:45)、[:68](backend/lib/reconcileCore.js:68)、[:89](backend/lib/reconcileCore.js:89)(channelScan/growLibrary 經呢度)
- [fetchLyrics.js:338](backend/scripts/fetchLyrics.js:338)、[:357](backend/scripts/fetchLyrics.js:357)

**低優先尾巴**
- [alignBackfill.js:111](backend/scripts/alignBackfill.js:111)、[:139](backend/scripts/alignBackfill.js:139)
- [generate_hymns.js:37](backend/generate_hymns.js:37)(legacy 一次性工具，2026-09-02 Stage 3 已移除)
- [producer-keeper.sh:133](ops/lyrics/producer-keeper.sh:133) — ⚠️ 順手發現佢仲用緊 `-f 18`,而 format 18 YouTube 8/18 起已經唔派(8/19 事故已實錘),呢句大概率係死代碼/注定失敗,P2 一齊執

各 launchd plist(`com.hymnapp.backend` / `growlibrary` / `fetchlyrics` / `deadlinkcheck` / `backfillmeta` / `alignbackfill`)全部特登 set PATH 包 `/opt/homebrew/bin` 先搵到 brew yt-dlp —— 統一做絕對路徑之後,呢個 PATH 依賴對 yt-dlp 嚟講就唔再 load-bearing(ffmpeg/whisper 等其他工具照舊要)。

### 1.3 健康檢查現況 + 點解今次全程假陽性

- **檔案**:[stream-healthcheck.sh](ops/lyrics/stream-healthcheck.sh)(2026-08-19 上一次 403 事故之後先裝)
- **排程**:launchd `com.hymnstream.healthcheck`(`/Users/macbookpro/Library/LaunchAgents/com.hymnstream.healthcheck.plist`),每 21600s(6 小時)一次。⚠️ label 特登唔用 `com.hymnapp.*` prefix——各班 checkpoint 核對 `launchctl list | grep hymnapp` 要**啱啱好 7 個 job**,呢條不變量唔可以郁。
- **邏輯**:curl 三個固定 id(42/77/5431)嘅 `/api/stream/<id>`,`-r 0-65535`(64KB),≥2 首返 206 = 健康;唔健康就寫警報落 `docs/SUPERVISION-LOG.md`,state 落 `backend/data/stream-health-state.json`,歷史落 `backend/data/stream-health.log`。

**假陽性機理(今次事故)**:病係「簽名 URL 只開放頭 1MiB,之後 403」。健康檢查攞 0–64KB,**完全落喺開放區內**,所以 `ok=3` 一路綠燈(log 實錘:8-21 19:14 至 8-22 13:14 五個 tick 全部 `ok=3 fail=0`)。同一原理,backend 入面嘅 `preVerifyUrl`([resolveAudio.js:285](backend/lib/resolveAudio.js:285))用 `bytes=0-0` 做預驗,都係 1 byte @ offset 0 —— 同款盲點,warm 預驗照樣全過。而真正播放路徑(warm 攞 `bytes=0-12582911`、冷路徑 forward AVFoundation 嘅開放式 range)一過 1MiB 即死。呢個係「探測 range 同真實負載 range 唔同象限」嘅典型假陽性。

順帶一提:`stream-health ok=3 假陽性`已經係第**二**次害人(8-20 O1/O2 smoke 嗰次已經記過一筆),今次係同一個盲點嘅第二種表現形式,唔補唔得。

---

## §2 方案一:yt-dlp 版本統一

### 2.1 三個選項擺出嚟

| 選項 | 內容 | 好處 | 壞處 |
|---|---|---|---|
| **A. 全部統一用 brew 系統版** | `resolveAudio` 照舊,`fetchLyrics` 改返用 brew;定期 `brew upgrade` | 最少改動;brew stable 經過 release 測試 | **正正係今次死因**:brew 只跟 stable release,2026.07.04→2026.8.19 隔咗 6 星期;YouTube 郁 player 係以「日」計嘅軍備競賽,stable channel 結構性追唔切。8/19 已實錘 stable 對新 player 100% 403、nightly 6/6 落到 |
| **B. 保持兩個 binary,加開機/定時版本比對,唔同就報警** | 現狀 + 警報 | 零行為改動,風險最低 | **「版本相同」根本唔係正確嘅不變量**:兩個唔同版本可以都正常(8/19–8/22 之間就係),同一個版本都可以對某條 code path 壞。比對警報只會製造噪音,而且完全冇解決「凍結 snapshot 冇人更新」呢個真問題——警報響完,更新照樣係人手 |
| **C. 全部統一指向一個 repo 管理嘅 binary(nightly channel),配自動更新 + canary + rollback** ⭐推薦 | 詳見 2.2/2.3 | 消滅「版本漂移」成個 bug class;追新速度以日計;更新有擋板唔會盲升 | 要改 8 個 call site + 一次 restart;nightly 理論上有 regression 風險(用 canary + rollback 對沖) |

### 2.2 推薦:選項 C,理由

1. **staleness 先係主敵,唔係 instability。** 呢個 app 三次大事故(8/18 OCR 403、8/19 診斷、8/22 全庫串流)全部係「binary 舊過 YouTube player」,零次係「yt-dlp 新版本 regression」。藥要對準病。
2. **「單一版本」係唯一守得住嘅不變量。** 兩個 binary 就算今日同步,聽日都會再漂移(今日 nightly 反而舊過 brew 就係活例)。一個 binary,漂移在定義上唔存在。
3. **nightly regression 風險用機制對沖,唔係用「唔更新」對沖。** 更新前 canary(真 resolve + 真 mid-range fetch)驗唔過就唔換、換完保留舊版隨時 `mv` 返轉頭、加埋 §3 嘅 3 小時健康檢查兜底 —— 三層擋板,比「凍結唔郁等爆」安全得多。
4. brew 版**保留唔剷**,做人手比對/緊急後備(今次 8/19 nightly vs stable 對照實測就係咁做),但唔再係任何 code path 嘅正主。

### 2.3 實施細節

#### (a) 單一路徑 + 共用 module

- Binary 定名 `backend/tools/yt-dlp`(現有 `yt-dlp-nightly` 首次更新時原子改名接手;37MB standalone macOS build,同一隻嘢)。
- 新增 `backend/lib/ytdlpBin.js`(十零行):

```js
// 全 app 唯一嘅 yt-dlp 路徑。env YTDLP_BIN 可 override(實驗/比對用)。
// 點解要統一:見 YTDLP-UNIFY-PLAN-20260822.md(8/22 全庫 403 事故)。
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const YTDLP = process.env.YTDLP_BIN
  || path.join(__dirname, '..', 'tools', 'yt-dlp');
```

- 改動 call site(全部係「`yt-dlp` → `"${YTDLP}"`」機械替換,唔郁任何 flag/邏輯):
  - **P1(要 restart)**:`resolveAudio.js:159`、`routes/admin.js:238`、`lib/hymnDb.js:327`、`lib/reconcileCore.js` ×3
  - **P1 同批但唔使 restart**(script 每次冷 spawn):`fetchLyrics.js:338/:357`(順手剷咗佢自己個 `YTDLP` const 改 import),`fetchLyrics.js:466` 指返新路徑
  - **P2**:`alignBackfill.js` ×2、`generate_hymns.js:37`（2026-09-02 Stage 3 已移除）、`producer-keeper.sh:133`(呢條順手處理 `-f 18` 死格式:改 `bestaudio` 或者直接剷,執行時睇上下文定)
- `backend/tools/.gitignore` 加 `yt-dlp*`(37MB binary 唔准入 git;而家係 untracked 裸奔,遲早俾 `git add -A` 誤中——雖然多 session 紀律本身已禁 `git add -A`,都係落閘穩陣)。repo 冇 binary 時嘅 bootstrap 一句寫入 `ops/launchd/README.md`:行一次 update script 就會落返嚟。

#### (b) 更新機制:`ops/ytdlp/update-ytdlp.sh`

流程(全程唔掂 backend process):

1. 攞 GitHub `yt-dlp/yt-dlp-nightly-builds` 最新 release 版本號;同 `backend/tools/yt-dlp --version` 一樣就收工(零下載)。
2. 落載 `yt-dlp_macos` 去 temp(scratchpad/暫存,唔好直接寫目標路徑),`chmod +x`。
3. **Canary(用 temp 嗰個新 binary,唔係現役)**,三關全過先算合格:
   - `--version` 行到(binary 冇爛)
   - 對 2 個固定 id:`-f "bestaudio[ext=m4a]/bestaudio" --get-url`(同 `resolveAudio` default strategy 一字一樣)攞到 http URL
   - 攞到嘅 URL 即場 `curl -r 2097152-2162687`(64KB @ 2MiB)要返 206 —— **就係今次事故嘅病灶 range**,canary 直接驗個病
4. 合格 → `cp 現役 backend/tools/yt-dlp.prev && mv temp新版 backend/tools/yt-dlp`(mv 原子;行緊嘅 exec 揸住舊 inode 唔受影響)。
5. 唔合格 → 剷 temp、現役唔郁、寫警報落 `docs/SUPERVISION-LOG.md`(「nightly 新版 canary 唔過,維持 X 版,人手睇」)。
6. 每次結果(升咗/skip/rollback)一行 append 落 `backend/data/ytdlp-update.log`。

排程:launchd user agent,label **`com.hymnstream.ytdlpupdate`**(跟 healthcheck 例,唔用 hymnapp prefix,唔郁 7-job 不變量),每日 **05:30**(全日最靜時段,避開 17:30 taxonomy 夜班同日間收聽)。

Rollback SOP(寫入 script 頭注釋):`mv backend/tools/yt-dlp.prev backend/tools/yt-dlp` 一句搞掂,唔使 restart(逐次 spawn)。

#### (c) 換版後嘅殘留風險同點解可以接受

- **resolve-cache 殘留舊版 URL**:backend in-process cache(+落碟)最長揸 5 小時([MAX_TTL_MS](backend/lib/resolveAudio.js:21))。就算舊 URL 換版後變壞,現有自癒鏈(冷路徑 403 → `bustCache` → re-resolve)每首歌自動翻新,唔使 restart。今次事故止血後都係靠呢條鏈自己好返。
- **format 一致性不變量**([resolveAudio.js:49-55](backend/lib/resolveAudio.js:49) 嗰段:同一首歌重 resolve 必須出同一 format,唔係會 stutter):新版 yt-dlp 可能揀第個 itag,「播緊途中 URL 過期重 resolve 撞正啱啱換咗版」理論上會中一次。機率 =(05:30 有人播緊 × 嗰首啱好過期)≈ 忽略;真中咗都係一次過嘅 glitch,唔係持續病。唔值得為佢加複雜度,記低算。
- **canary 嗰刻 YouTube 429/bot-check**:update skip + 警報,現役唔郁 —— fail-safe 方向正確。

---

## §3 方案二:健康檢查補盲點

### 3.1 核心改動:加 Layer B「1MiB 之後嘅真實 range 探測」

改 [stream-healthcheck.sh](ops/lyrics/stream-healthcheck.sh) 一個檔(launchd 每次重新讀 script,**唔使任何 restart/bootout**):

- **Layer A(照舊)**:3 × `/api/stream/<id>` `-r 0-65535`,≥2 首 206 = pass。角色:驗「backend 生存 + 全鏈路頭段通」。
- **Layer B(新)**:對同一批 id(揀法見 3.3):
  1. 用**統一 binary**(`backend/tools/yt-dlp`,即同 backend 現役同一隻)行 `--get-url`(同 resolveAudio default strategy 同款 flag)
  2. 攞到嘅 googlevideo URL **直接** `curl -r 2097152-2162687`(64KB @ 2MiB),期望 206
  3. ≥2 首過 = Layer B pass;整體 healthy = A **且** B 都 pass
- log 行擴充做:`ok=3 mid=3 ver=2026.08.19.xxxx consecutiveFail=0`(`ver` = 現役 binary 版本,事後 forensics 一眼對到「邊個版本開始壞」)。
- 警報文案加返 Layer B 診斷指引(mid fail + ok pass = 正正係 1MiB 病,直接指去本文檔)。

**點解 Layer B 一定要繞過 backend、直打 googlevideo:** 如果照舊經 `/api/stream` 攞 mid-range,warm bufferCache(封頂 12MB,絕大部份詩歌成首入晒)可以由記憶體直接吐返 206 俾你,**upstream 死咗都照綠燈** —— 補完一個假陽性即刻換第二個。直打 CDN 就冇任何 cache 層隔喺中間,量度嘅先係真嘢。同時保留 Layer A,兩層合埋先分得清「backend 死」vs「upstream 死」。

**驗證返今次事故會唔會捉到:** 舊 binary 簽嘅 URL,`-r 2097152-…` 必 403(病灶定義如此)→ Layer B 三首全 fail → 第一個 tick 就寫警報。✅

### 3.2 backend 側:`preVerifyUrl` 同款盲點(P1,搭 restart 順風車)

[resolveAudio.js:287](backend/lib/resolveAudio.js:287) 個預驗 range `bytes=0-0` → 改 **`bytes=2097152-2097152`**(1 byte @ 2MiB):

- 403/410 → 照舊 bust + re-resolve(而家連「1MiB 病」都會喺 warm 階段提早引爆自癒,唔使等用戶撞)
- **416**(檔案細過 2MiB)→ 當 pass(短檔唔存在呢個病;唔好 bust)—— 呢條分支一定要寫,唔係就會誤殺短歌
- 其他行為(收 1 byte 即棄、cancel body、網絡錯誤唔當死)全部不變,latency 零差別

順帶講明**唔改**乜:warm/冷路徑本身唔使加料——佢哋攞嘅 range 天然就過 1MiB,病一出現佢哋本身就係「症狀」,由 Layer B 同 preVerify 負責做「探測」就夠,唔好疊床架屋。

### 3.3 探測 id 揀法 + 416 陷阱

Layer B 個 mid-range @ 2MiB 要求條音軌 ≥2MiB(m4a ~128kbps 即 ≥ 約 2 分鐘)。執行時要:
1. 對 42/77/5431 逐首查實際音軌大細(`yt-dlp --print filesize` 或現成 curl content-range)
2. 唔夠長嘅換走,改用 3 首查實 ≥4 分鐘、唔同 org、長期在庫嘅歌,id 寫死落 script 加注釋
3. script 入面 416 一律當 **config 錯誤**寫獨立 tag(`mid=cfg-err`),唔好當 upstream fail 亂響警報

### 3.4 頻率:6h → 3h(等 Eric 拍板)

- 成本:每 tick 多 2-3 次 yt-dlp spawn(~7s each)+ 3 條 64KB curl,每 3 小時一次,對 YouTube 同本機負擔可以忽略;成個 tick 由 ~5s 變 ~30s,無所謂
- 收益:worst-case 盲窗 6h→3h;配合 Fable 5 每 3 小時 supervision check(會讀 SUPERVISION-LOG),警報最遲 ~4 小時內有人睇到
- 改法:plist `StartInterval` 21600→10800,要 `launchctl bootout + bootstrap` 一次(唔關 deploy gate 事,唔關 7-job 不變量事——label 唔係 hymnapp prefix)
- 唔再縮落去(如 1h)嘅理由:呢類病唔係分鐘級惡化,3h 已經匹配病嘅時間尺度;再密只係加 YouTube 觸點冇實益

### 3.5 誤報分析(預答「會唔會嘈到煩」)

| 情境 | 表現 | 處理 |
|---|---|---|
| 單一首歌俾人落架/上游壞片 | 3 首入面 1 首 fail | ≥2 過先算 pass 已吸收(A/B 同一門檻) |
| 探測嗰刻撞正 429/bot-check | resolve fail → 該 id fail | 真係 IP 級 block 嘅話串流本身都受影響,響警報係啱嘅;一次性 blip 就靠「連續失敗計數 + 首次/每4次先寫 log」現有節流(唔改) |
| Layer B 揀咗短歌 | 416 | 3.3 嘅 cfg-err tag,唔入 fail 計數 |
| backend 死咗但 upstream 好地地 | A fail、B pass | 警報文案分開兩層報,診斷唔會俾人帶錯方向 |

節流機制(首次失敗響一次、之後每 4 個 tick 響一次、恢復響一次)原封不動,唔會洗版。

---

## §4 優次、工作量、執行順序

| 批次 | 內容 | 改動範圍 | 使唔使 restart | 估工作量 | 前置 |
|---|---|---|---|---|---|
| **P0-a** | 健康檢查 Layer B + ver logging + 探測 id 核實(§3.1/3.3) | `stream-healthcheck.sh` 一個檔 | ❌ | ~1h(含用 `HYMN_STREAM_BASE` 死 port 技倆 + 人手 curl 壞 URL 驗埋失敗路徑——呢個 script 2026-08-19 嗰個「靜靜哋乜都冇做」嘅伏唔好再中) | 無。**批咗即做,唔使等 P1** |
| **P0-b** | `update-ytdlp.sh` + `com.hymnstream.ytdlpupdate` plist + 監督下行第一次(會即刻把 8/18 凍結版升到最新 nightly,修正「repo binary 舊過 brew」嘅倒掛) | 新 script + 新 plist,零 backend 代碼 | ❌ | ~2-3h(canary 失敗路徑要真測:揼個假 binary 落 temp 位驗 rollback) | 無 |
| **P0-c** | 健康檢查 6h→3h(§3.4) | plist 一行 + bootout/bootstrap | ❌ | ~15min | Eric 拍板 |
| **P1** | `ytdlpBin.js` + 6 個 backend call site 統一 + `preVerifyUrl` 2MiB 探針 + server.js 開機 log 一行印 binary 版本/路徑 + tools/.gitignore | `resolveAudio.js` / `admin.js` / `hymnDb.js` / `reconcileCore.js` / `fetchLyrics.js` / `server.js` | ✅ 行 deploy gate,**搭下一個現成 restart 窗口,唔好為佢單獨 restart**(brew 版啱啱升完,而家冇燃眉之急);Eric 真機 QA 進行中一律唔准部署(舊紀律) | ~2h 代碼 + 驗收 | P0-b 行過至少一次(確保 `backend/tools/yt-dlp` 存在且係最新) |
| **P2** | 尾巴:`alignBackfill.js`/`generate_hymns.js`（2026-09-02 Stage 3 已移除）換路徑、`producer-keeper.sh` 剷 `-f 18` 死格式、`ops/launchd/README.md` 補 bootstrap 一句 | 三個低風險檔 | ❌(scripts 逐次冷 spawn) | ~1h | P1 |

執行順序:**P0-a → P0-b →(拍板後)P0-c → P1(等 restart 窗)→ P2**。P0 三件全部唔掂 backend process、唔掂 hymns.db、唔掂 DNS/cert(派工照舊明文禁 Cloudflare)。

### P1 驗收清單(執行 session 照做)

1. `grep -rn "yt-dlp" backend --include="*.js"` 淨返 comment 同 `ytdlpBin.js` 一處定義(admin.js execFile 陣列都計)
2. `YTDLP_BIN=/opt/homebrew/bin/yt-dlp node -e 'import("./backend/lib/ytdlpBin.js").then(m=>console.log(m.YTDLP))'` 驗 env override
3. restart 後:開機 log 見到 binary 版本行;`/api/stream/<id>` 抽 3 首 `-r 0-65535` **同** `-r 2097152-2162687` 全 206;admin preview 貼一條 URL 行到
4. `preVerifyUrl` 416 分支:搵一首 <2MiB 短歌行 warm,確認冇被誤 bust(log 冇「bust+re-resolve」)
5. fetchLyrics 手動單首 dry-run:`--list-subs` 同落載兩步都行新路徑(`ps` 影到絕對路徑)

---

## §5 等 Eric 拍板嘅三件事(重複 §0,一個位睇晒)

1. **統一方向揀 C**(單一 repo binary + 每日 canary-gated 自動更新)—— 定係揀 B(兩 binary + 版本比對警報)?我強烈推薦 C:B 嘅「版本相同」不變量係假嘅,而且冇解決「凍結 binary 冇人更新」呢個今次真死因。如果 Eric 對「每日自動換 binary」有保留,可以退一級做「每日 check + canary,但**唔自動換**,只寫警報等人手批」——結構一樣,得個 `mv` 要人手,遲啲信得過再開返自動。
2. **健康檢查 6h → 3h?**(P0-c,成本幾乎零)
3. **P1 restart 搭邊個窗口**:照常等下一次有嘢要 restart 嘅 deploy gate 一齊過,定係專登開一個窗?(我建議搭順風車,唔急)

---

## §6 明確唔做嘅嘢(邊界)

- ❌ 唔郁 `STRATEGIES` 三隊 fallback 次序、`player_client=tv` extractor-args——新版 yt-dlp 換咗 VISIONOS client 之後呢啲策略值不值得重審係另一個 topic,唔好夾埋呢單做(一單事故一單修)
- ❌ 唔加「backend 直接寫 SUPERVISION-LOG 嘅 403 streak 警報」——同 Layer B 功能重疊,警報渠道統一經 healthcheck 一個口,唔好兩把聲
- ❌ 唔剷 brew 系統版 yt-dlp,佢降級做人手比對工具
- ❌ 唔掂 hymns.db、唔掂 DNS/cert/token、唔喺 Eric 真機 QA 期間 restart(全部舊紀律,寫埋落派工 prompt)

---

## §7 執行結果(2026-08-22 晚,Opus 5)

### 7.1 做咗乜

| 批次 | 內容 | 狀態 |
|---|---|---|
| P0-a | `stream-healthcheck.sh` 加 Layer B(直打 googlevideo,64KB @ 2MiB)+ ver logging + cfg-err tag | ✅ 四條路徑實測過 |
| P0-b | `ops/ytdlp/update-ytdlp.sh` + `com.hymnstream.ytdlpupdate`(每日 05:30) | ✅ 四條路徑實測過 |
| P0-c | healthcheck 6h → 3h(`StartInterval` 10800) | ✅ 已 bootout+bootstrap,`launchctl print` 核過 |
| P1 | `ytdlpBin.js` + 全部 call site 統一 + `preVerifyUrl` 2MiB + 開機 log | ✅ 已 commit + restart + 端到端驗過 |
| P2 | `alignBackfill` / `generate_hymns` / `producer-keeper.sh` 尾巴 | ✅ 一齊做埋(scripts 逐次冷 spawn,唔使等 restart) |

Call site 實際做咗 **14 個**(規劃書盤點 8 個 + 執行時另外揾到 `backfillMeta.js`、
`backfillAlbumFromPlaylists.js`、`fetchACMCatalog.js` 三個 execFile 陣列式)。
`grep -rn "yt-dlp" backend --include="*.js"` 剩返嘅全部係 log/錯誤字串,唔係 call site。

### 7.2 ⚠️ 同規劃書唔同嘅一個實施決定:pip venv,唔係 standalone binary

規劃書 §2.3(a) 寫「binary 定名 `backend/tools/yt-dlp`,37MB standalone」。**實測行唔通**:

- 嗰個 adhoc-signed 37MB Mach-O,每次 exec 都俾 macOS `XprotectService` 重新掃一次。
  淨係 `--version` 都要 **26–42 秒**(user time 得 0.6s = 全程等緊掃描;實測嗰陣
  XprotectService 食 55% CPU、`syspolicyd` 8.7%)。
- 而 `resolveAudio.js` 個 `RESOLVE_TIMEOUT_MS` 係 **12 秒** —— 即係話照規劃書做嘅話,
  **每一次冷 resolve 都必定 timeout**,三個 strategy 全死,成個串流會冧。呢個會**比原本
  個病仲衰**。
- 舊嗰個 `yt-dlp-nightly`(8/18)一樣咁慢(38s),即係**呢個問題一路都喺度**,
  淨係因為歌詞線係批次 job、冇人等,所以冇人為意。
- 試過剷 `com.apple.provenance` xattr、試過本機 `codesign --force --sign -` 重簽,
  **兩樣都冇用**。

改用 **pip 裝落 venv**:同一個 nightly 版本(`2026.08.20.234504`),`--version` **0.17 秒**,
真 resolve **2.9 秒**(12s timeout 之內好鬆動)。brew 版一路咁快都係同一個原因
(佢係 python entry script,唔係大 Mach-O)。

結構(a/b 雙 slot + symlink,點解要咁見 script 頭註釋):

```
backend/tools/yt-dlp            → symlink(全 app 唯一 canonical path)
backend/tools/ytdlp-venv-a/     → 而家現役:nightly 2026.08.20.234504
backend/tools/ytdlp-venv-b/     → 閒置/rollback:stable 2026.8.19
```

切換 = 揈條 symlink(原子,冇「裝到一半俾人 exec」嘅窗口);rollback = 揈返轉頭,
唔使網絡、唔使 restart backend。

### 7.3 驗證(唔止 happy path)

**healthcheck 四條路徑**(用假 binary 吐過期 URL / 死 port / 唔存在路徑真造出嚟):
① 兩層都過 → healthy(92s/tick) ② A 過 + B 全 403(=8/22 個病嘅形態)→ **第一個 tick
就響**,警報直接指去 yt-dlp 版本 ③ A 死 + B 過 → 報「問題喺 backend 側」④ binary 唔見
→ cfg-err,唔當 upstream fail。節流(第 1 次 + 每 4 次)實測有效。

**update script 四條路徑**(真造出版本差:slot b 裝返 stable 2026.8.19):
① up-to-date 收工 ② canary 過 + 保守模式 → **現役真係冇郁**,只寫通知
③ canary 唔過(假 video id)→ **連 `--apply` 都擋住** ④ `--apply` → 真正揈 symlink,
通知附 rollback 一句。

**P1 驗收清單**(規劃書 §4 五條):
1. ✅ grep 剩返全部係字串
2. ✅ `YTDLP_BIN` env override 行到
3. ✅ restart 後開機 log 印到版本+路徑;`/api/stream` 三首 `0-65535` **同**
   `2097152-2162687` 全 206
4. ✅ `preVerifyUrl` 416 分支(<2MiB 短歌)實測冇被誤 bust
5. ✅ fetchLyrics 三步(`--list-subs` / `--write-subs` / 落載)全部指新路徑

### 7.4 殘留風險 / 未做

- **Legacy `.cjs` 一次性工具**(`expand_hymns*.cjs`、`e2_*.cjs`、`fix_dead_ytdlp.cjs`（2026-09-02 Stage 3 已移除）、
  `tools/scrape_ytdlp.cjs`)仲用緊 bare `yt-dlp`(即 brew 版)。冇改:全部係
  一次性 scraper,唔喺任何排程/運行時路徑。真係要再用嗰陣先順手改。
- **`preVerifyUrl` 由 1 byte @ 0 改做 1 byte @ 2MiB**:對 <2MiB 嘅短歌會收 416,
  已加分支當 pass。但 warm 對呢啲短歌嘅「預熱 CDN」效果會弱咗少少(唔再掂到頭段)。
  影響極細,冇加補償邏輯 —— 加多一次 request 唔值。
- **37MB standalone binary 一直 commit 咗落 git**(規劃書講錯咗話 untracked)。
  而家由 HEAD 剷走 + gitignore 落閘,但 **git history 入面條 blob 仲喺度**,repo 大細
  唔會即刻縮。冇做 history rewrite(共用 worktree 多 session,風險遠大過收益)。
- **XProtect 每次掃大 binary** 呢個機器層面問題冇解決,淨係繞開咗。如果第日有第二個
  大 standalone binary 入到熱路徑(例如 whisper 換 build),同一個伏會再中一次。
