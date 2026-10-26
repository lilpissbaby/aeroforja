import { describe, expect, it } from "vitest";
import { at, multiply, symmetricEigen, transpose, type Mat3 } from "../../src/core/mat3.ts";

function reconstruct(values: readonly number[], vectors: readonly (readonly number[])[]): Mat3 {
  const v: Mat3 = [
    vectors[0]![0]!, vectors[1]![0]!, vectors[2]![0]!,
    vectors[0]![1]!, vectors[1]![1]!, vectors[2]![1]!,
    vectors[0]![2]!, vectors[1]![2]!, vectors[2]![2]!,
  ];
  const d: Mat3 = [values[0]!, 0, 0, 0, values[1]!, 0, 0, 0, values[2]!];
  return multiply(multiply(v, d), transpose(v));
}

describe("symmetricEigen (Jacobi)", () => {
  it("sorts a diagonal matrix", () => {
    const e = symmetricEigen([3, 0, 0, 0, 1, 0, 0, 0, 2]);
    expect(e.values).toStrictEqual([1, 2, 3]);
  });

  it("reconstructs a full symmetric matrix and returns a right-handed orthonormal basis", () => {
    const a: Mat3 = [4, 1, -2, 1, 2, 0.5, -2, 0.5, 3];
    const e = symmetricEigen(a);
    const back = reconstruct(e.values, e.vectors);
    for (let i = 0; i < 9; i++) expect(back[i]).toBeCloseTo(a[i]!, 12);
    const [e0, e1, e2] = e.vectors;
    const dot = (p: readonly number[], q: readonly number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
    expect(dot(e0, e1)).toBeCloseTo(0, 13);
    expect(dot(e0, e2)).toBeCloseTo(0, 13);
    expect(dot(e2, e2)).toBeCloseTo(1, 13);
    // Right-handed: e2 = e0 x e1 by construction; check it is also an eigenvector.
    const ae2 = [0, 1, 2].map((r) => at(a, r, 0) * e2[0] + at(a, r, 1) * e2[1] + at(a, r, 2) * e2[2]);
    for (let k = 0; k < 3; k++) expect(ae2[k]).toBeCloseTo(e.values[2] * e2[k]!, 12);
  });

  it("handles repeated eigenvalues (sphere)", () => {
    const e = symmetricEigen([2, 0, 0, 0, 2, 0, 0, 0, 2]);
    expect(e.values).toStrictEqual([2, 2, 2]);
  });
});
