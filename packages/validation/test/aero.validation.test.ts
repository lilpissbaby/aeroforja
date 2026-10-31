/**
 * Validation: vortex-lattice tunnel against a published worked example and
 * classical wing theory. See src/aero/cases.ts for references and tolerances.
 */
import { describe, expect, it } from "vitest";
import {
  blasiusCf,
  buildLattice,
  factorLattice,
  prandtlSchlichtingCf,
  solveVlm,
  tunnelSweep,
  type LatticeOptions,
  type LiftingSurfaceInput,
  type TunnelInput,
} from "@aeroforja/physics";
import {
  AERODYNAMIC_CENTRE,
  BERTIN_CUMMINGS_7_2,
  CONVERGENCE_STEP,
  DATCOM_TOLERANCE,
  ELLIPTIC_WING,
  RECTANGULAR_WINGS,
  SYMMETRY_TOLERANCE,
} from "../src/index.ts";

const DEG = Math.PI / 180;
const AIR = { density: 1.225, kinematicViscosity: 1.4607e-5, speedOfSound: 340.29 };
type Outline = [number, number][];

const surface = (outline: Outline, id = "w"): LiftingSurfaceInput => ({ id, name: id, orientation: "horizontal", outline, offset: 0 });

/** Root leading edge at x = 0, chords cr and ct, leading-edge sweep. */
function trapezoid(span: number, cr: number, ct: number, sweepLE: number): Outline {
  const b = span / 2;
  const xt = -b * Math.tan(sweepLE);
  return [
    [0, 0],
    [xt, b],
    [xt - ct, b],
    [-cr, 0],
    [xt - ct, -b],
    [xt, -b],
  ];
}

const rectangle = (span: number, chord: number): Outline => [
  [0, -span / 2],
  [0, span / 2],
  [-chord, span / 2],
  [-chord, -span / 2],
];

/** Lift coefficient at α from a single VLM solution. */
function liftCoefficient(outline: Outline, area: number, alpha: number, options?: LatticeOptions): { CL: number; CDi: number; Cm: number } {
  const lattice = buildLattice([surface(outline)], options);
  const f = factorLattice(lattice);
  const V = 10;
  const sol = solveVlm(f, { alpha, beta: 0, speed: V, density: AIR.density }, [0, 0, 0]);
  const q = 0.5 * AIR.density * V * V;
  const lift = sol.force[0] * Math.sin(alpha) - sol.force[2] * Math.cos(alpha);
  return { CL: lift / (q * area), CDi: sol.inducedDrag / (q * area), Cm: sol.moment[1] / (q * area) };
}

const helmbold = (ar: number) => (2 * Math.PI * ar) / (2 + Math.sqrt(ar * ar + 4));
const datcom = (ar: number, halfChordSweep: number) => (2 * Math.PI * ar) / (2 + Math.sqrt(4 + ar * ar * (1 + Math.tan(halfChordSweep) ** 2)));

const relative = (actual: number, expected: number) => Math.abs(actual - expected) / Math.abs(expected);

describe("published worked example: Bertin & Cummings 7.2", () => {
  it("reproduces CL = 0.0601 α (α in degrees) with the textbook lattice", () => {
    const { aspectRatio, sweepQuarterChordDeg, stripsPerSemispan, chordwisePanels, clAlphaPerDegree, tolerance } = BERTIN_CUMMINGS_7_2;
    const chord = 1;
    const span = aspectRatio * chord;
    // Untapered: the leading-edge sweep equals the quarter-chord sweep.
    const outline = trapezoid(span, chord, chord, sweepQuarterChordDeg * DEG);
    const { CL } = liftCoefficient(outline, span * chord, 1 * DEG, { spanwiseStrips: stripsPerSemispan, chordwisePanels, spacing: "uniform" });
    expect(relative(CL, clAlphaPerDegree)).toBeLessThanOrEqual(tolerance.relative);
  });
});

describe("elliptic flat wing, AR 8", () => {
  const ar = ELLIPTIC_WING.aspectRatio;
  const span = 8;
  const c0 = (4 * span) / (Math.PI * ar);
  const outline: Outline = [];
  const n = 400;
  // Straight quarter-chord line: leading edge at +c/4, trailing edge at −3c/4.
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const y = (span / 2) * Math.cos(t);
    const c = c0 * Math.abs(Math.sin(t));
    outline.push([Math.sin(t) >= 0 ? 0.25 * c : -0.75 * c, y]);
  }
  const area = (Math.PI * span * c0) / 4;
  const alpha = 4 * DEG;
  const r = liftCoefficient(outline, area, alpha);
  const clAlpha = r.CL / alpha;
  const oswald = r.CL ** 2 / (Math.PI * ar * r.CDi);

  it("lift slope within 2 % of Helmbold's lifting-surface value", () => {
    expect(relative(clAlpha, helmbold(ar))).toBeLessThanOrEqual(ELLIPTIC_WING.helmboldTolerance.relative);
  });
  it("lift slope below the lifting-line value 2π/(1 + 2/AR)", () => {
    expect(clAlpha).toBeLessThan((2 * Math.PI) / (1 + 2 / ar));
  });
  it(`span efficiency e in [${ELLIPTIC_WING.oswald.min}, ${ELLIPTIC_WING.oswald.max}]`, () => {
    expect(oswald).toBeGreaterThanOrEqual(ELLIPTIC_WING.oswald.min);
    expect(oswald).toBeLessThanOrEqual(ELLIPTIC_WING.oswald.max);
  });
});

describe("rectangular flat wings against Helmbold", () => {
  for (const ar of RECTANGULAR_WINGS.aspectRatios) {
    it(`AR ${ar}: within ${RECTANGULAR_WINGS.tolerance.relative * 100} % and below Helmbold, e ≤ 1`, () => {
      const alpha = 3 * DEG;
      const r = liftCoefficient(rectangle(ar, 1), ar, alpha);
      const clAlpha = r.CL / alpha;
      expect(clAlpha).toBeLessThanOrEqual(helmbold(ar));
      expect(relative(clAlpha, helmbold(ar))).toBeLessThanOrEqual(RECTANGULAR_WINGS.tolerance.relative);
      expect(r.CL ** 2 / (Math.PI * ar * r.CDi)).toBeLessThanOrEqual(1);
    });
  }
});

describe("swept and tapered wings against DATCOM", () => {
  const halfChordSweep = (sweepLE: number, ar: number, taper: number) => Math.atan(Math.tan(sweepLE) - (4 / ar) * (0.5 * (1 - taper)) / (1 + taper));
  it("AR 5, 45° of sweep, untapered", () => {
    const ar = 5;
    const sweep = 45 * DEG;
    const r = liftCoefficient(trapezoid(ar, 1, 1, sweep), ar, 3 * DEG);
    expect(relative(r.CL / (3 * DEG), datcom(ar, halfChordSweep(sweep, ar, 1)))).toBeLessThanOrEqual(DATCOM_TOLERANCE.relative);
  });
  it("the 800 mm flying-wing template (b 0.8, cr 0.25, ct 0.15, 25° leading edge)", () => {
    const [b, cr, ct, sweep] = [0.8, 0.25, 0.15, 25 * DEG];
    const area = (b * (cr + ct)) / 2;
    const ar = (b * b) / area;
    const r = liftCoefficient(trapezoid(b, cr, ct, sweep), area, 3 * DEG);
    expect(relative(r.CL / (3 * DEG), datcom(ar, halfChordSweep(sweep, ar, ct / cr)))).toBeLessThanOrEqual(DATCOM_TOLERANCE.relative);
  });
});

describe("aerodynamic centre of unswept rectangular wings", () => {
  for (const ar of AERODYNAMIC_CENTRE.aspectRatios) {
    it(`AR ${ar}: at 25 % ± 2 % of the chord`, () => {
      // Moments about the leading edge (x = 0): Cm_LE = −(x_ac/c)·CL for x_ac aft of the LE.
      const r = liftCoefficient(rectangle(ar, 1), ar, 3 * DEG);
      expect(Math.abs(-r.Cm / r.CL - AERODYNAMIC_CENTRE.fraction)).toBeLessThanOrEqual(AERODYNAMIC_CENTRE.absolute);
    });
  }
});

describe("symmetry and convergence", () => {
  const base: Omit<TunnelInput, "surfaces"> = {
    friction: [],
    bluff: [],
    cg: [-0.08, 0, 0],
    speed: 15,
    alphas: [-2 * DEG, 0, 2 * DEG, 4 * DEG],
    air: AIR,
    interference: 1,
  };
  it(`β = 0 on a symmetric wing: |CY|, |Cl|, |Cn| ≤ ${SYMMETRY_TOLERANCE}`, () => {
    const sweep = tunnelSweep({ ...base, surfaces: [surface(trapezoid(0.8, 0.25, 0.15, 25 * DEG))] }).value;
    for (const p of sweep.points) {
      expect(Math.abs(p.CY!)).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
      expect(Math.abs(p.Cl!)).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
      expect(Math.abs(p.Cn!)).toBeLessThanOrEqual(SYMMETRY_TOLERANCE);
    }
  });
  it("doubling the spanwise strips changes CL by less than 1 %", () => {
    const outline = rectangle(4, 1);
    const a = liftCoefficient(outline, 4, 4 * DEG, { spanwiseStrips: 24, chordwisePanels: 6 });
    const b = liftCoefficient(outline, 4, 4 * DEG, { spanwiseStrips: 48, chordwisePanels: 6 });
    expect(relative(a.CL, b.CL)).toBeLessThanOrEqual(CONVERGENCE_STEP.relative);
  });
  it("neutral point: SM = −dCm/dCL and moving the CG forward raises the margin", () => {
    const surfaces = [surface(trapezoid(0.8, 0.25, 0.15, 25 * DEG))];
    const aft = tunnelSweep({ ...base, surfaces, cg: [-0.12, 0, 0] }).value.summary!;
    const fwd = tunnelSweep({ ...base, surfaces, cg: [-0.08, 0, 0] }).value.summary!;
    expect(Math.abs(aft.staticMargin + aft.dCmdCL)).toBeLessThan(1e-12);
    expect(fwd.staticMargin).toBeGreaterThan(aft.staticMargin);
    // The neutral point is a property of the wing, not of the CG. Body-axis force components
    // rotate with α (lift is not exactly −Fz), so the fit moves by a few 1e-4 of the MAC at most.
    const mac = tunnelSweep({ ...base, surfaces }).value.reference!.mac;
    expect(Math.abs(fwd.neutralPointX - aft.neutralPointX) / mac).toBeLessThan(1e-3);
  });
});

describe("flat-plate friction laws", () => {
  it("Blasius: Cf = 1.328/√Re at Re = 10⁵ and 10⁶", () => {
    expect(relative(blasiusCf(1e5), 1.328 / Math.sqrt(1e5))).toBeLessThan(1e-15);
    expect(relative(blasiusCf(1e6), 0.001328)).toBeLessThan(1e-12);
  });
  it("Prandtl–Schlichting: Cf = 0.455/(log10 Re)^2.58 at Re = 10⁵ and 10⁶", () => {
    expect(relative(prandtlSchlichtingCf(1e5), 0.455 / 5 ** 2.58)).toBeLessThan(1e-12);
    expect(relative(prandtlSchlichtingCf(1e6), 0.455 / 6 ** 2.58)).toBeLessThan(1e-12);
  });
});
