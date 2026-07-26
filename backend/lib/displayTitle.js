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
  '中英字幕', '字幕版mv', '字幕版', '動態mv', '动态mv', '小組敬拜用',
  '線上音樂會', '线上音乐会', '敬拜音樂會', '敬拜音乐会', 'ʟɪᴠᴇ ᴡᴏʀꜱʜɪᴘ ᴍᴏᴍᴇɴᴛꜱ',
  'dance version mv', "praise stream children's worship and praise",
  "praise stream children's worship", 'preschool', 'crossover',
  'official music video', 'official lyrics mv', 'official lyric video',
  'official ai music video', 'official mv', 'official video', 'official audio',
  'offical lyrics video', 'offical music video', 'offical mv',
  'lyric video', 'lyrics video', 'live worship mv', 'cantonese version',
  '現場敬拜', '现场敬拜', '堂會投稿', '堂会投稿', '廣東話版', '广东话版',
  'demo cover', '敬拜瞬間', '敬拜瞬间', 'mv',
];

// Known bilingual / short-nickname aliases for a DB `artist` value — added to
// the removeArtistSubstring() candidate list for that artist only. e.g. the
// artist column says "讚美之泉兒童" but a title spells that out in English as
// "Praise Stream Children's Worship and Praise"; the DB value alone can't
// catch that. Zero collision risk elsewhere since each entry is scoped to
// its own artist string.
const ARTIST_ALIASES = {
  '讚美之泉': ["stream of praise", "praise stream"],
  '讚美之泉粵語': ["stream of praise", "praise stream"],
  '讚美之泉兒童': ["stream of praise", "praise stream", "praise stream children's worship and praise", "praise stream children's worship"],
  '同心圓敬拜': ['tws 敬拜者使團', '同心圓', 'tws'],
};

// Boilerplate that's specific to ONE channel — e.g. 全心製作 HeartPro appends
// the exact same album footer "《HIS70ry 齊唱。吳秉堅之歌。》自傳第一樂章。" to
// every song in this series. Scoped to the exact artist string, so this can
// never misfire on another channel's legitimate use of similar punctuation.
// Order matters here (unlike the general lists elsewhere, this array isn't
// auto-sorted) — put longer/more-specific phrases first so e.g. "盛曉玫詩歌
// 默想" gets matched whole before "盛曉玫詩歌" can chop it up.
const ARTIST_SCOPED_PHRASES = {
  '全心製作 HeartPro': ['《HIS70ry 齊唱。吳秉堅之歌。》自傳第一樂章。', '見證'],
  'Heavenly Melody': ['___跟天韻合唱團一起敬拜神', '__天韻合唱團'],
  // 泥土音樂 is a label; its uploads all lead with the actual singer's name
  // ("盛曉玫") + a generic "詩歌"/"詩歌默想" ("hymn"/"hymn meditation") tag —
  // the DB artist string is the label, not this singer, so the general
  // artist-substring pass never catches it.
  '泥土音樂': ['盛曉玫詩歌默想', '盛曉玫 詩歌默想', '盛曉玫詩歌', '盛曉玫 詩歌'],
  '天弦音樂事工': ['gsus music ministry'],
  '共享詩歌ShareHymns': ['共享詩歌'],
  'CJ and Friends': ['cj & friends'],
  'KEC Worship': ['歌鄰敬拜'],
  // Source-data typo: this one row spells the artist "Hilsong" (missing an
  // "l") so the exact-match general pass never catches it.
  'Hillsong Kids': ['hilsong kids'],
  // "Kari Jobe Carnes" in the title vs. DB artist "Kari Jobe" — this full
  // form must be listed BEFORE the general pass's exact "Kari Jobe" match
  // gets a chance to fire, or it strands a bare "Carnes".
  'Kari Jobe': ['Kari Jobe Carnes'],
  // 原始和聲's "真 敬拜瞬間" ("True Worship Moment", a series variant name) —
  // the plain "敬拜瞬間" is already a general decorative phrase, but the "真"
  // prefix survives on its own unless paired here.
  '原始和聲': ['真 敬拜瞬間', '真敬拜瞬間', '真 · 敬拜瞬間'],
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// \b anchors on any edge that starts/ends on an ASCII word char, so an
// English phrase only matches a whole word — e.g. "preschool" must not eat
// the "preschool" inside "Preschoolers", leaving a stray "ers" (\b is a
// no-op on a CJK edge, where this kind of mid-word collision doesn't apply).
function phraseRegex(phrase, flags = 'ig') {
  const escaped = escapeRegex(phrase);
  const left = /^\w/.test(phrase) ? '\\b' : '';
  const right = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, flags);
}

// Longest-first everywhere below: a specific compound phrase (e.g. "兒童事工")
// must match whole before a shorter word it contains (e.g. "事工") gets a
// chance to chop it up and strand a fragment like "兒童" behind.
const DECORATIVE_PHRASES_SORTED = [...DECORATIVE_PHRASES].sort((a, b) => b.length - a.length);

function stripDecorative(s) {
  let out = s;
  for (const phrase of DECORATIVE_PHRASES_SORTED) {
    out = out.replace(phraseRegex(phrase), ' ');
  }
  // A phrase strip can leave a bracket pair wrapping nothing (e.g. "【中英字幕】"
  // → "【 】"); collapse those rather than shipping an empty bracket.
  out = out
    .replace(/【\s*】/g, ' ')
    .replace(/「\s*」/g, ' ')
    .replace(/『\s*』/g, ' ')
    .replace(/《\s*》/g, ' ')
    .replace(/（\s*）/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ');
  return out;
}

function normalizeForCompare(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[【】《》\[\]()（）「」『』"'.,，、。！？!?\-–—_/⧸|｜│:：~～*·•✝️🔥🙌🎶🪨#＃]+/g, '')
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
    out = out.replace(phraseRegex(w), ' ');
  }
  return out;
}

// includeAliases is deliberately opt-in and used ONLY by isDecorativeFragment
// (i.e. to help DECIDE whether a bracket-extraction candidate is safe), never
// by the general title-mutation pass in cleanDisplayTitle. An alias can be
// broad enough (e.g. "同心圓", a channel's short nickname) that blindly
// substring-removing it from the WHOLE title — when bracket-extraction
// itself didn't fire, because the rest of the title has real content that
// isn't decorative — leaves fragments dangling around orphaned brackets/
// pipes (see id 1847 test note) instead of a clean sentence. Restricting
// aliases to the yes/no decision keeps the actual output text change scoped
// to cases the bracket-extraction already validated as safe.
function removeArtistSubstring(title, artist, includeAliases = false) {
  if (!artist) return title;
  let out = title;
  const candidates = [artist.trim(), coreArtist(artist), ...(includeAliases ? (ARTIST_ALIASES[artist] || []) : [])]
    .filter((s) => s && s.length >= 2);
  for (const cand of candidates) {
    // Escape + allow optional internal spaces to be flexible about spacing drift.
    // A trailing \d* (no whitespace before it) also eats a glued episode/album
    // number like "團契遊樂園3" — but NOT "ACM 2012" (space before the digits
    // means it's a separate token, e.g. a year, and stays untouched). A
    // trailing possessive 's/’s (e.g. "Yancy's Annual...") is glued the same
    // way and would otherwise strand a bare "'s" once the name is gone.
    const pattern = escapeRegex(cand).replace(/\\ /g, '\\s*');
    const re = new RegExp(`${pattern}(?:['’]s)?\\d*`, 'ig');
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
  if (artist) s = removeArtistSubstring(s, artist, true);
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
    // A run of trailing "#word" hashtags (social-media metadata, e.g.
    // "#worship #singwithme #onewayjesus #hillsong") is never part of the
    // song's own name — but a bare "#" mid-title (rare, decorative musical
    // sharp sign) is left alone since this only matches at the true end.
    .replace(/(?:\s*#[\w一-鿿]+)+\s*$/, '')
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
    // Includes "/" for the same reason — a "/"-joined list like "除祢以外 /
    // 讚美之泉 / 注目看耶穌" with the artist-name entry removed would
    // otherwise leave a dangling "/  /" empty slot.
    .replace(/([-–—|｜│/⧸])(?:\s*[-–—|｜│/⧸])+/g, '$1')
    // "X" as a bare connector word ("團A X 團B" = "A crossover B") orphaned at
    // the very front once the leading artist name is gone.
    .replace(/^x\s+/i, '')
    // Whitespace left clinging to a bracket delimiter after a mid-string
    // removal, e.g. "（ 重投豐盛專輯）" → "（重投豐盛專輯）".
    .replace(/([【「『《（(\[])\s+/g, '$1')
    .replace(/\s+([】」』》）)\]])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const BIBLE_BOOKS = [
  '創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記',
  '撒母耳記', '列王紀', '歷代志', '以斯拉記', '尼希米記', '以斯帖記', '約伯記', '詩篇',
  '箴言', '傳道書', '雅歌', '以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書',
  '何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書',
  '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書', '馬太福音', '馬可福音', '路加福音',
  '約翰福音', '使徒行傳', '羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書',
  '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書',
  '提多書', '腓利門書', '希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書',
  '約翰三書', '猶大書', '啟示錄', '妥拉',
];

// Generic scripture/worship-category labels — these show up as one whole
// segment in a "l"-separated title (see splitOnLowercaseLPipe below) and are
// never the song's own name, just a category tag.
const SCRIPTURE_TAG_PHRASES = [
  '敬拜詩歌', '經文詩歌', '敬拜之聲', '妥拉詩歌', '妥拉史詩', '節期詩歌', '原創詩歌',
  '聖經詩歌', '聖經經文詩歌', '聖經經文', '聖經妥拉經文', '經文敬拜詩歌', '基督教詩歌', '詩篇大衛的詩歌', '詩歌',
  'worship song', 'worship songs', 'scripture song', 'torah worship song',
  'song of torah', 'new year song', 'song of david',
];
// Longest-first — same reason as DECORATIVE_PHRASES_SORTED above: 'worship
// song' matching inside 'Worship Songs' first would strand a trailing "s".
const SCRIPTURE_TAG_PHRASES_SORTED = [...SCRIPTURE_TAG_PHRASES].sort((a, b) => b.length - a.length);

// A segment counts as a droppable tag if, once known category phrases and a
// Bible-book + chapter/verse citation (e.g. "出埃及記1161") are stripped out,
// nothing meaningful is left.
function isScriptureTagSegment(segment) {
  let s = segment;
  for (const phrase of SCRIPTURE_TAG_PHRASES_SORTED) {
    s = s.replace(phraseRegex(phrase), ' ');
  }
  for (const book of BIBLE_BOOKS) {
    s = s.replace(new RegExp(`${escapeRegex(book)}[\\d:：\\-–—]*`, 'g'), ' ');
  }
  const stripped = normalizeForCompare(s);
  return !stripped || /^\d+$/.test(stripped);
}

// Letter-spaced stylized text (e.g. "C h r i s  T o m l i n") produces the
// exact same "single-char token between spaces" shape as a genuine "l" pipe —
// bail out on that rather than mis-splitting it.
function looksLetterSpaced(title) {
  return /(?:\b\w\s){4,}\w\b/.test(title);
}

// 我心旋律 (and possibly other channels) use a lowercase " l " as a segment
// separator across most of their titles, e.g. "敬畏祢的名 l Revere Your Name l
// 聖經妥拉經文 出埃及記1161 l 敬拜詩歌 l Worship Song l Scripture Song l 經文詩歌".
// Segment ORDER is inconsistent — sometimes the real (bilingual) song name
// comes first, sometimes a tag like "敬拜詩歌" does (see id 388: "敬拜詩歌
// l起初l Worship Song…", where the tag leads) — so this classifies each
// segment as content vs. tag rather than assuming a fixed position, and keeps
// every segment that isn't recognizably a tag. If nothing is recognized as a
// tag at all, the split is abandoned (title returned unchanged) rather than
// guessed at.
function splitOnLowercaseLPipe(title) {
  if (!/\bl\b/.test(title) || looksLetterSpaced(title)) return title;
  const segments = title.split(/\s*\bl\b\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return title;
  const kept = segments.filter((seg) => !isScriptureTagSegment(seg));
  if (!kept.length || kept.length === segments.length) return title;
  return kept.join(' / ');
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
  // Full-width and half-width parens are grouped together — scraped titles
  // routinely mix them (e.g. "（Live)" or "(Live）"), so treating "（" and "("
  // as strictly separate pair types flags pre-existing source-data quirks as
  // if this function had broken something (see id 207-333 test note: a
  // "（…「…」)" title with a half-width close got wrongly reverted to the
  // untouched original even though nothing about the cleaning was wrong).
  // Counts by escaped-literal alternation, not a `[...]` character class —
  // building a class from a single "]" produces the SOURCE STRING "[]]",
  // which JS parses as an EMPTY class "[]" (matches nothing, ever) followed
  // by a stray literal "]", so it silently never counted a single closing
  // "]" correctly. That made every title containing "[...]" (e.g. "Stay
  // [停留]", "[堂會投稿]", "SON Music [我向祢禱告]") register as permanently
  // unbalanced and get reverted to the untouched original no matter what.
  const pairs = [['【', '】'], ['「', '」'], ['『', '』'], ['《', '》'], ['（(', '）)'], ['[', ']']];
  for (const [open, close] of pairs) {
    const o = (candidate.match(new RegExp(open.split('').map(escapeRegex).join('|'), 'g')) || []).length;
    const c = (candidate.match(new RegExp(close.split('').map(escapeRegex).join('|'), 'g')) || []).length;
    if (o !== c) return true;
  }
  return false;
}

export function cleanDisplayTitle(rawTitle, artist = '') {
  if (!rawTitle) return rawTitle;
  const original = rawTitle.trim();
  let title = original;

  // 0. Channel-specific fixed boilerplate (exact phrases known to be repeated
  //    verbatim across every upload from this one artist) and the "l"-as-pipe
  //    segment style some channels use — both rewrite the raw text before any
  //    of the general-purpose steps below run.
  for (const phrase of ARTIST_SCOPED_PHRASES[artist] || []) {
    title = title.replace(phraseRegex(phrase), ' ');
  }
  title = splitOnLowercaseLPipe(title);

  // 1. Bracket extraction: a single 【..】/「..」/《..》 wrapping the real song
  //    name, with purely decorative text (channel tag / duplicate artist)
  //    outside it. 《..》 doubles as this in some channels (a title-mark
  //    wrapping the real name, e.g. "同心圓｜《盼祢捉緊我》｜TWS…") and as a
  //    decorative album/series footer in others (e.g. "…《一粒麥子》專輯") —
  //    the same before/after-must-be-decorative test used for 【】/「」
  //    handles both correctly without special-casing which one it is.
  const bracketMatch = title.match(/^(.*?)[【「《](.+?)[】」》](.*)$/);
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

  // 2. Remove redundant artist-name occurrences (incl. known aliases).
  title = removeArtistSubstring(title, artist);

  // 3. Remove known decorative MV/format descriptors.
  title = stripDecorative(title);

  // 4. Trim stray connector punctuation left behind.
  title = trimConnectors(title);

  // 5. Safety net — never ship something broken or over-deleted.
  if (looksBroken(title)) return original;
  return title;
}
