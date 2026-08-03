"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MediaEntry } from "@/lib/types";
import {
  computeZoomTransform,
  animateValue,
  easeOutCubic,
  lerp,
  rotationFor,
  slugify,
} from "@/lib/detailLayout";
import { TITLE_POS, GRID_TILE_URL, centerPan } from "@/lib/mat";
import Card from "./Card";
import DetailsView from "./DetailsView";
import styles from "./Canvas.module.css";

const OPEN_CLOSE_DURATION = 700;
const NAVIGATE_DURATION = 450;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

type Phase = "idle" | "animating" | "details";
type Transform = { x: number; y: number; scale: number };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Canvas({ entries }: { entries: MediaEntry[] }) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // 0 = fully at the canvas, 1 = fully settled on the detail view. Drives
  // the selected card's tilt-to-flat and the detail text's fade/slide in,
  // independent of the camera's own x/y/scale tween.
  const [t, setT] = useState(0);
  const [animTransform, setAnimTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  // The "centered" pan target reset-view glides to. State (not a ref) since
  // it's read during render to decide whether to show the reset button.
  const [homePan, setHomePan] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  // The canvas camera (pan + wheel zoom) as it was when a detail view
  // opened, so closing restores it exactly.
  const fromCameraRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const cancelAnimRef = useRef<(() => void) | null>(null);

  // Latest values for the non-React wheel listener. Written in an effect
  // (not during render) so refs stay an escape hatch, not a render input.
  const liveRef = useRef({ pan: { x: 0, y: 0 }, zoom: 1, phase: "idle" as Phase });
  useEffect(() => {
    liveRef.current = { pan, zoom, phase };
  });

  useLayoutEffect(() => {
    const home = centerPan();
    // centerPan() reads window size, so it can only run post-mount; that
    // makes this setState-in-an-effect unavoidable (same pattern as
    // AdminCanvas's centerPan() call).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHomePan(home);
    fromCameraRef.current = { ...home, scale: 1 };
    setPan(home);
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resizing the window keeps whatever was at viewport center anchored
  // there: the pan shifts by half the size delta, and the home position
  // is recomputed so reset-view still means "title centered".
  useEffect(() => {
    let prev = { w: window.innerWidth, h: window.innerHeight };
    function onResize() {
      const next = { w: window.innerWidth, h: window.innerHeight };
      const dx = (next.w - prev.w) / 2;
      const dy = (next.h - prev.h) / 2;
      prev = next;
      setHomePan(centerPan());
      fromCameraRef.current = {
        x: fromCameraRef.current.x + dx,
        y: fromCameraRef.current.y + dy,
        scale: fromCameraRef.current.scale,
      };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setViewport(next);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Wheel zoom, anchored at the cursor so the point under the mouse stays
  // put. Attached manually because React's synthetic wheel handlers are
  // passive and can't preventDefault. Rather than stepping per tick, each
  // tick retargets a short eased glide (same curve as the click-to-detail
  // camera), so successive ticks accumulate into one smooth motion.
  const zoomTargetRef = useRef<Transform | null>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (liveRef.current.phase !== "idle") return;
      e.preventDefault();

      // Accumulate onto the in-flight target (if any), not the live value.
      const base = zoomTargetRef.current ?? {
        ...liveRef.current.pan,
        scale: liveRef.current.zoom,
      };
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, base.scale * Math.exp(-e.deltaY * 0.0015))
      );
      if (nextZoom === base.scale) return;
      // Keep the world point under the cursor fixed:
      // screen = pan + world * zoom  =>  world = (cursor - pan) / zoom
      const worldX = (e.clientX - base.x) / base.scale;
      const worldY = (e.clientY - base.y) / base.scale;
      const target: Transform = {
        x: e.clientX - worldX * nextZoom,
        y: e.clientY - worldY * nextZoom,
        scale: nextZoom,
      };
      zoomTargetRef.current = target;

      if (prefersReducedMotion()) {
        setPan({ x: target.x, y: target.y });
        setZoom(target.scale);
        zoomTargetRef.current = null;
        return;
      }

      const from = { ...liveRef.current.pan, scale: liveRef.current.zoom };
      cancelAnimRef.current?.();
      cancelAnimRef.current = animateValue(
        250,
        (eased) => {
          setPan({ x: lerp(from.x, target.x, eased), y: lerp(from.y, target.y, eased) });
          setZoom(lerp(from.scale, target.scale, eased));
        },
        () => {
          setPan({ x: target.x, y: target.y });
          setZoom(target.scale);
          zoomTargetRef.current = null;
        },
        // Each tick continues motion already underway (like a flick release),
        // so ease-out (no slow ramp-up) tracks continuous scrolling instead
        // of feeling perpetually a beat behind.
        easeOutCubic
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Deep-linking: /film/<slug> opens straight into the detail view (no
  // camera to animate from on a fresh load), and the browser's back/
  // forward buttons are kept in sync via popstate. The canvas itself is
  // never unmounted for any of this -- it's all just state.
  useEffect(() => {
    function applyFromPath() {
      const match = window.location.pathname.match(/^\/film\/(.+)$/);
      const idx = match ? entries.findIndex((e) => slugify(e.title) === match[1]) : -1;
      cancelAnimRef.current?.();
      if (idx !== -1) {
        setSelectedIndex(idx);
        setPhase("details");
        setT(1);
      } else {
        setSelectedIndex(null);
        setPhase("idle");
        setT(0);
        setPan({ x: fromCameraRef.current.x, y: fromCameraRef.current.y });
        setZoom(fromCameraRef.current.scale);
      }
    }
    applyFromPath();
    window.addEventListener("popstate", applyFromPath);
    return () => window.removeEventListener("popstate", applyFromPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function flyTo(
    from: Transform,
    to: Transform,
    fromT: number,
    toT: number,
    duration: number,
    onDone: () => void
  ) {
    cancelAnimRef.current?.();
    setPhase("animating");
    setAnimTransform(from);
    setT(fromT);
    cancelAnimRef.current = animateValue(
      duration,
      (eased) => {
        setAnimTransform({
          x: lerp(from.x, to.x, eased),
          y: lerp(from.y, to.y, eased),
          scale: lerp(from.scale, to.scale, eased),
        });
        setT(lerp(fromT, toT, eased));
      },
      () => {
        setAnimTransform(to);
        setT(toT);
        onDone();
      }
    );
  }

  function openDetails(i: number) {
    if (phase !== "idle") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const entry = entries[i];
    zoomTargetRef.current = null;
    fromCameraRef.current = { x: pan.x, y: pan.y, scale: zoom };
    setSelectedIndex(i);
    window.history.pushState({ selectedIndex: i }, "", `/film/${slugify(entry.title)}`);

    const from: Transform = { x: pan.x, y: pan.y, scale: zoom };
    const to = computeZoomTransform(entry.x, entry.y, vw, vh);

    if (prefersReducedMotion()) {
      setAnimTransform(to);
      setT(1);
      setPhase("details");
      return;
    }
    flyTo(from, to, 0, 1, OPEN_CLOSE_DURATION, () => setPhase("details"));
  }

  function closeDetails() {
    if (selectedIndex === null) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const entry = entries[selectedIndex];
    window.history.pushState(null, "", "/");

    const from = computeZoomTransform(entry.x, entry.y, vw, vh);
    const to: Transform = { ...fromCameraRef.current };

    function settle() {
      setPhase("idle");
      setSelectedIndex(null);
      setPan({ x: to.x, y: to.y });
      setZoom(to.scale);
    }

    if (prefersReducedMotion()) {
      setT(0);
      settle();
      return;
    }
    flyTo(from, to, 1, 0, OPEN_CLOSE_DURATION, settle);
  }

  function navigateToIndex(newIndex: number) {
    if (selectedIndex === null || newIndex === selectedIndex) return;
    if (newIndex < 0 || newIndex >= entries.length) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fromEntry = entries[selectedIndex];
    const toEntry = entries[newIndex];
    window.history.replaceState(
      { selectedIndex: newIndex },
      "",
      `/film/${slugify(toEntry.title)}`
    );

    const from = computeZoomTransform(fromEntry.x, fromEntry.y, vw, vh);
    const to = computeZoomTransform(toEntry.x, toEntry.y, vw, vh);
    setSelectedIndex(newIndex);

    if (prefersReducedMotion()) {
      setAnimTransform(to);
      setPhase("details");
      return;
    }
    flyTo(from, to, 1, 1, NAVIGATE_DURATION, () => setPhase("details"));
  }

  // Arrow navigation is spatial, not chronological: from the open card,
  // each arrow flies to the nearest card whose x lies in that direction.
  function nearestIndex(dir: -1 | 1): number | null {
    if (selectedIndex === null) return null;
    const cur = entries[selectedIndex];
    let best: number | null = null;
    let bestDist = Infinity;
    entries.forEach((e, i) => {
      if (i === selectedIndex) return;
      const dx = e.x - cur.x;
      if (dx * dir <= 0) return;
      const dist = Math.hypot(dx, e.y - cur.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  // Reset glides home (pan and zoom both) with the same easing as the
  // detail zoom, rather than snapping.
  function resetView() {
    const from = { x: pan.x, y: pan.y, scale: zoom };
    const to = { ...homePan, scale: 1 };
    zoomTargetRef.current = null;
    if (prefersReducedMotion()) {
      setPan({ x: to.x, y: to.y });
      setZoom(1);
      return;
    }
    cancelAnimRef.current?.();
    cancelAnimRef.current = animateValue(
      600,
      (eased) => {
        setPan({ x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) });
        setZoom(lerp(from.scale, to.scale, eased));
      },
      () => {
        setPan({ x: to.x, y: to.y });
        setZoom(1);
      }
    );
  }

  // Recent pointer velocity so releasing a drag mid-motion glides to a
  // stop (decelerating tail of the same easing family) instead of halting.
  const velocityRef = useRef({ vx: 0, vy: 0, t: 0 });
  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (selectedIndex !== null) return;
    // Grabbing the mat interrupts any in-flight glide (reset or zoom).
    cancelAnimRef.current?.();
    zoomTargetRef.current = null;
    setDragging(true);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = pan;
    lastMoveRef.current = null;
    velocityRef.current = { vx: 0, vy: 0, t: 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const now = performance.now();
    const last = lastMoveRef.current;
    if (last && now > last.t) {
      velocityRef.current = {
        vx: (e.clientX - last.x) / (now - last.t),
        vy: (e.clientY - last.y) / (now - last.t),
        t: now,
      };
    }
    lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
    setPan({
      x: panOrigin.current.x + (e.clientX - dragOrigin.current.x),
      y: panOrigin.current.y + (e.clientY - dragOrigin.current.y),
    });
  }

  function onPointerUp() {
    const wasDragging = dragging;
    setDragging(false);
    if (!wasDragging || prefersReducedMotion()) return;

    const { vx, vy, t: vt } = velocityRef.current;
    // Stale velocity means the hand paused before letting go — no flick.
    if (performance.now() - vt > 120) return;
    const speed = Math.hypot(vx, vy); // px/ms
    if (speed < 0.25) return;

    // Project the glide from release velocity, capped so a hard flick
    // can't launch the mat into the void.
    const distance = Math.min(speed * 320, 900);
    const from = { ...liveRef.current.pan };
    const to = {
      x: from.x + (vx / speed) * distance,
      y: from.y + (vy / speed) * distance,
    };
    cancelAnimRef.current?.();
    cancelAnimRef.current = animateValue(
      550,
      (eased) => {
        setPan({ x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) });
      },
      () => setPan(to),
      easeOutCubic
    );
  }

  // Viewport comes from state (updated on resize) so the detail layout
  // and camera math re-render when the window changes size.
  const vw = viewport.w;
  const vh = viewport.h;

  let camera: Transform;
  if (phase === "idle") {
    camera = { x: pan.x, y: pan.y, scale: zoom };
  } else if (phase === "animating") {
    camera = animTransform;
  } else {
    const entry = entries[selectedIndex!];
    camera = computeZoomTransform(entry.x, entry.y, vw, vh);
  }

  // Reset-view control only appears once you've wandered at least half a
  // screen from the default centered view, or zoomed meaningfully away
  // from 1:1.
  const dx = pan.x - homePan.x;
  const dy = pan.y - homePan.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const threshold = Math.min(vw, vh) / 2;
  const showReset =
    phase === "idle" && (distance > threshold || Math.abs(zoom - 1) > 0.15);

  // Text fades/slides in only during the last 40% of the open animation
  // (and symmetrically disappears first when closing).
  const textOpacity = Math.min(Math.max((t - 0.6) / 0.4, 0), 1);

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${dragging ? styles.dragging : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className={styles.world}
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        }}
      >
        <div
          className={styles.grid}
          style={{
            backgroundImage: GRID_TILE_URL,
            opacity: phase === "details" ? 0.3 : 1,
          }}
        />

        <div
          className={styles.title}
          style={{
            left: TITLE_POS.x,
            top: TITLE_POS.y,
            opacity: phase === "details" ? 0.08 : 1,
          }}
        >
          <div className={styles.titleMain}>matt&#39;s thoughtscape</div>
          <div className={styles.titleSub}>
            entryway to my opinions about different forms of media
          </div>
        </div>

        {entries.map((entry, i) => {
          const isSelected = i === selectedIndex;
          // In the details view, other cards peeking in from the edges stay
          // clickable and fly the camera straight to their own detail.
          const onClick =
            phase === "idle"
              ? () => openDetails(i)
              : phase === "details" && !isSelected
                ? () => navigateToIndex(i)
                : undefined;
          return (
            <Card
              key={entry.id}
              entry={entry}
              onClick={onClick}
              interactive={phase === "idle"}
              dimmed={phase === "details" && !isSelected}
              selected={isSelected}
              rotationOverrideDeg={
                isSelected && phase !== "idle" ? lerp(rotationFor(entry.id), 0, t) : undefined
              }
              starsOpacity={isSelected && phase !== "idle" ? 1 - t : 1}
            />
          );
        })}
      </div>

      {phase === "idle" && (
        <button
          className={`${styles.resetButton} ${showReset ? styles.visible : ""}`}
          onClick={resetView}
        >
          reset view
        </button>
      )}

      {selectedIndex !== null &&
        (() => {
          const leftTarget = nearestIndex(-1);
          const rightTarget = nearestIndex(1);
          return (
            <DetailsView
              entry={entries[selectedIndex]}
              opacity={textOpacity}
              viewportW={vw}
              viewportH={vh}
              onBack={closeDetails}
              onLeft={() => leftTarget !== null && navigateToIndex(leftTarget)}
              onRight={() => rightTarget !== null && navigateToIndex(rightTarget)}
              hasLeft={leftTarget !== null}
              hasRight={rightTarget !== null}
            />
          );
        })()}
    </div>
  );
}
