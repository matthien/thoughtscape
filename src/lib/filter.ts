import type { MediaEntry } from "./types";

// The public mat's filter strip (design direction "A" in the Figma
// explorations): filtering never moves a card. Matches stay as they are and
// everything else fades in place, so the hand arrangement stays readable.
// This file is just the matching rules, kept free of React so it's easy to
// reason about (and test) on its own.

export type MediaTypeFilter = "all" | "movie" | "book";

export interface MediaFilter {
  /** Free text, matched against title, director/author and review text. */
  query: string;
  type: MediaTypeFilter;
  /** "This many stars or more"; null means any rating, including unrated. */
  minRating: number | null;
}

export const EMPTY_FILTER: MediaFilter = { query: "", type: "all", minRating: null };

export function isFilterActive(f: MediaFilter): boolean {
  return f.query.trim() !== "" || f.type !== "all" || f.minRating !== null;
}

// Lowercase and strip accents, so "amelie" finds "Amélie". NFD splits an
// accented letter into the letter plus a combining mark, and the regex drops
// the marks.
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesFilter(entry: MediaEntry, f: MediaFilter): boolean {
  if (f.type !== "all" && entry.media_type !== f.type) return false;

  // An unrated entry has no rating to clear the bar with, so any star filter
  // hides it.
  if (f.minRating !== null && (entry.rating ?? 0) < f.minRating) return false;

  const words = normalize(f.query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  // Every word has to appear somewhere, but not necessarily in the same field
  // or next to each other: "villeneuve sand" finds Dune by its director plus
  // a word from the review.
  const haystack = normalize(
    [entry.title, entry.director, entry.author, entry.review_text].filter(Boolean).join(" ")
  );
  return words.every((w) => haystack.includes(w));
}
