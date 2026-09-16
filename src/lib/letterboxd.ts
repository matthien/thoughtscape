import { XMLParser } from "fast-xml-parser";

const FEED_URL = "https://letterboxd.com/matttheinn/rss/";

export interface ParsedEntry {
  source_id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  contains_spoilers: boolean;
  logged_at: string;
  external_url: string | null;
}

// Letterboxd's own boilerplate for a spoiler-flagged review, injected as the
// first paragraph of the description. It's chrome, not something Matt wrote,
// so it's stripped from the stored review — the site renders its own
// blur-to-reveal treatment off the contains_spoilers flag instead.
const SPOILER_NOTICE = /^This review may contain spoilers\.?$/i;

// Pulls the poster out of the description's first <img>, then strips all
// markup from the remaining paragraphs to get the review text. Letterboxd
// appends an auto-generated "Watched on <date>." paragraph to reviewless
// entries; that's noise, not a review, so it's dropped.
function parseDescription(html: string): { cover: string | null; review: string | null } {
  const imgMatch = html.match(/<img[^>]*src="([^"]+)"/);
  const cover = imgMatch ? imgMatch[1] : null;

  // [\s\S] instead of the dotAll `s` flag: the build target predates ES2018.
  const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter((p) => p.length > 0)
    .filter((p) => !/^<img/.test(p) && !imgMatch?.[0].includes(p))
    .filter((p) => !/^Watched on /.test(p))
    .filter((p) => !SPOILER_NOTICE.test(p));

  return { cover, review: paragraphs.length ? paragraphs.join("\n\n") : null };
}

// The RSS feed has no director, but Letterboxd film pages embed schema.org
// JSON-LD that does. Review URLs look like /USER/film/slug/; stripping the
// username yields the film page.
export async function fetchDirector(externalUrl: string): Promise<string | null> {
  // Rewatch reviews get a numbered suffix (/film/her/1/) that isn't part
  // of the film page URL — strip it along with the username.
  const filmUrl = externalUrl
    .replace(/letterboxd\.com\/[^/]+\/film\//, "letterboxd.com/film/")
    .replace(/\/\d+\/$/, "/");
  const res = await fetch(filmUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (thoughtscape sync)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();

  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  // Letterboxd wraps the JSON in CDATA comment markers.
  const json = m[1]
    .replace(/\/\*\s*<!\[CDATA\[\s*\*\//, "")
    .replace(/\/\*\s*\]\]>\s*\*\//, "");
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data.director) || data.director.length === 0) return null;
    const names = data.director
      .map((d: { name?: string }) => d.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : null;
  } catch {
    return null;
  }
}

export async function fetchLetterboxdEntries(): Promise<ParsedEntry[]> {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "thoughtscape-sync" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Letterboxd feed returned ${res.status}`);
  const xml = await res.text();

  // htmlEntities: Letterboxd encodes apostrophes etc. as numeric entities
  // (&#039;) in plain fields; without this the parser only decodes the
  // handful of named XML entities and leaves &#039; in stored text verbatim.
  const parser = new XMLParser({ ignoreAttributes: false, htmlEntities: true });
  const parsed = parser.parse(xml);
  let items = parsed?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  const entries: ParsedEntry[] = [];
  for (const item of items) {
    const guid = typeof item.guid === "object" ? item.guid["#text"] : item.guid;
    // The feed can also carry list activity; only film reviews have a filmTitle.
    if (!guid || !item["letterboxd:filmTitle"]) continue;

    const description = String(item.description ?? "");
    const { cover, review } = parseDescription(description);
    // The spoiler flag surfaces in two independent places; either one is
    // enough, so checking both survives Letterboxd changing one of them.
    const containsSpoilers =
      /\(contains spoilers\)\s*$/i.test(String(item.title ?? "")) ||
      /may contain spoilers/i.test(description);
    const watched = item["letterboxd:watchedDate"];
    const loggedAt = watched
      ? new Date(`${watched}T00:00:00Z`).toISOString()
      : new Date(item.pubDate).toISOString();

    entries.push({
      source_id: String(guid),
      title: String(item["letterboxd:filmTitle"]),
      year: item["letterboxd:filmYear"] ? Number(item["letterboxd:filmYear"]) : null,
      cover_url: cover,
      rating:
        item["letterboxd:memberRating"] !== undefined
          ? Number(item["letterboxd:memberRating"])
          : null,
      review_text: review,
      contains_spoilers: containsSpoilers,
      logged_at: loggedAt,
      external_url: item.link ? String(item.link) : null,
    });
  }
  return entries;
}
