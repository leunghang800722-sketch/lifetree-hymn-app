// 2026-08-16 Eric 指示:「純音樂無人唱歌既先唔好理住」—— 演奏版/鋼琴系列擱置,
// 唔delist、唔判unusable、亦唔好俾重做隊re-OCR佢哋(re-OCR會自動改status,
// 都算「處理咗」)。呢七首係oneoff-requeueCjkRedo嗰陣按亂碼指標撈埋入隊嘅,
// 呢度還原返佢哋重做前嘅狀態(draft/ocr,垃圾draft照留)+由priority名單剔走,
// 等Eric遲啲先決定點處置。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIORITY_PATH = path.join(__dirname, '..', 'data', 'lyrics-requeue-priority.json');

const PARK_IDS = [5699, 5700, 5794, 5795, 5799, 5801, 6734];

(async () => {
  const token = await acquireDbLock('oneoff-parkInstrumentals');
  if (!token) { console.error('攞唔到 DB 鎖,收工(遲啲再行)'); process.exit(1); }
  try {
    const db = await openDb();
    for (const id of PARK_IDS) {
      const r = query(db, 'SELECT id, title, lyrics_status, lyrics_source FROM hymns_all WHERE id=?', [id])[0];
      if (!r) { console.log(`id ${id} 搵唔到,跳過`); continue; }
      if (r.lyrics_status === 'none' && r.lyrics_source === 'cc:miss') {
        db.run(`UPDATE hymns_all SET lyrics_status='draft', lyrics_source='ocr' WHERE id=?`, [id]);
        console.log(`id ${id} 還原 draft/ocr(${r.title.slice(0, 44)})`);
      } else {
        console.log(`id ${id} 而家係 ${r.lyrics_status}/${r.lyrics_source},唔郁(${r.title.slice(0, 44)})`);
      }
    }
    saveDb(db);
  } finally {
    releaseDbLock(token);
  }
  const pri = JSON.parse(fs.readFileSync(PRIORITY_PATH, 'utf8'));
  const before = pri.ids.length;
  pri.ids = pri.ids.filter((id) => !PARK_IDS.includes(id));
  pri.parkedInstrumentals = { note: 'Eric 2026-08-16:純音樂擱置唔好理,佢遲啲先話', ids: PARK_IDS };
  fs.writeFileSync(PRIORITY_PATH, JSON.stringify(pri, null, 1));
  console.log(`priority 名單 ${before} → ${pri.ids.length}(剔走 ${before - pri.ids.length} 首純音樂)`);
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
