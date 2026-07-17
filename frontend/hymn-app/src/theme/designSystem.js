// 「生命樹」設計系統 —— 全 App 唯一色板來源 (REDESIGN-PLAN.md §5.2)
//
// 之前 code 入面有兩套色並存(舊「黑底 + Spotify 綠 #1ED760」同「深綠底 + teal
// #00C9A7」),有啲畫面用 A 有啲用 B,睇落似兩個 App 縫埋。呢個檔案而家係**唯一**
// 來源;`src/constants/theme.js` 已改成指返呢度嘅相容層。
//
// ⚠️ 規矩(§5.2):
//   * 全 App 只准用呢張表嘅顏色,唔好再寫死 hex。
//   * 金色 = 「聖俗有別」嘅記號,**只准**用喺每日金句 / 精選呢類屬靈重點內容,
//     唔准攞嚟做普通按鈕。
//   * 播放掣、心心着燈、進度條 = 生命綠。

export const COLORS = {
  background: '#0B0F0E',      // 近黑深林綠 —— 夜、安靜
  card: '#121A17',            // 深綠灰 —— 樹蔭
  cardLight: '#1A241F',       // 次層卡片
  accent: '#3DB389',          // 生命綠 —— 樹葉、生命(由 teal #00C9A7 調暖)
  gold: '#E8B86D',            // 暖金 —— 果實、燭光【只限金句/精選】
  textPrimary: '#F5F7F4',     // 米白 —— 唔用死白,冇咁刺眼
  textSecondary: '#9AA696',   // 灰綠 —— 只用喺次要資訊
  border: '#1F2925',
  overlay: 'rgba(0,0,0,0.6)',
};

// §5.3 可讀性:聽歌好多時係「一眼掃過去搵嗰首歌」,字大細直接決定搵歌快唔快。
// 正文最少 16、歌名列表 18、播放頁歌名 24+;歌詞行距最少 1.7 倍。
export const TYPOGRAPHY = {
  title: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  playerTitle: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary }, // §5.3 24pt+
  songTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },   // §5.3 列表 18pt
  body: { fontSize: 16, fontWeight: '400', color: COLORS.textPrimary },        // §5.3 正文最少 16pt
  artist: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  lyrics: { fontSize: 18, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 31 }, // 31/18 = 1.72x
};

export const SPACING = { sm: 8, md: 16, lg: 24 };
