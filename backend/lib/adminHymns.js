// lib/adminHymns.js — admin 寫入 hymns.db 嘅唯一入口(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.2)
//
// 四條鐵律,同夜晚 grow/curate/deadlink job 平起平坐行同一套 hymnDb.js 協議:
//  1. 永遠唔好將 server 記憶體副本寫落碟——攞鎖之後由碟 openDb() 開一個新鮮
//     副本改完寫,server 開機嗰份已經舊(夜晚 job 之後加咗歌),export 佢
//     等於冚走夜晚新增。
//  2. 鎖內零網絡操作——resolveAudioUrl 呢類慢工序全部要喺 acquireDbLock()
//     之前做完(2026-07-25 fetchLyrics 搶鎖冚寫嗰課嘅變奏:持鎖時間必須係
//     「開檔改嘢寫檔」呢兩三秒)。
//  3. HTTP 唔等 5 分鐘——用 ADMIN_LOCK_WAIT_MS(10s),攞唔到就掟 db_busy
//     俾 route 層回 503。
//  4. 寫完即 reloadDb()(唔使重啟 backend)。
//
// 三個 function 全部回 `{ before, after, hymn }` 俾 route 層寫 audit log。

import { openDb, saveDb, query, acquireDbLock, releaseDbLock, formatDuration } from './hymnDb.js';
import { reloadDb } from './serverDb.js';

const ADMIN_LOCK_WAIT_MS = 10_000;

// PATCH 白名單(§3.4)——喺呢度(唔淨係 route 層)都做多一重防禦:呢個 module
// 用欄位名做動態 SQL(`${key} = ?`),絕對唔可以照單全收 caller 傳落嚟嘅 key。
// org/performer:TAXONOMY-5D-PLAN.md §4.4 —— admin 編輯五維分類嘅團體/歌手。
// kids:TAXONOMY-5D-PLAN.md §8 C2 觀察②——升做顯式 editable 欄位(0/1),UPDATE/
// INSERT 唔准再由 lang==='兒童' 推斷(C4 換血後兒童歌 lang 係真語言)。
export const EDITABLE_FIELDS = ['title', 'display_title', 'artist', 'category', 'lang', 'album', 'title_en', 'org', 'performer', 'kids', 'instrumental'];

function dbBusyError() { const e = new Error('db_busy'); e.code = 'db_busy'; return e; }
function notFoundError() { const e = new Error('not_found'); e.code = 'not_found'; return e; }
function conflictError(msg) { const e = new Error(msg); e.code = 'conflict'; return e; }

async function withLock(fn) {
  const token = await acquireDbLock('admin', ADMIN_LOCK_WAIT_MS);
  if (!token) throw dbBusyError();
  try {
    return await fn();
  } finally {
    releaseDbLock(token);
  }
}

function getOneById(db, id) {
  return query(db, 'SELECT * FROM hymns_all WHERE id = ?', [id])[0] || null;
}

// PATCH /api/admin/hymns/:id
export async function updateHymn(id, fields) {
  return withLock(async () => {
    const db = await openDb();
    const existing = getOneById(db, id);
    if (!existing) throw notFoundError();

    const before = {};
    const after = {};
    const setClauses = [];
    const params = [];
    for (const key of Object.keys(fields)) {
      if (!EDITABLE_FIELDS.includes(key)) continue; // 白名單以外一律唔理(route 層應該已經 400 咗)
      // ALBUM-BACKFILL-ACCEL-PLAN.md Opus 5 驗收 followup(建議④):album
      // 值要 trim——冇 trim 嘅話,admin 想「清空」但唔小心留咗個空白字符,
      // 落到 backfill script 嘅 `row.album && row.album.trim()` guard 會
      // 判斷做「非空」,睇落好似受保護,但顯示層又空白一片,狀態唔一致。
      const value = (key === 'album' && typeof fields[key] === 'string') ? fields[key].trim() : fields[key];
      before[key] = existing[key];
      after[key] = value;
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
    // TAXONOMY-5D-PLAN.md §2.2/§4.4:admin 人手改過 performer 嘅永不被
    // backfillMeta 夜晚 job 重寫,靠 performer_source='manual' 標記。
    if (Object.prototype.hasOwnProperty.call(fields, 'performer')) {
      before.performer_source = existing.performer_source;
      after.performer_source = 'manual';
      setClauses.push('performer_source = ?');
      params.push('manual');
    }
    // ALBUM-BACKFILL-ACCEL-PLAN.md Commit 1:同一道理,admin 人手改過 album
    // 嘅永不被 Phase A/B/C 自動化 backfill 覆寫,靠 album_source='manual' 標記
    // (呢批同 'legacy'——即 migration 一次過 stamp 嗰批舊資料——一齊係
    // album backfill script 嘅「受保護,唔准寫」名單)。
    if (Object.prototype.hasOwnProperty.call(fields, 'album')) {
      before.album_source = existing.album_source;
      after.album_source = 'manual';
      setClauses.push('album_source = ?');
      params.push('manual');
    }
    if (!setClauses.length) throw notFoundError(); // 理論上唔會到呢度,route 層已擋「最少一個欄位」

    params.push(id);
    db.run(`UPDATE hymns_all SET ${setClauses.join(', ')} WHERE id = ?`, params);
    saveDb(db);
    const hymn = getOneById(db, id);
    reloadDb();
    return { before, after, hymn };
  });
}

// POST /api/admin/hymns/:id/delist
//
// ⚠️ 2026-07-31 Opus 5 驗收清場時揪出:淨係 `curated=0` 唔夠——growLibrary.js
// `usablePool()`(curate mode 嘅候選池)一直將 `curated=0` 冧曬做「未上架
// backlog 候選」,冇任何「內容已判死刑」嘅終態,隔晚就會逐首 re-verify 翻生
// 返(2026-07-27 22:30 已經記錄過同一單事故:Kids on the Move/Redsea Music/
// SingforGod 薪火敬拜全部俾翻生返,見 growLibrary.js:217 附近註解)。
// `status='rejected'` 先係真.終態,`usablePool()` 已經識剔走(同 `status=
// 'dead'` 分開——嗰個係 deadlink checker 專用嘅「條鏈死咗」語義,呢度千其
// 唔可以撈亂,一定要用 'rejected' 唔係 'dead')。
export async function delistHymn(id) {
  return withLock(async () => {
    const db = await openDb();
    const existing = getOneById(db, id);
    if (!existing) throw notFoundError();

    // 冪等要驗埋 status——淨驗 curated=0 唔夠,舊資料可能 curated=0 但 status
    // 仲係 'ok'(呢個 fix 之前落嘅架、或者本身未 curate 過嘅 backlog 候選),
    // 呢種情況要照跑落去補返 status='rejected',唔可以當已經落咗架咁跳過。
    if (Number(existing.curated) === 0 && existing.status === 'rejected') {
      return { before: { curated: 0, status: 'rejected' }, after: { curated: 0, status: 'rejected' }, hymn: existing, idempotent: true };
    }

    const before = { curated: existing.curated, status: existing.status };
    db.run("UPDATE hymns_all SET curated = 0, status = 'rejected' WHERE id = ?", [id]);
    saveDb(db);
    const hymn = getOneById(db, id);
    reloadDb();
    return { before, after: { curated: 0, status: 'rejected' }, hymn };
  });
}

// POST /api/admin/hymns —— 加歌流程下半場(preview 之後確認入庫),鎖內重覆
// check youtube_id(preview→confirm 之間夜晚 job 可能啱啱收咗佢):
//   · 唔存在 → INSERT,欄位形狀照抄 backfillCore.js
//   · 存在但 curated=0 → re-list(UPDATE,唔准 INSERT 第二行,youtube_id 唔可以孖生)
//   · 存在且 curated=1 → conflict
export async function insertHymn(fields) {
  return withLock(async () => {
    const db = await openDb();
    const existing = query(db, 'SELECT * FROM hymns_all WHERE youtube_id = ?', [fields.youtube_id])[0] || null;

    if (existing && Number(existing.curated) === 1) throw conflictError('already_curated');

    const today = new Date().toISOString().slice(0, 10);
    const durationFormatted = Number.isFinite(fields.duration) ? formatDuration(fields.duration) : null;
    // TAXONOMY-5D-PLAN.md §8 C2 觀察②:kids 唔再由 lang==='兒童' 推斷(C4 換血
    // 後兒童歌 lang 係真語言,靠推會將 kids 打返 0)。冇明確傳就唔郁呢個欄。
    const kidsProvided = Object.prototype.hasOwnProperty.call(fields, 'kids');

    if (existing) {
      // 觀察①:relist 冇明確填 org 就保留 row 現有 org,唔准 fallback artist
      // 冚走合併結果(例:relist 一首 artist='盛曉玫' 嘅歌,org 要維持
      // 「泥土音樂」,唔可以俾冚返做「盛曉玫」)。
      const orgVal = (fields.org && fields.org.trim()) || existing.org || fields.artist;
      // 觀察②:relist 冇明確傳 kids 就保留 row 現有 kids(唔再靠 lang 推)。
      const kidsVal = kidsProvided ? fields.kids : (Number(existing.kids) || 0);
      const before = { curated: existing.curated, status: existing.status };
      db.run(
        `UPDATE hymns_all SET title = ?, display_title = ?, artist = ?, category = ?, lang = ?,
         album = ?, title_en = ?, curated = 1, status = 'ok', last_checked = ?, fail_streak = 0,
         duration = COALESCE(?, duration), org = ?, kids = ?
         WHERE id = ?`,
        [fields.title, fields.display_title, fields.artist, fields.category, fields.lang,
          fields.album || '', fields.title_en || '', today, durationFormatted, orgVal, kidsVal, existing.id]
      );
      saveDb(db);
      const hymn = getOneById(db, existing.id);
      reloadDb();
      return { before, after: { curated: 1, status: 'ok' }, hymn, relisted: true };
    }

    // 全新 INSERT:冇 existing row 可以保留,org fallback artist 一如以往;
    // kids 冇 worshipGroups priority 概念,admin 冇明確傳就預設 0(唔再推
    // lang——admin add 表單嘅語言 chips 有「兒童」選項純係語言值,唔代表 kids)。
    const orgVal = (fields.org && fields.org.trim()) || fields.artist;
    const kidsVal = kidsProvided ? fields.kids : 0;

    db.run(
      `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, album, title_en, curated, status, last_checked, fail_streak, duration, org, kids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, ?)`,
      [fields.title, fields.display_title, fields.artist, fields.category, fields.youtube_id, fields.lang,
        fields.album || '', fields.title_en || '', today, durationFormatted, orgVal, kidsVal]
    );
    // ⚠️ last_insert_rowid() 一定要喺 saveDb() 之前攞——saveDb() 入面嘅
    // db.export() 會 close+reopen sql.js 個 connection,令 last_insert_rowid()
    // 歸零(Opus 5 驗收揪出:貼全新未入庫嘅歌 500,relist 舊歌測唔到,因為
    // 嗰條分支冇用呢個 function)。
    const insertedId = query(db, 'SELECT last_insert_rowid() as id')[0].id;
    saveDb(db);
    const hymn = getOneById(db, insertedId);
    reloadDb();
    return { before: null, after: { id: insertedId, youtube_id: fields.youtube_id }, hymn, relisted: false };
  });
}
