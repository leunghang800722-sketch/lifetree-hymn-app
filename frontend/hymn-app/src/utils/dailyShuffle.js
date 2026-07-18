// 日期種子洗牌 —— HOME-DISCOVERY-REDESIGN.md §6
//
// 首頁「今日為你預備」同每個 chip 嘅 6 首歌要「日日換,但同一日入面唔變」。
// 用 `YYYY-MM-DD` 做 seed 嘅穩定 shuffle:同一日同一個 salt 出嚟永遠一樣,
// 過咗零點自動換過。唔用 Math.random —— 嗰啲每次 re-render 都跳位,好躁。
//
// salt 令唔同區塊(今日為你預備 / 各 chip)唔會抽埋同一批歌。

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// FNV-1a:短字串 hash,夠散又夠平。
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32:細細粒嘅 seeded PRNG,夠隨機兼可重現。
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates,用 seeded RNG(唔改原 array)。
export function seededShuffle(list, seedStr) {
  const rnd = mulberry32(hashString(String(seedStr)));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 當日抽 n 首(同一日穩定)。
export function dailyPick(list, salt, n) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return seededShuffle(list, `${todayKey()}|${salt}`).slice(0, n);
}

// 真·隨機洗牌 —— 「隨心聽」用,每次撳都要唔同,所以唔落 seed。
export function randomShuffle(list) {
  const a = [...(list || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 「今日為你預備」用:當日抽 n 首,但保證指定語言各至少一首。
// (國語佔歌庫一半,唔夾硬保底就成日抽到成堆國語 —— §2.4)
export function dailyPickBalanced(list, salt, n, langs) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const shuffled = seededShuffle(list, `${todayKey()}|${salt}`);
  const picked = [];
  const taken = new Set();

  // 先每個語言保底一首
  for (const lang of langs || []) {
    const hit = shuffled.find((h) => h.lang === lang && !taken.has(h.id));
    if (hit) { picked.push(hit); taken.add(hit.id); }
  }
  // 再順住個 shuffle 次序補到夠數
  for (const h of shuffled) {
    if (picked.length >= n) break;
    if (!taken.has(h.id)) { picked.push(h); taken.add(h.id); }
  }
  // 保底嗰幾首固定咗排頭,再洗一次先唔會日日都係「粵國英」同一個次序
  return seededShuffle(picked.slice(0, n), `${todayKey()}|${salt}|order`);
}
