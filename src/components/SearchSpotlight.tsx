"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MediaEntry } from "@/lib/types";
import type { MediaFilter, MediaTypeFilter } from "@/lib/filter";
import { EMPTY_FILTER, isFilterActive, titleMatchRange } from "@/lib/filter";
import StarRating, { STAR_PATH } from "./StarRating";
import styles from "./SearchSpotlight.module.css";

const TYPES: { value: MediaTypeFilter; label: string }[] = [
  { value: "all", label: "all" },
  { value: "movie", label: "movies" },
  { value: "book", label: "books" },
];

/** One row of the results list. `index` is the entry's index in the
 *  canvas's `entries` array, which is what opening its detail view needs. */
export interface SearchResult {
  entry: MediaEntry;
  index: number;
  /** Cover height / width. 1.5 for posters; a book's own ratio once the
   *  canvas has measured its cover, else a typical 1.56. */
  coverRatio: number;
}

const THUMB_W = 26;
// Same 22% the mat's book card uses for its curl, at thumbnail size.
const THUMB_CURL = Math.round(THUMB_W * 0.22);

// 3.5 -> "3.5", 4 -> "4" (Matt prefers decimals over "3½").
function starsText(v: number): string {
  return `${v}`;
}

// Readable label for one star target, for screen readers ("3.5★ or more").
function ratingLabel(v: number): string {
  return v === 5 ? "5★ only" : `${starsText(v)}★ or more`;
}

// How much of star n (1-5) a rating value fills: 1, 0.5 or 0.
function starFill(n: number, value: number | null): number {
  if (value === null) return 0;
  return Math.min(Math.max(value - (n - 1), 0), 1);
}

// One star of the minimum-rating picker, drawn in up to three layers:
// the unlit glyph, then the hover preview, then the chosen minimum, each
// either whole or clipped to its left half.
function PickerStar({ lit, preview, clipId }: { lit: number; preview: number; clipId: string }) {
  function layer(fill: number, className: string) {
    if (fill <= 0) return null;
    return (
      <path d={STAR_PATH} className={className} clipPath={fill < 1 ? `url(#${clipId})` : undefined} />
    );
  }
  return (
    <svg width={15} height={15} viewBox="4 3.7 12 12" aria-hidden="true">
      <path d={STAR_PATH} className={styles.starUnlit} />
      {layer(preview, styles.starPreview)}
      {layer(lit, styles.starLit)}
    </svg>
  );
}

// What the corner hint says while a filter is on: the active filters joined
// by " · ", e.g. "prestige" · movies · 4★. No match count here — that
// lives in the panel's footer.
function filterSummary(f: MediaFilter): string {
  const parts: string[] = [];
  const q = f.query.trim();
  if (q) parts.push(`"${q}"`);
  if (f.type !== "all") parts.push(f.type === "movie" ? "movies" : "books");
  if (f.minRating !== null) parts.push(`${starsText(f.minRating)}★`);
  return parts.join(" · ");
}

// The title with the matched slice wrapped in <mark>, so you can see why a
// row matched. Type/rating-only filters have no slice to mark.
function HighlightedTitle({ title, query }: { title: string; query: string }) {
  const range = titleMatchRange(title, query);
  if (!range) return <>{title}</>;
  const [start, end] = range;
  return (
    <>
      {title.slice(0, start)}
      <mark className={styles.mark}>{title.slice(start, end)}</mark>
      {title.slice(end)}
    </>
  );
}

// A miniature of the entry's mat card, keeping the type distinction the
// cards make: posters get the same hairline border as on the mat; books get
// no border, the clipped bottom-right corner over a cream page, and a tiny
// curl (the card's flap fill and cut-edge stroke; the shadows are dropped,
// they'd be sub-pixel at this size).
function Thumb({ entry, ratio }: { entry: MediaEntry; ratio: number }) {
  const gradientId = useId();
  const height = Math.round(THUMB_W * ratio);
  // Explicit width/height on every cover: book covers can be huge, and a
  // dropped size would paint one at full resolution (see CLAUDE.md).
  if (entry.media_type !== "book") {
    return (
      <span className={styles.thumbPoster} style={{ width: THUMB_W, height }}>
        {entry.cover_url && (
          <img src={entry.cover_url} alt="" width={THUMB_W} height={height} draggable={false} />
        )}
      </span>
    );
  }
  return (
    <span className={styles.thumbBook} style={{ width: THUMB_W, height }}>
      {entry.cover_url && (
        <img
          src={entry.cover_url}
          alt=""
          width={THUMB_W}
          height={height}
          draggable={false}
          style={{
            clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${THUMB_CURL}px), calc(100% - ${THUMB_CURL}px) 100%, 0 100%)`,
          }}
        />
      )}
      <svg className={styles.thumbCurl} width={THUMB_CURL} height={THUMB_CURL} viewBox="0 0 31 31" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="6.64" y1="2.21" x2="28.79" y2="24.36" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#a89c85" />
            <stop offset="1" stopColor="#f5f0e4" />
          </linearGradient>
        </defs>
        <path d="M0 31L31 0L6.82 6.82Z" fill={`url(#${gradientId})`} />
        <line x1="1" y1="30" x2="30" y2="1" stroke="#fdf8ec" strokeWidth="2" opacity="0.9" />
      </svg>
    </span>
  );
}

/**
 * Spotlight-style search for the public mat. At rest it's only a faint
 * "/ search" hint in the bottom-left corner; clicking it (or pressing "/")
 * opens a panel over a dimmed overlay. Filtering is live, so the mat reacts
 * behind the overlay while you type, and while a filter is on the panel
 * lists the matching entries: arrow keys move a highlight, Enter opens it.
 *
 * Fully controlled: the canvas owns the filter (it needs it to fade cards,
 * fade the title and steer the detail view's arrows) and whether the panel
 * is open (it reopens the panel when you come back from a result's detail
 * view). This component displays both and reports changes.
 */
export default function SearchSpotlight({
  filter,
  onChange,
  open,
  onOpenChange,
  results,
  onOpenResult,
  total,
  visible,
}: {
  filter: MediaFilter;
  onChange: (next: MediaFilter) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The matching entries, in mat order (logged_at, newest first). */
  results: SearchResult[];
  /** Open this entry's detail view (by index into the canvas's entries). */
  onOpenResult: (index: number) => void;
  total: number;
  /** False while a detail view is open or animating: the hint fades out. */
  visible: boolean;
}) {
  // Which star the pointer is over, so the row previews what a click would
  // pick before you commit to it.
  // In half-star steps (0.5-5): what the pointer is over.
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  // useId's raw value has characters SVG url(#...) can't take; strip them.
  const halfClipId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-half`;
  // The highlighted result: what Enter would open.
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const active = isFilterActive(filter);
  const showResults = active;
  // Clamp in case the list shrank under the highlight.
  const hi = Math.min(highlight, Math.max(results.length - 1, 0));

  // The highlight jumps back to the first row whenever the query, type or
  // rating changes. Same "adjust state when a prop changes" pattern as
  // React recommends over an effect: compare to the previous filter during
  // render. (`filter` is a new object on every change from onChange.)
  const [prevFilter, setPrevFilter] = useState(filter);
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setHighlight(0);
  }
  // ...and the list scrolls back to the top to match.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [filter]);

  function close() {
    onOpenChange(false);
    setHoverStar(null);
    // Drop focus from the now-unmounted input. Deliberately NOT handed back
    // to the corner hint: that drew a focus ring on it after every close,
    // which Matt didn't want.
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // Opening a result leaves the panel "open": the canvas only shows it while
  // the mat is idle, so it hides during the detail view and comes back
  // (refocused, query and highlight intact) when you leave it via the
  // button, Escape or browser back. Matt's call, reversing an earlier
  // version that dropped you on the bare mat instead.
  function openResult(r: SearchResult) {
    setHoverStar(null);
    (document.activeElement as HTMLElement | null)?.blur();
    onOpenResult(r.index);
  }

  // "/" opens the panel from anywhere on the mat, unless you're already
  // typing in a field. preventDefault so the slash isn't typed into the
  // input that's about to take focus.
  useEffect(() => {
    if (!visible || open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      onOpenChange(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, open, onOpenChange]);

  // While open, Escape clears the typed text first and closes on the next
  // press (Matt's call). Listening on window so it works wherever focus is
  // inside the panel (a pill or star, not only the input).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (filter.query) onChange({ ...filter, query: "" });
      else close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Focus the input whenever the panel opens (including the reopen after
  // backing out of a result's detail view).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Arrow keys and Enter, handled on the input: DOM focus never leaves the
  // field, the highlight is just state (announced via aria-activedescendant).
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults || results.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Otherwise the caret jumps to the start/end of the field.
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Wraps at both ends.
      const next = (hi + step + results.length) % results.length;
      setHighlight(next);
      // Row positions don't depend on the highlight, so the row can be
      // scrolled into view right away rather than after the re-render.
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      openResult(results[hi]);
    }
  }

  const query = filter.query.trim();

  return (
    <>
      <button
        className={`${styles.hint} ${active ? styles.hintActive : ""} ${visible && !open ? styles.hintVisible : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpenChange(true)}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        aria-label={active ? `Search (filtering: ${filterSummary(filter)})` : "Search"}
      >
        <kbd className={styles.hintKey}>/</kbd>
        <span className={styles.hintLabel}>{active ? filterSummary(filter) : "search"}</span>
      </button>

      {open && (
        <div
          className={styles.overlay}
          // data-search lets the canvas's wheel-zoom handler ignore events
          // here, so scrolling over the overlay doesn't zoom the mat.
          data-search
          // The mat pans on pointerdown and captures the pointer, which would
          // swallow clicks and steal focus from the input. Stop it here.
          onPointerDown={(e) => e.stopPropagation()}
          // Clicking the backdrop (not the panel) closes.
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="Search and filter"
            // Keep focus in the search box when clicking anything else in the
            // panel (a pill, a star, a row). Arrow keys and Enter are handled
            // on the input, so a click that moved focus onto a pill left them
            // dead. preventDefault on mousedown stops the focus move; the
            // click itself still fires. Tabbing to a control still works.
            onMouseDown={(e) => {
              if (e.target !== inputRef.current) e.preventDefault();
            }}
          >
            {/* ROW 1: search */}
            <label className={styles.searchRow}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                className={styles.input}
                type="text"
                value={filter.query}
                placeholder="search titles"
                aria-label="Search titles"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showResults && results.length > 0}
                aria-controls={listId}
                aria-activedescendant={
                  showResults && results.length > 0 ? `${listId}-${hi}` : undefined
                }
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => onChange({ ...filter, query: e.target.value })}
                onKeyDown={onInputKeyDown}
              />
              {filter.query && (
                <button
                  className={styles.clearQuery}
                  aria-label="Clear search text"
                  onClick={() => {
                    onChange({ ...filter, query: "" });
                    inputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </label>

            {/* ROW 2: facets */}
            <div className={styles.facetRow}>
              <div className={styles.pills} role="group" aria-label="Media type">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    className={`${styles.pill} ${filter.type === t.value ? styles.pillOn : ""}`}
                    aria-pressed={filter.type === t.value}
                    onClick={() => onChange({ ...filter, type: t.value })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className={styles.rating}>
                <span className={styles.caption}>min. rating</span>
                <div
                  className={styles.stars}
                  role="group"
                  aria-label="Minimum rating"
                  onMouseLeave={() => setHoverStar(null)}
                >
                  {/* One shared clip for every half-star layer: the left
                      half of the glyph (it's centred on x=10). */}
                  <svg width={0} height={0} className={styles.defs} aria-hidden="true">
                    <defs>
                      <clipPath id={halfClipId}>
                        <rect x={0} y={0} width={10} height={20} />
                      </clipPath>
                    </defs>
                  </svg>
                  {[1, 2, 3, 4, 5].map((n) => {
                    // Lit up to the chosen minimum; hovering previews what a
                    // click would set, at half strength, on top of the unlit
                    // glyph and under the lit one.
                    const lit = starFill(n, filter.minRating);
                    const preview = starFill(n, hoverStar);
                    return (
                      <span key={n} className={styles.star}>
                        <PickerStar lit={lit} preview={preview} clipId={halfClipId} />
                        {/* Two targets per star: the left half sets n - 0.5,
                            the right half n. Matching is rating >= minimum,
                            so 3.5 includes everything from 3.5 up. Clicking
                            the value already set clears the rating filter,
                            so there's no separate "any" control. */}
                        {[n - 0.5, n].map((v) => (
                          <button
                            key={v}
                            className={v === n ? styles.halfRight : styles.halfLeft}
                            aria-label={ratingLabel(v)}
                            aria-pressed={filter.minRating === v}
                            onMouseEnter={() => setHoverStar(v)}
                            onClick={() =>
                              onChange({ ...filter, minRating: filter.minRating === v ? null : v })
                            }
                          />
                        ))}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RESULTS: only while a filter is on. */}
            {showResults &&
              (results.length > 0 ? (
                <ul ref={listRef} id={listId} className={styles.results} role="listbox" aria-label="Results">
                  {results.map((r, i) => {
                    const name = r.entry.media_type === "book" ? r.entry.author : r.entry.director;
                    const kind = r.entry.media_type === "book" ? "book" : "movie";
                    return (
                      <li
                        key={r.entry.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === hi}
                        className={`${styles.result} ${i === hi ? styles.resultOn : ""}`}
                        // mousemove, not mouseenter: keyboard scrolling slides
                        // rows under a still cursor, which fires mouseenter
                        // and would steal the highlight from the keyboard.
                        onMouseMove={() => i !== hi && setHighlight(i)}
                        onClick={() => openResult(r)}
                      >
                        <Thumb entry={r.entry} ratio={r.coverRatio} />
                        <div className={styles.meta}>
                          <div className={styles.resultTitle}>
                            <HighlightedTitle title={r.entry.title} query={query} />
                          </div>
                          <div className={styles.resultSub}>{name ? `${kind} · ${name}` : kind}</div>
                        </div>
                        {r.entry.rating ? (
                          // Same star row as the cards (real half-star glyph,
                          // dim placeholders for the rest), at row scale.
                          <span className={styles.resultStars} role="img" aria-label={`${r.entry.rating} stars`}>
                            <StarRating rating={r.entry.rating} size={13} />
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={styles.empty}>
                  {query ? (
                    <>
                      no title matches <span className={styles.emptyQuery}>&ldquo;{query}&rdquo;</span>
                    </>
                  ) : (
                    "nothing on the mat matches those filters"
                  )}
                </div>
              ))}

            {/* STATUS BAND: count + clear filters, only while a filter is on. */}
            {active && (
              <div className={styles.statusBand}>
                <span aria-live="polite">
                  <strong className={styles.count}>{results.length}</strong> of {total} match
                </span>
                <button
                  className={styles.clearAll}
                  // Resets query, type and rating but keeps the panel open,
                  // with focus back in the search box.
                  onClick={() => {
                    setHoverStar(null);
                    onChange(EMPTY_FILTER);
                    inputRef.current?.focus();
                  }}
                >
                  clear filters
                </button>
              </div>
            )}

            {/* FOOTER: key hints only (the count lives in the status band). */}
            <div className={styles.footer}>
              <span className={styles.keys} aria-hidden="true">
                <kbd className={styles.key}>↑↓</kbd> move · <kbd className={styles.key}>↵</kbd> open ·{" "}
                <kbd className={styles.key}>esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
