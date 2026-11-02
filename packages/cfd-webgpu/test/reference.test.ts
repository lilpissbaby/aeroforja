import { describe, expect, it } from "vitest";
import { CX, CY, CZ, EQUILIBRIUM, FLUID, OPPOSITE, OUTLET, Q, W } from "../src/lattice.ts";
import { ReferenceSolver, shiftedEquilibrium } from "../src/reference.ts";

describe("D3Q19 velocity set", () => {
  it("has weights that sum to 1 and isotropic second moments c_s² = 1/3", () => {
    expect(W.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 15);
    let sxx = 0, sxy = 0, sx = 0;
    for (let i = 0; i < Q; i++) {
      sxx += W[i]! * CX[i]! * CX[i]!;
      sxy += W[i]! * CX[i]! * CY[i]!;
      sx += W[i]! * CX[i]!;
    }
    expect(sxx).toBeCloseTo(1 / 3, 15);
    expect(sxy).toBe(0);
    expect(sx).toBe(0);
  });
  it("pairs every direction with its opposite", () => {
    for (let i = 0; i < Q; i++) {
      const o = OPPOSITE[i]!;
      expect([CX[o], CY[o], CZ[o]]).toEqual([-CX[i]! || 0, -CY[i]! || 0, -CZ[i]! || 0]);
      expect(OPPOSITE[o]).toBe(i);
    }
  });
  it("recovers ρ and ρu from the shifted equilibrium", () => {
    const rho = 1.013, u = [0.04, -0.02, 0.011] as const;
    let r = 1, jx = 0, jy = 0, jz = 0;
    for (let i = 0; i < Q; i++) {
      const g = shiftedEquilibrium(i, rho, u[0], u[1], u[2]);
      r += g;
      jx += CX[i]! * g;
      jy += CY[i]! * g;
      jz += CZ[i]! * g;
    }
    expect(r).toBeCloseTo(rho, 14);
    expect(jx / rho).toBeCloseTo(u[0], 14);
    expect(jy / rho).toBeCloseTo(u[1], 14);
    expect(jz / rho).toBeCloseTo(u[2], 14);
  });
});

describe("reference solver", () => {
  it("keeps a uniform stream uniform to machine precision (mini-design 006, case 5)", () => {
    const nx = 20, ny = 12, nz = 10;
    const flags = new Uint8Array(nx * ny * nz).fill(FLUID);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = i + nx * (j + ny * k);
          if (i === 0) flags[c] = OUTLET;
          else if (i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) flags[c] = EQUILIBRIUM;
        }
    const u = [-0.05, 0.004, 0.0087] as const;
    const s = new ReferenceSolver({ grid: { nx, ny, nz }, flags, tau0: 0.5003, smagorinsky: 0.17, boundaryVelocity: u });
    s.initialize(() => ({ rho: 1, u }));
    s.run(1000);
    let worst = 0;
    for (let c = 0; c < s.n; c++) {
      worst = Math.max(worst, Math.abs(s.rho[c]! - 1), Math.abs(s.ux[c]! - u[0]), Math.abs(s.uy[c]! - u[1]), Math.abs(s.uz[c]! - u[2]));
    }
    expect(worst).toBeLessThan(1e-13);
  });

  it("decays a Taylor–Green vortex at the rate of ν = c_s²(τ − ½) within 1 % (mini-design 006, case 1)", () => {
    const L = 64;
    const k = (2 * Math.PI) / L;
    const U = 0.02;
    for (const tau of [0.6, 0.8, 1.0]) {
      const s = new ReferenceSolver({
        grid: { nx: L, ny: L, nz: 1, periodic: [true, true, true] },
        flags: new Uint8Array(L * L),
        tau0: tau,
        smagorinsky: 0,
        boundaryVelocity: [0, 0, 0],
      });
      s.initialize((i, j) => ({
        rho: 1 - 0.75 * U * U * (Math.cos(2 * k * i) + Math.cos(2 * k * j)),
        u: [-U * Math.cos(k * i) * Math.sin(k * j), U * Math.sin(k * i) * Math.cos(k * j), 0],
      }));
      const energy = () => {
        let e = 0;
        for (let c = 0; c < s.n; c++) e += s.ux[c]! ** 2 + s.uy[c]! ** 2;
        return e;
      };
      const nu = (tau - 0.5) / 3;
      const t1 = 100;
      const t2 = Math.round(t1 + 1 / (4 * nu * k * k));
      s.run(t1);
      const e1 = energy();
      s.run(t2 - t1);
      const e2 = energy();
      const rate = -Math.log(e2 / e1) / (t2 - t1);
      expect(Math.abs(rate / (4 * nu * k * k) - 1)).toBeLessThan(0.01);
    }
  });

  it("only adds dissipation with the Smagorinsky model on", () => {
    const L = 32;
    const k = (2 * Math.PI) / L;
    const U = 0.05;
    const energyAfter = (cs: number) => {
      const s = new ReferenceSolver({
        grid: { nx: L, ny: L, nz: 1, periodic: [true, true, true] },
        flags: new Uint8Array(L * L),
        tau0: 0.51,
        smagorinsky: cs,
        boundaryVelocity: [0, 0, 0],
      });
      s.initialize((i, j) => ({ rho: 1, u: [-U * Math.cos(k * i) * Math.sin(k * j), U * Math.sin(k * i) * Math.cos(k * j), 0] }));
      s.run(300);
      let e = 0;
      for (let c = 0; c < s.n; c++) e += s.ux[c]! ** 2 + s.uy[c]! ** 2;
      return e;
    };
    expect(energyAfter(0.17)).toBeLessThan(energyAfter(0));
  });
});
