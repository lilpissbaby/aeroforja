/**
 * Messages between the UI thread and the physics worker. Everything crossing
 * this boundary is plain data (structured clone), in SI units.
 */
import type {
  GustInput,
  GustResponse,
  AtmosphereState,
  BluffComponent,
  FrictionComponent,
  LiftingSurfaceInput,
  MassModel,
  MassProperties,
  Result,
  Triple,
  TunnelSweep,
} from "@aeroforja/physics";
import type { TunnelPart } from "../tunnel/input.ts";

export interface AirInput {
  /** Geometric altitude above mean sea level, m. */
  readonly altitude_m: number;
  /** Offset from the ISA temperature at that altitude, K. */
  readonly deltaT_K: number;
  /** Relative humidity as a fraction 0..1, or null for dry air. */
  readonly relativeHumidity: number | null;
}

export interface ComputeRequest {
  readonly kind: "compute";
  readonly seq: number;
  readonly model: MassModel;
  readonly air: AirInput;
}

/** One wind-tunnel sweep (mini-design 004). */
export interface TunnelRequest {
  readonly kind: "tunnel";
  readonly seq: number;
  readonly surfaces: readonly LiftingSurfaceInput[];
  readonly friction: readonly FrictionComponent[];
  readonly bluff: readonly BluffComponent[];
  readonly parts: readonly TunnelPart[];
  readonly cg: Triple;
  readonly speed: number;
  readonly alphas: readonly number[];
  readonly interference: number;
  readonly spanwiseStrips: number;
  readonly chordwisePanels: number;
  readonly air: AirInput;
}

/** Gust test (mini-design 007): one gust, and optionally a sweep of gradient distances (m). */
export interface GustRequest {
  readonly kind: "gust";
  readonly seq: number;
  /** Air as in the top bar; the worker computes ρ, ν and a. */
  readonly air: AirInput;
  readonly input: Omit<GustInput, "air">;
  readonly sweep: readonly number[] | null;
}

export type WorkerRequest = ComputeRequest | TunnelRequest | GustRequest;

export type Outcome<T> =
  | { readonly ok: true; readonly result: Result<T> }
  | { readonly ok: false; readonly message: string };

export interface ComputeResponse {
  readonly kind: "compute";
  readonly seq: number;
  readonly mass: Outcome<MassProperties>;
  readonly air: Outcome<AtmosphereState>;
}

export interface TunnelResponse {
  readonly kind: "tunnel";
  readonly seq: number;
  readonly sweep: Outcome<TunnelSweep>;
  /** Frontal area of each STL part, m², as projected by the worker. */
  readonly partAreas: readonly { readonly id: string; readonly area: number }[];
  /** Time the sweep took, ms. */
  readonly elapsed: number;
}

export interface GustSweepPoint {
  readonly gradient: number;
  readonly maxLoadFactor: number;
  readonly maxRootMoment: number;
}

export interface GustResponseMessage {
  readonly kind: "gust";
  readonly seq: number;
  readonly response: Outcome<GustResponse>;
  readonly sweep: { readonly ok: true; readonly points: readonly GustSweepPoint[] } | { readonly ok: false; readonly message: string } | null;
  /** ms */
  readonly elapsed: number;
}

export type WorkerResponse = ComputeResponse | TunnelResponse | GustResponseMessage;
