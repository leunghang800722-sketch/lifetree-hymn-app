# YouTube 媒體落載 403 封鎖 —— 根因調查 + 應對方案(2026-08-19)

**狀態:** producer/keeper **停緊**(Eric 指示:1 完成 + 2/3 有初步方案先重開)。
**寫嘅時候:** 2026-08-19 11:5x。**Standing constraint(Eric 明確):NordVPN 唔會熄。**

## §1 實測到嘅事實(唔係推測)

用已知好片 `gF-eDlXq3II` 逐個組合試:

| 試法 | 結果 |
|---|---|
| `yt-dlp --list-subs`(metadata) | ✅ **完全正常**,拎到 zh-CN 字幕清單 |
| `-f 18`(現行做法) | ❌ **HTTP 403 Forbidden** |
| `-f "bv*[height<=360]"`(DASH 影片) | ❌ 403 |
| `-f bestaudio`(純音軌) | ❌ 403 |
| `--extractor-args youtube:player_client=ios` | ❌ 403 |
| `player_client=web` | ⚠ Requested format not available |
| `player_client=tv` | ⚠ The page needs to be refreshed |

**出口 IP:`187.15.89.159`,ASN `AS212238 Datacamp Limited`(US)** —— Datacamp 係 NordVPN 用嘅機房供應商。
**yt-dlp 版本:`2026.07.04`**(約六個星期前)。

**結論:唔係個別片、唔係 format 問題,係 `googlevideo.com` 媒體落載對機房 IP 全面封鎖;
`youtube.com` 嘅 metadata API 唔受影響。** 呢個非對稱正正解釋咗點解舊斷路器完全失效。

## §2 舊斷路器點解探唔到(已修)

舊邏輯:連續 3 次落載失敗 → 用 `listManualSubs(PROBE_VIDEO)` 做對照 → **通** → 判定「唔關 block 事,繼續」。
但 list-subs 行嘅係 metadata 通道,**封鎖只喺媒體通道**,所以對照永遠通,斷路器**由頭到尾冇響過**,
producer 空轉成晚,仲要每首失敗 3 次就判 `dl:dead` —— **685 首完全冇問題嘅片俾判死**。

**已修(commit 見 git log):**
1. `fetchLyrics.js`:直接數**連續 403 次數**(唔靠探測),夠 5 次即刻收工、寫 `/tmp/lyrics-403-block` flag,
   而且**唔再記 ledger、唔再判 `dl:dead`** —— 全域封鎖唔應該歸咎個別歌。
2. `producer-keeper.sh`:見到 flag 就唞 90 分鐘,之後用**真落載**(`-f 18` 落實體片)做探測,
   成功先清 flag 恢復;仍然失敗就繼續唞,**唔重開 producer 空轉燒失敗**。
3. 685 首錯判已 reset(`oneoff-resetDlDead403-20260819.mjs`):DB `dl:dead`→`cc:miss`,
   **同時清走 dl-failures ledger 嗰 685 條**(唔清嘅話 filter 一樣會剔走佢哋),
   名單留喺 `backend/data/dl-dead-reset-20260819.json` 方便追蹤佢哋落唔落到 draft。

## §3 403 本身點解決(NordVPN 唔熄嘅前提下)

**⚠️ 以下三個都未做,等 Eric 揀。** 全部都唔掂 Cloudflare / DNS / cert。

### 方案 A:換 NordVPN 出口伺服器(最直接,仍然係 NordVPN)
封鎖係**綁定嗰個出口 IP / ASN 段**,唔係綁定「用緊 VPN」呢件事。換一部 NordVPN server
好可能即刻通。**風險**:`api.god-music.com` 係 named tunnel、串流成條熱路徑都行緊同一個出口,
換 IP 期間會斷線幾秒到幾十秒 —— **要揀冇人聽歌嘅時段做,而且要即刻用真落載探測驗證**。
可以寫個腳本:換 server → 探測 → 唔通就再換下一部,自動輪替。

### 方案 B:升級 yt-dlp(最平,值得先試)
現用 `2026.07.04`。yt-dlp 對 YouTube 嘅 403 / nsig / PO token 幾乎**每兩三個星期**就有修正。
升級係單一指令、可回退,**建議喺方案 A 之前先試**,因為零網絡風險。

### 方案 C:PO Token / cookies(最耐用但最複雜)
YouTube 近年對「無登入 + 機房 IP」嘅媒體請求特別嚴。用 `--cookies-from-browser` 或者配置
PO Token provider,可以令請求變成「有身份」,機房 IP 嘅封鎖通常會鬆好多。
**風險**:要用真帳號 cookie,有帳號被標記嘅風險;亦要處理 cookie 過期。

### 唔建議
- **加大重試間隔 / 減速**:今次係 IP 段層面封鎖,唔係速率限制 —— 實測連第一次請求都 403,
  慢極都一樣 403,只會由「快速空轉」變成「慢速空轉」。

## §4 建議次序

1. **先試方案 B**(升級 yt-dlp)→ 用真落載探測驗證。零風險。
2. 唔通就**方案 A**(換 NordVPN server),揀冇人聽歌時段,做完即刻探測 + 驗返串流正常。
3. 兩樣都唔掂先考慮**方案 C**。
4. **三樣都未成功之前,producer 維持停**(Eric 指示),避免再燒失敗、再污染 ledger。

## §5 未解嘅問題

- 呢次封鎖係幾時開始?log 顯示落載失敗由 **8/18 19:00 UTC**(= 8/19 03:00 本地)開始急升,
  之前一直正常 —— 即係封鎖係**突然發生**,唔係漸進。係咪 NordVPN 嗰個 IP 俾人濫用之後上咗黑名單,
  抑或 YouTube 8/18 改咗政策,而家未查得到。
- `player_client=web` 報「format not available」而唔係 403,值得再試下唔同 format 組合 ——
  有可能某啲 client × format 組合仲有得落。

---

## §6 ✅ 已解決(2026-08-19 12:07)——方案 B 變奏版

**Eric 批方案 B(升級 yt-dlp)。執行時發現兩件事,結論同原本假設唔同:**

1. **本機已經係最新 stable**(2026.07.04)—— upstream 冇更新嘅 stable,所以「升級」本身係 no-op。
2. **但 nightly `2026.08.18.122307` 係 8/18 出 —— 正正就係 403 風暴開始嗰日。**

### 實測對照(6 條琴晚真係 403 過嘅片)

| | stable 2026.07.04 | nightly 2026.08.18 |
|---|---|---|
| `-f 18` | ❌ 6/6 全部 403 | ⚠ 6/6「Requested format is not available」 |
| `-f "bv*[height<=360]+ba"` | ❌ 403 | ✅ **6/6 全部成功**(6.4M–289M) |

**真根因(反轉咗 8/16 嗰個結論):YouTube 8/18 起唔再派 format 18(漸進式 mp4)**,而舊 stable 對住新版
player 全線攞 403。唔係「機房 IP 俾封」—— 出口 IP 冇變過,係 **client 太舊**。

⚠️ **2026-08-16 個註解寫住「用 format 18 避 DASH 403」,呢個結論而家完全反轉**(而家啱啱相反:
18 冇咗,要用 DASH)。已經喺 `downloadVideoLowRes` 寫明唔好照抄舊註解。

### 落咗嘅嘢
- `backend/tools/yt-dlp-nightly`:官方 nightly standalone binary。**系統 brew 嗰個 stable 完全冇郁**,想比對隨時試得返。
- `downloadVideoLowRes` 改用 nightly + `bv*[height<=360]+ba/bv*[height<=480]+ba/18/b[height<=480]/b`
  (留返 `18` 喺 fallback 鏈,第日 YouTube 派返就自動用返)。timeout 由 180s 加到 300s(DASH 要 merge)。
- 真 producer 實測 3 首:**3/3 出草稿、零 403**。12:07 重開 keeper。

### ⚠️ 一個技術債要記低
`yt-dlp-nightly` 係 **37MB binary 而家 commit 咗入 repo**。好處係任何 checkout 都即刻行得;
壞處係**每次更新 nightly 就多一個 37MB blob**,長遠會發大 repo。
**下次更新之前應該決定**:改做 gitignore + 寫個 `ops/lyrics/install-ytdlp.sh` 落載腳本,
定係接受呢個 repo 一路以嚟嘅做法(`backend/public/app.apk.bak-*` 都係咁 commit)。

### 方案 A(換 NordVPN 出口)唔使做
403 唔係 IP 封鎖引起,所以**唔使掂 VPN**。§3 方案 A/C 保留做將來參考。
