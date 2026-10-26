import type { Interval, Validity, ValidityCheck, ValidityLevel } from "./result.ts";

const SEVERITY: Readonly<Record<ValidityLevel, number>> = { green: 0, amber: 1, red: 2 };

/**
 * Relative slack applied at each bound so that floating-point noise does not
 * flip a level: 288.15 - 0.0065 * 11000 evaluates to 216.64999999999998, not
 * 216.65. 1e-12 is far below any physically meaningful precision of a limit.
 */
const BOUND_SLACK = 1e-12;

const slack = (bound: number): number =>
  Number.isFinite(bound) ? BOUND_SLACK * Math.max(1, Math.abs(bound)) : 0;

const contains = (interval: Interval, value: number): boolean =>
  value >= interval.min - slack(interval.min) && value <= interval.max + slack(interval.max);

export interface RangeCheckSpec {
  readonly quantity: string;
  readonly value: number;
  readonly unit: string;
  readonly validated: Interval;
  readonly applicable: Interval;
  readonly note: string;
}

/**
 * Classifies a value against its validated and applicable ranges.
 * The validated range must lie inside the applicable one: a method cannot be
 * validated where it does not apply.
 */
export function checkRange(spec: RangeCheckSpec): ValidityCheck {
  const { validated, applicable, value } = spec;
  if (!(validated.min <= validated.max) || !(applicable.min <= applicable.max)) {
    throw new RangeError(`Invalid interval for ${spec.quantity}`);
  }
  if (validated.min < applicable.min || validated.max > applicable.max) {
    throw new RangeError(
      `Validated range of ${spec.quantity} must lie inside its applicable range`,
    );
  }
  if (Number.isNaN(value)) {
    throw new RangeError(`Cannot check NaN for ${spec.quantity}`);
  }
  const level: ValidityLevel = contains(validated, value)
    ? "green"
    : contains(applicable, value)
      ? "amber"
      : "red";
  return { ...spec, level };
}

/** The worst level wins: one red check makes the whole result red. */
export function combineValidity(checks: readonly ValidityCheck[]): Validity {
  let level: ValidityLevel = "green";
  for (const check of checks) {
    if (SEVERITY[check.level] > SEVERITY[level]) level = check.level;
  }
  return { level, checks };
}
