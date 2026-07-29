# matt's thoughtscape: project brief

A personal media review site presented as a spatial canvas styled like a black cutting mat. Movie reviews sync from Letterboxd into a database, and each review appears as a poster card placed on the mat. The site owner (Matt) arranges card positions by hand in a private admin mode, and every visitor sees that same arrangement. This is not a portfolio piece in style: it should feel like a personal object, closer to a workbench than a website.

Live design reference: Figma file "Untitled" (key 2xk7Ohv28hGKhGmmBXUEp6). Pages: "Page 1" holds the canvas view ("zoomed out spread out"), the details view ("details"), and V2 concept frames ("STACKED MATS", "PEEL"). The "components" page holds masters ("zoomed out card," "hover details," "button"). This is the source of truth for visual details — the Figma MCP tools can read it directly (`get_metadata`, `get_design_context`, `get_screenshot` against file key `2xk7Ohv28hGKhGmmBXUEp6`); re-check it rather than trusting this prose if the two ever disagree. Verified details as of 2026-07-08:

- Mat background `#19191b`. Grid: 40px minor lines, brighter major lines every 200px (5th line). Rendered as a single tiled SVG data-URI image, not stacked CSS gradients — hard-stop gradient lines rasterize inconsistently across device pixel ratios (verified: invisible on some Windows scaling factors, overly heavy on others). A baked vector tile scales like a normal image instead.
- Type is **Roboto Mono** (not Space Mono), Regular/SemiBold. Ruler tick numbers use Inter Regular 9px, color `#737378`.
- Cards have **no cream border** — a thin `0.5px solid rgba(117,117,117,0.25)` border, rounded top corners only (2px). Poster is 140x210, `object-cover`. Figma's own component has no size boost for 5-star entries, but Matt asked for one anyway as a build-time deviation: 5-star posters render 15% larger (140x210 → 161x241.5) on the canvas to stand out. The boost is suppressed while a card is selected/mid-zoom, since the click-to-detail camera math (`src/lib/detailLayout.ts`) assumes every card is exactly 140x210 — see `--card-scale` in `Card.tsx`/`Card.module.css`.
- Star rating is 5 SVG stars (16px pitch, ~84x20 total box), filled color `#E0EA5E`, unfilled stars are a dim placeholder (`rgba(255,255,255,0.15)`) — exact "unfilled" treatment wasn't in the file and is our best-guess fill, open to Matt's revision.
- A white "NEW" pill badge (black text, rounded 4px) appears on some cards in the mock. Confirmed with Matt: it flags entries **synced within the last 7 days**, keyed off `created_at`. Not a placement indicator.
- Corner "MAT 01"-style stamps only appear in the V2 concept frames (stacked mats / peel), **not** in the v1 "zoomed out spread out" frame. Don't build one for v1.
- Hover popover ("hover details" component): 4px padding, white title + `#a5a5a5` "Directed by X", positioned to the right of the card. Figma specs a `rgba(155,155,155,0.25)` background, but Matt overrode it in build: over real poster art that translucency drowned, so the shipped value is near-opaque dark (`rgba(43,43,46,0.95)`). The hovered card also gets `z-index: 10` so the popover always floats above overlapping neighbor cards.
- The reset-view button (labeled "reset view", lowercase) is **not** anchored bottom-right — it's horizontally centered, positioned near the bottom. A designer annotation on the node says to only show it once the view is panned at least half a screen away from center; it's hidden otherwise.
- Details view: 320x480 poster left, 360px-wide text column right with a 24px gap; title/director/stars in one row, review text below; prev/next are icon-only arrow buttons bottom-right of the content block; a "back to canvas" button (same style as reset-view) sits centered near the bottom, same position formula as the canvas view's reset button.

## V1 scope (build this, nothing more)

One mat. The 25 most recent movie reviews. No books, no songs, no multiple mats, no peel transition. Desktop only; mobile can show a simple fallback message or a basic list, lowest possible effort.

### Core experience (public)

1. Full-viewport cutting mat: charcoal background, grid, site title "matt's thoughtscape" with subtitle "entryway to my opinions about different forms of media" near center. No corner label stamp in v1 (see Figma notes above — that's a V2-only element).
2. Up to 25 poster cards at stored x/y positions. Cards are poster art only (no title text; the poster carries it), 2:3 aspect ratio, 140x210px, thin subtle border (not cream — see Figma notes), soft shadow on hover. Star rating sits below the card in chartreuse (#E0EA5E). 5-star entries render 15% larger (see Figma notes above) to stand out on the mat.
3. Pan the canvas by dragging. Releasing a drag mid-motion glides to a stop (ease-out tail of the same curve family, distance from release velocity, capped at 900px; a pause before release means no glide). Scroll-wheel zoom (built): cursor-anchored, clamped 0.4x–2.5x, each wheel tick retargets a short 250ms eased glide (same curve as the detail zoom) instead of stepping. Opening a detail from a zoomed camera and closing it restores the exact zoomed view; reset-view glides pan and zoom home together and also appears when zoom drifts >0.15 from 1:1. Admin canvas intentionally has no zoom (its drag math assumes 1:1).
4. Hover a card: a small details popover appears beside it (title, "Directed by [director]" if available). Committed animation, not cursor-tracking: once triggered it plays fully and stays until dismissed.
5. Click a card: details view. Large poster left; title, director, stars, and review text right; a visible "back to canvas" control plus Escape both close it. **Click-outside does NOT close it** — Matt found that annoying and explicitly asked for it to be removed; only Escape and the button do. Prev/next arrows step between reviews. Exact layout in Figma notes above.

   The transition is a camera move, not a cut: clicking a card animates the canvas's own pan/scale transform (~700ms ease-in-out) so the clicked card grows into the poster's position/size, with every other card and the grid along for the ride (same transform, so they naturally slide/scale past the viewport edges — this "other cards passing by" look falls straight out of sharing one transform, no special-casing needed). The card's resting tilt eases to 0° and its star row fades out in sync (the detail text panel shows its own rating); the NEW badge **stays visible** on the zoomed poster — Matt explicitly wants it kept in the detail view. The text panel itself fades/slides in only during the last ~40% of the move. Exiting (button or Escape) reverses the same tween back to the pan position you were at before opening. The arrow buttons fly between cards (450ms, shorter than open/close) without a detour through the canvas view. Arrow navigation is **spatial, not chronological** (Matt's explicit preference after trying both): each arrow flies to the nearest card (Euclidean distance) whose x lies strictly in that direction, and disables when nothing exists that way. Any other card still visible at the edges of the detail view is also clickable and flies the camera straight to its own detail (same machinery). `prefers-reduced-motion` skips the tween entirely (snap + CSS opacity crossfade). The URL syncs to `/film/<slugified-title>` via plain `history.pushState`/`replaceState` (not Next.js routing) specifically so the canvas component is never remounted mid-transition; a `popstate` listener handles back/forward. A real `/film/[slug]` route also exists (`src/app/film/[slug]/page.tsx`, renders the same Canvas) purely so hard loads/refreshes of a detail link don't 404 — the Canvas reads the path on mount and opens that entry. Geometry/easing/animation-driver code lives in `src/lib/detailLayout.ts`, shared between the camera math and the text panel's fixed screen position so they always line up exactly.

   Gotcha (hit once, don't reintroduce): the viewport must use `overflow: clip`, not `overflow: hidden`. `hidden` still permits programmatic/focus-triggered scrolling, and any such scroll silently offsets the whole world from the camera math (surfaced as a card landing exactly 40 world-px off-target after clicking a partially-offscreen card). Non-clickable cards (the selected one, or all cards mid-flight) also get a `noHover` class that suppresses the hover lift and pointer cursor.
6. Wayfinding: a reset-view control, labeled "reset view", horizontally centered near the bottom — only shown once panned at least half a screen away from center (not always visible, not bottom-right). "Center" means the title copy sits at exact viewport center (Matt's call after trying bounding-box-of-all-cards centering, which drifted with asymmetric arrangements), and reset glides there with the same 600ms ease as the detail zoom rather than snapping. Ruler tick marks along edges fit the mat metaphor and can double as spatial reference — in Figma these are plain small numbers every 200px, not literal tick lines.
7. Review text is expected to be short (a few sentences). Still cap the container and scroll on overflow so a long review never breaks layout.

### Admin mode (private)

A route not linked anywhere, gated by a simple password check (an environment variable is fine; this is privacy, not security).

1. Same canvas, but cards are draggable. On drop, persist the new x/y to the database (built: `/api/position`, service-role write gated on the admin cookie; anon key stays read-only via RLS).
2. A "Sync now" button (built: top-right of the admin canvas): sync is manual only, never scheduled. It fetches the Letterboxd RSS feed, parses entries, and upserts into the database, reporting "N new · N updated" in the admin badge and reloading to show new cards.
3. New entries from sync get an auto-jittered starting position (random within a sane region) so nothing ever sits unplaced; Matt then drags them where he wants.
4. A "back to live" button sits bottom-center — same position and style as the live view's reset-view/back-to-canvas buttons, admin mode only. It navigates to `/` without clearing the admin cookie (30-day session), so hopping between arranging and previewing doesn't re-prompt for the password.

### Data pipeline (built and verified 2026-07-08)

- Source: Letterboxd RSS at `https://letterboxd.com/matttheinn/rss/`. Parser lives in `src/lib/letterboxd.ts`; the admin-gated route `src/app/api/sync/route.ts` does the upsert. Verified against the real feed: 50 items imported, second run = 0 new / 50 updated (idempotent).
- Fetch server-side (CORS blocks browser fetches of this feed). Feed facts, verified: guids look like `letterboxd-review-<id>`; film reviews carry `letterboxd:filmTitle/filmYear/memberRating/watchedDate`; the description CDATA holds a 600x900 poster `<img>` (plenty for the 320px detail poster) followed by review paragraphs. Watch-only entries have an auto-generated "Watched on <date>." paragraph — the parser strips it rather than storing it as a review. Items without `filmTitle` (list activity) are skipped. **Director is not in the RSS at all** — sync backfills it by fetching each film's Letterboxd page and reading the schema.org JSON-LD it embeds (`fetchDirector` in `src/lib/letterboxd.ts`, concurrency 5, only for rows where director is still null, so after the first full pass only new films cost a fetch). Gotcha: rewatch review URLs carry a numbered suffix (`/film/her/1/`) that must be stripped to reach the film page. TMDB (`tmdb:movieId` is in the feed) remains the upgrade path if scraping ever breaks.
- Upsert keyed on (source, source_id) so re-running sync never duplicates. Confirmed with Matt: sync updates existing rows (edited reviews propagate), not insert-only. Updates never touch x/y (hand placement survives); only brand-new rows get a jittered position (x 200–1200, y 150–700).
- `logged_at` = `letterboxd:watchedDate` (fallback pubDate), so the canvas's "latest 25" follows watch order, not posting order.
- Canvas queries the latest 25 by logged_at. The database keeps everything; older entries simply stop rendering ("rotate off").
- The dummy seed rows were deleted once the real sync was verified. `supabase/seed.sql` remains only as a reference for spinning up a fresh dev database.

### Database (Supabase, Postgres)

```sql
create table media_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- 'letterboxd' for now
  source_id text not null,           -- stable id or URL from the source
  media_type text not null,          -- 'movie' for now
  title text not null,
  year int,
  director text,
  cover_url text,
  rating numeric,                    -- normalized 0-5
  review_text text,
  logged_at timestamp not null,
  external_url text,
  x numeric,
  y numeric,
  mat_number int default 1,          -- future-proofing for v2 chapters
  created_at timestamp default now(),
  unique (source, source_id)
);
```

Keep the schema polymorphic-ready: books and songs later are just new source and media_type values, same table.

### Stack

Next.js + Supabase + Vercel. Matt is learning React fundamentals alongside this, so favor clear, well-commented code over clever abstractions. Hand-roll the pan/zoom canvas with CSS transforms (or d3-zoom); do not pull in a whiteboard library like tldraw. Owning the rendering matters because the distinct visual style is the point. Avoid leaning on default Tailwind styling for the expressive parts; the mat, cards, and type treatment should be deliberate custom CSS.

### Interaction feel (from an already-built prototype)

A working React prototype of the mat exists (mat-peel-prototype.jsx) and its card/mat styling tokens can be lifted directly. Key learnings from it:
- Animations should commit: trigger once, play fully, rest in the new state. Never tie animation progress to cursor position.
- Card hover: slight lift (translateY -4px, scale 1.03) with a deeper shadow, ~180ms ease.
- The prototype's cream card borders and mat shadow are its own V2-peel styling — the actual v1 card component in Figma uses a much thinner, near-invisible border instead (see Figma notes at the top of this file). Follow Figma for the card; follow the prototype for animation feel and the peel mechanics.

## V2 (do not build yet; keep the architecture friendly to it)

- Stacked mats as time chapters: when a mat hits 25 cards it freezes as a numbered chapter and a fresh mat starts on top. New entries always go to the top mat, never older ones.
- Navigation between mats: a curled bottom-right corner. At rest a small permanent curl (~50px) hints it is peelable; hovering commits an animation opening it to ~190px revealing the mat beneath and its label; clicking peels the whole mat away (transform anchored at that corner, about 850ms, slight rotation) revealing the previous chapter intact. A return tab on the left edge brings it back. Implement as the CSS "fake peel" (clip-path polygon plus a gradient flap element), not WebGL.
- Books via the Hardcover GraphQL API and songs (source TBD: Last.fm or manual) as new media_type values on the same table and mat.
- mat_number column already exists to support this.

## Open items to confirm with Matt before or during build

1. ~~Letterboxd username~~ — resolved: `matttheinn`.
2. ~~Supabase project credentials~~ — resolved: project created, keys live in `.env.local` (gitignored, not duplicated here).
3. Admin password value — `ADMIN_PASSWORD` in `.env.local` (gitignored, never written into this file or the repo). Started as an obvious placeholder; must be set to a real value before the site deploys.
4. ~~Whether sync updates existing rows or only inserts~~ — resolved: update-on-match (brief's default).
5. ~~Poster art source~~ — resolved: the RSS embeds 600x900 posters, comfortably sharp at the 320px detail size. TMDB remains the upgrade path if director info is ever wanted (the feed has `tmdb:movieId` per entry, so it's an easy join later).
6. Unfilled-star color and the "back to canvas"/prev-next button icon styling were inferred from adjacent Figma components, not pulled from an exact spec — flag if they look off.
7. Matt's exit-behavior request said "only the bottom button" should close the detail view, but in the same message also listed "Escape, click outside" as valid exits for the zoom-transition spec. Resolved by keeping Escape (low-risk, standard) and dropping click-outside (the thing he explicitly said he disliked) — flag if Escape should go too.

## Working style

Matt is a product designer with a CS degree, comfortable with Figma and design judgment, newer to the modern JS ecosystem. Explain nontrivial choices in one or two lines as you make them. Build incrementally in this order: (1) schema plus a few dummy rows, (2) canvas rendering dummies with pan working, (3) drag and persist positions in admin mode, (4) Letterboxd sync replacing dummies. Get each step visibly working before the next.
