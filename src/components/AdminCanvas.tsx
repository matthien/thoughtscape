"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MediaEntry } from "@/lib/types";
import { animateValue, lerp } from "@/lib/detailLayout";
import { TITLE_POS, GRID_TILE_URL, centerPan } from "@/lib/mat";
import Card from "./Card";
import styles from "./AdminCanvas.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

export default function AdminCanvas({
  initialEntries,
}: {
  initialEntries: MediaEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // The "centered, 1x" pan target reset-view glides to. State (not a ref)
  // since it's read during render to decide whether to show the button.
  const [homePan, setHomePan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerOrigin = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const cardOrigin = useRef({ x: 0, y: 0 });
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);
  // Live values for the non-React wheel listener (a manual addEventListener
  // needs a ref to avoid a stale closure, same pattern as the public Canvas).
  const liveRef = useRef({ pan: { x: 0, y: 0 }, zoom: 1 });
  useEffect(() => {
    liveRef.current = { pan, zoom };
  });

  useLayoutEffect(() => {
    const home = centerPan();
    // centerPan() reads window size, so it can only run post-mount; that
    // makes this setState-in-an-effect unavoidable (same pattern as
    // Canvas.tsx's centerPan() call).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHomePan(home);
    setPan(home);
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom, anchored at the cursor, same math and easing as the public
  // canvas's zoom (see Canvas.tsx) so the two surfaces feel identical.
  const zoomTargetRef = useRef<{ x: number; y: number; scale: number } | null>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const base = zoomTargetRef.current ?? {
        ...liveRef.current.pan,
        scale: liveRef.current.zoom,
      };
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, base.scale * Math.exp(-e.deltaY * 0.0015))
      );
      if (nextZoom === base.scale) return;
      const worldX = (e.clientX - base.x) / base.scale;
      const worldY = (e.clientY - base.y) / base.scale;
      const target = {
        x: e.clientX - worldX * nextZoom,
        y: e.clientY - worldY * nextZoom,
        scale: nextZoom,
      };
      zoomTargetRef.current = target;

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
        }
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Reset glides pan and zoom home together, same 600ms ease as the public
  // canvas's reset-view.
  function resetView() {
    const from = { x: pan.x, y: pan.y, scale: zoom };
    const to = { ...homePan, scale: 1 };
    zoomTargetRef.current = null;
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

  const dx = pan.x - homePan.x;
  const dy = pan.y - homePan.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const threshold = Math.min(viewport.w, viewport.h) / 2;
  const showReset = distance > threshold || Math.abs(zoom - 1) > 0.15;

  function startCardDrag(i: number, e: React.PointerEvent) {
    // Keep the background pan handler from also engaging.
    e.stopPropagation();
    cancelAnimRef.current?.();
    zoomTargetRef.current = null;
    setDragIndex(i);
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
    cardOrigin.current = { x: entries[i].x, y: entries[i].y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: React.PointerEvent) {
    cancelAnimRef.current?.();
    zoomTargetRef.current = null;
    setPanning(true);
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = pan;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const dx = e.clientX - pointerOrigin.current.x;
    const dy = e.clientY - pointerOrigin.current.y;
    if (dragIndex !== null) {
      // Screen deltas are in scaled (zoomed) pixels but card x/y are world
      // coordinates, so the delta has to come back down by the zoom factor
      // — otherwise a card would drag faster/slower than the cursor at any
      // zoom other than 1x.
      const wdx = dx / zoom;
      const wdy = dy / zoom;
      setEntries((prev) =>
        prev.map((entry, i) =>
          i === dragIndex
            ? { ...entry, x: cardOrigin.current.x + wdx, y: cardOrigin.current.y + wdy }
            : entry
        )
      );
    } else if (panning) {
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }

  async function onPointerUp() {
    setPanning(false);
    if (dragIndex === null) return;
    const entry = entries[dragIndex];
    setDragIndex(null);

    setSaveState("saving");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    try {
      const res = await fetch("/api/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, x: entry.x, y: entry.y }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState("saved");
      savedTimer.current = setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
  }

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "sync failed");
      setSyncResult(
        `${body.inserted} new · ${body.updated} updated` +
          (body.directors ? ` · ${body.directors} directors added` : "")
      );
      // New/updated entries come from the server payload, so the simplest
      // correct refresh is a reload.
      if (body.inserted > 0 || body.updated > 0) {
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : "sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const statusLabel = {
    idle: "",
    saving: "saving…",
    saved: "saved",
    error: "save failed — try again",
  }[saveState];

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${panning ? styles.dragging : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className={styles.world}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <div className={styles.grid} style={{ backgroundImage: GRID_TILE_URL }} />

        <div className={styles.title} style={{ left: TITLE_POS.x, top: TITLE_POS.y }}>
          <div className={styles.titleMain}>matt&#39;s thoughtscape</div>
          <div className={styles.titleSub}>
            entryway to my opinions about different forms of media
          </div>
        </div>

        {entries.map((entry, i) => (
          <Card
            key={entry.id}
            entry={entry}
            interactive={false}
            onPosterPointerDown={(e) => startCardDrag(i, e)}
          />
        ))}
      </div>

      <div className={styles.adminBadge}>
        ADMIN MODE — drag cards to arrange
        {statusLabel && <span className={styles.saveStatus}> · {statusLabel}</span>}
        {syncResult && <span className={styles.saveStatus}> · {syncResult}</span>}
      </div>

      <button className={styles.syncButton} onClick={syncNow} disabled={syncing}>
        {syncing ? "syncing…" : "sync now"}
      </button>

      <button
        className={`${styles.resetButton} ${showReset ? styles.visible : ""}`}
        onClick={resetView}
      >
        reset view
      </button>

      <a className={styles.exitButton} href="/">
        back to live
      </a>
    </div>
  );
}
