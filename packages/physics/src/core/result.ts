/**
 * The envelope every physics result travels in.
 *
 * Project rule: no number without its method, assumptions, range of validity
 * and provenance. A module never returns a bare value; it returns a
 * `Result<T>` built from the types below.
 */

/**
 * Where a value comes from.
 * - MEASURED: entered from a real test (scale, thrust bench, flight log).
 * - CALCULATED: produced by a published method from measured or defined inputs.
 * - ESTIMATED: a catalogue value, a rule of thumb or an extrapolation; must
 *   carry its uncertainty.
 */
export type Provenance = "MEASURED" | "CALCULATED" | "ESTIMATED";

/** A bibliographic reference for a method or a dataset. */
export interface Reference {
  readonly citation: string;
  readonly url?: string;
}

/** A published method, named and referenced so the UI can show it in one click. */
export interface Method {
  /** Stable identifier, e.g. "isa-troposphere". */
  readonly id: string;
  readonly name: string;
  readonly references: readonly Reference[];
}

/**
 * A modelling assumption. `id` is stable so the UI can translate it;
 * `description` is the English text used in code, logs and exports.
 */
export interface Assumption {
  readonly id: string;
  readonly description: string;
}

/**
 * Traffic-light validity, as defined in the specification:
 * - green: inside the range covered by this project's validation cases;
 * - amber: inside the method's range, but not validated in this regime;
 * - red: outside the method's range. The value is still returned so the UI
 *   can show it, but it must be displayed as invalid and never used silently.
 */
export type ValidityLevel = "green" | "amber" | "red";

/** Closed interval [min, max]. Use -Infinity / Infinity for an open side. */
export interface Interval {
  readonly min: number;
  readonly max: number;
}

/** The outcome of checking one input or output against its ranges. */
export interface ValidityCheck {
  /** Name of the checked quantity, e.g. "geopotentialAltitude". */
  readonly quantity: string;
  readonly value: number;
  /** SI unit symbol of `value` and of both intervals. */
  readonly unit: string;
  /** Range covered by validation cases (green inside). */
  readonly validated: Interval;
  /** Range where the method applies (amber between validated and this). */
  readonly applicable: Interval;
  readonly level: ValidityLevel;
  /** Why the limits are where they are, in English. */
  readonly note: string;
}

export interface Validity {
  /** Worst level among the checks. */
  readonly level: ValidityLevel;
  readonly checks: readonly ValidityCheck[];
}

export interface Result<T> {
  readonly value: T;
  readonly provenance: Provenance;
  readonly methods: readonly Method[];
  readonly assumptions: readonly Assumption[];
  readonly validity: Validity;
}
