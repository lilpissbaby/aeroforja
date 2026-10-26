/**
 * @aeroforja/physics — pure physics core.
 *
 * SI units throughout, body axes FRD and world axes NED (introduced with the
 * mass model), every result wrapped in `Result<T>` with method, assumptions,
 * validity and provenance. No UI, browser or Node APIs: this package must run
 * unchanged in a Web Worker, in Node (tests, SITL) and anywhere else.
 */
export * from "./core/units.ts";
export type * from "./core/result.ts";
export { checkRange, combineValidity, type RangeCheckSpec } from "./core/validity.ts";
export * from "./atmosphere/index.ts";
