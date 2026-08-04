"use client";

import { useEffect } from "react";
import type { MediaEntry } from "@/lib/types";
import { getDetailLayout } from "@/lib/detailLayout";
import StarRating from "./StarRating";
import ArrowIcon from "./ArrowIcon";
import styles from "./DetailsView.module.css";

export default function DetailsView({
  entry,
  posterH,
  opacity,
  viewportW,
  viewportH,
  onBack,
  onLeft,
  onRight,
  hasLeft,
  hasRight,
}: {
  entry: MediaEntry;
  /** On-screen poster height for this entry — fixed for movies (2:3), but
   *  variable for books, so the text column/nav row line up with the real
   *  poster bottom instead of an assumed 480px. See posterHeightFor. */
  posterH: number;
  /** 0 (hidden, mid-zoom) to 1 (fully settled) — text fades/slides in near the end of the camera move. */
  opacity: number;
  viewportW: number;
  viewportH: number;
  onBack: () => void;
  /** Arrows fly to the spatially nearest card in that direction on the mat. */
  onLeft: () => void;
  onRight: () => void;
  hasLeft: boolean;
  hasRight: boolean;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const { textLeft, textTop, textWidth, navTop, navRight } = getDetailLayout(
    viewportW,
    viewportH,
    posterH
  );
  const slide = (1 - opacity) * 12;

  // Books with no review get their own layout: no placeholder copy for the
  // missing review, just the rating rendered larger and moved below the
  // author line instead of squeezed into the title row (Figma:
  // book-details/finished-tag/empty-review).
  const isEmptyBook = entry.media_type === "book" && !entry.review_text;

  return (
    <>
      <div
        className={styles.text}
        style={{
          left: textLeft,
          top: textTop,
          width: textWidth,
          opacity,
          transform: `translateX(${slide}px)`,
        }}
      >
        <div className={styles.heading}>
          <div className={styles.titleBlock}>
            <div className={styles.title}>{entry.title}</div>
            {entry.director ? (
              <div className={styles.director}>Directed by {entry.director}</div>
            ) : (
              entry.author && <div className={styles.director}>Written by {entry.author}</div>
            )}
          </div>
          {!isEmptyBook && <StarRating rating={entry.rating ?? 0} />}
        </div>

        {isEmptyBook && <StarRating rating={entry.rating ?? 0} size={32} />}

        {entry.review_text && <div className={styles.review}>{entry.review_text}</div>}
      </div>

      <div
        className={styles.navRow}
        style={{ top: navTop, right: navRight, opacity }}
      >
        <button className={styles.iconButton} onClick={onLeft} disabled={!hasLeft}>
          <ArrowIcon direction="left" />
        </button>
        <button className={styles.iconButton} onClick={onRight} disabled={!hasRight}>
          <ArrowIcon direction="right" />
        </button>
      </div>

      <button className={styles.backButton} onClick={onBack} style={{ opacity }}>
        back to canvas
      </button>
    </>
  );
}
