/**
 * Unit quaternions for attitude and component orientation.
 *
 * Convention: scalar first (w, x, y, z), Hamilton product, active rotation.
 * A quaternion q "from frame A to frame B" maps the components of a vector
 * expressed in A to its components in B: v_B = q * v_A * conj(q) = R(q) v_A.
 * Example: a component rotated +90 deg about body z has its local x axis
 * pointing along body y.
 */
import type { Mat3 } from "./mat3.ts";
import type { Radians } from "./units.ts";
import type { Triple } from "./vector.ts";

export interface Quaternion {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const IDENTITY_QUATERNION: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

/** Tolerance on |q| - 1 before a quaternion is rejected as not a rotation. */
const NORM_TOLERANCE = 1e-6;

/** Checks that q is a unit quaternion (within 1e-6) and returns it normalised. */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const n = Math.hypot(q.w, q.x, q.y, q.z);
  if (!Number.isFinite(n) || Math.abs(n - 1) > NORM_TOLERANCE) {
    throw new RangeError(`Quaternion must have unit norm (got |q| = ${n}).`);
  }
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}

/** Rotation by `angle` about `axis` (any non-zero length). */
export function quaternionFromAxisAngle(axis: Triple, angle: Radians): Quaternion {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(n > 0)) throw new RangeError("Rotation axis must be non-zero.");
  const s = Math.sin(angle / 2) / n;
  return { w: Math.cos(angle / 2), x: axis[0] * s, y: axis[1] * s, z: axis[2] * s };
}

/** Rotation matrix R(q) with v_B = R v_A for a quaternion from A to B. */
export function rotationMatrix(quaternion: Quaternion): Mat3 {
  const { w, x, y, z } = normalizeQuaternion(quaternion);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
