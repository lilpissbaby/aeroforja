/**
 * Screen side of the planform editor: the cartesian plane drawn in SVG.
 *
 * The SVG works in millimetres with the nose up: a body point (x forward,
 * y right, metres) is drawn at svg (y·1000, −x·1000). Looking down on the
 * aircraft with x up and y to the right, z points into the screen, so this
 * is the FRD top view with no reflection.
 */
import type { Vec2 } from "./geometry.ts";

export const toSvg = (p: Vec2): Vec2 => [p[1] * 1000, -p[0] * 1000];
export const fromSvg = (s: Vec2): Vec2 => [-s[1] / 1000, s[0] / 1000];

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
}

/**
 * Where a pointer position lands. Priority: an existing vertex, then the
 * angle lock, then the plane of symmetry (y = 0), then the grid.
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

  let x = p[0];
  let y = p[1];
  let kind: SnapKind = "none";
  if (options.step !== null) {
    x = roundTo(x, options.step);
    y = roundTo(y, options.step);
    kind = "grid";
  }
  if (Math.abs(p[1]) <= options.radius) {
    y = 0;
    kind = "axis";
  }
  return { point: [x, y], kind };
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

/** Direction of a segment in degrees, 0° along +x (forward), 90° along +y (right). */
export const headingDegrees = (from: Vec2, to: Vec2): number => {
  const a = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return Math.abs(a) < 1e-9 ? 0 : a;
};

/** What the editor shows: centre of the view in SVG millimetres, zoom in px per mm, size in px. */
export interface Camera {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly w: number;
  readonly h: number;
}

/** Body point (m) → screen pixel inside the editor. */
export function project(cam: Camera, p: Vec2): Vec2 {
  const [sx, sy] = toSvg(p);
  return [(sx - cam.cx) * cam.scale + cam.w / 2, (sy - cam.cy) * cam.scale + cam.h / 2];
}

/** Screen pixel inside the editor → body point (m). */
export function unproject(cam: Camera, q: Vec2): Vec2 {
  return fromSvg([(q[0] - cam.w / 2) / cam.scale + cam.cx, (q[1] - cam.h / 2) / cam.scale + cam.cy]);
}

/** Camera that shows the given body-frame box (m) with a margin. */
export function fitCamera(
  box: { minX: number; maxX: number; minY: number; maxY: number } | null,
  w: number,
  h: number,
): Camera {
  if (box === null || w <= 0 || h <= 0) return { cx: 0, cy: 0, scale: w > 0 && h > 0 ? Math.min(w, h) / 400 : 1.5, w, h };
  const width = Math.max((box.maxY - box.minY) * 1000, 20);
  const height = Math.max((box.maxX - box.minX) * 1000, 20);
  const scale = Math.min((w * 0.8) / width, (h * 0.75) / height);
  return {
    cx: ((box.minY + box.maxY) / 2) * 1000,
    cy: (-(box.minX + box.maxX) / 2) * 1000,
    scale: Math.min(Math.max(scale, 0.05), 200),
    w,
    h,
  };
}
