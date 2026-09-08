import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchLetterboxdEntries, fetchDirector } from "@/lib/letterboxd";
import { fetchGoodreadsEntries } from "@/lib/goodreads";

// One row shape every adapter upserts into, keyed on (source, source_id).
type SyncEntry = {
  source_id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  logged_at: string;
  external_url: string | null;
  director?: string | null;
  author?: string | null;
};

// Upserts one adapter's parsed entries for a given (source, media_type).
// Existing rows get their data refreshed (edited reviews propagate) but
// keep their hand-placed x/y; new rows land at a jittered position so
// nothing ever sits unplaced.
async function syncSource(source: string, mediaType: string, parsed: SyncEntry[]) {
  const { data: existingRows, error: selectError } = await supabaseAdmin
    .from("media_entries")
    .select("source_id")
    .eq("source", source);
  if (selectError) throw new Error(selectError.message);
  const existing = new Set((existingRows ?? []).map((r) => r.source_id));

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
    };

    if (existing.has(entry.source_id)) {
      // Never let a feed that's momentarily dropped the rating wipe one we
      // already have. Goodreads RSS in particular keeps reporting a
      // freshly-added rating as 0 (-> null in the parser) for a while;
      // omitting the key leaves the stored column untouched. A real rating
      // value still overwrites normally.
      const updatePayload: Partial<typeof common> = { ...common };
      if (entry.rating === null) delete updatePayload.rating;

      const { error } = await supabaseAdmin
        .from("media_entries")
        .update(updatePayload)
        .eq("source", source)
        .eq("source_id", entry.source_id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { error } = await supabaseAdmin.from("media_entries").insert({
        ...common,
        source,
        source_id: entry.source_id,
        media_type: mediaType,
        x: 200 + Math.random() * 1000,
        y: 150 + Math.random() * 550,
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

  let movies, books;
  try {
    [movies, books] = await Promise.all([fetchLetterboxdEntries(), fetchGoodreadsEntries()]);
  } catch (e) {
    return NextResponse.json(
      { error: `feed fetch failed: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }

  let movieResult, bookResult;
  try {
    [movieResult, bookResult] = await Promise.all([
      syncSource("letterboxd", "movie", movies),
      syncSource("goodreads", "book", books),
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
    directors,
  });
}
