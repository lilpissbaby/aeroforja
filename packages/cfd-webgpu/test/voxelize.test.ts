import { describe, expect, it } from "vitest";
import { boxMesh, isClosed, sphereMesh, voxelize, type VoxelGrid } from "../src/voxelize.ts";

const grid = (dx: number, n: number, origin = -((n - 1) / 2) * dx): VoxelGrid => ({ origin: [origin, origin, origin], dx, nx: n, ny: n, nz: n });
const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);

describe("voxelization (mini-design 006, case 6)", () => {
  it("knows a closed mesh from an open one", () => {
    const box = boxMesh([0, 0, 0], [1, 1, 1]);
    expect(isClosed(box)).toBe(true);
    expect(isClosed(box.slice(0, box.length - 9))).toBe(false);
  });

  it("gives an aligned box its exact volume", () => {
    const g = grid(0.01, 40);
    // Faces half-way between cell centres: 10 × 6 × 4 cells inside.
    const lo = -0.05, hi = [0.05, 0.03, 0.02];
    const solid = new Uint8Array(40 ** 3);
    voxelize(g, [{ id: "b", triangles: boxMesh([lo + 0.005 - 0.005, -0.03, -0.02], [hi[0]!, hi[1]!, hi[2]!]) }], solid);
    // Cell centres at multiples of 0.01 − 0.195; faces at ±0.05 etc. fall between centres.
    expect(count(solid)).toBe(10 * 6 * 4);
  });

  it("keeps a sphere within (area · Δx/2) of its volume", () => {
    const dx = 0.002;
    const r = 0.03;
    const g = grid(dx, 48, -0.047);
    const solid = new Uint8Array(48 ** 3);
    voxelize(g, [{ id: "s", triangles: sphereMesh([0.0003, -0.0002, 0.0001], r, 96, 48) }], solid);
    const vol = count(solid) * dx ** 3;
    const exact = (4 / 3) * Math.PI * r ** 3;
    expect(Math.abs(vol - exact)).toBeLessThan(4 * Math.PI * r * r * (dx / 2));
  });

  it("keeps a 3 mm plate on an 8 mm lattice, one cell thick over its whole outline", () => {
    const dx = 0.008;
    const n = 40;
    const g: VoxelGrid = { origin: [-0.156, -0.156, -0.156], dx, nx: n, ny: n, nz: n };
    // Horizontal plate 200 × 120 mm, mid-plane at z = 0.0005 (between centres −0.004 and 0.004).
    const solid = new Uint8Array(n ** 3);
    voxelize(g, [{ id: "p", triangles: boxMesh([-0.1, -0.06, -0.001], [0.1, 0.06, 0.002]) }], solid);
    let layers = new Set<number>();
    let columns = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        let inColumn = 0;
        for (let k = 0; k < n; k++)
          if (solid[i + n * (j + n * k)] === 1) {
            inColumn++;
            layers.add(k);
          }
        expect(inColumn).toBeLessThanOrEqual(1);
        if (inColumn === 1) columns++;
      }
    expect(layers.size).toBe(1);
    // Columns whose centre lies over the plate: 25 × 15.
    expect(columns).toBe(25 * 15);
  });
});
