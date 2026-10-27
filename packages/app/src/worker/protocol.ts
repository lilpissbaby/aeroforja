/**
 * Messages between the UI thread and the physics worker. Everything crossing
 * this boundary is plain data (structured clone), in SI units.
 */
import type { AtmosphereState, MassModel, MassProperties, Result } from "@aeroforja/physics";

export interface AirInput {
  /** Geometric altitude above mean sea level, m. */
  readonly altitude_m: number;
  /** Offset from the ISA temperature at that altitude, K. */
  readonly deltaT_K: number;
  /** Relative humidity as a fraction 0..1, or null for dry air. */
  readonly relativeHumidity: number | null;
}

export interface ComputeRequest {
  readonly seq: number;
  readonly model: MassModel;
  readonly air: AirInput;
}

export type Outcome<T> =
  | { readonly ok: true; readonly result: Result<T> }
  | { readonly ok: false; readonly message: string };

export interface ComputeResponse {
  readonly seq: number;
  readonly mass: Outcome<MassProperties>;
  readonly air: Outcome<AtmosphereState>;
}
