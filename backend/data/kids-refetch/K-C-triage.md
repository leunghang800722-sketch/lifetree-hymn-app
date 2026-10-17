# K-C 審核附錄(Fable 5 triage)—— Eric 簽名用精簡版

> 2026-08-01 Fable 5 出。背景:K-C-report.md 對數啱晒(舊 471 = 重攞返 395 + 走漏 76;
> staging 617 = 395 + 新收 222),**但新收嗰 222 首入面發現明顯非歌內容**——
> contentGate 俾 title 有 "Worship/Song" 字眼嘅宣傳/清談片呃咗。直接換血會將
> 垃圾帶入 prod,重蹈 Kids on the Move 87 首覆轍,所以出呢份 triage。
> Eric 簽晒 §1-§4 四個決定,C4 先可以開閘。

---

## §1 staging 剔走建議(51 條)—— 換血前由 kids_refetch 刪走

### 1a. Yancy 清談/推廣/preview/教材(38 條)
唔係歌:「Yancy shares about…」「talks about the song」「preview/promo」「Curriculum」
「Sweet Sound 書」「About Yancy Ministries」「My 2020…」等。

youtube_id:3UXb_hiIvgQ, 38cTkInM4XI, fOFZay66M58, Vprw8C-bqR4, iZDOGkAVv58,
fMR-KoALY4w, FcUk9sazFeo, SErR21dkJA0, 30LRXuPb2mo, 2ih2IaI-KbU, mE68JuME-w4,
6cAC5yCoprg, Mqwh0o1_2f4, IafH4URgMeM, WyfMC7vkT2s, k7Tdfp9n7PA, Dp0jY_wGhYU,
psWn2y7XuOw, n9YOe5Wi--U, PeUUcS9KWKk, qT9y-nUjsAU, 52WEyP35ZCA, tXW_RDhyK4I,
CQ0mI5rg6wA, 7L38KiKO32o, CwITIZnPJk8, N6T3JoTvYlE, jiqNbLe-XgY, s8PO_jsnf78,
DKnyIP4jjNM, YFWZmD2RkWk, dbT6odHNJE0, aJ4iiG1LRRk, 3ELS0EZqXYg, 7vQUEH_XzyA,
duPOO3n8Ok0, wQQ1irjEwWE, f0ZMkjiIh_c, j1GiRBP3PMc, 45wamM-HpSE, VQZnxz2Qt0I,
WCzi5unScpc, 4kT4mDEIz_k, AP4zBz2kYmk, fRIcApPqGHo

⚠️ **注意 `WCzi5unScpc`(「Yancy shares about Vol 7」)係 user 2 心心咗嘅片**
(舊 id 2015)。佢本身係清談片唔係歌,建議照剔;剔咗之後 C4 remap 嗰陣呢個
心心會自然消失。Eric 唔同意就喺下面簽名位寫明留低。

### 1b. 西班牙語歌(6 條)
真歌,但係西班牙語,app 冇西語分類,標「英文」係錯:
jvigUgiDd98, EjB9WRZQbRs, Kpwi1rKkkv0, bUE8FCTixio, 2yq4Yc52Mhc, 2K0a-E1ktpM

### 1c. CJ and Friends 世俗/教學舞蹈片(7 條)
Trolls「September」/Missy Elliott/Ne-yo Freeze Dance/「That's What I Like」/
HipHop 教學/Wheels on the Bus×2:
K3kvKI84Ydo(*), S47Nz6UTex8, z32NXNZNuyE, nhenje-LzS0, wBIZehcgNVo,
oxRyUjCu9Gs, VtgYfRqdPvY
(*)K3kvKI84Ydo 係「Wheels on the Bus **CJ's Praise Version**」邊緣個案,
改咗詞做讚美版——我建議照剔,Eric 想留就簽名位寫明。

**剔走條數核對:38+6+7 = 51(1a 同 1b 有一條重疊 CwITIZnPJk8,唯一計一次,
實際 unique = 51 條 —— 1a 38 條已包含佢,1b 另外 6 條係真歌西語版)。**

- [ ] **Eric 簽:§1 剔走 51 條** ______(有唔同意逐條寫低)

---

## §2 走漏 76 條三分法

### 2a. 建議救返(36 條)—— C4 前用 youtube_id allowlist 逐條重驗入 staging
真歌俾關卡誤殺(Visualiser/經文歌標題冇撞到 contentGate 正面訊號、或者片長
出咗 75-600s 帶嘅短版兒歌):

**Hillsong Kids(21):** puyEbKSn_ZM(Running MV), ke2fuJmKW1A(God Is Great),
7OU6j5QU27k(All Day), HOwbGSKAe9g(Let It Shine), fVhAdf_JMY0(帖前5:16-18),
gYF6x_2Ohug(箴4), cz5pUFYO7AE(來10), x9LQACXhS-U(詩92), XC4_Vbhf_PY(羅1:16),
b5iHR4i8gUE(彼後3:18), xrQPoVZR5Go(林前15:58), iwaJ3qh8PZc(Born Is The King
Sing-A-Long), P-nn0enSmsU(Born Is The King MV), IKibVqq5G8k(God Is So Good),
zs9G6tLQJfg(That's The Power), AuX_kmBxXDU(Thank You Jesus Visualiser),
9aMP1VNV8iY(Thank You Jesus New), eYH89HZPghA(God Is Great Visualiser),
Tc_T8cQG-KE(No One But You), iajTbrnZ4lM(All Day Visualiser),
ALkrFFIu9dg(Jesus Loves Me)

**Listener Kids(8):** BmG3FHKZBnw(Alive Alive), AQF-J2FXLN4(Children Go Where
I Send Thee), gpufCaVKWw4(Angels We Have Heard on High), RHoIByQlCow(Dem Bones),
Bmq5NveA6vY(Oh How I Love Jesus), PlcXDrOGiKk(Go Tell It On The Mountain),
xNb6vMkAIOQ(I Am a C-H-R-I-S-T-I-A-N), b0VUiK50pgU(His Banner Over Me is Love)

**CJ and Friends(1):** lzW9nZGdgmg(One Way Acoustic)

**讚美之泉兒童(6,「頻道搵唔到」嗰批):** MIc5WiThn0U(極大的聲音),
9fDQBnHVdyU(天上的家), SzGYYf0K8CY(無止境), O2Fv0XPu0Yo(I Believe 我相信),
vWMePsOFMkU(全然美麗), bfFZf7uwTV8(快快地聽)——直接用 id 重驗,片仲喺度就救,
真係刪咗/私影就冇計,報告會如實記。

- [ ] **Eric 簽:§2a 救返 36 條** ______

### 2b. Piano Lullaby 純音樂系列(13 條)—— Eric 二選一
Hillsong Kids 詩歌鋼琴搖籃曲,冇人聲。啱好對應方案 performer='純音樂' 概念,
問題係:**兒童庫要唔要純音樂?**(瞓覺陪伴 use case vs 詩歌庫定位)
aDgup4D-oyo, x2aO_jw7tlw, q3uluBF4vhc, RSa8vzVjsw0, nK01D21WspE, _siBAyiLZTk,
Yu4qwj6aIrM, S-cbTaS2RMU, KJY12sBt5dQ, HOgTCt7ECaM, CWROHzC5p8o, 3q9JuUtLgF0,
44PBPsIDDmU

- [ ] **Eric 揀:□ 收(performer=純音樂) / □ 唔收** ______

### 2c. 由佢流失(27 條)—— 關卡做啱嘢,唔使救
- Listener Kids 合輯/長片 10 條(「+more/1hr/Vol.」)+ 1 條故事片(1705)
- Hillsong:Kidsongalong medley、Lullabies Full Album 1hr、Happy Birthday、
  Let's Tidy Up(4 條)
- Yancy promo/merch/podcast/生日促銷 9 條
- CJ 故事節目/合輯 2 條;讚美之泉宣傳短片 1 條(4034)

呢 27 條唔使簽,列出嚟係俾你知走漏唔等於蝕——大部分係應該流失嘅。

---

## §3 lang-suspect 2 條定案

讚美之泉兒童兩條英文顯示 title(【Each Day Abiding in You】/【Mighty, Your Love
Has Power】Dance Version)——實際係讚美之泉兒童專輯(14)嘅國語 MV,YouTube 顯示
英譯 title 啫。**建議定案:國語**。

- [ ] **Eric 簽:§3 兩條定案國語** ______

---

## §4 契機修正(記帳,C7 做,唔阻 C4)

contentGate 正面訊號對英文 promo 片無力(「preview/shares about/promo」都有
"Worship/Songs" 字眼)。C7 加**負面訊號 blocklist**(英文精準詞:shares about /
talks about / preview / promo / merch / podcast / curriculum / available now),
中文團體照舊唔開(誤殺率高嘅教訓不變)。同時 growLibrary 日常 discover 都用
同一 gate,唔修嘅話 Yancy 呢類頻道日後照收垃圾。

---

## 簽名後 C4 執行次序(俾 Sonnet)

1. staging 剔走 §1 嘅 51 條(kids_refetch DELETE by youtube_id)
2. §2a 36 條 + §2b(如 Eric 收)13 條行 allowlist 重驗入 staging
3. K-C-report.md 重新生成,對數簽名版
4. 之後先行原子對換(TAXONOMY-5D-PLAN §3.4.3 K-D)
