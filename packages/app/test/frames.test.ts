import { describe, expect, it } from "vitest";
import { mat3, quaternionFromEulerZYX, radians, rotationMatrix } from "@aeroforja/physics";
import { FRD_TO_THREE, boxSizeInScene, frdToThree, rotationFrdToThree } from "../src/three/frames.ts";

const det = (m: readonly number[]): number =>
  m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);

describe("FRD to three.js scene axes", () => {
  it("forward is -z, right is +x, down is -y", () => {
    expect(frdToThree([1, 0, 0])).toEqual([0, -0, -1]);
    expect(frdToThree([0, 1, 0])).toEqual([1, -0, -0]);
    expect(frdToThree([0, 0, 1])).toEqual([0, -1, -0]);
  });

  it("is a proper rotation (det +1), so handedness is kept", () => {
    expect(det(FRD_TO_THREE)).toBe(1);
    expect(mat3.multiplyVector(FRD_TO_THREE, [0.1, -0.2, 0.3])).toEqual(frdToThree([0.1, -0.2, 0.3]));
  });

  it("maps a rotation R to M R M^T: rotating then mapping equals mapping then rotating", () => {
    const r = rotationMatrix(quaternionFromEulerZYX({ roll: radians(0.4), pitch: radians(-0.3), yaw: radians(1.2) }));
    const v: [number, number, number] = [0.3, 0.1, -0.2];
    const a = frdToThree(mat3.multiplyVector(r, v));
    const b = mat3.multiplyVector(rotationFrdToThree(r), frdToThree(v));
    for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(a[i]!, 14);
  });

  it("box sides along component x, y, z become depth, width, height", () => {
    expect(boxSizeInScene({ x: 0.07, y: 0.035, z: 0.03 })).toEqual([0.035, 0.03, 0.07]);
  });
});
