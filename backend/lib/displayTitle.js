// lib/displayTitle.js — cleans raw YouTube titles into a short "display
// title" for UI use (home cards, library rows, player). Never touches the
// original `title` column — search/dedup/DB matching all keep using that.
//
// Design constraint (verified by scripts/regenerateDisplayTitles.js against
// all 1900+ rows in hymns_all): this function only ever DELETES characters
// from the input, never invents new ones. That's what makes it safe to run
// unattended across the whole library — the worst case is "didn't shorten
// this one" (falls back to the original title untouched), never "shows the
// wrong song name".

const DECORATIVE_PHRASES = [
  '官方歌詞版mv', '官方歌詞mv', '官方版mv', '官方授权版', '官方授權版', '官方mv',
  '官方授权', '官方授權', '現場敬拜mv', '现场敬拜mv', '動態歌詞', '动态歌词',
  '中英字幕', '字幕版mv', '字幕版',
  'official music video', 'official lyrics mv', 'official lyric video',
  'official mv', 'official video', 'official audio',
  'lyric video', 'lyrics video', 'live worship mv', 'cantonese version',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-first everywhere below: a specific compound phrase (e.g. "兒童事工")
// must match whole before a shorter word it contains (e.g. "事工") gets a
// chance to chop it up and strand a fragment like "兒童" behind.
const DECORATIVE_PHRASES_SORTED = [...DECORATIVE_PHRASES].sort((a, b) => b.length - a.length);

function stripDecorative(s) {
  let out = s;
  for (const phrase of DECORATIVE_PHRASES_SORTED) {
    const re = new RegExp(escapeRegex(phrase), 'ig');
    out = out.replace(re, ' ');
  }
  // A phrase strip can leave a bracket pair wrapping nothing (e.g. "【中英字幕】"
  // → "【 】"); collapse those rather than shipping an empty bracket.
  out = out
    .replace(/【\s*】/g, ' ')
    .replace(/「\s*」/g, ' ')
    .replace(/『\s*』/g, ' ')
    .replace(/（\s*）/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ');
  return out;
}

function normalizeForCompare(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[【】\[\]()（）「」『』"'.,，、。！？!?\-–—_/⧸|｜│:：~～*·•✝️🔥🙌🎶🪨#＃]+/g, '')
    .replace(/\s+/g, '')
    .trim();
}

const GROUP_SUFFIXES = [
  '詩歌', '合唱團', '敬拜讚美', '敬拜隊', '敬拜團', '樂團', '音樂事工',
  '音樂世界', '靈糧堂', '事工', '音樂', 'worship', 'music', 'band', 'choir', 'kids',
];

function coreArtist(a) {
  let s = normalizeForCompare(a);
  for (const suf of GROUP_SUFFIXES) {
    const n = normalizeForCompare(suf);
    if (n && s.endsWith(n) && s.length > n.length) s = s.slice(0, -n.length);
  }
  return s;
}

// Generic group/ministry-type labels (not tied to any one artist string) that
// can show up as leftover noise next to a bracket-wrapped title — e.g.
// "HKACM 兒童事工 Official Music Video" after the artist "ACM" is stripped
// still has "兒童事工" sitting there. Only used to decide whether an outside
// fragment is decorative — never applied to the actual output text, since a
// real (often short) CJK song title must never be mistaken for one of these.
const GENERIC_LABEL_WORDS = [
  ...GROUP_SUFFIXES,
  '兒童事工', '兒童詩歌', '敬拜讚美會', '敬拜讚美', '兒童敬拜',
];

const GENERIC_LABEL_WORDS_SORTED = [...GENERIC_LABEL_WORDS].sort((a, b) => b.length - a.length);

function stripGenericLabels(s) {
  let out = s;
  for (const w of GENERIC_LABEL_WORDS_SORTED) {
    const re = new RegExp(escapeRegex(w), 'ig');
    out = out.replace(re, ' ');
  }
  return out;
}

function removeArtistSubstring(title, artist) {
  if (!artist) return title;
  let out = title;
  const candidates = [artist.trim(), coreArtist(artist)].filter((s) => s && s.length >= 2);
  for (const cand of candidates) {
    // Escape + allow optional internal spaces to be flexible about spacing drift.
    // A trailing \d* (no whitespace before it) also eats a glued episode/album
    // number like "團契遊樂園3" — but NOT "ACM 2012" (space before the digits
    // means it's a separate token, e.g. a year, and stays untouched).
    const pattern = escapeRegex(cand).replace(/\\ /g, '\\s*');
    const re = new RegExp(`${pattern}\\d*`, 'ig');
    out = out.replace(re, ' ');
  }
  return out;
}

// A fragment counts as "decorative" (safe to drop) only if, once we strip the
// artist name, known MV/video-format phrases, and generic ministry labels,
// NOTHING meaningful is left — empty, a bare track number like "(23)", or a
// short non-CJK leftover (a channel handle, e.g. "KUA MUSIC", "HK"). Any
// remaining CJK text — even a short 2-3 char run — is treated as a real
// (possibly short) song title and kept. A blanket "short = decorative" rule
// wrongly ate genuine short song names during testing (e.g. bracket content
// "2026 全新專輯單曲搶先收聽" is the decorative part, and the real song name
// "定睛在耶穌身上" sits outside the bracket — the reverse of the usual case).
function isDecorativeFragment(fragment, artist) {
  let s = stripDecorative(fragment);
  if (artist) s = removeArtistSubstring(s, artist);
  s = stripGenericLabels(s);
  const stripped = normalizeForCompare(s);
  if (!stripped) return true;
  if (/^\d{1,4}$/.test(stripped)) return true;
  const hasCJK = /[一-鿿]/.test(stripped);
  if (!hasCJK && stripped.length <= 20) return true;
  return false;
}

// Deliberately excludes brackets/parens — those are only ever removed by the
// bracket-extraction step (which is careful about balance) or left alone.
// Blindly trimming a trailing "）" here produces orphaned openers like
// "…（基督教詩歌".
function trimConnectors(s) {
  return s
    .replace(/^[\s\-–—|｜│:：·•,，、/⧸_&]+/, '')
    .replace(/[\s\-–—|｜│:：·•,，、/⧸_&]+$/, '')
    // A comma/、/&/"and" sitting right next to a dash or pipe is what's left
    // when the name on ONE side of it got removed as a duplicate artist —
    // e.g. "Kari Jobe Carnes, Cody Carnes, Passion - Who Else" with "Passion"
    // (the artist) stripped becomes "…Carnes, - Who Else"; collapse that
    // orphaned comma into the dash rather than shipping it. Anchored to a
    // connector on at least one side, so a real "A & B" pairing elsewhere in
    // the title (nothing removed nearby) is untouched.
    .replace(/[,，、]\s*([-–—|｜│])/g, ' $1')
    .replace(/([-–—|｜│])\s*[,，、]/g, '$1 ')
    .replace(/([-–—|｜│])\s*&\s*/g, '$1 ')
    .replace(/&\s*([-–—|｜│])/g, '$1 ')
    .replace(/([-–—|｜│])\s*\band\s+/gi, '$1 ')
    // Same idea, one level down: a comma/、doubled up, or sitting right next
    // to a "&", once the name between them is gone — e.g. "Kari Jobe, Jenn
    // Johnson & Brian Johnson" with "Kari Jobe" removed → "House of Worship,
    // , Jenn Johnson & …"; or "Kari Jobe" removed from "…Carnes, & Kari Jobe
    // Intense…" → "…Carnes, & Intense…". Collapsing "X, &" to "X &" is just
    // dropping an Oxford comma either way, never a content change.
    .replace(/[,，、](?:\s*[,，、])+/g, ', ')
    .replace(/[,，、]\s*&/g, ' &')
    .replace(/&\s*[,，、]/g, '& ')
    .replace(/&(?:\s*&)+/g, '&')
    // Two (or more — e.g. a "---" stylistic divider) connectors back to back,
    // as when "獨一拯救 | SON Music | ft. …" has "SON Music" removed →
    // "獨一拯救 |  | ft. …" — the artist sat directly between two separators,
    // so nothing real is left between them; collapse the whole run to one.
    .replace(/([-–—|｜│])(?:\s*[-–—|｜│])+/g, '$1')
    // "X" as a bare connector word ("團A X 團B" = "A crossover B") orphaned at
    // the very front once the leading artist name is gone.
    .replace(/^x\s+/i, '')
    // Whitespace left clinging to a bracket delimiter after a mid-string
    // removal, e.g. "（ 重投豐盛專輯）" → "（重投豐盛專輯）".
    .replace(/([【「『（(\[])\s+/g, '$1')
    .replace(/\s+([】」』）)\]])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksBroken(candidate) {
  if (!candidate || candidate.trim().length < 2) return true;
  // A connector at the very edge (nothing real on one side, e.g. "xxx |") means
  // its other half got cut off — broken. A connector in the MIDDLE with real
  // text both sides (e.g. "耶穌祢已得勝 / Jesus You Have Overcome", a Chinese/
  // English bilingual pairing) is completely normal and must not be flagged —
  // trimConnectors() already strips genuine edge connectors, so anything left
  // here at an edge slipped through and is a real problem.
  if (/^[|｜│/⧸\-–—]/.test(candidate)) return true;
  if (/[|｜│/⧸\-–—]$/.test(candidate)) return true;
  // Lone "l" (lowercase L used as a pipe by some channels) — but not "I", a
  // common real English word/title-starter ("I Surrender") that must not be
  // mistaken for this.
  if (/(^|\s)l(\s|$)/.test(candidate)) return true;
  const pairs = [['【', '】'], ['「', '」'], ['『', '』'], ['（', '）'], ['(', ')'], ['[', ']']];
  for (const [open, close] of pairs) {
    const o = (candidate.match(new RegExp(escapeRegex(open), 'g')) || []).length;
    const c = (candidate.match(new RegExp(escapeRegex(close), 'g')) || []).length;
    if (o !== c) return true;
  }
  return false;
}

export function cleanDisplayTitle(rawTitle, artist = '') {
  if (!rawTitle) return rawTitle;
  const original = rawTitle.trim();
  let title = original;

  // 1. Bracket extraction: a single 【..】/「..」 wrapping the real song name,
  //    with purely decorative text (channel tag / duplicate artist) outside it.
  const bracketMatch = title.match(/^(.*?)[【「](.+?)[】」](.*)$/);
  if (bracketMatch) {
    const [, before, inner, after] = bracketMatch;
    if (
      inner.trim().length >= 2
      && isDecorativeFragment(before, artist)
      && isDecorativeFragment(after, artist)
    ) {
      title = inner.trim();
    }
  }

  // 2. Remove redundant artist-name occurrences.
  title = removeArtistSubstring(title, artist);

  // 3. Remove known decorative MV/format descriptors.
  title = stripDecorative(title);

  // 4. Trim stray connector punctuation left behind.
  title = trimConnectors(title);

  // 5. Safety net — never ship something broken or over-deleted.
  if (looksBroken(title)) return original;
  return title;
}
