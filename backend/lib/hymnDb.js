// lib/hymnDb.js — shared helpers for the offline maintenance scripts
// (dead-link checker + curation). These scripts own hymns.db on disk; the
// running server only ever reads it into memory at boot, so scripts must
// export()+write themselves and the server needs a restart to see changes.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, '..', 'hymns.db');

export async function openDb() {
  const SQL = await initSqlJs();
  return new SQL.Database(fs.readFileSync(DB_PATH));
}

export function saveDb(db) {
  // Write atomically-ish: temp file then rename, so a crash mid-write can't
  // leave a truncated hymns.db (which would take the whole app down).
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, DB_PATH);
}

export function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Titles that are compilations / full albums rather than a single song.
// These are real entries in the DB (e.g. "THE WAY (全碟)", and id 800
// "Sunset Listen Through - Hymn Of Heaven" is a 54MB ~1.5h file). They stream
// badly (googlevideo throttles very long files toward playback rate) and they
// aren't what someone means by "a hymn", so they're excluded from the library.
export const COMPILATION_PATTERNS = [
  '%全碟%', '%全專輯%', '%專輯%', '%合輯%', '%詩歌集%',
  '%Top 100%', '%Top100%', '%Best of%', '%Best Of%', '%Ultimate%',
  '%Playlist%', '%playlist%', '%Album%', '%Listen Through%',
  '%Non Stop%', '%Nonstop%', '%Medley%', '%Compilation%',
  '%小時%', '%Hours%', '%hour %',
];

export function isCompilation(title = '') {
  const t = title.toLowerCase();
  const hit = [
    '全碟', '全專輯', '專輯', '合輯', '合集', '詩歌集',
    // Found in the first curation pass: 11 of 143 curated songs were actually
    // multi-song compilations titled like "精选【天韵合唱团】...赞美诗歌15首（二）"
    // or "小羊诗歌 精选20首". They play, so acceptance wouldn't catch them — but
    // one "song" being 15 songs is not a hymn library.
    '精选', '精選', '热门', '熱門', '串烧', '串燒',
    'top 100', 'top100', 'best of', 'ultimate', 'playlist', 'album',
    'listen through', 'non stop', 'nonstop', 'medley', 'compilation',
    '小時', 'hours', 'greatest hits',
  ].some((p) => t.includes(p));
  // "…15首" / "…精选20首" — N songs in one video.
  const nSongs = /\d+\s*首/.test(title);
  return hit || nSongs;
}

// Not worship music at all. The scrape pulled in whole channels that merely
// LOOK devotional by name — e.g. artist "Grace Wu詩歌" is really a K-pop/pop
// dance-choreography channel (22 of its 23 entries are Aespa / Doja Cat /
// Bruno Mars / BTS dance tutorials). These pass every playability check, so
// only a content rule keeps them out of a hymn library.
const SECULAR_ARTISTS = ['grace wu詩歌', 'grace wu诗歌'];
export function isNonWorship(title = '', artist = '') {
  if (SECULAR_ARTISTS.includes((artist || '').toLowerCase().trim())) return true;
  return /(dance tutorial|dance choreograph|choreography|relay dance|dance cover)/i.test(title);
}

// The DB has 208 groups of duplicate youtube_ids (same video under different
// ids). Keep the lowest id of each group as canonical.
export function dedupeByYoutubeId(rows) {
  const seen = new Set();
  const out = [];
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    if (!r.youtube_id || seen.has(r.youtube_id)) continue;
    seen.add(r.youtube_id);
    out.push(r);
  }
  return out;
}

// Deliberately slow. The Mac's residential IP is the ONLY IP that still works
// for YouTube (Zeabur's is banned, verified 8/8 player_clients). Burning it
// with burst traffic would take the entire app down with no fallback, so every
// batch job here crawls on purpose.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
