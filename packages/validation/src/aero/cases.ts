/**
 * Validation cases of the virtual wind tunnel (mini-design 004): the
 * vortex-lattice method against a published worked example and against the
 * classical wing theories, and the friction laws against their formulas.
 *
 * Tolerances: see each constant. Where a tolerance differs from the one
 * written in mini-design 004, the reason is given here and in
 * docs/decisiones.md, pending the owner's approval.
 */
import type { Tolerance } from "../types.ts";

export const AERO_REFERENCES = [
  "Bertin, J. J., Cummings, R. M. (2014). Aerodynamics for Engineers, 6th ed., Pearson, example 7.2 (VLM, swept wing AR 5, 45°).",
  "Katz, J., Plotkin, A. (2001). Low-Speed Aerodynamics, 2nd ed., Cambridge University Press, ch. 12.",
  "Helmbold, H. B. (1942). Der unverwundene Ellipsenflügel als tragende Wirbelfläche. Jahrbuch der deutschen Luftfahrtforschung, I 111–113.",
  "Anderson, J. D. (2017). Fundamentals of Aerodynamics, 6th ed., McGraw-Hill, sec. 5.3 (lifting-line theory).",
  "Raymer, D. P. (2018). Aircraft Design: A Conceptual Approach, 6th ed., AIAA, eq. 12.6 (DATCOM lift slope) and eqs. 12.25–12.27.",
] as const;

/**
 * Bertin & Cummings, example 7.2: untapered wing, AR = 5, 45° of sweep at
 * the quarter chord, flat (the VLM only sees the mean surface), four
 * spanwise panels on each half span and one chordwise panel, equal widths.
 * Published result: CL = 0.0601 α with α in degrees.
 */
export const BERTIN_CUMMINGS_7_2 = {
  aspectRatio: 5,
  sweepQuarterChordDeg: 45,
  stripsPerSemispan: 4,
  chordwisePanels: 1,
  clAlphaPerDegree: 0.0601,
  tolerance: {
    relative: 0.005,
    rationale: "Same method and the same lattice as the textbook: only the rounding of the published value (three digits) separates them.",
  } satisfies Tolerance,
} as const;

/**
 * Elliptic flat wing, AR 8, fine lattice. Mini-design 004 asked for CLα
 * within 3 % of lifting-line theory, 2π/(1 + 2/AR). Lifting-line theory
 * neglects the chordwise extent of the wing and overpredicts the lift slope
 * of a lifting surface at moderate aspect ratio; the VLM gives 4 % less.
 * The comparison is made against Helmbold's lifting-surface approximation
 * for elliptic wings instead, and lifting line is kept as an upper bound.
 */
export const ELLIPTIC_WING = {
  aspectRatio: 8,
  helmboldTolerance: {
    relative: 0.02,
    rationale: "Helmbold's equation approximates lifting-surface theory for elliptic wings to about 1–2 %.",
  } satisfies Tolerance,
  /**
   * Mini-design 004: 0.98 ≤ e ≤ 1.00. The Trefftz-plane sum is evaluated on
   * a step circulation refined by interpolation; on an exact elliptic load
   * it is 0.4 % low with 48 cosine strips, which lifts e by the same amount.
   */
  oswald: { min: 0.98, max: 1.005 },
} as const;

/**
 * Rectangular flat wings, AR 2 to 10, against Helmbold's equation
 * 2π·AR / (2 + √(AR² + 4)). Mini-design 004 asked for 5 %. Helmbold's
 * equation is built on the elliptic loading; a rectangular wing has a lower
 * lift slope than an elliptic one of the same aspect ratio (its loading is
 * not elliptic), and the converged VLM sits 3–6 % below Helmbold. Tolerance
 * 7 %, one-sided: the VLM must never come out above Helmbold.
 */
export const RECTANGULAR_WINGS = {
  aspectRatios: [2, 4, 6, 8, 10],
  tolerance: {
    relative: 0.07,
    rationale:
      "Helmbold assumes an elliptic loading; rectangular wings lose lift slope to their non-elliptic loading. Converged VLM: −3 % (AR 2) to −6 % (AR 6).",
  } satisfies Tolerance,
} as const;

/** DATCOM lift slope (Raymer eq. 12.6, η = 1, M = 0) for swept and tapered wings: 6 % as in mini-design 004. */
export const DATCOM_TOLERANCE: Tolerance = {
  relative: 0.06,
  rationale: "DATCOM's semi-empirical fit is quoted to a few percent of test data for unswept and moderately swept wings.",
};

/** Aerodynamic centre of an unswept rectangular wing at 25 % ± 2 % of the chord (AR ≥ 6: at low AR it moves forward). */
export const AERODYNAMIC_CENTRE = { aspectRatios: [6, 8, 10], fraction: 0.25, absolute: 0.02 } as const;

/** Lateral coefficients with β = 0 on a symmetric aircraft. */
export const SYMMETRY_TOLERANCE = 1e-12;

/** Change of CL when the spanwise strips are doubled. */
export const CONVERGENCE_STEP: Tolerance = {
  relative: 0.01,
  rationale: "Mini-design 004: the default lattice is converged when doubling the strips changes CL by less than 1 %.",
};
