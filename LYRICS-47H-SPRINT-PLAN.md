# 歌詞47小時連續衝刺實施規格(2026-08-15 Sat 10:12 → 2026-08-17 Mon 10:00 HKT)

**出稿:** Fable 5,2026-08-15 10:4x。**執行者:** Sonnet 5(唔使Eric逐步批核,照本執行)。
**授權基礎:** Eric 2026-08-15 10:12 指示「由呢一刻開始做唔好停直到星期一早上10點,由攞歌詞到複核上架」——即係本衝刺期間內,開producer(fetchLyrics手動run)、複核、apply、backend restart全部已授權,唔使逐次問。`com.hymnapp.fetchlyrics.plist.disabled-20260813` **維持disabled唔准掂**(衝刺用自己嘅keeper,唔係恢復launchd排程;排程恢復另等Eric拍板)。

---

## §0 TL;DR

- **三條並行線:** P線(producer keeper,單一detached process,唔食Claude額度)、R1線(國語+英文+兒童複核)、R2線(粵語複核,backlog夠先開)。加原有Fable5監督線。
- **排班:** Phase 0準備(即刻)→ 11個一次性scheduled task(4小時grid,獨立cron觸發,唔用wakeup鏈)→ 星期一09:00收尾班。
- **防重複攻打:** Phase 0落三個patch——落載失敗ledger(3次判死`dl:dead`)、audit語言錯配bucket、死症vein `--skip-orgs`。
- **額度硬頂:** 本衝刺**1,500個複核決定**(≈週額度43%),ledger逐班記,三級減速閘。
- **老實預測:** 星期一10:00覆蓋率**約44–48%**(而家34.2%)。**80%喺呢個窗口內做唔到**,樽頸係額度+池質素,唔係時間。
- **427首已出街**(8/15 09:48 restart實測live),唔使再處理。**「中英混合」全庫實際263首live**(唔止55),預設唔郁,新個案入hold池等Eric。

---

## §1 開波現況快照(2026-08-15上午,三路實測核對)

| 指標 | 數 |
|---|---|
| 出街歌(`hymns` view) | 6446 |
| verified(已出街serve緊) | **2207**(34.2%) |
| draft(複核隊列) | **0** |
| unavailable(判死/攞唔到) | 511 |
| none(可攻打) | **3728** |
| ↳ 其中已泊OCR池(`cc:miss`) | **~53** ← 開波即做只夠~1小時 |
| ↳ 未行過CC層(source空) | 3673 |
| ↳ 孤兒`ocr:miss`(唔郁) | 2 |
| 已知死症vein(天韻411/CantonHymn 161/悦雨63/原始和聲47) | ~682(佔可攻池18%) |

實測效率基準(8/14衝刺,直接引用唔好重測):producer OCR **45–60有效draft/鐘**、403率**~49%**(正常,唔係故障);CC泊候選~360首/鐘;reviewer ~75決定/鐘;命中率隨池質素由79%跌到36%。

---

## §2 Phase 0:準備工事(執行session即開,目標13:00前完成)

全部改動用pathspec commit(**嚴禁`git add -A`**,見HANDOFF §2.1),commit完即`git show --stat HEAD`核對,然後`ops/deploy/approve.sh backend "$(git rev-parse HEAD)" --confirm`(classifier間中亂擋,同一句重試最多3次,再唔得等5分鐘)。

### P0.1 `fetchLyrics.js`:落載失敗ledger + 死症skip(Eric要求#1嘅核心)

而家`fetchLyrics.js:524-538`落載失敗係`continue`唔寫DB——同一首片可以夜夜重抽重敗,零記憶。改三笔:

1. **Ledger檔** `backend/data/lyrics-dl-failures.json`,格式`{"<id>": {"fails": n, "lastAt": "ISO"}}`。純fs讀寫唔使DB鎖(單producer保證,見§4)。
2. **失敗記賬**:OCR loop個`catch (e)`度加`recordDlFail(c.id)`;當`fails >= 3`,即用現有`writeLyricsRow(c.id, { lyrics_source: 'dl:dead', lyrics_checked_at: today() })`寫入DB——`pickOcrCandidates`要求`lyrics_source='cc:miss'`,`dl:dead`自然永久踢出OCR隊,status保留`none`可翻案(翻案路:人手UPDATE返`cc:miss`)。
3. **候選過濾**:`pickOcrCandidates`攞完之後,loop開始前filter走:(a) ledger `fails>=3`(補漏,防DB寫入失敗);(b) `fails>=1`而`lastAt`喺12小時內(cooldown——403約半數係間歇性,俾佢隔半日再試一次,3次先判死)。
4. **`--skip-orgs "天韻合唱團,CantonHymn,悦雨音樂,原始和聲"`** CLI flag:SELECT加埋`org`欄,filter `artist`同`org`都唔喺名單先落隊。用途係將682首死症vein押後到池尾(唔係永不做——見§8,池乾先放行)。

CC層(`fetchLyrics.js:260-272`)有相同`continue`結構,**同樣接上ledger**(CC probe失敗都記,但CC失敗唔判`dl:dead`,只cooldown——CC係list-subs輕操作,失敗多數係網絡)。

### P0.2 `auditLyricsBatch.js`:兩個修正

1. **「生成」假陽性**(SUPERVISION-LOG L4800實錄,id 3140「降生成為人子」被誤reject):衛生regex由裸`生成`收窄做`(AI生成|自動生成)`,其餘項(編曲|監製|版權|訂閱|http|www\.|Official MV|讚好)不變。
2. **語言錯配bucket**(55/263問題嘅機械擋板):reviewer喺apply JSON每條entry**帶埋export出嚟嘅`lang`欄**。audit對`{id, lyrics}`條目做:normalize後計CJK字數vs拉丁字母數,`lang∈{國語,粵語,兒童}`而拉丁>CJK → 撥入新輸出檔`<input>-langmismatch.json`,**唔入passed**。log印明幾多條。呢啲entry連draft一齊由班次append落`backend/data/lyrics-langmismatch-hold.json`(merge by id),等Eric拍板(§7)。

### P0.3 新script `ops/lyrics/producer-keeper.sh`(P線心臟,commit入repo——8/14教訓:keeper唔准每次即場重寫)

邏輯規格(Sonnet5照寫,約40行bash):

```
STOP檔 = /tmp/lyrics-sprint-stop;LOG = /tmp/hymn_keeper.log;每tick sleep 300
每tick:
  1. 見到STOP檔 → log收工 exit 0
  2. pgrep -f 'scripts/fetchLyrics.js' 有嘢行緊 → 跳過(pgrep唔會match自己,免A班self-grep bug)
  3. 讀三個數(sqlite3 "file:hymns.db?mode=ro",全部read-only):
     POOL   = none + cc:miss(OCR池存貨)
     CCLEFT = none + source空(CC未行)
     DRAFTS = curated=1 AND status!='dead' AND lyrics_status='draft'
  4. DRAFTS >= 400 → sleep 600(reviewer追唔切,唔好嘥YouTube quota堆貨)
  5. POOL < 100 且 CCLEFT > 0 →
       nohup node scripts/fetchLyrics.js --mode cc --budget 300 --delay 3000 --ignore-window >> /tmp/hymn_fetchlyrics.log 2>&1 &
     否則 POOL > 0 →
       nohup node scripts/fetchLyrics.js --mode ocr --budget 120 --delay 4000 --ignore-window \
         --skip-orgs "天韻合唱團,CantonHymn,悦雨音樂,原始和聲" >> /tmp/hymn_fetchlyrics.log 2>&1 &
  6. 403風暴掣:上一輪fetchLyrics喺開波5分鐘內以「疑似俾YouTube擋,今晚OCR收工」斷路訊息收場,連續兩次 → sleep 7200(唞2個鐘保IP)再入正常tick
```

啟動(執行session做,跟[[feedback-long-running-process-must-detach]]:detach+驗證):

```bash
nohup bash ops/lyrics/producer-keeper.sh >/dev/null 2>&1 & disown
sleep 310 && pgrep -fl producer-keeper && tail -5 /tmp/hymn_keeper.log
```

另外開`nohup caffeinate -dims >/dev/null 2>&1 & disown`頂住成個週末唔俾Mac瞓(wrap班負責kill)。

### P0.4 新script `ops/lyrics/delist-batch.mjs`

照抄`oneoff-delistMandarinNonsong*.mjs`現成pattern:食一個id list JSON,逐首行`lib/adminHymns.js`嘅`delistHymn(id)`(內置`withLock`,idempotent)。俾各班將「明確非歌內容」即場落架([[feedback-nonsong-autonomous-delist]]:明確個案唔使問,模糊先留俾Eric)。注意`delistHymn`行admin路徑會觸發server `reloadDb()`——副作用係順手令啱apply嘅歌詞即時生效,係bonus唔係bug。

### P0.5 建立12個一次性scheduled task + ledger檔

- Task目錄:`/Users/macbookpro/.claude/scheduled-tasks/lyrics47-{b01..b11,wrap}/SKILL.md`。**b01係方法母本**(完整SOP,§5),b02–b11只寫「Read b01 SKILL + Read SUPERVISION-LOG上一班段落,照做,你嘅時段係XX:XX–XX:XX」——8/14驗證過呢個模式有效。
- **每班獨立一次性觸發,嚴禁wakeup鏈**(8/13教訓:斷鏈蝕成晚;8/14教訓:background until-loop蝕4.5鐘)。
- Ledger檔`docs/SPRINT-47H-LEDGER.md`(唔commit,untracked,gate只查backend/唔會擋):表頭`| 時間 | 班 | 今班決定數 | 累計決定 | est%(÷35) | 累計verified | 備註 |`,Phase 0寫入第一行基線。

### 排班表(HKT,每班硬性3小時45分收爐,<5小時窗口+15M上限)

| 班 | 觸發 | 時段 | 備註 |
|---|---|---|---|
| Phase 0 | 即刻 | ~10:45–13:00 | patch+commit+approve+開keeper+建tasks |
| b01 | Sat 13:00 | 13:00–16:45 | 頭班,料少(池啱起步),重點驗機制 |
| b02 | Sat 17:00 | 17:00–20:45 | |
| b03 | Sat 21:00 | 21:00–00:45 | |
| b04 | Sun 01:00 | 01:00–04:45 | ⚠️04:00 deadlinkcheck揸鎖~13分鐘,撞鎖屬正常等佢完 |
| b05 | Sun 05:00 | 05:00–08:45 | |
| b06 | Sun 09:00 | 09:00–12:45 | 預計累計決定近900,第一減速閘(§6) |
| b07 | Sun 13:00 | 13:00–16:45 | |
| b08 | Sun 17:00 | 17:00–20:45 | |
| b09 | Sun 21:00 | 21:00–00:45 | 預計行近1500硬頂 |
| b10 | Mon 01:00 | 01:00–04:45 | 額度頂咗就做輕checkpoint班(§6) |
| b11 | Mon 05:00 | 05:00–08:45 | 同上 |
| wrap | Mon 09:00 | 09:00–10:00 | §9 |

日間時段照做(Eric明言得佢一個用緊,唔使避聽歌時段;restart前照行20分鐘`[stream]`檢查兜底)。**依賴聲明:成個週末部Mac要著機+登入+Claude app開住**(scheduled task靠app fire;producer/keeper係nohup唔受影響)。時段中間15分鐘gap係俾上一班超時緩衝,唔係休息——producer全程冇停過。

---

## §3 三條線分工

| 線 | 載體 | 做咩 | 食唔食Claude額度 |
|---|---|---|---|
| **P** | `producer-keeper.sh`(單一detached process) | CC補倉↔OCR出draft自動交替,永續 | 唔食(純本地+YouTube) |
| **R1** | 每班嘅scheduled task session | 國語+英文+兒童draft複核→audit→apply→checkpoint restart(**restart唯一owner**) | 食(主力) |
| **R2** | R1按條件動態建立嘅`lyrics47-bNN-canto`一次性task(+20分鐘觸發) | 淨係粵語draft,核對用`cantonhymnLookup.js`(免WebSearch額度) | 食 |
| 監督 | 現有Fable5三小時check | 只診斷唔落手(現規則不變) | 少量 |

**R2開波條件(三個都要成立):** 粵語draft ≥ 120 且 累計決定 < 900 且 上一班冇撞rate limit警告。唔夠數就R1一條線包晒——並行係手段唔係目標,額度先係硬約束。

---

## §4 唔會撞車嘅五條機制(Eric要求#2)

1. **YouTube線串行:** 全程只准**一個**`fetchLyrics.js` process(keeper每tick `pgrep`把關;任何班次嚴禁自己開producer,只准檢查keeper生死、死咗重開keeper)。唯一出口IP(NordVPN)係全App命脈(HANDOFF §2.2),多開producer=加倍403+snapshot覆寫race,冇任何好處。
2. **DB寫入:** 全部經現有`acquireDbLock`路徑(`reviewLyrics.js --apply`/`writeLyricsRow`/`delistHymn`都內置)。已知殘餘race:producer in-flight snapshot可以蓋走啱apply嘅verified(8/14實錄76中1)——**每次apply後即刻覆查**`SELECT id,lyrics_status FROM hymns_all WHERE id IN (...) AND lyrics_status<>'verified'`,中招重apply。撞鎖等5分鐘唔得就下一批,唔准hack(04:00-04:15 deadlinkcheck揸鎖屬正常)。
3. **複核隊列分區:** export冇lease機制,R1/R2攞到同一份list——用**lang欄硬分區**(R1: 國語/英文/兒童;R2: 粵語),apply檔天然disjoint,零重疊。兩線都要跳過`lyrics-langmismatch-hold.json`入面嘅id(hold池唔重讀,Eric要求#1嘅複核端)。
4. **Restart/gate單一owner:** 只有R1喺班尾做approve+restart,R2/監督線嚴禁。approve前睇`git log <approved>..HEAD --oneline`:如有**其他session**嘅commit,逐條睇——凈係非backend改動照approve;有唔明嘅backend改動就**今班skip restart**(歌詞已寫入DB唔會冧,下班補),ledger記低。restart完必查`launchctl list | grep hymnapp`夠**7個job**(冇fetchlyrics係正常,佢disabled緊)。
5. **Git紀律:** 班次(R1/R2)**全程零git操作**(SUPERVISION-LOG照append但唔commit,監督線負責);唯一commit喺Phase 0同wrap,一律pathspec。ledger/hold/failures三個新data檔全部untracked,唔會俾gate第2步擋(gate只查`-- backend/`且`backend/data/`在豁免清單)。

---

## §5 班次標準SOP(寫入b01 SKILL母本)

複核規則正本沿用`lyrics-daily-proofread/SKILL.md`(cantonhymnLookup用法/版權紅線/全形經文附註/剷credit行等全部照跟),以下只列衝刺差異:

1. **開波三查:** (a) 讀`docs/SPRINT-47H-LEDGER.md`——累計決定≥1500即轉「輕checkpoint班」(只做第7步+ledger,唔複核);(b) keeper生死:`pgrep -fl producer-keeper`,死咗照P0.3命令重開+驗證;(c) `tail -30 /tmp/hymn_keeper.log`+403風暴狀態,連續斷路要喺ledger記低。
2. **攞料:** `reviewLyrics.js --export` + `alignLyrics.js --all`,per分區filter,再剔hold池id。每批≤80。**draft<10就做輕checkpoint班收工,唔好等**(嚴禁until-loop等隊列;producer自己會追上嚟,下班自然有貨)。
3. **判決紀律(8/14三大教訓寫死):** 底本死症一律`{id, unusable:true}`,**嚴禁demote、嚴禁「跳過留draft等下次」**(producer會覆寫,留=毀);demote只准用喺「已verified要拉返重校」;明確非歌內容(訪問/教學/花絮/巡迴紀錄/幕後/單句短講)收集id,班尾行`ops/lyrics/delist-batch.mjs`落架,模糊個案unusable+ledger記名等Eric。
4. **WebSearch:** 每班上限4次(全日30嘅拆分),粵語線0次(cantonhymnLookup唔計額)。
5. **Audit→apply:** 只准攞`-passed.json`;`-langmismatch.json`嘅entry merge落hold池檔,**唔apply唔unusable**;apply後即做§4.2覆查。
6. **中途撞rate limit警告:** 完成手頭嗰批→apply→提早收工寫ledger,唔好死頂。
7. **班尾checkpoint(R1 only):** `[stream]`20分鐘檢查(log時間戳係UTC)→approve(重試3次+5分鐘)→`backend-restart.sh`→7個job核對→curl `/api/hymns`抽3個今班新id實測有詞→ledger+SUPERVISION-LOG append→確認下一班task存在→按§3條件決定開唔開R2。
8. **收工紀律:** 唔准自行判斷「到頂」提早棄班([[feedback-lyrics-review-no-self-stop]]);時段到/額度頂/隊列空三個先係合法收工理由,邊個理由要寫入ledger。嚴禁AskUserQuestion(non-interactive會卡死session)。

---

## §6 額度管理(壓縮做2日嘅重新計數)

**換算尺(8/14實測):** 694個複核決定 ≈ 週額度19% → **~35決定/1%**。producer/keeper唔食Claude額度,樽頸全在複核決定數。

**現週期(8/14 15:00–8/21 15:00)已用估算:** 8/14衝刺~19% + supervision/日常/今日規劃~5% ≈ **~24%**。

**本衝刺預算:硬頂1,500個決定 ≈ 43%**,即星期一10:00累計用量~67%,留返~33%俾之後四日(日常班+其他開發)到8/21 reset。三級閘(以ledger累計決定數為準):

| 閘 | 觸發 | 動作 |
|---|---|---|
| 900 | 預計Sun朝 | 唔再開R2,單線行 |
| 1,200 | 預計Sun晚 | 只復核高產vein(約書亞/讚美之泉/小羊/基恩/ACM/同心圓/泥土/611/角聲),雜項留池 |
| **1,500** | 硬頂 | 複核線全停,之後各班做輕checkpoint(keeper照跑積draft到400頂,等8/21 reset後或Eric加碼先繼續) |

**撞「weekly limit」實死(session開波即死):** 該班自然冇產出,下一班獨立觸發自然再試;連續兩班咁死=真係爆煲,producer照跑,人手層等reset——呢個設計唔會惡化任何嘢。5小時滾動窗口靠3小時45分班距+R2錯峰20分鐘攤開。

如Eric中途話「唔使留額度照燒」,硬頂改2,200(~63%),其餘機制不變。

---

## §7 「中英混合」分支方案(唔係55首,係263首)

**新發現(要向Eric回報):** 用「`lang`係中文但歌詞拉丁字母>CJK」判定式掃全庫2207首verified——C班嗰批中55首(id清單見SUPERVISION-LOG L4576),8/14全批中104首,**全庫live中263首**(其中69首零中文字)。即A/B班同8/14之前一直有同類入庫,冇人專門數過。Eric嗰句「放一邊唔好郁」我哋照守:**263首全部唔郁**,呢份plan唔採取任何行動,只出報告。

**衝刺新增個案(預估100–200首):** P0.2嘅audit bucket機械擋走→入`lyrics-langmismatch-hold.json`(draft保留,唔verified唔判死)→複核線跳過唔重讀。Eric幾時拍板都駁到:

- **分支A(收貨):** 任何一班或wrap將hold池entry直接apply做verified(audit已過晒其餘檢查),一步返晒嚟。
- **分支B(唔收):** hold池批量`{id, unusable:true}`(draft照留,可翻案);如Eric想連263首live嘅都回捲,另開oneoff用SUPERVISION-LOG L4576清單+判定式SQL執行——**唔好用demote**(demote=回隊+producer覆寫危險,8/14實證)。

**資源假設:** 覆蓋率預測(§8)按**保守分支B**計,hold池唔計入verified。Eric中途批分支A就直接+100~200首。

---

## §8 老實嘅覆蓋率預測

生產鏈(用8/14實測率,唔係願望):

```
producer有效工時 ~44h,CC/OCR交替單線:
  CC probe ~2,800–3,300首(~8–9h) → 全數變cc:miss(CC命中率實測0%)
  OCR嘗試 ~2,300–2,800首(~33–36h,403率49%,ledger令重試有上限)
  → 有效draft ~1,250–1,550(55%率)
複核(額度封頂1,500決定) → 實際複核~1,400–1,500首draft
  命中率:頭段高產vein ~65–75%,中段~45%,尾段跌落30%以下
  減langmismatch hold ~8–12%
  → 新verified:+550~800首(中位~680)
delist非歌內容:預估80–150首 → 分母6446→~6,300–6,370
```

| 情境 | 星期一10:00覆蓋率 |
|---|---|
| 保守(+550,delist 80,分支B) | (2207+550)/6366 ≈ **43.3%** |
| 中位(+680,delist 110) | (2207+680)/6336 ≈ **45.6%** |
| 順利(+800,delist 150,分支A加~150) | (2207+950)/6296 ≈ **50.1%** |

**講明:80%喺呢47.8小時內冇可能。** 唔係排班問題:(a) 額度封頂1,500決定,就算池係無限都最多+~850;(b) 池本身3,728首,OCR路線封頂~76%(前session已計),再上要靠大規模delist清理先去到79–83%——嗰個係幾個星期嘅工程。今個週末嘅現實目標係**34%→45%±3%**,並且起好防重複攻打+多線協調嘅地基令之後每星期可以低成本咁追。

---

## §9 收尾班(wrap,Mon 09:00–10:00)

1. `touch /tmp/lyrics-sprint-stop` → 等keeper自然退場(≤5分鐘)→ `pgrep -f 'fetchLyrics|producer-keeper'`確認清場 → kill caffeinate。
2. 最後一輪audit→apply→approve→restart→live API抽查(3個id實測有詞)+ 總數對賬(DB verified數 vs API有詞數)。
3. 總結寫SUPERVISION-LOG(各班決定數/verified/unusable/delist/403率/閘觸發時間)+ ledger終盤。
4. Commit(pathspec):SUPERVISION-LOG、ledger、hold池、failures ledger、任何P0 patch遺漏。
5. 向Dispatch回報四件等Eric拍板嘅事:(a) 263首中英混合點處理(分支A/B);(b) fetchlyrics launchd排程恢唔恢復(keeper已停,無producer=日常班會再空轉);(c) 額度餘量同下週追法建議;(d) 模糊個案名單。
6. 確認`lyrics-daily-proofread`(40 9,15,21)enabled,交返日常。

---

## §10 風險表

| 風險 | 機率 | 應對 |
|---|---|---|
| YouTube IP俾flag(全App命脈) | 低–中 | keeper 403風暴掣(斷路×2→唞2h);delay 4s+jitter不變;唔並行producer;wrap後IP壓力歸零 |
| weekly limit提早爆 | 中 | 三級閘+35決定/1%換算逐班對賬;爆咗producer照積貨,冇浪費 |
| Claude app俾人熄/Mac重啟 | 低 | caffeinate+著機依賴已聲明;keeper/producer係nohup,app死咗producer照行,復開app後下一班自動接力 |
| approve classifier亂擋 | 高(已知) | 重試3次+5分鐘,再唔得skip該班restart下班補 |
| 並行session搬走HEAD | 中 | §4.4決策規則,唔明就skip restart |
| audit假陽性誤殺 | 低 | 「生成」已修;rejects一律留draft+ledger記原因,唔會蝕貨 |
| 池尾質素崩(C班36%重演) | 必然 | 1,200閘後只做高產vein;死症vein由`--skip-orgs`押後,池乾先放行並預期低命中 |
