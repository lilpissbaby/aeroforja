/**
 * Linearised unsteady vortex-lattice method (mini-design 007) on the panels
 * of the steady lattice, coupled with the longitudinal motion of a rigid
 * aircraft (vertical and pitch, constant forward speed).
 *
 * - Vortex rings: leading segment on the panel's quarter-chord line (the
 *   bound vortex of vlm.ts), trailing segment one panel further back, control
 *   point at three quarters (Katz & Plotkin 2001, §12.3 and §13.12).
 * - Flat wake frozen in body axes, convected at V∞ along −x: one row of rings
 *   per time step, Γ_wake,1(t + Δt) = Γ_TE(t) (Kutta), each row taking the
 *   value of the one ahead. The last row is semi-infinite, so the steady limit
 *   is the horseshoe lattice. Small perturbations: the geometry of the
 *   lattice and of the wake does not move (Murua, Palacios & Graham 2012).
 * - Loads, linearised unsteady Kutta–Joukowski (Katz & Plotkin eq. 13.150):
 *   ΔF_i = ρ (V∞ × l_i)(Γ_i − Γ_i−1) + ρ A_i (dΓ_i/dt) n_i.
 * - Quasi-steady option: the steady horseshoe lattice at every instant, no
 *   wake memory and no dΓ/dt (to see what the unsteady aerodynamics does).
 * - Motion: m z̈ = F_z, I_yy θ̈ = M_y about the CG, with the upwash at each
 *   control point v_up = V θ + ż − q (x_i − x_CG) + w_g,i (z down, θ nose up).
 *   Implicit trapezoidal rule (Newmark, average acceleration) on the joint
 *   linear system, so a light wing does not make the coupling unstable.
 *
 * Every quantity is a perturbation about trimmed level flight; the 1 g loads
 * are added by the caller from the steady lattice.
 */
import { luFactor, luSolve, type LuFactors } from "../core/linalg.ts";
import type { Triple } from "../core/vector.ts";
import { horseshoeVelocity, segmentVelocity, semiInfiniteVelocity, WAKE, type Lattice } from "./vlm.ts";

export type AeroModel = "unsteady" | "quasi-steady";

export interface UvlmOptions {
  /** m/s */
  readonly speed: number;
  /** kg/m³ */
  readonly density: number;
  /** Time step, s. */
  readonly dt: number;
  /** Rows of wake rings before the semi-infinite last one (unsteady only). */
  readonly wakeRows: number;
  readonly model: AeroModel;
}

export interface UvlmModel {
  readonly lattice: Lattice;
  readonly options: UvlmOptions;
  readonly n: number;
  /** Panels on the trailing edge, one per strip (index into panels), in strip order. */
  readonly trailing: Int32Array;
  /** Previous chordwise panel of each panel in its strip, −1 on the leading edge. */
  readonly previous: Int32Array;
  readonly lu: LuFactors;
  /** Normal-wash at control point i of wake ring (row k, strip s), unit Γ: wake[(k·n + i)·S + s]. */
  readonly wake: Float32Array;
  /** n_i · up, up = −z: 1 on a horizontal panel, 0 on a fin. */
  readonly upComponent: Float64Array;
  /** z force per unit bound strength (Γ_i − Γ_i−1) and per unit dΓ_i/dt, N/(m²/s) and N/(m²/s²). */
  readonly boundFz: Float64Array;
  readonly rateFz: Float64Array;
  /** x of the point each force acts at: middle of the bound segment, centre of the panel. */
  readonly boundX: Float64Array;
  readonly rateX: Float64Array;
  /** x of each control point. */
  readonly controlX: Float64Array;
}

const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Triple, b: Triple): Triple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const shift = (a: Triple, dx: number): Triple => [a[0] + dx, a[1], a[2]];

/** Corners of the ring of each panel: bound A, bound B, B one panel back, A one panel back. */
function ringOf(lattice: Lattice, i: number): [Triple, Triple, Triple, Triple] {
  const p = lattice.panels[i]!;
  const [ll, lr, tr, tl] = p.corners;
  return [p.boundA, p.boundB, add(p.boundB, sub(tr, lr)), add(p.boundA, sub(tl, ll))];
}

function ringVelocity(p: Triple, r: readonly [Triple, Triple, Triple, Triple]): Triple {
  let v: Triple = [0, 0, 0];
  for (let e = 0; e < 4; e++) v = add(v, segmentVelocity(p, r[e]!, r[(e + 1) % 4]!));
  return v;
}

export function buildUvlm(lattice: Lattice, options: UvlmOptions): UvlmModel {
  const { panels, strips } = lattice;
  const n = panels.length;
  const S = strips.length;
  const previous = new Int32Array(n).fill(-1);
  const trailing = new Int32Array(S);
  strips.forEach((s, k) => {
    for (let c = 1; c < s.panels.length; c++) previous[s.panels[c]!] = s.panels[c - 1]!;
    trailing[k] = s.panels[s.panels.length - 1]!;
  });
  const rings = panels.map((_, i) => ringOf(lattice, i));
  const aic = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const pi = panels[i]!;
    for (let j = 0; j < n; j++) {
      const v = options.model === "unsteady" ? ringVelocity(pi.control, rings[j]!) : horseshoeVelocity(pi.control, panels[j]!);
      aic[i * n + j] = dot(v, pi.normal);
    }
  }
  const rows = options.model === "unsteady" ? Math.max(1, Math.round(options.wakeRows)) : 0;
  // Single precision halves the memory traffic of the per-step wake sum, the cost that dominates.
  const wake = new Float32Array(rows * n * S);
  const step = options.speed * options.dt;
  for (let k = 0; k < rows; k++) {
    for (let s = 0; s < S; s++) {
      const te = rings[trailing[s]!]!;
      // Leading edge of the wake: the trailing segment of the TE ring (its corners 4 → 3, left to right).
      const a = shift(te[3], -k * step);
      const b = shift(te[2], -k * step);
      const last = k === rows - 1;
      const ring: [Triple, Triple, Triple, Triple] = [a, b, shift(b, -step), shift(a, -step)];
      for (let i = 0; i < n; i++) {
        const c = panels[i]!.control;
        let v: Triple;
        if (last) {
          // Semi-infinite: ∞ → a → b → ∞, like a horseshoe whose bound segment is the row's leading edge.
          v = add(add(segmentVelocity(c, a, b), semiInfiniteVelocity(c, b, WAKE)), semiInfiniteVelocity(c, a, WAKE).map((x) => -x) as unknown as Triple);
        } else v = ringVelocity(c, ring);
        wake[(k * n + i) * S + s] = dot(v, panels[i]!.normal);
      }
    }
  }
  const upComponent = new Float64Array(n);
  const boundFz = new Float64Array(n);
  const rateFz = new Float64Array(n);
  const boundX = new Float64Array(n);
  const rateX = new Float64Array(n);
  const controlX = new Float64Array(n);
  const V = options.speed;
  for (let i = 0; i < n; i++) {
    const p = panels[i]!;
    upComponent[i] = -p.normal[2];
    const l = sub(p.boundB, p.boundA);
    // (V∞ × l)_z with V∞ = (−V, 0, 0): −V l_y.
    boundFz[i] = options.density * -V * l[1];
    rateFz[i] = options.model === "unsteady" ? options.density * p.area * p.normal[2] : 0;
    boundX[i] = p.boundMid[0];
    rateX[i] = (p.corners[0][0] + p.corners[1][0] + p.corners[2][0] + p.corners[3][0]) / 4;
    controlX[i] = p.control[0];
  }
  return { lattice, options, n, trailing, previous, lu: luFactor(aic, n), wake, upComponent, boundFz, rateFz, boundX, rateX, controlX };
}

export interface RigidLongitudinal {
  /** kg */
  readonly mass: number;
  /** kg·m² */
  readonly iyy: number;
  /** x of the CG, m (body FRD). */
  readonly cgX: number;
  readonly freeHeave: boolean;
  readonly freePitch: boolean;
}

export interface UvlmHistory {
  /** s, one entry per step including t = 0. */
  readonly t: Float64Array;
  /** Perturbation z force (N, down positive) and pitching moment about the CG (N·m, nose up positive). */
  readonly fz: Float64Array;
  readonly my: Float64Array;
  readonly z: Float64Array;
  readonly zDot: Float64Array;
  readonly theta: Float64Array;
  readonly q: Float64Array;
  /** z force of every strip at every step, fz_strip[step·S + s], N. */
  readonly stripFz: Float64Array;
}

/**
 * Time-marches the model for `steps` steps. `upwash(t, i)` is the vertical
 * velocity of the air at control point i (m/s, up positive): a gust, or a
 * constant V·Δα for an indicial test.
 */
export function simulateLongitudinal(model: UvlmModel, body: RigidLongitudinal, steps: number, upwash: (t: number, i: number) => number): UvlmHistory {
  const { n, options, lu, upComponent, previous, trailing } = model;
  const S = trailing.length;
  const rows = options.model === "unsteady" ? model.wake.length / (n * S) : 0;
  const dt = options.dt;
  const V = options.speed;
  const cgX = body.cgX;
  // Loads as linear maps of Γ: Q = K Γ + D Γ̇, rows (F_z, M_y).
  const K = [new Float64Array(n), new Float64Array(n)];
  const D = [new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    const bz = model.boundFz[i]!;
    const armB = model.boundX[i]! - cgX;
    if (options.model === "unsteady") {
      K[0]![i]! += bz;
      K[1]![i]! += -armB * bz;
      const p = previous[i]!;
      if (p >= 0) {
        K[0]![p]! -= bz;
        K[1]![p]! -= -armB * bz;
      }
    } else {
      K[0]![i]! += bz;
      K[1]![i]! += -armB * bz;
    }
    D[0]![i] = model.rateFz[i]!;
    D[1]![i] = -(model.rateX[i]! - cgX) * model.rateFz[i]!;
  }
  // Motion → right-hand side: columns (z, θ) of B_d and (ż, q) of B_v.
  const bTheta = new Float64Array(n);
  const bZdot = new Float64Array(n);
  const bQ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = upComponent[i]!;
    bTheta[i] = -c * V;
    bZdot[i] = -c;
    bQ[i] = c * (model.controlX[i]! - cgX);
  }
  // G = A⁻¹ (B_d Δt²/4 + B_v Δt/2), columns for z̈ and θ̈.
  const colZ = new Float64Array(n);
  const colT = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    colZ[i] = bZdot[i]! * (dt / 2);
    colT[i] = bTheta[i]! * ((dt * dt) / 4) + bQ[i]! * (dt / 2);
  }
  const G = [luSolve(lu, colZ), luSolve(lu, colT)];
  const H = [0, 1].map((r) => {
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) h[i] = K[r]![i]! + D[r]![i]! / dt;
    return h;
  });
  const hg = (r: number, c: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += H[r]![i]! * G[c]![i]!;
    return s;
  };
  // (M − H G) a = H Γ* − (D/Δt) Γⁿ
  const lhs = [
    [body.mass - hg(0, 0), -hg(0, 1)],
    [-hg(1, 0), body.iyy - hg(1, 1)],
  ];

  const out: UvlmHistory = {
    t: new Float64Array(steps + 1),
    fz: new Float64Array(steps + 1),
    my: new Float64Array(steps + 1),
    z: new Float64Array(steps + 1),
    zDot: new Float64Array(steps + 1),
    theta: new Float64Array(steps + 1),
    q: new Float64Array(steps + 1),
    stripFz: new Float64Array((steps + 1) * S),
  };
  let gamma = new Float64Array(n);
  let wakeG = new Float64Array(rows * S);
  let z = 0, zd = 0, th = 0, q = 0, az = 0, at = 0;
  const rhs = new Float64Array(n);
  const induced = new Float64Array(n);
  const W = model.wake;
  const stripOf = new Int32Array(n);
  model.lattice.strips.forEach((s, k) => s.panels.forEach((p) => (stripOf[p] = k)));
  for (let step = 1; step <= steps; step++) {
    const t = step * dt;
    // Wake: convect one row and shed the trailing-edge circulation of the last step.
    if (rows > 0) {
      const next = new Float64Array(rows * S);
      for (let k = rows - 1; k >= 1; k--) for (let s = 0; s < S; s++) next[k * S + s] = wakeG[(k - 1) * S + s]!;
      // The semi-infinite last row keeps what reaches it plus what it held: in a steady state both are equal.
      for (let s = 0; s < S; s++) next[s] = gamma[trailing[s]!]!;
      wakeG = next;
    }
    // Predictors of the trapezoidal rule.
    const zs = z + dt * zd + ((dt * dt) / 4) * az;
    const ths = th + dt * q + ((dt * dt) / 4) * at;
    const zds = zd + (dt / 2) * az;
    const qs = q + (dt / 2) * at;
    // Normal-wash of the wake at every control point.
    induced.fill(0);
    for (let k = 0; k < rows; k++) {
      const gk = k * S;
      for (let i = 0; i < n; i++) {
        const base = (k * n + i) * S;
        let w = 0;
        for (let s = 0; s < S; s++) w += W[base + s]! * wakeG[gk + s]!;
        induced[i]! += w;
      }
    }
    for (let i = 0; i < n; i++) rhs[i] = -upComponent[i]! * upwash(t, i) - induced[i]! + bTheta[i]! * ths + bZdot[i]! * zds + bQ[i]! * qs;
    void zs;
    const gStar = luSolve(lu, rhs);
    const r0 = (() => {
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        a += H[0]![i]! * gStar[i]! - (D[0]![i]! / dt) * gamma[i]!;
        b += H[1]![i]! * gStar[i]! - (D[1]![i]! / dt) * gamma[i]!;
      }
      return [a, b] as const;
    })();
    let nz = 0, nt = 0;
    if (body.freeHeave && body.freePitch) {
      const det = lhs[0]![0]! * lhs[1]![1]! - lhs[0]![1]! * lhs[1]![0]!;
      nz = (r0[0] * lhs[1]![1]! - lhs[0]![1]! * r0[1]) / det;
      nt = (lhs[0]![0]! * r0[1] - r0[0] * lhs[1]![0]!) / det;
    } else if (body.freeHeave) nz = r0[0] / lhs[0]![0]!;
    else if (body.freePitch) nt = r0[1] / lhs[1]![1]!;
    const g1 = new Float64Array(n);
    for (let i = 0; i < n; i++) g1[i] = gStar[i]! + G[0]![i]! * nz + G[1]![i]! * nt;
    // Loads with the new circulation.
    let fz = 0, my = 0;
    const strip = out.stripFz;
    for (let i = 0; i < n; i++) {
      const dg = (g1[i]! - gamma[i]!) / dt;
      const bound = options.model === "unsteady" ? g1[i]! - (previous[i]! >= 0 ? g1[previous[i]!]! : 0) : g1[i]!;
      const fb = model.boundFz[i]! * bound;
      const fr = model.rateFz[i]! * dg;
      fz += fb + fr;
      my += -(model.boundX[i]! - cgX) * fb - (model.rateX[i]! - cgX) * fr;
      strip[step * S + stripOf[i]!]! += fb + fr;
    }
    // Advance the motion.
    zd = zd + (dt / 2) * (az + nz);
    q = q + (dt / 2) * (at + nt);
    z = zs + ((dt * dt) / 4) * nz;
    th = ths + ((dt * dt) / 4) * nt;
    az = nz;
    at = nt;
    gamma = g1;
    out.t[step] = t;
    out.fz[step] = fz;
    out.my[step] = my;
    out.z[step] = z;
    out.zDot[step] = zd;
    out.theta[step] = th;
    out.q[step] = q;
  }
  return out;
}
