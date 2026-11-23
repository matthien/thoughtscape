import type { MediaEntry } from "./types";

// The public mat's search (SearchSpotlight): filtering never moves a card.
// Matches stay as they are and everything else fades in place, so the hand
// arrangement stays readable. This file is just the matching rules, kept
// free of React so it's easy to reason about (and test) on its own.

export type MediaTypeFilter = "all" | "movie" | "book";

export interface MediaFilter {
  /** Free text, matched against the title only. */
  query: string;
  type: MediaTypeFilter;
  /** "This many stars or more"; null means any rating, including unrated. */
  minRating: number | null;
}

export const EMPTY_FILTER: MediaFilter = { query: "", type: "all", minRating: null };

export function isFilterActive(f: MediaFilter): boolean {
  return f.query.trim() !== "" || f.type !== "all" || f.minRating !== null;
}

// Strip accents from one character, so "amelie" finds "Amélie". NFD splits
// an accented letter into the letter plus combining marks; dropping the
// marks leaves the base letter.
function foldChar(c: string): string {
  return c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Where the query appears in the title, as [start, end) indexes into the
 * ORIGINAL title (so the results list can wrap exactly that slice in a
 * <mark>), or null if it doesn't appear. Case- and accent-insensitive
 * substring match; the query is trimmed so a trailing space doesn't fail it.
 *
 * Folding is done character by character, remembering which original
 * character each folded one came from — folding the whole string at once
 * can change its length, which would throw the highlight off.
 */
export function titleMatchRange(title: string, query: string): [number, number] | null {
  const q = Array.from(query.trim()).map(foldChar).join("");
  if (!q) return null;

  let folded = "";
  const origin: number[] = []; // origin[i] = index in `title` of folded[i]
  let pos = 0;
  for (const ch of Array.from(title)) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) origin.push(pos);
    folded += f;
    pos += ch.length;
  }

  const at = folded.indexOf(q);
  if (at === -1) return null;
  const start = origin[at];
  const lastOrigin = origin[at + q.length - 1];
  // End just past the original character the last folded one came from.
  const end = lastOrigin + Array.from(title.slice(lastOrigin))[0].length;
  return [start, end];
}

export function matchesFilter(entry: MediaEntry, f: MediaFilter): boolean {
  if (f.type !== "all" && entry.media_type !== f.type) return false;

  // An unrated entry has no rating to clear the bar with, so any star filter
  // hides it. Whole-star minimums: 4 includes 4.5s.
  if (f.minRating !== null && (entry.rating ?? 0) < f.minRating) return false;

  // Title only (Matt's spec): not review text, director or author.
  if (!f.query.trim()) return true;
  return titleMatchRange(entry.title, f.query) !== null;
}
