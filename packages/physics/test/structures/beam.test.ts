import { describe, expect, it } from "vitest";
import { bendingMoments, deflection, firstBendingFrequency, plateInertia, plateStress, type PlateBeam } from "../../src/structures/beam.ts";

/** A uniform cantilever cut in n cells, each loaded at its middle. */
function uniform(n: number, L: number, chord: number, t: number): { beam: PlateBeam; mids: number[] } {
  const mids = Array.from({ length: n }, (_, k) => ((k + 0.5) * L) / n);
  const stations = [0, ...mids, L];
  return { beam: { stations, chord: stations.map(() => chord), thickness: t }, mids };
}

describe("half wing as a plate cantilever (mini-design 007, cases 6 and 7)", () => {
  const E = 3e9, L = 0.4, c = 0.2, t = 0.003;
  it("gives qL²/2 at the root and qL⁴/(8EI) at the tip under a uniform load, ±0.5 %", () => {
    const { beam, mids } = uniform(400, L, c, t);
    const q = 37.5; // N/m
    const loads = mids.map((y) => ({ y, force: (q * L) / mids.length }));
    const m = bendingMoments(beam, loads);
    expect(Math.abs(m[0]! / ((q * L * L) / 2) - 1)).toBeLessThan(0.005);
    const w = deflection(beam, m, E);
    const exact = (q * L ** 4) / (8 * E * plateInertia(c, t));
    expect(Math.abs(w[w.length - 1]! / exact - 1)).toBeLessThan(0.005);
  });

  it("gives L_half · 4(b/2)/(3π) at the root under an elliptic load, ±0.5 %", () => {
    const { beam, mids } = uniform(800, L, c, t);
    const half = 10; // N on the half wing
    const w0 = (4 * half) / (Math.PI * L); // peak of the elliptic load per metre
    const loads = mids.map((y) => ({ y, force: w0 * Math.sqrt(1 - (y / L) ** 2) * (L / mids.length) }));
    const m = bendingMoments(beam, loads);
    expect(Math.abs(m[0]! / ((half * 4 * L) / (3 * Math.PI)) - 1)).toBeLessThan(0.005);
  });

  it("matches a fine quadrature on a tapered plate, ±0.5 %", () => {
    const chordAt = (y: number) => 0.25 - (0.1 * y) / L;
    const coarse = 60, fine = 6000;
    const make = (n: number) => {
      const mids = Array.from({ length: n }, (_, k) => ((k + 0.5) * L) / n);
      const stations = [0, ...mids, L];
      const beam: PlateBeam = { stations, chord: stations.map(chordAt), thickness: t };
      const loads = mids.map((y) => ({ y, force: (40 * chordAt(y) * L) / n }));
      const w = deflection(beam, bendingMoments(beam, loads), E);
      return w[w.length - 1]!;
    };
    expect(Math.abs(make(coarse) / make(fine) - 1)).toBeLessThan(0.005);
  });

  it("computes σ = 6M/(c t²)", () => {
    expect(plateStress(1, 0.2, 0.003)).toBeCloseTo(6 / (0.2 * 9e-6), 6);
  });

  it("finds the first bending frequency of a uniform cantilever, (1.875²/2π)√(EI/(m'L⁴)) ±0.5 %", () => {
    const n = 300;
    const { beam, mids } = uniform(n, L, c, t);
    const mPerLength = 2.1 * c; // kg/m
    const mass = [0, ...mids.map(() => (mPerLength * L) / n), 0];
    const f = firstBendingFrequency(beam, mass, E);
    const exact = (1.875104 ** 2 / (2 * Math.PI)) * Math.sqrt((E * plateInertia(c, t)) / (mPerLength * L ** 4));
    expect(Math.abs(f / exact - 1)).toBeLessThan(0.005);
  });
});
