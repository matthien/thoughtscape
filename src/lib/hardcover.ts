import { decodeEntities } from "./decodeEntities";

// Hardcover replaced Goodreads as the books source in Nov 2026, after
// Goodreads removed RSS feeds altogether. Unlike the old feed this is a real
// GraphQL API, authenticated with a personal access token
// (hardcover.app/account/api) stored as HARDCOVER_TOKEN in .env.local.
// The token must stay server-side: it's tied to Matt's account.
const API_URL = "https://api.hardcover.app/v1/graphql";

// Hardcover's reading statuses: 1 want to read, 2 reading, 3 read,
// 4 paused, 5 did not finish, 6 ignored. Only finished books go on the mat,
// same as the old ?shelf=read feed.
const STATUS_READ = 3;

export interface ParsedBookEntry {
  source_id: string;
  title: string;
  author: string | null;
  year: number | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  contains_spoilers: boolean;
  logged_at: string;
  /** True when logged_at is the date added, not a real finished date. */
  logged_at_estimated: boolean;
  external_url: string | null;
}

// The rate limit counts each top-level field as one request, so this is a
// single field (`me`) with the library nested under it: one request per sync.
const LIBRARY_QUERY = `
  query ReadBooks($status: Int!) {
    me {
      user_books(where: { status_id: { _eq: $status } }, order_by: { date_added: desc }) {
        id
        rating
        review_raw
        review_has_spoilers
        last_read_date
        date_added
        edition { image { url } }
        book {
          title
          slug
          release_year
          image { url }
          contributions { author { name } }
        }
      }
    }
  }
`;

interface HardcoverUserBook {
  id: number;
  rating: number | null;
  review_raw: string | null;
  review_has_spoilers: boolean;
  last_read_date: string | null;
  date_added: string;
  edition: { image: { url: string | null } | null } | null;
  book: {
    title: string | null;
    slug: string | null;
    release_year: number | null;
    image: { url: string | null } | null;
    contributions: { author: { name: string | null } | null }[];
  };
}

// Reviews are stored as plain text, so strip any markup and decode entities,
// the same cleanup the other adapters do.
function cleanReview(raw: string): string | null {
  const cleaned = decodeEntities(raw.replace(/<[^>]+>/g, "")).trim();
  return cleaned.length ? cleaned : null;
}

export async function fetchHardcoverEntries(): Promise<ParsedBookEntry[]> {
  const token = process.env.HARDCOVER_TOKEN;
  if (!token) throw new Error("HARDCOVER_TOKEN is not set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The token page gives the bare token; accept it either way.
      authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      // Hardcover asks scripts to identify themselves.
      "user-agent": "thoughtscape-sync (personal site)",
    },
    body: JSON.stringify({ query: LIBRARY_QUERY, variables: { status: STATUS_READ } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hardcover API returned ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Hardcover API: ${json.errors.map((e: { message?: string }) => e.message ?? e).join("; ")}`);
  }

  // `me` comes back as a one-item list rather than a single object.
  const me = Array.isArray(json.data?.me) ? json.data.me[0] : json.data?.me;
  const userBooks: HardcoverUserBook[] = me?.user_books ?? [];

  const entries: ParsedBookEntry[] = [];
  for (const ub of userBooks) {
    const book = ub.book;
    if (!book?.title) continue;

    // Prefer the cover of the edition Matt actually read; fall back to the
    // book's default cover.
    const cover = ub.edition?.image?.url ?? book.image?.url ?? null;
    // `contributions` covers translators and illustrators too, but the
    // primary author comes first.
    const author = book.contributions.find((c) => c.author?.name)?.author?.name ?? null;
    // Finished date when it's recorded, else when it was added. The added date
    // is only an estimate, and for books brought over from Goodreads it's the
    // import day, so it's flagged and the sync won't overwrite a stored date
    // with it (see logged_at_estimated in the sync route).
    const loggedAt = new Date(ub.last_read_date ?? ub.date_added);

    entries.push({
      // One user_book per book in Hardcover. A reread updates this row's
      // read history instead of creating a second entry, so a reread no
      // longer adds a new card like it did with Goodreads.
      source_id: String(ub.id),
      title: book.title,
      author,
      year: book.release_year ?? null,
      cover_url: cover,
      // Hardcover allows half stars, and the rating column is numeric, so a
      // 3.5 is stored as is. Null (or 0) means not rated.
      rating: ub.rating && ub.rating > 0 ? Number(ub.rating) : null,
      review_text: ub.review_raw ? cleanReview(ub.review_raw) : null,
      contains_spoilers: Boolean(ub.review_has_spoilers),
      logged_at: loggedAt.toISOString(),
      logged_at_estimated: !ub.last_read_date,
      external_url: book.slug ? `https://hardcover.app/books/${book.slug}` : null,
    });
  }
  return entries;
}
