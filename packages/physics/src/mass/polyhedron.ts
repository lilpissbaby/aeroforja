/**
 * Volume, centroid and inertia tensor of a homogeneous closed triangle mesh
 * (mini-design 005), by splitting it into tetrahedra with a vertex at the
 * origin. For each triangle (a, b, c), with A = [a b c] (columns):
 *
 *   V_t = det(A) / 6
 *   C_t = det(A) · A · Ĉ · Aᵀ,   Ĉ = (1/120) [[2,1,1],[1,2,1],[1,1,2]]
 *
 * C = Σ C_t is the second-moment (covariance) matrix of the solid about the
 * origin, and the inertia tensor about the origin is I = ρ (tr(C)·𝟙 − C).
 * It is moved to the centroid with the parallel-axis theorem.
 *
 * References: Mirtich, B. (1996). Fast and Accurate Computation of
 * Polyhedral Mass Properties. Journal of Graphics Tools 1(2), 31–50.
 * Tonon, F. (2004). Explicit Exact Formulas for the 3-D Tetrahedron Inertia
 * Tensor in Terms of its Vertex Coordinates. Journal of Mathematics and
 * Statistics 1(1), 8–11.
 *
 * Inputs in metres, body axes. The result is exact for the mesh (up to
 * rounding); how well the mesh represents the part is the user's file.
 */
import type { Mat3 } from "../core/mat3.ts";
import type { Method, Result } from "../core/result.ts";
import { combineValidity } from "../core/validity.ts";
import type { Triple } from "../core/vector.ts";

export const POLYHEDRAL_MASS_PROPERTIES: Method = {
  id: "polyhedral-mass-properties",
  name: "Mass properties of a homogeneous closed triangle mesh by signed tetrahedra (divergence theorem)",
  references: [
    { citation: "Mirtich, B. (1996). Fast and Accurate Computation of Polyhedral Mass Properties. Journal of Graphics Tools 1(2), 31–50." },
    {
      citation:
        "Tonon, F. (2004). Explicit Exact Formulas for the 3-D Tetrahedron Inertia Tensor in Terms of its Vertex Coordinates. Journal of Mathematics and Statistics 1(1), 8–11.",
    },
  ],
};

export interface MeshTopology {
  readonly triangles: number;
  /** Edges used by exactly two triangles in opposite directions. */
  readonly manifoldEdges: number;
  /** Edges used once: holes in the surface. */
  readonly boundaryEdges: number;
  /** Edges used more than twice, or twice in the same direction (flipped triangles). */
  readonly badEdges: number;
  /** Triangles with (almost) zero area. */
  readonly degenerate: number;
  /** Closed and consistently oriented: volume and inertia are meaningful. */
  readonly closed: boolean;
}

/** Edge check of mini-design 005: every edge shared by exactly two triangles in opposite directions. */
export function meshTopology(tris: ArrayLike<number>, weldTolerance: number): MeshTopology {
  const count = Math.floor(tris.length / 9);
  const ids = new Map<string, number>();
  const vertexId = (i: number): number => {
    const key = `${Math.round(tris[i]! / weldTolerance)}|${Math.round(tris[i + 1]! / weldTolerance)}|${Math.round(tris[i + 2]! / weldTolerance)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
  const edges = new Map<string, number>(); // "a>b" → count of directed uses
  let degenerate = 0;
  for (let t = 0; t < count; t++) {
    const v = [vertexId(t * 9), vertexId(t * 9 + 3), vertexId(t * 9 + 6)] as const;
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) {
      degenerate++;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const key = `${v[k]}>${v[(k + 1) % 3]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let manifold = 0;
  let boundary = 0;
  let bad = 0;
  const seen = new Set<string>();
  for (const [key, n] of edges) {
    if (seen.has(key)) continue;
    const [a, b] = key.split(">");
    const reverse = `${b}>${a}`;
    const m = edges.get(reverse) ?? 0;
    seen.add(key);
    seen.add(reverse);
    if (n === 1 && m === 1) manifold++;
    else if (n + m === 1) boundary++;
    else bad++;
  }
  return { triangles: count, manifoldEdges: manifold, boundaryEdges: boundary, badEdges: bad, degenerate, closed: boundary === 0 && bad === 0 && manifold > 0 };
}

export interface MeshGeometry {
  /** m³, positive for outward-facing triangles. */
  readonly volume: number;
  /** m² */
  readonly surfaceArea: number;
  /** Centroid of the solid, m. */
  readonly centroid: Triple;
  /** Second moments about the centroid per unit density, row-major, m⁵ (multiply by ρ for kg·m²). */
  readonly unitInertia: Mat3;
}

/** Volume, surface, centroid and unit-density inertia of a closed mesh (metres). */
export function meshGeometry(tris: ArrayLike<number>): MeshGeometry {
  let volume = 0;
  let area = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  // Covariance about the origin, symmetric: xx, yy, zz, xy, xz, yz.
  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const ax = tris[i]!, ay = tris[i + 1]!, az = tris[i + 2]!;
    const bx = tris[i + 3]!, by = tris[i + 4]!, bz = tris[i + 5]!;
    const cx = tris[i + 6]!, cy = tris[i + 7]!, cz = tris[i + 8]!;
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    volume += det / 6;
    mx += (det / 24) * (ax + bx + cx);
    my += (det / 24) * (ay + by + cy);
    mz += (det / 24) * (az + bz + cz);
    // A Ĉ Aᵀ entries: (1/120)(Σ_i p_i q_i + (Σ p)(Σ q)) for coordinates p, q of the three vertices.
    const s = (p0: number, p1: number, p2: number, q0: number, q1: number, q2: number) =>
      (p0 * q0 + p1 * q1 + p2 * q2 + (p0 + p1 + p2) * (q0 + q1 + q2)) / 120;
    cxx += det * s(ax, bx, cx, ax, bx, cx);
    cyy += det * s(ay, by, cy, ay, by, cy);
    czz += det * s(az, bz, cz, az, bz, cz);
    cxy += det * s(ax, bx, cx, ay, by, cy);
    cxz += det * s(ax, bx, cx, az, bz, cz);
    cyz += det * s(ay, by, cy, az, bz, cz);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  if (!(Math.abs(volume) > 0)) throw new RangeError("The mesh encloses no volume.");
  const centroid: Triple = [mx / volume, my / volume, mz / volume];
  // Covariance about the centroid: C_c = C − V c cᵀ.
  const [gx, gy, gz] = centroid;
  const Cxx = cxx - volume * gx * gx;
  const Cyy = cyy - volume * gy * gy;
  const Czz = czz - volume * gz * gz;
  const Cxy = cxy - volume * gx * gy;
  const Cxz = cxz - volume * gx * gz;
  const Cyz = cyz - volume * gy * gz;
  const trace = Cxx + Cyy + Czz;
  const unitInertia: Mat3 = [trace - Cxx, -Cxy, -Cxz, -Cxy, trace - Cyy, -Cyz, -Cxz, -Cyz, trace - Czz];
  return { volume, surfaceArea: area, centroid, unitInertia };
}

export interface MeshMassProperties extends MeshGeometry {
  readonly topology: MeshTopology;
  /** kg/m³ */
  readonly density: number;
  /** kg */
  readonly mass: number;
  /** About the centroid, body axes, kg·m², row-major. */
  readonly inertia: Mat3;
}

/**
 * Mass properties of a homogeneous part from its closed mesh (metres) and
 * its density. Throws when the mesh is not closed and consistently
 * oriented: then volume and inertia mean nothing.
 */
export function meshMassProperties(tris: ArrayLike<number>, density: number): Result<MeshMassProperties> {
  if (!(density > 0)) throw new RangeError(`Density must be positive, got ${density}.`);
  let extent = 0;
  for (let i = 0; i < tris.length; i++) extent = Math.max(extent, Math.abs(tris[i]!));
  const topology = meshTopology(tris, Math.max(extent, 1e-3) * 1e-9);
  if (!topology.closed) {
    throw new RangeError(
      `The mesh is not a closed, consistently oriented surface (${topology.boundaryEdges} open edges, ${topology.badEdges} non-manifold or flipped edges).`,
    );
  }
  const g = meshGeometry(tris);
  if (!(g.volume > 0)) throw new RangeError("The mesh is inside out (negative volume): its triangles face inwards.");
  const inertia = g.unitInertia.map((v) => v * density) as unknown as Mat3;
  return {
    value: { ...g, topology, density, mass: density * g.volume, inertia },
    provenance: "CALCULATED",
    methods: [POLYHEDRAL_MASS_PROPERTIES],
    assumptions: [
      { id: "uniform-density", description: "Uniform density: right for resin and solid parts; FDM parts with infill must be weighed and their inertia is approximate." },
      { id: "mesh-is-the-part", description: "The mesh is the part: its accuracy is that of the exported file." },
    ],
    validity: combineValidity([]),
  };
}
