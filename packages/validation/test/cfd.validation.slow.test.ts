/**
 * Mini-design 006, case 2: Schäfer & Turek (1996) benchmark 2D-1 (Re = 20)
 * on the reference solver, D = 20 cells, the lattice Mach of the tunnel
 * (U_max = 0.05) and the Smagorinsky model on as in the tunnel. Runs until
 * the drag settles (three windows of 1000 steps in a row changing less than
 * 2·10⁻⁴ of its value; acoustic waves keep a ripple of about 10⁻⁴) and
 * compares the mean of the last three windows.
 *
 * Slow (2 to 6 minutes on one core): `pnpm test:slow`, and in CI.
 */
import { describe, expect, it } from "vitest";
import { ReferenceSolver, schaferTurek2D1 } from "@aeroforja/cfd-webgpu";
import { SCHAFER_TUREK_2D1, bandError } from "../src/index.ts";

describe("CFD tunnel: Schäfer–Turek 2D-1", () => {
  it(
    "gives CD and Δp within 5 % of the benchmark band with D = 20 cells",
    () => {
      const c = schaferTurek2D1(SCHAFER_TUREK_2D1.cellsPerDiameter, 0.05);
      const s = new ReferenceSolver({ grid: c.grid, flags: c.flags, tau0: c.tau0, smagorinsky: 0.17, boundaryVelocity: c.boundaryVelocity, boundaryVelocityAt: c.boundaryVelocityAt! });
      s.initialize(c.initial);
      const scale = (c.referenceSpeed ** 2 * c.referenceArea) / 2;
      const probe = (p: readonly number[]) => {
        const i = Math.round(p[0]!);
        const j0 = Math.floor(p[1]!);
        const f = p[1]! - j0;
        const a = s.rho[i + c.grid.nx * j0]!;
        const b = s.rho[i + c.grid.nx * (j0 + 1)]!;
        return a + (b - a) * f;
      };
      let prev = 0;
      let calm = 0;
      const last: number[] = [];
      for (let it = 0; it < 150 && calm < 3; it++) {
        s.run(1000);
        const now = s.force[0] / scale;
        calm = Math.abs(now - prev) < 2e-4 * now ? calm + 1 : 0;
        prev = now;
        last.push(now);
      }
      const cd = last.slice(-3).reduce((a, b) => a + b, 0) / 3;
      // Δp in Pa: lattice pressure c_s²·Δρ times ρ (1 kg/m³) and (Δx/Δt)², with U_mean = 0.2 m/s.
      const speedScale = 0.2 / c.referenceSpeed;
      const dp = ((probe(c.probeFront) - probe(c.probeBack)) / 3) * speedScale ** 2;
      expect(calm).toBe(3);
      expect(Math.abs(bandError(cd, SCHAFER_TUREK_2D1.cd))).toBeLessThanOrEqual(SCHAFER_TUREK_2D1.tolerance);
      expect(Math.abs(bandError(dp, SCHAFER_TUREK_2D1.deltaP))).toBeLessThanOrEqual(SCHAFER_TUREK_2D1.tolerance);
      console.log(`Schäfer–Turek 2D-1: CD ${cd.toFixed(4)} (${(100 * bandError(cd, SCHAFER_TUREK_2D1.cd)).toFixed(2)} %), Δp ${dp.toFixed(5)} Pa (${(100 * bandError(dp, SCHAFER_TUREK_2D1.deltaP)).toFixed(2)} %), ${s.time} steps`);
    },
    1_800_000,
  );
});
