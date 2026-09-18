"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaEntry } from "@/lib/types";
import { animateValue, easeInOutCubic, lerp } from "@/lib/detailLayout";
import StarRating from "./StarRating";
import styles from "./Shelf.module.css";

/** Drawer height showing covers + stars only. */
const SNAP_PEEK = 196;
/** Drawer height showing covers + stars + title/note. */
const SNAP_OPEN = 380;
/** A little overdrag past fully-open, so the pull has some give at the top. */
const OVERDRAG = 40;
/** Title/note only earn their space once the drawer is well past peek. */
const META_AT = SNAP_PEEK + 60;
/** Pointer travel that separates a click from a drag. */
const DRAG_SLOP = 4;

/** The whole hide animation, which is also the length of the lift's
 *  swell-and-settle arc. */
const FLIGHT_MS = 600;
/** How long the card takes to actually cross to the shelf — shorter than the
 *  flight, so the lift reads on its own before the card is whisked away. It's
 *  delayed rather than slowed (see TRAVEL_DELAY_MS). */
const TRAVEL_MS = 380;
/** The travel is pushed to the *end* of the flight so the two finish together.
 *  They have to: if the swell hasn't returned to 1 by the time the card
 *  reaches its slot, it lands oversized and then visibly resizes. */
const TRAVEL_DELAY_MS = FLIGHT_MS - TRAVEL_MS;
/** How much the card swells as it leaves the mat — subtle, just enough to read
 *  as being picked up rather than as a size change. */
const LIFT_SCALE = 0.07;
/** How long the landed card sits there before the drawer closes again. */
const SETTLE_MS = 260;
/** How long the drawer takes to slide open or shut. Drives the inline
 *  transitions on the drawer and the pill, so the two can't drift apart. */
const SLIDE_MS = 420;

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * The card's swell during its flight: up to LIFT_SCALE and back to exactly 1
 * by the landing, so it settles onto its slot at true size.
 *
 * Raising progress to a fractional power front-loads the sine's arch, putting
 * the peak around a fifth of the way in — before the delayed travel has begun
 * at all. So the card swells sitting still on the mat, reading as being picked
 * up off it, holds near full swell for a beat, and is already deflating by the
 * time it's carried away.
 */
function liftAt(t: number): number {
  // Clamped because Math.pow with a fractional exponent returns NaN for a
  // negative base, and t can arrive a hair below zero: animateValue measures
  // against a performance.now() taken just before the loop starts, and a rAF
  // timestamp can predate that. An NaN here becomes an NaN width, which the
  // browser drops — flashing the poster at its full intrinsic size for a
  // frame before the next tick corrects it.
  const clamped = Math.min(1, Math.max(0, t));
  return 1 + LIFT_SCALE * Math.sin(Math.PI * Math.pow(clamped, 0.45));
}

/** A screen-space rectangle, in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the caller hands over when a card is hidden and needs to fly here. */
export interface Incoming {
  entry: MediaEntry;
  /** Where the card was sitting on the mat, in screen coordinates. */
  from: Rect;
}

/**
 * The admin-only shelf of hidden entries.
 *
 * The pill is the handle: click it to toggle, or drag it to any of three
 * heights. Cards inside come back to the mat two ways — drag one out and drop
 * it where you want it, or click it to return it to the position it had when
 * it was hidden.
 *
 * Nothing here lives in the panned/zoomed world; it's all screen-fixed, and
 * the drop point gets converted to world coordinates by the caller (the only
 * thing that knows the current pan and zoom).
 */
export default function Shelf({
  entries,
  onRestore,
  incoming,
  onIncomingLanded,
}: {
  entries: MediaEntry[];
  /** `drop` is a screen point when the card was dragged onto the mat, or null
   *  when it was clicked (restore to its stored position). */
  onRestore: (entry: MediaEntry, drop: { x: number; y: number } | null) => void;
  /** Set by the caller when a card has just been hidden: the drawer opens, the
   *  card flies from the mat into the first slot, then the drawer closes. */
  incoming: Incoming | null;
  /** Fires when the flight lands, so the caller can clear `incoming`. */
  onIncomingLanded: () => void;
}) {
  const [drawerH, setDrawerH] = useState(0);
  // Whether a pointer gesture is in flight. Gesture handlers must read the
  // ref, never the state: a pointermove can arrive before React has committed
  // the state change from pointerdown, and a handler closing over the stale
  // `false` would drop the move entirely (a quick flick got discarded whole).
  // The state exists only because render needs it, to suspend the snap
  // transition while dragging.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  // The card currently being dragged out, tracked with the cursor. Same split
  // and same reason: the ref gates the gesture, the state draws the ghost.
  const draggedRef = useRef<MediaEntry | null>(null);
  const [ghost, setGhost] = useState<{ entry: MediaEntry; x: number; y: number } | null>(null);
  // The in-flight rectangle of a card being hidden, while it animates.
  const [flight, setFlight] = useState<Rect | null>(null);

  const pillStart = useRef({ y: 0, h: 0 });
  const cardStart = useRef({ x: 0, y: 0 });
  const movedPastSlop = useRef(false);
  const slotRef = useRef<HTMLImageElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // The flight effect needs the drawer's current height but must not re-run
  // every time it changes, so it reads this instead of the state value.
  const drawerHRef = useRef(0);
  useEffect(() => {
    drawerHRef.current = drawerH;
  }, [drawerH]);

  const isOpen = drawerH > 0;
  const showMeta = drawerH > META_AT;
  // The arriving card's slot is reserved but hidden until the flight lands.
  const reservedId = flight ? incoming?.entry.id : null;

  /* ── the hide animation ──────────────────────────────────────────────── */

  // Runs once per hidden card. The entry is already at the front of `entries`
  // by the time this fires, so its slot is laid out and can be measured —
  // which beats deriving the position from the strip's padding, since it stays
  // correct as covers wrap and books take their own heights.
  useEffect(() => {
    if (!incoming) return;

    // Open at least to peek; if the drawer is already further open, leave it.
    const targetH = Math.max(drawerHRef.current, SNAP_PEEK);
    const slot = slotRef.current;

    // Show the top of the shelf, so a card arriving into the first slot is
    // actually in view even if the strip was scrolled down.
    if (stripRef.current) stripRef.current.scrollTop = 0;

    // Offsets are measured against the drawer (its nearest positioned
    // ancestor), so they describe where the slot sits *within* the drawer and
    // stay correct no matter how open it currently is — unlike a viewport
    // rect, which would be read mid-slide. The drawer is bottom-anchored, so
    // its top once open is simply innerHeight - targetH.
    const to: Rect = {
      x: slot?.offsetLeft ?? 24,
      y: window.innerHeight - targetH + (slot?.offsetTop ?? 12),
      w: slot?.offsetWidth || 100,
      // A cover that hasn't loaded yet reports no height; fall back to the
      // movie-poster height rather than flying into a zero-high sliver.
      // Keep in step with .cover's height in Shelf.module.css.
      h: slot?.offsetHeight || 150,
    };

    const from = incoming.from;
    setDrawerH(targetH);
    setFlight(from);

    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const cancel = animateValue(
      FLIGHT_MS,
      (t) => {
        // The lift runs across the whole flight; the travel occupies only its
        // last TRAVEL_MS, renormalised to its own 0..1 so the position easing
        // still gets a full curve rather than a clipped one.
        const travelT = Math.min(
          1,
          Math.max(0, (t * FLIGHT_MS - TRAVEL_DELAY_MS) / TRAVEL_MS)
        );
        const eased = easeInOutCubic(travelT);
        const w = lerp(from.w, to.w, eased);
        const h = lerp(from.h, to.h, eased);
        const lift = liftAt(t);
        const lw = w * lift;
        const lh = h * lift;
        setFlight({
          // Half the swell comes off the position so the card grows about its
          // own centre; scaling a top-left-anchored rect would shove it
          // down-right instead of lifting it in place.
          x: lerp(from.x, to.x, eased) - (lw - w) / 2,
          y: lerp(from.y, to.y, eased) - (lh - h) / 2,
          w: lw,
          h: lh,
        });
      },
      () => {
        setFlight(null);
        onIncomingLanded();
        // Let it sit visibly in the shelf for a beat before tidying up.
        closeTimer = setTimeout(() => setDrawerH(0), SETTLE_MS);
      },
      // Driven linearly: both the position easing and the lift curve are
      // applied per frame above, because the lift has to be keyed to elapsed
      // time rather than to how far the card has already travelled.
      (t) => t
    );

    return () => {
      cancel();
      if (closeTimer) clearTimeout(closeTimer);
    };
    // Only re-run when a new card is handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  /* ── pill: click to toggle, drag to resize ───────────────────────────── */

  function onPillDown(e: React.PointerEvent) {
    // The whole admin viewport pans on pointerdown, so this has to stop here.
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    movedPastSlop.current = false;
    pillStart.current = { y: e.clientY, h: drawerH };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPillMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    // Dragging up (a decreasing clientY) opens the drawer.
    const delta = pillStart.current.y - e.clientY;
    if (Math.abs(delta) > DRAG_SLOP) movedPastSlop.current = true;
    setDrawerH(Math.max(0, Math.min(SNAP_OPEN + OVERDRAG, pillStart.current.h + delta)));
  }

  function onPillUp(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    setDragging(false);
    if (!movedPastSlop.current) {
      // Treated as a click: toggle between closed and peek.
      setDrawerH(isOpen ? 0 : SNAP_PEEK);
      return;
    }
    // Snap to whichever rest height the release landed nearest.
    setDrawerH((h) => {
      if (h < SNAP_PEEK * 0.45) return 0;
      if (h < (SNAP_PEEK + SNAP_OPEN) / 2) return SNAP_PEEK;
      return SNAP_OPEN;
    });
  }

  /* ── cards: drag out onto the mat, or click to put back ──────────────── */

  function onCardDown(entry: MediaEntry, e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    cardStart.current = { x: e.clientX, y: e.clientY };
    movedPastSlop.current = false;
    draggedRef.current = entry;
    setGhost({ entry, x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCardMove(e: React.PointerEvent) {
    if (!draggedRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - cardStart.current.x;
    const dy = e.clientY - cardStart.current.y;
    if (Math.hypot(dx, dy) > DRAG_SLOP) movedPastSlop.current = true;
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : null));
  }

  function onCardUp(e: React.PointerEvent) {
    const entry = draggedRef.current;
    if (!entry) return;
    e.stopPropagation();
    draggedRef.current = null;
    setGhost(null);

    if (!movedPastSlop.current) {
      onRestore(entry, null);
      return;
    }
    // Released above the drawer's top edge means it was dropped on the mat.
    // Released inside the drawer is a cancel — the card just stays put.
    if (e.clientY < window.innerHeight - drawerH) {
      onRestore(entry, { x: e.clientX, y: e.clientY });
    }
  }

  return (
    <>
      <div
        className={styles.vignette}
        // Scales in with the drawer so it never dims the mat while arranging.
        style={{ opacity: Math.min(1, drawerH / SNAP_PEEK) }}
      />

      <div
        data-shelf
        className={styles.drawer}
        style={{
          height: drawerH,
          transition: dragging ? "none" : `height ${SLIDE_MS}ms ${EASE}`,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        // Keeps a drag on the drawer's own background from panning the mat.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {entries.length === 0 ? (
          <div className={styles.empty}>nothing hidden — the shelf is empty</div>
        ) : (
          <div
            ref={stripRef}
            className={styles.strip}
            style={{ opacity: drawerH < 50 ? 0 : 1, transition: "opacity 0.15s" }}
          >
            {entries.map((entry, i) => (
              <div key={entry.id} className={styles.item}>
                {/* draggable={false} because the browser's own image drag would
                    otherwise pre-empt the pointer gesture (same fix the book
                    card on the mat needed). */}
                <img
                  ref={i === 0 ? slotRef : undefined}
                  className={`${styles.cover} ${
                    entry.media_type === "book" ? styles.coverBook : ""
                  } ${entry.id === reservedId ? styles.slotReserved : ""}`}
                  src={entry.cover_url ?? undefined}
                  alt={entry.title}
                  draggable={false}
                  title={`Drag ${entry.title} onto the mat, or click to put it back`}
                  onPointerDown={(e) => onCardDown(entry, e)}
                  onPointerMove={onCardMove}
                  onPointerUp={onCardUp}
                  onPointerCancel={onCardUp}
                />
                <StarRating rating={entry.rating ?? 0} size={11} />
                {showMeta && (
                  <div className={styles.meta}>
                    <div className={styles.metaTitle}>{entry.title}</div>
                    {/* Always rendered, even with nothing to say. The row
                        bottom-aligns whole columns, so an entry with no review
                        would otherwise be one line shorter below its cover and
                        sit lower than its neighbours, breaking the shelf
                        baseline the alignment exists to create. */}
                    <div className={styles.metaNote}>{entry.review_text ?? ""}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        data-shelf
        className={styles.pillDock}
        style={{
          bottom: drawerH,
          transition: dragging ? "none" : `bottom ${SLIDE_MS}ms ${EASE}`,
        }}
        onPointerDown={onPillDown}
        onPointerMove={onPillMove}
        onPointerUp={onPillUp}
        onPointerCancel={onPillUp}
      >
        <div className={styles.pill}>
          <div className={styles.grabber} />
          <div className={styles.pillLabel}>
            {isOpen ? (
              <span>close shelf</span>
            ) : (
              <>
                <span>hidden entries</span>
                <span className={styles.pillDot}>·</span>
                <span>{entries.length}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {flight && incoming && (
        <img
          className={styles.flight}
          src={incoming.entry.cover_url ?? undefined}
          alt=""
          draggable={false}
          style={{ left: flight.x, top: flight.y, width: flight.w, height: flight.h }}
        />
      )}

      {ghost && (
        <img
          className={styles.ghost}
          src={ghost.entry.cover_url ?? undefined}
          alt=""
          draggable={false}
          style={{ left: ghost.x, top: ghost.y }}
        />
      )}
    </>
  );
}
