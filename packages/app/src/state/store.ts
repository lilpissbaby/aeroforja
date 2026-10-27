/**
 * Single project state, as in the specification's architecture: the UI edits
 * it, the physics worker computes from it. Everything stored here is SI.
 */
import { create } from "zustand";
import type { MassComponent, MassModel } from "@aeroforja/physics";
import exampleJson from "../../../../examples/mass-model.example.json";
import { parseMassModelJson } from "../model/massModelFile.ts";
import { newComponent, uniqueId, type ShapeKind } from "../model/newComponent.ts";
import type { AirInput, ComputeResponse } from "../worker/protocol.ts";

export type ThemeChoice = "system" | "light" | "dark";

export interface AppState {
  readonly projectName: string;
  readonly model: MassModel;
  readonly selectedId: string | null;
  readonly air: AirInput;
  readonly theme: ThemeChoice;
  readonly results: ComputeResponse | null;
  readonly fileError: string | null;

  select(id: string | null): void;
  updateComponent(id: string, update: (c: MassComponent) => MassComponent): void;
  addComponent(kind: ShapeKind): void;
  duplicateComponent(id: string): void;
  removeComponent(id: string): void;
  setReferencePoint(text: string): void;
  setProjectName(name: string): void;
  setAir(patch: Partial<AirInput>): void;
  setTheme(theme: ThemeChoice): void;
  loadModel(name: string, model: MassModel): void;
  setResults(results: ComputeResponse): void;
  setFileError(message: string | null): void;
}

const STORAGE_KEY = "aeroforja.workbench.v1";
const EXAMPLE_NAME = "Cuerpo de ejemplo (sintético)";

interface Saved {
  readonly projectName: string;
  readonly model: MassModel;
  readonly theme: ThemeChoice;
}

function exampleModel(): MassModel {
  const parsed = parseMassModelJson(exampleJson, EXAMPLE_NAME);
  if (!parsed.ok) throw new Error(`The bundled example is invalid: ${parsed.message}`);
  return parsed.model;
}

/** Browser storage is a convenience: it may be unavailable or empty. */
function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    const parsed = parseMassModelJson(data.model, data.projectName ?? EXAMPLE_NAME);
    if (!parsed.ok) return null;
    const theme = data.theme === "light" || data.theme === "dark" ? data.theme : "system";
    return { projectName: parsed.name, model: parsed.model, theme };
  } catch {
    return null;
  }
}

export function saveState(state: Pick<AppState, "projectName" | "model" | "theme">): void {
  try {
    const data: Saved = { projectName: state.projectName, model: state.model, theme: state.theme };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private windows or blocked storage: the session keeps working without saving.
  }
}

const saved = loadSaved();

const replaceComponents = (model: MassModel, components: readonly MassComponent[]): MassModel => ({
  ...model,
  components,
});

export const useAppStore = create<AppState>()((set) => ({
  projectName: saved?.projectName ?? EXAMPLE_NAME,
  model: saved?.model ?? exampleModel(),
  selectedId: null,
  air: { altitude_m: 0, deltaT_K: 0, relativeHumidity: null },
  theme: saved?.theme ?? "system",
  results: null,
  fileError: null,

  select: (id) => set({ selectedId: id }),

  updateComponent: (id, update) =>
    set((s) => ({
      model: replaceComponents(
        s.model,
        s.model.components.map((c) => (c.id === id ? update(c) : c)),
      ),
    })),

  addComponent: (kind) =>
    set((s) => {
      const component = newComponent(s.model, kind);
      return {
        model: replaceComponents(s.model, [...s.model.components, component]),
        selectedId: component.id,
      };
    }),

  duplicateComponent: (id) =>
    set((s) => {
      const original = s.model.components.find((c) => c.id === id);
      if (original === undefined) return {};
      const copy: MassComponent = {
        ...original,
        id: uniqueId(s.model, original.id.replace(/-\d+$/, "")),
        name: `${original.name} (copia)`,
      };
      return {
        model: replaceComponents(s.model, [...s.model.components, copy]),
        selectedId: copy.id,
      };
    }),

  removeComponent: (id) =>
    set((s) => {
      if (s.model.components.length <= 1) return {};
      return {
        model: replaceComponents(
          s.model,
          s.model.components.filter((c) => c.id !== id),
        ),
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    }),

  setReferencePoint: (text) => set((s) => ({ model: { ...s.model, referencePoint: text } })),
  setProjectName: (name) => set({ projectName: name }),
  setAir: (patch) => set((s) => ({ air: { ...s.air, ...patch } })),
  setTheme: (theme) => set({ theme }),
  loadModel: (name, model) => set({ projectName: name, model, selectedId: null, fileError: null }),
  setResults: (results) => set({ results }),
  setFileError: (message) => set({ fileError: message }),
}));
