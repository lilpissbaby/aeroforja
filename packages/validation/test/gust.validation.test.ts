/**
 * Mini-design 007, case 5: the vertical response of a rectangular wing of
 * AR 6 to a 1 − cos gust of 12.5 chords, unsteady lattice, against the
 * Pratt–Walker alleviation factor K_g.
 */
import { describe, expect, it } from "vitest";
import { buildLattice, buildUvlm, factorLattice, oneMinusCosine, prattWalkerKg, simulateLongitudinal, solveVlm } from "@aeroforja/physics";
import { PRATT_WALKER_CASE } from "../src/index.ts";

describe("gust test: Pratt–Walker", () => {
  it("gives Δn_max / Δn_static within 10 % of K_g for μ_g = 10 to 100", () => {
    const rho = 1.225, V = 15, c = 0.2, b = PRATT_WALKER_CASE.aspectRatio * c, S = b * c, nc = PRATT_WALKER_CASE.chordwisePanels;
    const lattice = buildLattice([{ id: "w", name: "w", orientation: "horizontal", outline: [[0, -b / 2], [0, b / 2], [-c, b / 2], [-c, -b / 2]], offset: 0 }], {
      spanwiseStrips: PRATT_WALKER_CASE.stripsPerSemispan,
      chordwisePanels: nc,
      spacing: "cosine",
    });
    const steady = solveVlm(factorLattice(lattice), { alpha: 0.01, beta: 0, speed: V, density: rho }, [0, 0, 0]);
    const a = -steady.force[2] / (0.5 * rho * V * V * S * 0.01);
    const model = buildUvlm(lattice, { speed: V, density: rho, dt: c / (nc * V), wakeRows: 30 * nc, model: "unsteady" });
    const H = PRATT_WALKER_CASE.gradientChords * c, U = 1;
    for (const mu of PRATT_WALKER_CASE.massRatios) {
      const mass = (mu * rho * c * a * S) / 2;
      const steps = Math.ceil(((2 * H) / V + 1.5) / model.options.dt);
      const h = simulateLongitudinal(model, { mass, iyy: 1, cgX: -c / 4, freeHeave: true, freePitch: false }, steps, (t, i) => oneMinusCosine(V * t + model.controlX[i]!, U, H));
      let dn = 0;
      for (let k = 0; k <= steps; k++) dn = Math.max(dn, -h.fz[k]! / (mass * 9.80665));
      const dnStatic = (rho * V * a * U) / (2 * ((mass * 9.80665) / S));
      expect(Math.abs(dn / dnStatic / prattWalkerKg(mu) - 1)).toBeLessThanOrEqual(PRATT_WALKER_CASE.tolerance.relative);
    }
  });
});
