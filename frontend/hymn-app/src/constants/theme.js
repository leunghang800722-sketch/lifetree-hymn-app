// 相容層 —— 唔好喺呢度加新顏色。
//
// 呢個檔案本身曾經係第二套色板(黑底 + Spotify 綠 #1ED760),同
// `src/theme/designSystem.js` 並存,搞到成個 App 兩種樣。而家兩層都已經
// 改晒做 Ode 色板(ODE-REBRAND-PLAN),呢度嘅 key 名冇變,淨係指去嘅值變咗。
//
// 有 10+ 個檔案 import 緊呢度嘅 `COLORS.bg` / `.accent` 等等,所以與其逐個檔案改,
// 呢度改成**指返** designSystem 嗰套 Ode 色板,舊 key 名照用。
// 咁樣所有 importer 自動攞到新色,唔使一個個手動改(亦唔會漏)。
//
// 👉 新 code 請直接 `import { COLORS } from '../theme/designSystem'`(可以攞到
// 埋 glow/primary/surface/textMuted 等新 ode key,呢度冇 re-export)。

import { COLORS as ODE } from '../theme/designSystem';

export const COLORS = {
  bg: ODE.background,
  cardBg: ODE.card,
  cardBgLight: ODE.cardLight,
  primary: ODE.textPrimary,
  secondary: ODE.textSecondary,
  accent: ODE.accent,
  chipBg: ODE.border,
  chipText: ODE.textPrimary,
  divider: ODE.border,
  overlay: ODE.overlay,
  headerBg: ODE.card,
  gold: ODE.gold,
};

export default COLORS;
