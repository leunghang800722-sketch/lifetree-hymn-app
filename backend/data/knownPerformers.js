// backend/data/knownPerformers.js — TAXONOMY-5D-PLAN.md §3.2 Layer T seed 名單。
//
// `backfillMeta.js` 嘅 Layer T(title 對照)用嚟喺 title 度直接搵已知歌手名。
// D(description)/A(AI)兩層落空先撞呢層(D 優先——description 通常有更明確嘅
// 「主唱/演唱」標籤,title 有時淨係品牌/團體名冇歌手,靠呢個 seed 名單頂硬上
// 反而風險高啲,但泥土音樂呢類「title 必定帶歌手名」嘅團體命中率好高)。
//
// 加新歌手:加一組 { performer: 'canonical 名', aliases: [...] }。
// aliases 包含中文名/英文名/暱稱,title 出現任何一個 alias(substring match)
// 就當命中,寫返 canonical `performer` 名(唔係寫命中嗰個 alias 字面)。
//
// ⚠️ pilot 階段(C5,§8)淨係要「泥土音樂」呢個 org 用得到嘅歌手,起碼要有
// 盛曉玫/Amy Sand。之後全庫跑(P4 全庫階段)先逐團體加多。

export const KNOWN_PERFORMERS = [
  { performer: '盛曉玫', aliases: ['盛曉玫', '盛暁玫', 'Amy Sand', 'AmySand'] },
];

// title 命中 → canonical performer 名;搵唔到 → null。
export function matchTitlePerformer(title) {
  if (!title) return null;
  for (const entry of KNOWN_PERFORMERS) {
    for (const alias of entry.aliases) {
      if (alias && title.includes(alias)) return entry.performer;
    }
  }
  return null;
}
