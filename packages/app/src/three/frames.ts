/**
 * Body axes FRD (x forward, y right, z down) to three.js scene axes
 * (x right, y up, z towards the viewer; "forward" is -z).
 *
 *   three = M * frd,  M = [[0, 1, 0], [0, 0, -1], [-1, 0, 0]]
 *
 * M is a proper rotation (det = +1), so handedness is preserved and a
 * rotation R expressed in FRD becomes M R M^T in the scene.
 */
import type { Mat3, Triple } from "@aeroforja/physics";

export const FRD_TO_THREE: Mat3 = [0, 1, 0, 0, 0, -1, -1, 0, 0];

export function frdToThree(v: Triple): Triple {
  return [v[1], -v[2], -v[0]];
}

/** M R M^T, row-major, for a rotation R given in FRD. */
export function rotationFrdToThree(r: Mat3): Mat3 {
  const m = FRD_TO_THREE;
  const mul = (a: Mat3, b: Mat3): Mat3 => {
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
      }
    }
    return out as unknown as Mat3;
  };
  const mt: Mat3 = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  return mul(mul(m, r), mt);
}

/**
 * Extent of a box along the scene axes for a box whose sides (a, b, c) lie
 * along component x, y, z: the scene box is (width, height, depth) =
 * (b, c, a) before the component rotation is applied.
 */
export function boxSizeInScene(size: { x: number; y: number; z: number }): Triple {
  return [size.y, size.z, size.x];
}
