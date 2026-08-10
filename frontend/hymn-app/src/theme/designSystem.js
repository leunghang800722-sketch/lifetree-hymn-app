// Ode 設計系統 —— 取代「生命樹」色板 (ODE-REBRAND-PLAN)
//
// 來源:docs/design-ode/odeTheme.js(定稿 token)。原則:綠色全退場、冇金色、
// 暖光(cream)淨係用嚟表示「光 / 播放 / 進度 / 選中 tab / 主 CTA」,主色紫
// 用嚟表示「已收藏 / 選中 chip / 連結」。
//
// ⚠️ 規矩:
//   * 全 App 只准用呢張表嘅顏色,唔好再寫死 hex。
//   * 舊 COLORS.accent 呢個 key 保留做過渡 alias(fallback 指去 glow),但實際
//     75 個用位已經逐個判斷改用 COLORS.glow / COLORS.primary,唔係齋齋改
//     alias 就當做完。
//   * COLORS(大寫)係新舊合併嘅超集 —— 舊 key 名(background/card/accent/…)
//     繼續用得,同時亦有新 ode key(glow/primary/surface/textMuted/…)可以
//     直接攞,唔使再 import 多一次 `colors`(細寫)。

export const ODE_COLORS = {
  bg: '#0B0913',             // 主背景(原 #0B0F0E)
  surface: '#150F26',        // 卡片(原 #121A17)
  surface2: '#1E1838',       // 次層卡片
  surfaceRaised: '#221B3E',  // 圖示底、頭像底、封面佔位底
  border: '#2A2145',         // 邊框 / 分隔線
  borderSoft: '#16112A',     // 列表行分隔線(比 border 更淡)
  chipBorder: '#33294F',     // 未選中 chip / 圓形細掣描邊

  primary: '#B9A6F2',        // 主色:已收藏、選中狀態、連結
  primaryDim: '#C3BADF',     // icon 閒置色
  glow: '#EFE4D2',           // 暖光:主 CTA、播放掣、進度條、選中 tab
  glowSoft: '#FFE9CF',       // 光暈 / 發光效果用

  text: '#F4F1FA',
  textOnGlow: '#1C1436',     // 暖光/主色底上面嘅字(深色先睇得清)
  textMuted: '#A79CD0',      // 分區標題、經節
  textDim: '#8F88AB',        // 歌手、次要資訊
  danger: '#E8896D',         // 登出、刪除(沿用舊值)
};

// 過渡 alias(舊 key 名,20 個檔案 import 緊,唔可以爆 undefined)+ 新 ode key
// 合併做一個超集,咁樣任何檔案 `COLORS.xxx` 都攞到啱嘅值,唔使逐個檔案加 import。
export const COLORS = {
  background: ODE_COLORS.bg,
  card: ODE_COLORS.surface,
  cardLight: ODE_COLORS.surface2,
  accent: ODE_COLORS.glow,   // fallback;實際用位已逐個判斷 glow/primary(§ODE-REBRAND-PLAN)
  gold: ODE_COLORS.glow,     // 金句金色退場,舊 key 保留過渡指去暖光
  textPrimary: ODE_COLORS.text,
  textSecondary: ODE_COLORS.textDim,
  border: ODE_COLORS.border,
  overlay: 'rgba(0,0,0,0.6)',
  danger: ODE_COLORS.danger,
  ...ODE_COLORS,
};

// §5.3 可讀性:聽歌好多時係「一眼掃過去搵嗰首歌」,字大細直接決定搵歌快唔快。
// 正文最少 15、歌名列表 ≥15.5、播放頁歌名 26、歌詞行距 1.95。
export const TYPOGRAPHY = {
  title: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary },
  sectionTitle: { fontSize: 12, fontWeight: '500', letterSpacing: 2.5, color: COLORS.textMuted, textTransform: 'uppercase' },
  playerTitle: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary },
  songTitle: { fontSize: 15.5, fontWeight: '500', color: COLORS.textPrimary },
  body: { fontSize: 15, fontWeight: '400', color: COLORS.textPrimary },
  artist: { fontSize: 12.5, fontWeight: '400', color: COLORS.textSecondary },
  lyrics: { fontFamily: 'NotoSerifTC-Regular', fontSize: 19, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 19 * 1.95 },
  // 拉丁品牌字標
  brand: { fontFamily: 'Sora-ExtraLight', fontWeight: '200', letterSpacing: 1.2 },
};

export const SPACING = { sm: 8, md: 16, lg: 24 };

// ── 新 Ode 完整 token(細寫,照 docs/design-ode/odeTheme.js)──────────────
export const colors = ODE_COLORS;

export const typography = {
  brand: { fontFamily: 'Sora-ExtraLight', fontWeight: '200', letterSpacing: 1.2 },
  brandHeader: 30,
  brandSplash: 40,
  numeric: { fontFamily: 'Sora-ExtraLight', fontWeight: '200' },

  ui: { fontFamily: 'Noto Sans TC' },
  pageTitle: 26,
  songTitle: 15.5,
  songTitleLg: 16,
  artist: 12.5,
  playerTitle: 26,
  sectionLabel: { size: 12, weight: '500', letterSpacing: 2.5, color: colors.textMuted },
  body: 15,
  tabLabel: 11.5,

  serif: { fontFamily: 'NotoSerifTC-Regular' },
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
  pageH: 18,
  blockGap: 20,
  listRowV: 10,
  listRowH: 16,
  bottomInset: 110,
  tabBarHeight: 70,
  minTouch: 44,
};

export const header = {
  markSize: 52,
  markGap: 13,
  padding: { top: 12, horizontal: 18, bottom: 20 },
  avatar: 40,
};

// F3 followup(Opus 第二輪覆核):shadowColor/shadowOpacity/shadowRadius 淨係
// iOS 有效,呢個 project 開咗 newArchEnabled,RN 0.85 Android 側方案係
// `boxShadow` CSS string(Fabric 先支援,兩邊平台都食得),先至真係有暖光
// 外發光效果。數值對齊 ODE-HANDOFF §3:ctaGlow = 0 0 22px 16% 透明度,
// playGlow = 0 0 34px 24% 透明度。
export const effects = {
  coverInset: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  ctaGlow: { boxShadow: '0 0 22px rgba(255,227,194,0.16)' },
  playGlow: { boxShadow: '0 0 34px rgba(255,227,194,0.24)' },
};

export const iconState = {
  idle: colors.primaryDim,
  secondary: colors.textDim,
  active: colors.glow,
  saved: colors.primary,
  disabledOpacity: 0.4,
  danger: colors.danger,
};

export default { colors, typography, radii, spacing, header, effects, iconState, COLORS, TYPOGRAPHY, SPACING };
