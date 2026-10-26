/**
 * Shared shape of a published reference dataset used for validation.
 */

export interface DatasetSource {
  /** The publication the numbers come from. */
  readonly publication: string;
  /**
   * How the numbers reached this repository. If they were not typed in from
   * the publication itself, say who transcribed them and where, so anyone can
   * audit the chain.
   */
  readonly transcription: string;
  /** Independent checks performed on the transcription, if any. */
  readonly crossChecks: readonly string[];
  /** Date the data was retrieved (ISO 8601). */
  readonly retrieved: string;
  readonly license: string;
}

/** Relative tolerance with the reason it was chosen. */
export interface Tolerance {
  readonly relative: number;
  readonly rationale: string;
}
