import { describe, expect, it } from "vitest";
import { multiply, multiplyVector, transpose, at, type Mat3 } from "../../src/core/mat3.ts";
import {
  eulerZYXFromQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromEulerZYX,
  rotationMatrix,
} from "../../src/core/rotation.ts";
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

  it("Euler z-y-x: yaw +90 deg maps x onto y, pitch +90 deg maps x onto -z, roll +90 deg maps y onto z", () => {
    const apply = (roll: number, pitch: number, yaw: number, v: [number, number, number]) =>
      multiplyVector(
        rotationMatrix(quaternionFromEulerZYX({ roll: radians(roll), pitch: radians(pitch), yaw: radians(yaw) })),
        v,
      );
    const h = Math.PI / 2;
    const close3 = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 15));
    close3(apply(0, 0, h, [1, 0, 0]), [0, 1, 0]); // nose right
    close3(apply(0, h, 0, [1, 0, 0]), [0, 0, -1]); // nose up (z is down)
    close3(apply(h, 0, 0, [0, 1, 0]), [0, 0, 1]); // right wing down
  });

  it("Euler z-y-x equals Rz(yaw) Ry(pitch) Rx(roll) (Stevens, Lewis & Johnson)", () => {
    const [phi, theta, psi] = [0.3, -0.7, 2.1];
    const rx: Mat3 = [1, 0, 0, 0, Math.cos(phi), -Math.sin(phi), 0, Math.sin(phi), Math.cos(phi)];
    const ry: Mat3 = [Math.cos(theta), 0, Math.sin(theta), 0, 1, 0, -Math.sin(theta), 0, Math.cos(theta)];
    const rz: Mat3 = [Math.cos(psi), -Math.sin(psi), 0, Math.sin(psi), Math.cos(psi), 0, 0, 0, 1];
    const expected = multiply(multiply(rz, ry), rx);
    const actual = rotationMatrix(quaternionFromEulerZYX({ roll: radians(phi), pitch: radians(theta), yaw: radians(psi) }));
    for (let i = 0; i < 9; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 14);
  });

  it("Euler round trip, including gimbal lock", () => {
    for (const [r, p, y] of [
      [0.1, 0.2, 0.3],
      [-2.5, 1.2, -3.0],
      [3.1, -1.5, 0.7],
      [0, 0, 0],
    ] as const) {
      const back = eulerZYXFromQuaternion(quaternionFromEulerZYX({ roll: radians(r), pitch: radians(p), yaw: radians(y) }));
      expect(back.roll).toBeCloseTo(r, 12);
      expect(back.pitch).toBeCloseTo(p, 12);
      expect(back.yaw).toBeCloseTo(y, 12);
    }
    const locked = eulerZYXFromQuaternion(
      quaternionFromEulerZYX({ roll: radians(0), pitch: radians(Math.PI / 2), yaw: radians(0.4) }),
    );
    expect(locked.roll).toBe(0);
    expect(locked.pitch).toBeCloseTo(Math.PI / 2, 6);
    expect(locked.yaw).toBeCloseTo(0.4, 6);
  });

  it("Hamilton product composes rotations: R(a*b) = R(a) R(b)", () => {
    const a = quaternionFromAxisAngle([1, 2, 0.5], radians(0.9));
    const b = quaternionFromAxisAngle([-0.3, 0.1, 1], radians(-1.7));
    const ab = rotationMatrix(multiplyQuaternions(a, b));
    const expected = multiply(rotationMatrix(a), rotationMatrix(b));
    for (let i = 0; i < 9; i++) expect(ab[i]).toBeCloseTo(expected[i]!, 14);
  });

  it("rejects quaternions that are not unit length", () => {
    expect(() => normalizeQuaternion({ w: 1, x: 1, y: 0, z: 0 })).toThrow(RangeError);
    expect(normalizeQuaternion({ w: 1 + 1e-9, x: 0, y: 0, z: 0 }).w).toBeCloseTo(1, 15);
  });
});
