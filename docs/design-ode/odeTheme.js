// Odely 設計系統 — 取代 src/theme/designSystem.js 嘅「生命樹」色板
// 定稿來源：Ode Home Design.dc.html → 2a / 2b（首頁定稿 + token 表）
// 原則：綠色全退場、冇金色、暖光（cream）只用嚟表示「光 / 播放 / 進度」

export const colors = {
  bg: '#0B0913',            // 主背景（原 #0B0F0E）
  surface: '#150F26',       // 卡片（原 #121A17）
  surface2: '#1E1838',      // 次層卡片
  surfaceRaised: '#221B3E', // 圖示底、頭像底、封面佔位底
  border: '#2A2145',        // 邊框 / 分隔線
  borderSoft: '#16112A',    // 列表行分隔線（比 border 更淡）
  chipBorder: '#33294F',    // 未選中 chip / 圓形細掣描邊

  primary: '#B9A6F2',       // 主色：已收藏、選中狀態、連結
  primaryDim: '#C3BADF',    // icon 閒置色
  glow: '#EFE4D2',          // 暖光：主 CTA、播放掣、進度條、選中 tab
  glowSoft: '#FFE9CF',      // 光暈 / 發光效果用

  text: '#F4F1FA',
  textOnGlow: '#1C1436',    // 暖光底上面嘅字
  textMuted: '#A79CD0',     // 分區標題、經節
  textDim: '#8F88AB',       // 歌手、次要資訊
  danger: '#E8896D',        // 登出、刪除（沿用舊值）
};

export const typography = {
  // 拉丁 / 品牌
  brand: { fontFamily: 'Sora', fontWeight: '200', letterSpacing: 1.5 },
  brandHeader: 32,   // app header 字標「ode」
  brandSplash: 44,   // splash 字標（letterSpacing 5）
  numeric: { fontFamily: 'Sora', fontWeight: '200' }, // 數字、時間、計數

  // 中文 UI
  ui: { fontFamily: 'Noto Sans TC' },
  pageTitle: 26,     // 詩歌庫 / 我的
  songTitle: 15.5,   // 列表歌名（500）
  songTitleLg: 16,   // 最愛列表 / 迷你播放器
  artist: 12.5,      // 歌手（400）
  playerTitle: 26,   // 播放頁歌名
  sectionLabel: { size: 12, weight: '500', letterSpacing: 2.5, color: colors.textMuted },
  body: 15,
  tabLabel: 11.5,

  // 金句 / 歌詞（宋體）
  serif: { fontFamily: 'Noto Serif TC' },
  quote: { size: 17, lineHeight: 1.85 },
  lyrics: { size: 19, lineHeight: 1.95 },
};

export const radii = {
  card: 18,
  cardSm: 16,
  coverList: 9,
  coverGrid: 14,
  coverHero: 20,
  pill: 26,
  chip: 22,
};

export const spacing = {
  pageH: 18,        // 左右頁邊
  blockGap: 20,     // 卡與卡之間
  listRowV: 10,     // 列表行上下 padding
  listRowH: 16,
  bottomInset: 110, // 內容底部留空（迷你播放器 + tab bar）
  tabBarHeight: 70,
  minTouch: 44,
};

export const header = {
  markSize: 52,      // logo 日蝕環 — 52dp，唔係 28dp
  markGap: 13,
  padding: { top: 12, horizontal: 18, bottom: 20 },
  avatar: 40,
  wordmarkSize: 30,  // 「odely」Sora 200 / letterSpacing 1.2
};

// Logo 環：一律由原圖 assets/ode-logo.jpeg 裁切，唔可以用 View 畫圓環。
// 用法：<View style={logoRing(52)}><Image source={odeLogo} style={logoRingImage(52)} /></View>
export const logoRing = (size) => ({
  width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
});
export const logoRingImage = (size) => ({
  width: size * 1.6, height: size * 1.6,
  marginLeft: -size * 0.3, marginTop: -size * 0.255,
});
export const LOGO_SIZES = { header: 52, player: 22, splash: 156 };

export const effects = {
  // 所有封面加內描邊，防止深底「浮」出嚟
  coverInset: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  // 主 CTA 外發光
  ctaGlow: { shadowColor: '#FFE3C2', shadowOpacity: 0.16, shadowRadius: 22 },
  playGlow: { shadowColor: '#FFE3C2', shadowOpacity: 0.24, shadowRadius: 34 },
};

export const iconState = {
  idle: colors.primaryDim,   // #C3BADF
  secondary: colors.textDim, // #8F88AB
  active: colors.glow,       // #EFE4D2
  saved: colors.primary,     // #B9A6F2
  disabledOpacity: 0.4,
  danger: colors.danger,
};

export default { colors, typography, radii, spacing, header, effects, iconState };
