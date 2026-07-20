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
// priority 意思(點解要咁排,見 LIBRARY-EXPANSION-PLAN.md §2):
//   1 = 最急。粵語係旗艦(HK 用戶),但歌庫得 8 個粵語歌手,係 artist 多樣性嘅樽頸。
//   2 = 補國語缺口(國語 pool 夠多,但得 12 個歌手,擴到 400 首會太重複)。
//   3 = 英文。pool 已經有 672 首可用 / 19 個歌手,20% 配額之下**根本唔等使爬**,
//       擴到 3000+ 首先會唔夠 —— 所以英文排最後,唔好嘥風險額度去爬。
//   4 = 兒童詩歌。2026-07-20 Eric 拍板:做第4個獨立分類、獨立配額(10%,
//       見 growLibrary.js QUOTA)。⚠️ 呢 8 個團體全部 inPool:false,即係
//       curate mode 幫唔到手 —— 要等 discover mode(§ runDiscover)真正接埋
//       YouTube 頻道搜尋邏輯先會有實際兒童詩歌收錄,而家仍然係 0。

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
  { name: '共享詩歌ShareHymns', aliases: ['ShareHymns', '共享詩歌'], lang: '粵語', priority: 1, inPool: false, channel: '@EnochLamSharehymns', est: 80 },
  { name: 'SON Music',        aliases: ['SON Music'],              lang: '粵語', priority: 1, inPool: false, channel: '@SonMusicSongs',   est: 50 },
  { name: 'Milk&Honey',       aliases: ['Milk&Honey', 'Milk & Honey'], lang: '粵語', priority: 1, inPool: false, channel: '@milkandhoneyhk', est: 30 },
  { name: '天弦音樂事工',      aliases: ['天弦音樂', '天弦', 'Gsus Music'], lang: '粵語', priority: 1, inPool: false, channel: '@gsusmusicministry', est: 30 },
  { name: 'SingforGod薪火敬拜', aliases: ['SingforGod', '薪火敬拜'], lang: '粵語', priority: 1, inPool: false, channel: '@singforgod',      est: 30 },
  { name: '鹹蛋音樂事工',      aliases: ['鹹蛋音樂', 'SEMM'],        lang: '粵語', priority: 1, inPool: false, channel: '@semmhk',          est: 30 },
  { name: 'Redsea Music',     aliases: ['Redsea Music'],           lang: '粵語', priority: 1, inPool: false, channel: '@redseamusic',     est: 20 },
  { name: 'flow music',       aliases: ['flow music', '流堂'],      lang: '粵語', priority: 1, inPool: false, channel: '@flowmusichk',     est: 20 },
  { name: 'KEC Worship',      aliases: ['KEC Worship', '歌鄰敬拜'], lang: '粵語', priority: 1, inPool: false, channel: '@KECworship',      est: 20 },
  { name: '悦雨音樂 GRM',      aliases: ['悦雨音樂', 'GRM'],         lang: '粵語', priority: 1, inPool: false, channel: '@gladnessrainmusic', est: 20 },
  { name: 'U-Fire GYRO Band', aliases: ['U-Fire', 'GYRO'],         lang: '粵語', priority: 1, inPool: false, channel: '@gyro_ufireband',  est: 20 },
  { name: 'Endless Worship',  aliases: ['Endless Worship', '無盡敬拜'], lang: '粵語', priority: 1, inPool: false, channel: '@endlessworship2022', est: 20 },
  // WorshiPool 係版權管理平台(收錄 40+ 個創作單位),唔係單一團體 —— 攞返嚟會撈埋
  // 好多重複同其他團體嘅歌,所以特登排最後,而且要人手睇過先好開。
  { name: 'WorshiPool',       aliases: ['WorshiPool'],             lang: '粵語', priority: 1, inPool: false, channel: '@worshipool', est: 500, note: '平台性質,易重複,人手審視先' },
  { name: 'JnX Worship',      aliases: ['JnX Worship', 'JnX'],     lang: '粵語', priority: 1, inPool: false, channel: null, est: 20 },

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
  { name: '新心音樂事工',      aliases: ['新心音樂'],                lang: '國語', priority: 2, inPool: false, channel: '@newheartmusic', est: 100 },
  { name: 'City Harvest Church', aliases: ['City Harvest'],        lang: '國語', priority: 2, inPool: false, channel: '@chc',           est: 100 },
  { name: '611 Worship',      aliases: ['611 Worship', '611敬拜'],  lang: '國語', priority: 2, inPool: false, channel: '@611worship',   est: 80 },

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

  // ── 兒童詩歌 ✅ 2026-07-20 Eric 拍板:第4個獨立分類,獨立配額 10% ──
  // priority 4 = runner 已經准揀,但全部 inPool:false,實際要等 discover mode
  // 接埋搜尋邏輯先會有歌收錄(見上面 priority 意思段)。
  { name: '讚美之泉兒童',      aliases: ['讚美之泉兒童'],            lang: '兒童', priority: 4, inPool: false, channel: null,               est: 100, kidsLang: '國語' },
  { name: '611 Kids Worship', aliases: ['611 Kids'],               lang: '兒童', priority: 4, inPool: false, channel: null,               est: 30,  kidsLang: '粵語/國語' },
  { name: '天韻兒童詩歌',      aliases: ['天韻兒童'],                lang: '兒童', priority: 4, inPool: false, channel: '@heavenlymelody',  est: 30,  kidsLang: '國語' },
  { name: 'ACM兒童詩歌',       aliases: ['ACM兒童'],                 lang: '兒童', priority: 4, inPool: false, channel: '@hkacm',           est: 20,  kidsLang: '粵語' },
  { name: 'CantonHymn兒童版',  aliases: ['CantonHymn兒童'],          lang: '兒童', priority: 4, inPool: false, channel: '@cantonhymn',      est: 20,  kidsLang: '粵語' },
  { name: 'Saddleback Kids',  aliases: ['Saddleback Kids'],        lang: '兒童', priority: 4, inPool: false, channel: '@saddlebackkids',  est: 100, kidsLang: '英文' },
  { name: 'Hillsong Kids',    aliases: ['Hillsong Kids'],          lang: '兒童', priority: 4, inPool: false, channel: '@hillsongkids',    est: 80,  kidsLang: '英文' },
  { name: 'Bethel Kids',      aliases: ['Bethel Kids'],            lang: '兒童', priority: 4, inPool: false, channel: null,               est: 30,  kidsLang: '英文' },
  // ⚠️ 未搬:`hymn-groups-database.md` §四原始資料仲有 4 個未搬落嚟 ——
  // 約書亞樂團青少年版(國語~20)、共享詩歌兒童版(粵語~10)、Listenn Kids(英語~30)、
  // God's Awesome Kids(粵語~10)。搬之前要人手覆核官方 handle,而家未做。
];

// 2026-07-20:priority <= 4(粵/國/英/兒童全部已拍板)。
export const ACTIVE_GROUPS = GROUPS.filter((g) => g.priority <= 4);
export const PENDING_GROUPS = GROUPS.filter((g) => g.priority === 9);
