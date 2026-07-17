// 相容層 —— 唔好喺呢度加新顏色。
//
// 呢個檔案本身曾經係第二套色板(黑底 + Spotify 綠 #1ED760),同
// `src/theme/designSystem.js` 嗰套「深綠 + teal」並存,搞到成個 App 兩種樣
// (REDESIGN-PLAN.md §5.1 講嘅正正就係呢個問題)。
//
// 有 10+ 個檔案 import 緊呢度嘅 `COLORS.bg` / `.accent` 等等,所以與其逐個檔案改,
// 呢度改成**指返** designSystem 嗰套「生命樹」色板,舊 key 名照用。
// 咁樣所有 importer 自動攞到新色,唔使一個個手動改(亦唔會漏)。
//
// 👉 新 code 請直接 `import { COLORS } from '../theme/designSystem'`。

import { COLORS as LIFE_TREE } from '../theme/designSystem';

export const COLORS = {
  bg: LIFE_TREE.background,           // was #000000 純黑
  cardBg: LIFE_TREE.card,             // was #1A1A1A
  cardBgLight: LIFE_TREE.cardLight,   // was #2A2A2A
  primary: LIFE_TREE.textPrimary,     // was #FFFFFF 死白
  secondary: LIFE_TREE.textSecondary, // was #A0A0A0
  accent: LIFE_TREE.accent,           // was #1ED760 Spotify 綠 -> 生命綠
  chipBg: LIFE_TREE.border,
  chipText: LIFE_TREE.textPrimary,
  divider: LIFE_TREE.border,
  overlay: LIFE_TREE.overlay,
  headerBg: LIFE_TREE.card,
  gold: LIFE_TREE.gold,               // 【只限金句/精選】
};

export default COLORS;
