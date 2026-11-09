"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaFilter, MediaTypeFilter } from "@/lib/filter";
import { EMPTY_FILTER, isFilterActive } from "@/lib/filter";
import { STAR_PATH } from "./StarRating";
import styles from "./FilterStrip.module.css";

const TYPES: { value: MediaTypeFilter; label: string }[] = [
  { value: "all", label: "all" },
  { value: "movie", label: "movies" },
  { value: "book", label: "books" },
];

// The label beside the star row. Copy is Matt's: "4★ or more". Five stars
// has nothing above it, so "or more" would be odd there.
function ratingLabel(n: number | null): string {
  if (n === null) return "any rating";
  return n === 5 ? "5★ only" : `${n}★ or more`;
}

/**
 * The slim strip pinned top-center of the public mat. It's fully controlled:
 * the canvas owns the filter (it needs it to fade cards and to steer the
 * detail view's arrows), and this component only displays it and reports
 * changes.
 */
export default function FilterStrip({
  filter,
  onChange,
  matchCount,
  total,
  visible,
}: {
  filter: MediaFilter;
  onChange: (next: MediaFilter) => void;
  matchCount: number;
  total: number;
  /** False while a detail view is open or animating: the strip fades out. */
  visible: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Which star the pointer is over, so the row previews what a click would
  // pick before you commit to it.
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const active = isFilterActive(filter);
  const shownStars = hoverStar ?? filter.minRating ?? 0;

  // "/" jumps to the search box from anywhere on the mat, unless you're
  // already typing in a field.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  return (
    <div
      className={`${styles.strip} ${visible ? styles.visible : ""}`}
      // The mat pans on pointerdown and captures the pointer, which would
      // swallow clicks and steal focus from the search box. Stop it here.
      onPointerDown={(e) => e.stopPropagation()}
      aria-hidden={!visible}
    >
      <label className={styles.search}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={filter.query}
          placeholder="search titles & reviews"
          aria-label="Search titles and reviews"
          spellCheck={false}
          tabIndex={visible ? 0 : -1}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          onKeyDown={(e) => {
            // First Escape clears what you typed, a second one leaves the box.
            if (e.key !== "Escape") return;
            if (filter.query) onChange({ ...filter, query: "" });
            else inputRef.current?.blur();
          }}
        />
        {!filter.query && <kbd className={styles.key}>/</kbd>}
      </label>

      <span className={styles.divider} />

      <div className={styles.segment} role="group" aria-label="Media type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            className={`${styles.chip} ${filter.type === t.value ? styles.on : ""}`}
            aria-pressed={filter.type === t.value}
            tabIndex={visible ? 0 : -1}
            onClick={() => onChange({ ...filter, type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className={styles.divider} />

      <div className={styles.rating} onMouseLeave={() => setHoverStar(null)}>
        <div className={styles.stars} role="group" aria-label="Minimum rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={styles.star}
              aria-label={ratingLabel(n)}
              aria-pressed={filter.minRating === n}
              tabIndex={visible ? 0 : -1}
              onMouseEnter={() => setHoverStar(n)}
              // Clicking the star that's already set turns the filter off,
              // so there's no separate control for "any rating".
              onClick={() => onChange({ ...filter, minRating: filter.minRating === n ? null : n })}
            >
              <svg width={14} height={14} viewBox="4 3.7 12 12" aria-hidden="true">
                <path d={STAR_PATH} className={n <= shownStars ? styles.starOn : styles.starOff} />
              </svg>
            </button>
          ))}
        </div>
        <span className={`${styles.ratingLabel} ${shownStars ? "" : styles.muted}`}>
          {ratingLabel(shownStars || null)}
        </span>
      </div>

      {active && (
        <>
          <span className={styles.divider} />
          <div className={styles.count}>
            <span aria-live="polite">
              {matchCount} of {total} match
            </span>
            <button
              className={styles.clear}
              tabIndex={visible ? 0 : -1}
              onClick={() => {
                setHoverStar(null);
                onChange(EMPTY_FILTER);
              }}
            >
              clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
