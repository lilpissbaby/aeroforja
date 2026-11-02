/**
 * State of the gust test (mini-design 007): the gust, the aerodynamic model,
 * the wing material (never invented: empty until given, with its
 * provenance) and the latest answer of the physics worker.
 */
import { create } from "zustand";
import type { GustResponse, Provenance, Result } from "@aeroforja/physics";
import type { GustSweepPoint } from "../worker/protocol.ts";

export interface MaterialValue {
  /** SI: Pa or kg/m². */
  readonly value: number;
  readonly provenance: Extract<Provenance, "MEASURED" | "ESTIMATED">;
}

export interface GustSettings {
  /** m/s */
  readonly speed: number;
  /** U_ds, m/s */
  readonly amplitude: number;
  readonly up: boolean;
  /** H in mean chords, or null for 12.5 c̄. */
  readonly gradientChords: number | null;
  readonly model: "unsteady" | "quasi-steady";
  readonly young: MaterialValue | null;
  readonly strength: MaterialValue | null;
  readonly arealMass: MaterialValue | null;
  /** Deflection drawn × this in 3D. */
  readonly exaggeration: number;
}

export const DEFAULT_GUST: GustSettings = {
  speed: 15,
  amplitude: 2,
  up: true,
  gradientChords: null,
  model: "unsteady",
  young: null,
  strength: null,
  arealMass: null,
  exaggeration: 1,
};

/** Gradient distances of the sweep, in mean chords. */
export const SWEEP_CHORDS = [2, 4, 6, 9, 12.5, 18, 25, 35, 50] as const;

export interface GustState {
  readonly settings: GustSettings;
  readonly request: number;
  readonly withSweep: boolean;
  readonly running: boolean;
  readonly error: string | null;
  readonly result: Result<GustResponse> | null;
  readonly sweep: readonly GustSweepPoint[] | null;
  readonly elapsed: number;
  /** Notes from the input builder (Spanish). */
  readonly notes: readonly string[];
  setSettings(patch: Partial<GustSettings>): void;
  run(withSweep: boolean): void;
  patch(patch: Partial<Omit<GustState, "setSettings" | "run" | "patch">>): void;
}

export const useGustStore = create<GustState>((set) => ({
  settings: DEFAULT_GUST,
  request: 0,
  withSweep: false,
  running: false,
  error: null,
  result: null,
  sweep: null,
  elapsed: 0,
  notes: [],
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  run: (withSweep) => set((s) => ({ request: s.request + 1, withSweep, running: true, error: null })),
  patch: (patch) => set(patch),
}));
