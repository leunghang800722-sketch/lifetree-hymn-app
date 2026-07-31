// 詩歌團體清單 —— 由 Eric / OpenClaw 搜集嘅 `hymn-groups-database.md`(repo 根目錄)
// 提煉出嚟嘅**可執行工作清單**。嗰份 md 係人睇嘅完整資料(含官網、成立年份、
// 歌曲數估算),呢度淨係擺 runner 要用嘅嘢。**加新團體請先更新嗰份 md。**
//
// `channel` = YouTube handle。discover mode 一定要用 channel 而唔好用關鍵字搜尋:
// 撳正個官方頻道攞歌,又準又少 request,而關鍵字搜尋會扒一大堆唔相干嘅片返嚟,
// 既嘥額度又易撞 block。冇 handle 嘅團體排喺最後先做。
//
// `inPool: true` = 呢個團體已經喺 hymns_all 入面有歌(唔使再爬,curate 就得)。
// `inPool: false` = 歌庫完全冇,要夜晚慢慢 discover。
//
// priority 意思(呢個純粹用嚟排 discover mode「先爬邊個團體」嘅次序,
// 同語言配額冇關係 —— growLibrary.js 2026-07-20 起已經冇固定語言比例呢個
// 概念,擴充淨係跟歌手多樣性自然增長,詳見 LIBRARY-EXPANSION-PLAN.md §2):
//   1 = 最急。粵語係旗艦(HK 用戶),但歌庫得 8 個粵語歌手,係 artist 多樣性嘅樽頸。
//   2 = 補國語缺口(國語 pool 夠多,但得 12 個歌手,擴到 400 首會太重複)。
//   3 = 英文。pool 已經有 672 首可用 / 19 個歌手,遠比粵/國兩邊夠用,
//       所以優先次序排最後,唔好嘥風險額度去爬。⚠️ 2026-07-21 Eric 追加拍板:
//       **英文暫停主動擴充**(見 growLibrary.js PAUSED_LANGUAGES)——移除語言
//       配額嗰一晚,45/48 首新歌都係英文,同「粵語優先」原意背馳,所以呢個
//       priority 3 而家實際上唔會被 runner 揀中,keep 住個排位淨係做記錄。
//   4 = 兒童詩歌。2026-07-20 Eric 拍板:做第4個獨立分類。⚠️ 呢 13 個團體
//       全部 inPool:false,即係 curate mode 幫唔到手 —— 要 discover mode
//       先會有實際兒童詩歌收錄。discover mode 本身已經實作咗(見
//       growLibrary.js runDiscover,含分類/死鏈驗證/先寫入嘅完整關卡),
//       但 launchd 排程仍然淨係跑 curate(Phase A 未見底,未到 Eric 話開
//       Phase B 嗰步),所以而家兒童詩歌數量仍然係 0,要手動
//       `--mode discover` 或者改排程先會郁。

export const GROUPS = [
  // ── 粵語(旗艦語言,artist 多樣性最缺)──────────────────────────
  { name: 'ACM',              aliases: ['ACM', 'HKACM'],           lang: '粵語', priority: 1, inPool: true },
  { name: '玻璃海樂團',        aliases: ['玻璃海'],                  lang: '粵語', priority: 1, inPool: true },
  { name: '角聲使團',          aliases: ['角聲使團'],                lang: '粵語', priority: 1, inPool: true },
  { name: '原始和聲',          aliases: ['原始和聲'],                lang: '粵語', priority: 1, inPool: true },
  { name: '團契遊樂園',        aliases: ['團契遊樂園'],              lang: '粵語', priority: 1, inPool: true },
  { name: '基恩敬拜',          aliases: ['基恩敬拜'],                lang: '粵語', priority: 1, inPool: true },
  { name: '讚美之泉粵語',      aliases: ['讚美之泉粵語'],            lang: '粵語', priority: 1, inPool: true },
  { name: '生命河粵語',        aliases: ['生命河粵語'],              lang: '粵語', priority: 1, inPool: true },
  // 以下粵語團體歌庫**完全冇** —— 呢批先係真正要爬嘅嘢。
  // 次序 = 建議吸納次序(歌多 + 有官方頻道 = 排前)。
  { name: 'CantonHymn',       aliases: ['CantonHymn'],             lang: '粵語', priority: 1, inPool: false, channel: '@cantonhymn',      est: 200 },
  { name: '同心圓敬拜',        aliases: ['同心圓', '同心圓敬拜'],     lang: '粵語', priority: 1, inPool: false, channel: '@theworshipers',   est: 100 },
  { name: '全心製作 HeartPro', aliases: ['HeartPro', '全心製作'],    lang: '粵語', priority: 1, inPool: false, channel: '@heartpro12',      est: 80 },
  // 2026-07-23:`@EnochLamSharehymns` 實測 404,搵到正確係 `@WeShareHymns`(已驗證)。
  // ⚠️ 呢個壞 handle 之前害到 discover mode 卡死:runDiscoverAll 揀「已收錄
  // 最少」嘅團體,一個永遠 0 收錄嘅壞 channel 會永久贏晒呢個位,擋住粵語
  // 其餘 15 個未吸納團體永遠冇機會攞到 discover 嘅 budget。
  { name: '共享詩歌ShareHymns', aliases: ['ShareHymns', '共享詩歌'], lang: '粵語', priority: 1, inPool: false, channel: '@WeShareHymns', est: 80 },
  { name: 'SON Music',        aliases: ['SON Music'],              lang: '粵語', priority: 1, inPool: false, channel: '@SonMusicSongs',   est: 50 },
  { name: 'Milk&Honey',       aliases: ['Milk&Honey', 'Milk & Honey'], lang: '粵語', priority: 1, inPool: false, channel: '@milkandhoneyhk', est: 30 },
  { name: '天弦音樂事工',      aliases: ['天弦音樂', '天弦', 'Gsus Music'], lang: '粵語', priority: 1, inPool: false, channel: '@gsusmusicministry', est: 30 },
  // 2026-07-26 Fable 5 質素抽查揪出 P1(SUPERVISION-LOG 10:30 條目):`@singforgod`
  // 實測係**私人家庭片頻道**("my sweet"/"pe doo.m2v"/"20060714 180527" 等),
  // 錯 handle 撞入嚟 7 首垃圾(全部誤標粵語),已 curated=0 清走,channel 拆走
  // 等搵到正身先補。
  { name: 'SingforGod薪火敬拜', aliases: ['SingforGod', '薪火敬拜'], lang: '粵語', priority: 1, inPool: false, channel: null,      est: 30, note: '2026-07-26 實測 @singforgod 係私人家庭片頻道,錯 handle,已清 7 首垃圾,待搵正身' },
  { name: '鹹蛋音樂事工',      aliases: ['鹹蛋音樂', 'SEMM'],        lang: '粵語', priority: 1, inPool: false, channel: '@semmhk',          est: 30 },
  // 2026-07-26 Fable 5 P1:`@redseamusic` 實測係**巴西葡語翻唱頻道**
  // ("Lugar Secreto"/"Bom Bom Pai...Tradução" 等),錯 handle 撞入嚟 13 首
  // 葡語敬拜(全部誤標粵語),已 curated=0 清走,channel 拆走等搵到正身先補。
  { name: 'Redsea Music',     aliases: ['Redsea Music'],           lang: '粵語', priority: 1, inPool: false, channel: null,     est: 20, note: '2026-07-26 實測 @redseamusic 係巴西葡語翻唱頻道,錯 handle,已清 13 首垃圾,待搵正身' },
  { name: 'flow music',       aliases: ['flow music', '流堂'],      lang: '粵語', priority: 1, inPool: false, channel: '@flowmusichk',     est: 20 },
  { name: 'KEC Worship',      aliases: ['KEC Worship', '歌鄰敬拜'], lang: '粵語', priority: 1, inPool: false, channel: '@KECworship',      est: 20 },
  { name: '悦雨音樂 GRM',      aliases: ['悦雨音樂', 'GRM'],         lang: '粵語', priority: 1, inPool: false, channel: '@gladnessrainmusic', est: 20 },
  // 2026-07-24:`@gyro_ufireband` 實測 404,搜尋搵到正身「Gyro_U-Fire Band」
  // (@gyro_u-fireband4359,已用 yt-dlp 驗證有敬拜內容),handle 有連字號
  // 易踩坑,改用穩陣嘅 channel id 形式。
  { name: 'U-Fire GYRO Band', aliases: ['U-Fire', 'GYRO'],         lang: '粵語', priority: 1, inPool: false, channel: 'channel/UCX96y8yd_kRVwxWTQxrjhRA',  est: 20 },
  { name: 'Endless Worship',  aliases: ['Endless Worship', '無盡敬拜'], lang: '粵語', priority: 1, inPool: false, channel: '@endlessworship2022', est: 20 },
  // WorshiPool 係版權管理平台(收錄 40+ 個創作單位),唔係單一團體 —— 攞返嚟會撈埋
  // 好多重複同其他團體嘅歌,所以特登排最後,而且要人手睇過先好開。
  // 2026-07-24:`@worshipool` 實測 404(壞 handle 會永久霸住粵語 discover slot,
  // 同 ShareHymns 一樣嘅坑)。已搵到正身「WorshiPool Official Channel」
  // (UCBdH0Y3bL8UsOzjrY4CzBAw / @worshipoolofficialchannel7201,yt-dlp 驗證有
  // 詩歌內容),但原本已註明「平台性質要人手審視先好開」,所以照舊唔開 ——
  // channel 留 null,等 Eric 拍板先填返上面個 id。
  { name: 'WorshiPool',       aliases: ['WorshiPool'],             lang: '粵語', priority: 1, inPool: false, channel: null, est: 500, note: '平台性質,易重複,人手審視先;2026-07-24 已搵到正確channel id(見上面註解)等拍板' },
  { name: 'JnX Worship',      aliases: ['JnX Worship', 'JnX'],     lang: '粵語', priority: 1, inPool: false, channel: null, est: 20 },
  // 2026-07-24:Eric 份完整清單入面提到,但搜尋(WebSearch × 2 次,唔同關鍵字)
  // 搵唔到任何肯定啱嘅粵語/香港 channel —— 搵到嘅"The Altar of Worship"、
  // "Altar of Prayer"、"Altar Worship Official" 全部係其他國家嘅頻道,
  // 冇一個對得上「香港粵語敬拜」呢個 context。**搵唔到,等 Eric 提供多啲
  // 資料(例如官網/Facebook 連結)先補。**
  { name: 'The Altar',        aliases: ['The Altar'],              lang: '粵語', priority: 1, inPool: false, channel: null, est: null, note: '2026-07-24 搜尋唔到啱嘅channel,等Eric提供多啲資料' },

  // ── 國語 / 普通話 ────────────────────────────────────────────
  { name: '讚美之泉',          aliases: ['讚美之泉'],                lang: '國語', priority: 2, inPool: true },
  { name: '約書亞樂團',        aliases: ['約書亞樂團'],              lang: '國語', priority: 2, inPool: true },
  { name: '小羊詩歌',          aliases: ['小羊詩歌'],                lang: '國語', priority: 2, inPool: true },
  { name: '有情天音樂',        aliases: ['有情天音樂'],              lang: '國語', priority: 2, inPool: true },
  { name: '天韻合唱團',        aliases: ['天韻詩歌', '天韻合唱團'],   lang: '國語', priority: 2, inPool: true },
  { name: '生命河靈糧堂',      aliases: ['生命河靈糧堂', 'ROLCC生命河'], lang: '國語', priority: 2, inPool: true },
  { name: '泥土音樂',          aliases: ['泥土音樂'],                lang: '國語', priority: 2, inPool: true },
  { name: '我心旋律',          aliases: ['我心旋律'],                lang: '國語', priority: 2, inPool: true },
  { name: '盛曉玫',            aliases: ['盛曉玫'],                  lang: '國語', priority: 2, inPool: true },
  { name: 'Heavenly Melody',  aliases: ['Heavenly Melody'],        lang: '國語', priority: 2, inPool: true },
  // 2026-07-23:`@newheartmusic` 實測 404,搵到正確係舊式 /user/ URL(冇 @handle)。
  { name: '新心音樂事工',      aliases: ['新心音樂'],                lang: '國語', priority: 2, inPool: false, channel: 'user/NewHeartMusic', est: 100 },
  // 2026-07-23:`@chc` 實測 404,搜尋搵到嘅候選(Singapore CityHarvestSG /
  // 一個叫「阿呵Hosea」嘅個人翻唱channel)都對唔上「City Harvest Church
  // 國語敬拜」呢個原意,冇肯定嘅正確 handle,拆走等搵到先補(同上面
  // ShareHymns 一樣嘅原因:一個永遠 404 嘅壞 channel 會卡死成個國語
  // discover slot,擋住 611 Worship / 新心音樂事工 冇機會攞 budget)。
  { name: 'City Harvest Church', aliases: ['City Harvest'],        lang: '國語', priority: 2, inPool: false, channel: null,            est: 100, note: '2026-07-23 拆走壞handle,等搵到先補' },
  // 2026-07-30 Eric 拍板全收(SUPERVISION-LOG「611 worship 敬拜全量入庫」條目):
  // 頻道 13-31 分鐘嘅 live worship set(多首歌連做一條片,例如「聖靈 我們歡迎祢
  // 降臨｜聖靈我們歡迎祢｜充滿在這裡｜611 Worship」)實測**冇撞任何 isCompilation
  // 關鍵字**,純粹俾標準 600s 片長上限擋住。`durationCapSec` 淨係呢個頻道生效
  // (見 hymnDb.js `isInSongDurationBand` maxOverride 註解),1900s(~31.7分鐘)
  // 留少少 margin 過實測嘅 31 分鐘,全局預設 600s 完全冇郁。
  { name: '611 Worship',      aliases: ['611 Worship', '611敬拜'],  lang: '國語', priority: 2, inPool: false, channel: '@611worship',   est: 80, durationCapSec: 1900, note: '2026-07-30 Eric拍板全收,連13-31分鐘live worship set都要,呢個頻道專屬片長上限1900s' },
  // 2026-07-24:Eric 完整清單追加嘅 3 個,逐個用 yt-dlp 實測過先落:
  // 2026-07-27 auditChannel.js 全庫回溯(SUPERVISION-LOG 10:40 條目 Q3):
  // 60 條 sample,歌片長帶 36.7%、blocklist 命中 60%——GATE 級(30-60%)。
  // ⚠️ 冇加 contentGate:'duration+title'——呢個頻道係中文,Layer 2 嘅
  // allowlist 淨係英文兒童頻道先安全(全局實測中文誤殺率高,見上面
  // contentGate 註解),硬加會連呢個頻道少數真.敬拜歌都篩晒(標題正面
  // 訊號淨係 10%)。現有 Layer1 片長 + isCompilation blocklist 已經擋走
  // 大部分講座/研習會內容,剩低嗰批留俾人手/未來語義層覆核,唔係機械
  // gate 增強能解決,暫時照舊(0 curated,冇急切性)。
  // 2026-07-31 18:05 緊急(Fable 5):Tier1 選台修復解凍咗呢個頻道之後,即刻
  // 用「清單多者先」揀中(612 條全庫最大戶),4 條 junk(年度異象/青吶特會
  // workshop)漏網滲入。四關 pipeline 本身冇壞,但呢個頻道嘅內容太雜(研習會/
  // 見證/工作坊,題目式標題冇固定 pattern),`missing-inband` 清單質素太低,
  // 唔啱做 Tier1 自動食——加 `tier1Exclude:true` 令 Tier1 選台跳過呢個頻道
  // (見 growLibrary.js runDiscoverAll),留返俾人手/未來語義層逐條覆核先收,
  // 唔畀 unattended 自動化夜夜滲垃圾。
  { name: 'Asia for JESUS',   aliases: ['Asia for JESUS', '國度豐收協會'], lang: '國語', priority: 2, inPool: false, channel: '@asiaforjesusasia', est: 50, tier1Exclude: true, note: '約書亞樂團旗下協會channel;titles多為live worship set + 名人講座,四關pipeline自然篩走唔啱格式嗰啲;2026-07-27 audit:帶內36.7%/blocklist60%/正面10%,GATE級但中文唔設Layer2;2026-07-31 加tier1Exclude,漏網4條已reject,留俾人手/語義層覆核' },
  // 2026-07-27 auditChannel.js 全庫回溯:60 條 sample,歌片長帶淨係 18.3%、
  // blocklist 命中 61.7%——REJECT 級(<30%),同 Kids on the Move 一樣嘅
  // 「頻道本質係節目台」問題。0 curated(discover 從未成功過),拆走
  // channel 唔好再試,免得夜夜嘥 discover budget。
  // 2026-07-31 18:05 Fable 5:channel 已經係 null(discover/Tier1/Tier2 全部
  // 摸唔到),但仲係補埋 tier1Exclude:true 做防禦性文檔——如果將來有 session
  // 手快快補返個 channel handle,呢個 flag 都會提醒唔好畀 Tier1 直接自動食
  // 呢個頻道(同 Asia for JESUS 同一原因:內容太雜,要人手/語義層先收)。
  { name: '台北復興堂',        aliases: ['台北復興堂', 'Taipei Revival Church'], lang: '國語', priority: 2, inPool: false, channel: null, est: 50, tier1Exclude: true, note: '官方channel,已驗證有內容,但夾雜住大量講道/名人講座;2026-07-27 audit:帶內18.3%/blocklist61.7%,REJECT級,已拆走channel(0 curated,discover從未成功過)' },
  // ⚠️ 「611靈糧堂」搵到嘅係「台北611靈糧堂」,實測內容幾乎全部係
  // 晨禱/晚禱/生命見證(冇歌名,淨係傳道/牧師名+日期),同上面已有嘅
  // 「611 Worship」(先係真正嘅敬拜歌頻道,已驗證粵國語都有)唔同源。
  // 2026-07-27 auditChannel.js 全庫回溯確認:60 條 sample,歌片長帶淨係
  // 5%、blocklist 命中 95%——REJECT 級,實測結果同原本(2026-07-24)嘅
  // 預判完全脗合。0 curated,拆走 channel 唔好再試。
  { name: '611靈糧堂',        aliases: ['611靈糧堂', '台北611靈糧堂'], lang: '國語', priority: 2, inPool: false, channel: null, est: 10, note: '2026-07-24 搵到channel但內容幾乎全係講道/禱告會,已有「611 Worship」先係啱嘅敬拜歌source;2026-07-27 audit確認:帶內5%/blocklist95%,REJECT級,已拆走channel(0 curated)' },

  // ── 英文(pool 已經嚴重超額,唔使爬)────────────────────────────
  { name: 'Hillsong Worship', aliases: ['Hillsong Worship'],       lang: '英文', priority: 3, inPool: true },
  { name: 'Hillsong UNITED',  aliases: ['Hillsong UNITED'],        lang: '英文', priority: 3, inPool: true },
  { name: 'Bethel Music',     aliases: ['Bethel Music'],           lang: '英文', priority: 3, inPool: true },
  { name: 'Elevation Worship', aliases: ['Elevation Worship'],     lang: '英文', priority: 3, inPool: true },
  { name: 'Jesus Culture',    aliases: ['Jesus Culture'],          lang: '英文', priority: 3, inPool: true },
  { name: 'CityAlight',       aliases: ['CityAlight'],             lang: '英文', priority: 3, inPool: true },
  { name: 'Chris Tomlin',     aliases: ['Chris Tomlin'],           lang: '英文', priority: 3, inPool: true },
  { name: 'Kari Jobe',        aliases: ['Kari Jobe'],              lang: '英文', priority: 3, inPool: true },
  { name: 'Matt Redman',      aliases: ['Matt Redman'],            lang: '英文', priority: 3, inPool: true },
  { name: 'Passion',          aliases: ['Passion'],                lang: '英文', priority: 3, inPool: true },
  { name: 'Maverick City',    aliases: ['Maverick City'],          lang: '英文', priority: 3, inPool: true },
  { name: 'Phil Wickham',     aliases: ['Phil Wickham'],           lang: '英文', priority: 3, inPool: true },
  { name: 'Brandon Lake',     aliases: ['Brandon Lake'],           lang: '英文', priority: 3, inPool: true },
  { name: 'CeCe Winans',      aliases: ['CeCe Winans'],            lang: '英文', priority: 3, inPool: true },
  { name: 'Cody Carnes',      aliases: ['Cody Carnes'],            lang: '英文', priority: 3, inPool: true },
  { name: 'Mosaic MSC',       aliases: ['Mosaic MSC'],             lang: '英文', priority: 3, inPool: true },
  { name: 'Jesus Image',      aliases: ['Jesus Image'],            lang: '英文', priority: 3, inPool: true },

  // ── 兒童詩歌 ✅ 2026-07-20 Eric 拍板:第4個獨立分類(冇固定配額,自然增長,
  // 見 growLibrary.js 頂部註解) ──
  // priority 4 = runner 已經准揀,但全部 inPool:false,實際要等 discover mode
  // 接埋搜尋邏輯先會有歌收錄(見上面 priority 意思段)。
  // 2026-07-26:Fable 5 監督診斷 + 已 yt-dlp 實測 —— 兒童組 13 個團體得
  // 4 個有 channel,中文兒童團體全部 null,兒童組實質純英文。呢個係官方
  // 獨立兒童頻道(唔係讚美之泉成人主頻道),實測 ≥100 條,全部兒童敬拜 MV。
  // 2026-07-27:Eric 截圖 sourcing、Fable 5 yt-dlp 驗證後加咗 3 個粵語兒童
  // playlist 源(粵語兒童組由 0 開始有貨)——見下面「ACM兒童詩歌」改動同
  // 新加嘅「基恩敬拜祈禱仔」「Giggles and Tunes 童唱童樂」。三個都係指住
  // 官方機構主 channel 入面嘅兒童 playlist(唔係成個 channel),因為主
  // channel 通常成人/兒童混埋,見 growLibrary.js listChannelVideos()。
  //
  // 2026-07-27 Fable 5 content-filter 架構升級(docs/SUPERVISION-LOG.md
  // 10:40 條目)Q1 Layer 2:`contentGate:'duration+title'` —— 淨係全部
  // 英文兒童頻道開(呢批頻道嘅節目集數可以好短,片長帶單靠 Layer 1 攔唔晒,
  // 但英文歌片標題慣例穩定,♫/lyric/worship/cover 等 allowlist 誤殺率低)。
  // 中文兒童頻道**唔設呢層**——實測全局 allowlist 對中文歌誤殺率好高
  // (611 Worship 7%/盛曉玫 17%/有情天 21%),中文頻道淨靠 Layer 1 片長 +
  // 現有 isCompilation()/isNonWorship() blocklist 已經夠。
  { name: '讚美之泉兒童',      aliases: ['讚美之泉兒童'],            lang: '兒童', priority: 4, inPool: false, channel: '@StreamofPraiseKids', est: 100, kidsLang: '國語' },
  { name: '611 Kids Worship', aliases: ['611 Kids'],               lang: '兒童', priority: 4, inPool: false, channel: null,               est: 30,  kidsLang: '粵語/國語' },
  // 2026-07-23:下面 3 個 channel 用 yt-dlp 逐個實測,發現都係錯嘅,已經
  // 拆走 handle 改返 null(等日後搵到真.兒童子頻道先補),原因:
  //   · 天韻兒童詩歌:`@heavenlymelody` 實測返嚟嘅係天韻**成人**主頻道
  //     (「天韻聲活圈」清談節目 + 一般敬拜歌 + 一條「作詞課」教學片),
  //     同已經 inPool:true 嗰個「Heavenly Melody / 天韻合唱團」係**同一個
  //     頻道**,唔係獨立兒童子頻道,亂咁指會將成人內容(甚至教學片)
  //     錯誤標做「兒童」收錄。
  //   · ACM兒童詩歌:`@hkacm` 實測 404,呢個 handle 根本唔存在。
  //   · CantonHymn兒童版:`@cantonhymn` 實測返嚟嘅同粵語嗰個
  //     「CantonHymn」一模一樣(堂會投稿嘅廣東話 cover),都係同一個
  //     general 頻道,唔係獨立兒童版。
  { name: '天韻兒童詩歌',      aliases: ['天韻兒童'],                lang: '兒童', priority: 4, inPool: false, channel: null, est: 30,  kidsLang: '國語', note: '2026-07-23 拆走錯 handle(其實係成人主頻道),等搵到真.兒童子頻道先補' },
  // 2026-07-27:Eric YouTube 截圖搵到 —— HKACM Official 主 channel
  // (UCIGCKTWZFjtQB-zGylKGiXg)嘅《ACM齊唱兒歌》系列 playlist,已 yt-dlp
  // 實測 76 條全部係官方 CD/DVD 版兒歌,好乾淨。主 channel 本身成人詩歌
  // 為主,所以指住呢個 playlist,唔指成個 channel(避免掃埋成人內容)。
  { name: 'ACM兒童詩歌',       aliases: ['ACM兒童'],                 lang: '兒童', priority: 4, inPool: false, channel: 'playlist?list=PLKztYP2DMa7idpsANDjeTwBK7O8zh-wXa', est: 76,  kidsLang: '粵語', note: '2026-07-27 改指HKACM Official主channel嘅《ACM齊唱兒歌》playlist,實測76條全部官方CD/DVD版兒歌' },
  { name: 'CantonHymn兒童版',  aliases: ['CantonHymn兒童'],          lang: '兒童', priority: 4, inPool: false, channel: null, est: 20,  kidsLang: '粵語', note: '2026-07-23 拆走錯 handle(其實係CantonHymn general頻道),等搵到真.兒童版先補' },
  // 2026-07-27 auditChannel.js 全庫回溯:60 條 sample,歌片長帶淨係
  // 13.3%、blocklist 命中 93.3%、標題正面訊號 0%——REJECT 級,同 Kids on
  // the Move 一樣「本質係節目台」(「Church at Home | Elementary | ...
  // Week N」呢類 15-20 分鐘兒童事工節目集數)。Layer1+Layer2 兩層都開埋
  // 都幾乎揀唔到嘢(正面訊號 0%)。0 curated(discover 從來冇成功過,同
  // growLibrary.js 註解入面提到嘅「永遠零產出」頻道吻合),拆走 channel
  // 唔好再試。
  { name: 'Saddleback Kids',  aliases: ['Saddleback Kids'],        lang: '兒童', priority: 4, inPool: false, channel: null,  est: 100, kidsLang: '英文', contentGate: 'duration+title', note: '2026-07-27 audit:帶內13.3%/blocklist93.3%/正面0%,REJECT級,已拆走channel(0 curated,discover從未成功過)' },
  { name: 'Hillsong Kids',    aliases: ['Hillsong Kids'],          lang: '兒童', priority: 4, inPool: false, channel: '@hillsongkids',    est: 80,  kidsLang: '英文', contentGate: 'duration+title' },
  { name: 'Bethel Kids',      aliases: ['Bethel Kids'],            lang: '兒童', priority: 4, inPool: false, channel: null,               est: 30,  kidsLang: '英文', contentGate: 'duration+title' },
  // 2026-07-20:Eric 拍板將呢 4 個(+1 新搵到嘅)搬入嚟。channel handle 已經用
  // `yt-dlp --flat-playlist` 逐個實測揾過先落,唔係靠估:
  //   - Listenn Kids / God's Awesome Kids / Kids on the Move 三個係手動搜尋
  //     搵到,原本 4 個入面淨係呢個先有得驗證;另外兩個(約書亞樂團青少年版、
  //     共享詩歌兒童版)網上搜尋淨係搵到佢哋嘅**母頻道**(約書亞樂團、
  //     ShareHymns@WeShareHymns,兩個都已經 inPool:true),搵唔到獨立嘅
  //     青少年/兒童子頻道,所以 channel 留 null,唔好亂咁指去母頻道
  //     (會同已收錄嗰個團體撞埋,重複扒同一個頻道)。
  //   - ⚠️「Listenn Kids」呢個名喺 YouTube 搵唔到,但「**Listener Kids**」
  //     (`@listenerkids`)完全對得上原本描述(英語、兒童 Bible/worship
  //     animation),相信係 `hymn-groups-database.md` 手民之誤,已經用
  //     呢個名 + 已驗證嘅 handle 收錄。
  //   - 「Kids on the Move」(Eric 提過,但原始資料冇呢個團體)搵到官方
  //     頻道 `@KidsontheMove`(Church on the Move 兒童事工,Tulsa OK,英語),
  //     已驗證,加埋做第 5 個新搬入嘅團體。
  { name: '約書亞樂團青少年版', aliases: ['約書亞樂團青少年版', 'Joshua Band Youth'], lang: '兒童', priority: 4, inPool: false, channel: null, est: 20, kidsLang: '國語', note: '搵唔到獨立子頻道,只有母頻道(已 inPool),待補' },
  { name: '共享詩歌兒童版',    aliases: ['共享詩歌兒童版', 'ShareHymns Kids'],       lang: '兒童', priority: 4, inPool: false, channel: null, est: 10, kidsLang: '粵語', note: '搵唔到獨立子頻道,只有母頻道 @WeShareHymns(已 inPool),待補' },
  { name: 'Listener Kids',    aliases: ['Listenn Kids', 'Listener Kids'],           lang: '兒童', priority: 4, inPool: false, channel: '@listenerkids', est: 60, kidsLang: '英文', contentGate: 'duration+title', note: '原始資料寫「Listenn Kids」,相信手民之誤,已驗證 @listenerkids 至少60條片' },
  { name: "God's Awesome Kids", aliases: ["God's Awesome Kids"],                    lang: '兒童', priority: 4, inPool: false, channel: null, est: 10, kidsLang: '粵語', note: '網上搜尋唔到,搵返到先補' },
  // 2026-07-27:Eric 截圖揪出,人手逐條(87首)睇晒 channel 內容,confirm 咗
  // 呢個 channel **本質係兒童聖經教育/品格節目**,唔係詩歌台 —— 87 首入面
  // 淨係 4 首係明確嘅歌(有 Lyric Video/♫ 標記),其餘 83 首係「God's Animal
  // | Preschool」動物知識show、「Bible Story」/「Parafries」故事集、
  // 「Let's Talk About X」/「What is X?」討論教學segment、角色skit
  // (Eggward 等)、Advent devotional、經文解釋、Supercut 合輯 ——
  // 呢啲 titles 完全冇撞任何 isCompilation() 嘅負面關鍵字(冇「合輯/講座/
  // 見證」呢類字眼),純粹因為題目式標題唔似歌名先俾人手睇得出。83 首
  // 已經 `curated=0`(reversible),淨返嗰 4 首明確歌保留。channel 拆走
  // 改 null,唔好再俾 discover mode 挖(尤其而家個 mechanism 淺層搵唔到
  // 會自動深挖到 200,只會挖多更多同類非詩歌內容)。
  { name: 'Kids on the Move', aliases: ['Kids on the Move'],                        lang: '兒童', priority: 4, inPool: false, channel: null, est: 4, kidsLang: '英文', contentGate: 'duration+title', note: '2026-07-27 拆走channel——實測87首入面83首唔係歌(兒童聖經教育節目,唔係詩歌台),已delist,唔好再discover' },
  // 2026-07-26:Fable 5 診斷兒童組卡死(13個團體得4個有channel)之後加嘅
  // 兩個,已 yt-dlp 實測:
  { name: 'CJ and Friends',   aliases: ['CJ and Friends'],                          lang: '兒童', priority: 4, inPool: false, channel: '@cjandfriends', est: 60, kidsLang: '英文', contentGate: 'duration+title', note: '2026-07-26 已驗證,兒童敬拜dance/sing-along內容' },
  // ⚠️ Yancy 個頻道夾雜清談/merch 推廣片(例如「Convo about Hosting
  // Special Events」),唔淨係歌 —— 靠現有 passesQuality() 篩,冇專門加
  // keyword,留意實際收錄率。
  { name: 'Yancy',            aliases: ['Yancy'],                                   lang: '兒童', priority: 4, inPool: false, channel: '@yancynotnancy', est: 30, kidsLang: '英文', contentGate: 'duration+title', note: '2026-07-26 已驗證,但頻道夾雜清談/推廣片,靠quality filter篩,收錄率可能唔算高' },
  // 2026-07-27:Eric YouTube 截圖搵到嘅粵語兒童 playlist 源,已 yt-dlp 實測。
  // 基恩敬拜(成人組已 inPool)主 channel 嘅「祈禱仔兒童敬拜系列」playlist,
  // 實測 49 條,~40 條係歌,其餘係專輯介紹/課程回顧/精華花絮呢類(靠
  // isCompilation 篩,見 hymnDb.js)。name 特登唔同成人組個「基恩敬拜」,
  // 免得 artist 統計撈亂。
  { name: '基恩敬拜祈禱仔',    aliases: ['祈禱仔', '基恩敬拜兒童'],  lang: '兒童', priority: 4, inPool: false, channel: 'playlist?list=PLj-Kuc40oOv0TU1rYIw1W3y2P_RAMpjb3', est: 40, kidsLang: '粵語' },
  // channel UC6WbY8uNiqTBZg3UayJdr2A 嘅「粵語兒童詩歌系列」playlist,實測
  // 64 條全部係【廣東話兒童詩歌】《歌名》格式純歌。⚠️ 成個 channel 一半以上
  // 係「兒童聖經故事/Bible Story for Kids」節目(同 Kids on the Move 一樣
  // 嘅陷阱),所以只准指呢個 playlist,唔好改做成個 channel。
  { name: 'Giggles and Tunes', aliases: ['Giggles and Tunes', '童唱童樂'],          lang: '兒童', priority: 4, inPool: false, channel: 'playlist?list=PLS4thsi71CJOrjaZmOR3LQo-4AB_0BW8z', est: 64, kidsLang: '粵語' },
];

// 2026-07-20:priority <= 4(粵/國/英/兒童全部已拍板)。
export const ACTIVE_GROUPS = GROUPS.filter((g) => g.priority <= 4);
export const PENDING_GROUPS = GROUPS.filter((g) => g.priority === 9);
