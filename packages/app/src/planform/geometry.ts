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
 * Everything here is in metres, body axes FRD seen from above (x forward,
 * y right). The boolean operations run in millimetres internally, where the
 * coordinates are of order 1 to 1000 and the library's tolerances behave.
 */
import * as polygonClippingNs from "polygon-clipping";
import type { MultiPolygon as PcMultiPolygon, Polygon as PcPolygon } from "polygon-clipping";
import type { PlanformElement, PlanformRole, Planform } from "./model.ts";

// The package's ES build only has a default export while its types declare
// named ones; this works with either shape.
const pc = ((polygonClippingNs as unknown as { default?: typeof polygonClippingNs }).default ??
  polygonClippingNs) as typeof polygonClippingNs;

/** (x, y) in metres, body FRD top view. */
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

export interface ElementOutline {
  readonly elementId: string;
  readonly mirrored: boolean;
  readonly ring: Ring;
}

export function elementRing(element: PlanformElement): Ring {
  return element.shape === "polygon"
    ? element.points.map((p) => [p.x, p.y] as Vec2)
    : circleRing([element.center.x, element.center.y], element.radius);
}

/** True when the element's mirror image is itself (a circle on the axis). */
export function isOnSymmetryPlane(element: PlanformElement): boolean {
  return element.shape === "circle" && Math.abs(element.center.y) < SAME_PLANE;
}

export function elementOutlines(element: PlanformElement): ElementOutline[] {
  const ring = elementRing(element);
  const own: ElementOutline = { elementId: element.id, mirrored: false, ring };
  if (!element.mirror || isOnSymmetryPlane(element)) return [own];
  return [own, { elementId: element.id, mirrored: true, ring: mirrorRing(ring) }];
}

/** Exact area of the element as drawn, without its mirror image or holes. */
export function elementArea(element: PlanformElement): number {
  return element.shape === "circle" ? Math.PI * element.radius ** 2 : ringArea(elementRing(element));
}

export function elementPerimeter(element: PlanformElement): number {
  return element.shape === "circle" ? 2 * Math.PI * element.radius : perimeter(elementRing(element));
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
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

/** Bounds of an element including its mirror image; circles use their true extent. */
export function elementBounds(element: PlanformElement): Bounds {
  if (element.shape === "circle") {
    const { x, y } = element.center;
    const r = element.radius;
    const ys = element.mirror ? [y, -y] : [y];
    return { minX: x - r, maxX: x + r, minY: Math.min(...ys) - r, maxY: Math.max(...ys) + r };
  }
  return ringsBounds(elementOutlines(element).map((o) => o.ring))!;
}

export type ElementProblem = { readonly level: "red"; readonly message: string } | null;

/** Whether the element can be built at all. */
export function elementProblem(element: PlanformElement): ElementProblem {
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

export function unionPolygons(polygons: readonly PolygonWithHoles[]): PolygonWithHoles[] {
  if (polygons.length === 0) return [];
  return fromPc(pc.union(toPcMulti(polygons)));
}

// ---------- the whole planform ----------

/** All plates and wings that share a mid-plane height and a thickness: one sheet. */
export interface SolidLayer {
  readonly key: string;
  /** Mid-plane body z, m (positive down). */
  readonly z: number;
  /** m */
  readonly thickness: number;
  readonly elementIds: readonly string[];
  readonly holeIds: readonly string[];
  /** The pieces of this sheet after union and holes. */
  readonly bodies: readonly PolygonWithHoles[];
  /** Net area of the pieces, m². */
  readonly area: number;
}

export interface RotorDisc {
  readonly elementId: string;
  readonly mirrored: boolean;
  readonly name: string;
  readonly center: Vec2;
  /** m */
  readonly radius: number;
  /** Disc plane, body z, m. */
  readonly z: number;
}

export interface PlanformIssue {
  readonly level: "red" | "amber";
  readonly elementId?: string;
  readonly message: string;
}

export interface WingSummary {
  /** Projected area of the lifting surfaces, m². Holes are not subtracted (covered by film). */
  readonly area: number;
  /** Tip-to-tip span, m. */
  readonly span: number;
  /** b² / S */
  readonly aspectRatio: number;
  /** Mean geometric chord S / b, m. */
  readonly meanChord: number;
  readonly polygons: readonly PolygonWithHoles[];
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
  /** Bounds of plates, wings and rotor discs, m. */
  readonly bounds: Bounds | null;
  /** Area of the whole aircraft seen from above (all sheets merged, holes removed), m². */
  readonly projectedArea: number;
  /** Volume of all the pieces, m³ (each sheet: net area × thickness). */
  readonly volume: number;
  readonly wing: WingSummary | null;
  readonly rotorSummary: RotorSummary | null;
}

const layerKey = (z: number, thickness: number): string => `${Math.round(z * 1e6)}:${Math.round(thickness * 1e6)}`;

const nameOf = (planform: Planform, id: string): string => planform.elements.find((e) => e.id === id)?.name ?? id;

const isSolid = (role: PlanformRole): boolean => role === "plate" || role === "wing";

export function analysePlanform(planform: Planform): PlanformAnalysis {
  const issues: PlanformIssue[] = [];
  const valid: PlanformElement[] = [];
  for (const element of planform.elements) {
    const problem = elementProblem(element);
    if (problem === null) valid.push(element);
    else issues.push({ level: problem.level, elementId: element.id, message: `${element.name}: ${problem.message}` });
  }

  // Group solids into sheets.
  const groups = new Map<string, { z: number; thickness: number; elements: PlanformElement[] }>();
  for (const element of valid) {
    if (!isSolid(element.role)) continue;
    const key = layerKey(element.z, element.thickness);
    const group = groups.get(key) ?? { z: element.z, thickness: element.thickness, elements: [] };
    group.elements.push(element);
    groups.set(key, group);
  }

  const holes = valid.filter((e) => e.role === "hole");
  const holeUsed = new Set<string>();
  const layers: SolidLayer[] = [];

  for (const [key, group] of [...groups.entries()].sort((a, b) => a[1].z - b[1].z)) {
    const rings = group.elements.flatMap((e) => elementOutlines(e).map((o) => o.ring));
    let merged: PolygonWithHoles[];
    try {
      merged = unionRings(rings);
    } catch {
      merged = rings.map((r) => [r]);
      issues.push({
        level: "amber",
        message: `No se han podido fundir las piezas de la capa a z = ${(group.z * 1000).toFixed(1)} mm; se muestran por separado.`,
      });
    }

    const top = group.z - group.thickness / 2 - SAME_PLANE;
    const bottom = group.z + group.thickness / 2 + SAME_PLANE;
    const cutting = holes.filter((h) => h.z >= top && h.z <= bottom);
    const holeIds: string[] = [];
    const clipRings: Ring[] = [];
    for (const hole of cutting) {
      const holeRings = elementOutlines(hole).map((o) => o.ring);
      let overlap = 0;
      try {
        overlap = intersectionArea(merged, holeRings.map((r) => [r]));
      } catch {
        overlap = 0;
      }
      if (overlap > 1e-9) {
        holeIds.push(hole.id);
        holeUsed.add(hole.id);
        clipRings.push(...holeRings);
      }
    }
    let bodies = merged;
    if (clipRings.length > 0) {
      try {
        bodies = differenceRings(merged, clipRings);
      } catch {
        issues.push({
          level: "amber",
          message: `No se han podido recortar los vaciados de la capa a z = ${(group.z * 1000).toFixed(1)} mm.`,
        });
      }
    }
    layers.push({
      key,
      z: group.z,
      thickness: group.thickness,
      elementIds: group.elements.map((e) => e.id),
      holeIds,
      bodies,
      area: multiPolygonArea(bodies),
    });
  }

  for (const hole of holes) {
    if (!holeUsed.has(hole.id)) {
      issues.push({
        level: "amber",
        elementId: hole.id,
        message: `${hole.name}: no atraviesa ninguna placa ni ala a su altura z (${(hole.z * 1000).toFixed(1)} mm), así que no recorta nada.`,
      });
    }
  }

  // Rotor discs.
  const rotors: RotorDisc[] = valid
    .filter((e) => e.role === "rotor" && e.shape === "circle")
    .flatMap((e) => {
      if (e.shape !== "circle") return [];
      const own: RotorDisc = {
        elementId: e.id,
        mirrored: false,
        name: e.name,
        center: [e.center.x, e.center.y],
        radius: e.radius,
        z: e.z,
      };
      if (!e.mirror || isOnSymmetryPlane(e)) return [own];
      return [own, { ...own, mirrored: true, name: `${e.name} (reflejada)`, center: [e.center.x, -e.center.y] as Vec2 }];
    });
  for (const e of valid) {
    if (e.role === "rotor" && e.shape !== "circle") {
      issues.push({ level: "amber", elementId: e.id, message: `${e.name}: un disco de hélice tiene que ser un círculo; se ignora.` });
    }
  }

  for (let i = 0; i < rotors.length; i++) {
    for (let j = i + 1; j < rotors.length; j++) {
      const a = rotors[i]!;
      const b = rotors[j]!;
      const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
      if (d >= a.radius + b.radius - SAME_PLANE) continue;
      if (Math.abs(a.z - b.z) < SAME_PLANE) {
        issues.push({
          level: "red",
          elementId: a.elementId,
          message: `${a.name} y ${b.name} se cortan en el mismo plano: las palas chocarían.`,
        });
      } else {
        issues.push({
          level: "amber",
          elementId: a.elementId,
          message: `${a.name} y ${b.name} se solapan en planta a distinta altura. El disco es un plano sin espesor: comprueba que las palas no se toquen; la interferencia entre hélices no está modelada.`,
        });
      }
    }
  }

  for (const rotor of rotors) {
    const disc: PolygonWithHoles[] = [[circleRing(rotor.center, rotor.radius)]];
    for (const layer of layers) {
      if (rotor.z < layer.z - layer.thickness / 2 - SAME_PLANE || rotor.z > layer.z + layer.thickness / 2 + SAME_PLANE) continue;
      let overlap = 0;
      try {
        overlap = intersectionArea(disc, layer.bodies);
      } catch {
        overlap = 0;
      }
      if (overlap > 1e-8) {
        issues.push({
          level: "red",
          elementId: rotor.elementId,
          message: `${rotor.name}: su disco atraviesa la capa a z = ${(layer.z * 1000).toFixed(1)} mm (${nameOf(planform, layer.elementIds[0] ?? "")}…); la hélice golpearía la estructura. Súbela o bájala.`,
        });
      }
    }
  }

  // Wing.
  const wingRings = valid.filter((e) => e.role === "wing").flatMap((e) => elementOutlines(e).map((o) => o.ring));
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

  // Totals.
  let projectedArea = 0;
  const allBodies = layers.flatMap((l) => l.bodies);
  if (allBodies.length > 0) {
    try {
      projectedArea = multiPolygonArea(unionPolygons(allBodies));
    } catch {
      projectedArea = multiPolygonArea(allBodies);
      issues.push({ level: "amber", message: "El área en planta se ha sumado capa a capa: no se han podido fundir las capas." });
    }
  }
  const volume = layers.reduce((sum, l) => sum + l.area * l.thickness, 0);

  // Rotor discs enter the bounds by their exact extent, not their polygon.
  const boundRings: Ring[] = [
    ...layers.flatMap((l) => l.bodies.map((p) => p[0]!)),
    ...rotors.map((r): Ring => [
      [r.center[0] - r.radius, r.center[1] - r.radius],
      [r.center[0] + r.radius, r.center[1] + r.radius],
    ]),
  ];
  const bounds = ringsBounds(boundRings);

  let rotorSummary: RotorSummary | null = null;
  if (rotors.length > 0) {
    let maxAxisDistance = 0;
    for (let i = 0; i < rotors.length; i++) {
      for (let j = i + 1; j < rotors.length; j++) {
        const a = rotors[i]!.center;
        const b = rotors[j]!.center;
        maxAxisDistance = Math.max(maxAxisDistance, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    rotorSummary = {
      count: rotors.length,
      discArea: rotors.reduce((s, r) => s + Math.PI * r.radius ** 2, 0),
      maxAxisDistance,
    };
  }

  return { layers, rotors, issues, bounds, projectedArea, volume, wing, rotorSummary };
}

/** Which element of a sheet covers a plan point; the last drawn wins. */
export function elementAtPoint(planform: Planform, ids: readonly string[], p: Vec2): string | null {
  for (let i = planform.elements.length - 1; i >= 0; i--) {
    const element = planform.elements[i]!;
    if (!ids.includes(element.id)) continue;
    if (elementOutlines(element).some((o) => pointInRing(p, o.ring))) return element.id;
  }
  return ids[0] ?? null;
}
