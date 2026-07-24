# 自動播放開關 + 心情/類型自動接歌方案 v2

> 設計文件,交執行 session(Sonnet)實作。2026-07-20 v2:
> **Eric 拍板 chips 改做五個:全部/熱門/隨心/個人創作/純音樂**(取代 v1 六個建議)。
> 其中「個人創作」「純音樂」而家庫入面**冇貨或者近乎冇貨**,§4 有內容缺口分析,
> Eric 過目後先決定呢兩粒 chip 嘅上架時機。
> 現有機制:v231「單曲 + 自動隨機接續」——`playSingle()`(App.js #575),
> 隊列 = [嗰首歌, ...全庫隨機抽 RADIO_LEN=30 首],`autoRadioFrom` 標交界,
> UI 畫「正在隨機播放:」分隔線。

## 0. 數據現實

歌庫 150 首(hymns view;hymns_all 有 1518 首未 curate)。2026-07-20 查 DB:

- `view_count` / `like_count` / `tags` / `release_date` 欄位存在但**全部係空**
- App 冇播放記錄:前端只存「最後播嗰首」,backend 冇 play log
- 150 首 curated **全部係樂團/機構出品**(讚美之泉、約書亞、小羊詩歌呢類),
  冇一首係個人創作,亦冇一首純音樂(HOME-DISCOVERY-REDESIGN.md #190 早已確認)
- hymns_all 未 curate 存貨入面:個人創作類(敬拜瞬間系列個人敬拜者)~11 首、
  純音樂類(QT音樂/鋼琴)~8 首 —— 有種子,但未夠開一個類

## 1. UI / 交互設計

### 佇列 sheet 頂部

```
┌──────────────────────────────────┐
│ 佇列                              │
│ 自動播放                    [●━] │  ← toggle,預設開
│ 加入類似內容,無間斷播放           │  ← 副標題細字
│ [全部] [熱門] [隨心] [個人創作] [純音樂] │ ← chips,單選,toggle 開先出現
├──────────────────────────────────┤
│ ▶ 而家播緊嗰首                    │
│   ... 用戶自己揀嘅歌 ...          │
│ ─── 自動播放:熱門 ───            │  ← 「正在隨機播放:」升級做呢句
│   ... 自動接續嘅歌 ...            │
└──────────────────────────────────┘
```

- toggle + 所揀 chip 存 MMKV(`autoplay.enabled`, `autoplay.flavor`),下次開 App 記得。
- **五粒 chip 常設顯示**(2026-07-23 Eric 拍板,推翻原建議嘅「冇貨隱藏」):
  揀中未有貨嘅類別會喺 chips 下面出友善提示「「XX」詩歌入緊庫,暫時先為你隨機
  接續全庫詩歌」,尾巴 fallback 全庫隨機,唔會斷播。
- **chip 清單係 config-driven**(v244):`src/utils/autoplay.js` 嘅 `FLAVORS` array
  係單一來源,加新 tag 類分類 = 加一行 `{ key, label, tag }`,UI 自動跟。

### 行為語義(同 v1 一樣,重列要點)

| 情況 | 行為 |
|---|---|
| toggle 開(預設) | 有隨機尾巴,抽歌池按 flavor 加權(§2) |
| toggle 關 | `playSingle` 淨播嗰首;`playQueue` 播完清單即停。關咗就係關咗,唔准偷偷 append |
| 中途較 toggle/換 chip | **唔可以斷歌**:`TrackPlayer.removeUpcomingTracks()` 剪走舊尾巴再 `add()` 新尾巴,唔准 reset(reset 會 re-buffer 1-2 秒) |
| 同 shuffle 嘅關係 | shuffle 只洗用戶自己嗰段(autoRadioFrom 之前);自動尾巴本身已隨機。toggleShuffle 要加呢個邊界 |
| 播到隊列尾 | phase 1 照停;phase 2 先做無限接續(剩 3 首 append 一批) |

## 2. 五個 chip 嘅定義

核心原則照舊:**加權抽樣,唔係硬 filter**(150 首小庫,硬 filter 好易十零首循環洗腦)。
「個人創作」「純音樂」係例外 —— 呢兩個係**真類別**,用戶預期就係「淨係呢類」,
所以佢哋用硬 filter,但正因為咁先有 §4 嘅入貨門檻。

| Chip | 定義 | 抽法 | 靠咩數據 |
|---|---|---|---|
| 全部 | 成個庫,唔理你聽開乜 | 均勻隨機(= 而家 v231 行為,零改動) | 冇 |
| 熱門 | 大家都聽嘅歌 | view_count 排名頭 30% 權重 ×8、中段 ×3、尾 ×1;將來換 App 內真實播放數 | §3b |
| 隨心 | **個人化**「為你調嘅 mix」 | 70% 熟悉(播過,count 高/近期加成)+ 30% 未聽過嘅新發現 | §3a |
| 個人創作 | 個人敬拜者/獨立創作作品(非樂團機構出品) | 硬 filter `tags LIKE '%個人創作%'`,類內隨機 | §3c + §4A |
| 純音樂 | 冇人聲、器樂/鋼琴詩歌 | 硬 filter `tags LIKE '%純音樂%'`,類內隨機 | §3c + §4B |

「全部」同「隨心」嘅分別要喺 UI 講清楚(chip 副標題或者首次選中 toast):
**全部 = 全庫是但抽;隨心 = 根據你聽開嘅歌調配**。如果 Eric 覺得「隨心」呢個名
同「隨心聽」(首頁快速開播掣,= 全庫 shuffle)撞名易混淆,可以考慮叫「為你」——
名 Eric 話事,技術上只係 label。

通用規則(所有 chip 一致):
- 最近播過 15 首權重 ×0.1(防小庫循環);同一 youtube_id 去重;播緊嗰首唔入池
- 加權抽樣結果不足 RADIO_LEN(30)就由全庫均勻補(硬 filter 類除外 —— 佢哋不足就
  有幾多播幾多,播完先 fallback 去「全部」池,交界再畫一條「繼續隨機播放」線)
- 全部喺前端行:`useCachedHymns` 已有全量清單,加權抽樣 O(n)。
  條件:`GET /api/hymns` SELECT 加返 `tags, view_count, created_at`

## 3. 要種嘅數據(同 v1 相同,對應新 chips)

- **3a. 本地播放記錄**(供「隨心」):MMKV `playLog` `{ [hymnId]: {count, lastAt} }`,
  喺 `PlaybackActiveTrackChanged`(App.js #467)記,聽夠 30 秒先算,skip 唔算。
- **3b. YouTube view_count/like_count**(供「熱門」):夜間 job 行
  `yt-dlp --skip-download --print "%(view_count)s|%(like_count)s|%(upload_date)s"`,
  跟 growLibrary 慢速紀律(concurrency 1、隔 3 秒、00:07-08:07),150 首一晚搞掂,
  之後每星期 refresh。⚠️ IP 被 ban 史,唔准即場批量爬。
- **3c. tags 標註**(供「個人創作」「純音樂」):離線一次過將庫入面歌標 `tags` 欄
  (受控詞表加入 `個人創作`、`純音樂` 兩個值);新歌入庫時 growLibrary 順手標。
- **(phase 2 可選)3d. 全體用戶播放統計**:`play_events` 表 + `POST /api/plays` beacon,
  夠數後「熱門」由 YouTube 數換做 App 內真實熱度。

## 4. ⚠️ 內容缺口:「個人創作」「純音樂」而家係冇貨開唔到嘅

呢部分係俾 Eric 睇嘅實情,唔好淨係整咗 UI 但撳落去冇嘢播。

### 4A. 個人創作 —— 庫存 0/150,未 curate 存貨 ~11 首

**第一個要拍板嘅問題:「個人創作」指邊樣?**兩個解讀,做法完全唔同:

1. **獨立個人敬拜者嘅作品**(相對樂團/機構):例如「敬拜瞬間」系列(朱肇階、
   李漫渟、關望生、李俊霆呢啲個人名義出嘅敬拜錄音)。hymns_all 入面已經有 ~11 首
   呢類存貨,再靠夜間擴充 job 對準呢啲頻道收多啲,**幾晚到一兩星期就可以夠 20-30 首開檔**。
   要做:worshipGroups.js 加呢類頻道做種子 + curate 時標 `tags='個人創作'`。
2. **App 用戶自己上載嘅原創作品**(Eric/教會肢體自己寫嘅歌):呢個係 REDESIGN-PLAN
   路線圖 Phase 5(上載審核)/Phase 6(內容社群)嘅嘢,**而家連上載功能都未有**,
   唔係一個 chip 搞得掂,係一整期工程。如果 Eric 指嘅係呢樣,呢粒 chip 要等 Phase 5。

建議:先照解讀 1 入貨開檔(有貨、有意義),解讀 2 留返俾上載功能上線後自然併入
(用戶上載嘅歌一樣標 `個人創作` tag,chip 定義唔使改)。**但要 Eric 確認佢心目中係邊個意思。**

### 4B. 純音樂 —— 庫存 0/150,未 curate 存貨 ~8 首

HOME-DISCOVERY-REDESIGN.md 嗰陣已經查過:**而家一首純音樂都冇**。要開呢粒 chip 就要入貨:

- **貨源**:詩歌鋼琴/器樂敬拜係 YouTube 大類(琴與爐、詩歌鋼琴純音樂、instrumental
  worship、soaking music 呢類頻道),貨源唔缺。
- **做法**:worshipGroups.js 加 3-5 個純音樂頻道種子 → 夜間擴充 job 照常收 →
  curate 時標 `tags='純音樂'`。夜間 job 而家每晚配額 54 首,撥一部分俾呢類,
  **兩三晚就夠 20-30 首開檔**。
- **注意**:純音樂片好多係 30 分鐘至 2 小時嘅長 loop 合輯 —— curate 時要有長度準則
  (建議 chip 池只收 ≤15 分鐘嘅,長合輯另外擺去首頁「安靜靈修」清單嗰邊,唔好入
  自動接續池,唔係「自動播放」會變咗「自動霸機兩個鐘」)。

### 未有貨時嘅行為(2026-07-23 更新:Eric 拍板 chip 常設顯示,冇上架門檻)

- 兩粒 chip 一開始就顯示;類內 0 首時揀落去 = 友善提示 + fallback 全庫隨機接續
- 貨入到庫(tags 標好)嗰刻,提示自動消失、開始淨播類內歌,唔使出 build
- 舊嘅 `CHIP_MIN_POOL=20` 門檻已廢除(v244)

## 5. 改動清單(執行 session 用)

**前端(App.js + queue sheet)**
1. `playSingle(hymn)`:尾巴由 `buildAutoplayTail(flavor, playLog, allSongs)` 生成
   (新 util `src/utils/autoplay.js`,純函數,方便測)
2. toggle 關 → `playQueue([hymn], 0)`,冇尾巴
3. 佇列 sheet UI:toggle + chips + 交界文案 + 冇貨隱藏規則
   (gorhom sheet 入面要用 SheetTouchable,App.js #47-50 教訓)
4. 換 flavor 熱切換:`removeUpcomingTracks()` + `add(newTail)`,同步 `queueRef`/`setQueue`/`autoRadioFrom`
5. playLog(§3a)+ MMKV 持久化設定

**Backend**
6. `/api/hymns` SELECT 加 `tags, view_count, created_at`
7. 夜間 metadata job(§3b):`backend/scripts/refreshMetadata.js` + launchd
8. worshipGroups.js 加「個人創作」「純音樂」種子頻道(§4)
9. (獨立 session)tags 標註 pass(§3c)

**風險位**
- `removeUpcomingTracks` 後 TrackPlayer index 同 `currentQueueIndexRef` 要一致
  (queue/index 同步一直係呢個 App 最多 bug 嘅位;改完必測:播歌中途換 chip →
  title/下一首/通知欄三處一致)
- shuffle × autoplay 交界要有 test case
- 純音樂長合輯唔好流入自動接續池(§4B 長度準則)

## 6. 分期

- **Phase 1**(一個執行 session):toggle + 「全部」「隨心」兩粒 chip(playLog 即日有效)
  + §5.6 API 欄位 + 冇貨隱藏機制
- **Phase 1.5**(等一晚 metadata job):「熱門」上架
- **Phase 2**(等入貨,約 1-2 星期夜間收錄 + curate + 標 tag):「個人創作」「純音樂」
  自動現身;play_events beacon、無限接續
