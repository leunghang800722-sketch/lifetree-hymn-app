// lib/hlsPlaylist.js — HLS-ROOTFIX-PLAN-20260901 §1:由 fragmented MP4 嘅 sidx box
// 生成 byte-range HLS playlist,零轉檔、零額外儲存。
//
// ⚠️ 呢個檔案淨係做「讀 box + 算數」,唔碰任何 bytes、唔改任何現有 route 行為。
// 實際派 segment bytes 仍然行舊 `/api/stream/:id`(routes/stream.js 完全冇改)。
//
// §1.3 五個必須處理嘅位(HLS-ROOTFIX-PLAN §1.3):
//   1. #EXT-X-MAP 淨係 ftyp+moov(唔包 sidx)—— init_size 逐個檔解 box 算,唔 hardcode。
//   2. timescale / 每格時長逐個檔讀,唔 hardcode。
//   3. zeroFragmentedMp4Durations() 一定要落 init segment —— 由現有
//      routes/stream.js 嘅 `startsAtZero` 分支自動處理(BYTERANGE 一定係
//      "<init_size>@0",AVPlayer 發嘅 Range 一定係 `bytes=0-<init_size-1>`,
//      匹配 `/^bytes=0-/`,自動行到 zeroFix——呢個檔案完全唔使自己碰呢件事)。
//   4. 冇 sidx 嘅檔 —— parsePlaylistStructure() 回 null,route 層轉 404。
//   5. Content-Type:playlist 呢個檔淨係負責產生 body 字串,Content-Type
//      由 route 層設。

// 讀一個 box header(size + type),唔夠 8 bytes 或者 largesize(size===1)/
// size===0(伸延到檔尾)一律當「解唔到」,唔支援嗰啲罕見形態 —— 寧願 404
// fallback,都好過用錯 offset 砌爛 playlist。
function readBoxHeader(buf, off) {
  if (off + 8 > buf.length) return null;
  const size = buf.readUInt32BE(off);
  const type = buf.toString('latin1', off + 4, off + 8);
  if (size === 0 || size === 1) return null; // largesize / extends-to-EOF,唔支援
  if (size < 8) return null;
  return { off, size, type, bodyOff: off + 8 };
}

// 逐個掃頂層 box,搵齊 ftyp / moov / sidx(第一個出現嘅嗰個)嘅 offset+size。
// 唔假設佢哋一定連續,亦唔假設固定次序,純粹逐個讀 header 跳過去。
// `needSidxEnd`:sidx box 嘅內容(reference 陣列)可能仲未讀齊(bytes 唔夠),
// 呢個 function 淨係讀 header,唔理 sidx 內容夠唔夠 —— 內容解析喺
// parseSidxBox() 另外做,俾 caller 決定「要唔要攞多啲 bytes 再試」。
function findTopBoxes(buf) {
  let off = 0;
  let ftyp = null, moov = null, sidx = null;
  while (off + 8 <= buf.length) {
    const box = readBoxHeader(buf, off);
    if (!box) break; // 讀唔到 header(largesize/EOF-size/唔夠 bytes)——停,唔再估
    if (box.type === 'ftyp' && !ftyp) ftyp = box;
    else if (box.type === 'moov' && !moov) moov = box;
    else if (box.type === 'sidx' && !sidx) { sidx = box; break; } // 搵到 sidx 就夠,唔使再掃落去
    if (box.off + box.size > buf.length) {
      // 呢個 box 本身伸延過咗我哋攞落嚟嗰截 buffer——如果係 sidx,留低
      // partial header 俾 caller 決定要唔要攞多啲;如果唔係 sidx,冇得再跳,停。
      if (box.type === 'sidx') { sidx = { ...box, truncated: true }; }
      break;
    }
    off = box.off + box.size;
  }
  return { ftyp, moov, sidx };
}

// 解 sidx box 內容(ISO/IEC 14496-12 §8.16.3)。要求成個 sidx box(header+body)
// 都喺 buf 範圍之內,唔夠就回 null,俾 caller 決定攞多啲 bytes 重試。
// 逐個檔讀 version/timescale/reference_count——紅線 §6:唔准 hardcode 呢啲數。
function parseSidxBox(buf, sidxBox) {
  const { off, size } = sidxBox;
  if (off + size > buf.length) return null; // 唔夠 bytes,呢個 box 冇讀齊
  let p = off + 8; // 跳過 box header(size+type)
  if (p + 4 > buf.length) return null;
  const version = buf.readUInt8(p);
  // flags 3 bytes 唔使理
  p += 4; // version(1) + flags(3)
  if (p + 8 > buf.length) return null;
  // reference_ID(4) 唔使理,跳
  p += 4;
  const timescale = buf.readUInt32BE(p);
  p += 4;
  let firstOffset;
  if (version === 0) {
    if (p + 8 > buf.length) return null;
    p += 4; // earliest_presentation_time(4),唔使理
    firstOffset = buf.readUInt32BE(p);
    p += 4;
  } else {
    if (p + 16 > buf.length) return null;
    p += 8; // earliest_presentation_time(8),唔使理
    // first_offset 係 64-bit,呢度用 BigInt 讀完轉返 Number(YouTube 段唔會大過
    // Number.MAX_SAFE_INTEGER 咁誇張,單一 sidx first_offset 通常細過 4GB)。
    firstOffset = Number(buf.readBigUInt64BE(p));
    p += 8;
  }
  if (p + 4 > buf.length) return null;
  // reserved(2) + reference_count(2)
  p += 2;
  const referenceCount = buf.readUInt16BE(p);
  p += 2;
  const refs = [];
  for (let i = 0; i < referenceCount; i++) {
    if (p + 12 > buf.length) return null; // 唔夠 bytes 讀晒全部 reference,要攞多啲
    const word0 = buf.readUInt32BE(p);
    const referencedSize = word0 & 0x7fffffff; // 低 31 bit(頂 bit 係 reference_type)
    const subsegmentDuration = buf.readUInt32BE(p + 4);
    // SAP 資訊(p+8..p+11)唔使理
    refs.push({ size: referencedSize, duration: subsegmentDuration });
    p += 12;
  }
  return { version, timescale, firstOffset, referenceCount, refs, sidxEnd: off + size };
}

// 主入口:俾一截由 offset 0 開始嘅 head buffer,砌出「呢個檔案播唔播得 HLS」
// 嘅完整結構。搵唔到 ftyp/moov/sidx,或者 sidx 內容解唔晒(buffer 唔夠大)
// 就回 { ok: false, needMoreBytes: <bool> },俾 caller 決定 404 定係攞多啲再試。
export function parsePlaylistStructure(headBuf) {
  const { ftyp, moov, sidx } = findTopBoxes(headBuf);
  if (!ftyp || ftyp.off !== 0) return { ok: false, needMoreBytes: false, reason: 'no-ftyp-at-0' };
  if (!moov) return { ok: false, needMoreBytes: false, reason: 'no-moov' };
  if (!sidx) {
    // 冇 sidx = 冇 fragmented index(非 fragmented mp4 / webm fallback 之類)——
    // 唯一例外:攞落嚟嗰截 buffer 本身太細,連 moov 之後嗰個 box header 都未
    // 讀到,先當「可能要攞多啲」;如果 buffer 已經明顯大過 moov 好多都仲搵
    // 唔到 sidx,就係真係冇。
    const needMore = headBuf.length < moov.off + moov.size + 8;
    return { ok: false, needMoreBytes: needMore, reason: 'no-sidx' };
  }
  if (sidx.truncated) return { ok: false, needMoreBytes: true, reason: 'sidx-header-truncated' };

  const parsed = parseSidxBox(headBuf, sidx);
  if (!parsed) return { ok: false, needMoreBytes: true, reason: 'sidx-body-truncated' };

  const initSize = moov.off + moov.size; // §1.3-1:只到 moov 尾,唔包 sidx
  let cursor = parsed.sidxEnd + parsed.firstOffset;
  const segments = [];
  for (const ref of parsed.refs) {
    segments.push({
      offset: cursor,
      length: ref.size,
      durationSec: parsed.timescale > 0 ? ref.duration / parsed.timescale : 0,
    });
    cursor += ref.size;
  }

  return {
    ok: true,
    initSize,
    timescale: parsed.timescale,
    referenceCount: parsed.referenceCount,
    segments,
    // 診斷用:全部 segment 加埋嘅 byte 總長(A-b 驗收用嚟同檔案大細對數)
    segmentsByteTotal: segments.reduce((s, seg) => s + seg.length, 0),
    lastSegmentEnd: segments.length ? segments[segments.length - 1].offset + segments[segments.length - 1].length : cursor,
  };
}

// 砌 m3u8 body。streamPath 係 caller 傳入嘅現有 `/api/stream/:id` 絕對路徑
// (呢個檔案唔負責砌 URL,淨係負責攞埋個 path 去砌 playlist 文字)。
export function buildM3U8({ streamPath, initSize, segments }) {
  const targetDuration = Math.max(1, Math.ceil(Math.max(...segments.map((s) => s.durationSec), 0)));
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MAP:URI="${streamPath}",BYTERANGE="${initSize}@0"`,
  ];
  for (const seg of segments) {
    lines.push(`#EXTINF:${seg.durationSec.toFixed(3)},`);
    lines.push(`#EXT-X-BYTERANGE:${seg.length}@${seg.offset}`);
    lines.push(streamPath);
  }
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}
