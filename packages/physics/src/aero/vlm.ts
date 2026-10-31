/**
 * Vortex-lattice method (VLM) with horseshoe vortices on flat lifting
 * surfaces, mini-design 004.
 *
 * Each surface is a flat polygon in a plane that contains the body x axis:
 * horizontal (planta, x–y plane at a body z) or vertical (perfil, x–z plane
 * at a body y). It is cut into spanwise strips with cosine spacing and each
 * strip into chordwise panels. Every panel carries a horseshoe vortex: the
 * bound segment on the panel's 1/4 line, trailing legs from its ends to
 * downstream infinity along body −x, and a control point at the middle of
 * the 3/4 line where the flow may not cross the surface:
 *
 *   Σ_j A_ij Γ_j = −V∞ · n_i,   A_ij = (velocity of horseshoe j, Γ = 1, at i) · n_i
 *
 * Velocities from the Biot–Savart law for straight segments (Katz &
 * Plotkin, Low-Speed Aerodynamics, eq. 10.115) and for semi-infinite
 * segments (its limit). Forces from Kutta–Joukowski on each bound segment,
 * F = ρ Γ (V × l), with V the free stream plus the velocity induced by all
 * the other vortices at the middle of the segment. Induced drag from the
 * trailing vorticity in the Trefftz plane (Drela, Flight Vehicle
 * Aerodynamics, sec. 5.5).
 *
 * The influence matrix does not depend on α (the wake follows the body x
 * axis), so it is factorised once per geometry and each flight condition
 * costs one back-substitution.
 *
 * Body axes FRD, SI. The relative wind for an angle of attack α and a
 * sideslip β is V∞ = −V (cos α cos β, sin β, sin α cos β).
 */
import { luFactor, luSolve, type LuFactors } from "../core/linalg.ts";
import type { Triple } from "../core/vector.ts";

export type SurfaceOrientation = "horizontal" | "vertical";

export interface LiftingSurfaceInput {
  readonly id: string;
  readonly name: string;
  readonly orientation: SurfaceOrientation;
  /**
   * Closed outline, metres, as (x, s): s is body y for a horizontal surface
   * and body z for a vertical one. No repeated closing point.
   */
  readonly outline: readonly (readonly [number, number])[];
  /** Body z of a horizontal surface, body y of a vertical one, m. */
  readonly offset: number;
}

export interface LatticeOptions {
  /** Strips per half span for a surface that crosses s = 0, or across the whole surface otherwise. */
  readonly spanwiseStrips: number;
  /** Panels along the chord of each strip. */
  readonly chordwisePanels: number;
  /** Strip spacing along the span: cosine (finer at the tips, default) or uniform (textbook examples). */
  readonly spacing?: "cosine" | "uniform";
}

export const DEFAULT_LATTICE: LatticeOptions = { spanwiseStrips: 24, chordwisePanels: 6, spacing: "cosine" };

export interface LatticePanel {
  readonly surface: number;
  readonly strip: number;
  /** Corners, body axes: leading-left, leading-right, trailing-right, trailing-left (left = smaller s). */
  readonly corners: readonly [Triple, Triple, Triple, Triple];
  /** Ends of the bound segment (A at the smaller s). */
  readonly boundA: Triple;
  readonly boundB: Triple;
  readonly boundMid: Triple;
  readonly control: Triple;
  /** Unit normal, (−x) × l normalised: up (−z) on a horizontal surface, +y on a vertical one. */
  readonly normal: Triple;
  /** m² */
  readonly area: number;
}

export interface LatticeStrip {
  readonly surface: number;
  /** Span coordinate of the strip edges and middle, m. */
  readonly s0: number;
  readonly s1: number;
  readonly sMid: number;
  /** Chord at the middle of the strip, m. */
  readonly chord: number;
  /** Leading-edge x at the middle of the strip, m. */
  readonly leadingEdgeX: number;
  readonly panels: readonly number[];
}

export interface Lattice {
  readonly surfaces: readonly LiftingSurfaceInput[];
  readonly panels: readonly LatticePanel[];
  readonly strips: readonly LatticeStrip[];
  /** Notes about the geometry, in English: concave outlines, skipped strips... */
  readonly notes: readonly string[];
}

const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Triple, b: Triple): Triple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scalev = (a: Triple, k: number): Triple => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Triple, b: Triple): Triple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Triple): number => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: Triple, b: Triple, t: number): Triple => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Wake direction: downstream along body −x. */
export const WAKE: Triple = [-1, 0, 0];
const FOUR_PI = 4 * Math.PI;

/** Leading and trailing edge x where the line s = const crosses the outline (half-open rule on vertices). */
function chordAt(outline: readonly (readonly [number, number])[], s: number): { le: number; te: number; crossings: number } | null {
  const xs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x1, s1] = outline[i]!;
    const [x2, s2] = outline[(i + 1) % outline.length]!;
    if ((s1 <= s && s < s2) || (s2 <= s && s < s1)) xs.push(x1 + ((s - s1) * (x2 - x1)) / (s2 - s1));
  }
  if (xs.length < 2) return null;
  return { le: Math.max(...xs), te: Math.min(...xs), crossings: xs.length };
}

function toBody(surface: LiftingSurfaceInput, x: number, s: number): Triple {
  return surface.orientation === "horizontal" ? [x, s, surface.offset] : [x, surface.offset, s];
}

/** Builds the panels of every surface. Throws when a surface has no usable outline. */
export function buildLattice(surfaces: readonly LiftingSurfaceInput[], options: LatticeOptions = DEFAULT_LATTICE): Lattice {
  if (!(options.spanwiseStrips >= 1) || !(options.chordwisePanels >= 1)) throw new RangeError("The lattice needs at least one strip and one chordwise panel.");
  const panels: LatticePanel[] = [];
  const strips: LatticeStrip[] = [];
  const notes: string[] = [];
  surfaces.forEach((surface, si) => {
    if (surface.outline.length < 3) throw new RangeError(`Surface ${surface.id} needs at least 3 vertices.`);
    let sMin = Infinity;
    let sMax = -Infinity;
    for (const [, s] of surface.outline) {
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
    }
    const span = sMax - sMin;
    if (!(span > 0)) throw new RangeError(`Surface ${surface.id} has no span.`);
    const eps = 1e-7 * span;
    const crossesZero = sMin < -eps && sMax > eps;
    const n = crossesZero ? 2 * Math.round(options.spanwiseStrips) : Math.round(options.spanwiseStrips);
    const uniform = options.spacing === "uniform";
    const stations = Array.from({ length: n + 1 }, (_, k) =>
      uniform ? sMin + (span * k) / n : sMin + (span * (1 - Math.cos((Math.PI * k) / n))) / 2,
    );
    let concave = false;
    for (let k = 0; k < n; k++) {
      const sa = stations[k]!;
      const sb = stations[k + 1]!;
      const clamp = (s: number) => Math.min(sMax - eps, Math.max(sMin + eps, s));
      const ca = chordAt(surface.outline, clamp(sa));
      const cb = chordAt(surface.outline, clamp(sb));
      const cm = chordAt(surface.outline, clamp((sa + sb) / 2));
      if (ca === null || cb === null || cm === null || !(cm.le - cm.te > 1e-9)) continue;
      if (ca.crossings > 2 || cb.crossings > 2 || cm.crossings > 2) concave = true;
      const nc = Math.round(options.chordwisePanels);
      const ids: number[] = [];
      const at = (s: number, c: { le: number; te: number }, xi: number): Triple => toBody(surface, c.le - xi * (c.le - c.te), s);
      for (let i = 0; i < nc; i++) {
        const x0 = i / nc;
        const x1 = (i + 1) / nc;
        const corners: [Triple, Triple, Triple, Triple] = [at(sa, ca, x0), at(sb, cb, x0), at(sb, cb, x1), at(sa, ca, x1)];
        const quarter = x0 + 0.25 * (x1 - x0);
        const threeQuarter = x0 + 0.75 * (x1 - x0);
        const boundA = at(sa, ca, quarter);
        const boundB = at(sb, cb, quarter);
        const control = lerp(at(sa, ca, threeQuarter), at(sb, cb, threeQuarter), 0.5);
        const l = sub(boundB, boundA);
        const nRaw = cross(WAKE, l);
        const nLen = norm(nRaw);
        if (!(nLen > 0)) continue;
        // Quad area from its diagonals (planar quad): ½ |d1 × d2|.
        const area = 0.5 * norm(cross(sub(corners[2], corners[0]), sub(corners[3], corners[1])));
        ids.push(panels.length);
        panels.push({
          surface: si,
          strip: strips.length,
          corners,
          boundA,
          boundB,
          boundMid: lerp(boundA, boundB, 0.5),
          control,
          normal: scalev(nRaw, 1 / nLen),
          area,
        });
      }
      strips.push({ surface: si, s0: sa, s1: sb, sMid: (sa + sb) / 2, chord: cm.le - cm.te, leadingEdgeX: cm.le, panels: ids });
    }
    if (concave) notes.push(`Surface ${surface.id}: some spanwise lines cross the outline more than twice; each strip spans the outermost leading and trailing edges.`);
  });
  if (panels.length === 0) throw new RangeError("The lattice has no panels.");
  return { surfaces, panels, strips, notes };
}

/**
 * Velocity at p of a straight vortex segment a→b of unit circulation
 * (Katz & Plotkin eq. 10.115). Zero on the segment's own line, where the
 * formula is singular and the true velocity of a straight filament is zero.
 */
export function segmentVelocity(p: Triple, a: Triple, b: Triple): Triple {
  const r1 = sub(p, a);
  const r2 = sub(p, b);
  const r0 = sub(b, a);
  const c = cross(r1, r2);
  const c2 = dot(c, c);
  const l1 = norm(r1);
  const l2 = norm(r2);
  if (c2 <= 1e-20 * dot(r0, r0) ** 2 || l1 === 0 || l2 === 0) return [0, 0, 0];
  const k = (dot(r0, r1) / l1 - dot(r0, r2) / l2) / (FOUR_PI * c2);
  return scalev(c, k);
}

/** Velocity at p of a semi-infinite vortex starting at q and going to infinity along the unit vector d, unit circulation. */
export function semiInfiniteVelocity(p: Triple, q: Triple, d: Triple): Triple {
  const r = sub(p, q);
  const c = cross(d, r);
  const c2 = dot(c, c);
  const l = norm(r);
  if (c2 <= 1e-20 * l ** 4 || l === 0) return [0, 0, 0];
  const k = (1 + dot(d, r) / l) / (FOUR_PI * c2);
  return scalev(c, k);
}

/** Velocity at p of the horseshoe of panel j (unit circulation): ∞ → A → B → ∞. */
export function horseshoeVelocity(p: Triple, panel: LatticePanel, includeBound = true): Triple {
  const legB = semiInfiniteVelocity(p, panel.boundB, WAKE);
  const legA = semiInfiniteVelocity(p, panel.boundA, WAKE);
  const legs: Triple = [legB[0] - legA[0], legB[1] - legA[1], legB[2] - legA[2]];
  return includeBound ? addv(legs, segmentVelocity(p, panel.boundA, panel.boundB)) : legs;
}

export interface FactoredLattice {
  readonly lattice: Lattice;
  readonly lu: LuFactors;
  /** Velocity at the middle of bound segment i induced by horseshoe j (unit Γ), 3 values per (i, j), row-major. */
  readonly boundInduced: Float64Array;
}

/** Influence matrix and its LU factors, plus the induced velocities used for the forces. */
export function factorLattice(lattice: Lattice): FactoredLattice {
  const { panels } = lattice;
  const n = panels.length;
  const aic = new Float64Array(n * n);
  const boundInduced = new Float64Array(n * n * 3);
  for (let i = 0; i < n; i++) {
    const pi = panels[i]!;
    for (let j = 0; j < n; j++) {
      const pj = panels[j]!;
      aic[i * n + j] = dot(horseshoeVelocity(pi.control, pj), pi.normal);
      // A segment induces nothing on itself: the own bound segment is left out.
      const v = horseshoeVelocity(pi.boundMid, pj, i !== j);
      const o = (i * n + j) * 3;
      boundInduced[o] = v[0];
      boundInduced[o + 1] = v[1];
      boundInduced[o + 2] = v[2];
    }
  }
  return { lattice, lu: luFactor(aic, n), boundInduced };
}

export interface FlightCondition {
  /** rad */
  readonly alpha: number;
  /** rad */
  readonly beta: number;
  /** m/s */
  readonly speed: number;
  /** kg/m³ */
  readonly density: number;
}

export interface VlmSolution {
  /** Circulation of each horseshoe, m²/s. */
  readonly gamma: Float64Array;
  /** Force on each panel, body axes, N. */
  readonly panelForces: readonly Triple[];
  /** Sum of the panel forces, body axes, N. */
  readonly force: Triple;
  /** Moment of the panel forces about `about`, body axes, N·m. */
  readonly moment: Triple;
  /** Induced drag from the Trefftz plane, N. */
  readonly inducedDrag: number;
  /** Circulation of each strip (sum over its chord), m²/s. */
  readonly stripCirculation: Float64Array;
}

/** Relative wind in body axes for an angle of attack and a sideslip. */
export function freeStream(alpha: number, beta: number, speed: number): Triple {
  return [-speed * Math.cos(alpha) * Math.cos(beta), -speed * Math.sin(beta), -speed * Math.sin(alpha) * Math.cos(beta)];
}

export function solveVlm(f: FactoredLattice, condition: FlightCondition, about: Triple): VlmSolution {
  const { panels, strips } = f.lattice;
  const n = panels.length;
  const vInf = freeStream(condition.alpha, condition.beta, condition.speed);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) rhs[i] = -dot(vInf, panels[i]!.normal);
  const gamma = luSolve(f.lu, rhs);

  const panelForces: Triple[] = [];
  let force: Triple = [0, 0, 0];
  let moment: Triple = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = panels[i]!;
    let v: Triple = vInf;
    for (let j = 0; j < n; j++) {
      const o = (i * n + j) * 3;
      const g = gamma[j]!;
      v = [v[0] + f.boundInduced[o]! * g, v[1] + f.boundInduced[o + 1]! * g, v[2] + f.boundInduced[o + 2]! * g];
    }
    const l = sub(p.boundB, p.boundA);
    const fi = scalev(cross(v, l), condition.density * gamma[i]!);
    panelForces.push(fi);
    force = addv(force, fi);
    moment = addv(moment, cross(sub(p.boundMid, about), fi));
  }

  const stripCirculation = new Float64Array(strips.length);
  strips.forEach((s, k) => {
    let g = 0;
    for (const id of s.panels) g += gamma[id]!;
    stripCirculation[k] = g;
  });
  const inducedDrag = trefftzDrag(f.lattice, stripCirculation, condition.density);
  return { gamma, panelForces, force, moment, inducedDrag, stripCirculation };
}

/** Sub-strips per lattice strip in the Trefftz-plane sum. */
export const TREFFTZ_SUBSTRIPS = 8;

/**
 * Induced drag in the Trefftz plane, D_i = −½ ρ Σ Γ (w · n) Δs.
 *
 * The lattice gives one circulation per strip (a step distribution). Its
 * Trefftz sum with collocation at the strip middles converges only to first
 * order (2.5 % low on an elliptic load with 48 cosine strips), so the
 * circulation of each surface is first interpolated linearly between strip
 * middles, falling to zero at the free ends, and evaluated on
 * TREFFTZ_SUBSTRIPS sub-strips per strip (0.4 % on the same load). The wake
 * vorticity leaves each sub-strip edge along body −x.
 */
export function trefftzDrag(lattice: Lattice, stripCirculation: ArrayLike<number>, density: number): number {
  interface Sub {
    readonly a: Triple;
    readonly b: Triple;
    readonly g: number;
  }
  const subs: Sub[] = [];
  lattice.surfaces.forEach((surface, si) => {
    const own = lattice.strips.map((s, k) => ({ s, g: stripCirculation[k]! })).filter((x) => x.s.surface === si);
    if (own.length === 0) return;
    own.sort((p, q) => p.s.sMid - q.s.sMid);
    const xs = [own[0]!.s.s0, ...own.map((x) => x.s.sMid), own[own.length - 1]!.s.s1];
    const gs = [0, ...own.map((x) => x.g), 0];
    let seg = 0;
    const interp = (sv: number): number => {
      while (seg < xs.length - 2 && sv > xs[seg + 1]!) seg++;
      const t = (sv - xs[seg]!) / (xs[seg + 1]! - xs[seg]!);
      return gs[seg]! + t * (gs[seg + 1]! - gs[seg]!);
    };
    const point = (sv: number): Triple => (surface.orientation === "horizontal" ? [0, sv, surface.offset] : [0, surface.offset, sv]);
    for (const { s } of own) {
      for (let j = 0; j < TREFFTZ_SUBSTRIPS; j++) {
        const s0 = s.s0 + ((s.s1 - s.s0) * j) / TREFFTZ_SUBSTRIPS;
        const s1 = s.s0 + ((s.s1 - s.s0) * (j + 1)) / TREFFTZ_SUBSTRIPS;
        subs.push({ a: point(s0), b: point(s1), g: interp((s0 + s1) / 2) });
      }
    }
  });
  const twoPi = 2 * Math.PI;
  // Velocity in the Trefftz plane of an infinite line along the wake through q, unit circulation.
  const line = (p: Triple, q: Triple): [number, number] => {
    const ry = p[1] - q[1];
    const rz = p[2] - q[2];
    const r2 = ry * ry + rz * rz;
    if (r2 < 1e-24) return [0, 0];
    // WAKE × r = (−1, 0, 0) × (0, ry, rz) = (0, rz, −ry)
    return [rz / (twoPi * r2), -ry / (twoPi * r2)];
  };
  let drag = 0;
  for (const k of subs) {
    if (k.g === 0) continue;
    const mid: Triple = [0, (k.a[1] + k.b[1]) / 2, (k.a[2] + k.b[2]) / 2];
    let wy = 0;
    let wz = 0;
    for (const m of subs) {
      if (m.g === 0) continue;
      const vb = line(mid, m.b);
      const va = line(mid, m.a);
      wy += m.g * (vb[0] - va[0]);
      wz += m.g * (vb[1] - va[1]);
    }
    // (−x) × (b − a) = (0, −(bz − az), by − ay)... computed explicitly:
    const dy = k.b[1] - k.a[1];
    const dz = k.b[2] - k.a[2];
    const nY = dz; // (−1,0,0) × (0, dy, dz) = (0, dz, −dy)
    const nZ = -dy;
    drag += -0.5 * density * k.g * (wy * nY + wz * nZ);
  }
  return drag;
}
