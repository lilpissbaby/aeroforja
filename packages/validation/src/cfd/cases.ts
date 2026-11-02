/**
 * Validation cases of the CFD tunnel (mini-design 006). The reference values
 * and tolerances live next to the GPU runner in @aeroforja/cfd-webgpu
 * (validation.ts), so the app's «Validar en tu GPU» and these tests use the
 * same numbers.
 */
export { SCHAFER_TUREK_2D1, SPHERE_RE100, SPHERE_RE1E5, CYLINDER_RE1E5, bandError } from "@aeroforja/cfd-webgpu";

/** Taylor–Green decay rate against 4νk², and the uniform-stream check (cases 1 and 5). */
export const TAYLOR_GREEN_TOLERANCE = 0.01;
export const UNIFORM_STREAM_TOLERANCE = 1e-13;
