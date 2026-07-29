"use client";

import { useState } from "react";
import type { MediaEntry } from "@/lib/types";
import { rotationFor } from "@/lib/detailLayout";
import StarRating from "./StarRating";
import styles from "./Card.module.css";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isRecentlySynced(entry: MediaEntry): boolean {
  return Date.now() - new Date(entry.created_at).getTime() < NEW_WINDOW_MS;
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
}) {
  const [hovered, setHovered] = useState(false);
  const rotation = rotationOverrideDeg ?? rotationFor(entry.id);
  const showHoverDetails = interactive && hovered;
  const boosted = entry.rating === 5 && !selected;

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
        <div style={{ opacity: starsOpacity }}>
          <StarRating rating={entry.rating ?? 0} />
        </div>

        {isRecentlySynced(entry) && <div className={styles.badge}>NEW</div>}
      </div>

      <div className={`${styles.hoverDetails} ${showHoverDetails ? styles.visible : ""}`}>
        <div className={styles.hoverTitle}>{entry.title}</div>
        {entry.director && (
          <div className={styles.hoverDirector}>Directed by {entry.director}</div>
        )}
      </div>
    </div>
  );
}
