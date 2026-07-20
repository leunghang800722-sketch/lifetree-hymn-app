// 自動播放尾巴生成 —— AUTOPLAY-MIX-PLAN v2。純函數,方便測。
//
// 核心原則:**加權抽樣,唔係硬 filter**(150 首小庫,硬 filter 好易十零首循環洗腦)。
// 「個人創作」「純音樂」係例外(真類別,用戶預期淨係呢類)→ 硬 filter。
//
// flavor:
//   全部   uniform(= v231 現行行為,零改動)
//   熱門   view_count 加權(頭 30% ×8 / 中段 ×3 / 尾 ×1;全 0 → 退化成 uniform)
//   隨心   70% 熟悉(playLog count 高)+ 30% 未聽過
//   個人創作/純音樂  硬 filter tags,類內隨機(不足就有幾多播幾多)

export const RADIO_LEN = 30;
export const CHIP_MIN_POOL = 20; // 類內少過呢個數,chip 唔顯示

// tags 欄位 → 判斷類別(受控詞表)
function hasTag(song, tag) {
  const t = song?.tags;
  return typeof t === 'string' && t.includes(tag);
}

// Efraimidis–Spirakis 加權抽樣(無放回):key = rand^(1/weight),取最大 N 個。
// weight 0/負 → 當極細,幾乎唔會抽中。
function weightedSample(items, weightOf, n) {
  const keyed = items.map((it) => {
    const w = Math.max(weightOf(it), 1e-9);
    return { it, key: Math.pow(Math.random(), 1 / w) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, n).map((k) => k.it);
}

function dedupeByYoutube(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = s.youtube_id || s.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// 一個 flavor 有幾多「貨」—— chip 顯示與否用(硬 filter 類先有意義)。
export function poolSize(flavor, allSongs = []) {
  if (flavor === '個人創作') return allSongs.filter((s) => hasTag(s, '個人創作')).length;
  if (flavor === '純音樂') return allSongs.filter((s) => hasTag(s, '純音樂')).length;
  return allSongs.length; // 全部/熱門/隨心 = 成個庫
}

// 邊啲 chip 應該顯示(冇貨嗰啲隱藏,§4 門檻)
export function visibleFlavors(allSongs = []) {
  const base = ['全部', '熱門', '隨心'];
  const gated = [];
  if (poolSize('個人創作', allSongs) >= CHIP_MIN_POOL) gated.push('個人創作');
  if (poolSize('純音樂', allSongs) >= CHIP_MIN_POOL) gated.push('純音樂');
  return [...base, ...gated];
}

// 生成自動尾巴。opts: { playLog, recentIds }
export function buildAutoplayTail(flavor, hymn, allSongs = [], opts = {}) {
  const playLog = opts.playLog || {};
  const recent = new Set(opts.recentIds || []); // 最近播過,壓權防循環
  const curId = hymn?.id;

  // 硬 filter 類:類內隨機,不足 RADIO_LEN 就有幾多得幾多(播完前端會 fallback 全部池)
  if (flavor === '個人創作' || flavor === '純音樂') {
    const pool = dedupeByYoutube(allSongs.filter((s) => hasTag(s, flavor) && s.id !== curId));
    return weightedSample(pool, () => 1, RADIO_LEN);
  }

  const pool = dedupeByYoutube(allSongs.filter((s) => s.id !== curId));

  // 熱門:view_count 分三段加權
  if (flavor === '熱門') {
    const sorted = [...pool].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    const rank = new Map(sorted.map((s, i) => [s.id, i / Math.max(sorted.length - 1, 1)]));
    const weightOf = (s) => {
      const base = (rank.get(s.id) ?? 1) < 0.3 ? 8 : (rank.get(s.id) < 0.6 ? 3 : 1);
      return recent.has(s.id) ? base * 0.1 : base;
    };
    return weightedSample(pool, weightOf, RADIO_LEN);
  }

  // 隨心:熟悉(playLog count)加權,未聽過畀基礎權重(佔約三成)
  if (flavor === '隨心') {
    const weightOf = (s) => {
      const played = playLog[s.id]?.count || 0;
      // 熟悉:count 越高越重;未聽過:基礎 0.4(令新發現約佔三成)
      let w = played > 0 ? 1 + played * 2 : 0.4;
      if (recent.has(s.id)) w *= 0.1;
      return w;
    };
    return weightedSample(pool, weightOf, RADIO_LEN);
  }

  // 全部(預設):uniform,recent 壓權。等同 v231 但多咗防循環。
  const weightOf = (s) => (recent.has(s.id) ? 0.1 : 1);
  return weightedSample(pool, weightOf, RADIO_LEN);
}
