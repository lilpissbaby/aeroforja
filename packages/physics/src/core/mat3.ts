/**
 * Small dense 3x3 matrix helpers (row-major), enough for inertia tensors and
 * rotations. No allocation-free tricks yet: clarity first, profile later.
 */
import type { Triple } from "./vector.ts";

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const ZERO: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

export const at = (m: Mat3, row: number, col: number): number => m[row * 3 + col] as number;

export function add(a: Mat3, b: Mat3): Mat3 {
  return a.map((v, i) => v + (b[i] as number)) as unknown as Mat3;
}

export function scale(a: Mat3, s: number): Mat3 {
  return a.map((v) => v * s) as unknown as Mat3;
}

export function transpose(a: Mat3): Mat3 {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(at(a, r, 0) * at(b, 0, c) + at(a, r, 1) * at(b, 1, c) + at(a, r, 2) * at(b, 2, c));
    }
  }
  return out as unknown as Mat3;
}

export function multiplyVector(a: Mat3, v: Triple): Triple {
  return [
    at(a, 0, 0) * v[0] + at(a, 0, 1) * v[1] + at(a, 0, 2) * v[2],
    at(a, 1, 0) * v[0] + at(a, 1, 1) * v[1] + at(a, 1, 2) * v[2],
    at(a, 2, 0) * v[0] + at(a, 2, 1) * v[1] + at(a, 2, 2) * v[2],
  ];
}

/** R * A * R^T: expresses tensor A, given in a rotated frame, in the base frame. */
export function rotateTensor(r: Mat3, a: Mat3): Mat3 {
  return multiply(multiply(r, a), transpose(r));
}

export interface SymmetricEigen {
  /** Eigenvalues in ascending order. */
  readonly values: Triple;
  /** Unit eigenvectors, vectors[i] belongs to values[i]; right-handed set. */
  readonly vectors: readonly [Triple, Triple, Triple];
}

/**
 * Eigen-decomposition of a symmetric 3x3 matrix by cyclic Jacobi rotations
 * (Press et al., Numerical Recipes, 3rd ed., section 11.1). Converges
 * quadratically; stops when the off-diagonal norm is negligible.
 */
export function symmetricEigen(input: Mat3): SymmetricEigen {
  const a = [
    [at(input, 0, 0), at(input, 0, 1), at(input, 0, 2)],
    [at(input, 1, 0), at(input, 1, 1), at(input, 1, 2)],
    [at(input, 2, 0), at(input, 2, 1), at(input, 2, 2)],
  ] as number[][];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as number[][];
  const get = (m: number[][], r: number, c: number): number => (m[r] as number[])[c] as number;
  const set = (m: number[][], r: number, c: number, value: number): void => {
    (m[r] as number[])[c] = value;
  };

  const scaleNorm = Math.max(
    1e-300,
    Math.abs(get(a, 0, 0)) + Math.abs(get(a, 1, 1)) + Math.abs(get(a, 2, 2)) +
      Math.abs(get(a, 0, 1)) + Math.abs(get(a, 0, 2)) + Math.abs(get(a, 1, 2)),
  );

  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(get(a, 0, 1)) + Math.abs(get(a, 0, 2)) + Math.abs(get(a, 1, 2));
    if (off <= 1e-15 * scaleNorm) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = get(a, p, q);
      if (apq === 0) continue;
      const theta = (get(a, q, q) - get(a, p, p)) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = get(a, k, p);
        const akq = get(a, k, q);
        set(a, k, p, c * akp - s * akq);
        set(a, k, q, s * akp + c * akq);
      }
      for (let k = 0; k < 3; k++) {
        const apk = get(a, p, k);
        const aqk = get(a, q, k);
        set(a, p, k, c * apk - s * aqk);
        set(a, q, k, s * apk + c * aqk);
      }
      for (let k = 0; k < 3; k++) {
        const vkp = get(v, k, p);
        const vkq = get(v, k, q);
        set(v, k, p, c * vkp - s * vkq);
        set(v, k, q, s * vkp + c * vkq);
      }
    }
  }

  const order = [0, 1, 2].sort((i, j) => get(a, i, i) - get(a, j, j));
  const column = (j: number): Triple => [get(v, 0, j), get(v, 1, j), get(v, 2, j)];
  const [i0, i1, i2] = order as [number, number, number];
  const e0 = column(i0);
  const e1 = column(i1);
  // Third axis as e0 x e1 so the set is right-handed (Jacobi keeps orthonormality).
  const e2: Triple = [
    e0[1] * e1[2] - e0[2] * e1[1],
    e0[2] * e1[0] - e0[0] * e1[2],
    e0[0] * e1[1] - e0[1] * e1[0],
  ];
  return {
    values: [get(a, i0, i0), get(a, i1, i1), get(a, i2, i2)],
    vectors: [e0, e1, e2],
  };
}
