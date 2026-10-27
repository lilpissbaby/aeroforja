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

/** Hamilton product a * b (apply b first, then a). */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Roll, pitch and yaw of the aerospace z-y-x sequence, in radians. */
export interface EulerZYX {
  /** Rotation about x (phi): positive = right side down. */
  readonly roll: Radians;
  /** Rotation about y (theta): positive = nose up. */
  readonly pitch: Radians;
  /** Rotation about z (psi): positive = nose right. */
  readonly yaw: Radians;
}

/**
 * Quaternion of the aerospace z-y-x sequence: yaw about z, then pitch about
 * the new y, then roll about the new x (Stevens, Lewis & Johnson, Aircraft
 * Control and Simulation, sec. 1.3). Equivalent to the active rotation
 * R = Rz(yaw) Ry(pitch) Rx(roll), mapping the rotated frame into the
 * reference frame.
 */
export function quaternionFromEulerZYX(euler: EulerZYX): Quaternion {
  const cr = Math.cos(euler.roll / 2);
  const sr = Math.sin(euler.roll / 2);
  const cp = Math.cos(euler.pitch / 2);
  const sp = Math.sin(euler.pitch / 2);
  const cy = Math.cos(euler.yaw / 2);
  const sy = Math.sin(euler.yaw / 2);
  return {
    w: cy * cp * cr + sy * sp * sr,
    x: cy * cp * sr - sy * sp * cr,
    y: cy * sp * cr + sy * cp * sr,
    z: sy * cp * cr - cy * sp * sr,
  };
}

/**
 * Inverse of `quaternionFromEulerZYX`. Pitch is returned in [-pi/2, pi/2];
 * at exactly +-90 deg pitch (gimbal lock) roll is set to 0 and the whole
 * rotation about the vertical goes into yaw.
 */
export function eulerZYXFromQuaternion(quaternion: Quaternion): EulerZYX {
  const { w, x, y, z } = normalizeQuaternion(quaternion);
  const sinPitch = Math.max(-1, Math.min(1, 2 * (w * y - x * z)));
  const pitch = Math.asin(sinPitch);
  if (Math.abs(sinPitch) > 1 - 1e-12) {
    return {
      roll: 0 as Radians,
      pitch: pitch as Radians,
      yaw: (-2 * Math.sign(sinPitch) * Math.atan2(x, w)) as Radians,
    };
  }
  return {
    roll: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) as Radians,
    pitch: pitch as Radians,
    yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) as Radians,
  };
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
