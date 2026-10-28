/**
 * 2D planform editor: the aircraft seen from above on a cartesian plane in
 * millimetres, nose up, as the specification's editor asks (own SVG, with
 * dimensions, grid snapping and automatic symmetry).
 *
 * Everything drawn is stored in SI and body axes FRD (x forward, y right);
 * the conversion to screen pixels lives in planform/view.ts.
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
import { elementBounds, elementOutlines, type Ring, type Vec2 } from "../../planform/geometry.ts";
import {
  DEFAULT_THICKNESS,
  ROLE_LABELS,
  defaultZ,
  planPoint,
  roundMicro,
  translateElement,
  uniqueElementId,
  type CircleElement,
  type Planform,
  type PlanformElement,
  type PlanformRole,
  type PolygonElement,
} from "../../planform/model.ts";
import {
  fitCamera,
  gridFor,
  headingDegrees,
  mm1,
  project,
  rulerLabel,
  snapPoint,
  snapStep,
  unproject,
  type Camera,
  type SnapKind,
  type SnapSetting,
} from "../../planform/view.ts";
import { useAppStore } from "../../state/store.ts";
import { usePlanformAnalysis } from "./usePlanformAnalysis.ts";

type Tool = "select" | "polygon" | "rect" | "circle";

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

const TOOL_LABELS: readonly (readonly [Tool, string, string])[] = [
  ["select", "Seleccionar", "V"],
  ["polygon", "Contorno", "P"],
  ["rect", "Rectángulo", "R"],
  ["circle", "Círculo", "C"],
];

const HINTS: Readonly<Record<Tool, string>> = {
  select:
    "Clic para elegir; arrastra piezas, vértices (■) o puntos medios (+) para añadir vértices. Doble clic en un vértice lo borra. Arrastra el fondo para desplazarte, rueda para el zoom.",
  polygon:
    "Clic para añadir vértices. Cierra con clic en el primero, doble clic o Intro. Retroceso borra el último, Esc cancela, Mayús fija ángulos de 15°.",
  rect: "Arrastra de una esquina a la opuesta.",
  circle: "Pulsa en el centro y arrastra hasta el radio.",
};

const SNAP_NAMES: Readonly<Record<SnapKind, string>> = {
  vertex: "ajuste a vértice",
  axis: "ajuste al eje de simetría",
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

function allBounds(planform: Planform) {
  let box: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  for (const e of planform.elements) {
    const b = elementBounds(e);
    box =
      box === null
        ? { ...b }
        : { minX: Math.min(box.minX, b.minX), maxX: Math.max(box.maxX, b.maxX), minY: Math.min(box.minY, b.minY), maxY: Math.max(box.maxY, b.maxY) };
  }
  return box;
}

function snapTargets(planform: Planform, exclude?: { id: string; index: number }): Vec2[] {
  const out: Vec2[] = [];
  for (const e of planform.elements) {
    if (e.shape === "polygon") {
      e.points.forEach((p, i) => {
        if (exclude !== undefined && exclude.id === e.id && exclude.index === i) return;
        out.push([p.x, p.y]);
        if (e.mirror) out.push([p.x, -p.y]);
      });
    } else {
      out.push([e.center.x, e.center.y]);
      if (e.mirror) out.push([e.center.x, -e.center.y]);
    }
  }
  return out;
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

export function PlanformEditor() {
  const planform = useAppStore((s) => s.planform);
  const selectedId = useAppStore((s) => s.planSelectedId);
  const fitRequest = useAppStore((s) => s.fitRequest);
  const canUndo = useAppStore((s) => s.planPast.length > 0);
  const canRedo = useAppStore((s) => s.planFuture.length > 0);
  const analysis = usePlanformAnalysis();

  const [tool, setToolState] = useState<Tool>("select");
  const [role, setRoleState] = useState<PlanformRole>("plate");
  const [mirrorNew, setMirrorNew] = useState(true);
  const [snapSetting, setSnapSetting] = useState<SnapSetting>("auto");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState | null>(null);
  const [cursor, setCursor] = useState<{ point: Vec2; kind: SnapKind } | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [activeVertex, setActiveVertex] = useState<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cam: Camera = { ...(view ?? { cx: 0, cy: 0, scale: 1.5 }), w: size.w, h: size.h };
  const step = snapStep(snapSetting, cam.scale);
  const snapRadius = SNAP_PIXELS / cam.scale / 1000;
  const selected = planform.elements.find((e) => e.id === selectedId) ?? null;

  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    setDraft([]);
    setPreview(null);
    dragRef.current = null;
    // A propeller disc is always a circle.
    if (next !== "circle" && next !== "select") setRoleState((r) => (r === "rotor" ? "plate" : r));
  }, []);

  const setRole = (next: PlanformRole) => {
    setRoleState(next);
    if (next === "rotor" && tool !== "circle") setTool("circle");
  };

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

  const fit = useCallback(() => {
    const { planform: current } = useAppStore.getState();
    const c = fitCamera(allBounds(current), size.w, size.h);
    setView({ cx: c.cx, cy: c.cy, scale: c.scale });
  }, [size.w, size.h]);

  useEffect(() => {
    if (view === null && size.w > 0 && size.h > 0) fit();
  }, [view, size.w, size.h, fit]);

  // Templates and opened files ask both views to frame the new drawing.
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

  // ---------- creating elements ----------

  const createPolygon = (points: readonly Vec2[], forcedRole?: PlanformRole) => {
    const clean = cleanRing(points);
    if (clean.length < 3) return;
    const r = forcedRole ?? (role === "rotor" ? "plate" : role);
    const element: PolygonElement = {
      id: uniqueElementId(planform, ID_BASE[r]),
      name: nextName(planform, r),
      role: r,
      shape: "polygon",
      mirror: mirrorNew,
      thickness: DEFAULT_THICKNESS,
      z: defaultZ(r),
      points: clean.map(([x, y]) => planPoint(roundMicro(x), roundMicro(y))),
    };
    useAppStore.getState().addPlanElements([element]);
  };

  const createCircle = (c: Vec2, radius: number) => {
    const element: CircleElement = {
      id: uniqueElementId(planform, ID_BASE[role]),
      name: nextName(planform, role),
      role,
      shape: "circle",
      mirror: mirrorNew,
      thickness: DEFAULT_THICKNESS,
      z: defaultZ(role),
      center: planPoint(roundMicro(c[0]), roundMicro(c[1])),
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
      return snapPoint(p, { step, radius: snapRadius, targets: snapTargets(planform, { id: drag.id, index: drag.index }) });
    }
    if (tool === "polygon") {
      return snapPoint(p, {
        step,
        radius: snapRadius,
        targets: [...snapTargets(planform), ...draft],
        from: draft[draft.length - 1] ?? null,
        lockAngle: shift,
      });
    }
    return snapPoint(p, { step, radius: snapRadius, targets: snapTargets(planform) });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (view === null) return;
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
    const store = useAppStore.getState();

    if (tool === "polygon") {
      const first = draft[0];
      if (draft.length >= 3 && first !== undefined && dist(snapped.point, first) <= snapRadius) {
        finishDraft();
      } else {
        setDraft([...draft, snapped.point]);
      }
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
    const target = (e.target as Element).closest("[data-handle],[data-element]");
    const handle = target?.getAttribute("data-handle") ?? null;
    const elementId = target?.getAttribute("data-element") ?? null;
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
        const mid = planPoint(roundMicro((a.x + b.x) / 2), roundMicro((a.y + b.y) / 2));
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
        let dx = p[0] - drag.start[0];
        let dy = p[1] - drag.start[1];
        if (step !== null) {
          dx = Math.round(dx / step) * step;
          dy = Math.round(dy / step) * step;
        }
        if (drag.mirrored) dy = -dy;
        store.setPlanformLive(replaceElement(current, translateElement(drag.original, dx, dy)));
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
          i === drag.index ? planPoint(roundMicro(snapped.point[0]), roundMicro(snapped.point[1])) : pt,
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
        let radius = dist(p, [element.center.x, element.center.y]);
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
      const [ax, ay] = drag.a;
      const [bx, by] = end;
      if (Math.abs(bx - ax) >= MIN_SIZE && Math.abs(by - ay) >= MIN_SIZE) {
        createPolygon([
          [ax, ay],
          [ax, by],
          [bx, by],
          [bx, ay],
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
      if (useAppStore.getState().panel !== "planform") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable='true']") != null) return;
      const store = useAppStore.getState();
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
      switch (e.key) {
        case "Escape":
          if (draft.length > 0) setDraft([]);
          else if (preview !== null) {
            setPreview(null);
            dragRef.current = null;
          } else if (store.planSelectedId !== null) store.selectPlanElement(null);
          else setTool("select");
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
          if (current.shape === "polygon" && activeVertex !== null && current.points.length > 3) {
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
          if (current === undefined) return;
          e.preventDefault();
          const amount = (step ?? 0.001) * (e.shiftKey ? 10 : 1);
          const dx = e.key === "ArrowUp" ? amount : e.key === "ArrowDown" ? -amount : 0;
          const dy = e.key === "ArrowRight" ? amount : e.key === "ArrowLeft" ? -amount : 0;
          store.updatePlanElement(current.id, (el) => translateElement(el, dx, dy));
          return;
        }
      }
      switch (key) {
        case "v":
          setTool("select");
          return;
        case "p":
          setTool("polygon");
          return;
        case "r":
          setTool("rect");
          return;
        case "c":
          setTool("circle");
          return;
        case "f":
          fit();
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
        vLabels.push({ pos: px, value: v });
      } else minorPath += `M${px} 0V${cam.h}`;
    }
    for (let k = Math.ceil(y0 / minor); k <= Math.floor(y1 / minor); k++) {
      const v = k * minor;
      const py = r1((v - cam.cy) * cam.scale + cam.h / 2);
      if (isMajor(v)) {
        majorPath += `M0 ${py}H${cam.w}`;
        hLabels.push({ pos: py, value: -v });
      } else minorPath += `M0 ${py}H${cam.w}`;
    }
    return { minorPath, majorPath, vLabels, hLabels, minor };
  }, [cam.cx, cam.cy, cam.scale, cam.w, cam.h, size.w, view]);

  const invalidIds = new Set(analysis.issues.filter((i) => i.level === "red" && i.elementId !== undefined).map((i) => i.elementId));
  const ordered = [
    ...planform.elements.filter((e) => e.role === "plate" || e.role === "wing"),
    ...planform.elements.filter((e) => e.role === "hole"),
    ...planform.elements.filter((e) => e.role === "rotor"),
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
      const c = project(cam, [element.center.x, mirrored ? -element.center.y : element.center.y]);
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

  const dimensions = (() => {
    const b = analysis.bounds;
    if (b === null || draft.length > 0 || preview !== null) return null;
    const leftFront = project(cam, [b.maxX, b.minY]);
    const rightFront = project(cam, [b.maxX, b.maxY]);
    const leftRear = project(cam, [b.minX, b.minY]);
    const yLine = leftFront[1] - 26;
    const xLine = leftFront[0] - 26;
    return (
      <g className="plan-dim" aria-hidden="true">
        <path d={`M${r1(leftFront[0])} ${r1(leftFront[1] - 4)}V${r1(yLine - 6)}M${r1(rightFront[0])} ${r1(rightFront[1] - 4)}V${r1(yLine - 6)}`} className="ext" />
        <line x1={r1(leftFront[0])} y1={r1(yLine)} x2={r1(rightFront[0])} y2={r1(yLine)} markerStart="url(#plan-arrow)" markerEnd="url(#plan-arrow)" />
        <text x={r1((leftFront[0] + rightFront[0]) / 2)} y={r1(yLine - 6)} textAnchor="middle" className="plan-text">
          {`Envergadura ${mm1(b.maxY - b.minY)} mm`}
        </text>
        <path d={`M${r1(leftFront[0] - 4)} ${r1(leftFront[1])}H${r1(xLine - 6)}M${r1(leftRear[0] - 4)} ${r1(leftRear[1])}H${r1(xLine - 6)}`} className="ext" />
        <line x1={r1(xLine)} y1={r1(leftFront[1])} x2={r1(xLine)} y2={r1(leftRear[1])} markerStart="url(#plan-arrow)" markerEnd="url(#plan-arrow)" />
        <text
          x={r1(xLine - 6)}
          y={r1((leftFront[1] + leftRear[1]) / 2)}
          textAnchor="middle"
          className="plan-text"
          transform={`rotate(-90 ${r1(xLine - 6)} ${r1((leftFront[1] + leftRear[1]) / 2)})`}
        >
          {`Longitud ${mm1(b.maxX - b.minX)} mm`}
        </text>
      </g>
    );
  })();

  const selectionOverlay = (() => {
    if (selected === null || tool !== "select") return null;
    if (selected.shape === "circle") {
      const c = project(cam, [selected.center.x, selected.center.y]);
      const h = project(cam, [selected.center.x, selected.center.y + selected.radius]);
      const inches = selected.role === "rotor" ? ` · ${(selected.radius * 2 / 0.0254).toFixed(1).replace(".", ",")}″` : "";
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
    const ring = selected.points.map((p) => [p.x, p.y] as Vec2);
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

  const draftOverlay = (() => {
    const c = cursor?.point;
    if (tool === "polygon" && draft.length > 0) {
      const chain = c === undefined ? draft : [...draft, c];
      const screen = chain.map((p) => project(cam, p));
      const mirrorScreen = mirrorNew ? chain.map(([x, y]) => project(cam, [x, -y])) : null;
      const last = draft[draft.length - 1]!;
      const first = draft[0]!;
      const closing = c !== undefined && draft.length >= 3 && dist(c, first) <= snapRadius;
      const cs = c === undefined ? null : project(cam, c);
      return (
        <g className="plan-draft">
          {mirrorScreen !== null && <polyline points={mirrorScreen.map((p) => p.map(r1).join(",")).join(" ")} className="mirror" />}
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
      const cs = project(cam, c);
      return (
        <g className="plan-draft">
          {mirrorNew && <polygon points={pts(cam, ring.map(([x, y]) => [x, -y] as Vec2))} className="mirror" />}
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
      const mirrorCenter = project(cam, [preview.c[0], -preview.c[1]]);
      const cs = project(cam, c);
      return (
        <g className="plan-draft">
          {mirrorNew && Math.abs(preview.c[1]) > 1e-9 && <circle cx={r1(mirrorCenter[0])} cy={r1(mirrorCenter[1])} r={r1(r)} className="mirror" />}
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

  return (
    <div className="plan-editor">
      <div className="plan-toolbar" role="toolbar" aria-label="Herramientas de la planta">
        <div className="seg" role="group" aria-label="Herramienta">
          {TOOL_LABELS.map(([id, label, key]) => (
            <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(id)} title={`${label} (${key})`}>
              {label}
            </button>
          ))}
        </div>
        <label className="inline">
          <span>Tipo</span>
          <select value={role} onChange={(e) => setRole(e.target.value as PlanformRole)}>
            {(["plate", "wing", "hole", "rotor"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={mirrorNew} onChange={(e) => setMirrorNew(e.target.checked)} />
          <span>Simetría</span>
        </label>
        <label className="inline">
          <span>Rejilla</span>
          <select
            value={String(snapSetting)}
            onChange={(e) => {
              const v = e.target.value;
              setSnapSetting(v === "off" || v === "auto" ? v : Number(v));
            }}
          >
            <option value="auto">auto ({mm1(gridFor(cam.scale).minor / 1000)} mm)</option>
            {[0.5, 1, 2, 5, 10].map((v) => (
              <option key={v} value={String(v)}>
                {String(v).replace(".", ",")} mm
              </option>
            ))}
            <option value="off">sin ajuste</option>
          </select>
        </label>
        <div className="seg" role="group" aria-label="Historial y vista">
          <button type="button" disabled={!canUndo} onClick={() => useAppStore.getState().undoPlan()} title="Deshacer (Ctrl+Z)">
            Deshacer
          </button>
          <button type="button" disabled={!canRedo} onClick={() => useAppStore.getState().redoPlan()} title="Rehacer (Ctrl+Y)">
            Rehacer
          </button>
          <button type="button" onClick={fit} title="Encuadrar (F)">
            Encuadrar
          </button>
        </div>
      </div>

      <div className="plan-canvas-wrap" ref={wrapRef}>
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
          aria-label="Plano cartesiano de la planta, vista desde arriba con el morro hacia arriba"
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
              <text x={r1(origin[0] + 6)} y={16} className="plan-text axis-label">
                x · adelante ↑
              </text>
              <text x={size.w - 8} y={r1(origin[1] - 6)} textAnchor="end" className="plan-text axis-label">
                y · derecha →
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
              <g className="plan-elements">
                {ordered.flatMap((element) => elementOutlines(element).map((o) => shapeFor(element, o.mirrored, o.ring)))}
              </g>
              {dimensions}
              {selectionOverlay}
              {draftOverlay}
              {cursorMark}
            </>
          )}
        </svg>
        {planform.elements.length === 0 && draft.length === 0 && (
          <p className="plan-empty">
            Planta vacía. Dibuja con «Contorno», «Rectángulo» o «Círculo», o parte de una plantilla del panel izquierdo.
          </p>
        )}
      </div>
      <div className="plan-status">
        <span className="num">
          {cursor === null ? "x — · y —" : `x ${mm1(cursor.point[0])} mm · y ${mm1(cursor.point[1])} mm`}
        </span>
        {cursor !== null && SNAP_NAMES[cursor.kind] !== "" && <span className="snap">{SNAP_NAMES[cursor.kind]}</span>}
        <span className="hint-text">{HINTS[tool]}</span>
      </div>
    </div>
  );
}

