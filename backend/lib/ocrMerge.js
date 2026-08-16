// OCR frame 文字合併 —— 由 fetchLyrics.js 抽出嚟做獨立 lib(2026-08-16,
// LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P2/P3),等測試 harness 可以離線餵返真實 frame
// OCR 結果做回歸,唔使掛住 yt-dlp / DB。
//
// 兩項演算法改動(對比舊版 fetchLyrics.js 內置版):
//
// §P2 watermark 由「逐字完全相同」改做 fuzzy 聚類 ——
//   實錄 id 241(約書亞官方歌詞MV):左下角草書 watermark "Touching Heaven on
//   Bended Knees" 每張 frame 俾 OCR 讀錯嘅樣都唔同("leuching Hecwenen Kened
//   hnees"、"Teuching Heeen en Renced Jnees"…),舊版靠 exact string 計頻率,
//   冇一個變體過到 60% 門檻 → 幾十個變體全部漏入 draft,verified 前嘅拉丁
//   垃圾就係咁嚟。新版將行 normalize 後用 bigram Dice 聚類(代表 = 最常見
//   變體),成個 cluster 出現喺 >55% 有字 frame 就整個 cluster 剔走。
//
// §P3 block 代表由「揀長嗰份」改做行級多數投票 ——
//   實錄 id 4228(讚美之泉兒童舞蹈版,藝術字):同一版字幕影 2-5 張 frame,
//   亂碼變體(「潣們在其印要酄氢枳藥」)通常仲長過乾淨讀數(「我們在其中要
//   歡喜快樂」),舊版揀長=系統性揀亂碼。新版喺 block 入面逐行聚類,每行揀
//   **出現次數最多**嘅變體(亂碼隨機唔重複、正確讀數會重複出現,投票天然
//   汰弱),打和先至揀長。
//
// mergeOcrLines() 介面/回傳 shape 不變:{ blocks: [{t,text}], text, watermarkCount },
// blocks 照舊寫入 lyrics_timeline.ocr。

import { normCompare, bigramDice } from './textSimilarity.js';

// 段落級(block)相似度門檻 —— 相鄰 frame 嘅文字 normalize 後 bigram Dice ≥ 呢個數,
// 當係同一版字幕(OCR 抽 frame 密過畫面轉字幕,同一句歌詞正常會影中 2-5 張 frame)。
export const BLOCK_SIM_THRESHOLD = 0.7;
// fuzzy watermark:行同 cluster 代表相似 ≥ WM_SIM 就入伙;cluster 覆蓋 >WM_FREQ
// 比例嘅有字 frame → 判 watermark。WM_FREQ 企喺 0.55(舊 exact 版係 0.6):真歌詞
// 副歌就算唱 4-5 次,每次影 3-5 張 frame,喺正常 100+ 張有字 frame 入面都係
// 15-25%,離門檻好遠;watermark 就接近 100%。
const WM_SIM = 0.55;
const WM_FREQ = 0.55;
// block 內行級投票嘅聚類門檻(同一句嘅亂碼變體 vs 乾淨讀數,Dice 通常 0.6-0.9)。
const VOTE_SIM = 0.6;

const charCount = (s) => (s || '').replace(/\s/g, '').length;

// 清一行 OCR 文字:實測撞過卡拉OK填色特效令 Vision 將同一句讀成「AA」兩份黏埋
// 一齊(例:「找到我找到我」),得返偶數長度先可能係呢種情況,一半一半比較,
// 啱就摺埋得返一份。
export function cleanOcrLine(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  if (s.length % 2 === 0) {
    const half = s.length / 2;
    if (s.slice(0, half) === s.slice(half)) s = s.slice(0, half);
  }
  return s;
}

// ── fuzzy watermark 偵測(§P2)────────────────────────────────────────
// 逐行(每 frame 內去重)餵入聚類:同「cluster 最常見變體」嘅 normalize Dice
// ≥ WM_SIM 就當同一個 cluster。回傳一個 Set,入面係全部判定 watermark 嘅
// **原文行**(調用方直接 set.has(line) 過濾)。
// 2026-08-16 補強:單靠 Dice 一層聚類實測唔掂 —— 草書/藝術字 watermark 俾 OCR
// 讀出嚟係一團碎片雲(實錄 id 241:"Touching Heaven on Bended Knees" 有 124 個
// 唯一變體,連 "Jnees"、"Teuching" 呢啲斷片,對正確版 Dice 低到 0.19),冇一個
// cluster 儲夠 frame 覆蓋率。所以加第二層:**純拉丁** cluster 之間用 bigram
// containment(重疊係數:交集 ÷ 細嗰邊,斷片對全句係高分)≥ WM_CONTAIN 做
// single-linkage 合併。**唔准**對有 CJK 嘅 cluster 咁做 —— 中文副歌短行
// (「耶穌耶穌」)contain 入長句(「耶穌耶穌世界的光」),chain 埋會誤殺真歌詞。
const bigramSet = (s) => {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
};
const containment = (a, b) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return 0;
  let hit = 0;
  for (const g of small) if (big.has(g)) hit++;
  return hit / small.size;
};
const WM_CONTAIN = 0.5;
const HAS_CJK_RE = /[一-鿿㐀-䶿]/;

// 時間分佈 guard(2026-08-16 實測加):淨係「覆蓋率高」唔夠安全 —— 重複度高嘅
// 兒歌(id 4228 成首歌得兩三句)副歌 cluster 都可以覆蓋好多 frame。分辨位:
// watermark 係**連續一大段**(成條片得 1-2 個 episode),副歌係**分開幾波**
// (verse/chorus 交替,episode ≥3)。gap 容忍 3 張 frame(6 秒,OCR 閃失唔算斷)。
export function countEpisodes(frameIndexSet, gapTol = 3) {
  const idx = [...frameIndexSet].sort((a, b) => a - b);
  if (!idx.length) return 0;
  let episodes = 1;
  for (let i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] > gapTol + 1) episodes++;
  return episodes;
}
const WM_MAX_EPISODES = 2;

// 最長連續 run(gap 容忍同上)。第二條 watermark 規則用:片中段先出現嘅 watermark
// (實錄 id 241「雙膝跪下✝觸摸天堂」由 53 帧起先有,覆蓋率得 ~36% 唔過 WM_FREQ)
// 特徵係**連續長駐** —— 實測佢 maxRun=44 帧(88 秒),而字幕句 maxRun 最盡 8 帧
// (16 秒,兒歌副歌背靠背都係咁上下)。門檻 15 帧(30 秒)兩邊都有近倍 margin:
// 冇字幕句會 30 秒唔轉,watermark 一現身就長過呢個數。
export function maxRun(frameIndexSet, gapTol = 3) {
  const idx = [...frameIndexSet].sort((a, b) => a - b);
  if (!idx.length) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] - idx[i - 1] <= gapTol + 1) { run++; if (run > best) best = run; }
    else run = 1;
  }
  return best;
}
const WM_RUN_MIN = 15;

function detectWatermarks(cleanedFrames) {
  const framesWithText = cleanedFrames.filter((f) => f.length > 0).length;
  if (!framesWithText) return new Set();

  // cluster: { repNorm, repCount, frameSet, variants: Map<原文行, 次數>, hasCjk }
  const clusters = [];
  cleanedFrames.forEach((frame, fi) => {
    for (const line of new Set(frame)) {
      const n = normCompare(line);
      if (!n) continue;
      let best = null, bestSim = 0;
      for (const cl of clusters) {
        const sim = cl.variants.has(line) ? 1 : bigramDice(cl.repNorm, n);
        if (sim > bestSim) { bestSim = sim; best = cl; }
      }
      if (best && bestSim >= WM_SIM) {
        const c = (best.variants.get(line) || 0) + 1;
        best.variants.set(line, c);
        best.frameSet.add(fi);
        if (HAS_CJK_RE.test(line)) best.hasCjk = true;
        if (c > best.repCount) { best.repCount = c; best.repNorm = n; }
      } else {
        clusters.push({
          repNorm: n, repCount: 1, frameSet: new Set([fi]),
          variants: new Map([[line, 1]]), hasCjk: HAS_CJK_RE.test(line),
        });
      }
    }
  });

  // 第二層:純拉丁 cluster 之間 containment 合併(合到冇得再合為止)。
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    outer:
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].hasCjk) continue;
      const gi = bigramSet(clusters[i].repNorm);
      for (let j = i + 1; j < clusters.length; j++) {
        if (clusters[j].hasCjk) continue;
        if (containment(gi, bigramSet(clusters[j].repNorm)) >= WM_CONTAIN) {
          const [keep, gone] = clusters[i].repCount >= clusters[j].repCount
            ? [clusters[i], clusters[j]] : [clusters[j], clusters[i]];
          for (const [l, c] of gone.variants) keep.variants.set(l, (keep.variants.get(l) || 0) + c);
          for (const f of gone.frameSet) keep.frameSet.add(f);
          clusters.splice(clusters.indexOf(gone), 1);
          mergedAny = true;
          break outer;
        }
      }
    }
  }

  const wm = new Set();
  let wmClusters = 0;
  const wmReps = [];
  for (const cl of clusters) {
    const byCoverage = cl.frameSet.size / framesWithText > WM_FREQ
      && countEpisodes(cl.frameSet) <= WM_MAX_EPISODES;
    const byLongRun = maxRun(cl.frameSet) >= WM_RUN_MIN;
    if (byCoverage || byLongRun) {
      wmClusters++;
      wmReps.push(cl.repNorm);
      for (const l of cl.variants.keys()) wm.add(l);
    }
  }
  // 掃尾:cluster 碎片化會令一部分 watermark 變體自立門戶(frame 唔夠多、run 唔夠
  // 長,兩條主規則都捉唔到)。同已確認 watermark 代表 Dice ≥0.7 嘅 cluster 一律
  // 陪葬 —— 高相似 = 同一個 watermark 嘅另一批讀法,唔會係歌詞。
  if (wmReps.length) {
    for (const cl of clusters) {
      if (wm.has(cl.variants.keys().next().value)) continue;
      if (wmReps.some((rep) => bigramDice(rep, cl.repNorm) >= 0.7)) {
        for (const l of cl.variants.keys()) wm.add(l);
      }
    }
  }
  wm._clusterCount = wmClusters; // 俾 log 用(舊版 watermarkCount 係「幾多種水印行」)
  return wm;
}

// ── block 內行級多數投票(§P3)───────────────────────────────────────
// blockFrames: [{ t, lines: string[] }]。回傳呢個 block 嘅代表文字。
function voteBlockText(blockFrames) {
  if (blockFrames.length === 1) return blockFrames[0].lines.join('\n');

  // cluster: { repNorm, repCount, variants: Map<原文行,次數>, sumIdx, n }
  const clusters = [];
  for (const f of blockFrames) {
    f.lines.forEach((line, idx) => {
      const norm = normCompare(line);
      let best = null, bestSim = 0;
      for (const cl of clusters) {
        const sim = cl.variants.has(line) ? 1 : bigramDice(cl.repNorm, norm);
        if (sim > bestSim) { bestSim = sim; best = cl; }
      }
      if (best && bestSim >= VOTE_SIM) {
        const c = (best.variants.get(line) || 0) + 1;
        best.variants.set(line, c);
        best.sumIdx += idx; best.n++;
        if (c > best.repCount) { best.repCount = c; best.repNorm = norm; }
      } else {
        clusters.push({ repNorm: norm, repCount: 1, variants: new Map([[line, 1]]), sumIdx: idx, n: 1 });
      }
    });
  }

  // 每個 cluster 揀最高票變體(打和 → 揀長,呢個先至係「逐字浮現揀最齊」嘅
  // 正確用法);cluster 之間按「喺畫面由上到下嘅平均位置」排返次序。
  const picked = clusters.map((cl) => {
    let bestLine = null, bestCount = -1;
    for (const [line, count] of cl.variants) {
      if (count > bestCount || (count === bestCount && charCount(line) > charCount(bestLine))) {
        bestLine = line; bestCount = count;
      }
    }
    return { line: bestLine, order: cl.sumIdx / cl.n };
  });
  picked.sort((a, b) => a.order - b.order);
  return picked.map((p) => p.line).join('\n');
}

// ── 主合併(介面同舊版 fetchLyrics.js 內置 mergeOcrLines 一樣)──────────
// frameLineLists: string[][],每個元素係一張 frame(跟返 frame 上到下次序)嘅文字行。
// frameIntervalSec:抽 frame 間隔(秒),計 block 時間點用。
export function mergeOcrLines(frameLineLists, frameIntervalSec = 2) {
  const cleaned = frameLineLists.map((lines) => lines.map(cleanOcrLine).filter(Boolean));

  // §P2:fuzzy watermark(舊版 exact-match 係 fuzzy 嘅特例,sim=1,一併涵蓋)。
  const watermark = detectWatermarks(cleaned);

  // 逐張 frame 剔水印,計時間點(第 N 張 frame ≈ N × frameIntervalSec 秒,N 由 1 起)。
  const frames = [];
  cleaned.forEach((rawFrame, idx) => {
    const lines = rawFrame.filter((l) => !watermark.has(l));
    if (!lines.length) return;
    frames.push({ t: (idx + 1) * frameIntervalSec, lines, text: lines.join('\n') });
  });

  // Step 1:段落分組 —— 相鄰 frame 相似度夠高就合做同一個 block。
  const rawBlocks = [];
  for (const f of frames) {
    const cur = rawBlocks[rawBlocks.length - 1];
    const lastFrameInBlock = cur ? cur.frames[cur.frames.length - 1] : null;
    if (lastFrameInBlock && bigramDice(normCompare(lastFrameInBlock.text), normCompare(f.text)) >= BLOCK_SIM_THRESHOLD) {
      cur.frames.push(f);
    } else {
      rawBlocks.push({ frames: [f] });
    }
  }
  // §P3:block 代表 = 行級多數投票(唔再「揀長」——亂碼+垃圾行通常仲長過乾淨讀數)。
  let blocks = rawBlocks.map((b) => ({
    t: b.frames[0].t,
    text: voteBlockText(b.frames),
    support: b.frames.length,
  }));

  // Step 2:相鄰 block 之間再合一次(修雜訊令假重複斷鏈嘅情況)。合併嗰陣揀
  // support(幾多張 frame 撐)多嗰邊嘅文字,打和先揀長 —— 同 §P3 一致,唔好
  // 俾單張衰 frame 嘅長亂碼贏。
  let merged = true;
  while (merged) {
    merged = false;
    const next = [];
    for (const b of blocks) {
      const prev = next[next.length - 1];
      if (prev && bigramDice(normCompare(prev.text), normCompare(b.text)) >= BLOCK_SIM_THRESHOLD) {
        const takeB = b.support > prev.support
          || (b.support === prev.support && charCount(b.text) > charCount(prev.text));
        if (takeB) prev.text = b.text;
        prev.support += b.support;
        merged = true; // t 保留 prev 嗰個(較早)
      } else {
        next.push({ ...b });
      }
    }
    blocks = next;
  }

  return {
    blocks: blocks.map(({ t, text }) => ({ t, text })),
    text: blocks.map((b) => b.text).join('\n\n').trim(),
    watermarkCount: watermark._clusterCount || 0,
  };
}
