// 2026-08-16 Eric 拍板(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P4):中文歌詞重做隊列。
//
// 三個 batch(優先次序如此,priority 名單照呢個次序寫):
//   A. live 遺害:verified 但歌詞零中文/爛(行級 verdict != pass)嘅中文歌 ——
//      歷史流程產物(見 plan §根因E),條片其實有中英字幕,重 OCR 救得返。
//      **唔郁 lyrics/唔落架**(Eric:重做期間照住先,救返後經 review apply 自動更新)。
//   B. 凍結 draft:行級分類判「english-only/messy」嘅爛 draft(bi-freeze 名單)。
//   C. 亂碼 draft:CJK 行「近似變體比率」≥ 0.5(藝術字/卡拉OK填色 OCR 崩嘅特徵,
//      實測 id 4228 呢類 = 0.88,KALA 版全部高分)。
//   另:16 首「lang 標中文但其實係英文歌」(11 KEC + 5 約書亞英文單曲)只改
//   lang='英文',歌詞係啱嘅,唔重做。5142/5143(英文兒歌,lang=兒童)唔郁,
//   等 Eric 定奪 lang 體系點擺。
//
// 重做機制:reset lyrics_status='none' + lyrics_source='cc:miss' → producer keeper
// 嘅 OCR 隊自然食(fetchLyrics prioritizeByRequeue 會將 priority 名單排隊頭)。
// lyrics(live 歌詞)同 lyrics_draft(舊 draft)都唔剷 —— 前者照出街,後者等
// 新 OCR 覆寫。
//
// 用 hymnDb 鎖(即攞即放)。重跑安全:已 reset 嘅歌 source 已係 cc:miss,唔會重複。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { CJK_LANGS, classifyLangMix } from '../lib/lyricsLangCheck.js';
import { normCompare, bigramDice } from '../lib/textSimilarity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIORITY_PATH = path.join(__dirname, '..', 'data', 'lyrics-requeue-priority.json');
const FROZEN_PATH = path.join(__dirname, '..', 'data', 'lyrics-bi-frozen.json');
const DRY = process.argv.includes('--dry');

const LANG_FIX_EN = [2418, 2470, 2490, 2512, 2514, 2530, 2532, 2548, 2550, 2560, 2580, 6596, 6608, 6609, 6660, 6665];
const KIDS_SKIP = [5142, 5143];

const hasCjk = (s) => /[一-鿿]/.test(s || '');

function variantRatio(draft) {
  const lines = [...new Set(draft.split('\n').map((l) => l.trim())
    .filter((l) => l.length >= 4 && ((l.match(/[一-鿿]/g) || []).length > (l.match(/[A-Za-z]/g) || []).length)))];
  if (lines.length < 6) return 0;
  const norms = lines.map(normCompare);
  let variant = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      if (i === j) continue;
      const d = bigramDice(norms[i], norms[j]);
      if (d >= 0.5 && d < 0.95) { variant++; break; }
    }
  }
  return variant / lines.length;
}

(async () => {
  const token = DRY ? 'dry' : await acquireDbLock('oneoff-requeueCjkRedo');
  if (!token) { console.error('攞唔到 DB 鎖,收工(遲啲再行)'); process.exit(1); }
  try {
    const db = await openDb();

    // Batch A:live 遺害
    const verified = query(db, `SELECT id, title, lang, lyrics FROM hymns_all
      WHERE curated=1 AND status!='dead' AND lyrics_status='verified'
        AND lang IN ('國語','粵語','兒童') AND lyrics IS NOT NULL AND lyrics != ''`);
    const liveRedo = verified.filter((r) => {
      if (LANG_FIX_EN.includes(r.id) || KIDS_SKIP.includes(r.id)) return false;
      const v = classifyLangMix(r.lyrics).verdict;
      if (v === 'pass' || v === 'empty') return false;
      // 零中文歌詞而標題都冇中文 → 多數係英文歌標錯 lang,唔好重做住(重做出英文
      // draft 又會俾擋板 hold,浪費 quota)——呢批留低喺 log 俾人手覆核 lang。
      if (!hasCjk(r.lyrics) && !hasCjk(r.title)) return false;
      return true;
    }).map((r) => r.id);

    // Batch B:凍結 draft
    let frozen = [];
    try { frozen = JSON.parse(fs.readFileSync(FROZEN_PATH, 'utf8')).ids || []; } catch (_) {}

    // Batch C:亂碼 draft(變體比率 ≥ 0.5)
    const drafts = query(db, `SELECT id, lang, lyrics_draft FROM hymns_all
      WHERE curated=1 AND status!='dead' AND lyrics_status='draft'
        AND lang IN ('國語','粵語','兒童') AND lyrics_draft IS NOT NULL`);
    const garbled = drafts
      .filter((r) => !frozen.includes(r.id) && variantRatio(r.lyrics_draft) >= 0.5)
      .map((r) => r.id);

    const ordered = [...new Set([...liveRedo, ...frozen, ...garbled])];
    console.log(`live 遺害 ${liveRedo.length} 首 + 凍結 draft ${frozen.length} 首 + 亂碼 draft ${garbled.length} 首 = 共 ${ordered.length} 首重做`);

    // lang 修正 16 首
    for (const id of LANG_FIX_EN) {
      const r = query(db, 'SELECT id, lang, title FROM hymns_all WHERE id=?', [id])[0];
      if (!r) continue;
      if (!DRY) db.run(`UPDATE hymns_all SET lang='英文' WHERE id=?`, [id]);
      console.log(`lang fix id ${id}: '${r.lang}' → '英文'(${r.title.slice(0, 44)})`);
    }

    // 重做 reset
    if (!DRY) {
      for (const id of ordered) {
        db.run(`UPDATE hymns_all SET lyrics_status='none', lyrics_source='cc:miss' WHERE id=?`, [id]);
      }
      saveDb(db);
      fs.writeFileSync(PRIORITY_PATH, JSON.stringify({
        note: 'LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P4 重做隊(Eric 2026-08-16 拍板)。次序:live 遺害 → 凍結 draft → 亂碼 draft。fetchLyrics prioritizeByRequeue 讀呢度。做完一首會自然離隊(source 變 ocr),名單唔使清。',
        generatedAt: new Date().toISOString(),
        counts: { live: liveRedo.length, frozen: frozen.length, garbled: garbled.length },
        ids: ordered,
      }, null, 1));
      console.log(`已 reset ${ordered.length} 首做 status='none' source='cc:miss',priority 名單 → ${PRIORITY_PATH}`);
    } else {
      console.log('(--dry,冇寫嘢)');
    }
    console.log('DONE');
  } finally {
    if (!DRY) releaseDbLock(token);
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
