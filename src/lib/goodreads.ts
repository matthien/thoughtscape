import { XMLParser } from "fast-xml-parser";

const FEED_URL = "https://www.goodreads.com/review/list_rss/199102300?shelf=read";

export interface ParsedBookEntry {
  source_id: string;
  title: string;
  author: string | null;
  year: number | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  logged_at: string;
  external_url: string | null;
}

// user_review arrives with paragraph breaks already stripped by Goodreads
// (nothing to reconstruct), so cleanup here is just decoding/stripping any
// stray markup and trimming — not re-inserting structure that's already gone.
function cleanReview(raw: string): string | null {
  const cleaned = raw.replace(/<[^>]+>/g, "").trim();
  return cleaned.length ? cleaned : null;
}

export async function fetchGoodreadsEntries(): Promise<ParsedBookEntry[]> {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "thoughtscape-sync" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Goodreads feed returned ${res.status}`);
  const xml = await res.text();

  // htmlEntities: same fix as letterboxd.ts — Goodreads also encodes
  // apostrophes etc. as numeric entities in plain fields.
  const parser = new XMLParser({ ignoreAttributes: false, htmlEntities: true });
  const parsed = parser.parse(xml);
  let items = parsed?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  const entries: ParsedBookEntry[] = [];
  for (const item of items) {
    // The guid is per-review (this specific read), not per-book, so a
    // reread creates a new entry instead of colliding with the old one —
    // same behavior as a Letterboxd rewatch.
    const guid = item.guid;
    if (!guid || !item.title) continue;

    // user_read_at is blank for most entries in practice; user_date_added/
    // pubDate are always populated and identical, so fall back to pubDate
    // (same pattern as letterboxd.ts's watchedDate -> pubDate fallback).
    const readAt = item.user_read_at ? String(item.user_read_at).trim() : "";
    const loggedAt = readAt ? new Date(readAt) : new Date(item.pubDate);

    const rating = Number(item.user_rating);
    const review = item.user_review ? cleanReview(String(item.user_review)) : null;

    entries.push({
      source_id: String(guid),
      title: String(item.title),
      author: item.author_name ? String(item.author_name) : null,
      year: item.book_published ? Number(item.book_published) : null,
      cover_url: item.book_large_image_url ? String(item.book_large_image_url) : null,
      // 0 means "marked read, not rated" on Goodreads, not a literal zero-star rating.
      rating: rating > 0 ? rating : null,
      review_text: review,
      logged_at: loggedAt.toISOString(),
      external_url: item.link ? String(item.link) : null,
    });
  }
  return entries;
}
