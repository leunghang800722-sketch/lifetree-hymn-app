// backend/lib/urlItagClen.js — FIRST-TRACK-STEP01-FIX-20260907 #2
//
// 抽出自 routes/stream.js（NATIVE-STALL-ROOTFIX-PLAN-20260830 §5 H2 原文）,
// 俾 routes/hls.js 都可以用同一個函式做「免費」clen/itag 校驗（見 hls.js
// verifyClenMatches 上面嘅呼叫位），唔使兩份幾乎一樣嘅 parse 邏輯分喺兩個
// 檔案入面各自維護。行為完全冇變:攞唔到/parse 唔到一律回 '-'，唔拋錯。
export function extractItagClen(u) {
  try {
    if (!u) return { itag: '-', clen: '-' };
    const parsed = new URL(u);
    return {
      itag: parsed.searchParams.get('itag') || '-',
      clen: parsed.searchParams.get('clen') || '-',
    };
  } catch (_) {
    return { itag: '-', clen: '-' };
  }
}
