import { describe, expect, it } from "vitest";
import { multiply, multiplyVector, transpose, at } from "../../src/core/mat3.ts";
import { normalizeQuaternion, quaternionFromAxisAngle, rotationMatrix } from "../../src/core/rotation.ts";
import { radians } from "../../src/core/units.ts";

const det = (m: ReturnType<typeof rotationMatrix>): number =>
  at(m, 0, 0) * (at(m, 1, 1) * at(m, 2, 2) - at(m, 1, 2) * at(m, 2, 1)) -
  at(m, 0, 1) * (at(m, 1, 0) * at(m, 2, 2) - at(m, 1, 2) * at(m, 2, 0)) +
  at(m, 0, 2) * (at(m, 1, 0) * at(m, 2, 1) - at(m, 1, 1) * at(m, 2, 0));

describe("quaternion rotation (scalar first, Hamilton, active)", () => {
  it("+90 deg about z maps component x onto body y", () => {
    const r = rotationMatrix(quaternionFromAxisAngle([0, 0, 1], radians(Math.PI / 2)));
    const v = multiplyVector(r, [1, 0, 0]);
    expect(v[0]).toBeCloseTo(0, 15);
    expect(v[1]).toBeCloseTo(1, 15);
    expect(v[2]).toBeCloseTo(0, 15);
  });

  it("+90 deg about y maps x onto -z (nose down in FRD is negative pitch)", () => {
    const r = rotationMatrix(quaternionFromAxisAngle([0, 1, 0], radians(Math.PI / 2)));
    const v = multiplyVector(r, [1, 0, 0]);
    expect(v[2]).toBeCloseTo(-1, 15);
  });

  it("gives proper rotation matrices: orthonormal with determinant +1", () => {
    for (const [axis, angle] of [
      [[1, 2, 3], 0.7],
      [[-1, 0.5, 0.2], 2.9],
      [[0, 0, 1], -1.2],
    ] as const) {
      const r = rotationMatrix(quaternionFromAxisAngle(axis, radians(angle)));
      const rtr = multiply(transpose(r), r);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(at(rtr, i, j)).toBeCloseTo(i === j ? 1 : 0, 14);
      expect(det(r)).toBeCloseTo(1, 14);
    }
  });

  it("rejects quaternions that are not unit length", () => {
    expect(() => normalizeQuaternion({ w: 1, x: 1, y: 0, z: 0 })).toThrow(RangeError);
    expect(normalizeQuaternion({ w: 1 + 1e-9, x: 0, y: 0, z: 0 }).w).toBeCloseTo(1, 15);
  });
});
