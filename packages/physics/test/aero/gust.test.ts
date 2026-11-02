import { describe, expect, it } from "vitest";
import { buildLattice, factorLattice, solveVlm, type LiftingSurfaceInput } from "../../src/aero/vlm.ts";
import { buildUvlm, simulateLongitudinal } from "../../src/aero/uvlm.ts";
import { gustResponse, oneMinusCosine } from "../../src/aero/gust.ts";

const rho = 1.225;
const rect = (b: number, c: number, x0 = 0): LiftingSurfaceInput => ({
  id: "w",
  name: "w",
  orientation: "horizontal",
  outline: [[x0, -b / 2], [x0, b / 2], [x0 - c, b / 2], [x0 - c, -b / 2]],
  offset: 0,
});
const tan25 = Math.tan((25 * Math.PI) / 180);
const flyingWing: LiftingSurfaceInput = {
  id: "fw",
  name: "ala volante",
  orientation: "horizontal",
  outline: [[0.125, 0], [0.125 - 0.4 * tan25, 0.4], [0.125 - 0.4 * tan25 - 0.15, 0.4], [-0.125, 0], [0.125 - 0.4 * tan25 - 0.15, -0.4], [0.125 - 0.4 * tan25, -0.4]],
  offset: 0,
};

describe("unsteady vortex lattice (mini-design 007)", () => {
  it("settles on the steady lattice after a step in α: CL within 0.5 %, Cm within 0.002 (case 3)", () => {
    for (const [surface, ns, nc] of [[rect(1.2, 0.2), 8, 4], [flyingWing, 8, 4]] as const) {
      const V = 12, alpha = 0.03;
      const lattice = buildLattice([surface], { spanwiseStrips: ns, chordwisePanels: nc, spacing: "cosine" });
      const cgX = -0.02;
      const steady = solveVlm(factorLattice(lattice), { alpha, beta: 0, speed: V, density: rho }, [cgX, 0, 0]);
      const c = 0.2;
      const model = buildUvlm(lattice, { speed: V, density: rho, dt: c / (nc * V), wakeRows: 40 * nc, model: "unsteady" });
      const steps = 60 * nc;
      const h = simulateLongitudinal(model, { mass: 1, iyy: 1, cgX, freeHeave: false, freePitch: false }, steps, () => V * alpha);
      const q = 0.5 * rho * V * V;
      const area = lattice.strips.reduce((s, k) => s + k.chord * (k.s1 - k.s0), 0);
      // Small α: the lattice's force along −z is the lift to first order.
      const clU = -h.fz[steps]! / (q * area);
      const clS = -steady.force[2] / (q * area);
      expect(Math.abs(clU / clS - 1)).toBeLessThan(0.005);
      expect(Math.abs((h.my[steps]! - steady.moment[1]) / (q * area * c))).toBeLessThan(0.002);
    }
  });

  it("integrates the vertical response to a uniform 1 − cos gust as its analytic solution, error < 1e-6 (case 4)", () => {
    const V = 10, c = 0.2, b = 1.2, mass = 2, U = 1.5, H = 12.5 * c;
    const lattice = buildLattice([rect(b, c)], { spanwiseStrips: 6, chordwisePanels: 3, spacing: "cosine" });
    const dt = 2e-4;
    const model = buildUvlm(lattice, { speed: V, density: rho, dt, wakeRows: 0, model: "quasi-steady" });
    // Lift per unit upwash of the quasi-steady lattice: F_z = −C (ż + w).
    const unit = simulateLongitudinal(model, { mass, iyy: 1, cgX: 0, freeHeave: false, freePitch: false }, 1, () => 1);
    const C = -unit.fz[1]!;
    const k = C / mass, w = (Math.PI * V) / H, g = 9.80665;
    const steps = Math.round((2 * H) / V / dt);
    const h = simulateLongitudinal(model, { mass, iyy: 1, cgX: 0, freeHeave: true, freePitch: false }, steps, (t) => oneMinusCosine(V * t, U, H));
    let worst = 0, peak = 0;
    for (let s = 1; s <= steps; s++) {
      const t = h.t[s]!;
      const I = (Math.exp(k * t) - 1) / k - (Math.exp(k * t) * (k * Math.cos(w * t) + w * Math.sin(w * t)) - k) / (k * k + w * w);
      const zDot = -k * Math.exp(-k * t) * (U / 2) * I;
      const dn = (k / g) * (zDot + oneMinusCosine(V * t, U, H));
      peak = Math.max(peak, Math.abs(dn));
      worst = Math.max(worst, Math.abs(-h.fz[s]! / (mass * g) - dn));
    }
    expect(worst / peak).toBeLessThan(1e-6);
  });

  it("keeps Newton's law between the aerodynamic force and the motion it integrates", () => {
    const V = 15;
    const lattice = buildLattice([flyingWing], { spanwiseStrips: 6, chordwisePanels: 3, spacing: "cosine" });
    const model = buildUvlm(lattice, { speed: V, density: rho, dt: 0.2 / (3 * V), wakeRows: 30, model: "unsteady" });
    const mass = 0.6;
    const h = simulateLongitudinal(model, { mass, iyy: 0.012, cgX: 0.01, freeHeave: true, freePitch: true }, 200, (t, i) =>
      oneMinusCosine(V * t - (0.125 - model.controlX[i]!), 2, 2.5),
    );
    // Trapezoidal rule: ż(n+1) − ż(n) = Δt/2 (F(n) + F(n+1)) / m.
    for (let s = 1; s < 200; s++) {
      const lhs = h.zDot[s + 1]! - h.zDot[s]!;
      const rhs = ((model.options.dt / 2) * (h.fz[s]! + h.fz[s + 1]!)) / mass;
      expect(Math.abs(lhs - rhs)).toBeLessThan(1e-12 + 1e-9 * Math.abs(rhs));
    }
  });

  it("gives no rolling moment on a symmetric wing in a vertical gust (case 8)", () => {
    const V = 15;
    const lattice = buildLattice([flyingWing], { spanwiseStrips: 8, chordwisePanels: 3, spacing: "cosine" });
    const model = buildUvlm(lattice, { speed: V, density: rho, dt: 0.2 / (3 * V), wakeRows: 30, model: "unsteady" });
    const S = lattice.strips.length;
    const h = simulateLongitudinal(model, { mass: 0.6, iyy: 0.012, cgX: 0.01, freeHeave: true, freePitch: true }, 120, (t, i) =>
      oneMinusCosine(V * t - (0.125 - model.controlX[i]!), 2, 2.5),
    );
    for (let s = 1; s <= 120; s++) {
      let roll = 0, scale = 0;
      lattice.strips.forEach((st, k) => {
        roll += h.stripFz[s * S + k]! * st.sMid;
        scale += Math.abs(h.stripFz[s * S + k]! * st.sMid);
      });
      expect(Math.abs(roll)).toBeLessThanOrEqual(1e-12 * Math.max(1, scale));
    }
  });
});

describe("gust test of a flying wing", () => {
  const input = {
    surfaces: [flyingWing],
    lattice: { spanwiseStrips: 8, chordwisePanels: 3, spacing: "cosine" as const },
    mass: 0.6,
    iyy: 0.012,
    cg: [0.01, 0, 0] as [number, number, number],
    speed: 15,
    air: { density: rho, kinematicViscosity: 1.46e-5, speedOfSound: 340 },
    gust: { amplitude: 2, gradient: null, up: true },
    model: "unsteady" as const,
    wing: { thickness: 0.003, young: null, strength: null, arealMass: null },
  };
  it("loads the wing up in an upward gust and down in a downward one, starting from 1 g", () => {
    const up = gustResponse(input).value;
    const down = gustResponse({ ...input, gust: { ...input.gust, up: false } }).value;
    expect(up.history.loadFactor[0]).toBe(1);
    expect(up.maxLoadFactor.value).toBeGreaterThan(1.3);
    expect(down.minLoadFactor.value).toBeLessThan(0.7);
    expect(up.maxRootMoment.value).toBeGreaterThan(0);
    // No Young's modulus given: no deflection and no frequency are invented.
    expect(up.deflectedShape).toBeNull();
    expect(up.frequency).toBeNull();
  });
  it("marks an unstable CG red", () => {
    const r = gustResponse({ ...input, cg: [-0.03, 0, 0] });
    expect(r.validity.checks.find((c) => c.quantity === "staticMargin")?.level).toBe("red");
  });
});
