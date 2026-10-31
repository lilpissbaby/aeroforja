/**
 * Validation: mass properties of closed triangle meshes (mini-design 005)
 * against the closed forms of homogeneous solids (Meriam, Kraige & Bolton,
 * Appendix D) and the parallel-axis theorem.
 */
import { describe, expect, it } from "vitest";
import { mat3, meshMassProperties, meshTopology, quaternionFromAxisAngle, radians, rotationMatrix, type Mat3, type Triple } from "@aeroforja/physics";
import { EXACT_TOLERANCE } from "../src/index.ts";

type Tri = [Triple, Triple, Triple];

function boxMesh(a: number, b: number, c: number): Tri[] {
  const x = a / 2, y = b / 2, z = c / 2;
  const v: Triple[] = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  // Outward-facing (counter-clockwise seen from outside).
  const faces = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3],
  ];
  return faces.flatMap(([p, q, r, s]) => [[v[p!]!, v[q!]!, v[r!]!], [v[p!]!, v[r!]!, v[s!]!]] as Tri[]);
}

function prismMesh(sides: number, radius: number, height: number): Tri[] {
  const tris: Tri[] = [];
  const ring = (z: number) => Array.from({ length: sides }, (_, k) => [radius * Math.cos((2 * Math.PI * k) / sides), radius * Math.sin((2 * Math.PI * k) / sides), z] as Triple);
  const bottom = ring(-height / 2);
  const top = ring(height / 2);
  const cb: Triple = [0, 0, -height / 2];
  const ct: Triple = [0, 0, height / 2];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    tris.push([cb, bottom[k1]!, bottom[k]!]);
    tris.push([ct, top[k]!, top[k1]!]);
    tris.push([bottom[k]!, bottom[k1]!, top[k1]!]);
    tris.push([bottom[k]!, top[k1]!, top[k]!]);
  }
  return tris;
}

const flat = (tris: Tri[], transform: (p: Triple) => Triple = (p) => p): Float64Array =>
  Float64Array.from(tris.flatMap((t) => t.flatMap((p) => [...transform(p)])));

const expectMatrix = (actual: Mat3, expected: Mat3, scale: number) => {
  for (let i = 0; i < 9; i++) expect(Math.abs(actual[i]! - expected[i]!) / scale, `entry ${i}`).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
};

describe("closed-mesh check", () => {
  it("a box is closed; a box with a face removed is not", () => {
    const box = boxMesh(1, 2, 3);
    expect(meshTopology(flat(box), 1e-9).closed).toBe(true);
    const open = meshTopology(flat(box.slice(2)), 1e-9);
    expect(open.closed).toBe(false);
    expect(open.boundaryEdges).toBe(4);
  });
  it("a box with one flipped triangle is reported", () => {
    const box = boxMesh(1, 1, 1);
    const [a, b, c] = box[0]!;
    box[0] = [a, c, b];
    expect(meshTopology(flat(box), 1e-9).closed).toBe(false);
  });
});

describe("box: mass, centroid and inertia", () => {
  const [a, b, c, rho] = [0.04, 0.025, 0.012, 1150];
  const m = rho * a * b * c;
  const analytic: Mat3 = [(m * (b * b + c * c)) / 12, 0, 0, 0, (m * (a * a + c * c)) / 12, 0, 0, 0, (m * (a * a + b * b)) / 12];

  it("centred box matches m(b²+c²)/12 etc.", () => {
    const r = meshMassProperties(flat(boxMesh(a, b, c)), rho).value;
    expect(Math.abs(r.mass - m) / m).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
    expect(Math.hypot(...r.centroid)).toBeLessThan(1e-15);
    expectMatrix(r.inertia, analytic, analytic[0]!);
  });

  it("rotated and displaced box: same tensor rotated, centroid at the displacement", () => {
    const R = rotationMatrix(quaternionFromAxisAngle([1, 2, 3].map((v) => v / Math.sqrt(14)) as unknown as Triple, radians(0.7)));
    const d: Triple = [0.31, -0.12, 0.05];
    const tris = flat(boxMesh(a, b, c), (p) => {
      const q = mat3.multiplyVector(R, p);
      return [q[0] + d[0], q[1] + d[1], q[2] + d[2]];
    });
    const r = meshMassProperties(tris, rho).value;
    for (let i = 0; i < 3; i++) expect(Math.abs(r.centroid[i]! - d[i]!)).toBeLessThan(1e-14);
    // Translation and the parallel-axis theorem cancel at the centroid: only the rotation remains.
    expectMatrix(r.inertia, mat3.rotateTensor(R, analytic), analytic[0]!);
  });
});

describe("regular prism against the closed form", () => {
  for (const sides of [3, 6, 64]) {
    it(`${sides}-sided prism: Izz = mR²(1 + 2cos²(π/N))/6`, () => {
      const [R, h, rho] = [0.02, 0.05, 1200];
      const area = 0.5 * sides * R * R * Math.sin((2 * Math.PI) / sides);
      const m = rho * area * h;
      const polar = (m * R * R * (1 + 2 * Math.cos(Math.PI / sides) ** 2)) / 6;
      const r = meshMassProperties(flat(prismMesh(sides, R, h)), rho).value;
      expect(Math.abs(r.mass - m) / m).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
      expect(Math.abs(r.inertia[8]! - polar) / polar).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
      const transverse = polar / 2 + (m * h * h) / 12;
      expect(Math.abs(r.inertia[0]! - transverse) / transverse).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
    });
  }
});

describe("parallel-axis theorem", () => {
  it("two equal boxes 2d apart: I = 2 I_box + 2 m d² about the common centroid", () => {
    const [a, b, c, rho, dx] = [0.01, 0.02, 0.03, 1000, 0.1];
    const one = boxMesh(a, b, c);
    const tris = Float64Array.from([
      ...flat(one, (p) => [p[0] + dx, p[1], p[2]]),
      ...flat(one, (p) => [p[0] - dx, p[1], p[2]]),
    ]);
    const m = rho * a * b * c;
    const r = meshMassProperties(tris, rho).value;
    const iyy = 2 * ((m * (a * a + c * c)) / 12 + m * dx * dx);
    expect(Math.abs(r.inertia[4]! - iyy) / iyy).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
    const ixx = (2 * m * (b * b + c * c)) / 12;
    expect(Math.abs(r.inertia[0]! - ixx) / ixx).toBeLessThanOrEqual(EXACT_TOLERANCE.relative);
  });
});
