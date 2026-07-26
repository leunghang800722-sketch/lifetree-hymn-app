// Backend (lib/displayTitle.js) computes the cleaned title once and stores it
// in `display_title`. This just prefers that over the raw YouTube `title`,
// falling back for any row an older cached payload or a not-yet-backfilled
// row doesn't have it for.
export function getDisplayTitle(hymn) {
  if (!hymn) return '';
  return hymn.display_title || hymn.title || '';
}
