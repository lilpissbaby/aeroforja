/**
 * State of the CFD tunnel (mini-design 006): settings, the run in progress
 * and what it has sent back. Separate from the project store: nothing here
 * is saved with the project, it is recomputed on demand.
 */
import { create } from "zustand";
import { DEFAULT_CFD, type CaseOutcome, type CfdSettings } from "@aeroforja/cfd-webgpu";
import type { Result, TunnelSweep } from "@aeroforja/physics";
import type { Outcome } from "../worker/protocol.ts";
import type { CfdPlanSummary, CfdSlice, HistorySample, SliceSpec, CfdDone } from "./protocol.ts";

export type SurfaceMode = "mean" | "instant" | "none";

export interface CfdView {
  readonly surface: SurfaceMode;
  readonly smoke: boolean;
  readonly streamlines: boolean;
  /** null: no slice. */
  readonly slice: SliceSpec | null;
  readonly grid: boolean;
  /** Fix the Cp scale (min, max) or let it follow the data. */
  readonly cpRange: readonly [number, number];
}

export interface CfdUiSettings extends CfdSettings {
  readonly massBlocks: boolean;
}

export interface CfdState {
  readonly settings: CfdUiSettings;
  readonly view: CfdView;
  readonly runId: number;
  readonly status: "idle" | "planning" | "running" | "done" | "stopped" | "error";
  readonly error: string | null;
  readonly notes: readonly string[];
  readonly plan: Result<CfdPlanSummary> | null;
  readonly vlm: Outcome<TunnelSweep> | null;
  readonly adapter: string | null;
  readonly surface: { readonly positions: Float32Array; readonly normals: Float32Array } | null;
  readonly cp: { readonly instant: Float32Array | null; readonly mean: Float32Array | null };
  readonly perSeed: number;
  readonly particles: Float32Array | null;
  readonly progress: { readonly step: number; readonly total: number; readonly averaging: boolean; readonly mlups: number };
  readonly history: readonly HistorySample[];
  readonly slice: CfdSlice | null;
  readonly result: CfdDone | null;
  readonly validation: Readonly<Record<string, { readonly progress: number; readonly outcome: CaseOutcome | null; readonly error: string | null }>>;

  setSettings(patch: Partial<CfdUiSettings>): void;
  setView(patch: Partial<CfdView>): void;
  patch(patch: Partial<Omit<CfdState, "setSettings" | "setView" | "patch">>): void;
}

export const DEFAULT_CFD_UI: CfdUiSettings = { ...DEFAULT_CFD, massBlocks: false };

export const useCfdStore = create<CfdState>((set) => ({
  settings: DEFAULT_CFD_UI,
  view: { surface: "mean", smoke: true, streamlines: true, slice: null, grid: false, cpRange: [-1.5, 1] },
  runId: 0,
  status: "idle",
  error: null,
  notes: [],
  plan: null,
  vlm: null,
  adapter: null,
  surface: null,
  cp: { instant: null, mean: null },
  perSeed: 1,
  particles: null,
  progress: { step: 0, total: 0, averaging: false, mlups: 0 },
  history: [],
  slice: null,
  result: null,
  validation: {},
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  patch: (patch) => set(patch),
}));
