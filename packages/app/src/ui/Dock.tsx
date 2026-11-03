/**
 * Frame of the side and bottom panels of the workbench: folds a panel to a
 * thin rail (the results panel keeps its tab row) and resizes it by dragging
 * its edge, so the drawing can have the whole screen. The guided tour shows
 * every panel open while it runs; the viewer's layout comes back after it.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { DOCK_LIMITS, clampDockSize, useLayout, type DockId } from "../state/layout.ts";
import { useAppStore } from "../state/store.ts";

/** True when this panel is folded on screen (never while the tour is open). */
export function useDockFolded(id: DockId): boolean {
  const collapsed = useLayout((s) => s.collapsed[id]);
  const touring = useAppStore((s) => s.tourStep !== null);
  return collapsed && !touring;
}

type Direction = "left" | "right" | "up" | "down";

export function Chevron({ direction }: { direction: Direction }) {
  const rotate = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M4.5 2.5L8 6L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Which way the panel folds, for the chevron of its fold button. */
const FOLD_TOWARDS: Record<DockId, Direction> = { left: "left", right: "right", bottom: "down" };
const OPEN_TOWARDS: Record<DockId, Direction> = { left: "right", right: "left", bottom: "up" };

const KEY_STEP = 16;

function ResizeHandle({ id, label }: { id: DockId; label: string }) {
  const size = useLayout((s) => s.size[id]);
  const setDockSize = useLayout((s) => s.setDockSize);
  const drag = useRef<{ start: number; size: number; app: HTMLElement | null; last: number } | null>(null);
  const vertical = id !== "bottom";

  const sizeFrom = (e: PointerEvent<HTMLDivElement>): number => {
    const d = drag.current!;
    const delta = (vertical ? e.clientX : e.clientY) - d.start;
    // The left panel grows to the right; the right and bottom panels grow towards the view.
    const raw = id === "left" ? d.size + delta : d.size - delta;
    return clampDockSize(id, raw, { width: window.innerWidth, height: window.innerHeight });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: vertical ? e.clientX : e.clientY, size, app: e.currentTarget.closest<HTMLElement>(".app"), last: size };
    document.body.classList.add(vertical ? "resizing-x" : "resizing-y");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null) return;
    d.last = sizeFrom(e);
    // Live: only the grid track changes while dragging; the store gets the size on release.
    d.app?.style.setProperty(`--dock-${id}`, `${d.last}px`);
  };
  const end = () => {
    const d = drag.current;
    if (d === null) return;
    drag.current = null;
    document.body.classList.remove("resizing-x", "resizing-y");
    setDockSize(id, d.last);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const grow = id === "left" ? "ArrowRight" : id === "right" ? "ArrowLeft" : "ArrowUp";
    const shrink = id === "left" ? "ArrowLeft" : id === "right" ? "ArrowRight" : "ArrowDown";
    if (e.key === grow) setDockSize(id, size + step);
    else if (e.key === shrink) setDockSize(id, size - step);
    else if (e.key === "Home") setDockSize(id, DOCK_LIMITS[id].min);
    else if (e.key === "End") setDockSize(id, DOCK_LIMITS[id].max);
    else if (e.key === "Enter") setDockSize(id, DOCK_LIMITS[id].initial);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`dock-resize dock-resize-${id}`}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={`Tamaño de ${label}`}
      aria-valuenow={size}
      aria-valuemin={DOCK_LIMITS[id].min}
      aria-valuemax={DOCK_LIMITS[id].max}
      tabIndex={0}
      title="Arrastra para cambiar el tamaño · doble clic: tamaño inicial"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setDockSize(id, DOCK_LIMITS[id].initial)}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * One panel of the workbench. `label` names it for the fold button and the
 * rail; `rail` replaces the label on the rail of a folded side panel.
 */
export function Dock({ id, label, rail, children }: { id: DockId; label: string; rail?: ReactNode; children: ReactNode }) {
  const folded = useDockFolded(id);
  const touring = useAppStore((s) => s.tourStep !== null);
  const setCollapsed = useLayout((s) => s.setCollapsed);
  const side = id !== "bottom";
  const railRef = useRef<HTMLButtonElement>(null);
  const foldRef = useRef<HTMLButtonElement>(null);
  const toggledHere = useRef(false);
  const toggle = (next: boolean) => {
    toggledHere.current = true;
    setCollapsed(id, next);
  };
  // The button that was pressed disappears (rail ↔ fold button): keep the keyboard focus on its counterpart.
  useEffect(() => {
    if (!toggledHere.current) return;
    toggledHere.current = false;
    (railRef.current ?? foldRef.current)?.focus();
  }, [folded]);
  return (
    <div className={`dock dock-${id}${folded ? " folded" : ""}`}>
      {folded && side && (
        <button
          ref={railRef}
          type="button"
          className="dock-rail"
          onClick={() => toggle(false)}
          title={`Mostrar ${label}`}
          aria-expanded={false}
        >
          <Chevron direction={OPEN_TOWARDS[id]} />
          <span className="dock-rail-label">{rail ?? label}</span>
        </button>
      )}
      <div className="dock-body">{children}</div>
      {!touring && !(folded && side) && (
        <button
          ref={foldRef}
          type="button"
          className="dock-fold"
          onClick={() => toggle(!folded)}
          title={folded ? `Mostrar ${label}` : `Plegar ${label}`}
          aria-label={folded ? `Mostrar ${label}` : `Plegar ${label}`}
          aria-expanded={!folded}
        >
          <Chevron direction={folded ? OPEN_TOWARDS[id] : FOLD_TOWARDS[id]} />
        </button>
      )}
      {!folded && <ResizeHandle id={id} label={label} />}
    </div>
  );
}
