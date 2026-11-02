/**
 * Reference lattice Boltzmann solver in TypeScript (Float64), the ground
 * truth for the WGSL kernels (kernels.ts) and the solver the validation
 * cases run on in Node. Same algorithm, same order of operations:
 *
 * - D3Q19, populations stored shifted, g_i = f_i − w_i (DDF-shifting;
 *   Skordos 1993; Lehmann et al. 2022), structure of arrays g[i·N + n].
 * - One fused step per time step, pull scheme: g_i(x, t+1) = g*_i(x − c_i, t),
 *   or half-way bounce-back g*_ī(x, t) when x − c_i is a solid or wall cell
 *   (Ladd 1994).
 * - Regularized BGK collision (Latt & Chopard 2006) with the Smagorinsky
 *   subgrid model of Hou et al. (1996).
 * - Equilibrium cells (inlet and far field): f = f_eq(ρ_in, u_b), with the
 *   imposed velocity and the density of the neighbour inside the box.
 *   Outlet cells: f = f_eq(ρ = 1, u_in), the pressure reference. Both read
 *   the neighbour's moments from the previous step.
 * - Force on the body by momentum exchange (Ladd 1994; Mei et al. 2002):
 *   each bounce-back link of a SOLID cell gives ΔF = −2 c_i f_ī*(x, t).
 *
 * Lattice units throughout (Δx = Δt = 1, ρ∞ = 1): unit conversion lives in
 * units.ts.
 */
import { fastFluidStep } from "./fast-step.ts";
import { CX, CY, CZ, EQUILIBRIUM, FLUID, OPPOSITE, OUTLET, Q, SOLID, W, WALL, smagorinskyFactor } from "./lattice.ts";

export type Vec3 = readonly [number, number, number];

const CXF = Float64Array.from(CX);
const CYF = Float64Array.from(CY);
const CZF = Float64Array.from(CZ);
const WF = Float64Array.from(W);
const OPPI = Int32Array.from(OPPOSITE);
const geq = new Float64Array(Q);

/**
 * The neighbour inside the box of a cell on a face: along x if the cell is on
 * an x face, else y, else z (edges and corners take the first). −1 for an
 * interior cell. The WGSL kernel uses the same rule.
 */
export function inwardNeighbour(i: number, j: number, k: number, nx: number, ny: number, nz: number): number {
  let si = i, sj = j, sk = k;
  if (i === 0 && nx > 1) si = 1;
  else if (i === nx - 1 && nx > 1) si = nx - 2;
  else if (j === 0 && ny > 1) sj = 1;
  else if (j === ny - 1 && ny > 1) sj = ny - 2;
  else if (k === 0 && nz > 1) sk = 1;
  else if (k === nz - 1 && nz > 1) sk = nz - 2;
  else return -1;
  return si + nx * (sj + ny * sk);
}

export interface Grid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Periodic axes (validation cases). The tunnel box closes every face with boundary cells instead. */
  readonly periodic?: readonly [boolean, boolean, boolean];
}

export interface ReferenceOptions {
  readonly grid: Grid;
  /** One cell type per cell, n = i + nx·(j + ny·k). */
  readonly flags: Uint8Array;
  /** Molecular relaxation time τ₀ = 3ν + ½ (lattice units). */
  readonly tau0: number;
  /** Smagorinsky constant C_s (0 switches the model off). */
  readonly smagorinsky: number;
  /** Disable the unrolled bulk path (tests compare both). */
  readonly generalPathOnly?: boolean;
  /** Velocity imposed on EQUILIBRIUM cells (lattice units). */
  readonly boundaryVelocity: Vec3;
  /** Optional per-cell override of the imposed velocity (a parabolic inlet). */
  readonly boundaryVelocityAt?: (i: number, j: number, k: number) => Vec3;
  /** Point the moments are taken about, in cell coordinates. */
  readonly momentOrigin?: Vec3;
}

export interface InitialState {
  readonly rho: number;
  readonly u: Vec3;
}

/** Shifted equilibrium g_eq_i = f_eq_i − w_i for ρ, u. */
export function shiftedEquilibrium(i: number, rho: number, ux: number, uy: number, uz: number): number {
  const cu = CX[i]! * ux + CY[i]! * uy + CZ[i]! * uz;
  const uu = ux * ux + uy * uy + uz * uz;
  return W[i]! * (rho - 1 + rho * (3 * cu + 4.5 * cu * cu - 1.5 * uu));
}

export class ReferenceSolver {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly n: number;
  readonly flags: Uint8Array;
  /** Current populations (post-collision of the last step), shifted. */
  g: Float64Array;
  private next: Float64Array;
  /** Density and velocity of every cell after the last step (0 in solid cells). */
  readonly rho: Float64Array;
  readonly ux: Float64Array;
  readonly uy: Float64Array;
  readonly uz: Float64Array;
  /** Force and moment on the SOLID cells in the last step, lattice units. */
  force: [number, number, number] = [0, 0, 0];
  moment: [number, number, number] = [0, 0, 0];
  time = 0;
  private readonly tau0: number;
  private readonly smag: number;
  private readonly periodic: readonly [boolean, boolean, boolean];
  private readonly ub: Float64Array;
  private readonly origin: Vec3;
  /** Source cell of each pulled population, nb[q·N + n], −1 outside the box. */
  private readonly nb: Int32Array;
  /**
   * For boundary cells: the neighbour inside the box (along the first axis,
   * x then y then z, on whose face the cell lies) that an equilibrium cell
   * takes its density from and an outlet cell its velocity. −1 if none.
   */
  private readonly source: Int32Array;
  private readonly pulled = new Float64Array(Q);
  /** 1 where the unrolled bulk path applies: fluid, all neighbours inside the box (no wrap) and none solid. */
  private readonly fast: Uint8Array;
  private readonly offsets = new Int32Array(Q);
  private readonly macro = new Float64Array(4);

  constructor(options: ReferenceOptions) {
    const { nx, ny, nz } = options.grid;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.n = nx * ny * nz;
    if (options.flags.length !== this.n) throw new RangeError("flags must have one entry per cell");
    if (!(options.tau0 > 0.5)) throw new RangeError("τ₀ must be greater than ½");
    this.flags = options.flags;
    this.g = new Float64Array(Q * this.n);
    this.next = new Float64Array(Q * this.n);
    this.rho = new Float64Array(this.n).fill(1);
    this.ux = new Float64Array(this.n);
    this.uy = new Float64Array(this.n);
    this.uz = new Float64Array(this.n);
    this.tau0 = options.tau0;
    this.smag = smagorinskyFactor(options.smagorinsky);
    this.periodic = options.grid.periodic ?? [false, false, false];
    this.origin = options.momentOrigin ?? [0, 0, 0];
    this.ub = new Float64Array(3 * this.n);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = i + nx * (j + ny * k);
          const u = options.boundaryVelocityAt?.(i, j, k) ?? options.boundaryVelocity;
          this.ub[3 * c] = u[0];
          this.ub[3 * c + 1] = u[1];
          this.ub[3 * c + 2] = u[2];
        }
    this.nb = new Int32Array(Q * this.n);
    this.source = new Int32Array(this.n).fill(-1);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = i + nx * (j + ny * k);
          for (let q = 0; q < Q; q++) this.nb[q * this.n + c] = this.index(i - CX[q]!, j - CY[q]!, k - CZ[q]!);
          const t = this.flags[c];
          if (t === OUTLET || t === EQUILIBRIUM) {
            const s = inwardNeighbour(i, j, k, nx, ny, nz);
            if (t === OUTLET && s < 0) throw new RangeError("An outlet cell must lie on a face of the box");
            this.source[c] = s;
          }
        }
    // A single periodic layer in z (quasi-2D validation cases) pulls z-neighbours from itself.
    const flatZ = nz === 1 && this.periodic[2];
    for (let q = 0; q < Q; q++) this.offsets[q] = CX[q]! + nx * (CY[q]! + (flatZ ? 0 : ny * CZ[q]!));
    this.fast = new Uint8Array(this.n);
    if (!options.generalPathOnly) {
      for (let c = 0; c < this.n; c++) {
        if (this.flags[c] !== FLUID) continue;
        let ok = 1;
        for (let q = 1; q < Q && ok; q++) {
          const s = this.nb[q * this.n + c]!;
          if (s !== c - this.offsets[q]! || this.flags[s] === SOLID || this.flags[s] === WALL) ok = 0;
        }
        this.fast[c] = ok;
      }
    }
  }

  /** Sets every non-solid cell to the equilibrium of the given state. */
  initialize(state: (i: number, j: number, k: number) => InitialState): void {
    const { nx, ny, n } = this;
    for (let c = 0; c < n; c++) {
      const t = this.flags[c]!;
      if (t === SOLID || t === WALL) {
        for (let q = 0; q < Q; q++) this.g[q * n + c] = 0;
        this.rho[c] = 0;
        this.ux[c] = this.uy[c] = this.uz[c] = 0;
        continue;
      }
      const i = c % nx;
      const j = Math.floor(c / nx) % ny;
      const k = Math.floor(c / (nx * ny));
      const s = state(i, j, k);
      for (let q = 0; q < Q; q++) this.g[q * n + c] = shiftedEquilibrium(q, s.rho, s.u[0], s.u[1], s.u[2]);
      this.rho[c] = s.rho;
      this.ux[c] = s.u[0];
      this.uy[c] = s.u[1];
      this.uz[c] = s.u[2];
    }
    this.time = 0;
  }

  /** Index of the cell at (i, j, k) after periodic wrapping, or −1 outside the box. */
  private index(i: number, j: number, k: number): number {
    const { nx, ny, nz } = this;
    if (i < 0 || i >= nx) {
      if (!this.periodic[0]) return -1;
      i = (i + nx) % nx;
    }
    if (j < 0 || j >= ny) {
      if (!this.periodic[1]) return -1;
      j = (j + ny) % ny;
    }
    if (k < 0 || k >= nz) {
      if (!this.periodic[2]) return -1;
      k = (k + nz) % nz;
    }
    return i + nx * (j + ny * k);
  }

  step(): void {
    const { n, g, next, flags, nb, fast, offsets, macro } = this;
    const pulled = this.pulled;
    const cxs = CXF, cys = CYF, czs = CZF, ws = WF, opp = OPPI;
    let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0;
    const [ox, oy, oz] = this.origin;
    const tau0 = this.tau0;
    const smag = this.smag;
    for (let c = 0; c < n; c++) {
      const type = flags[c]!;
      if (type === SOLID || type === WALL) continue;
      if (fast[c] === 1) {
        fastFluidStep(g, next, n, c, offsets, tau0, smag, macro);
        this.rho[c] = macro[0]!;
        this.ux[c] = macro[1]!;
        this.uy[c] = macro[2]!;
        this.uz[c] = macro[3]!;
        continue;
      }
      if (type === EQUILIBRIUM || type === OUTLET) {
        // Moments of the neighbour inside the box, from the previous step.
        const s = this.source[c]!;
        let r = 1, jx = 0, jy = 0, jz = 0;
        if (s >= 0) {
          for (let q = 0; q < Q; q++) {
            const v = g[q * n + s]!;
            r += v;
            jx += cxs[q]! * v;
            jy += cys[q]! * v;
            jz += czs[q]! * v;
          }
        }
        let rb: number, bx: number, by: number, bz: number;
        if (type === EQUILIBRIUM) {
          // Imposed velocity, density extrapolated from inside (velocity inlet).
          rb = s >= 0 ? r : 1;
          bx = this.ub[3 * c]!;
          by = this.ub[3 * c + 1]!;
          bz = this.ub[3 * c + 2]!;
        } else {
          // Imposed density ρ = 1 (pressure reference), velocity copied from inside.
          rb = 1;
          bx = jx / r;
          by = jy / r;
          bz = jz / r;
        }
        const uu = 1.5 * (bx * bx + by * by + bz * bz);
        for (let q = 0; q < Q; q++) {
          const cu = cxs[q]! * bx + cys[q]! * by + czs[q]! * bz;
          next[q * n + c] = ws[q]! * (rb - 1 + rb * (3 * cu + 4.5 * cu * cu - uu));
        }
        this.rho[c] = rb;
        this.ux[c] = bx;
        this.uy[c] = by;
        this.uz[c] = bz;
        continue;
      }
      // ---- fluid: pull, with half-way bounce-back ----
      let rho = 1, jx = 0, jy = 0, jz = 0;
      for (let q = 0; q < Q; q++) {
        const s = nb[q * n + c]!;
        const ts = s < 0 ? WALL : flags[s]!;
        let v: number;
        if (ts === SOLID || ts === WALL) {
          const o = opp[q]!;
          v = g[o * n + c]!;
          if (ts === SOLID) {
            // Momentum given to the body: −2 c_q f_ō (full f, not shifted).
            const full = v + ws[o]!;
            const dfx = -2 * cxs[q]! * full;
            const dfy = -2 * cys[q]! * full;
            const dfz = -2 * czs[q]! * full;
            fx += dfx;
            fy += dfy;
            fz += dfz;
            // Lever arm: middle of the link, x − c_q/2.
            const i = c % this.nx;
            const j = Math.floor(c / this.nx) % this.ny;
            const k = Math.floor(c / (this.nx * this.ny));
            const rx = i - 0.5 * cxs[q]! - ox;
            const ry = j - 0.5 * cys[q]! - oy;
            const rz = k - 0.5 * czs[q]! - oz;
            mx += ry * dfz - rz * dfy;
            my += rz * dfx - rx * dfz;
            mz += rx * dfy - ry * dfx;
          }
        } else {
          v = g[q * n + s]!;
        }
        pulled[q] = v;
        rho += v;
        jx += cxs[q]! * v;
        jy += cys[q]! * v;
        jz += czs[q]! * v;
      }
      const ux = jx / rho;
      const uy = jy / rho;
      const uz = jz / rho;
      const uu = 1.5 * (ux * ux + uy * uy + uz * uz);
      // ---- equilibrium and non-equilibrium momentum flux Π_neq ----
      let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
      for (let q = 0; q < Q; q++) {
        const cx = cxs[q]!, cy = cys[q]!, cz = czs[q]!;
        const cu = cx * ux + cy * uy + cz * uz;
        const eq = ws[q]! * (rho - 1 + rho * (3 * cu + 4.5 * cu * cu - uu));
        geq[q] = eq;
        const ne = pulled[q]! - eq;
        pxx += cx * cx * ne;
        pyy += cy * cy * ne;
        pzz += cz * cz * ne;
        pxy += cx * cy * ne;
        pxz += cx * cz * ne;
        pyz += cy * cz * ne;
      }
      // ---- Smagorinsky: effective relaxation time ----
      let tau = tau0;
      if (smag > 0) {
        const norm = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pxz * pxz + pyz * pyz));
        tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + (smag * norm) / rho));
      }
      const keep = 4.5 * (1 - 1 / tau);
      const trace = (pxx + pyy + pzz) / 3;
      // ---- regularized collision ----
      for (let q = 0; q < Q; q++) {
        const cx = cxs[q]!, cy = cys[q]!, cz = czs[q]!;
        const qp = cx * cx * pxx + cy * cy * pyy + cz * cz * pzz + 2 * (cx * cy * pxy + cx * cz * pxz + cy * cz * pyz) - trace;
        next[q * n + c] = geq[q]! + keep * ws[q]! * qp;
      }
      this.rho[c] = rho;
      this.ux[c] = ux;
      this.uy[c] = uy;
      this.uz[c] = uz;
    }
    this.next = g;
    this.g = next;
    this.force = [fx, fy, fz];
    this.moment = [mx, my, mz];
    this.time++;
  }

  run(steps: number): void {
    for (let s = 0; s < steps; s++) this.step();
  }

  /** Total mass Σρ over the non-solid cells (conservation checks). */
  mass(): number {
    let m = 0;
    for (let c = 0; c < this.n; c++) if (this.flags[c] === FLUID) m += this.rho[c]!;
    return m;
  }
}
