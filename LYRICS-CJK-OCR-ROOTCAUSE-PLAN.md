# 中文歌詞OCR根因診斷+修復方案(LYRICS-CJK-OCR-ROOTCAUSE-PLAN)

日期:2026-08-16|診斷:Fable 5(親手實測,唔係齋推理)
背景:Eric 2026-08-16原話——「將中文歌放英文歌詞點出街,完全都唔啱,絕對唔可以為數字而做」。
本文件係診斷報告+可直接執行方案,**全部改動輸出只落 draft,唔會自動出街**(紅線不變)。

---

## 0. 一句結論

「中文歌配英文歌詞」唔係一個OCR讀唔到中文嘅問題,而係**四個獨立問題夾埋**:
(1) 語言錯配擋板用「全文字數」判斷,把雙語對照draft屈做英文歌詞(hold池121條有117條其實中文齊晒);
(2) 藝術字watermark每幀讀錯樣都唔同,exact-match watermark filter剔唔走,垃圾拉丁淹沒draft;
(3) 合併演算法「揀長嗰份」系統性偏好亂碼變體;
(4) macOS Vision對圓體/藝術中文字體真係讀唔準(360p同720p都錯)——**呢part用PaddleOCR實測完勝,連360p都全對**。
另外有71首live verified係真·純英文歌詞(歷史遺害),條片本身有中英字幕,今日pipeline重跑救得返。

## 1. 實測證據(2026-08-16,4條真實片)

| 樣本 | 類型 | macOS Vision(而家用緊) | PaddleOCR chinese_cht | Claude vision睇frame | whisper medium |
|---|---|---|---|---|---|
| id 4228 讚美之泉《今天是神所定的日子》AVGTZvAPR28(兒童舞蹈版,黃色圓體+拼音行) | 藝術中文字體 | ❌「慈愛和**機間**是天父的心**踢**」,720p+裁剪放大都錯(機憫/膦憫);拼音行變垃圾拉丁 | ✅「慈愛和憐憫是天父的心腸」**360p都1.00信心分全對**;拼音行信心分0.66-0.88可filter | ✅360p 100%全對 | 半啱:「憐憫」啱但「天父的心腸」→「天赋地寻常」、「所定」→「索定」 |
| id 241 約書亞《聖靈請祢來充滿我心》BVr0nJkHU-g(官方歌詞MV) | 英文草書watermark | 中文大字讀得好;左下角草書「Touching Heaven on Bended Knees」**每幀錯樣唔同**(leuching Hecwenen Kened hnees…),watermark filter要逐字相同所以全部漏入draft | 中文1.00;watermark讀錯但有bounding box+穩定位置,可按位置剔 | ✅ | — |
| id 355 小羊詩歌《耶穌耶穌》MwZANVf7eWU(中英字幕) | 乾淨雙語 | ✅兩語都讀到(細節錯:hope s) | ✅兩語1.00(hope's啱埋) | ✅ | — |
| id 212 讚美之泉《俯伏》US6S0B3ECJ8(現場MV,live verified純英文嗰批) | 歷史遺害驗證 | ✅今日讀「我的心 專注於祢+英文行」全對 | ✅0.98/1.00 | ✅ | — |

PaddleOCR速度:~1.05秒/frame(呢部Mac CPU),5分鐘歌≈150 frame≈2.6分鐘/首,夜班食得起。零API費用,本機行。

## 2. 數據現況(2026-08-16 hymns.db實數)

- draft池661首;lang=國語/粵語嘅618首入面**344首**拉丁>CJK(觸發誤判嗰個比例)
- langmismatch hold池121條:**117條係中英對照、中文行齊晒**(擋板誤殺);4條(id 6595/6669/6815/8271)係**本身英文歌**(約書亞英文單曲、小羊英文版),係DB lang欄標錯「國語」,歌詞冇錯
- live verified且lang中文2544首:265首拉丁>CJK,拆開=**181首雙語對照**(內容正確)+**71首零CJK**(當中KEC Worship等係英文cover=lang標錯;讚美之泉《俯伏》/約書亞《微小的聲音》/《因祂活著》/611等係**真·中文歌純英文歌詞,live緊,要修**)+13首爛draft混入
- **結論:唔存在「OCR對中文全崩」呢回事**;主流官方歌詞MV(讚美之泉/小羊/基恩/約書亞)中文Vision已經讀到八九成,崩嘅係藝術字體/watermark/合併/擋板四件事

## 3. 根因逐個講

### 根因A:擋板用全文字數,雙語歌必然中招(最大宗,佔「57%問題」絕大部分)
`backend/scripts/auditLyricsBatch.js:64-73` `langMismatchReason()`:全文拉丁字母數>CJK字數就hold。
同一句歌詞英文譯行天然係中文行3-4倍字符(「藏我在 翅膀蔭下」7字 vs 「Hide me now under Your wings」23字母),**雙語對照draft必然latin>cjk**,再加watermark垃圾拉丁推一把。呢個唔係內容問題,係量度問題。

### 根因B:watermark filter要逐字相同,藝術字watermark每幀錯樣唔同
`fetchLyrics.js mergeOcrLines()` 514行:`freq>60%`先當watermark,但用**exact string**計頻率。草書watermark每幀被Vision讀成唔同亂碼,冇一個string過到60%→全部變「歌詞」。id 241成份draft所以塞滿幾十個「Touching Heaven」變體。

### 根因C:block代表「揀長嗰份」偏好亂碼
`fetchLyrics.js:550`:同一block內揀字數最多嗰幀做代表。亂碼變體(中文錯字+垃圾拼音黏行)通常**長過**乾淨讀數→演算法系統性揀垃圾版本,即使乾淨版本存在(id 4228 draft入面「我們在其中要歡喜快樂」明明讀啱過幾次,出街版本係「潣們在其印要酄氢枳藥」)。

### 根因D:macOS Vision對圓體/藝術中文字體到頂
實測:720p+裁剪+放大+對比度全上,「憐憫」照錯「機憫/膦憫」、「心腸」照錯「心踢」。唔係解像度問題(PaddleOCR 360p全對),係Vision模型對呢類字體嘅極限。粵語/國語詩歌MV呢類字體唔少(兒童系列、舞蹈版、早期MV)。

### 根因E(歷史):71首live純英文係舊流程遺害
id 212實測今日兩個engine都讀到中英全對→嗰批唔係「條片冇中文」,係當年draft太爛,review班救得英文行就交咗(正正係「為數字而做」嘅產物)。重跑得返。

## 4. 方案(P0→P5,每步可獨立驗收)

### P0|擋板改行級判斷+放返hold池(半日,零風險,最急)
改 `auditLyricsBatch.js langMismatchReason()`:逐行分類(CJK行=行內CJK>拉丁),
- CJK行佔比 ≥35% → **當雙語對照,pass**(維持而家雙語出街格式,同官方MV一致)
- <10% 而 lang係中文 → 真mismatch,照hold
- 10-35% → hold(疑似爛draft)
用同一邏輯寫個一次性script重審 `backend/data/lyrics-langmismatch-hold.json`:117條放返出嚟行正常review流程(**唔係直接出街,照過proofread**);4條英文歌(6595/6669/6815/8271)改lang=英文(⚠️用locked node script寫DB,唔准raw sqlite3)。
驗收:hold池重審輸出三桶數目啱;隨機抽5條雙語人眼睇。

### P1|PaddleOCR做中文歌主引擎(1-2日,已實測)
- 裝法(已喺scratchpad驗證):系統python3.9 venv(homebrew得3.14,paddle冇wheel)→ `pip install paddlepaddle paddleocr`;固定版本;模型首跑自動下載(~30MB)。建議裝喺 `backend/tools/paddle-venv/`,wrapper script `backend/tools/paddleframe.py`(輸出JSON:每行text+score+bbox)。
- `fetchLyrics.js` 加engine抽象:lang∈{國語,粵語,兒童}→Paddle(chinese_cht);英文→Vision照舊(Vision對英文字幕夠好,慳CPU)。
- 行級filter:score<0.85掉;拼音行regex(聲調vowel/純拼音音節)掉;單字符拉丁行掉。
- 每首歌完保留Vision做第二票(平,已有binary):兩個engine中文行對唔上→標低信心,俾review班優先睇。
驗收:攞今次4條測試片重跑,對比本文件§1結果;粵語歌抽10首同cantonhymn底本對行。

### P2|watermark/垃圾行修法(半日)
mergeOcrLines watermark偵測由exact string改做**fuzzy cluster**:行normalize後bigram Dice≥0.75聚類,cluster總出現率>40% frames→成個cluster剔走。有Paddle bbox之後再加位置規則:貼角落+高度細過主字幕60%+重複出現→剔。
驗收:id 241重跑,draft入面「Touching Heaven」變體=0。

### P3|block代表改多數投票(半日)
`fetchLyrics.js:550` 「揀長嗰份」改做:block內逐行聚類(Dice),每行揀**出現次數最多**嘅變體(tie先揀長)。亂碼變體隨機唔重複、正確讀數會重複出現,投票天然汰弱。
驗收:id 4228用Vision重跑(未上Paddle都應該改善),「我們在其中要歡喜快樂」勝出。

### P4|重做隊列(夜班producer行,~3分鐘/首,零API費)
P1-P3落地後排隊重OCR:
1. 71首live零CJK(先分流:英文cover改lang即完;真中文歌重OCR→draft→review→先replace,**未replace前live版唔落架定侷unusable要Eric拍板**,建議照住先、排最前重做)
2. 344首draft拉丁>CJK全部重跑
3. hold池釋放嗰117條唔使重跑,直接入review
預算:~420首×3分鐘≈21粒鐘≈兩三晚夜班。照過existing deploy gate/producer-keeper,唔郁daily-proofread嘅disabled狀態。

### P5|殘餘死症處理(唔夾硬,寧缺勿濫)
兩個engine都崩+whisper聽唔清嘅(預計好少):
- Review sprint加「睇frame」工序:每個字幕block抽1張keyframe(mergeOcrLines已有block結構,~30-40張/首),Claude session直接睇圖讀字——本次實測Vision/預處理全錯嘅frame,Claude 360p讀到100%。呢條係修殘局嘅路,唔係主pipeline(貴)。
- whisper只做仲裁票(佢「憐憫」啱但「心腸」錯,簡體輸出,唔可以獨立成稿)。
- 真係攞唔到(冇字幕+冇清唱人聲/純伴奏/非歌內容)→ `unusable`踢出隊或照非歌政策delist,**絕對唔砌**。

## 5. 風險/成本

| 項 | 成本 | 風險 |
|---|---|---|
| P0 | 半日 | 近乎零(擋板收緊反而更準;釋放嘅117條照過review) |
| P1 | 1-2日+~1GB disk(venv+模型) | py3.9系統python將來升OS可能變;pin版本+記低重裝步驟。Paddle對簡體字幕歌可能要fallback `lang='ch'`模型(讚美之泉主流係繁體,影響細) |
| P2/P3 | 各半日 | 演算法改動要用4條測試片回歸 |
| P4 | 兩三晚夜班機時 | yt-dlp間歇403(NordVPN出口IP,已知),retry照舊 |
| P5 | Claude session時間 | 有返「歌詞複核唔准自行收工」紅線,death list要人手拍板 |

## 6. 唔做嘅嘢(同點解)

- ❌ 純英文歌詞照出街/雙語當「算數」出街——Eric明令禁止,本方案冇任何一步咁做
- ❌ Google Cloud Vision等雲OCR——PaddleOCR本機已全對,唔使燒錢+送資料出去
- ❌ 720p落載做默認——Paddle 360p已夠,慳3倍頻寬;Vision留返英文歌用
- ❌ whisper做主來源——實測錯字率唔合格,只做仲裁
- ❌ Claude vision做主pipeline——每首~30-40張圖太貴,只做死症修殘局

## 7. 等Eric拍板嘅三件事

1. **雙語對照格式**係咪接受出街(官方MV就係中英對照;建議:接受,呢個係忠於原作)?定係要淨中文行?(技術上兩樣都得,per-line filter一開就淨中文)
2. **71首live純英文**嘅過渡處理:重做期間照住先(建議)定即刻侷unusable落架?
3. P1-P4開唔開工(P0建議即批,佢淨係令擋板更準)。
