/**
 * Guided tour: dims the workbench, lights up one part of it and explains it
 * in a card next to it. Opens by itself the first time someone visits and
 * from the «Tour guiado» button afterwards. When it closes, the view, panel
 * and selection go back to what they were.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppStore, type Panel, type ViewMode } from "../../state/store.ts";
import { placeCard, type Box, type CardPosition } from "./position.ts";
import { TOUR_STEPS } from "./steps.tsx";

const SEEN_KEY = "aeroforja.tour.v1";
const PAD = 6;

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    // Without storage the tour would open on every visit; treat it as seen.
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "done");
  } catch {
    // Nothing to do: the button still opens the tour.
  }
}

interface Snapshot {
  readonly view: ViewMode;
  readonly panel: Panel;
  readonly planSelectedId: string | null;
  readonly selectedId: string | null;
}

const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

function findTarget(name: string | null): HTMLElement | null {
  if (name === null) return null;
  // Several parts can share a name (two export bars); use the first one that is on screen.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour() {
  const step = useAppStore((s) => s.tourStep);
  const setTourStep = useAppStore((s) => s.setTourStep);
  const endTour = useAppStore((s) => s.endTour);
  const [box, setBox] = useState<Box | null>(null);
  const [position, setPosition] = useState<CardPosition | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const returnFocus = useRef<Element | null>(null);

  const open = step !== null;
  const index = step === null ? 0 : Math.min(Math.max(step, 0), TOUR_STEPS.length - 1);
  const current = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  // Remember what the screen looked like, to put it back at the end. A layout
  // effect declared before the step's own setup, so it runs first.
  useLayoutEffect(() => {
    if (!open) return;
    const s = useAppStore.getState();
    snapshot.current = { view: s.view, panel: s.panel, planSelectedId: s.planSelectedId, selectedId: s.selectedId };
    returnFocus.current = document.activeElement;
    return () => {
      const saved = snapshot.current;
      snapshot.current = null;
      if (saved !== null) {
        const st = useAppStore.getState();
        st.setView(saved.view);
        st.setPanel(saved.panel);
        if (saved.panel === "mass") st.select(saved.selectedId);
        else st.selectPlanElement(saved.planSelectedId);
      }
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [open]);

  const close = useCallback(() => {
    markSeen();
    endTour();
  }, [endTour]);

  const go = useCallback(
    (to: number) => {
      if (to < 0) return;
      if (to >= TOUR_STEPS.length) close();
      else setTourStep(to);
    },
    [close, setTourStep],
  );

  // Set up the screen for this step and bring its target into view.
  useLayoutEffect(() => {
    if (!open) return;
    current.prepare?.();
    const frame = requestAnimationFrame(() => {
      findTarget(current.target)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    nextRef.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [open, current]);

  // Follow the target while it moves (panels resize, the 3D view loads, the window changes).
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let lastBox: Box | null = null;
    let lastKey = "";
    const measure = () => {
      const el = findTarget(current.target);
      const r = el?.getBoundingClientRect();
      const next: Box | null =
        r === undefined
          ? null
          : {
              x: Math.round(r.left) - PAD,
              y: Math.round(r.top) - PAD,
              width: Math.round(r.width) + 2 * PAD,
              height: Math.round(r.height) + 2 * PAD,
            };
      // Very tall or wide targets are clipped to the window so the card can sit beside what is visible.
      const clipped =
        next === null
          ? null
          : (() => {
              const x = Math.max(next.x, 0);
              const y = Math.max(next.y, 0);
              return {
                x,
                y,
                width: Math.min(next.x + next.width, window.innerWidth) - x,
                height: Math.min(next.y + next.height, window.innerHeight) - y,
              };
            })();
      const card = cardRef.current;
      const size = { width: card?.offsetWidth ?? 360, height: card?.offsetHeight ?? 200 };
      const key = `${window.innerWidth}x${window.innerHeight}:${size.width}x${size.height}`;
      if (!sameBox(clipped, lastBox) || key !== lastKey) {
        lastBox = clipped;
        lastKey = key;
        setBox(clipped);
        setPosition(
          placeCard(clipped, size, { width: window.innerWidth, height: window.innerHeight }, current.sides ?? undefined),
        );
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight" || (e.key === "Enter" && e.target === document.body)) {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    };
    // Capture, so the editor and the 3D viewer never see these keys while the tour is open.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, index, go, close]);

  if (!open) return null;

  const titleId = `tour-title-${current.id}`;
  return (
    <div className="tour" data-placement={position?.placement ?? "center"}>
      <div className="tour-backdrop" aria-hidden="true" onPointerDown={(e) => e.preventDefault()} />
      {box !== null ? (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={position === null ? { visibility: "hidden" } : { left: position.x, top: position.y }}
      >
        <div className="tour-progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>
        <p className="tour-count num">
          Paso {index + 1} de {TOUR_STEPS.length}
        </p>
        <h2 id={titleId}>{current.title}</h2>
        <div className="tour-body">{current.body}</div>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={close}>
              Salir del tour
            </button>
          )}
          <span className="spacer" />
          {index > 0 && (
            <button type="button" className="button" onClick={() => go(index - 1)}>
              Anterior
            </button>
          )}
          <button ref={nextRef} type="button" className="button primary" onClick={() => go(index + 1)}>
            {index === 0 ? "Empezar" : last ? "Terminar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
