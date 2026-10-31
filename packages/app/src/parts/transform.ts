/**
 * Placement of an imported part on the aircraft: from the file's own
 * coordinates to body axes FRD in metres,
 *
 *   p_body = position + R(yaw, pitch, roll) · (scale · unit · p_file)
 *
 * with R the aerospace z-y-x rotation from the part's axes to body axes
 * (Stevens, Lewis & Johnson, Aircraft Control and Simulation, sec. 1.3).
 */
import { mat3, quaternionFromEulerZYX, rotationMatrix, type Mat3, type Triple } from "@aeroforja/physics";
import type { Box3, Ring, Vec2 } from "../planform/geometry.ts";
import { PLANE_SPECS, type PlaneId } from "../planform/planes.ts";
import type { ImportedPart, PartPlacement } from "./model.ts";

export function placementRotation(placement: PartPlacement): Mat3 {
  return rotationMatrix(quaternionFromEulerZYX({ roll: placement.roll, pitch: placement.pitch, yaw: placement.yaw }));
}

/** Triangles of a part in body axes, metres (9 numbers per triangle). */
export function bodyTriangles(part: ImportedPart, mesh: Float32Array): Float64Array {
  const r = placementRotation(part.placement);
  const k = part.unit * part.placement.scale;
  const { x, y, z } = part.placement.position;
  const out = new Float64Array(mesh.length);
  for (let i = 0; i < mesh.length; i += 3) {
    const p: Triple = [mesh[i]! * k, mesh[i + 1]! * k, mesh[i + 2]! * k];
    const q = mat3.multiplyVector(r, p);
    out[i] = q[0] + x;
    out[i + 1] = q[1] + y;
    out[i + 2] = q[2] + z;
  }
  return out;
}

const cache = new WeakMap<ImportedPart, { mesh: Float32Array; tris: Float64Array }>();

/** bodyTriangles, remembered per placed part (parts are immutable: a move makes a new object). */
export function placedTriangles(part: ImportedPart, mesh: Float32Array): Float64Array {
  const hit = cache.get(part);
  if (hit !== undefined && hit.mesh === mesh) return hit.tris;
  const tris = bodyTriangles(part, mesh);
  cache.set(part, { mesh, tris });
  return tris;
}

export function trianglesBox(tris: ArrayLike<number>): Box3 | null {
  if (tris.length < 3) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = tris[i + a]!;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  return { min, max };
}

/** Convex hull of 2D points, counter-clockwise (Andrew's monotone chain). */
export function convexHull(points: readonly Vec2[]): Ring {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Outline of a part seen in a view, for the editors: the convex hull of its
 * vertices projected on the view's plane. It shows where the part is and
 * how big; concave details are not drawn.
 */
export function partHull(tris: ArrayLike<number>, plane: PlaneId): Ring {
  const s = PLANE_SPECS[plane];
  // Coarse 0,1 mm dedup keeps the hull fast on large meshes.
  const seen = new Set<string>();
  const points: Vec2[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const u = tris[i + s.u]!;
    const v = tris[i + s.v]!;
    const key = `${Math.round(u * 1e4)}:${Math.round(v * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([u, v]);
  }
  return convexHull(points);
}
