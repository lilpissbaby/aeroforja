/**
 * Geometry of the published validation cases of mini-design 006, built on
 * the lattice so the reference solver (Node) and the WebGPU solver (the
 * app's «Validar en tu GPU») run exactly the same setups.
 */
import { EQUILIBRIUM, FLUID, OUTLET, SOLID, WALL } from "./lattice.ts";
import type { Grid, Vec3 } from "./reference.ts";

/** Box of the sphere cases: 20 D long, 12 D wide and high, centre 6 D from the inlet. */
export const SPHERE_BOX = { length: 20, width: 12, ahead: 6 } as const;

export interface CaseSetup {
  readonly grid: Grid;
  readonly flags: Uint8Array;
  readonly tau0: number;
  /** Uniform velocity of the equilibrium cells (lattice units). */
  readonly boundaryVelocity: Vec3;
  /** Per-cell inlet velocity, when not uniform. */
  readonly boundaryVelocityAt?: (i: number, j: number, k: number) => Vec3;
  /** Initial state of the fluid. */
  readonly initial: (i: number, j: number, k: number) => { rho: number; u: Vec3 };
  /** Mean velocity and length that define Re and the coefficients (lattice units). */
  readonly referenceSpeed: number;
  readonly referenceLength: number;
  /** Reference area for the drag coefficient (lattice units²; depth 1 in 2D). */
  readonly referenceArea: number;
}

/**
 * Schäfer & Turek (1996), benchmark 2D-1: channel 2.2 m × 0.41 m with
 * no-slip walls, parabolic inflow with U_max = 0.3 m/s (mean 0.2 m/s),
 * cylinder of D = 0.1 m centred at (0.2 m, 0.2 m), ν = 10⁻³ m²/s, Re = 20.
 * Laid out with D = `d` cells; walls half-way between the wall and first
 * fluid cells (half-way bounce-back). One periodic layer in z.
 */
export function schaferTurek2D1(d = 20, uMaxLattice = 0.05): CaseSetup & { readonly probeFront: Vec3; readonly probeBack: Vec3; readonly dx: number } {
  const dx = 0.1 / d;
  const h = Math.round(0.41 / dx); // fluid cells across the channel
  const nx = Math.round(2.2 / dx) + 1;
  const ny = h + 2;
  const nz = 1;
  const flags = new Uint8Array(nx * ny).fill(FLUID);
  const xc = 0.2 / dx;
  const yc = 0.5 + 0.2 / dx;
  const r = d / 2;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = i + nx * j;
      if (j === 0 || j === ny - 1) flags[c] = WALL;
      else if (i === 0) flags[c] = EQUILIBRIUM;
      else if (i === nx - 1) flags[c] = OUTLET;
      else if ((i - xc) ** 2 + (j - yc) ** 2 <= r * r) flags[c] = SOLID;
    }
  const profile = (j: number): Vec3 => {
    const y = j - 0.5;
    return [Math.max(0, (4 * uMaxLattice * y * (h - y)) / (h * h)), 0, 0];
  };
  const mean = (2 / 3) * uMaxLattice;
  const nu = (mean * d) / 20;
  return {
    grid: { nx, ny, nz, periodic: [false, false, true] },
    flags,
    tau0: 3 * nu + 0.5,
    boundaryVelocity: [0, 0, 0],
    boundaryVelocityAt: (_i, j) => profile(j),
    initial: (i, j) => ({ rho: 1, u: (i - xc) ** 2 + (j - yc) ** 2 <= r * r ? [0, 0, 0] : profile(j) }),
    referenceSpeed: mean,
    referenceLength: d,
    referenceArea: d,
    probeFront: [0.15 / dx, yc, 0],
    probeBack: [0.25 / dx, yc, 0],
    dx,
  };
}

/**
 * A sphere of `d` cells in a box `length` D long and `width` D wide and
 * high, `ahead` D from the inlet to its centre; equilibrium faces with the
 * free stream and an outlet behind. Flow along +x.
 */
export function sphereInBox(
  d: number,
  reynolds: number,
  uLattice = 0.05,
  box: { readonly length: number; readonly width: number; readonly ahead: number } = SPHERE_BOX,
): CaseSetup & { readonly centre: Vec3 } {
  const nx = Math.round(box.length * d);
  const ny = Math.round(box.width * d);
  const nz = ny;
  const centre: Vec3 = [box.ahead * d, (ny - 1) / 2, (nz - 1) / 2];
  const flags = new Uint8Array(nx * ny * nz).fill(FLUID);
  const r = d / 2;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (i === nx - 1) flags[c] = OUTLET;
        else if (i === 0 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) flags[c] = EQUILIBRIUM;
        else if ((i - centre[0]) ** 2 + (j - centre[1]) ** 2 + (k - centre[2]) ** 2 <= r * r) flags[c] = SOLID;
      }
  const u: Vec3 = [uLattice, 0, 0];
  const nu = (uLattice * d) / reynolds;
  return {
    grid: { nx, ny, nz },
    flags,
    tau0: 3 * nu + 0.5,
    boundaryVelocity: u,
    initial: (i, j, k) => ({ rho: 1, u: (i - centre[0]) ** 2 + (j - centre[1]) ** 2 + (k - centre[2]) ** 2 <= r * r ? [0, 0, 0] : u }),
    referenceSpeed: uLattice,
    referenceLength: d,
    referenceArea: (Math.PI * d * d) / 4,
    centre,
  };
}

/**
 * A circular cylinder of `d` cells across the flow, spanning a periodic box
 * in z (4 D deep), 12 D × 8 D in x and y. Flow along +x.
 */
export function cylinderInBox(d: number, reynolds: number, uLattice = 0.05): CaseSetup & { readonly centre: Vec3 } {
  const nx = Math.round(12 * d);
  const ny = Math.round(8 * d);
  const nz = Math.round(4 * d);
  const centre: Vec3 = [2.5 * d, (ny - 1) / 2, 0];
  const flags = new Uint8Array(nx * ny * nz).fill(FLUID);
  const r = d / 2;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (i === nx - 1) flags[c] = OUTLET;
        else if (i === 0 || j === 0 || j === ny - 1) flags[c] = EQUILIBRIUM;
        else if ((i - centre[0]) ** 2 + (j - centre[1]) ** 2 <= r * r) flags[c] = SOLID;
      }
  const u: Vec3 = [uLattice, 0, 0];
  const nu = (uLattice * d) / reynolds;
  return {
    grid: { nx, ny, nz, periodic: [false, false, true] },
    flags,
    tau0: 3 * nu + 0.5,
    boundaryVelocity: u,
    initial: (i, j) => ({ rho: 1, u: (i - centre[0]) ** 2 + (j - centre[1]) ** 2 <= r * r ? [0, 0, 0] : u }),
    referenceSpeed: uLattice,
    referenceLength: d,
    referenceArea: d * nz,
    centre,
  };
}
