/**
 * Projected (frontal, lateral, planta) area of a placed part, mini-design
 * 005: boolean union of the projections of its triangles on a body plane.
 * Every triangle with a non-zero projection takes part, so an open or
 * badly oriented mesh still gets its whole silhouette.
 */
import { centroid, signedArea, unionGroups, unionRings, type PolygonWithHoles, type Ring, type Vec2 } from "../planform/geometry.ts";

export interface Projection {
  /** m² */
  readonly area: number;
  /** Centroid of the projected area, in the plane's two other body coordinates (for x: y, z), m. */
  readonly centroid: Vec2;
  readonly polygons: readonly PolygonWithHoles[];
}

/** Projection along body axis `axis` (0: seen from the front, along x; 1: along y; 2: along z). */
export function projectTriangles(tris: ArrayLike<number>, axis: 0 | 1 | 2): Projection {
  const [a, b] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const rings: Ring[] = [];
  let extent = 0;
  for (let i = 0; i < tris.length; i++) extent = Math.max(extent, Math.abs(tris[i]!));
  const minArea = (extent * 1e-7) ** 2;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const ring: Ring = [
      [tris[i + a]!, tris[i + b]!],
      [tris[i + 3 + a]!, tris[i + 3 + b]!],
      [tris[i + 6 + a]!, tris[i + 6 + b]!],
    ];
    // Both orientations: an open or badly oriented mesh still gets its whole silhouette.
    const s = signedArea(ring);
    if (s > minArea) rings.push(ring);
    else if (s < -minArea) rings.push([ring[0]!, ring[2]!, ring[1]!]);
  }
  if (rings.length === 0) return { area: 0, centroid: [0, 0], polygons: [] };
  // Union in batches keeps each sweep small; the batch results are merged with their holes.
  const BATCH = 2000;
  const partial: PolygonWithHoles[][] = [];
  for (let i = 0; i < rings.length; i += BATCH) partial.push(unionRings(rings.slice(i, i + BATCH)));
  const pieces = partial.length === 1 ? partial[0]! : unionGroups(partial);
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const poly of pieces) {
    poly.forEach((ring, k) => {
      const ar = Math.abs(signedArea(ring)) * (k === 0 ? 1 : -1);
      const c = centroid(ring);
      area += ar;
      cx += ar * c[0];
      cy += ar * c[1];
    });
  }
  return { area, centroid: area > 0 ? [cx / area, cy / area] : [0, 0], polygons: pieces };
}

