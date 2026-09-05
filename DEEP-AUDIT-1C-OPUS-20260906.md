# DEEP-AUDIT-1C-OPUS-20260906 — Opus 5 獨立驗收：`DEEP-AUDIT-1C-IOS-20260906.md`

驗收者：Opus 5（獨立，唔係執行者）。範圍：Phase 1C iOS 運行時 baseline。
**本次驗收冇改任何 source、冇 commit、冇開模擬器**（Android AVD 另一 agent 用緊；iOS sim 全程冇 boot）。
唯一對外動作：一條 `curl -sI` 打 `https://api.odemusics.com/api/hymns?lite=1`（只讀 GET，用嚟核 CF 壓縮頭），詳見 §4.3。

驗收方法：①逐 run 對返 `ops/perf/audit-20260906/1c-raw/` 原文；②所有衍生數字（median、T0 反推、bundle 差、壓縮比）自己由零重算，唔信報告嘅算術；③獨立交叉核對來源＝backend `[access]` log（`/tmp/hymn_backend.log`）＋ `backend/logs/client-log/client-log-2026-09-05.jsonl` ＋ `PERF-BASELINE-1B` / `PERF-STAGE2-2B` / `2D` / `DEEP-AUDIT-1E`。

---

## 0. 一句判詞

**量度本身可信、儀器誠實、絕大部分數字對得返 raw；但有 1 個真數字錯、1 條「環境干擾」敘事係誤讀自己嘅污染、1 條關於 `nativeStall` 嘅事實陳述完全錯、1 個最重要嘅可比對照（2B AFTER 376ms）被漏咗令報告白白唔敢落結論，另加 §4.1/§4.2 冇 raw 檔佐證。**
修正之後，1C 可以做 Phase 3 嘅「改前基準」——但**只有 §8 表列嗰批**，S5 播放線同 S6 弱網線唔合格。

---

## 1. ① 逐 run 對數（每個表 × 每個 cell × raw 原文）

### 1.1 S1（5 run × 13 欄）

逐 run 由 `1c-s1-run{1..5}.log` 嘅 client-log tail 按 deviceId 抽出，**除一格外全部對得返**：

| run | dev(尾6) | 報告 vs raw |
|---|---|---|
| 1 | b7b3c4 | app/cont/home/verMs/hymnsMs/att/ok1/a1t/a1b/a1p/lyrMs/fetch **全中**；**`byt` ✗** |
| 2 | ae759d | 全中 |
| 3 | 2c10cb | 全中 |
| 4 | 280bec | 全中 |
| 5 | 921b86 | 全中 |

#### 🔴 錯 #1 —— S1 run1 `byt` 抄錯，抄咗第二部機嘅數

報告 §1.1 run1 寫 `byt=2,371,796`。raw run1（`DEV=dc33113365eb5ef0f67dcb69b3b7b3c4`，尾 6 位 `b7b3c4`，clientTs `1788627681509`）原文係：

```
b0=0 app=163 cont=232 ... home=286 verMs=907 verSkip=0 hymnsMs=1359 att=1 ok1=1
a1t=549 a1b=790 a1p=20 ... byt=2376336 lyrMs=2537 lyrBytes=1330550 merged=1 fetch=14
```

**正確值 = 2,376,336**，同其餘 4 run 一模一樣。`2,371,796` 呢個數嘅真身係同一個 log 檔上面第 4 行、`DEV=f39fba943d527e400e4a98927cde5cd5`、`2026-09-05T16:33:53.767Z`（比 run1 早 27 分鐘）嗰條 beacon —— **另一個 session 遺留嘅機**。

影響：單格，唔改任何 median（`byt` 冇入 median 行）。但佢係下面錯 #2 嘅同一個根。

#### 🔴 錯 #2 —— 「backend catalog 中途長大」呢條敘事係假嘅，係污染讀錯

報告 §0 環境備註 + 限制 #9 都寫：「S1 run1 `n=6531` → run2-5 `n=6543`，另一個背景 job 喺量度視窗內寫 DB……令 S1 run1 同其餘 run 唔可以逐位比大細，只可以睇分佈。」

**raw 唔支持。** 5 條 S1 run 嘅自己嗰條 beacon 全部 `n=6543`：

| run | dev | n |
|---|---|---|
| 1 | b7b3c4 | **6543** |
| 2 | ae759d | 6543 |
| 3 | 2c10cb | 6543 |
| 4 | 280bec | 6543 |
| 5 | 921b86 | 6543 |

`n=6531` 只出現喺 `DEV=f39fba…` 嗰三條 16:33–16:37Z 嘅殘留 beacon 度，同 1C 五個 run 一條都唔相干。

**修正後嘅結論比報告好**：S1 五個 run 係喺**同一個 catalog 大細（6543）**下量嘅，**可以逐位比大細**。限制 #9 應該整條刪走，改成「16:33–16:37Z 有另一 session 嘅 iOS 機（`f39fba…`，n=6531）殘留喺同一個 client-log，S1 run1 嘅 `byt` 就係喺呢度抄錯咗」。

呢個正正係 memory `project-multi-sim-clientlog-contamination` 嗰條教訓再犯一次：**deviceId 過濾做咗，但「過濾完之後仲要核對每一格都嚟自同一條 beacon」呢步冇做**——12 格啱、1 格滑咗手去咗隔籬行。

### 1.2 S1 記憶體（§1.2）
全 5 run 三個時點 15 個數 **全部對得返 raw** ✓。

### 1.3 S1 render（§1.3）+ 正控時序（§1.4）
`Home=8 Library=6 Mine=8 Mini=8 TabBar=8 FullPlayer=0 AppContent=8 PlayerProvider=5` —— run1 raw 對得返 ✓。
frame timestamp 減 `host_launch_ts` 重算：f0 **+0.263s**、f1 +0.502s、f2 +0.661s、f7 +1.376s、f8 **+1.514s** —— 報告寫「+0.26 ~ +0.50 / +0.66」✓。
截圖親眼核過：`s1-run1-f8.png` = 全白（連狀態列都未畫）✓；`s1-run1-t3s.png` = 完整首頁（odely header／每日金句／隨心聽／語言 chips 帶 count／4 首歌／TabBar）✓。

### 1.4 S2（5 run × 9 欄 + perfHome 6 欄 + RSS 3 欄）
**90 格全部對得返 raw** ✓（`1c-s2-run{1..5}.log` 每個 run 檔尾嗰條 perfMarks/perfHome）。
⚠️方法論註：S2 五個 run **共用同一個 deviceId**（`921b86`，S2 冇 uninstall），所以 §1.1 講嘅「按 deviceId 過濾」喺 S2 **失效**——實際靠嘅係「每個 run 檔自己個 tail 嘅最後一條」。我用 `clientTs − 25000 − host_launch_ts` 逐 run 重算 native 段（1.204/1.203/1.215/1.215/1.261s，全部落喺 1.20–1.26s），確認五條 beacon 同五次 launch 一一對得上，**分派無誤**。呢步報告冇做，應該補做正控。

### 1.5 S3（10 條 perfNav）
10 條 tapToMount/tapToPaint **全部對得返** `1c-s3-nav.log`（`921b86`，clientTs 1788628085783→1788628105250）✓。

### 1.6 S5（§4.1 / §4.2）—— 🟠 冇 raw 檔佐證

報告開頭寫「原始證據**全部**喺 `ops/perf/audit-20260906/1c-*`」。**呢句對 §4.1 同 §4.2 唔成立。**
`1c-s5-playback.log` 得 14 行（`host_launch_ts` / pid / 3 個 rss / 4 個 tap ts / capture_ts），**冇 client-log tail**——同 S1/S2/S3 每個 raw 檔都有 tail 嘅做法唔一致。§4.1 三行 `nextTrackMs` 同 §4.2 兩行 `perfRenders`，raw 目錄入面一個字都冇。

我改由 backend live log 獨立核（`client-log-2026-09-05.jsonl`，S5 窗 = `host_launch_ts 1788628203.219` → `capture_ts 1788628393.220` ＝ **17:10:03Z → 17:13:13Z**）：

```
17:10:09.694 perfHome   chips=3.10 pages=3.26 today=17.12 recent=5.54 lib=213.49 libIdle=889
17:10:10.057 nextTrackMs ms=190 origin=start source=local surface=shuffle first=1  hymnId=6761
17:10:19.700 perfRenders t=15  Home=9  Library=6  Mine=9  Mini=9  TabBar=9  FullPlayer=4  AppContent=9  PlayerProvider=9
17:10:29.698 perfMarks   app=126 cont=214 mmkvRead=17 parse=20 n=6543 cacheReady=209 home=439 verMs=943 verSkip=1
17:10:36.036 nextTrackMs ms=42  origin=tapNext source=local  hymnId=8238
17:10:56.239 nextTrackMs ms=41  origin=tapNext source=local  hymnId=4377
17:11:04.707 perfRenders t=60  Home=13 Library=10 Mine=13 Mini=13 TabBar=13 FullPlayer=8 AppContent=13 PlayerProvider=15
```

**§4.1 三行同 §4.2 兩行 100% 對得返** ✓，數字冇作假。但佐證來源係一個**會 rotate、會被其他 session 寫入嘅 live 檔**，唔係凍結咗嘅 raw snapshot。→ **要求：補 `1c-s5-playback.log` 嘅 client-log tail（或另存一個 `1c-s5-beacons.jsonl`），否則呢兩節嘅 provenance 唔合 Phase 1 「證據表制」標準。**

同時發現 **§4.1 漏咗一個樣本**：`1c-s5-setup.log` 記低咗 `1788628142.007923 / tapped shuffle`（＝17:09:02Z），對應 backend log 一條 `ms=256 origin=start source=local surface=shuffle first=1 hymnId=3439`。即係話呢輪一共**4 次 shuffle 起播**（256/190/42/41 之中 256 同 190 都係 `origin=start`），**4/4 全部 `source=local`**，唔係報告講嘅 3/3。方向唔變（只令 §7 缺口更硬），但數要講返啱。

另外 S5 launch 自己嗰條 perfMarks（`app=126 cont=214 home=439 verMs=943 verSkip=1`）係**第 6 個 warm 開機樣本**，完全落喺 S2 五個 run 嘅 range（108–146 / 181–230 / 375–440）——一個免費嘅重現性正控，報告冇用。

---

## 2. ② 衍生數字全部自己重算

### 2.1 median（我由零計，唔抄）

| 表 | 指標 | 報告 | 我重算 | 判 |
|---|---|---|---|---|
| S1 | app / cont / home / verMs / hymnsMs / a1t / a1b / a1p / lyrMs | 163 / 232 / 286 / 897 / 1256 / 408 / 792 / 20 / 1965 | 同 | ✅ |
| S1 RSS（全 5） | +3s / +20s / +30s | 408000 / 538992 / 550640 | 同 | ✅ |
| **S1 RSS（剔 run1，n=4）** | **+3s** | **407864** | **406864** | 🔴 |
| **S1 RSS（剔 run1，n=4）** | **+20s** | **538992** | **539384** | 🔴 |
| **S1 RSS（剔 run1，n=4）** | **+30s** | **550640** | **551912** | 🔴 |
| S2 | app / cont / mmkvRead / parse / cacheReady / home | 112 / 185 / 16 / 18 / 180 / 382 | 同 | ✅ |
| **S2** | **verMs** | **1180** | **1181** | 🟠 |
| S2 RSS（全 5） | +3s / +20s / +30s | 508368 / 507728 / 508000 | 同 | ✅ |
| S2 perfHome | chips / pages / recent / lib / libIdle | 2.57 / 3.06 / 5.28 / 208.86 / 849 | 同 | ✅ |
| **S2 perfHome** | **today** | **15.28** | **15.29** | 🟠 |
| **S3** | **tapToMount** | **82** | **81.5** | 🟠 |
| **S3** | **tapToPaint** | **99** | **99.5** | 🟠 |

#### 🔴 錯 #3 —— 「剔除 run1」嗰行三個 median 全部錯
`n=4` 要內插。正確：+3s `(405728+408000)/2 = 406864`（報告 407864，**打多咗 1000**）；+20s `(538992+539776)/2 = 539384`；+30s `(550640+553184)/2 = 551912`。報告後兩格直接攞咗 lower median（第 2 個值），同第一格嘅（錯咗嘅）內插法**自相矛盾**——同一行三個數用咗兩種定義。
🟠 S2 `verMs`、`today`、S3 兩個 median 都係差 0.5–1 嘅 rounding，S3 兩格仲要一格向上一格向下。**唔影響任何結論，但「衍生數字要企得穩」呢條 09-02 學返嚟嘅教訓，呢張表冇完全守到。**

### 2.2 native 段（host launch → T0）—— 我完全重算

`T0_abs = clientTs/1000 − 25.000`（`perfMarks.js`：`const T0 = Date.now()` 喺 module 頂，`schedulePerfMarksBeacon()` 喺 module 底即刻 `setTimeout(…, 25000)`）：

| run | host_launch_ts | beacon clientTs | T0 反推 | native 段 |
|---|---|---|---|---|
| 1 | 1788627655.163 | 1788627681509 | 1788627656.509 | **1.346s** |
| 2 | 1788627773.352 | 1788627799591 | 1788627774.591 | **1.239s** |
| 3 | 1788627804.298 | 1788627830541 | 1788627805.541 | **1.243s** |
| 4 | 1788627835.219 | 1788627861458 | 1788627836.458 | **1.239s** |
| 5 | 1788627866.252 | 1788627892508 | 1788627867.508 | **1.256s** |

min 1.239 / median 1.243 / max 1.346 —— **同報告 §6 逐位一樣** ✅。
標準差：母體 σ = **41ms**、樣本 s = **46ms** —— 報告「<50ms」✅。

🟠 **但報告漏咗講偏差方向。** `clientTs` 喺 `sendBeacon()` 入面係喺 `await resolveDeviceId()` **之後**先取（`perfMarks.js:149→152`），加上 `setTimeout` 只會遲唔會早。兩個誤差都係**單向偏遲** ⇒ `T0_反推 = T0_真 + drift`，所以呢個 native 段係**上界**，唔係「近似值」。報告限制 #3 寫「通常 <50ms」但冇講係單邊。實務影響細（真值大約 1.19–1.30s），但講法要改成「native 段 ≤ 1.24s（median，上界）」。

### 2.3 warm 開機嘅 native 段（報告完全冇計，我補）

| S2 run | host_launch_ts | clientTs | native 段 |
|---|---|---|---|
| 1 | 1788627903.987 | 1788627930191 | 1.204s |
| 2 | 1788627935.472 | 1788627961675 | 1.203s |
| 3 | 1788627966.997 | 1788627993212 | 1.215s |
| 4 | 1788627998.516 | 1788628024731 | 1.215s |
| 5 | 1788628030.037 | 1788628056298 | 1.261s |

**median 1.215s，同冷開嘅 1.243s 差 28ms（<1 個 σ）。**
🏆 **新結論（報告冇講）：native 冷開段同 cache 狀態完全無關 —— 裝完即開 vs 已有 6543 首 MMKV cache，pre-JS 段一樣係 ~1.2s。** 即係話呢 1.2s 純粹係 dyld/Hermes/RN bridge/Pods 初始化，**唔係「第一次要起 DB / 起 cache」**。呢個對 Phase 2 揀 cluster 好重要：想壓冷開白畫面，落手位置係 native 段（1.2s），唔係 JS 段。

### 2.4 白畫面預算（報告冇合成，我合成）

| 段 | 冷開 (S1) | 熱開 (S2) |
|---|---|---|
| host launch → T0（native） | 1.346s | 1.204s |
| T0 → `app` mark | 0.163s | 0.112s |
| T0 → `home` mark | 0.286s | 0.382s |
| **host launch → `home` mark** | **1.632s** | **1.586s** |
| host launch → 完整內容（截圖實見） | ≤3.0s | 未量 |

🏆 **冷開同熱開「撳落去到 home mark」幾乎一樣（1.63s vs 1.59s）。MMKV cache 買唔到首屏時間，買到嘅係「見到內容」定「見到 spinner」。** 而 **1.2–1.35s（82%）係 pre-JS**。
⚠️ 同時提醒：S1 `home` 同 S2 `home` **語意唔同**（冷開 `hasData=false` ⇒ 記「spinner 出現」；熱開等 `cacheReady=180ms` 之後帶住真資料 mount ⇒ 記「內容出現」）。報告限制 #2 只講咗 S1 一邊，冇明文寫「S1 `home` 唔可以同 S2 `home` 對住比」——一個唔熟嘅讀者好易見到 286 < 382 就寫「冷開快過熱開」。**要加返呢條紅線。**

### 2.5 bundle 差
`3,740,962 − 3,716,119 = 24,843` ✅　`3,740,962 − 3,720,516 = 20,446` ✅
build provenance（`git rev-parse` `75f8f95…`、EXIT:0、16:56:17Z→16:59:55Z ＝ **3m38s**、`main.jsbundle` 3,740,962 B）逐項對得返 `1c-00-build-provenance.log` ✅。
「同 1B/2B 一樣快」✅ —— 1B 更正後係 3m33s（`PERF-BASELINE-1B` errata #1），3m38s 對得上。

### 2.6 「lite 細咗 35%」
`1 − 2,376,336 / 3,660,000 = 35.1%` ✅ 算術啱。
🟠 但係**低估**：2B 嗰 3.66MB 係 6405 首，1C 嘅 2.376MB 係 6543 首（+2.2%）。同 catalog 校正後係 **−36.6%/首**。細節，唔改判斷。

---

## 3. ③「同 09-02 唔可比」呢個講法——邊啲啱，邊啲唔啱

報告限制 #10 一句過講「§7 大部分唔可直接比」。**我唔同意「大部分」。逐項判：**

### 3.1 🔴 最大問題：§7 漏咗 2B **AFTER** 個數，令報告白白唔敢落結論

§7「S2 home mark」行只列咗 `2B: 856ms（D-1 BEFORE）`，然後寫：

> 「938→382，幾乎減半，已遠超網絡類型差異可以解釋嘅範圍，**較大機會反映緊 09-02 之後其他前端改動（F-3/F-4 等）嘅累積效果，但冇獨立 A/B 隔離，只能講方向**」

**「冇獨立 A/B 隔離」係錯嘅。** `PERF-STAGE2-2B-20260902.md` §3（F-3）就係一個**同日、同機、interleaved 嘅 BEFORE/AFTER A/B**，median 表原文：

```
| **median** | **856** | **40/72** | **376** | **237/539** |
                BEFORE home  BEFORE nav   AFTER home  AFTER nav
```

即係話正確嘅四點對照係：

| 量度 | S2 warm `home` median |
|---|---|
| 1B baseline（09-02 改前，loopback） | 938ms |
| 2B D-1 BEFORE（09-02，loopback） | 856ms |
| **2B F-3 AFTER（09-02，loopback，interleaved A/B）** | **376ms** |
| **1C（09-05，prod tunnel）** | **382ms** |

**判：376 vs 382 = 完全可比，差 6ms（1.6%），落喺 1C 自己 5 run 嘅雜訊（375–440）入面。**
可比理由（三條全部成立）：
1. 同一儀器同一 mark 定義（`perfMarks.js` `mark('home')`，兩次之間冇改過呢粒 mark）；
2. 同一部 Mac、同一 iPhone 模擬器級別、同一 Release build 流程；
3. **最關鍵：呢個 span 網絡無關。** S2 五個 run 全部 `verSkip=1`，`fetchAllHymnsWithRetry` 唔行；`home` mark 由 MMKV read(16ms)+parse(18ms)+cacheReady(180ms) 呢條純本機鏈決定。loopback vs tunnel 喺呢粒指標上**冇差異可言**。

⇒ **正確結論（報告應該落而冇落）：S2 warm 首屏 09-02 → 09-05 零 regression；938→376 嘅收益係 2B F-3 賺返嚟嘅、已由 interleaved A/B 隔離，1C 只係喺 prod tunnel 上確認佢守得住。** 報告嘅過度謹慎令一個乾淨嘅 PASS 變咗「只能講方向」。

### 3.2 逐項可比性重判（我嘅版本）

| 指標 | 1C 判 | 我判 | 理由 |
|---|---|---|---|
| `main.jsbundle` | 可比 | ✅ **可比** | 純檔案大細 |
| **S2 `home`（warm）** | 「只能講方向」 | ✅ **完全可比，且已有 A/B 隔離** | 見 §3.1。網絡無關 span |
| S1 `home`（cold） | 可比 | ✅ **可比** | 兩邊都由 T0 起計、都係 `hasData=false` spinner 語意；261→286（+25ms）＝雜訊 |
| perfHome 四個 section useMemo | 同數量級 | ✅ **可比**（純 CPU） | 2B 26–27ms 合計 vs 1C 26.3ms 合計 |
| **perfHome `lib`（Library render）** | 「差異細過 run-to-run 雜訊」 | 🟠 **可比，但報告講漏咗** | 2B D-1 **174–186**，1C **197.03–216.53** —— **兩個 range 完全唔重疊**。catalog +2.2% 只解釋得 ~4ms，唔解釋得 +25ms。唔應該講「細過雜訊」，應該講「小幅上移、成因未查、要 Phase 3 睇住」 |
| RSS（冷開 +3s） | §7 冇列 | ✅ **可比（同一 `ps -o rss=` 法）** | 1B（剔 run1）403,472 vs 1C 406,864 —— +0.8%，冇嘢 |
| **S3 tapToMount/Paint** | 「好可能冇行到 F-4 lazy-mount」 | 🔴 **同 2B F-4 AFTER 唔同「種」，唔可以放埋一齊比；但成因喺 1C 自己張表度** | 見 §3.3 |
| **S1 `hymnsMs`** | 不可直接比 | ✅ **同意，而且不可比嘅理由比報告寫嘅多兩條** | 見 §3.4 |
| S5 `nextTrackMs`（205 vs 190） | 「高度一致」 | 🟠 **技術上可比，但冇資訊量** | 兩邊都係 `source=local` 呢條 trivial 路。見 §5 |
| S5 RSS 絕對值 | 不可比 | ✅ 同意 | |
| S1/S2 native 段 | — | ⛔ **1B 冇量過，冇對照** | 1C 係第一次，佢自己就係 baseline |

### 3.3 🏆 S3 之謎：答案喺 1C 自己張 §2.2 表度，報告冇睇到

報告觀察到 1C 嘅 37–93/59–116 貼近 **F-4 BEFORE**（40/72），唔係 **F-4 AFTER**（237/539），然後寫「淨係觀察，冇追查」。

**唔使查 source 都答得到，證據喺 §2.2：`libIdle = 831 / 842 / 849 / 881 / 889 ms`。**
`perfMarks.js` 原文註：`libIdle=${getMark('libIdleMount')}` — `// E-2(PERF-STAGE2-2E-20260902)—— Library idle pre-mount 幾時 fire`。
即係話 **E-2 喺開機後約 850ms 就 idle-pre-mount 咗 Library**。S3 第一 tap 喺 launch 之後 **>60 秒**（`1788628085.363` vs S2 run5 launch `1788628030.037`）——撳落去嗰刻 Library **早就 mount 咗**。

⇒ 兩件事要分清：
- **F-4 lazy-mount 冇失效**，佢照樣行；
- **F-4 AFTER 嗰個 237/539ms 代價已經俾 E-2 抵銷咗** —— 用戶實際撳 tab 嗰刻永遠係「已 mount」狀態。
- 而 1B 限制 #9 講到明：screen 已經 mount 嘅時候，`tapToMount` 量緊嘅係「`setActiveTab` state commit → effect」，**唔係真 mount**。所以 1C 嘅 82ms 同 2B AFTER 嘅 237ms **量緊兩件唔同嘅事，本質上唔可以放同一條軸比**。

⇒ **正確講法：F-3+F-4+E-2 呢個組合喺 1C 上係健康嘅——warm home 376→382 守得住，而 lazy-mount 嘅 tap 代價經 idle pre-mount 之後喺真實使用序列入面收唔到。** 呢個係一個**正面驗收結果**，報告當咗「唔明嘅異常」擺低。

### 3.4 S1 `hymnsMs` 為何真係不可比（報告講咗 2 條，實際有 4 條）

報告列咗：(a) loopback vs tunnel、(b) payload 3.66MB→2.376MB。仲有兩條佢冇講：
- (c) **catalog 6405 → 6543 首**（+2.2%）；
- (d) **1B 嗰 10,269/11,626ms 根本唔係一次 fetch** —— `PERF-BASELINE-1B` errata #2 原文：「係第一次嘗試 8,000ms timeout abort + 第二次真 fetch 2,269/3,626ms。第一次嘗試 5/5 run 全部撞 8s timeout。**呢個數唔可以當「/api/hymns fetch 時間」做改前基準**」。

⇒ 1C 嘅 1,256ms 對 1B 嘅 10,269ms 唔單止跨網絡類型，仲係**跨定義**（單次成功 vs timeout+retry 總和）。報告冇引 1B 呢條 errata，令佢個「不可比」講得比實際弱。**如果要一個真嘅改前 fetch 基準，應該用 1B 嘅第二次 fetch 2,269/3,626ms，或者 2B D-1 嘅逐段拆解。**

---

## 4. ④ S1 `hymnsMs` 1.2–1.4s 經真 tunnel —— backend `[access]` / CF 交叉核

這節係本次驗收**新做嘅獨立工作**，1C 報告完全冇做。

### 4.1 五個 run 逐條配對 backend `[access]`

由 `/tmp/hymn_backend.log`（`server.js:107` 嘅 `[access]` 行；`bytes` 依 `server.js` §1 註解係**真正寫落 socket 嘅 byte，即 origin 壓縮後**）：

| run | launch (UTC) | `[access] GET /api/hymns` | server ms | origin bytes | client `a1t`(ttfb) | **`a1t` − server** | client `a1b`(body) | client `byt`(解壓後) |
|---|---|---|---|---|---|---|---|---|
| 1 | 17:00:55 | 17:00:57.990Z | **156** | 341,746 | 549 | **393** | 790 | 2,376,336 |
| 2 | 17:02:53 | 17:02:56.015Z | **150** | 341,745 | 542 | **392** | 828 | 2,376,336 |
| 3 | 17:03:24 | 17:03:26.878Z | **2** | 301,629 | 388 | **386** | 781 | 2,376,336 |
| 4 | 17:03:55 | 17:03:57.792Z | **1** | 301,629 | 408 | **407** | 792 | 2,376,336 |
| 5 | 17:04:26 | 17:04:28.757Z | **2** | 301,629 | 400 | **398** | 841 | 2,376,336 |

🏆 **`a1t − server_ms` ＝ 393 / 392 / 386 / 407 / 398 ms —— 五個 run 極度一致（spread 21ms）。** 呢個係 **tunnel + TLS + Cloudflare edge 嘅固定開銷 ≈ 393ms（median）**。
呢個一致性同時係**儀器嘅獨立正控**：client 端 `a1t` 同 server 端 `[access] ms` 係兩套完全獨立嘅時鐘同計數器，兩者相減得出一個穩定常數 ⇒ 兩邊都冇作假、冇量錯。

順帶：run1/2 server 156/150ms 對 run3/4/5 嘅 1–2ms —— **backend 嘅 lite payload cache 喺 run3 開始命中**（bytes 亦由 341,746 跌到 301,629，即由「即時壓縮」轉做「預壓好嘅 buffer」）。而 client 見到嘅最快 ttfb（388ms，run3）**就係 server 2ms 嗰個 run**。因果鏈完全對得上。

`/api/hymns/lyrics` 同一批：99 / 96 / 2 / 2 / 38 ms，850,351 / 850,351 / 762,493 ×3 bytes ——同一個 cache 行為。

### 4.2 hymnsMs 1.2–1.4s 到底俾邊個食咗

以 median run 拆：

| 段 | ms | 佔比 |
|---|---|---|
| backend 真做嘢（DB/序列化/壓縮） | **1–156**（median 2） | **~0.2%** |
| tunnel + TLS + CF 固定開銷 | **393** | **~31%** |
| body 傳輸（~342KB on the wire） | **781–841**（median 792） | **~63%** |
| `JSON.parse`（2.38MB） | **15–20** | **~1.5%** |
| **合計 = `hymnsMs`** | **1,189–1,389** | |

`a1t + a1b + a1p` 逐 run 加返：549+790+20 = **1359** ＝ run1 `hymnsMs` ✅（5 run 全部啱）——內部一致。

有效吞吐 = 341,746 B ÷ 0.792 s ≈ **432 KB/s**。
🔗 **同 memory 對得返**：`project-uplink-bottleneck-065mbps`（tunnel 0.65MB/s、Eric 部機 492KB/s）、`project-hls-startup-rate-zero-kick`（350–500KB/s）。**呢條 tunnel 嘅 432KB/s 唔係新問題，係第三次獨立量到同一個天花板。**

⇒ **判：報告 §7「唔可以單憑 ms 講 tunnel 反而快過 loopback」呢個謹慎係啱嘅，但佢冇做嘅交叉核其實可以講得更硬 —— `hymnsMs` 1.2–1.4s 入面 backend 佔 0.2%、parse 佔 1.5%，94% 係網絡。改 backend、改 parse 都救唔到呢一段；只有再壓 payload 或者行 edge cache 先郁得到。**

### 4.3 CF 壓縮（`br`）—— 唯一一次對外請求

```
$ curl -sI -H 'Accept-Encoding: br, gzip' https://api.odemusics.com/api/hymns?lite=1
HTTP/2 200
content-encoding: br
cache-control: private, max-age=0, must-revalidate
etag: W/"1788628952133.7773-62676992-lite"
vary: Accept-Encoding
cf-cache-status: DYNAMIC
server: cloudflare
→ SIZE_DOWNLOAD=342,096  TIME_STARTTRANSFER=1.145s  TIME_TOTAL=2.021s  SPEED=169 KB/s
```
（2026-09-05T17:25:03Z，即量度完之後約 20 分鐘）

三項發現：
1. **CF 出 `br`**，wire size 342,096 B。壓縮比 `2,376,336 / 341,746 = 6.95×`（run1/2 即時壓縮）、`/301,629 = 7.88×`（run3–5 cache buffer）。歌詞就差好多：`1,330,550 / 762,493 = 1.74×`（CJK JSON 壓唔落）。
2. 🔴 **`cf-cache-status: DYNAMIC` + `cache-control: private, max-age=0, must-revalidate`** ⇒ **每次冷開都食足全條 origin round-trip，CF edge 一 byte 都冇幫手 cache。** 而 response **有 `etag`** —— 即係「可以行 304 條件式請求」嘅材料已經喺度，只係無人用。**呢個係 Phase 2 一個現成 cluster 候選：edge-cacheable lite catalog（或起碼 304 revalidation）可以直接扣走上面 §4.2 嗰 94%。**
3. 我自己喺同一部 Mac 上打（loopback → CF → hairpin 返呢部 Mac）都只得 **169 KB/s / ttfb 1.14s**，比模擬器見到嘅 432 KB/s 更差 —— 進一步證實樽頸喺 tunnel 上行，唔喺 client。

---

## 5. ⑤ S5 全部 `source=local` —— 對 baseline 嘅意義

### 5.1 用 1E 真用戶數據量化呢個缺口

`DEEP-AUDIT-1E-TELEMETRY-20260906.md` §2.1（n=636，08-23→09-05）iOS 部分：

| platform | source | origin | n | p50 | p90 | max |
|---|---|---|---|---|---|---|
| ios | **stream** | **start** | **87** | **1,669** | **9,553** | **17,223** |
| ios | stream | auto | 65 | 951 | 8,376 | 14,927 |
| ios | local | auto | 192 | 66 | 101 | 783 |
| ios | **local** | **start** | **7** | **205** | 235 | 235 |

⇒ iOS **`origin=start`** 嘅樣本入面：**stream 87 : local 7 ＝ 93% : 7%**。

**1C S5 四次起播（256/190/42/41）全部落喺嗰個 n=7 嘅格。** 換句話講：

> **1C 為「7% 嘅起播路徑」建立咗一個 190ms 嘅改前基準，而為「93% 嘅起播路徑（p90 = 9.55 秒）」建立咗零基準。**

而 §7 仲用「1B 205ms vs 1C 190ms **高度一致**」做對照 —— 兩邊都係嗰個 n=7 嘅 trivial 格（1E 顯示 `ios local/start` p50 就係 **205ms**，1B 個數好可能就係嗰 7 條之一）。**呢個「一致」冇資訊量，唔應該擺喺對照表最後一行當作一個令人安心嘅收尾。**

### 5.2 判

- 報告講「呢個唔係量度失敗」—— **一半啱**。方法上冇犯錯（`HomeScreen.js` W3 明文設計偏向本機歌，可預期），但**對「Phase 1 建立改前基準」呢個目的嚟講，S5 係一次 miss**：Phase 3 改起播路徑之後，冇一個 1C 數字可以攞嚟做 before/after。
- 限制 #7 嘅措辭「唔係『呢批功能冇問題』，只係『呢次 3 首歌啱啱好都揀咗本機已落載嘅歌』」—— 誠實 ✅，但**嚴重性低估**。應該升做**執行單缺口**（同 S6 同級），唔係一條普通限制。

### 5.3 🔴 而且限制 #7 入面有一句係**事實錯誤**

報告 §4.1 同限制 #7 兩處都寫：

> 「執行單提到嘅事件名 `nativeStall` 喺現有 source 搵唔到任何 call site，只喺 comment 出現過，**呢個名唔對應任何實際 beacon**。」

**完全錯。** 核查：

```
$ grep -ho '"event":"[a-zA-Z_]*"' backend/logs/client-log/client-log-2026-09-0*.jsonl | sort | uniq -c | sort -rn
 816 "event":"nativeStall"     ← 全部 event 入面最多嗰個
 371 "event":"nextTrackMs"
  77 "event":"hlsStartupKick"
  72 "event":"midStallNudge"
  ...
```

`nativeStall` 係 09 月頭 client-log 入面**出現次數最多嘅 beacon**。佢喺 JS 度搵唔到，係因為**佢根本唔喺 JS**：

```
frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js:17
// 每步 native URLSession 直接 POST /api/client-log(event=nativeStall),JS 死咗…

frontend/hymn-app/ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AudioPlayer.swift:824
let body: [String: Any] = ["event": "nativeStall", "clientTs": iso, "detail": detail]
```

`SWStallWatchdog` 喺 `AudioPlayer.swift` 度出現 3 次 —— **呢個 build 用嘅 Pods source 確確實實帶咗個 watchdog**（見 memory `project-native-stall-watchdog-plan`：整件事嘅設計目的就係「JS 死咗都要有人報」，所以佢**必然唔會**喺 `App.js` 度有 call site）。

⇒ 三重影響：
1. 報告向讀者陳述咗一個**假嘅否定**（「呢個 event 唔存在」），會誤導 Phase 2 剷錯嘢；
2. 搜尋方法有系統性缺陷 —— **只 grep 咗 JS，冇 grep native / Pods / config plugin**。iOS 呢個 app 有 native-side 儀器，以後任何「呢個 event 存唔存在」嘅問題都要連 `ios/Pods` + `plugins/` 一齊搜；
3. 反過來講，**1C S5 嘅「零 `nativeStall`」係一個真嘅（雖然弱嘅）陽性訊號** —— native watchdog 確實裝咗、確實會 fire（14 日 816 次），只係呢 3 分鐘本機播放冇撞到。呢個比報告寫嘅「呢個名唔存在」有價值得多。

### 5.4 點補（建議，唔使 build，唔使改 source）

排優先次序：

| # | 做法 | 成本 | 拎到乜 |
|---|---|---|---|
| **A** | **清 prefetch/本機音訊 cache 再播** —— app 冇 uninstall（保住 MMKV catalog），只 `xcrun simctl` 入 app container 刪走本機音訊快取目錄，再撳「隨心聽」×5 | ~10 分鐘，零 build | 迫 `source=stream`，直接量到 `ios stream/start` 改前基準（對住 1E p50 1,669 / p90 9,553 校） |
| **B** | **由 `/api/hymns` 揀一首 backend resolve-cache 冇、機上冇嘅歌，用 deep link / 搜尋直接播** | ~15 分鐘 | 最貼近「新歌冷起播」最壞情況；可同時捉 `hlsStartupKick` / `hlsFallback` |
| **C** | uninstall → install → **第一件事就撳隨心聽**（唔行 S1/S2 熱身） | ~5 分鐘 | 全冷機起播；但 shuffle 揀邊首唔受控，可能又中本機歌 |
| **D** | 直接用 1E 嘅 `ios stream/start`（n=87）做改前基準，1C 唔補 | 零 | 真用戶數據，但混咗網絡/機型/時段，唔係受控量度 |

**建議：A 做主線（受控、可重複、零 build），D 做外部效度校驗。** A 做完先叫 S5 有 baseline。
⚠️ 做 A 之前要記 memory `project-hls-window-source-local-trap` 嗰條：**每首歌都要逐首核對 beacon 真係 `source=stream` 先算數**，唔可以事後才發現又行咗 `file://`。

---

## 6. ⑥ S6 未做 —— 影響同替代方案

### 6.1 我核實咗報告嘅三條理由

| 報告理由 | 我核 | 判 |
|---|---|---|
| repo 冇 throttle 工具 | `find . -iname "*throttle*"` → 只有 `node_modules/lodash.throttle` | ✅ 屬實 |
| 冇 Network Link Conditioner | 未見 prefpane | ✅（我冇 root，冇再驗一次全盤 find） |
| 冇 passwordless sudo ⇒ `pfctl`/`dnctl` 用唔到 | 合理 | ✅ |

🟠 **但 memory 提過嘅「throttle-proxy」報告冇追到底。** 我查到出處係 `HLS-EXEC-STARTUP-KICK-20260902.md`（`swDebugAV` 亦只喺呢個檔出現）—— 即係話嗰次係**一次性寫嚟即用嘅 exec-sheet 步驟，冇留低成一個 repo 工具**。報告寫「memory 提過嘅工具唔喺呢個 repo」結論啱，但冇講「佢曾經以 exec sheet 形式存在過、寫返一個唔難」。
另外 **`tinyproxy` 有裝**（`/opt/homebrew/bin/tinyproxy`，CLAUDE.md `PROTECT_RE` 保護緊）—— 但 tinyproxy **冇頻寬限制功能**，做唔到節流，用唔着。

### 6.2 影響

S6 冇做 ⇒ **本輪體檢完全冇量到「弱網」呢個維度**，而恰恰係弱網先至會令 §4.2 嗰 94% 網絡佔比爆煲、令 §5 嗰個 p90 9.5 秒起播出現。**S5（全 local）+ S6（未做）＝ 播放同網絡兩條線一齊零覆蓋。** 呢個係 1C 真正嘅結構性缺口，比報告自認嘅「S6 係最大缺口」再大一級。

### 6.3 替代方案（排序）

| # | 做法 | 要唔要 root | 要唔要 Eric | 評 |
|---|---|---|---|---|
| **1** | **自寫 Node 節流反向代理**（~50 行：`http.createServer` → 轉發 `api.odemusics.com`，response stream 加 token-bucket 限速 + 固定延遲），app 側喺一次**臨時、事後還原、唔 commit** 嘅 `config.js` `API_BASE` 改動下重 build | ❌ | ❌ | 🥇 **最推**。完全受控、可重複、參數可掃（1Mbps/200ms、3G、抖動）。代價＝一次 3m38s rebuild。同「唔改 source」唔衝突：呢個係下一張執行單嘅受控實驗，唔係本次驗收 |
| **2** | **Android AVD `emulator -netspeed edge -netdelay gprs`**（或 console `network speed`） | ❌ | ❌ | 🥈 現成、零工具。但要同用緊 AVD 嗰個 agent 排期（CLAUDE.md 並發 guard）。**額外好處：memory 講明 Android 係免費對照組**，而 1E 顯示 Android telemetry **一條都冇**，順手補埋兩個缺口 |
| **3** | Eric 真機（iPhone）Settings → Developer → Network Link Conditioner | ❌ | ✅ | 外部效度最高（真蜂窩、真 CPU），但要佔 Eric 時間，且唔可重複 |
| **4** | 加一條 passwordless sudoers 俾 `dnctl`/`pfctl` | ✅ | ✅ 要佢批 | ⛔ **唔建議**：改系統安全設定，收益唔值 |
| **5** | 只靠 1E 真用戶蜂窩數據 | ❌ | ❌ | 唔係受控量度，做唔到 before/after |

**建議：1 做主線，2 做交叉核（順便開 Android telemetry），3 留返 Phase 3 收貨嗰陣。**

---

## 7. ⑦ 限制段誠實度

**整體：高。** 13 條限制入面 10 條寫得準、有原因、唔卸膊，特別好嘅有：

- 限制 #1（run1 RSS 離群 = 自己影 9 張截圖嘅 I/O）—— **自己揭自己嘅正控污染，仲喺表入面另開一行剔除版**。教科書級；
- 限制 #5（S2 run4 RSS 跌 → 冇解釋就寫「唔判斷」）；
- 限制 #6（`navBeaconsSent>=10` 係自己執行單撞出嚟嘅，唔係新 bug）；
- 限制 #13（多 session 共用 client-log 嘅風險，主動引 09-01 memory）—— **諷刺嘅係佢寫咗呢條，然後喺 §1.1 同 §0 正正踩咗兩次（錯 #1、錯 #2）。知道有陷阱 ≠ 避到。**
- 「執行者唔判 PASS/FAIL」呢條守到，**冇一句判詞**。✅

**扣分：**

| # | 問題 | 嚴重度 |
|---|---|---|
| 7-a | 🔴 **限制 #7 入面「`nativeStall` 唔對應任何實際 beacon」係事實錯誤**（§5.3）。一條「限制」聲明變咗一個假斷言 | **高** |
| 7-b | 🔴 **限制 #9「catalog 中途變大」係假嘅**（§1.2 錯 #2）。呢條「限制」本身唔存在 | **高** |
| 7-c | 🟠 **§1.4 嘅 1B 對照係跨時鐘比較，應該剷走唔係 hedge**（見下） | 中 |
| 7-d | 🟠 限制 #3 冇講 T0 反推誤差係**單邊偏遲**（§2.2） | 低 |
| 7-e | 🟠 「原始證據全部喺 `1c-*`」對 §4.1/§4.2 唔成立（§1.6） | 中 |
| 7-f | 🟠 冇明文禁止「S1 `home` 對 S2 `home`」（§2.4） | 低 |

#### 7-c 詳說：§1.4 個對照根本唔可以做

報告 §1.4 寫：「本次 **+0.66s** 仲係全白 —— 比 1B 嗰陣『**T0+648ms** 已見 spinner』更慢見到嘢」，跟住 hedge 一句「唔可以講變慢咗，因為冇截到中間張圖」。

**hedge 嘅結論啱，但理由錯，而個對照本身唔應該存在：兩個數用緊兩個唔同嘅時間原點。**
- 1B 嘅 648ms 係由 **T0**（bundle entry）起計；
- 1C 嘅 +0.66s 係由 **host launch** 起計。
- 1C 嘅 T0 喺 host+**1.346s** ⇒ 「1B 嘅 T0+648ms」換算成 1C 嘅軸 ＝ **host+1.994s**。
- 1C 最後一張密集幀係 f8 @ **host+1.514s**，下一張已經係 +3s。**host+1.994s 嗰個位 1C 根本冇幀。**

⇒ 1C 嘅截圖證據**結構上冇能力**講「+0.66s 全白 vs 1B 648ms 有 spinner」呢句嘢。呢句應該整段刪，唔係加註腳。
（順帶：f8 @ host+1.514s ≈ T0+168ms，而 `app` mark ＝163ms —— **f8 影正 app mount 嗰一刻，仲係白，完全合理。**）

---

## 8. ⑧ 可以做「改前基準」嘅項目清單

### 8.1 ✅ 可以直接用（信心高、定義清、可重現）

| # | 指標 | 1C 值 | 佐證 | 重複性 |
|---|---|---|---|---|
| B1 | `main.jsbundle` | **3,740,962 B** @ `75f8f95` | build provenance log | 決定性 |
| B2 | **native 冷開段（host→T0，上界）** | **median 1.243s**（1.239–1.346，σ 41ms） | 我重算 §2.2 | 5 run，σ<50ms |
| B3 | **native 熱開段（新，我補）** | **median 1.215s**（1.203–1.261） | 我重算 §2.3 | 5 run |
| B4 | S1 冷開 `app` / `cont` / `home` | 163 / 232 / 286ms | raw ×5 | 好 |
| B5 | **S2 熱開 `home`（首屏 KPI）** | **382ms**（375–440） | raw ×5 **＋ S5 launch 第 6 個樣本 439ms** | 極好；**同 2B AFTER 376ms 直接可比** |
| B6 | S2 `mmkvRead` / `parse` / `cacheReady` | 16 / 18 / 180ms | raw ×5 | 極好（spread <10ms） |
| B7 | perfHome 四 section useMemo 合計 | **26.3ms**（chips 2.57 / pages 3.06 / today 15.29 / recent 5.28） | `performance.now()`，sub-ms | 極好 |
| B8 | **perfHome `lib`（Library 首次真資料 render）** | **208.86ms**（197.03–216.53） | raw ×5 ＋ S5 213.49 | 好。⚠️ 對 2B 174–186 **唔重疊**，要睇住 |
| B9 | `libIdle`（E-2 idle pre-mount fire 時間） | **849ms**（831–889） | raw ×5 | 好 |
| B10 | S1 冷開 render 次數 | Home/Mine/Mini/TabBar/AppContent=8, Library=6, FullPlayer=0, PlayerProvider=5 | 5 run **完全一致** | 決定性 |
| B11 | **`/api/hymns` 三段拆解（我新做，§4）** | server **2ms** / tunnel+CF **393ms** / body **792ms** / parse **20ms** | client × backend 雙盲交叉核 | 極好（`a1t−server` spread 21ms） |
| B12 | **tunnel 有效吞吐** | **432 KB/s**（模擬器）；**169 KB/s**（Mac hairpin curl） | §4.2 / §4.3 | 同 memory 三次獨立量度吻合 |
| B13 | `byt` / `lyrBytes`（解壓後） | 2,376,336 / 1,330,550 B | raw ×5（run1 用**更正後**值） | 決定性 |
| B14 | origin 壓縮後 bytes / 壓縮比 | 341,746（即時）/ 301,629（cache）；6.95× / 7.88×；歌詞 1.74× | `[access]` | 決定性 |
| B15 | `ok1=1` 第一次嘗試成功率 | **5/5**（prod tunnel 上首次驗 2B F-1） | raw ×5 | 好 |
| B16 | S1 RSS +3s / +20s / +30s（剔 run1） | **406,864 / 539,384 / 551,912 KB**（**更正值**） | raw ×4 | 好 |
| B17 | S2 RSS +3s | **508,368 KB** | raw ×5 | 好（+20s/+30s 有 run4 離群） |

### 8.2 ⚠️ 有條件可用（用之前要加註）

| # | 指標 | 條件 |
|---|---|---|
| C1 | S1 `hymnsMs` **1,256ms** | 只可以同「同一條 prod tunnel、同一 catalog 大細」嘅未來量度比。**唔准**同 1B/2B loopback 數比。改後對比要連 `[access]` server ms 一齊記（否則分唔開係代碼贏定係網絡當日順） |
| C2 | S1 `verMs` 897ms / S2 `verMs` **1,181ms** | 網絡相關，同 C1 一樣條件 |
| C3 | S3 `tapToMount` 81.5 / `tapToPaint` 99.5ms | **只可以同「同樣係已 mount 狀態」嘅未來量度比**（見 §3.3）。要量真 mount 成本，要另外設計（tap 喺 `libIdle` fire 之前） |
| C4 | S5 RSS 512,000 → 222,224 KB | 只可以講方向（「播放期 RSS 下跌」），絕對值唔比 |
| C5 | S5 `FullPlayer` render 4(t=15) / 8(t=60) | 正控性質（>0），唔係效能 KPI |

### 8.3 ⛔ 唔可以做基準

| # | 指標 | 點解 |
|---|---|---|
| D1 | **S5 `nextTrackMs` 190/42/41（＋setup 256）** | 4/4 `source=local` ＝ 只覆蓋 iOS 起播嘅 **7%**（1E: 87 stream vs 7 local）。**93% 嘅路徑（p90 9.55s）零基準。** 必須先做 §5.4 方案 A |
| D2 | 全部 HLS/stall 家族（`hlsStartupKick`/`hlsFallback`/`midStallNudge`/`*_giveup`/`PlaybackError`/**`nativeStall`**） | 本輪 0 條。**唔係「唔存在」**（`nativeStall` 14 日 816 條，native Swift 發），係「呢 3 分鐘冇撞到」 |
| D3 | 弱網任何數字 | S6 完全未做 |
| D4 | S1 run1 `byt` 原值 2,371,796 | **錯數**，用 2,376,336 |
| D5 | 「catalog 6531→6543 中途變大」 | **唔存在嘅現象**，唔好寫入任何後續文件 |
| D6 | S1 冷開 `home`(286) vs S2 熱開 `home`(382) 之間嘅比較 | 兩者語意唔同（spinner vs 真內容） |
| D7 | S3 第 11–15 次 tap | `navBeaconsSent>=10` cap 掉咗。**cap 掉嘅係 cycle 3 全部 5 次 tap**（tap#10 @ `1788628105.010` 對應最後一條 beacon `1788628105250`；cycle 3 由 `1788628107.172` 開始）——報告寫「cycle 3 嘅其中之後幾下」唔夠準 |

---

## 9. 要修嘅嘢（交返 Sonnet 5 / 更新 1C 報告）

**必改（改咗先可以入 Phase 2）**
1. §1.1 run1 `byt` → **2,376,336**（§1.2 錯 #1）
2. 剷走 §0 環境備註 + 限制 #9「catalog 中途變大」，改寫成「另一 session 殘留污染，run1 `byt` 曾抄錯」（錯 #2）
3. §4.1 + 限制 #7 剷走「`nativeStall` 唔對應任何實際 beacon」，改成「native Swift（`AudioPlayer.swift:824` via `withSwiftAudioExStallWatchdog.js`）發，14 日 816 條，本輪 0 條 ＝ 冇撞到」（§5.3）
4. §1.2「剔除 run1」三個 median → **406,864 / 539,384 / 551,912**（§2.1 錯 #3）
5. §1.6 補 `1c-s5-playback.log` 嘅 client-log tail；§4.1 加返第 4 個樣本（`ms=256 hymnId=3439`），改成 **4/4 local**
6. 剷走 §1.4 同 1B 「648ms」嘅對照（跨時鐘，§7-c）

**應改**
7. §7 加返 **2B F-3 AFTER = 376ms**，並改寫成「S2 warm home 零 regression、收益已由 2B interleaved A/B 隔離」（§3.1）
8. §7 S3 行改寫：F-4 冇失效，係 E-2 `libIdle`≈849ms 令 tap 時 Library 已 mount；兼引 1B 限制 #9「已 mount ⇒ 唔係真 mount 時間」（§3.3）
9. §7 `lib` 行改寫：2B 174–186 vs 1C 197–217 **唔重疊**，唔好講「細過雜訊」（§3.2）
10. 限制 #3 註明 T0 反推係**上界**（單邊偏遲）；§6 加埋 warm native 段 1.215s（§2.2/§2.3）
11. 限制 #7 由「限制」升做「執行單缺口」，同 S6 同級（§5.2）
12. 加一條新限制：「S1 `home` 同 S2 `home` 語意唔同，唔准對比」（§2.4）
13. 加返 §4 backend `[access]` 交叉核（呢節本應係 1C 自己做——量度經 prod tunnel 而唔核 origin 側，等於淨得一半證據）

**建議補做（新執行單）**
14. S5 補做：清本機音訊 cache → 5 次 shuffle，逐首核 `source=stream`（§5.4 方案 A）
15. S6：自寫 Node 節流 proxy（方案 1）＋ Android AVD `-netspeed`（方案 2，順便開 Android telemetry）

---

## 10. 附：本次驗收用過嘅獨立來源

| 來源 | 用途 |
|---|---|
| `ops/perf/audit-20260906/1c-raw/*.log`（13 檔） | 逐 run 逐格對數 |
| `ops/perf/audit-20260906/1c-screens/s1-run1-f8.png`, `s1-run1-t3s.png` | 親眼核 §1.4 |
| `ops/perf/audit-20260906/1c-00-build-provenance.log` + `1c-xcodebuild-tail30.log` | build provenance |
| `/tmp/hymn_backend.log` `[access]` 行 | **§4 交叉核（新）** |
| `backend/logs/client-log/client-log-2026-09-0*.jsonl` | §1.6 S5 佐證、§5.3 event 盤點 |
| `frontend/hymn-app/src/perfMarks.js`（只讀） | T0/25000ms/nav cap/`clientTs` 取值時機 |
| `frontend/hymn-app/index.js`（只讀） | 確認 perfMarks 係第一行 import |
| `frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js` + `ios/Pods/SwiftAudioEx/.../AudioPlayer.swift`（只讀） | **§5.3 推翻 `nativeStall` 唔存在** |
| `PERF-BASELINE-1B-20260902.md`（含 errata #1/#2/限制 #9） | §3 可比性 |
| `PERF-STAGE2-2B-20260902.md` §1/§3（D-1 / F-3 / F-4） | **§3.1 嗰個被漏咗嘅 376ms** |
| `DEEP-AUDIT-1E-TELEMETRY-20260906.md` §2.1 | **§5.1 量化 S5 缺口** |
| `curl -sI https://api.odemusics.com/api/hymns?lite=1` | §4.3 CF `br` / `DYNAMIC` |

**衛生**：本次驗收全程冇 boot 任何模擬器（`xcrun simctl` 一次都冇 call）、冇改 source、冇 commit、冇碰 Cloudflare API/DNS。scratch 冇用到。
