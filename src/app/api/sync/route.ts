import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchLetterboxdEntries, fetchDirector } from "@/lib/letterboxd";
import { fetchHardcoverEntries } from "@/lib/hardcover";
import { rewatchKey } from "@/lib/rewatches";

// Loose title key for matching the same book across Goodreads and Hardcover.
// Goodreads appends series info ("Dune (Dune, #1)") and the two sites
// disagree on subtitles and punctuation, so compare only the main title,
// lowercased, with letters and digits only.
function titleKey(title: string): string {
  return title
    .replace(/\(.*?\)/g, "")
    .split(":")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// One-time handover from Goodreads (RSS removed Nov 2026) to Hardcover.
// Re-keys each old Goodreads row matching an incoming Hardcover book to
// source 'hardcover' and the new id, instead of letting syncSource insert a
// duplicate. Re-keying moves the row as it is, so its hand-placed x/y,
// shelved state and created_at (no false NEW badge) all carry over. After
// the first sync nothing matches any more, so this becomes a cheap no-op.
async function adoptGoodreadsRows(books: { source_id: string; title: string; author: string | null }[]) {
  const { data: legacy, error } = await supabaseAdmin
    .from("media_entries")
    .select("id, title, author")
    .eq("source", "goodreads")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!legacy?.length) return 0;

  const { data: already } = await supabaseAdmin
    .from("media_entries")
    .select("source_id")
    .eq("source", "hardcover");
  const known = new Set((already ?? []).map((r) => r.source_id));

  const remaining = [...legacy];
  let adopted = 0;
  for (const book of books) {
    if (known.has(book.source_id)) continue;
    const key = titleKey(book.title);
    const candidates = remaining.filter((r) => titleKey(r.title) === key);
    if (!candidates.length) continue;
    // Same title, different book: when there's more than one candidate,
    // the author decides. Oldest first, so a Goodreads reread (a second row)
    // stays behind and the originally placed card is the one adopted.
    const authorMatch = candidates.find(
      (r) => r.author && book.author && r.author.toLowerCase() === book.author.toLowerCase()
    );
    const row = authorMatch ?? candidates[0];
    const { error: updateError } = await supabaseAdmin
      .from("media_entries")
      .update({ source: "hardcover", source_id: book.source_id })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    remaining.splice(remaining.indexOf(row), 1);
    adopted++;
  }
  return adopted;
}

// One row shape every adapter upserts into, keyed on (source, source_id).
type SyncEntry = {
  source_id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  logged_at: string;
  /** logged_at is a stand-in (e.g. Hardcover's date added), not a real
   *  finished date: used for new rows, never written over an existing one. */
  logged_at_estimated?: boolean;
  external_url: string | null;
  director?: string | null;
  author?: string | null;
  /** The review is flagged as containing spoilers. Letterboxd and Hardcover
   *  both set it; an adapter that leaves it undefined keeps the column's
   *  `false` default. */
  contains_spoilers?: boolean;
};

// Upserts one adapter's parsed entries for a given (source, media_type).
// Existing rows get their data refreshed (edited reviews propagate) but
// keep their hand-placed x/y; new rows land at a jittered position so
// nothing ever sits unplaced.
async function syncSource(source: string, mediaType: string, parsed: SyncEntry[]) {
  const { data: existingRows, error: selectError } = await supabaseAdmin
    .from("media_entries")
    .select("id, source_id, title, year, x, y, shelved_at")
    .eq("source", source)
    .order("created_at", { ascending: true });
  if (selectError) throw new Error(selectError.message);
  const existing = new Set((existingRows ?? []).map((r) => r.source_id));
  // A rewatch is a new row for a film that's already on the mat; it takes
  // the first watch's spot and shelved state so the merged card stays put
  // (and stays hidden if it was hidden) instead of landing somewhere new.
  const firstWatch = new Map<string, NonNullable<typeof existingRows>[number]>();
  for (const r of existingRows ?? []) {
    const key = rewatchKey({ ...r, source });
    if (!firstWatch.has(key)) firstWatch.set(key, r);
  }

  let inserted = 0;
  let updated = 0;

  for (const entry of parsed) {
    const common = {
      title: entry.title,
      year: entry.year,
      cover_url: entry.cover_url,
      rating: entry.rating,
      review_text: entry.review_text,
      logged_at: entry.logged_at,
      external_url: entry.external_url,
      ...(entry.director !== undefined ? { director: entry.director } : {}),
      ...(entry.author !== undefined ? { author: entry.author } : {}),
      ...(entry.contains_spoilers !== undefined
        ? { contains_spoilers: entry.contains_spoilers }
        : {}),
    };

    if (existing.has(entry.source_id)) {
      // Never let a feed that's momentarily dropped the rating wipe one we
      // already have (Goodreads RSS used to report fresh ratings as 0 for a
      // while; kept as a guard for any source that does the same). Omitting
      // the key leaves the stored column untouched. A real rating value
      // still overwrites normally.
      const updatePayload: Partial<typeof common> = { ...common };
      if (entry.rating === null) delete updatePayload.rating;
      // Same idea for dates: a stand-in date mustn't replace a stored one
      // (books adopted from Goodreads keep their real read dates).
      if (entry.logged_at_estimated) delete updatePayload.logged_at;

      const { error } = await supabaseAdmin
        .from("media_entries")
        .update(updatePayload)
        .eq("source", source)
        .eq("source_id", entry.source_id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const watched = firstWatch.get(
        rewatchKey({ id: entry.source_id, source, title: entry.title, year: entry.year })
      );
      const { error } = await supabaseAdmin.from("media_entries").insert({
        ...common,
        source,
        source_id: entry.source_id,
        media_type: mediaType,
        x: watched ? watched.x : 200 + Math.random() * 1000,
        y: watched ? watched.y : 150 + Math.random() * 550,
        ...(watched ? { shelved_at: watched.shelved_at } : {}),
      });
      if (error) throw new Error(error.message);
      inserted++;
    }
  }

  return { inserted, updated };
}

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // allSettled, not all: the two sources are independent, so one being down
  // (Goodreads removing its RSS in Nov 2026 is what prompted this) shouldn't
  // block the other from syncing. A failed source syncs as an empty list and
  // its error is reported back; only both failing is a hard error.
  const [movieFeed, bookFeed] = await Promise.allSettled([
    fetchLetterboxdEntries(),
    fetchHardcoverEntries(),
  ]);
  const reason = (r: PromiseRejectedResult) =>
    r.reason instanceof Error ? r.reason.message : String(r.reason);
  const feedErrors: string[] = [];
  if (movieFeed.status === "rejected") feedErrors.push(reason(movieFeed));
  if (bookFeed.status === "rejected") feedErrors.push(reason(bookFeed));
  if (feedErrors.length === 2) {
    return NextResponse.json(
      { error: `feed fetch failed: ${feedErrors.join("; ")}` },
      { status: 502 }
    );
  }
  const movies = movieFeed.status === "fulfilled" ? movieFeed.value : [];
  const books = bookFeed.status === "fulfilled" ? bookFeed.value : [];

  let movieResult, bookResult;
  let adopted = 0;
  try {
    // Adoption has to finish before the book upsert, or syncSource would
    // see the Hardcover ids as new and insert duplicates.
    adopted = await adoptGoodreadsRows(books);
    [movieResult, bookResult] = await Promise.all([
      syncSource("letterboxd", "movie", movies),
      syncSource("hardcover", "book", books),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // Director backfill: the Letterboxd RSS has no director, so any row still
  // missing one gets it scraped from its film page (JSON-LD). Runs for all
  // missing rows each sync, so it self-heals; after the first big run only
  // newly-synced films need a fetch. Books already get author from the feed
  // directly, so no equivalent backfill is needed there.
  const { data: missingDirector } = await supabaseAdmin
    .from("media_entries")
    .select("id, external_url")
    .eq("source", "letterboxd")
    .is("director", null)
    .not("external_url", "is", null);

  let directors = 0;
  const queue = [...(missingDirector ?? [])];
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const director = await fetchDirector(row.external_url as string).catch(() => null);
        if (director) {
          const { error } = await supabaseAdmin
            .from("media_entries")
            .update({ director })
            .eq("id", row.id);
          if (!error) directors++;
        }
      }
    })
  );

  return NextResponse.json({
    ok: true,
    movies: movieResult,
    books: bookResult,
    adopted,
    directors,
    feedErrors,
  });
}
