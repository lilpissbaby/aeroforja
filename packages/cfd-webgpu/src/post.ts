/**
 * Post-processing of a CFD run on the CPU: the surface mesh coloured by Cp,
 * slices of Cp, speed and vorticity, and streamlines of the mean flow.
 * Fields are vec4 per cell: (ρ − 1 or ρ, ux, uy, uz) in lattice units.
 */
import { SOLID, WALL } from "./lattice.ts";
import type { Vec3 } from "./reference.ts";
import { cpFromDensity, U_LATTICE, type CfdPlan } from "./tunnel.ts";

/** Splits every triangle until no edge is longer than `maxEdge` (m). Positions and flat normals, FRD metres. */
export function subdivide(triangles: Float64Array, maxEdge: number): { positions: Float32Array; normals: Float32Array } {
  const pos: number[] = [];
  const nrm: number[] = [];
  const split = (a: Vec3, b: Vec3, c: Vec3, n: Vec3, depth: number): void => {
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const lbc = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    const lca = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
    const longest = Math.max(lab, lbc, lca);
    if (longest <= maxEdge || depth > 14) {
      pos.push(...a, ...b, ...c);
      nrm.push(...n, ...n, ...n);
      return;
    }
    const mid = (p: Vec3, q: Vec3): Vec3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if (longest === lab) {
      const m = mid(a, b);
      split(a, m, c, n, depth + 1);
      split(m, b, c, n, depth + 1);
    } else if (longest === lbc) {
      const m = mid(b, c);
      split(a, b, m, n, depth + 1);
      split(a, m, c, n, depth + 1);
    } else {
      const m = mid(c, a);
      split(a, b, m, n, depth + 1);
      split(m, b, c, n, depth + 1);
    }
  };
  for (let t = 0; t < triangles.length; t += 9) {
    const a: Vec3 = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!];
    const b: Vec3 = [triangles[t + 3]!, triangles[t + 4]!, triangles[t + 5]!];
    const c: Vec3 = [triangles[t + 6]!, triangles[t + 7]!, triangles[t + 8]!];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (l === 0) continue;
    split(a, b, c, [n[0]! / l, n[1]! / l, n[2]! / l], 0);
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm) };
}

/** Trilinear interpolation of component `comp` over the non-solid cells around p (cell coordinates); null if all are solid. */
export function sampleField(plan: CfdPlan, field: Float32Array, p: Vec3, comp: number): number | null {
  const { nx, ny, nz } = plan.grid;
  const x = Math.min(Math.max(p[0], 0), nx - 1.000001);
  const y = Math.min(Math.max(p[1], 0), ny - 1.000001);
  const z = Math.min(Math.max(p[2], 0), nz - 1.000001);
  const i0 = Math.floor(x), j0 = Math.floor(y), k0 = Math.floor(z);
  const fx = x - i0, fy = y - j0, fz = z - k0;
  let acc = 0, w = 0;
  for (let corner = 0; corner < 8; corner++) {
    const i = i0 + (corner & 1), j = j0 + ((corner >> 1) & 1), k = k0 + ((corner >> 2) & 1);
    const c = i + nx * (j + ny * k);
    const t = plan.flags[c];
    if (t === SOLID || t === WALL) continue;
    const wc = (corner & 1 ? fx : 1 - fx) * ((corner >> 1) & 1 ? fy : 1 - fy) * ((corner >> 2) & 1 ? fz : 1 - fz);
    acc += field[4 * c + comp]! * wc;
    w += wc;
  }
  return w > 1e-6 ? acc / w : null;
}

/**
 * Cp at each vertex, sampled one cell off the surface along its normal (two
 * if that cell is still inside the body). `densityOffset` is 0 for a field of
 * ρ − 1 (the mean) and 1 for a field of ρ (instantaneous).
 */
export function surfaceCp(plan: CfdPlan, field: Float32Array, positions: Float32Array, normals: Float32Array, densityOffset: 0 | 1): Float32Array {
  const { origin, dx } = plan.grid;
  const out = new Float32Array(positions.length / 3);
  for (let v = 0; v < out.length; v++) {
    let value: number | null = null;
    for (const reach of [1, 2, 3]) {
      const p: Vec3 = [
        (positions[3 * v]! + reach * dx * normals[3 * v]! - origin[0]) / dx,
        (positions[3 * v + 1]! + reach * dx * normals[3 * v + 1]! - origin[1]) / dx,
        (positions[3 * v + 2]! + reach * dx * normals[3 * v + 2]! - origin[2]) / dx,
      ];
      value = sampleField(plan, field, p, 0);
      if (value !== null) break;
    }
    out[v] = value === null ? Number.NaN : cpFromDensity(value - densityOffset);
  }
  return out;
}

export type SliceQuantity = "cp" | "speed" | "vorticity";

/**
 * Values of a slice for display: Cp, |u|/V∞ or |ω|·L/V∞ (L the drone's
 * length). `planes` holds the plane before, at and after the slice (vec4 per
 * cell) so the vorticity can take derivatives across it; NaN in solid cells.
 */
export function sliceValues(plan: CfdPlan, axis: 0 | 1 | 2, index: number, planes: readonly [Float32Array, Float32Array, Float32Array], quantity: SliceQuantity, densityOffset: 0 | 1): { values: Float32Array; width: number; height: number } {
  const { nx, ny, nz } = plan.grid;
  const width = axis === 0 ? ny : nx;
  const height = axis === 2 ? ny : nz;
  const values = new Float32Array(width * height);
  const mid = planes[1];
  const cellOf = (a: number, b: number, idx: number): number => (axis === 0 ? idx + nx * (a + ny * b) : axis === 1 ? a + nx * (idx + ny * b) : a + nx * (b + ny * idx));
  const at = (pl: Float32Array, a: number, b: number, comp: number): number => pl[4 * (a + width * b) + comp]!;
  const scaleLen = plan.length / plan.grid.dx; // L in cells
  for (let b = 0; b < height; b++)
    for (let a = 0; a < width; a++) {
      const c = cellOf(a, b, index);
      const t = plan.flags[c];
      if (t === SOLID || t === WALL) {
        values[a + width * b] = Number.NaN;
        continue;
      }
      if (quantity === "cp") values[a + width * b] = cpFromDensity(at(mid, a, b, 0) - densityOffset);
      else if (quantity === "speed") values[a + width * b] = Math.hypot(at(mid, a, b, 1), at(mid, a, b, 2), at(mid, a, b, 3)) / U_LATTICE;
      else {
        // Central differences in the plane (a, b) and across it (planes 0 and 2).
        const d = (comp: number, dir: 0 | 1 | 2): number => {
          if (dir === 2) return (planes[2][4 * (a + width * b) + comp]! - planes[0][4 * (a + width * b) + comp]!) / 2;
          const a0 = dir === 0 ? Math.max(0, a - 1) : a, a1 = dir === 0 ? Math.min(width - 1, a + 1) : a;
          const b0 = dir === 1 ? Math.max(0, b - 1) : b, b1 = dir === 1 ? Math.min(height - 1, b + 1) : b;
          return (at(mid, a1, b1, comp) - at(mid, a0, b0, comp)) / Math.max(1, a1 - a0 + b1 - b0);
        };
        // Map plane directions (a, b, across) to body axes.
        const axes: [number, number, number] = axis === 0 ? [1, 2, 0] : axis === 1 ? [0, 2, 1] : [0, 1, 2];
        const grad = (comp: number, bodyAxis: number): number => d(comp, axes.indexOf(bodyAxis) as 0 | 1 | 2);
        const wx = grad(3, 1) - grad(2, 2);
        const wy = grad(1, 2) - grad(3, 0);
        const wz = grad(2, 0) - grad(1, 1);
        values[a + width * b] = (Math.hypot(wx, wy, wz) * scaleLen) / U_LATTICE;
      }
    }
  return { values, width, height };
}

/**
 * Streamlines of a velocity field (vec4 per cell) from seeds in FRD metres,
 * RK4 with a step of half a cell, until they leave the box, hit the body or
 * reach `maxLength` (m). Each line: x, y, z (FRD m) and |u|/V∞ per point.
 */
export function streamlines(plan: CfdPlan, field: Float32Array, seeds: readonly Vec3[], maxLength: number): Float32Array[] {
  const { origin, dx, nx, ny, nz } = plan.grid;
  const h = 0.5;
  const vel = (p: Vec3): Vec3 | null => {
    const u = sampleField(plan, field, p, 1);
    const v = sampleField(plan, field, p, 2);
    const w = sampleField(plan, field, p, 3);
    if (u === null || v === null || w === null) return null;
    const s = Math.hypot(u, v, w);
    if (s < 1e-9) return null;
    return [u / s, v / s, w / s];
  };
  const out: Float32Array[] = [];
  for (const seed of seeds) {
    let p: Vec3 = [(seed[0] - origin[0]) / dx, (seed[1] - origin[1]) / dx, (seed[2] - origin[2]) / dx];
    const pts: number[] = [];
    const maxSteps = Math.ceil(maxLength / dx / h);
    for (let s = 0; s < maxSteps; s++) {
      if (p[0] < 1 || p[1] < 1 || p[2] < 1 || p[0] > nx - 2 || p[1] > ny - 2 || p[2] > nz - 2) break;
      const speed = Math.hypot(sampleField(plan, field, p, 1) ?? 0, sampleField(plan, field, p, 2) ?? 0, sampleField(plan, field, p, 3) ?? 0) / U_LATTICE;
      pts.push(origin[0] + p[0] * dx, origin[1] + p[1] * dx, origin[2] + p[2] * dx, speed);
      const k1 = vel(p);
      if (k1 === null) break;
      const p2: Vec3 = [p[0] + 0.5 * h * k1[0], p[1] + 0.5 * h * k1[1], p[2] + 0.5 * h * k1[2]];
      const k2 = vel(p2);
      if (k2 === null) break;
      const p3: Vec3 = [p[0] + 0.5 * h * k2[0], p[1] + 0.5 * h * k2[1], p[2] + 0.5 * h * k2[2]];
      const k3 = vel(p3);
      if (k3 === null) break;
      const p4: Vec3 = [p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2]];
      const k4 = vel(p4);
      if (k4 === null) break;
      p = [
        p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
        p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
        p[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      ];
    }
    if (pts.length >= 8) out.push(Float32Array.from(pts));
  }
  return out;
}

/**
 * A rake of seeds across the drone, `ahead` metres in front of its nose:
 * `columns` × `rows` points over its span and height (plus a margin).
 */
export function rakeSeeds(min: Vec3, max: Vec3, ahead: number, columns: number, rows: number): Vec3[] {
  const seeds: Vec3[] = [];
  const x = max[0] + ahead;
  const ym = 0.06 * (max[1] - min[1]);
  const zm = 0.5 * Math.max(max[2] - min[2], 0.04 * (max[1] - min[1]));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const y = min[1] - ym + ((c + 0.5) / columns) * (max[1] - min[1] + 2 * ym);
      const z = min[2] - zm + ((r + 0.5) / rows) * (max[2] - min[2] + 2 * zm);
      seeds.push([x, y, z]);
    }
  return seeds;
}
