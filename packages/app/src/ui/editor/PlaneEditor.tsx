/**
 * 2D editor of one view of the three-view drawing: planta (from above, nose
 * up), alzado (from the front) or perfil (from the right, nose to the
 * right), each a cartesian plane in millimetres with grid snapping,
 * dimensions and automatic symmetry, as the specification's editor asks
 * (own SVG).
 *
 * The elements of the other two views appear as dashed silhouettes so the
 * three views line up, and can be picked from here. Everything is stored in
 * SI and body axes FRD; screen conversions live in planform/view.ts and
 * planform/planes.ts.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { meters } from "@aeroforja/physics";
import { elementBox, elementOutlines, projectToView, unionBox, type Box3, type Ring, type Vec2 } from "../../planform/geometry.ts";
import {
  DEFAULT_THICKNESS,
  ROLE_LABELS,
  defaultOffset,
  planePoint,
  roundMicro,
  translateElement,
  uniqueElementId,
  type CircleElement,
  type Planform,
  type PlanformElement,
  type PlanformRole,
  type PolygonElement,
} from "../../planform/model.ts";
import { AXIS_NAMES, PLANE_SPECS, SCREEN_AXES, VIEW_DIMENSIONS, screenToPlane, type PlaneId } from "../../planform/planes.ts";
import {
  fitCamera,
  gridFor,
  headingDegrees,
  mm1,
  project,
  rulerLabel,
  screenBox,
  snapPoint,
  snapStep,
  symmetryIndex,
  unproject,
  type Camera,
  type SnapKind,
} from "../../planform/view.ts";
import { useAppStore, type Tool } from "../../state/store.ts";
import { usePlanformAnalysis } from "../planform/usePlanformAnalysis.ts";
import { chooseTool } from "./DrawToolbar.tsx";
import { usePartSilhouettes } from "./usePartSilhouettes.ts";

type Drag =
  | { kind: "pan"; startClient: Vec2; startView: ViewState; moved: boolean; clickClears: boolean }
  | { kind: "move"; id: string; mirrored: boolean; start: Vec2; startClient: Vec2; original: PlanformElement; moved: boolean }
  | { kind: "vertex"; id: string; index: number; startClient: Vec2; moved: boolean }
  | { kind: "radius"; id: string; startClient: Vec2; moved: boolean }
  | { kind: "rect"; a: Vec2 }
  | { kind: "circle"; c: Vec2 };

type Preview = { kind: "rect"; a: Vec2 } | { kind: "circle"; c: Vec2 } | null;

interface ViewState {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

/** Pixels a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
/** Snap radius on screen, px. */
const SNAP_PIXELS = 8;
/** Smallest shape the rectangle and circle tools create, m. */
const MIN_SIZE = 0.0005;

const ID_BASE: Readonly<Record<PlanformRole, string>> = { plate: "placa", wing: "ala", hole: "vaciado", rotor: "helice" };

const HINTS: Readonly<Record<Tool, string>> = {
  select:
    "Clic para elegir (también las siluetas discontinuas de las otras vistas); arrastra piezas, vértices (■) o puntos medios (+). Doble clic en un vértice lo borra. Flechas: mover; Av/Re Pág: mover el plano medio.",
  polygon:
    "Clic para añadir vértices. Cierra con clic en el primero, doble clic o Intro. Retroceso borra el último, Esc cancela, Mayús fija ángulos de 15°.",
  rect: "Arrastra de una esquina a la opuesta.",
  circle: "Pulsa en el centro y arrastra hasta el radio.",
};

const EMPTY_TEXT: Readonly<Record<PlaneId, string>> = {
  top: "Planta vacía. Dibuja con «Contorno», «Rectángulo» o «Círculo», o parte de una plantilla del panel izquierdo.",
  side: "Perfil vacío. Aquí van las derivas, el fuselaje visto de lado, los trenes y los soportes verticales.",
  front: "Alzado vacío. Aquí van las cuadernas, el diedro visto de frente y las hélices tractoras o propulsoras.",
};

const SNAP_NAMES: Readonly<Record<SnapKind, string>> = {
  vertex: "ajuste a vértice",
  axis: "ajuste al plano de simetría",
  grid: "ajuste a rejilla",
  angle: "ángulo fijado",
  none: "",
};

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r1 = (v: number): number => Math.round(v * 10) / 10;
const pts = (cam: Camera, ring: Ring): string => ring.map((p) => project(cam, p).map(r1).join(",")).join(" ");

function nextName(planform: Planform, role: PlanformRole): string {
  const count = planform.elements.filter((e) => e.role === role).length;
  return `${ROLE_LABELS[role].replace(" (disco)", "")} ${count + 1}`;
}

/** Body box of the whole drawing, every view and the imported parts. */
function drawingBox(planform: Planform, extra: Box3 | null): Box3 | null {
  let box: Box3 | null = extra;
  for (const e of planform.elements) box = unionBox(box, elementBox(e));
  return box;
}

/** Removes repeated consecutive points (a double click adds the last one twice). */
function cleanRing(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last === undefined || dist(last, p) > 1e-9) out.push(p);
  }
  while (out.length > 1 && dist(out[0]!, out[out.length - 1]!) <= 1e-9) out.pop();
  return out;
}

const replaceElement = (planform: Planform, element: PlanformElement): Planform => ({
  ...planform,
  elements: planform.elements.map((e) => (e.id === element.id ? element : e)),
});

/** A silhouette of an element of another view, in this view's plane coordinates. */
interface Ghost {
  readonly key: string;
  readonly elementId: string;
  readonly role: PlanformRole;
  readonly ring: Ring;
}

export interface PlaneEditorProps {
  readonly plane: PlaneId;
  /** The only 2D view on screen: it owns the keyboard without being the active view. */
  readonly exclusive: boolean;
  /** Smaller status line, for the three-view layout. */
  readonly compact?: boolean;
}

export function PlaneEditor({ plane, exclusive, compact = false }: PlaneEditorProps) {
  const spec = PLANE_SPECS[plane];
  const axes = SCREEN_AXES[plane];
  const sym = symmetryIndex(plane);
  const planform = useAppStore((s) => s.planform);
  const selectedId = useAppStore((s) => s.planSelectedId);
  const fitRequest = useAppStore((s) => s.fitRequest);
  const editor = useAppStore((s) => s.editor);
  const active = useAppStore((s) => s.editor.activePlane === plane);
  const analysis = usePlanformAnalysis();
  const parts = usePartSilhouettes(plane);
  const { tool, role, mirror: mirrorNew } = editor;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState | null>(null);
  const [cursor, setCursor] = useState<{ point: Vec2; kind: SnapKind } | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [activeVertex, setActiveVertex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cam: Camera = { plane, ...(view ?? { cx: 0, cy: 0, scale: 1.5 }), w: size.w, h: size.h };
  const step = snapStep(editor.snap, cam.scale);
  const snapRadius = SNAP_PIXELS / cam.scale / 1000;
  const selectedAny = planform.elements.find((e) => e.id === selectedId) ?? null;
  const selected = selectedAny !== null && selectedAny.plane === plane ? selectedAny : null;

  /** In-plane mirror image of a point about y = 0, when y is an in-plane axis. */
  const mirrorPoint = useCallback(
    (p: Vec2): Vec2 | null => (sym === 0 ? [-p[0], p[1]] : sym === 1 ? [p[0], -p[1]] : null),
    [sym],
  );

  // A new tool or another view starting a shape cancels this view's draft.
  useEffect(() => {
    setDraft([]);
    setPreview(null);
    dragRef.current = null;
  }, [tool, role]);

  useEffect(() => {
    if (notice === null) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // ---------- size and view ----------

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const partsBox = parts.box;
  const fit = useCallback(() => {
    const { planform: current } = useAppStore.getState();
    const c = fitCamera(plane, drawingBox(current, partsBox), size.w, size.h);
    setView({ cx: c.cx, cy: c.cy, scale: c.scale });
  }, [plane, size.w, size.h, partsBox]);

  useEffect(() => {
    if (view === null && size.w > 0 && size.h > 0) fit();
  }, [view, size.w, size.h, fit]);

  // Templates, opened files and the toolbar ask every view to frame the drawing.
  const lastFit = useRef(fitRequest);
  useEffect(() => {
    if (fitRequest !== lastFit.current && size.w > 0) {
      lastFit.current = fitRequest;
      fit();
    }
  }, [fitRequest, fit, size.w]);

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const qx = e.clientX - rect.left;
      const qy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setView((v) => {
        if (v === null) return v;
        const scale = Math.min(200, Math.max(0.05, v.scale * factor));
        const sx = (qx - rect.width / 2) / v.scale + v.cx;
        const sy = (qy - rect.height / 2) / v.scale + v.cy;
        return { scale, cx: sx - (qx - rect.width / 2) / scale, cy: sy - (qy - rect.height / 2) / scale };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ---------- what this view shows ----------

  const own = useMemo(() => planform.elements.filter((e) => e.plane === plane), [planform, plane]);

  const ghosts = useMemo(() => {
    const out: Ghost[] = [];
    for (const e of planform.elements) {
      if (e.plane === plane || e.role === "hole") continue;
      const thickness = e.role === "rotor" ? 0 : e.thickness;
      for (const o of elementOutlines(e)) {
        out.push({ key: `${e.id}-${o.mirrored}`, elementId: e.id, role: e.role, ring: projectToView(e.plane, o.ring, o.offset, thickness, plane) });
      }
    }
    return out;
  }, [planform, plane]);

  const snapTargets = useCallback(
    (exclude?: { id: string; index: number }): Vec2[] => {
      const out: Vec2[] = [];
      const add = (p: Vec2, mirrored: boolean) => {
        out.push(p);
        const m = mirrored ? mirrorPoint(p) : null;
        if (m !== null) out.push(m);
      };
      for (const e of own) {
        if (e.shape === "polygon") {
          e.points.forEach((p, i) => {
            if (exclude !== undefined && exclude.id === e.id && exclude.index === i) return;
            add([p.u, p.v], e.mirror);
          });
        } else add([e.center.u, e.center.v], e.mirror);
      }
      // Corners of the other views' silhouettes, to line the three views up.
      for (const g of ghosts) out.push(...g.ring);
      for (const g of parts.rings) out.push(...g.ring);
      return out;
    },
    [own, ghosts, parts.rings, mirrorPoint],
  );

  // ---------- creating elements ----------

  const createPolygon = (points: readonly Vec2[]) => {
    const clean = cleanRing(points);
    if (clean.length < 3) return;
    const r = role === "rotor" ? "plate" : role;
    const element: PolygonElement = {
      id: uniqueElementId(planform, ID_BASE[r]),
      name: nextName(planform, r),
      role: r,
      plane,
      shape: "polygon",
      mirror: mirrorNew,
      thickness: DEFAULT_THICKNESS,
      offset: defaultOffset(r, plane),
      points: clean.map(([u, v]) => planePoint(roundMicro(u), roundMicro(v))),
    };
    useAppStore.getState().addPlanElements([element]);
  };

  const createCircle = (c: Vec2, radius: number) => {
    if (role === "rotor" && plane === "side") {
      setNotice("Las hélices se dibujan en la planta (eje vertical, multirrotor) o en el alzado (tractora o propulsora).");
      return;
    }
    const element: CircleElement = {
      id: uniqueElementId(planform, ID_BASE[role]),
      name: nextName(planform, role),
      role,
      plane,
      shape: "circle",
      mirror: mirrorNew,
      thickness: DEFAULT_THICKNESS,
      offset: defaultOffset(role, plane),
      center: planePoint(roundMicro(c[0]), roundMicro(c[1])),
      radius: meters(roundMicro(radius)),
    };
    useAppStore.getState().addPlanElements([element]);
  };

  const finishDraft = () => {
    if (cleanRing(draft).length >= 3) createPolygon(draft);
    setDraft([]);
  };

  // ---------- pointer ----------

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const snapFor = (p: Vec2, shift: boolean): { point: Vec2; kind: SnapKind } => {
    const drag = dragRef.current;
    if (drag?.kind === "vertex") {
      return snapPoint(p, { step, radius: snapRadius, symmetry: sym, targets: snapTargets({ id: drag.id, index: drag.index }) });
    }
    if (tool === "polygon") {
      return snapPoint(p, {
        step,
        radius: snapRadius,
        symmetry: sym,
        targets: [...snapTargets(), ...draft],
        from: draft[draft.length - 1] ?? null,
        lockAngle: shift,
      });
    }
    return snapPoint(p, { step, radius: snapRadius, symmetry: sym, targets: snapTargets() });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (view === null) return;
    const store = useAppStore.getState();
    if (store.editor.activePlane !== plane) store.setEditor({ activePlane: plane });
    const q = local(e);
    const p = unproject(cam, q);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      dragRef.current = { kind: "pan", startClient: q, startView: view, moved: false, clickClears: false };
      return;
    }
    if (e.button !== 0) return;
    const snapped = snapFor(p, e.shiftKey);

    if (tool === "polygon") {
      const first = draft[0];
      if (draft.length >= 3 && first !== undefined && dist(snapped.point, first) <= snapRadius) finishDraft();
      else setDraft([...draft, snapped.point]);
      return;
    }
    if (tool === "rect") {
      dragRef.current = { kind: "rect", a: snapped.point };
      setPreview({ kind: "rect", a: snapped.point });
      return;
    }
    if (tool === "circle") {
      dragRef.current = { kind: "circle", c: snapped.point };
      setPreview({ kind: "circle", c: snapped.point });
      return;
    }

    // Select tool.
    const target = (e.target as Element).closest("[data-handle],[data-element],[data-silhouette]");
    const handle = target?.getAttribute("data-handle") ?? null;
    const elementId = target?.getAttribute("data-element") ?? null;
    const silhouetteId = target?.getAttribute("data-silhouette") ?? null;
    if (handle !== null && selected !== null) {
      const index = Number(target?.getAttribute("data-index") ?? "-1");
      if (handle === "vertex") {
        setActiveVertex(index);
        dragRef.current = { kind: "vertex", id: selected.id, index, startClient: q, moved: false };
        return;
      }
      if (handle === "mid" && selected.shape === "polygon") {
        const a = selected.points[index]!;
        const b = selected.points[(index + 1) % selected.points.length]!;
        const mid = planePoint(roundMicro((a.u + b.u) / 2), roundMicro((a.v + b.v) / 2));
        const points = [...selected.points.slice(0, index + 1), mid, ...selected.points.slice(index + 1)];
        store.beginPlanGesture();
        store.setPlanformLive(replaceElement(planform, { ...selected, points }));
        setActiveVertex(index + 1);
        dragRef.current = { kind: "vertex", id: selected.id, index: index + 1, startClient: q, moved: true };
        return;
      }
      if (handle === "center") {
        dragRef.current = { kind: "move", id: selected.id, mirrored: false, start: p, startClient: q, original: selected, moved: false };
        return;
      }
      if (handle === "radius") {
        dragRef.current = { kind: "radius", id: selected.id, startClient: q, moved: false };
        return;
      }
    }
    if (elementId !== null) {
      const element = planform.elements.find((el) => el.id === elementId);
      if (element === undefined) return;
      store.selectPlanElement(elementId);
      if (elementId !== selectedId) setActiveVertex(null);
      dragRef.current = {
        kind: "move",
        id: elementId,
        mirrored: target?.getAttribute("data-mirrored") === "true",
        start: p,
        startClient: q,
        original: element,
        moved: false,
      };
      return;
    }
    if (silhouetteId !== null) {
      // Elements of other views are picked here and edited in their own view.
      store.selectPlanElement(silhouetteId);
      setActiveVertex(null);
      return;
    }
    dragRef.current = { kind: "pan", startClient: q, startView: view, moved: false, clickClears: true };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (view === null) return;
    const q = local(e);
    const p = unproject(cam, q);
    const snapped = snapFor(p, e.shiftKey);
    setCursor(snapped);
    const drag = dragRef.current;
    if (drag === null) return;
    const store = useAppStore.getState();
    const current = store.planform;

    switch (drag.kind) {
      case "pan": {
        const dx = q[0] - drag.startClient[0];
        const dy = q[1] - drag.startClient[1];
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragRef.current = { ...drag, moved: true };
        setView({ ...drag.startView, cx: drag.startView.cx - dx / drag.startView.scale, cy: drag.startView.cy - dy / drag.startView.scale });
        return;
      }
      case "move": {
        if (!drag.moved) {
          if (dist(q, drag.startClient) < DRAG_THRESHOLD) return;
          store.beginPlanGesture();
          dragRef.current = { ...drag, moved: true };
        }
        let du = p[0] - drag.start[0];
        let dv = p[1] - drag.start[1];
        if (step !== null) {
          du = Math.round(du / step) * step;
          dv = Math.round(dv / step) * step;
        }
        // Dragging the mirror image moves the original the mirrored way.
        if (drag.mirrored && sym === 0) du = -du;
        if (drag.mirrored && sym === 1) dv = -dv;
        store.setPlanformLive(replaceElement(current, translateElement(drag.original, du, dv)));
        return;
      }
      case "vertex": {
        const element = current.elements.find((el) => el.id === drag.id);
        if (element?.shape !== "polygon") return;
        if (!drag.moved) {
          if (dist(q, drag.startClient) < DRAG_THRESHOLD) return;
          store.beginPlanGesture();
          dragRef.current = { ...drag, moved: true };
        }
        const points = element.points.map((pt, i) =>
          i === drag.index ? planePoint(roundMicro(snapped.point[0]), roundMicro(snapped.point[1])) : pt,
        );
        store.setPlanformLive(replaceElement(current, { ...element, points }));
        return;
      }
      case "radius": {
        const element = current.elements.find((el) => el.id === drag.id);
        if (element?.shape !== "circle") return;
        if (!drag.moved) {
          if (dist(q, drag.startClient) < DRAG_THRESHOLD) return;
          store.beginPlanGesture();
          dragRef.current = { ...drag, moved: true };
        }
        let radius = dist(p, [element.center.u, element.center.v]);
        if (step !== null) radius = Math.max(step, Math.round(radius / step) * step);
        store.setPlanformLive(replaceElement(current, { ...element, radius: meters(roundMicro(Math.max(radius, MIN_SIZE))) }));
        return;
      }
      case "rect":
      case "circle":
        return;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId) === true) svgRef.current.releasePointerCapture(e.pointerId);
    if (drag === null) return;
    // Where the button was released, not the last rendered cursor, which may lag one event behind.
    const end = view === null ? cursor?.point : snapFor(unproject(cam, local(e)), e.shiftKey).point;
    if (drag.kind === "pan" && !drag.moved && drag.clickClears) {
      useAppStore.getState().selectPlanElement(null);
      setActiveVertex(null);
    }
    if (drag.kind === "rect" && end !== undefined) {
      const [au, av] = drag.a;
      const [bu, bv] = end;
      if (Math.abs(bu - au) >= MIN_SIZE && Math.abs(bv - av) >= MIN_SIZE) {
        createPolygon([
          [au, av],
          [au, bv],
          [bu, bv],
          [bu, av],
        ]);
      }
      setPreview(null);
    }
    if (drag.kind === "circle" && end !== undefined) {
      const radius = dist(drag.c, end);
      if (radius >= MIN_SIZE) createCircle(drag.c, radius);
      setPreview(null);
    }
  };

  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (tool === "polygon") {
      finishDraft();
      return;
    }
    const target = (e.target as Element).closest("[data-handle='vertex']");
    if (target !== null && selected?.shape === "polygon" && selected.points.length > 3) {
      const index = Number(target.getAttribute("data-index"));
      useAppStore.getState().updatePlanElement(selected.id, (el) =>
        el.shape === "polygon" ? { ...el, points: el.points.filter((_, i) => i !== index) } : el,
      );
      setActiveVertex(null);
    }
  };

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = useAppStore.getState();
      // The guided tour owns the keyboard while it is open; with several views, the active one takes it.
      if (store.panel !== "planform" || store.tourStep !== null) return;
      if (!exclusive && store.editor.activePlane !== plane) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable='true']") != null) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redoPlan();
        else store.undoPlan();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.redoPlan();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        if (store.planSelectedId !== null) store.duplicatePlanElement(store.planSelectedId);
        return;
      }
      if (mod || e.altKey) return;
      const current = store.planform.elements.find((el) => el.id === store.planSelectedId);
      const amount = (step ?? 0.001) * (e.shiftKey ? 10 : 1);
      switch (e.key) {
        case "Escape":
          if (draft.length > 0) setDraft([]);
          else if (preview !== null) {
            setPreview(null);
            dragRef.current = null;
          } else if (store.planSelectedId !== null) store.selectPlanElement(null);
          else chooseTool("select");
          return;
        case "Enter":
          if (tool === "polygon") finishDraft();
          return;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          if (draft.length > 0) {
            setDraft(draft.slice(0, -1));
            return;
          }
          if (current === undefined) return;
          if (current.shape === "polygon" && current.plane === plane && activeVertex !== null && current.points.length > 3) {
            store.updatePlanElement(current.id, (el) =>
              el.shape === "polygon" ? { ...el, points: el.points.filter((_, i) => i !== activeVertex) } : el,
            );
            setActiveVertex(null);
          } else {
            store.removePlanElement(current.id);
          }
          return;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (current === undefined || current.plane !== plane) return;
          e.preventDefault();
          const h = e.key === "ArrowRight" ? amount : e.key === "ArrowLeft" ? -amount : 0;
          const v = e.key === "ArrowDown" ? amount : e.key === "ArrowUp" ? -amount : 0;
          const [du, dv] = screenToPlane(plane, h, v);
          store.updatePlanElement(current.id, (el) => translateElement(el, du, dv));
          return;
        }
        case "PageUp":
        case "PageDown": {
          if (current === undefined || current.plane !== plane) return;
          e.preventDefault();
          store.updatePlanElement(current.id, (el) => translateElement(el, 0, 0, e.key === "PageUp" ? amount : -amount));
          return;
        }
      }
      switch (key) {
        case "v":
          chooseTool("select");
          return;
        case "p":
          chooseTool("polygon");
          return;
        case "r":
          chooseTool("rect");
          return;
        case "c":
          chooseTool("circle");
          return;
        case "f":
          store.requestFit();
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- drawing ----------

  const grid = useMemo(() => {
    if (size.w === 0 || view === null) return null;
    const { minor, major } = gridFor(cam.scale);
    const x0 = cam.cx - cam.w / 2 / cam.scale;
    const x1 = cam.cx + cam.w / 2 / cam.scale;
    const y0 = cam.cy - cam.h / 2 / cam.scale;
    const y1 = cam.cy + cam.h / 2 / cam.scale;
    let minorPath = "";
    let majorPath = "";
    const vLabels: { pos: number; value: number }[] = [];
    const hLabels: { pos: number; value: number }[] = [];
    const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;
    for (let k = Math.ceil(x0 / minor); k <= Math.floor(x1 / minor); k++) {
      const v = k * minor;
      const px = r1((v - cam.cx) * cam.scale + cam.w / 2);
      if (isMajor(v)) {
        majorPath += `M${px} 0V${cam.h}`;
        vLabels.push({ pos: px, value: axes.hSign * v });
      } else minorPath += `M${px} 0V${cam.h}`;
    }
    for (let k = Math.ceil(y0 / minor); k <= Math.floor(y1 / minor); k++) {
      const v = k * minor;
      const py = r1((v - cam.cy) * cam.scale + cam.h / 2);
      if (isMajor(v)) {
        majorPath += `M0 ${py}H${cam.w}`;
        hLabels.push({ pos: py, value: axes.vSign * v });
      } else minorPath += `M0 ${py}H${cam.w}`;
    }
    return { minorPath, majorPath, vLabels, hLabels, minor };
  }, [cam.cx, cam.cy, cam.scale, cam.w, cam.h, size.w, view, axes.hSign, axes.vSign]);

  const invalidIds = new Set(analysis.issues.filter((i) => i.level === "red" && i.elementId !== undefined).map((i) => i.elementId));
  const ordered = [
    ...own.filter((e) => e.role === "plate" || e.role === "wing"),
    ...own.filter((e) => e.role === "hole"),
    ...own.filter((e) => e.role === "rotor"),
  ];
  const origin = project(cam, [0, 0]);

  const shapeFor = (element: PlanformElement, mirrored: boolean, ring: Ring) => {
    const className = [
      "plan-el",
      element.role,
      mirrored ? "mirrored" : "",
      element.id === selectedId ? "selected" : "",
      invalidIds.has(element.id) ? "invalid" : "",
    ].join(" ");
    const common = { "data-element": element.id, "data-mirrored": String(mirrored), className };
    if (element.shape === "circle") {
      const centre: Vec2 = [element.center.u, element.center.v];
      const c = project(cam, mirrored ? (mirrorPoint(centre) ?? centre) : centre);
      const r = element.radius * 1000 * cam.scale;
      if (element.role === "rotor") {
        return (
          <g key={`${element.id}-${mirrored}`} {...common}>
            <circle cx={r1(c[0])} cy={r1(c[1])} r={r1(r)} className="rotor-fill" />
            <circle cx={r1(c[0])} cy={r1(c[1])} r={r1(r)} className="rotor-hit" />
            <path d={`M${r1(c[0] - 5)} ${r1(c[1])}H${r1(c[0] + 5)}M${r1(c[0])} ${r1(c[1] - 5)}V${r1(c[1] + 5)}`} className="rotor-axis" />
          </g>
        );
      }
      return <circle key={`${element.id}-${mirrored}`} {...common} cx={r1(c[0])} cy={r1(c[1])} r={r1(r)} />;
    }
    return <polygon key={`${element.id}-${mirrored}`} {...common} points={pts(cam, ring)} />;
  };

  // In the perfil the mirror image of an element sits behind it (same outline at −y): draw it once.
  const outlinesOf = (element: PlanformElement) =>
    elementOutlines(element).filter((o) => !(o.mirrored && sym === null));

  const dimensions = (() => {
    const box = unionBox(analysis.box, parts.box);
    if (box === null || draft.length > 0 || preview !== null || view === null) return null;
    const b = screenBox(plane, box);
    const X = (sx: number) => (sx - cam.cx) * cam.scale + cam.w / 2;
    const Y = (sy: number) => (sy - cam.cy) * cam.scale + cam.h / 2;
    const left = X(b.minX);
    const right = X(b.maxX);
    const top = Y(b.minY);
    const bottom = Y(b.maxY);
    const yLine = bottom + 26;
    const xLine = left - 26;
    const names = VIEW_DIMENSIONS[plane];
    return (
      <g className="plan-dim" aria-hidden="true">
        <path d={`M${r1(left)} ${r1(bottom + 4)}V${r1(yLine + 6)}M${r1(right)} ${r1(bottom + 4)}V${r1(yLine + 6)}`} className="ext" />
        <line x1={r1(left)} y1={r1(yLine)} x2={r1(right)} y2={r1(yLine)} markerStart="url(#plan-arrow)" markerEnd="url(#plan-arrow)" />
        <text x={r1((left + right) / 2)} y={r1(yLine + 16)} textAnchor="middle" className="plan-text">
          {`${names.horizontal} ${mm1((b.maxX - b.minX) / 1000)} mm`}
        </text>
        <path d={`M${r1(left - 4)} ${r1(top)}H${r1(xLine - 6)}M${r1(left - 4)} ${r1(bottom)}H${r1(xLine - 6)}`} className="ext" />
        <line x1={r1(xLine)} y1={r1(top)} x2={r1(xLine)} y2={r1(bottom)} markerStart="url(#plan-arrow)" markerEnd="url(#plan-arrow)" />
        <text
          x={r1(xLine - 6)}
          y={r1((top + bottom) / 2)}
          textAnchor="middle"
          className="plan-text"
          transform={`rotate(-90 ${r1(xLine - 6)} ${r1((top + bottom) / 2)})`}
        >
          {`${names.vertical} ${mm1((b.maxY - b.minY) / 1000)} mm`}
        </text>
      </g>
    );
  })();

  const selectionOverlay = (() => {
    if (selected === null || tool !== "select") return null;
    if (selected.shape === "circle") {
      const centre: Vec2 = [selected.center.u, selected.center.v];
      const [du, dv] = screenToPlane(plane, selected.radius, 0);
      const c = project(cam, centre);
      const h = project(cam, [centre[0] + du, centre[1] + dv]);
      const inches = selected.role === "rotor" ? ` · ${((selected.radius * 2) / 0.0254).toFixed(1).replace(".", ",")}″` : "";
      return (
        <g className="plan-selection">
          <line x1={r1(c[0])} y1={r1(c[1])} x2={r1(h[0])} y2={r1(h[1])} className="radius-line" />
          <text x={r1((c[0] + h[0]) / 2)} y={r1(c[1] - 8)} textAnchor="middle" className="plan-text strong">
            {`Ø ${mm1(selected.radius * 2)} mm${inches}`}
          </text>
          <rect x={r1(c[0] - 5)} y={r1(c[1] - 5)} width={10} height={10} className="handle" data-handle="center" />
          <circle cx={r1(h[0])} cy={r1(h[1])} r={5.5} className="handle" data-handle="radius" />
        </g>
      );
    }
    const ring = selected.points.map((p) => [p.u, p.v] as Vec2);
    const screen = ring.map((p) => project(cam, p));
    const cx = screen.reduce((s, p) => s + p[0], 0) / screen.length;
    const cy = screen.reduce((s, p) => s + p[1], 0) / screen.length;
    return (
      <g className="plan-selection">
        {screen.map((a, i) => {
          const b = screen[(i + 1) % screen.length]!;
          const length = dist(ring[i]!, ring[(i + 1) % ring.length]!);
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const away = Math.hypot(mx - cx, my - cy) || 1;
          const lx = mx + ((mx - cx) / away) * 14;
          const ly = my + ((my - cy) / away) * 14 + 4;
          const screenLength = dist(a, b);
          return (
            <g key={`e${i}`}>
              {screenLength > 44 && (
                <text x={r1(lx)} y={r1(ly)} textAnchor="middle" className="plan-text edge">
                  {mm1(length)}
                </text>
              )}
              {screenLength > 26 && <circle cx={r1(mx)} cy={r1(my)} r={4} className="mid-handle" data-handle="mid" data-index={i} />}
            </g>
          );
        })}
        {screen.map((p, i) => (
          <rect
            key={`v${i}`}
            x={r1(p[0] - 4.5)}
            y={r1(p[1] - 4.5)}
            width={9}
            height={9}
            className={`handle${activeVertex === i ? " active" : ""}`}
            data-handle="vertex"
            data-index={i}
          />
        ))}
      </g>
    );
  })();

  const mirrorChain = (chain: readonly Vec2[]): Vec2[] | null => {
    if (!mirrorNew || sym === null) return null;
    return chain.map((p) => mirrorPoint(p)!);
  };

  const draftOverlay = (() => {
    const c = cursor?.point;
    if (tool === "polygon" && draft.length > 0) {
      const chain = c === undefined ? draft : [...draft, c];
      const screen = chain.map((p) => project(cam, p));
      const mirrored = mirrorChain(chain);
      const last = draft[draft.length - 1]!;
      const first = draft[0]!;
      const closing = c !== undefined && draft.length >= 3 && dist(c, first) <= snapRadius;
      const cs = c === undefined ? null : project(cam, c);
      return (
        <g className="plan-draft">
          {mirrored !== null && <polyline points={mirrored.map((p) => project(cam, p).map(r1).join(",")).join(" ")} className="mirror" />}
          <polyline points={screen.map((p) => p.map(r1).join(",")).join(" ")} />
          {draft.map((p, i) => {
            const s = project(cam, p);
            return <rect key={i} x={r1(s[0] - 3.5)} y={r1(s[1] - 3.5)} width={7} height={7} className={i === 0 && closing ? "close" : ""} />;
          })}
          {cs !== null && c !== undefined && (
            <text x={r1(cs[0] + 14)} y={r1(cs[1] - 12)} className="plan-text strong">
              {closing ? "Cerrar contorno" : `${mm1(dist(last, c))} mm · ${headingDegrees(last, c).toFixed(1).replace(".", ",")}°`}
            </text>
          )}
        </g>
      );
    }
    if (preview?.kind === "rect" && c !== undefined) {
      const ring: Ring = [preview.a, [preview.a[0], c[1]], c, [c[0], preview.a[1]]];
      const mirrored = mirrorChain(ring);
      const cs = project(cam, c);
      return (
        <g className="plan-draft">
          {mirrored !== null && <polygon points={pts(cam, mirrored)} className="mirror" />}
          <polygon points={pts(cam, ring)} />
          <text x={r1(cs[0] + 14)} y={r1(cs[1] - 12)} className="plan-text strong">
            {`${mm1(Math.abs(c[0] - preview.a[0]))} × ${mm1(Math.abs(c[1] - preview.a[1]))} mm`}
          </text>
        </g>
      );
    }
    if (preview?.kind === "circle" && c !== undefined) {
      const center = project(cam, preview.c);
      const r = dist(preview.c, c) * 1000 * cam.scale;
      const m = mirrorNew ? mirrorPoint(preview.c) : null;
      const mirrorCenter = m !== null && dist(m, preview.c) > 1e-9 ? project(cam, m) : null;
      const cs = project(cam, c);
      return (
        <g className="plan-draft">
          {mirrorCenter !== null && <circle cx={r1(mirrorCenter[0])} cy={r1(mirrorCenter[1])} r={r1(r)} className="mirror" />}
          <circle cx={r1(center[0])} cy={r1(center[1])} r={r1(r)} />
          <line x1={r1(center[0])} y1={r1(center[1])} x2={r1(cs[0])} y2={r1(cs[1])} />
          <text x={r1(cs[0] + 14)} y={r1(cs[1] - 12)} className="plan-text strong">
            {`Ø ${mm1(2 * dist(preview.c, c))} mm`}
          </text>
        </g>
      );
    }
    return null;
  })();

  const cursorMark = (() => {
    if (cursor === null || tool === "select") return null;
    const [x, y] = project(cam, cursor.point);
    if (cursor.kind === "vertex") return <rect x={r1(x - 6)} y={r1(y - 6)} width={12} height={12} className="plan-cursor" />;
    if (cursor.kind === "axis") return <path d={`M${r1(x)} ${r1(y - 7)}L${r1(x + 7)} ${r1(y)}L${r1(x)} ${r1(y + 7)}L${r1(x - 7)} ${r1(y)}Z`} className="plan-cursor" />;
    return <path d={`M${r1(x - 8)} ${r1(y)}H${r1(x + 8)}M${r1(x)} ${r1(y - 8)}V${r1(y + 8)}`} className="plan-cursor" />;
  })();

  const uName = AXIS_NAMES[spec.u];
  const vName = AXIS_NAMES[spec.v];

  return (
    <div className={`plan-editor plane-${plane}${active && !exclusive ? " active" : ""}${compact ? " compact" : ""}`}>
      <div className="plan-canvas-wrap" ref={wrapRef} data-tour="plan-canvas">
        <svg
          ref={svgRef}
          className={`plan-canvas tool-${tool}`}
          width={size.w}
          height={size.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => dragRef.current === null && setCursor(null)}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
          role="application"
          aria-label={`Plano cartesiano del ${spec.label.toLowerCase()}: el dron visto ${spec.seenFrom}`}
        >
          <defs>
            <pattern id="plan-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" className="hatch-line" />
            </pattern>
            <marker id="plan-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M0 1L9 5L0 9Z" className="arrow" />
            </marker>
          </defs>
          {grid !== null && (
            <g aria-hidden="true">
              <path d={grid.minorPath} className="grid-minor" />
              <path d={grid.majorPath} className="grid-major" />
              <line x1={r1(origin[0])} y1={0} x2={r1(origin[0])} y2={size.h} className="axis" />
              <line x1={0} y1={r1(origin[1])} x2={size.w} y2={r1(origin[1])} className="axis" />
              <text x={r1(origin[0] + 6)} y={axes.verticalAtTop ? 16 : size.h - 22} className="plan-text axis-label">
                {axes.vertical}
              </text>
              <text
                x={axes.horizontalAtRight ? size.w - 8 : 44}
                y={r1(origin[1] - 6)}
                textAnchor={axes.horizontalAtRight ? "end" : "start"}
                className="plan-text axis-label"
              >
                {axes.horizontal}
              </text>
              {grid.vLabels.filter((l) => l.pos > 36 && l.pos < size.w - 16).map((l) => (
                <text key={`v${l.value}`} x={l.pos} y={size.h - 6} textAnchor="middle" className="plan-text ruler">
                  {rulerLabel(l.value)}
                </text>
              ))}
              {grid.hLabels.filter((l) => l.pos > 24 && l.pos < size.h - 22).map((l) => (
                <text key={`h${l.value}`} x={6} y={l.pos - 3} className="plan-text ruler">
                  {rulerLabel(l.value)}
                </text>
              ))}
            </g>
          )}
          {view !== null && (
            <>
              <g className="plan-ghosts">
                {parts.rings.map((g) => (
                  <polygon
                    key={g.key}
                    points={pts(cam, g.ring)}
                    className={`plan-ghost part${g.partId === useAppStore.getState().partSelectedId ? " selected" : ""}`}
                    data-part={g.partId}
                  />
                ))}
                {ghosts.map((g) => (
                  <polygon
                    key={g.key}
                    points={pts(cam, g.ring)}
                    className={`plan-ghost ${g.role}${g.elementId === selectedId ? " selected" : ""}`}
                    data-silhouette={g.elementId}
                  />
                ))}
              </g>
              <g className="plan-elements">{ordered.flatMap((element) => outlinesOf(element).map((o) => shapeFor(element, o.mirrored, o.ring)))}</g>
              {dimensions}
              {selectionOverlay}
              {draftOverlay}
              {cursorMark}
            </>
          )}
        </svg>
        <span className="plan-view-name" aria-hidden="true">
          {spec.label} <small>{spec.seenFrom}</small>
        </span>
        {own.length === 0 && draft.length === 0 && (
          <p className={`plan-empty${ghosts.length > 0 || parts.rings.length > 0 ? " low" : ""}`}>{EMPTY_TEXT[plane]}</p>
        )}
      </div>
      <div className="plan-status" data-tour="plan-status">
        <span className="num">
          {cursor === null ? `${uName} — · ${vName} —` : `${uName} ${mm1(cursor.point[0])} mm · ${vName} ${mm1(cursor.point[1])} mm`}
        </span>
        {cursor !== null && SNAP_NAMES[cursor.kind] !== "" && <span className="snap">{SNAP_NAMES[cursor.kind]}</span>}
        {notice !== null && <span className="notice">{notice}</span>}
        {!compact && <span className="hint-text">{HINTS[tool]}</span>}
      </div>
    </div>
  );
}
