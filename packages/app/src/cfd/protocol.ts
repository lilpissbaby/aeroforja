/**
 * Messages between the UI and the CFD worker (mini-design 006). SI units and
 * body axes FRD unless a field says otherwise; big arrays travel as
 * transferable typed arrays.
 */
import type { Result, Triple, TunnelSweep } from "@aeroforja/physics";
import type { CaseOutcome, CfdBody, CfdLoads, CfdPlan, CfdSettings, SliceQuantity } from "@aeroforja/cfd-webgpu";
import type { AirInput, Outcome, TunnelRequest } from "../worker/protocol.ts";

/** Smoke rake: columns across the span, rows in height, tracers per seed. */
export const SMOKE = { columns: 16, rows: 5, perSeed: 120 } as const;

export interface CfdStart {
  readonly kind: "start";
  readonly runId: number;
  readonly bodies: readonly CfdBody[];
  readonly settings: CfdSettings;
  readonly air: AirInput;
  readonly cg: Triple;
  /** VLM of the same design at the same α, for comparison (null without wings). */
  readonly vlm: Omit<TunnelRequest, "kind" | "seq"> | null;
}

export interface CfdStop {
  readonly kind: "stop";
}

export interface SliceSpec {
  /** 0 = x, 1 = y, 2 = z (body axes). */
  readonly axis: 0 | 1 | 2;
  /** Position of the plane along its axis, m (FRD). */
  readonly position: number;
  readonly quantity: SliceQuantity;
  readonly source: "instant" | "mean";
}

export interface CfdSliceRequest {
  readonly kind: "slice";
  readonly slice: SliceSpec | null;
}

export interface CfdValidate {
  readonly kind: "validate";
  readonly caseId: string;
  /** Cells across the body. */
  readonly d: number;
}

export type CfdRequest = CfdStart | CfdStop | CfdSliceRequest | CfdValidate;

/** The plan without its per-cell arrays. */
export type CfdPlanSummary = Omit<CfdPlan, "flags">;

export interface HistorySample {
  /** Simulated time, s. */
  readonly t: number;
  readonly step: number;
  readonly loads: CfdLoads;
}

export interface CfdPlanned {
  readonly kind: "planned";
  readonly runId: number;
  readonly plan: Result<CfdPlanSummary>;
  /** Surface of the drone, subdivided for colouring: positions and flat normals (FRD m, 3 per vertex). */
  readonly surface: { readonly positions: Float32Array; readonly normals: Float32Array };
  /** Smoke seeds, FRD m (3 per seed); `perSeed` tracers each. */
  readonly seeds: Float32Array;
  readonly perSeed: number;
  readonly vlm: Outcome<TunnelSweep> | null;
  readonly adapter: string;
}

export interface CfdProgress {
  readonly kind: "progress";
  readonly runId: number;
  readonly step: number;
  readonly total: number;
  readonly averaging: boolean;
  /** Million lattice updates per second of this GPU. */
  readonly mlups: number;
  readonly history: readonly HistorySample[];
  /** Smoke: x, y, z (FRD m) and age (steps; < 0 not emitted yet) per tracer. */
  readonly particles: Float32Array | null;
}

export interface CfdSurface {
  readonly kind: "surface";
  readonly runId: number;
  readonly source: "instant" | "mean";
  /** Cp per surface vertex (NaN where no fluid cell is near). */
  readonly cp: Float32Array;
}

export interface CfdSlice {
  readonly kind: "slice";
  readonly runId: number;
  readonly spec: SliceSpec;
  /** Index of the plane on the lattice and its actual position, m. */
  readonly index: number;
  readonly position: number;
  readonly width: number;
  readonly height: number;
  /** Corner of the plane (cell 0, 0) and the two in-plane axes, FRD m; cell size. */
  readonly origin: Triple;
  readonly axes: readonly [0 | 1 | 2, 0 | 1 | 2];
  readonly dx: number;
  readonly values: Float32Array;
}

export interface CfdDone {
  readonly kind: "done";
  readonly runId: number;
  readonly stopped: boolean;
  /** Mean over the averaging window (null if stopped before it). */
  readonly mean: CfdLoads | null;
  /** Standard deviation of drag and lift in the window, N. */
  readonly spread: { readonly drag: number; readonly lift: number } | null;
  readonly samples: number;
  /** Streamlines of the mean flow: x, y, z (FRD m) and |u|/V∞ per point. */
  readonly streamlines: readonly Float32Array[];
  readonly seconds: number;
}

export interface CfdError {
  readonly kind: "error";
  readonly runId: number | null;
  readonly message: string;
}

export interface CfdValidation {
  readonly kind: "validation";
  readonly caseId: string;
  readonly progress: number;
  readonly outcome: CaseOutcome | null;
  readonly error: string | null;
}

export type CfdResponse = CfdPlanned | CfdProgress | CfdSurface | CfdSlice | CfdDone | CfdError | CfdValidation;
