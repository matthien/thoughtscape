"use client";

import { useEffect, useState } from "react";
import type { MediaEntry } from "@/lib/types";
import { rotationFor, CARD_H } from "@/lib/detailLayout";
import StarRating from "./StarRating";
import styles from "./Card.module.css";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// 22% of the fixed 140px book width, matching the curl size Matt's Figma
// exploration (node 120:78, "BOOK CARD — FINAL") uses across its three
// sample covers — verified the same ratio holds at all three card widths.
const BOOK_WIDTH = 140;
const CURL = Math.round(BOOK_WIDTH * 0.22);

function isRecentlySynced(entry: MediaEntry): boolean {
  return Date.now() - new Date(entry.created_at).getTime() < NEW_WINDOW_MS;
}

// Book covers aren't a uniform 2:3 like posters, so this renders at a fixed
// width with height following the image's natural ratio (plain <img>, not a
// background-image box). The bottom-right page curl is the only cue that
// distinguishes a book from a movie card; its fold geometry is lifted
// directly from the Figma exploration frame (node 120:78) rather than
// approximated. No border — deliberate, per Matt.
//
// The corner cut needs something behind it: a flat "page" layer, plain
// cream, sitting under the cover so the mat never shows through the clip —
// that's what reads as a lifted page rather than a folded-off poster corner.
// Since the cover img fully occludes it everywhere except its own clipped
// corner, this needs no clip-path of its own.
//
// The curl SVG layers, bottom to top: a blurred dark stroke tracing the fold
// curve (contact shadow in the crook, mostly hidden under the flap fill but
// haloing onto the page layer beside it), the flap fill itself (gradient +
// its own cast-shadow filter), then a thin light stroke on the straight cut
// edge only (the paper's cut thickness catching light).
function BookCover({
  entry,
  onClick,
  onPosterPointerDown,
  onHeightKnown,
}: {
  entry: MediaEntry;
  onClick?: () => void;
  onPosterPointerDown?: (e: React.PointerEvent) => void;
  /** Reports the cover's rendered world-space height (at the fixed 140px
   *  width) once its natural size is known — the detail-view camera math
   *  needs this since, unlike movie posters, book covers aren't a uniform
   *  2:3 and their height can't be assumed. */
  onHeightKnown?: (height: number) => void;
}) {
  const gradientId = `curl-${entry.id}`;
  // A missing or failed cover shouldn't render a browser broken-image icon —
  // fall back to a plain sized placeholder (the cream page layer showing
  // through) at the same height movie posters use, matching what
  // posterHeightFor() already assumes for books it knows nothing about.
  const [broken, setBroken] = useState(!entry.cover_url);
  useEffect(() => {
    if (broken) onHeightKnown?.(CARD_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broken]);

  return (
    <div
      className={styles.bookWrap}
      onClick={onClick}
      onPointerDown={onPosterPointerDown}
      style={{ cursor: onPosterPointerDown ? "grab" : onClick ? "pointer" : undefined }}
    >
      <div className={styles.pageLayer} />
      {broken ? (
        <div className={styles.bookCoverFallback} style={{ height: CARD_H }} />
      ) : (
        <img
          src={entry.cover_url ?? undefined}
          alt=""
          title={entry.title}
          className={styles.bookCover}
          draggable={false}
          style={{
            clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CURL}px), calc(100% - ${CURL}px) 100%, 0 100%)`,
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0) {
              onHeightKnown?.((img.naturalHeight * BOOK_WIDTH) / img.naturalWidth);
            }
          }}
          onError={() => setBroken(true)}
        />
      )}
      <svg className={styles.curl} width={CURL} height={CURL} viewBox="0 0 31 31">
        <defs>
          {/* Gradient axis runs perpendicular to the fold, from near the
              crease (dark) out toward the straight cut edge (bright) — the
              lifted tip catches light, the fold sits in its own shadow. */}
          <linearGradient
            id={gradientId}
            x1="6.64286"
            y1="2.21429"
            x2="28.7857"
            y2="24.3571"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#a89c85" />
            <stop offset="1" stopColor="#f5f0e4" />
          </linearGradient>
        </defs>
        <path className={styles.foldShadow} d="M31 0L6.82 6.82L0 31" />
        <path
          className={styles.curlFill}
          d="M0 31L31 0L6.82 6.82Z"
          fill={`url(#${gradientId})`}
        />
        {/* Inset from the true corner junctions (0,31) and (31,0) so the
            centered stroke width doesn't poke past the card's straight
            edges there. */}
        <line className={styles.curlEdge} x1="1" y1="30" x2="30" y2="1" />
      </svg>
      <div className={styles.contactShadow} />
    </div>
  );
}

export default function Card({
  entry,
  onClick,
  onPosterPointerDown,
  interactive = true,
  dimmed = false,
  selected = false,
  rotationOverrideDeg,
  starsOpacity = 1,
  onBookHeightKnown,
}: {
  entry: MediaEntry;
  onClick?: () => void;
  /** Admin mode: start dragging this card. Presence also switches the cursor to grab. */
  onPosterPointerDown?: (e: React.PointerEvent) => void;
  /** Set false while a zoom transition is in flight to suppress hover popovers. */
  interactive?: boolean;
  /** Fades non-selected cards once the detail view has settled. */
  dimmed?: boolean;
  /** True whenever this card is the one being zoomed into/shown in detail — the 5-star size
   *  boost is suppressed then, since the detail zoom math assumes the base 140x210 card size. */
  selected?: boolean;
  /** Drives the selected card's tilt back to 0deg as it zooms toward the detail view. */
  rotationOverrideDeg?: number;
  /** Fades out only the star row as the selected card becomes the detail poster (the detail panel shows its own rating). The NEW badge stays. */
  starsOpacity?: number;
  /** Book-only: reports the cover's rendered world-space height once known, so the caller's
   *  detail-zoom math can target the book's actual (non-2:3) aspect ratio. */
  onBookHeightKnown?: (height: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isBook = entry.media_type === "book";
  // Books sit upright — no resting tilt (confirmed against the Figma book-card
  // exploration, where all three sample covers render at 0deg).
  const rotation = isBook ? 0 : rotationOverrideDeg ?? rotationFor(entry.id);
  const showHoverDetails = interactive && hovered;
  // The 5-star size boost is a movie-only deviation (see file header); book
  // covers stay a fixed 140px per the build brief regardless of rating.
  const boosted = !isBook && entry.rating === 5 && !selected;

  return (
    <div
      className={styles.wrapper}
      style={{ left: entry.x, top: entry.y, opacity: dimmed ? 0.08 : 1 }}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`${styles.tilt} ${onClick || onPosterPointerDown ? "" : styles.noHover}`}
        style={
          {
            "--rotation": `${rotation}deg`,
            "--card-scale": boosted ? 1.15 : 1,
          } as React.CSSProperties
        }
      >
        {isBook ? (
          <BookCover
            entry={entry}
            onClick={onClick}
            onPosterPointerDown={onPosterPointerDown}
            onHeightKnown={onBookHeightKnown}
          />
        ) : (
          <div
            className={styles.poster}
            style={{
              backgroundImage: entry.cover_url ? `url(${entry.cover_url})` : undefined,
              cursor: onPosterPointerDown ? "grab" : undefined,
            }}
            onClick={onClick}
            onPointerDown={onPosterPointerDown}
            title={entry.title}
          />
        )}
        <div style={{ opacity: starsOpacity }}>
          <StarRating rating={entry.rating ?? 0} />
        </div>

        {isRecentlySynced(entry) && <div className={styles.badge}>NEW</div>}
      </div>

      <div className={`${styles.hoverDetails} ${showHoverDetails ? styles.visible : ""}`}>
        <div className={styles.hoverTitle}>{entry.title}</div>
        {entry.director ? (
          <div className={styles.hoverDirector}>Directed by {entry.director}</div>
        ) : (
          entry.author && <div className={styles.hoverDirector}>Written by {entry.author}</div>
        )}
      </div>
    </div>
  );
}
