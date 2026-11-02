import { describe, expect, it } from "vitest";
import { EQUILIBRIUM, OUTLET, SOLID } from "../src/lattice.ts";
import { boxMesh } from "../src/voxelize.ts";
import { DEFAULT_CFD, U_LATTICE, cpFromDensity, loadsFromLattice, planTunnel, type CfdBody } from "../src/tunnel.ts";
import { subdivide } from "../src/post.ts";
import { tunnelDomain, windDirection } from "../src/domain.ts";

const AIR = { density: 1.225, kinematicViscosity: 1.4607e-5, speedOfSound: 340.29 };
const plate = (): CfdBody => ({
  id: "ala",
  name: "Ala",
  kind: "plate",
  triangles: boxMesh([-0.1, -0.4, -0.0015], [0.1, 0.4, 0.0015]),
  plate: { axis: 2, offset: 0, thickness: 0.003, area: 0.16 },
});

describe("CFD tunnel plan (mini-design 006)", () => {
  it("builds the box with 0.5 L ahead, 2 L behind, 0.5 L to the sides and 0.6 L above and below", () => {
    const d = tunnelDomain({ min: [-0.1, -0.4, -0.0015], max: [0.1, 0.4, 0.0015] }, { cells: 2e6 });
    expect(d.length).toBeCloseTo(0.8, 12);
    expect(d.size[0]).toBeCloseTo(0.2 + 2.5 * 0.8, 12);
    expect(d.size[1]).toBeCloseTo(0.8 + 0.8, 12);
    expect(d.size[2]).toBeCloseTo(0.003 + 1.2 * 0.8, 12);
    const cells = d.grid.nx * d.grid.ny * d.grid.nz;
    expect(cells).toBeGreaterThan(1.9e6);
    expect(cells).toBeLessThan(2.2e6);
  });

  it("puts the wind at α and β with the FRD signs", () => {
    const a = (5 * Math.PI) / 180;
    const w = windDirection(a, 0);
    expect(w[0]).toBeLessThan(0); // the air comes from the front
    expect(w[2]).toBeLessThan(0); // and from below: it moves towards −z (up)
    expect(Math.hypot(...w)).toBeCloseTo(1, 15);
  });

  it("lays out inlet, far field, outlet and the body; conserves Re and anchors the plate on a cell centre", () => {
    const r = planTunnel([plate()], { ...DEFAULT_CFD, cells: 300_000 }, AIR, [0, 0, 0], { area: 0.16, mac: 0.2, span: 0.8 });
    const p = r.value;
    const { nx, ny, nz, dx, origin } = p.grid;
    expect(p.flags[0]).toBe(OUTLET);
    expect(p.flags[nx - 1 + nx * (Math.floor(ny / 2) + ny * Math.floor(nz / 2))]).toBe(EQUILIBRIUM);
    expect(p.solidCells).toBeGreaterThan(0);
    const k0 = Math.round((0 - origin[2]) / dx);
    expect(Math.abs(origin[2] + k0 * dx)).toBeLessThan(1e-12);
    // Every solid cell is on the anchored layer.
    for (let c = 0; c < p.flags.length; c++) if (p.flags[c] === SOLID) expect(Math.floor(c / (nx * ny))).toBe(k0);
    expect(p.plates[0]!.represented).toBeCloseTo(dx, 12);
    // Same Reynolds number in the lattice: U_lat · (c̄/Δx) / ν_lat.
    const nuLat = (p.tau0 - 0.5) / 3;
    expect((U_LATTICE * (0.2 / dx)) / nuLat).toBeCloseTo((15 * 0.2) / AIR.kinematicViscosity, 3);
    expect(p.totalSteps).toBe(Math.ceil((3 * nx) / U_LATTICE));
    expect(r.validity.level).toBe("amber");
  });

  it("turns a lattice force into newtons and coefficients consistently", () => {
    const r = planTunnel([plate()], { ...DEFAULT_CFD, cells: 200_000, alpha: 0 }, AIR, [0, 0, 0], { area: 0.16, mac: 0.2, span: 0.8 });
    const p = r.value;
    // A pure upward lattice force (−z) is lift; along −x (the wind) is drag.
    const up = loadsFromLattice(p, [0, 0, -1], [0, 0, 0]);
    expect(up.lift).toBeCloseTo(p.forceScale, 9);
    expect(up.drag).toBeCloseTo(0, 9);
    const q = 0.5 * AIR.density * 15 * 15;
    expect(up.CL).toBeCloseTo(p.forceScale / (q * 0.16), 9);
    const back = loadsFromLattice(p, [-1, 0, 0], [0, 1, 0]);
    expect(back.drag).toBeCloseTo(p.forceScale, 9);
    expect(back.moment[1]).toBeCloseTo(p.forceScale * p.grid.dx, 9);
    // Pressure: Cp = (ρ − 1)/3 / (½ U²).
    expect(cpFromDensity(0.5 * U_LATTICE ** 2 * 3)).toBeCloseTo(1, 12);
  });

  it("subdivides a surface until no edge is longer than asked", () => {
    const s = subdivide(boxMesh([0, 0, 0], [0.3, 0.1, 0.01]), 0.02);
    for (let t = 0; t < s.positions.length; t += 9) {
      for (let e = 0; e < 3; e++) {
        const a = t + 3 * e, b = t + 3 * ((e + 1) % 3);
        const l = Math.hypot(s.positions[a]! - s.positions[b]!, s.positions[a + 1]! - s.positions[b + 1]!, s.positions[a + 2]! - s.positions[b + 2]!);
        expect(l).toBeLessThanOrEqual(0.02 + 1e-6);
      }
    }
  });
});
