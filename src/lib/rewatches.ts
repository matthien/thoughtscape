import type { MediaEntry } from "@/lib/types";

// Every Letterboxd diary entry is its own row (keyed on its own guid), so a
// rewatch arrives as a second row for the same film. Title + year is what
// ties them together; books aren't grouped.
export function rewatchKey(row: { id: string; source: string; title: string; year: number | null }): string {
  return row.source === "letterboxd" ? `letterboxd|${row.title}|${row.year}` : row.id;
}

// Folds every watch of the same film into one card. The first watch's row
// is the card itself: its id, x/y and shelved state, since that's the spot
// Matt placed by hand and the id the admin drag and shelf write to. What's
// shown comes from the newest watch: date, poster, link, and the NEW badge,
// so a fresh rewatch reads as new. A rewatch logged with just stars would
// otherwise blank out an earlier review, so the review and rating each come
// from the newest watch that actually has one.
export function groupRewatches(rows: MediaEntry[]): MediaEntry[] {
  const groups = new Map<string, MediaEntry[]>();
  for (const row of rows) {
    const key = rewatchKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  // Map iteration follows first appearance, so the caller's sort order holds.
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const placed = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const byNewest = [...group].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
    const [newest] = byNewest;
    const reviewed = byNewest.find((e) => e.review_text) ?? newest;
    const rated = byNewest.find((e) => e.rating !== null) ?? newest;
    return {
      ...newest,
      id: placed.id,
      source_id: placed.source_id,
      x: placed.x,
      y: placed.y,
      shelved_at: placed.shelved_at,
      director: newest.director ?? placed.director,
      review_text: reviewed.review_text,
      contains_spoilers: reviewed.contains_spoilers,
      rating: rated.rating,
      watch_count: group.length,
    };
  });
}
