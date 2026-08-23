// 「即刻揀歌」chip 定義 + 揀返「現用嗰個 chip」嘅共用邏輯。
//
// PHASE2.5-PRELOAD-PLAN §4 W2 —— 呢啲嘢本來淨係 HomeScreen.js 自己有:CHIP_DEFS、
// 「夠 3 首先開個 chip」、「記低嗰個 chip 冇咗就 fallback 返第一個」。而家開 App
// 嘅預載器(App.js §3b①)都要知道「用戶而家睇緊邊個 chip、佢頭一首係邊首」先
// 落載得中,如果兩邊各自實現同一套 fallback,第日改一邊就會靜靜哋 drift(預載
// 落錯歌,而且冇任何錯誤訊號,淨係命中率跌)。所以抽晒出嚟一份。
//
// 純 JS,零 native 依賴,Android 一樣 import 得。

// DB 冇 playlist 表,所以用語言 + 關鍵字即場砌 —— 現有數據下最誠實嘅做法:
// 有真歌、撳到、播到。將來加清單淨係加一項,唔使改版面。
// INSTRUMENTAL-CATEGORY-PLAN §8 Q4(Eric 2026-08-21 拍板)—— 「安靜靈修」chip
// 由「純音樂」**取代**,唔係並存。舊 `quiet` 係純前端 title regex,同任何
// backend 分類零關係,撈出嚟大部分係有人聲嘅慢歌;而家有真 flag 就唔再靠估。
// ⚠️ 新 chip 一定要用新 id `instrumental`,唔准翻用 `quiet` —— dailyPick 攞
// chip id 做 hash salt,翻用舊 id 會令新分類繼承舊分類嘅每日輪換 seed。
// 舊用戶 MMKV 記住咗 `quiet` 唔使寫 migration:resolveActiveChip() 下面嗰句
// `|| chips[0]` 會自動跌返第一個 chip。
//
// 語言 chip 嘅 `&& h.instrumental !== 1`:同詩歌庫語言 tab 同一條規矩
// (2026-08-23 Eric 拍板「唔撞」)—— 語言 chip 剔走器樂,**兒童 chip 唔剔**
// (兒童=受眾維度、純音樂=形式維度,正交)。舊 cache 冇個欄 → `undefined
// !== 1` 為真 → 行為同改動前一樣。
export const CHIP_DEFS = [
  { id: 'cantonese',    title: '粵語敬拜', match: (h) => h.lang === '粵語' && h.instrumental !== 1 },
  { id: 'mandarin',     title: '國語敬拜', match: (h) => h.lang === '國語' && h.instrumental !== 1 },
  { id: 'english',      title: 'English',  match: (h) => h.lang === '英文' && h.instrumental !== 1 },
  { id: 'kids',         title: '兒童詩歌', match: (h) => h.lang === '兒童' },
  { id: 'instrumental', title: '純音樂',   match: (h) => h.instrumental === 1 },
];

// 每頁 4 首(唔係 5)—— 5 首嗰陣最尾一首會俾 mini player 擋住,見唔晒。
export const CHIP_PAGE_SIZE = 4;

// 夠 3 首先開個 chip,唔好俾空清單呃人。
const MIN_CHIP_SONGS = 3;

export function buildChips(hymns) {
  const list = Array.isArray(hymns) ? hymns : [];
  return CHIP_DEFS
    .map((c) => ({ ...c, songs: list.filter(c.match) }))
    .filter((c) => c.songs.length >= MIN_CHIP_SONGS);
}

// 用戶記低嗰個 chip 可能已經冇咗(歌被 delist 到少過 3 首),fallback 返第一個。
export function resolveActiveChip(hymns, chipId) {
  const chips = buildChips(hymns);
  return chips.find((c) => c.id === chipId) || chips[0] || null;
}
