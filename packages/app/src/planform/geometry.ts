/**
 * Plane geometry of the planform: areas, outlines, mirror images and the
 * boolean operations that turn overlapping drawn elements into the real
 * pieces of each sheet.
 *
 * Methods (named in the UI with their references):
 * - Area and centroid of a polygon by Gauss's area formula (shoelace).
 * - Boolean union and difference of polygons by the Martínez-Rueda-Feito
 *   sweep-line algorithm, as implemented by the polygon-clipping library.
 * - Circles become inscribed polygons whose chord error is at most
 *   CIRCLE_CHORD_TOLERANCE.
 *
 * Everything here is in metres. Rings are in the coordinates (u, v) of the
 * element's drawing plane (planes.ts); results in body axes FRD say so. The
 * boolean operations run in millimetres internally, where the coordinates
 * are of order 1 to 1000 and the library's tolerances behave.
 */
import * as polygonClippingNs from "polygon-clipping";
import type { MultiPolygon as PcMultiPolygon, Polygon as PcPolygon } from "polygon-clipping";
import type { Triple } from "@aeroforja/physics";
import type { PlanformElement, PlanformRole, Planform } from "./model.ts";
import {
  PLANE_SPECS,
  mirrorsInPlane,
  toBody,
  yCoordinate,
  type BodyAxis,
  type PlaneId,
} from "./planes.ts";

// The package's ES build only has a default export while its types declare
// named ones; this works with either shape.
const pc = ((polygonClippingNs as unknown as { default?: typeof polygonClippingNs }).default ??
  polygonClippingNs) as typeof polygonClippingNs;

/** (u, v) in metres, in a drawing plane. */
export type Vec2 = readonly [number, number];
export type Ring = readonly Vec2[];
/** An outer ring followed by its holes. */
export type PolygonWithHoles = readonly Ring[];

/** Largest gap between a circle and its polygon, m. */
export const CIRCLE_CHORD_TOLERANCE = 1e-5;
/** Polygons smaller than this are treated as empty (1 mm²). */
export const MIN_AREA = 1e-6;
/** Same-plane tolerance for heights and coordinates (1 µm). */
export const SAME_PLANE = 1e-6;

// ---------- basic polygon geometry ----------

/** Signed area by Gauss's formula; positive when the ring turns from +x towards +y. */
export function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export const ringArea = (ring: Ring): number => Math.abs(signedArea(ring));

export function perimeter(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

/** Net area of a polygon with holes. */
export const polygonArea = (polygon: PolygonWithHoles): number =>
  polygon.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);

export const multiPolygonArea = (polygons: readonly PolygonWithHoles[]): number =>
  polygons.reduce((sum, p) => sum + polygonArea(p), 0);

/** Even-odd ray casting; points exactly on an edge may fall either way. */
export function pointInRing(p: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(p: Vec2, polygon: PolygonWithHoles): boolean {
  if (polygon.length === 0 || !pointInRing(p, polygon[0]!)) return false;
  return !polygon.slice(1).some((hole) => pointInRing(p, hole));
}

const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** True when segments ab and cd share any point. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSegment = (p: Vec2, q: Vec2, r: Vec2): boolean =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;
  return false;
}

/** True when two non-adjacent edges of the ring touch or cross. */
export function selfIntersects(ring: Ring): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Skip the edge itself and the two edges that share a vertex with it.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a, b, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

export function centroid(ring: Ring): Vec2 {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-18) {
    const sx = ring.reduce((s, p) => s + p[0], 0);
    const sy = ring.reduce((s, p) => s + p[1], 0);
    return [sx / ring.length, sy / ring.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Number of sides so that the inscribed polygon stays within `tolerance` of the circle. */
export function circleSegments(radius: number, tolerance = CIRCLE_CHORD_TOLERANCE): number {
  if (radius <= tolerance) return 24;
  const n = Math.ceil(Math.PI / Math.acos(1 - tolerance / radius));
  return Math.min(1024, Math.max(24, n));
}

export function circleRing(center: Vec2, radius: number, segments = circleSegments(radius)): Ring {
  const ring: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    ring.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return ring;
}

/** Mirror image about the plane of symmetry (y → −y), with the turning sense kept. */
export const mirrorRing = (ring: Ring): Ring => ring.map(([x, y]) => [x, -y] as Vec2).reverse();

// ---------- elements ----------

/**
 * One solid copy of an element: the element as drawn, or its mirror image.
 * The ring is in the element's plane coordinates (u, v); in the perfil the
 * mirror image is the same ring at the opposite offset.
 */
export interface ElementOutline {
  readonly elementId: string;
  readonly mirrored: boolean;
  readonly plane: PlaneId;
  /** Mid-plane position along the plane's normal, m. */
  readonly offset: number;
  readonly ring: Ring;
}

export function elementRing(element: PlanformElement): Ring {
  return element.shape === "polygon"
    ? element.points.map((p) => [p.u, p.v] as Vec2)
    : circleRing([element.center.u, element.center.v], element.radius);
}

/** Mirror of a ring about y = 0 when y is an in-plane axis, keeping the turning sense. */
function mirrorInPlane(plane: PlaneId, ring: Ring): Ring {
  const which = yCoordinate(plane);
  if (which === "v") return ring.map(([u, v]) => [u, -v] as Vec2).reverse();
  if (which === "u") return ring.map(([u, v]) => [-u, v] as Vec2).reverse();
  return ring;
}

/** True when the element's mirror image is itself: a circle centred on y = 0, or a perfil element at y = 0. */
export function isOnSymmetryPlane(element: PlanformElement): boolean {
  if (!mirrorsInPlane(element.plane)) return Math.abs(element.offset) < SAME_PLANE;
  if (element.shape !== "circle") return false;
  const which = yCoordinate(element.plane);
  const y = which === "u" ? element.center.u : element.center.v;
  return Math.abs(y) < SAME_PLANE;
}

export function elementOutlines(element: PlanformElement): ElementOutline[] {
  const ring = elementRing(element);
  const own: ElementOutline = { elementId: element.id, mirrored: false, plane: element.plane, offset: element.offset, ring };
  if (!element.mirror || isOnSymmetryPlane(element)) return [own];
  const mirrored: ElementOutline = mirrorsInPlane(element.plane)
    ? { ...own, mirrored: true, ring: mirrorInPlane(element.plane, ring) }
    : { ...own, mirrored: true, offset: -element.offset };
  return [own, mirrored];
}

/** Exact area of the element as drawn, without its mirror image or holes. */
export function elementArea(element: PlanformElement): number {
  return element.shape === "circle" ? Math.PI * element.radius ** 2 : ringArea(elementRing(element));
}

export function elementPerimeter(element: PlanformElement): number {
  return element.shape === "circle" ? 2 * Math.PI * element.radius : perimeter(elementRing(element));
}

/** A rectangle in 2D coordinates (named after the planta's axes, but used in any plane). */
export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** A box in body axes, m. */
export interface Box3 {
  readonly min: Triple;
  readonly max: Triple;
}

export function ringsBounds(rings: readonly Ring[]): Bounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/** In-plane bounds (u, v) of an element including an in-plane mirror image; circles use their true extent. */
export function elementBounds(element: PlanformElement): Bounds {
  if (element.shape === "circle") {
    const r = element.radius;
    const centres = elementOutlines(element).map((o) => (o.mirrored && mirrorsInPlane(element.plane) ? mirrorPoint(element) : element.center));
    const us = centres.map((c) => c.u);
    const vs = centres.map((c) => c.v);
    return { minX: Math.min(...us) - r, maxX: Math.max(...us) + r, minY: Math.min(...vs) - r, maxY: Math.max(...vs) + r };
  }
  return ringsBounds(elementOutlines(element).map((o) => o.ring))!;
}

function mirrorPoint(element: PlanformElement & { shape: "circle" }): { u: number; v: number } {
  const which = yCoordinate(element.plane);
  return which === "u" ? { u: -element.center.u, v: element.center.v } : { u: element.center.u, v: -element.center.v };
}

/** Body-axes box of an element and its mirror image, thickness included. */
export function elementBox(element: PlanformElement): Box3 {
  const b = elementBounds(element);
  const t = element.role === "plate" || element.role === "wing" ? element.thickness / 2 : 0;
  const offsets = elementOutlines(element).map((o) => o.offset);
  const corners: Triple[] = [];
  for (const u of [b.minX, b.maxX]) for (const v of [b.minY, b.maxY]) for (const o of offsets) for (const d of [-t, t]) corners.push(toBody(element.plane, u, v, o + d));
  return boxOf(corners)!;
}

export function boxOf(points: readonly Triple[]): Box3 | null {
  if (points.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p[i]!);
      max[i] = Math.max(max[i]!, p[i]!);
    }
  }
  return { min, max };
}

export function unionBox(a: Box3 | null, b: Box3 | null): Box3 | null {
  if (a === null) return b;
  if (b === null) return a;
  return boxOf([a.min, a.max, b.min, b.max]);
}

/**
 * Silhouette of a flat solid (outer ring in its plane, at an offset, with a
 * thickness) seen in another view, in that view's (u, v). In its own plane
 * it is the ring itself; in a perpendicular view it is a rectangle: the
 * ring's extent along the shared axis by the thickness along the normal.
 */
export function projectToView(plane: PlaneId, ring: Ring, offset: number, thickness: number, view: PlaneId): Ring {
  if (plane === view) return ring;
  const src = PLANE_SPECS[plane];
  const dst = PLANE_SPECS[view];
  const extent = (axis: BodyAxis): [number, number] => {
    if (axis === src.n) return [offset - thickness / 2, offset + thickness / 2];
    const index = axis === src.u ? 0 : 1;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of ring) {
      lo = Math.min(lo, p[index]);
      hi = Math.max(hi, p[index]);
    }
    return [lo, hi];
  };
  const [u0, u1] = extent(dst.u);
  const [v0, v1] = extent(dst.v);
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}

export type ElementProblem = { readonly level: "red"; readonly message: string } | null;

/** Whether the element can be built at all. */
export function elementProblem(element: PlanformElement): ElementProblem {
  if (element.role === "rotor" && element.plane === "side") {
    return { level: "red", message: "Una hélice se dibuja en la planta (eje vertical) o en el alzado (tractora o propulsora), no en el perfil." };
  }
  if (element.role === "rotor" && element.shape !== "circle") return { level: "red", message: "Una hélice es un disco: dibújala con «Círculo»." };
  if (element.shape === "circle") {
    if (!(element.radius > 0)) return { level: "red", message: "El radio tiene que ser mayor que cero." };
  } else {
    if (element.points.length < 3) return { level: "red", message: "Un contorno necesita al menos 3 vértices." };
    const ring = elementRing(element);
    // Crossing first: the two loops of a crossed contour cancel in the signed area.
    if (selfIntersects(ring)) return { level: "red", message: "El contorno se corta a sí mismo; mueve los vértices para deshacer el cruce." };
    if (ringArea(ring) < MIN_AREA) return { level: "red", message: "El contorno no encierra superficie (menos de 1 mm²)." };
  }
  if ((element.role === "plate" || element.role === "wing") && !(element.thickness > 0)) {
    return { level: "red", message: "El espesor tiene que ser mayor que cero." };
  }
  return null;
}

// ---------- boolean operations (in millimetres) ----------

const MM = 1000;

const toPc = (ring: Ring): PcPolygon => [ring.map(([x, y]) => [x * MM, y * MM] as [number, number])];

function fromPc(multi: PcMultiPolygon): PolygonWithHoles[] {
  return multi.map((polygon) =>
    polygon.map((ring) => {
      const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1)
        : ring;
      return open.map(([x, y]) => [x / MM, y / MM] as Vec2);
    }),
  );
}

const toPcMulti = (polygons: readonly PolygonWithHoles[]): PcMultiPolygon =>
  polygons.map((p) => p.map((ring) => ring.map(([x, y]) => [x * MM, y * MM] as [number, number])));

export function unionRings(rings: readonly Ring[]): PolygonWithHoles[] {
  if (rings.length === 0) return [];
  const [first, ...rest] = rings.map(toPc);
  return fromPc(pc.union(first!, ...rest));
}

export function differenceRings(subject: readonly PolygonWithHoles[], clips: readonly Ring[]): PolygonWithHoles[] {
  if (subject.length === 0) return [];
  if (clips.length === 0) return subject.map((p) => p.slice());
  return fromPc(pc.difference(toPcMulti(subject), ...clips.map(toPc)));
}

export function intersectionArea(a: readonly PolygonWithHoles[], b: readonly PolygonWithHoles[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  return multiPolygonArea(fromPc(pc.intersection(toPcMulti(a), toPcMulti(b))));
}

/** Union of several groups of polygons (each group a valid multipolygon), holes kept. */
export function unionGroups(groups: readonly (readonly PolygonWithHoles[])[]): PolygonWithHoles[] {
  const nonEmpty = groups.filter((g) => g.length > 0);
  if (nonEmpty.length === 0) return [];
  const [first, ...rest] = nonEmpty.map(toPcMulti);
  return fromPc(pc.union(first!, ...rest));
}

export function unionPolygons(polygons: readonly PolygonWithHoles[]): PolygonWithHoles[] {
  if (polygons.length === 0) return [];
  return fromPc(pc.union(toPcMulti(polygons)));
}

// ---------- the whole planform ----------

/** All plates and wings of one plane that share a mid-plane offset and a thickness: one sheet. */
export interface SolidLayer {
  readonly key: string;
  readonly plane: PlaneId;
  /** Mid-plane position along the plane's normal, m. */
  readonly offset: number;
  /** m */
  readonly thickness: number;
  readonly elementIds: readonly string[];
  readonly holeIds: readonly string[];
  /** The pieces of this sheet after union and holes, in plane coordinates. */
  readonly bodies: readonly PolygonWithHoles[];
  /** Net area of the pieces, m². */
  readonly area: number;
}

export interface RotorDisc {
  readonly elementId: string;
  readonly mirrored: boolean;
  readonly name: string;
  /** Planta (axis along z) or alzado (axis along x: tractor or pusher). */
  readonly plane: PlaneId;
  /** Centre in plane coordinates, m. */
  readonly center: Vec2;
  /** m */
  readonly radius: number;
  /** Disc plane position along its axis, m. */
  readonly offset: number;
  /** Centre in body axes, m. */
  readonly center3: Triple;
}

export interface PlanformIssue {
  readonly level: "red" | "amber";
  readonly elementId?: string;
  readonly message: string;
}

export interface WingSummary {
  /** Projected area of the horizontal lifting surfaces, m². Holes are not subtracted (covered by film). */
  readonly area: number;
  /** Tip-to-tip span, m. */
  readonly span: number;
  /** b² / S */
  readonly aspectRatio: number;
  /** Mean geometric chord S / b, m. */
  readonly meanChord: number;
  readonly polygons: readonly PolygonWithHoles[];
}

export interface VerticalSummary {
  /** Area of the vertical lifting surfaces (fins) drawn in the perfil, all copies, m². */
  readonly area: number;
  /** Height of the tallest one, m. */
  readonly height: number;
  readonly count: number;
}

export interface RotorSummary {
  readonly count: number;
  /** Sum of the disc areas π r², m². */
  readonly discArea: number;
  /** Largest distance between two rotor axes, m (the "wheelbase" of a multirotor). */
  readonly maxAxisDistance: number;
}

export interface PlanformAnalysis {
  readonly layers: readonly SolidLayer[];
  readonly rotors: readonly RotorDisc[];
  readonly issues: readonly PlanformIssue[];
  /** Planta extent (x as minX..maxX, y as minY..maxY) of solids and discs, m. */
  readonly bounds: Bounds | null;
  /** Body-axes box of solids and discs, m. */
  readonly box: Box3 | null;
  /** Area seen from above (all sheets merged, holes removed), m². */
  readonly projectedArea: number;
  /** Area seen from the front (projection on the y-z plane), m². */
  readonly frontalArea: number;
  /** Volume of all the pieces, m³ (each sheet: net area × thickness). */
  readonly volume: number;
  readonly wing: WingSummary | null;
  readonly vertical: VerticalSummary | null;
  readonly rotorSummary: RotorSummary | null;
}

const mm = (m: number): string => (m * 1000).toFixed(1).replace(".", ",");

const PLANE_WORD: Readonly<Record<PlaneId, string>> = { top: "planta", side: "perfil", front: "alzado" };

/** Where a sheet is, in words: «capa de la planta a z = 0,0 mm». */
export function layerLabel(layer: { plane: PlaneId; offset: number }): string {
  const axis = ["x", "y", "z"][PLANE_SPECS[layer.plane].n];
  return `capa del ${PLANE_WORD[layer.plane]} a ${axis} = ${mm(layer.offset)} mm`;
}

const layerKey = (plane: PlaneId, offset: number, thickness: number): string =>
  `${plane}:${Math.round(offset * 1e6)}:${Math.round(thickness * 1e6)}`;

const nameOf = (planform: Planform, id: string): string => planform.elements.find((e) => e.id === id)?.name ?? id;

const isSolid = (role: PlanformRole): boolean => role === "plate" || role === "wing";

/** Whether a body point lies inside a sheet (within its thickness and inside one of its pieces). */
export function layerContains(layer: SolidLayer, p: Triple): boolean {
  const s = PLANE_SPECS[layer.plane];
  if (Math.abs(p[s.n] - layer.offset) > layer.thickness / 2 + SAME_PLANE) return false;
  const q: Vec2 = [p[s.u], p[s.v]];
  return layer.bodies.some((body) => pointInPolygon(q, body));
}

/** Points on a disc for collision checks: rings every `step` metres, about `step` apart along each ring. */
function discSamples(rotor: RotorDisc, step: number): Triple[] {
  const points: Triple[] = [rotor.center3];
  const s = PLANE_SPECS[rotor.plane];
  for (let r = step; r <= rotor.radius + 1e-12; r += step) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n;
      const p: [number, number, number] = [rotor.center3[0], rotor.center3[1], rotor.center3[2]];
      p[s.u] += r * Math.cos(t);
      p[s.v] += r * Math.sin(t);
      points.push(p);
    }
  }
  return points;
}

/** Spacing of the points used to check a disc against sheets of other planes, m. */
export const DISC_SAMPLE_STEP = 0.002;

export function analysePlanform(planform: Planform): PlanformAnalysis {
  const issues: PlanformIssue[] = [];
  const valid: PlanformElement[] = [];
  for (const element of planform.elements) {
    const problem = elementProblem(element);
    if (problem === null) valid.push(element);
    else issues.push({ level: problem.level, elementId: element.id, message: `${element.name}: ${problem.message}` });
  }

  // Group the solid copies into sheets.
  const groups = new Map<string, { plane: PlaneId; offset: number; thickness: number; ids: Set<string>; rings: Ring[] }>();
  for (const element of valid) {
    if (!isSolid(element.role)) continue;
    for (const o of elementOutlines(element)) {
      const key = layerKey(o.plane, o.offset, element.thickness);
      const group = groups.get(key) ?? { plane: o.plane, offset: o.offset, thickness: element.thickness, ids: new Set<string>(), rings: [] };
      group.ids.add(element.id);
      group.rings.push(o.ring);
      groups.set(key, group);
    }
  }

  const holes = valid.filter((e) => e.role === "hole").flatMap((e) => elementOutlines(e).map((o) => ({ element: e, outline: o })));
  const holeUsed = new Set<string>();
  const layers: SolidLayer[] = [];
  const planeOrder: Readonly<Record<PlaneId, number>> = { top: 0, front: 1, side: 2 };

  for (const [key, group] of [...groups.entries()].sort(
    (a, b) => planeOrder[a[1].plane] - planeOrder[b[1].plane] || a[1].offset - b[1].offset,
  )) {
    let merged: PolygonWithHoles[];
    try {
      merged = unionRings(group.rings);
    } catch {
      merged = group.rings.map((r) => [r]);
      issues.push({ level: "amber", message: `No se han podido fundir las piezas de la ${layerLabel(group)}; se muestran por separado.` });
    }

    const lo = group.offset - group.thickness / 2 - SAME_PLANE;
    const hi = group.offset + group.thickness / 2 + SAME_PLANE;
    const holeIds = new Set<string>();
    const clipRings: Ring[] = [];
    for (const { element, outline } of holes) {
      if (outline.plane !== group.plane || outline.offset < lo || outline.offset > hi) continue;
      let overlap = 0;
      try {
        overlap = intersectionArea(merged, [[outline.ring]]);
      } catch {
        overlap = 0;
      }
      if (overlap > 1e-9) {
        holeIds.add(element.id);
        holeUsed.add(element.id);
        clipRings.push(outline.ring);
      }
    }
    let bodies = merged;
    if (clipRings.length > 0) {
      try {
        bodies = differenceRings(merged, clipRings);
      } catch {
        issues.push({ level: "amber", message: `No se han podido recortar los vaciados de la ${layerLabel(group)}.` });
      }
    }
    layers.push({
      key,
      plane: group.plane,
      offset: group.offset,
      thickness: group.thickness,
      elementIds: [...group.ids],
      holeIds: [...holeIds],
      bodies,
      area: multiPolygonArea(bodies),
    });
  }

  for (const { element } of holes) {
    if (!holeUsed.has(element.id) && !issues.some((i) => i.elementId === element.id)) {
      const axis = ["x", "y", "z"][PLANE_SPECS[element.plane].n];
      issues.push({
        level: "amber",
        elementId: element.id,
        message: `${element.name}: no atraviesa ninguna placa ni ala de su vista a ${axis} = ${mm(element.offset)} mm, así que no recorta nada.`,
      });
    }
  }

  // Rotor discs: in the planta (horizontal) or the alzado (tractor and pusher).
  const rotors: RotorDisc[] = [];
  for (const e of valid) {
    if (e.role !== "rotor") continue;
    if (e.shape !== "circle") {
      issues.push({ level: "amber", elementId: e.id, message: `${e.name}: un disco de hélice tiene que ser un círculo; se ignora.` });
      continue;
    }
    if (e.plane === "side") {
      issues.push({
        level: "amber",
        elementId: e.id,
        message: `${e.name}: una hélice con el eje a lo largo de y no está contemplada; dibújala en la planta o en el alzado. Se ignora.`,
      });
      continue;
    }
    for (const o of elementOutlines(e)) {
      const center: Vec2 = o.mirrored ? (yCoordinate(e.plane) === "u" ? [-e.center.u, e.center.v] : [e.center.u, -e.center.v]) : [e.center.u, e.center.v];
      rotors.push({
        elementId: e.id,
        mirrored: o.mirrored,
        name: o.mirrored ? `${e.name} (reflejada)` : e.name,
        plane: e.plane,
        center,
        radius: e.radius,
        offset: e.offset,
        center3: toBody(e.plane, center[0], center[1], e.offset),
      });
    }
  }

  for (let i = 0; i < rotors.length; i++) {
    for (let j = i + 1; j < rotors.length; j++) {
      const a = rotors[i]!;
      const b = rotors[j]!;
      if (a.plane !== b.plane) continue;
      const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
      if (d >= a.radius + b.radius - SAME_PLANE) continue;
      if (Math.abs(a.offset - b.offset) < SAME_PLANE) {
        issues.push({ level: "red", elementId: a.elementId, message: `${a.name} y ${b.name} se cortan en el mismo plano: las palas chocarían.` });
      } else {
        issues.push({
          level: "amber",
          elementId: a.elementId,
          message: `${a.name} y ${b.name} se solapan vistas de frente a su eje, a distinta altura. El disco es un plano sin espesor: comprueba que las palas no se toquen; la interferencia entre hélices no está modelada.`,
        });
      }
    }
  }

  for (const rotor of rotors) {
    const hit = new Set<string>();
    // Same plane: exact overlap of the disc with the sheet the disc plane crosses.
    const disc: PolygonWithHoles[] = [[circleRing(rotor.center, rotor.radius)]];
    for (const layer of layers) {
      if (layer.plane !== rotor.plane) continue;
      if (Math.abs(rotor.offset - layer.offset) > layer.thickness / 2 + SAME_PLANE) continue;
      let overlap = 0;
      try {
        overlap = intersectionArea(disc, layer.bodies);
      } catch {
        overlap = 0;
      }
      if (overlap > 1e-8) hit.add(layer.key);
    }
    // Other planes: points of the disc every DISC_SAMPLE_STEP inside the sheet.
    const others = layers.filter((l) => l.plane !== rotor.plane);
    if (others.length > 0) {
      const samples = discSamples(rotor, DISC_SAMPLE_STEP);
      for (const layer of others) {
        if (samples.some((p) => layerContains(layer, p))) hit.add(layer.key);
      }
    }
    for (const key of hit) {
      const layer = layers.find((l) => l.key === key)!;
      issues.push({
        level: "red",
        elementId: rotor.elementId,
        message: `${rotor.name}: su disco atraviesa la ${layerLabel(layer)} (${nameOf(planform, layer.elementIds[0] ?? "")}…); la hélice golpearía la estructura.`,
      });
    }
  }

  // Lifting surfaces.
  const wingRings = valid
    .filter((e) => e.role === "wing" && e.plane === "top")
    .flatMap((e) => elementOutlines(e).map((o) => o.ring));
  let wing: WingSummary | null = null;
  if (wingRings.length > 0) {
    let polygons: PolygonWithHoles[];
    try {
      polygons = unionRings(wingRings);
    } catch {
      polygons = wingRings.map((r) => [r]);
    }
    const area = multiPolygonArea(polygons);
    const b = ringsBounds(polygons.map((p) => p[0]!));
    if (b !== null && area > MIN_AREA) {
      const span = b.maxY - b.minY;
      wing = { area, span, aspectRatio: (span * span) / area, meanChord: area / span, polygons };
    }
  }
  const fins = valid.filter((e) => e.role === "wing" && e.plane === "side");
  let vertical: VerticalSummary | null = null;
  if (fins.length > 0) {
    let area = 0;
    let height = 0;
    let count = 0;
    for (const fin of fins) {
      for (const o of elementOutlines(fin)) {
        area += ringArea(o.ring);
        const b = ringsBounds([o.ring])!;
        height = Math.max(height, b.maxY - b.minY);
        count++;
      }
    }
    vertical = { area, height, count };
  }

  // Totals.
  const projectedOn = (view: PlaneId): number => {
    const parts: PolygonWithHoles[] = layers.flatMap((l) =>
      l.plane === view ? l.bodies : l.bodies.map((body) => [projectToView(l.plane, body[0]!, l.offset, l.thickness, view)]),
    );
    if (parts.length === 0) return 0;
    try {
      return multiPolygonArea(unionPolygons(parts));
    } catch {
      issues.push({ level: "amber", message: "Un área proyectada se ha sumado pieza a pieza: no se han podido fundir las piezas." });
      return multiPolygonArea(parts);
    }
  };
  const projectedArea = projectedOn("top");
  const frontalArea = projectedOn("front");
  const volume = layers.reduce((sum, l) => sum + l.area * l.thickness, 0);

  // Box of solids and discs (discs by their exact extent, not their polygon).
  let box: Box3 | null = null;
  for (const layer of layers) {
    for (const body of layer.bodies) {
      const b = ringsBounds([body[0]!])!;
      const corners: Triple[] = [];
      for (const u of [b.minX, b.maxX]) for (const v of [b.minY, b.maxY]) for (const d of [-layer.thickness / 2, layer.thickness / 2]) corners.push(toBody(layer.plane, u, v, layer.offset + d));
      box = unionBox(box, boxOf(corners));
    }
  }
  for (const r of rotors) {
    const corners: Triple[] = [];
    for (const du of [-r.radius, r.radius]) for (const dv of [-r.radius, r.radius]) corners.push(toBody(r.plane, r.center[0] + du, r.center[1] + dv, r.offset));
    box = unionBox(box, boxOf(corners));
  }
  const bounds: Bounds | null = box === null ? null : { minX: box.min[0], maxX: box.max[0], minY: box.min[1], maxY: box.max[1] };

  let rotorSummary: RotorSummary | null = null;
  if (rotors.length > 0) {
    let maxAxisDistance = 0;
    for (let i = 0; i < rotors.length; i++) {
      for (let j = i + 1; j < rotors.length; j++) {
        const a = rotors[i]!;
        const b = rotors[j]!;
        if (a.plane !== b.plane) continue;
        maxAxisDistance = Math.max(maxAxisDistance, Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]));
      }
    }
    rotorSummary = { count: rotors.length, discArea: rotors.reduce((s, r) => s + Math.PI * r.radius ** 2, 0), maxAxisDistance };
  }

  return { layers, rotors, issues, bounds, box, projectedArea, frontalArea, volume, wing, vertical, rotorSummary };
}

/** Which element of a sheet covers a body point; the last drawn wins. */
export function elementAtPoint(planform: Planform, layer: SolidLayer, p: Triple): string | null {
  const s = PLANE_SPECS[layer.plane];
  const q: Vec2 = [p[s.u], p[s.v]];
  for (let i = planform.elements.length - 1; i >= 0; i--) {
    const element = planform.elements[i]!;
    if (!layer.elementIds.includes(element.id)) continue;
    if (elementOutlines(element).some((o) => Math.abs(o.offset - layer.offset) < 2 * SAME_PLANE && pointInRing(q, o.ring))) return element.id;
  }
  return layer.elementIds[0] ?? null;
}
