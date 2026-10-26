/**
 * Validation cases for the mass model.
 *
 * The homogeneous-solid formulas (Meriam, Kraige & Bolton, Engineering
 * Mechanics: Dynamics, Appendix D) are checked against an independent route:
 * the same solid assembled from many point masses by the composition code
 * (parallel-axis theorem). For cell-centred grids the discretisation error has
 * an exact closed form (midpoint rule on polynomials), so the comparison is
 * exact to rounding rather than "close enough". Composite cases (dumbbell,
 * rotated rod, perpendicular-axis theorem, translation and rotation
 * invariance) follow Goldstein, Poole & Safko, Classical Mechanics, ch. 5.
 */
import type { Tolerance } from "../types.ts";

export const MASS_MODEL_REFERENCES = [
  "Meriam, J. L., Kraige, L. G., Bolton, J. N. Engineering Mechanics: Dynamics, Wiley, Appendix D (properties of homogeneous solids).",
  "Goldstein, H., Poole, C., Safko, J. (2002). Classical Mechanics, 3rd ed., Addison-Wesley, ch. 5.",
] as const;

/** Exact identities: only floating-point rounding separates the two sides. */
export const EXACT_TOLERANCE: Tolerance = {
  relative: 1e-12,
  rationale:
    "Closed forms and exact discrete identities; double-precision rounding over thousands of terms stays far below 1e-12 relative.",
};

/** Convergence check where no exact discrete identity is used (sphere from discs). */
export const CONVERGENCE_TOLERANCE: Tolerance = {
  relative: 1e-4,
  rationale:
    "Midpoint-rule error of order 1/N^2; with N = 400 slices it is about 1e-5, so 1e-4 leaves margin while catching any coefficient error.",
};
