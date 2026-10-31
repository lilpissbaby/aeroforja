/**
 * Dense LU factorisation with partial pivoting, for the small systems of
 * the vortex-lattice method (a few hundred unknowns). Row-major storage.
 *
 * Reference: Golub, G. H., Van Loan, C. F. (2013). Matrix Computations,
 * 4th ed., Johns Hopkins University Press, algorithm 3.4.1 (Gaussian
 * elimination with partial pivoting).
 */

export interface LuFactors {
  readonly n: number;
  /** L (unit lower, below the diagonal) and U (on and above) packed in one row-major array. */
  readonly lu: Float64Array;
  /** Row permutation: row i of PA is row piv[i] of A. */
  readonly piv: Int32Array;
}

/** Factorises the n×n row-major matrix `a` (not modified). Throws on a singular matrix. */
export function luFactor(a: ArrayLike<number>, n: number): LuFactors {
  if (a.length !== n * n) throw new RangeError(`Expected ${n * n} entries, got ${a.length}.`);
  const lu = Float64Array.from(a);
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  let scale = 0;
  for (let i = 0; i < lu.length; i++) scale = Math.max(scale, Math.abs(lu[i]!));
  const tiny = scale * n * 1e-15;
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(lu[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k]!);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (!(max > tiny)) throw new RangeError("Singular matrix: the lattice has coincident or degenerate panels.");
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = lu[k * n + j]!;
        lu[k * n + j] = lu[p * n + j]!;
        lu[p * n + j] = t;
      }
      const t = piv[k]!;
      piv[k] = piv[p]!;
      piv[p] = t;
    }
    const pivot = lu[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = (lu[i * n + k]! /= pivot);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) lu[i * n + j]! -= f * lu[k * n + j]!;
    }
  }
  return { n, lu, piv };
}

/** Solves A x = b with the factors of A. */
export function luSolve(f: LuFactors, b: ArrayLike<number>): Float64Array {
  const { n, lu, piv } = f;
  if (b.length !== n) throw new RangeError(`Expected ${n} right-hand side entries, got ${b.length}.`);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[piv[i]!]!;
  for (let i = 0; i < n; i++) {
    let s = x[i]!;
    for (let j = 0; j < i; j++) s -= lu[i * n + j]! * x[j]!;
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]!;
    for (let j = i + 1; j < n; j++) s -= lu[i * n + j]! * x[j]!;
    x[i] = s / lu[i * n + i]!;
  }
  return x;
}
