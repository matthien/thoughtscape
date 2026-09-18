"use client";

import styles from "./Ruler.module.css";

/**
 * Ruler marks along the top and left edges of the viewport, matching the
 * Figma frame: plain small numbers (Inter 9px, #737378) rather than literal
 * tick lines.
 *
 * The ruler is a SCREEN-fixed overlay, not part of the world transform —
 * like a ruler taped along the edge of the mat rather than printed on it.
 * The numbers it prints are world coordinates, so panning scrolls them and
 * zooming spreads or compresses them. That means it can't just be a sibling
 * inside `.world`; it has to reverse the camera to figure out which world
 * coordinates are currently on screen.
 *
 * The camera maps world to screen as:  screen = pan + world * scale
 * so the inverse — what world coordinate sits at a given screen pixel — is:
 *                                      world  = (screen - pan) / scale
 */

// Candidate spacings in world px. All are multiples or divisors of the
// grid's 200px major spacing, so labels always land on a real grid line
// instead of floating between them.
const STEPS = [40, 200, 400, 1000, 2000];

// Don't let labels crowd: pick the smallest step whose on-screen spacing
// clears this, so the ruler thins out as you zoom out and gets finer as
// you zoom in.
const MIN_LABEL_GAP_PX = 90;

// Labels near the top-left corner would collide with each other, so the
// first stretch of each ruler is left blank.
const CORNER_CLEARANCE_PX = 28;

function stepFor(scale: number): number {
  return (
    STEPS.find((s) => s * scale >= MIN_LABEL_GAP_PX) ?? STEPS[STEPS.length - 1]
  );
}

/**
 * World coordinates of every ruler mark currently visible along one axis.
 * `pan` is that axis's camera offset, `length` the viewport's size on it.
 */
function marksFor(pan: number, scale: number, length: number): number[] {
  const step = stepFor(scale);
  const worldStart = (0 - pan) / scale;
  const worldEnd = (length - pan) / scale;
  // Round outward to the first/last step boundary in range.
  const first = Math.ceil(worldStart / step) * step;
  const marks: number[] = [];
  for (let w = first; w <= worldEnd; w += step) marks.push(w);
  return marks;
}

export default function Ruler({
  pan,
  scale,
  viewport,
  dimmed = false,
}: {
  pan: { x: number; y: number };
  scale: number;
  viewport: { w: number; h: number };
  /** Detail view fades the mat furniture back, same as the grid. */
  dimmed?: boolean;
}) {
  // Pre-mount (viewport 0x0) there's nothing to measure against yet.
  if (viewport.w === 0 || viewport.h === 0) return null;

  const xMarks = marksFor(pan.x, scale, viewport.w);
  const yMarks = marksFor(pan.y, scale, viewport.h);

  return (
    <div className={styles.ruler} style={{ opacity: dimmed ? 0.25 : 1 }}>
      {xMarks.map((world) => {
        const screen = pan.x + world * scale;
        if (screen < CORNER_CLEARANCE_PX) return null;
        return (
          <span
            key={`x${world}`}
            className={styles.markTop}
            style={{ left: screen }}
          >
            {world}
          </span>
        );
      })}
      {yMarks.map((world) => {
        const screen = pan.y + world * scale;
        if (screen < CORNER_CLEARANCE_PX) return null;
        return (
          <span
            key={`y${world}`}
            className={styles.markLeft}
            style={{ top: screen }}
          >
            {world}
          </span>
        );
      })}
    </div>
  );
}
