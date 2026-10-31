/**
 * The three-view sheet Claude looks at after each change: planta (top
 * left), perfil (top right), alzado (bottom left) at one common scale, as in
 * a three-view drawing, plus a panel of key numbers. Same screen
 * conventions as the app (planes.ts): planta nose up, perfil nose right,
 * alzado seen from the front (the right wing on the viewer's left).
 */
import { analysePlanform, elementBox, elementOutlines, projectToView, unionBox, type Box3, type Ring } from "../../app/src/planform/geometry.ts";
import type { PlanformElement, PlanformRole } from "../../app/src/planform/model.ts";
import { PLANE_SPECS, fromBody, planeToScreen, type PlaneId } from "../../app/src/planform/planes.ts";
import { Canvas, type Rgb } from "./png.ts";
import type { Project } from "./project.ts";

const FILL: Readonly<Record<PlanformRole, Rgb>> = {
  plate: [214, 186, 150],
  wing: [176, 196, 205],
  hole: [255, 255, 255],
  rotor: [61, 111, 143],
};
const INK: Rgb = [26, 34, 37];
const MUTED: Rgb = [120, 130, 134];
const GRID_MINOR: Rgb = [232, 236, 234];
const GRID_MAJOR: Rgb = [205, 212, 209];
const ACCENT: Rgb = [143, 95, 53];
const BAD: Rgb = [179, 55, 42];

const NAMES: Readonly<Record<PlaneId, string>> = { top: "PLANTA (DESDE ARRIBA)", side: "PERFIL (DESDE LA DERECHA)", front: "ALZADO (DESDE DELANTE)" };
const AXES: Readonly<Record<PlaneId, string>> = { top: "X ADELANTE ^  Y DERECHA >", side: "X ADELANTE >  Z ABAJO", front: "Y DERECHA <  Z ABAJO" };

interface Panel {
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Screen rectangle (m, screen axes) of a body box seen in a view. */
function screenExtent(plane: PlaneId, box: Box3) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const { u, v } = fromBody(plane, [x, y, z]);
    const [h, w] = planeToScreen(plane, u, v);
    minX = Math.min(minX, h);
    maxX = Math.max(maxX, h);
    minY = Math.min(minY, w);
    maxY = Math.max(maxY, w);
  }
  return { minX, maxX, minY, maxY };
}

const niceStep = (pxPerM: number, minPx: number): number => {
  for (const mm of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if ((mm / 1000) * pxPerM >= minPx) return mm / 1000;
  return 1;
};

export interface RenderOptions {
  /** Width of the whole sheet, px. */
  readonly width?: number;
}

export function renderThreeViews(project: Project, options: RenderOptions = {}): Buffer {
  const W = Math.max(600, Math.min(2400, Math.round(options.width ?? 1280)));
  const H = Math.round(W * 0.66);
  const c = new Canvas(W, H, [247, 248, 247]);
  const elements = project.planform.elements;
  const analysis = analysePlanform(project.planform);
  let box: Box3 | null = null;
  for (const e of elements) box = unionBox(box, elementBox(e));
  const panels: Panel[] = [
    { plane: "top", x: 0, y: 0, w: W / 2, h: H / 2 },
    { plane: "side", x: W / 2, y: 0, w: W / 2, h: H / 2 },
    { plane: "front", x: 0, y: H / 2, w: W / 2, h: H / 2 },
  ];
  // One scale for the three views.
  let scale = 3000; // px per m when empty: 1 px = 0.33 mm
  if (box !== null) {
    scale = Infinity;
    for (const p of panels) {
      const e = screenExtent(p.plane, box);
      scale = Math.min(scale, (p.w * 0.78) / Math.max(e.maxX - e.minX, 0.01), (p.h * 0.66) / Math.max(e.maxY - e.minY, 0.01));
    }
  }
  const invalid = new Set(analysis.issues.filter((i) => i.level === "red" && i.elementId !== undefined).map((i) => i.elementId));

  for (const p of panels) {
    const e = box === null ? { minX: -0.05, maxX: 0.05, minY: -0.05, maxY: 0.05 } : screenExtent(p.plane, box);
    const cx = (e.minX + e.maxX) / 2;
    const cy = (e.minY + e.maxY) / 2;
    const toPx = (u: number, v: number): [number, number] => {
      const [h, w] = planeToScreen(p.plane, u, v);
      return [p.x + p.w / 2 + (h - cx) * scale, p.y + p.h / 2 + 8 + (w - cy) * scale];
    };
    // Grid at a step of at least 12 px, major every 5 steps, origin axes.
    const step = niceStep(scale, 12);
    const x0 = cx - p.w / 2 / scale;
    const y0 = cy - (p.h / 2 + 8) / scale;
    for (let k = Math.ceil(x0 / step); k * step <= x0 + p.w / scale; k++) {
      const px = p.x + p.w / 2 + (k * step - cx) * scale;
      c.line(px, p.y, px, p.y + p.h, k % 5 === 0 ? GRID_MAJOR : GRID_MINOR);
    }
    for (let k = Math.ceil(y0 / step); k * step <= y0 + p.h / scale; k++) {
      const py = p.y + p.h / 2 + 8 + (k * step - cy) * scale;
      c.line(p.x, py, p.x + p.w, py, k % 5 === 0 ? GRID_MAJOR : GRID_MINOR);
    }
    const o = toPx(0, 0);
    if (o[0] > p.x && o[0] < p.x + p.w) c.line(o[0], p.y, o[0], p.y + p.h, MUTED);
    if (o[1] > p.y && o[1] < p.y + p.h) c.line(p.x, o[1], p.x + p.w, o[1], MUTED);

    // Other views' elements as dashed silhouettes.
    for (const el of elements) {
      if (el.plane === p.plane || el.role === "hole") continue;
      for (const out of elementOutlines(el)) {
        const ring = projectToView(el.plane, out.ring, out.offset, el.role === "rotor" ? 0 : el.thickness, p.plane);
        c.polyline(ring.map(([u, v]) => toPx(u, v)), el.role === "rotor" ? FILL.rotor : MUTED, 1, true, [4, 3]);
      }
    }
    // This view's elements: solids filled, holes white with a dashed red edge, rotors as discs.
    const own = elements.filter((el) => el.plane === p.plane);
    const order: PlanformRole[] = ["plate", "wing", "hole", "rotor"];
    for (const role of order) {
      for (const el of own.filter((x) => x.role === role)) drawElement(c, el, toPx, p.plane, invalid.has(el.id));
    }
    // Frame, title, axes and scale bar.
    c.polyline([[p.x, p.y], [p.x + p.w - 1, p.y], [p.x + p.w - 1, p.y + p.h - 1], [p.x, p.y + p.h - 1]], GRID_MAJOR);
    c.rect(p.x + 6, p.y + 6, NAMES[p.plane].length * 12 + 10, 20, [255, 255, 255]);
    c.text(p.x + 11, p.y + 9, NAMES[p.plane], INK, 2);
    c.text(p.x + 10, p.y + p.h - 18, AXES[p.plane], MUTED, 2);
    const bar = niceStep(scale, 60);
    const bx = p.x + p.w - 20 - bar * scale;
    const by = p.y + p.h - 14;
    c.line(bx, by, bx + bar * scale, by, INK, 2);
    c.line(bx, by - 4, bx, by + 4, INK, 2);
    c.line(bx + bar * scale, by - 4, bx + bar * scale, by + 4, INK, 2);
    c.text(bx, by - 22, `${Math.round(bar * 1000)} MM`, INK, 2);
  }

  // Key numbers.
  const lx = W / 2 + 16;
  let ly = H / 2 + 16;
  const line = (s: string, color: Rgb = INK) => {
    c.text(lx, ly, s.slice(0, Math.floor((W / 2 - 32) / 12)), color, 2);
    ly += 20;
  };
  line(project.name);
  ly += 6;
  if (analysis.box !== null) {
    const b = analysis.box;
    line(`ENVERGADURA ${mm(b.max[1] - b.min[1])} MM`);
    line(`LONGITUD ${mm(b.max[0] - b.min[0])} MM`);
    line(`ALTURA ${mm(b.max[2] - b.min[2])} MM`);
  }
  if (analysis.wing !== null) line(`ALA: S ${(analysis.wing.area * 1e4).toFixed(0)} CM2 AR ${analysis.wing.aspectRatio.toFixed(2)}`);
  if (analysis.vertical !== null) line(`DERIVAS: ${analysis.vertical.count} - ${(analysis.vertical.area * 1e4).toFixed(0)} CM2`);
  if (analysis.rotorSummary !== null) line(`HELICES: ${analysis.rotorSummary.count} - ENTRE EJES ${mm(analysis.rotorSummary.maxAxisDistance)} MM`);
  line(`ELEMENTOS: ${elements.length}  CAPAS: ${analysis.layers.length}`);
  const reds = analysis.issues.filter((i) => i.level === "red").length;
  const ambers = analysis.issues.length - reds;
  if (reds + ambers > 0) line(`AVISOS: ${reds} ERRORES, ${ambers} AVISOS`, reds > 0 ? BAD : ACCENT);
  ly += 10;
  line("ESCALA COMUN A LAS TRES VISTAS", MUTED);
  line("DISCONTINUO: LO DIBUJADO EN OTRA VISTA", MUTED);
  return c.toPng();
}

const mm = (m: number) => (m * 1000).toFixed(1);

function drawElement(c: Canvas, el: PlanformElement, toPx: (u: number, v: number) => [number, number], plane: PlaneId, invalid: boolean) {
  const outlines = elementOutlines(el).filter((o) => !(o.mirrored && PLANE_SPECS[plane].n === 1));
  for (const o of outlines) {
    const ring = o.ring.map(([u, v]) => toPx(u, v)) as Ring as [number, number][];
    if (el.role === "rotor") {
      c.fill([ring], FILL.rotor, 0.12);
      c.polyline(ring, FILL.rotor, 1.5);
      continue;
    }
    if (el.role === "hole") {
      c.fill([ring], [255, 255, 255], 0.85);
      c.polyline(ring, BAD, 1.5, true, [5, 3]);
      continue;
    }
    c.fill([ring], FILL[el.role], o.mirrored ? 0.75 : 1);
    c.polyline(ring, invalid ? BAD : INK, invalid ? 2.5 : 1.5, true, o.mirrored ? [6, 4] : null);
  }
}
