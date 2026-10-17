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

// ROOTFIX 後續(Eric 2026-08-25 拍板)—— 隨心聽/自動接續池排除 >10 分鐘長檔。
// 實證:2026-08-25 04:07Z 背景自動接續輪到 35 分鐘現場錄音(id 1722),長檔
// 設計上冇本地預載(audioPrefetch MAX_PREFETCH_SECONDS 同一個閘),背景冷
// stream 撞正慢網就入 AVPlayer stall-retry 風暴,用戶感知「播播下自己停咗」。
// 隨機池入面呢類長檔係結構性溫床,索性唔抽。
//   - 閾值同預載閘一致(10 分鐘),兩個閘用同一把尺:抽得中嘅歌就預載得到。
//   - duration parse 唔到(null)= 唔知,唔可以當長(同預載閘同一原則)。
//   - ⚠️ 只適用於「隨機抽」嘅池(全部/熱門/隨心 + 隨心聽洗牌)。有 tag 嘅
//     真類別(個人創作/純音樂)**唔 filter**:用戶明確揀咗嗰類,而且純音樂
//     嘅 soaking/鋼琴長片係 INSTRUMENTAL-CATEGORY-PLAN 特登起嘅入口,
//     有自己嘅長檔串流分流(Phase 3b),唔可以喺呢度陰乾佢。
import { parseDurationSec } from '../audioPrefetch';
export const MAX_AUTOPLAY_TRACK_SECONDS = 10 * 60;
export function isTooLongForAutoplay(song) {
  const sec = parseDurationSec(song?.duration);
  return sec != null && sec > MAX_AUTOPLAY_TRACK_SECONDS;
}

// ===== Chip 設定(單一來源)=====
// §Eric(v244):五粒 chip 全部常設顯示,唔再按庫存門檻隱藏(舊 CHIP_MIN_POOL 已廢)。
// 加新分類 = 加一行:
//   - 有 `tag` 嘅係「真類別」:硬 filter tags 欄含嗰個字;冇貨/唔夠貨有 fallback(見下)
//   - 冇 `tag` 嘅係加權抽樣 flavor,權重邏輯喺 buildAutoplayTail 按 key 特判
//     (新加權 flavor 先至要落 code;預期日後新增嘅多數係 tag 類,一行搞掂)
// key 同時係 MMKV 入面存嘅值,改咗會令用戶已儲設定 fallback 返「全部」,所以唔好改舊 key。
export const FLAVORS = [
  { key: '全部', label: '全部' },
  { key: '熱門', label: '熱門' },
  { key: '隨心', label: '隨心' },
  { key: '個人創作', label: '個人創作', tag: '個人創作' },
  { key: '純音樂', label: '純音樂', tag: '純音樂' },
];

function flavorConfig(key) {
  return FLAVORS.find((f) => f.key === key) || FLAVORS[0];
}

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

// 一個 flavor 有幾多「貨」—— tag 類先有意義(其他 = 成個庫)。
// UI 用嚟決定顯唔顯示「入緊庫」友善提示(chip 本身永遠顯示)。
export function poolSize(flavor, allSongs = []) {
  const cfg = flavorConfig(flavor);
  if (cfg.tag) return allSongs.filter((s) => hasTag(s, cfg.tag)).length;
  return allSongs.length;
}

// 生成自動尾巴。opts: { playLog, recentIds }
export function buildAutoplayTail(flavor, hymn, allSongs = [], opts = {}) {
  const playLog = opts.playLog || {};
  const recent = new Set(opts.recentIds || []); // 最近播過,壓權防循環
  const curId = hymn?.id;

  // 硬 filter 類(config 有 tag):類內隨機,不足 RADIO_LEN 就有幾多得幾多。
  // 類入面完全冇貨 → fallback 做全庫 uniform(chip 常設顯示,「自動播放」嘅
  // 無間斷承諾唔可以斷;UI 會另出「入緊庫」提示話畀用戶知)。
  const cfg = flavorConfig(flavor);
  if (cfg.tag) {
    const pool = dedupeByYoutube(allSongs.filter((s) => hasTag(s, cfg.tag) && s.id !== curId));
    if (pool.length > 0) return weightedSample(pool, () => 1, RADIO_LEN);
    // fall through → 下面「全部」uniform 邏輯
  }

  // 長檔閘(見檔頭 isTooLongForAutoplay 註解)—— 只落喺隨機抽嘅通用池。
  const pool = dedupeByYoutube(allSongs.filter((s) => s.id !== curId && !isTooLongForAutoplay(s)));

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
