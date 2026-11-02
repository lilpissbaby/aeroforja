/**
 * Mini-design 007, cases 1 and 2: indicial lift of flat elliptic wings
 * against R. T. Jones (1940), and the sharp-edged gust at mid-span of an
 * AR 40 wing against Küssner's function. Slow: `pnpm test:slow`, and in CI.
 */
import { describe, expect, it } from "vitest";
import { buildLattice, buildUvlm, factorLattice, simulateLongitudinal, solveVlm } from "@aeroforja/physics";
import { JONES_INDICIAL, JONES_TOLERANCE, KUSSNER_CASE, kussner } from "../src/index.ts";

const rho = 1.225, V = 10;

describe("gust test: indicial functions", () => {
  it("follows Jones's indicial lift for elliptic wings of AR 3 and 6 within 5 % (τ = 2 to 30)", () => {
    for (const j of JONES_INDICIAL) {
      const c0 = 0.2;
      const b = (j.aspectRatio * Math.PI * c0) / 4;
      const N = 120;
      const outline: [number, number][] = [];
      for (let k = 0; k <= N; k++) {
        const th = (Math.PI * k) / N;
        outline.push([(c0 * Math.sin(th)) / 4, (-b / 2) * Math.cos(th)]);
      }
      for (let k = N - 1; k >= 1; k--) {
        const th = (Math.PI * k) / N;
        outline.push([(-3 * c0 * Math.sin(th)) / 4, (-b / 2) * Math.cos(th)]);
      }
      const nc = 10;
      const lattice = buildLattice([{ id: "w", name: "w", orientation: "horizontal", outline, offset: 0 }], { spanwiseStrips: j.aspectRatio === 3 ? 20 : 24, chordwisePanels: nc, spacing: "cosine" });
      const alpha = 0.02;
      const steady = solveVlm(factorLattice(lattice), { alpha, beta: 0, speed: V, density: rho }, [0, 0, 0]);
      const model = buildUvlm(lattice, { speed: V, density: rho, dt: c0 / (nc * V), wakeRows: 30 * nc, model: "unsteady" });
      const steps = Math.round(JONES_TOLERANCE.tauMax / (2 / nc));
      const h = simulateLongitudinal(model, { mass: 1, iyy: 1, cgX: 0, freeHeave: false, freePitch: false }, steps, () => V * alpha);
      for (let k = 1; k <= steps; k++) {
        const tau = (2 * V * h.t[k]!) / c0;
        if (tau < JONES_TOLERANCE.tauMin - 1e-9) continue;
        const ratio = -h.fz[k]! / -steady.force[2];
        expect(Math.abs(ratio / (1 - j.A * Math.exp(-j.B * tau)) - 1)).toBeLessThanOrEqual(JONES_TOLERANCE.relative);
      }
    }
  }, 600_000);

  it("follows Küssner's function at mid-span of an AR 40 wing within 6 % (τ = 4 to 30)", () => {
    const c = 0.1, b = KUSSNER_CASE.aspectRatio * c, nc = KUSSNER_CASE.chordwisePanels;
    const lattice = buildLattice([{ id: "w", name: "w", orientation: "horizontal", outline: [[0, -b / 2], [0, b / 2], [-c, b / 2], [-c, -b / 2]], offset: 0 }], {
      spanwiseStrips: KUSSNER_CASE.stripsPerSemispan,
      chordwisePanels: nc,
      spacing: "cosine",
    });
    const alpha = 0.02;
    const steady = solveVlm(factorLattice(lattice), { alpha, beta: 0, speed: V, density: rho }, [0, 0, 0]);
    const model = buildUvlm(lattice, { speed: V, density: rho, dt: c / (nc * V), wakeRows: KUSSNER_CASE.wakeChords * nc, model: "unsteady" });
    const S = lattice.strips.length;
    const mid = lattice.strips
      .map((s, k) => ({ k, d: Math.abs(s.sMid) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .map((x) => x.k);
    let steadyMid = 0;
    for (const k of mid) for (const p of lattice.strips[k]!.panels) steadyMid += -steady.panelForces[p]![2];
    const steps = Math.round(KUSSNER_CASE.tolerance.tauMax / (2 / nc));
    // Sharp-edged gust: the front reaches the leading edge (x = 0) at t = 0.
    const h = simulateLongitudinal(model, { mass: 1, iyy: 1, cgX: 0, freeHeave: false, freePitch: false }, steps, (t, i) => (V * t >= -model.controlX[i]! ? V * alpha : 0));
    for (let k = 1; k <= steps; k++) {
      const tau = (2 * V * h.t[k]!) / c;
      if (tau < KUSSNER_CASE.tolerance.tauMin - 1e-9) continue;
      const ratio = mid.reduce((s, j) => s - h.stripFz[k * S + j]!, 0) / steadyMid;
      expect(Math.abs(ratio / kussner(tau) - 1)).toBeLessThanOrEqual(KUSSNER_CASE.tolerance.relative);
    }
  }, 900_000);
});
