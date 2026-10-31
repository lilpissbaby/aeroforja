/**
 * Screen side of the editors: each view (planta, alzado, perfil) is a
 * cartesian plane drawn in SVG, in millimetres on screen.
 *
 * A point of the view's plane (u, v), metres, goes to screen millimetres
 * with planeToScreen (planes.ts): planta nose up, perfil nose to the right,
 * alzado seen from the front. Each is the true view along the plane's
 * normal, without reflection.
 */
import { boxOf, type Box3, type Vec2 } from "./geometry.ts";
import { fromBody, planeToScreen, screenToPlane, yCoordinate, type PlaneId } from "./planes.ts";

/** Plane point (m) → screen millimetres of its view. */
export const toScreenMm = (plane: PlaneId, p: Vec2): Vec2 => {
  const [h, v] = planeToScreen(plane, p[0], p[1]);
  return [h * 1000, v * 1000];
};
/** Screen millimetres of a view → plane point (m). */
export const fromScreenMm = (plane: PlaneId, s: Vec2): Vec2 => screenToPlane(plane, s[0] / 1000, s[1] / 1000);

/** Grid spacings in mm and the major spacing that goes with each. */
const GRID_STEPS: readonly (readonly [number, number])[] = [
  [0.5, 5],
  [1, 10],
  [2, 10],
  [5, 50],
  [10, 100],
  [20, 100],
  [50, 500],
  [100, 1000],
  [200, 1000],
  [500, 5000],
];

/** Finest grid whose minor lines are at least `minPixels` apart at this zoom (px per mm). */
export function gridFor(scale: number, minPixels = 8): { minor: number; major: number } {
  for (const [minor, major] of GRID_STEPS) {
    if (minor * scale >= minPixels) return { minor, major };
  }
  const last = GRID_STEPS[GRID_STEPS.length - 1]!;
  return { minor: last[0], major: last[1] };
}

export type SnapSetting = "off" | "auto" | number;

/** Snap step in metres, or null when snapping to the grid is off. */
export function snapStep(setting: SnapSetting, scale: number): number | null {
  if (setting === "off") return null;
  const mm = setting === "auto" ? gridFor(scale).minor : setting;
  return mm / 1000;
}

const roundTo = (v: number, step: number): number => {
  const r = Math.round(v / step) * step;
  // Clean binary noise (0.1 + 0.2) at the micrometre.
  const clean = Math.round(r * 1e6) / 1e6;
  return Object.is(clean, -0) ? 0 : clean;
};

export type SnapKind = "vertex" | "axis" | "grid" | "angle" | "none";

export interface SnapOptions {
  /** Grid step in metres, null for no grid snapping. */
  readonly step: number | null;
  /** Snap radius in metres (a few screen pixels at the current zoom). */
  readonly radius: number;
  /** Points to snap onto: vertices, circle centres, the draft's first point. */
  readonly targets: readonly Vec2[];
  /** Previous point of the line being drawn, for angle locking. */
  readonly from?: Vec2 | null;
  /** Lock the direction from `from` to multiples of 15°. */
  readonly lockAngle?: boolean;
  /** Which plane coordinate is y (snaps to the plane of symmetry y = 0), if any. */
  readonly symmetry?: 0 | 1 | null;
}

/**
 * Where a pointer position lands, in plane coordinates. Priority: an
 * existing vertex, then the angle lock, then the plane of symmetry (y = 0),
 * then the grid.
 */
export function snapPoint(p: Vec2, options: SnapOptions): { point: Vec2; kind: SnapKind } {
  let best: Vec2 | null = null;
  let bestDistance = options.radius;
  for (const t of options.targets) {
    const d = Math.hypot(t[0] - p[0], t[1] - p[1]);
    if (d <= bestDistance) {
      best = t;
      bestDistance = d;
    }
  }
  if (best !== null) return { point: best, kind: "vertex" };

  if (options.lockAngle === true && options.from != null) {
    const from = options.from;
    const dx = p[0] - from[0];
    const dy = p[1] - from[1];
    const step15 = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step15) * step15;
    let length = Math.hypot(dx, dy);
    if (options.step !== null) length = roundTo(length, options.step);
    return {
      point: [roundTo(from[0] + length * Math.cos(angle), 1e-6), roundTo(from[1] + length * Math.sin(angle), 1e-6)],
      kind: "angle",
    };
  }

  const q: [number, number] = [p[0], p[1]];
  let kind: SnapKind = "none";
  if (options.step !== null) {
    q[0] = roundTo(q[0], options.step);
    q[1] = roundTo(q[1], options.step);
    kind = "grid";
  }
  const axis = options.symmetry === undefined ? 1 : options.symmetry;
  if (axis !== null && Math.abs(p[axis]) <= options.radius) {
    q[axis] = 0;
    kind = "axis";
  }
  return { point: q, kind };
}

/** Lengths for the drawing: "1.234,5" with Spanish separators. */
const formatter = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const mm1 = (meters: number): string => {
  const v = meters * 1000;
  return formatter.format(Math.abs(v) < 0.05 ? 0 : v);
};

const intFormatter = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
/** Ruler labels in mm: no trailing ",0". */
export const rulerLabel = (millimeters: number): string => intFormatter.format(Math.abs(millimeters) < 1e-9 ? 0 : millimeters);

/** Direction of a segment in degrees, from +u towards +v (planta: 0° forward, 90° to the right). */
export const headingDegrees = (from: Vec2, to: Vec2): number => {
  const a = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return Math.abs(a) < 1e-9 ? 0 : a;
};

/** What an editor shows: its plane, centre in screen millimetres, zoom in px per mm and size in px. */
export interface Camera {
  readonly plane: PlaneId;
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly w: number;
  readonly h: number;
}

/** Plane point (m) → screen pixel inside the editor. */
export function project(cam: Camera, p: Vec2): Vec2 {
  const [sx, sy] = toScreenMm(cam.plane, p);
  return [(sx - cam.cx) * cam.scale + cam.w / 2, (sy - cam.cy) * cam.scale + cam.h / 2];
}

/** Screen pixel inside the editor → plane point (m). */
export function unproject(cam: Camera, q: Vec2): Vec2 {
  return fromScreenMm(cam.plane, [(q[0] - cam.w / 2) / cam.scale + cam.cx, (q[1] - cam.h / 2) / cam.scale + cam.cy]);
}

/** Screen-millimetre rectangle of a body box seen in a view. */
export function screenBox(plane: PlaneId, box: Box3): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const { u, v } = fromBody(plane, [x, y, z]);
        const [sx, sy] = toScreenMm(plane, [u, v]);
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Camera of a view that shows a body box (m) with room for the dimensions and the rulers. */
export function fitCamera(plane: PlaneId, box: Box3 | null, w: number, h: number): Camera {
  if (box === null || w <= 0 || h <= 0) return { plane, cx: 0, cy: 0, scale: w > 0 && h > 0 ? Math.min(w, h) / 400 : 1.5, w, h };
  const b = screenBox(plane, box);
  const width = Math.max(b.maxX - b.minX, 20);
  const height = Math.max(b.maxY - b.minY, 20);
  const scale = Math.min((w * 0.72) / width, (h * 0.7) / height);
  return { plane, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.min(Math.max(scale, 0.05), 200), w, h };
}

/** Index of y among the plane coordinates (for symmetry snapping), or null in the perfil. */
export function symmetryIndex(plane: PlaneId): 0 | 1 | null {
  const which = yCoordinate(plane);
  return which === "u" ? 0 : which === "v" ? 1 : null;
}

export { boxOf };
