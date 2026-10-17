// lib/fixFragmentedMp4Duration.js — iOS fMP4 duration-doubling 修補
//
// YouTube DASH 音訊係 fragmented MP4(moov 有 mvex、冇 mehd),但 mvhd/tkhd/mdhd
// 又寫住成首歌嘅完整長度。按 ISO/IEC 14496-12,fMP4 呢三個欄位應該係 0,總長要由
// mehd 或者 fragment 計。ExoPlayer(Android)跟標準、無視呢三個欄位 → 讀啱;
// AVFoundation(iOS)會將「moov 宣稱長度」同「fragment 總長度」加埋 → duration
// 讀到雙倍 → 播到真尾唔 fire AVPlayerItemDidPlayToEndTime → 播完冇聲、唔跳下一首。
//
// 呢個 helper 就地將三個欄位清零,長度完全不變(唔影響 Content-Length/Range)。
// 冇 mvex(唔係 fragmented mp4)就乜都唔掂——普通 MP4 嘅 mvhd duration 係唯一真相。
//
// 詳細根因同實測見 STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12.md

export function zeroFragmentedMp4Durations(head) {
  if (!Buffer.isBuffer(head) || head.length < 8) return false;

  let hasMvex = false;
  const fields = [];

  function walk(start, end) {
    let off = start;
    while (off + 8 <= end) {
      const size = head.readUInt32BE(off);
      const type = head.toString('latin1', off + 4, off + 8);
      if (size < 8 || off + size > end) return;
      const hdr = 8;
      if (type === 'moov' || type === 'trak' || type === 'mdia') {
        walk(off + hdr, off + size);
      } else if (type === 'mvex') {
        hasMvex = true;
      } else if (type === 'mvhd' || type === 'mdhd') {
        const ver = head[off + hdr];
        fields.push({ off: off + hdr + (ver === 0 ? 16 : 24), len: ver === 0 ? 4 : 8 });
      } else if (type === 'tkhd') {
        const ver = head[off + hdr];
        fields.push({ off: off + hdr + (ver === 0 ? 20 : 28), len: ver === 0 ? 4 : 8 });
      }
      off += size;
    }
  }

  try {
    walk(0, head.length);
  } catch (_) {
    return false;
  }

  // 唔係 fragmented(冇 mvex)就乜都唔好掂。
  if (!hasMvex) return false;

  let patched = false;
  for (const f of fields) {
    if (f.off + f.len > head.length) continue;
    head.fill(0, f.off, f.off + f.len);
    patched = true;
  }
  return patched;
}
