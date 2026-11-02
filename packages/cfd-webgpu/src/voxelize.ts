/**
 * From triangle meshes in body axes (FRD, metres) to solid cells of the
 * lattice (mini-design 006, «Voxelización»).
 *
 * A cell is solid when its centre lies inside a closed mesh, by ray parity
 * along x. Walls then sit, on average, where they are: half-way bounce-back
 * puts them half a cell out of the last solid centre. A piece thinner than a
 * cell (a 3 mm plate on a 5 mm grid) would hold no centre and vanish, so rays
 * along y and z are cast too, and every inside interval that holds no cell
 * centre marks its nearest cell: the plate stays, one cell thick. Meshes that
 * are not closed (an STL with holes) are marked by triangle–box overlap
 * instead (Akenine-Möller 2001), which can only thicken them.
 */
import type { Vec3 } from "./reference.ts";

export interface VoxelGrid {
  /** Centre of cell (0, 0, 0), FRD metres. */
  readonly origin: Vec3;
  /** Cell size, m. */
  readonly dx: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export interface MeshInput {
  readonly id: string;
  /** Nine numbers per triangle, FRD metres. */
  readonly triangles: Float64Array;
}

export interface MeshVoxels {
  readonly id: string;
  readonly closed: boolean;
  /** Cells this mesh made solid (with overlaps counted once per mesh). */
  readonly cells: number;
}

/** Ray offsets (in cells) that keep rays off the vertices and edges of meshes drawn on round numbers. */
const JITTER_B = 1.2345678e-6;
const JITTER_C = 2.3456789e-6;

/** True when every edge is shared by exactly two triangles (positions compared to 1 µm). */
export function isClosed(triangles: Float64Array): boolean {
  const key = (o: number) => `${Math.round(triangles[o]! * 1e6)},${Math.round(triangles[o + 1]! * 1e6)},${Math.round(triangles[o + 2]! * 1e6)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = v[e]!, b = v[(e + 1) % 3]!;
      if (a === b) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  if (edges.size === 0) return false;
  for (const count of edges.values()) if (count !== 2) return false;
  return true;
}

/**
 * Casts the rays of one axis through a mesh: for every ray, the sorted
 * coordinates (in cells, along the ray axis) where it crosses the surface.
 */
function castRays(grid: VoxelGrid, tris: Float64Array, axis: 0 | 1 | 2): Map<number, number[]> {
  const b = axis === 0 ? 1 : 0;
  const c = axis === 2 ? 1 : 2;
  const size = [grid.nx, grid.ny, grid.nz] as const;
  const nb = size[b], nc = size[c];
  const rows = new Map<number, number[]>();
  for (let t = 0; t < tris.length; t += 9) {
    // Triangle in cell coordinates.
    const p: number[][] = [0, 3, 6].map((o) => [0, 1, 2].map((d) => (tris[t + o + d]! - grid.origin[d]!) / grid.dx));
    const [p0, p1, p2] = p as [number[], number[], number[]];
    const bmin = Math.max(0, Math.ceil(Math.min(p0[b]!, p1[b]!, p2[b]!) - JITTER_B));
    const bmax = Math.min(nb - 1, Math.floor(Math.max(p0[b]!, p1[b]!, p2[b]!) - JITTER_B));
    const cmin = Math.max(0, Math.ceil(Math.min(p0[c]!, p1[c]!, p2[c]!) - JITTER_C));
    const cmax = Math.min(nc - 1, Math.floor(Math.max(p0[c]!, p1[c]!, p2[c]!) - JITTER_C));
    if (bmin > bmax || cmin > cmax) continue;
    // Edge functions in the (b, c) plane.
    const area = (p1[b]! - p0[b]!) * (p2[c]! - p0[c]!) - (p2[b]! - p0[b]!) * (p1[c]! - p0[c]!);
    if (area === 0) continue;
    for (let jb = bmin; jb <= bmax; jb++) {
      const yb = jb + JITTER_B;
      for (let jc = cmin; jc <= cmax; jc++) {
        const yc = jc + JITTER_C;
        const w0 = ((p1[b]! - yb) * (p2[c]! - yc) - (p2[b]! - yb) * (p1[c]! - yc)) / area;
        const w1 = ((p2[b]! - yb) * (p0[c]! - yc) - (p0[b]! - yb) * (p2[c]! - yc)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const at = w0 * p0[axis]! + w1 * p1[axis]! + w2 * p2[axis]!;
        const key = jb + nb * jc;
        const list = rows.get(key);
        if (list === undefined) rows.set(key, [at]);
        else list.push(at);
      }
    }
  }
  for (const list of rows.values()) list.sort((x, y) => x - y);
  return rows;
}

/** Akenine-Möller (2001) triangle / axis-aligned box overlap, box centred at the origin with half size h. */
function triangleBoxOverlap(v0: Vec3, v1: Vec3, v2: Vec3, h: number): boolean {
  const e0: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e1: Vec3 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
  const e2: Vec3 = [v0[0] - v2[0], v0[1] - v2[1], v0[2] - v2[2]];
  const axisTest = (ax: Vec3): boolean => {
    const p0 = ax[0] * v0[0] + ax[1] * v0[1] + ax[2] * v0[2];
    const p1 = ax[0] * v1[0] + ax[1] * v1[1] + ax[2] * v1[2];
    const p2 = ax[0] * v2[0] + ax[1] * v2[1] + ax[2] * v2[2];
    const r = h * (Math.abs(ax[0]) + Math.abs(ax[1]) + Math.abs(ax[2]));
    return !(Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r);
  };
  for (const e of [e0, e1, e2]) {
    if (!axisTest([0, -e[2], e[1]])) return false;
    if (!axisTest([e[2], 0, -e[0]])) return false;
    if (!axisTest([-e[1], e[0], 0])) return false;
  }
  for (let d = 0; d < 3; d++) {
    if (Math.min(v0[d]!, v1[d]!, v2[d]!) > h || Math.max(v0[d]!, v1[d]!, v2[d]!) < -h) return false;
  }
  const nrm: Vec3 = [e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]];
  const d = -(nrm[0] * v0[0] + nrm[1] * v0[1] + nrm[2] * v0[2]);
  const r = h * (Math.abs(nrm[0]) + Math.abs(nrm[1]) + Math.abs(nrm[2]));
  return Math.abs(d) <= r;
}

/** Marks the solid cells of every mesh in `solid` (1 = solid). */
export function voxelize(grid: VoxelGrid, meshes: readonly MeshInput[], solid: Uint8Array): MeshVoxels[] {
  const { nx, ny, nz } = grid;
  if (solid.length !== nx * ny * nz) throw new RangeError("solid must have one entry per cell");
  const out: MeshVoxels[] = [];
  for (const mesh of meshes) {
    const mine = new Uint8Array(solid.length);
    const closed = isClosed(mesh.triangles);
    const cellIndex = (a: number, axis: 0 | 1 | 2, jb: number, jc: number): number => {
      const ijk = axis === 0 ? [a, jb, jc] : axis === 1 ? [jb, a, jc] : [jb, jc, a];
      return ijk[0]! + nx * (ijk[1]! + ny * ijk[2]!);
    };
    if (closed) {
      for (const axis of [0, 1, 2] as const) {
        const size = [nx, ny, nz][axis]!;
        const nb = axis === 0 ? ny : nx;
        for (const [key, xs] of castRays(grid, mesh.triangles, axis)) {
          const jb = key % nb;
          const jc = Math.floor(key / nb);
          for (let p = 0; p + 1 < xs.length; p += 2) {
            const a = xs[p]!, bnd = xs[p + 1]!;
            const lo = Math.ceil(a), hi = Math.floor(bnd);
            if (axis === 0) for (let i = Math.max(0, lo); i <= Math.min(size - 1, hi); i++) mine[cellIndex(i, axis, jb, jc)] = 1;
            if (lo > hi) {
              // Thinner than a cell along this ray: keep its nearest cell.
              const i = Math.round((a + bnd) / 2);
              if (i >= 0 && i < size) mine[cellIndex(i, axis, jb, jc)] = 1;
            }
          }
        }
      }
    } else {
      const h = 0.5;
      const t = mesh.triangles;
      for (let o = 0; o < t.length; o += 9) {
        const v = [0, 3, 6].map((k) => [0, 1, 2].map((d) => (t[o + k + d]! - grid.origin[d]!) / grid.dx)) as [number[], number[], number[]];
        const lo = [0, 1, 2].map((d) => Math.max(0, Math.ceil(Math.min(v[0][d]!, v[1][d]!, v[2][d]!) - h)));
        const hi = [0, 1, 2].map((d, k) => Math.min([nx, ny, nz][k]! - 1, Math.floor(Math.max(v[0][d]!, v[1][d]!, v[2][d]!) + h)));
        for (let k = lo[2]!; k <= hi[2]!; k++)
          for (let j = lo[1]!; j <= hi[1]!; j++)
            for (let i = lo[0]!; i <= hi[0]!; i++) {
              const rel = (p: number[]): Vec3 => [p[0]! - i, p[1]! - j, p[2]! - k];
              if (triangleBoxOverlap(rel(v[0]), rel(v[1]), rel(v[2]), h)) mine[i + nx * (j + ny * k)] = 1;
            }
      }
    }
    let cells = 0;
    for (let c = 0; c < mine.length; c++)
      if (mine[c] === 1) {
        cells++;
        solid[c] = 1;
      }
    out.push({ id: mesh.id, closed, cells });
  }
  return out;
}

/** Closed box mesh (12 triangles, outward faces) from min to max, FRD metres. */
export function boxMesh(min: Vec3, max: Vec3): Float64Array {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  return Float64Array.from(faces.flatMap((f) => f.flatMap((i) => v[i]!)));
}

/** Closed UV-sphere mesh of radius r centred at c. */
export function sphereMesh(c: Vec3, r: number, segments = 48, rings = 24): Float64Array {
  const out: number[] = [];
  const point = (ri: number, si: number): number[] => {
    const th = (Math.PI * ri) / rings;
    const ph = (2 * Math.PI * si) / segments;
    return [c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.sin(th) * Math.sin(ph), c[2] + r * Math.cos(th)];
  };
  for (let ri = 0; ri < rings; ri++)
    for (let si = 0; si < segments; si++) {
      const a = point(ri, si), b = point(ri + 1, si), cc = point(ri + 1, si + 1), d = point(ri, si + 1);
      if (ri > 0) out.push(...a, ...b, ...d);
      if (ri < rings - 1) out.push(...b, ...cc, ...d);
    }
  return Float64Array.from(out);
}
