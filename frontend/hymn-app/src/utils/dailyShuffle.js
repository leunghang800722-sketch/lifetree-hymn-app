// 日期種子洗牌 —— HOME-DISCOVERY-REDESIGN.md §6
//
// 首頁「今日為你預備」同每個 chip 嘅 6 首歌要「日日換,但同一日入面唔變」。
// 用 `YYYY-MM-DD` 做 seed 嘅穩定 shuffle:同一日同一個 salt 出嚟永遠一樣,
// 過咗零點自動換過。唔用 Math.random —— 嗰啲每次 re-render 都跳位,好躁。
//
// salt 令唔同區塊(今日為你預備 / 各 chip)唔會抽埋同一批歌。

function todayKey(d = new Date()) {
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

// ⚠️ 舊嘅 `seededShuffle`(Fisher-Yates + mulberry32 seeded PRNG)喺
// PHASE2.5-PRELOAD-PLAN §3.2 改用 hashRank 之後已經零 caller,THIRD-PASS-REVIEW
// P3 剷咗(連同淨係服務佢嘅 mulberry32)。要睇返點解換走佢,見下面 hashRank
// 上面嗰段;要睇返原本實作,git history 有。

// PHASE2.5-PRELOAD-PLAN §3.2 —— per-song hash rank(取代「洗成個池再攞頭 n」)。
//
// 舊做法 `seededShuffle(pool).slice(0, n)` 對**池內容**極敏感:池多一首/少一首,
// Fisher-Yates 每一步嘅 j 都變晒,頭 6 首會完全換過。而個池就係全庫(featured=1
// 而家 0 首),growLibrary 每 15 分鐘跑、歌詞線日日 delist —— 即係開機用 MMKV 舊庫
// render 完,幾秒後 background refresh 一到,「今日為你預備」啲卡就靜靜哋換晒歌。
// 副作用唔止「日更」承諾冇兌現:Phase 2.5 嘅「聽日頭 2 首」預載跨日之後必定脫靶。
//
// 呢度改成每首歌**獨立**計分(分數只同 `日期|salt|自己個 id` 有關),排完攞頭 n:
// 池加 100 首新歌,舊歌分數一條都唔變,新歌打入頭 6 嘅機會係 6/池大小,即係
// 通常一首都唔換、最多換一首。
//
// tie-break 用 id 字串比較(**唔可以**用原 array 次序),否則罕有嘅 hash 撞喺
// 池次序一變嗰陣又會令結果跳位,白做。
//
// ⚠️ 分數要行多一步 avalanche(murmur3 finalizer)。FNV-1a 最後一步係一個乘法,
// 高位散得唔夠勻;而「語言保底」係喺一個細池(英文得 389 首)攞 **argmin**,
// 呢種「攞極值」嘅用法會將分佈嘅偏差放大——實測淨用 FNV-1a,1000 日入面有
// 一首英文歌被抽中 15 次(舊 shuffle 算法最多 8 次)。加咗 mix32 之後就同舊
// 算法同級。純 shuffle 用唔覺,呢度先至覺,所以呢步唔可以慳。
function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16; return h >>> 0;
}

function hashRank(list, seedStr) {
  return [...list]
    .map((h) => ({ h, s: mix32(hashString(`${seedStr}|${h && h.id}`)), k: String(h && h.id) }))
    .sort((a, b) => (a.s - b.s) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.h);
}

// 當日抽 n 首(同一日穩定,池變動都穩定 —— 見 hashRank)。
export function dailyPick(list, salt, n) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return hashRank(list, `${todayKey()}|${salt}`).slice(0, n);
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
// IOS-ANDROID-PARITY-PLAN Phase 2.5 —— 加可選 `d`(Date)參數:個清單係
// 日期種子決定嘅,即係今晚已經計到「聽日」係邊幾首,可以預先落載。唔傳
// 就係今日,所有現有 caller 行為不變。
export function dailyPickBalanced(list, salt, n, langs, d = new Date()) {
  if (!Array.isArray(list) || list.length === 0) return [];
  // PHASE2.5-PRELOAD-PLAN §3.2:由 seededShuffle 改做 hashRank —— 語言保底同
  // 補數兩段邏輯一模一樣,淨係「排隊嗰個次序」由「洗成個池」變成「每首歌自己
  // 嘅分數」,令池增長嗰陣頭 n 首基本上唔會換人。最後嗰下重排都要用 hashRank,
  // 唔係(得 6 首嘅)小池一有人換,剩低 5 首嘅次序又會跳。
  const ranked = hashRank(list, `${todayKey(d)}|${salt}`);
  const picked = [];
  const taken = new Set();

  // 先每個語言保底一首
  for (const lang of langs || []) {
    const hit = ranked.find((h) => h.lang === lang && !taken.has(h.id));
    if (hit) { picked.push(hit); taken.add(hit.id); }
  }
  // 再順住個 rank 次序補到夠數
  for (const h of ranked) {
    if (picked.length >= n) break;
    if (!taken.has(h.id)) { picked.push(h); taken.add(h.id); }
  }
  // 保底嗰幾首固定咗排頭,再排一次先唔會日日都係「粵國英」同一個次序
  return hashRank(picked.slice(0, n), `${todayKey(d)}|${salt}|order`);
}
