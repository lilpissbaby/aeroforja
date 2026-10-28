/**
 * Single project state, as in the specification's architecture: the UI edits
 * it, the physics worker computes from it. Everything stored here is SI.
 */
import { create } from "zustand";
import type { MassComponent, MassModel } from "@aeroforja/physics";
import exampleJson from "../../../../examples/mass-model.example.json";
import { parseMassModelJson } from "../model/massModelFile.ts";
import { newComponent, uniqueId, type ShapeKind } from "../model/newComponent.ts";
import { parsePlanformJson } from "../planform/file.ts";
import { uniqueElementId, translateElement, type Planform, type PlanformElement } from "../planform/model.ts";
import { DEFAULT_FRAME, frameElements } from "../planform/templates.ts";
import type { AirInput, ComputeResponse } from "../worker/protocol.ts";

export type ThemeChoice = "system" | "light" | "dark";
/** Which side panels are showing: the planform drawing or the mass model. */
export type Panel = "planform" | "mass";
/** Centre of the workbench: the 2D planform, the 3D viewer or both side by side. */
export type ViewMode = "plan" | "3d" | "split";

/** Undo steps kept for the planform. */
const HISTORY_LIMIT = 200;

export interface AppState {
  readonly projectName: string;
  readonly model: MassModel;
  readonly selectedId: string | null;
  readonly air: AirInput;
  readonly theme: ThemeChoice;
  readonly results: ComputeResponse | null;
  readonly fileError: string | null;

  readonly planform: Planform;
  readonly planPast: readonly Planform[];
  readonly planFuture: readonly Planform[];
  readonly planSelectedId: string | null;
  readonly panel: Panel;
  readonly view: ViewMode;
  readonly show3d: { readonly planform: boolean; readonly mass: boolean };
  /** Incremented to ask the 2D and 3D views to frame the whole drawing. */
  readonly fitRequest: number;

  select(id: string | null): void;
  updateComponent(id: string, update: (c: MassComponent) => MassComponent): void;
  addComponent(kind: ShapeKind): void;
  duplicateComponent(id: string): void;
  removeComponent(id: string): void;
  setReferencePoint(text: string): void;
  setProjectName(name: string): void;
  setAir(patch: Partial<AirInput>): void;
  setTheme(theme: ThemeChoice): void;
  loadProject(name: string, model: MassModel, planform: Planform): void;
  setResults(results: ComputeResponse): void;
  setFileError(message: string | null): void;

  /** Replaces the planform as one undo step. */
  setPlanform(next: Planform): void;
  /** Starts a drag: records one undo step for everything until it ends. */
  beginPlanGesture(): void;
  /** Updates the planform during a drag, without new undo steps. */
  setPlanformLive(next: Planform): void;
  updatePlanElement(id: string, update: (e: PlanformElement) => PlanformElement): void;
  addPlanElements(elements: readonly PlanformElement[]): void;
  removePlanElement(id: string): void;
  duplicatePlanElement(id: string): void;
  selectPlanElement(id: string | null): void;
  undoPlan(): void;
  redoPlan(): void;
  setPanel(panel: Panel): void;
  setView(view: ViewMode): void;
  setShow3d(patch: Partial<AppState["show3d"]>): void;
  requestFit(): void;
}

const STORAGE_KEY = "aeroforja.workbench.v1";
const EXAMPLE_NAME = "Cuerpo de ejemplo (sintético)";

interface Saved {
  readonly projectName: string;
  readonly model: MassModel;
  readonly theme: ThemeChoice;
  readonly planform: Planform | null;
}

/** A first-time workbench opens with a 5-inch quad X frame to edit. */
export function starterPlanform(): Planform {
  return { elements: frameElements(DEFAULT_FRAME, { elements: [] }) };
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
    const planform = data.planform === undefined || data.planform === null ? null : parsePlanformJson(data.planform);
    return {
      projectName: parsed.name,
      model: parsed.model,
      theme,
      planform: planform !== null && planform.ok ? planform.planform : null,
    };
  } catch {
    return null;
  }
}

export function saveState(state: Pick<AppState, "projectName" | "model" | "theme" | "planform">): void {
  try {
    const data: Saved = {
      projectName: state.projectName,
      model: state.model,
      theme: state.theme,
      planform: state.planform,
    };
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

/** One undo step: the current planform goes to the past and the future is dropped. */
const withHistory = (s: AppState, next: Planform): Partial<AppState> => ({
  planform: next,
  planPast: [...s.planPast, s.planform].slice(-HISTORY_LIMIT),
  planFuture: [],
});

const replaceElements = (planform: Planform, elements: readonly PlanformElement[]): Planform => ({
  ...planform,
  elements,
});

export const useAppStore = create<AppState>()((set) => ({
  projectName: saved?.projectName ?? EXAMPLE_NAME,
  model: saved?.model ?? exampleModel(),
  selectedId: null,
  air: { altitude_m: 0, deltaT_K: 0, relativeHumidity: null },
  theme: saved?.theme ?? "system",
  results: null,
  fileError: null,

  planform: saved?.planform ?? starterPlanform(),
  planPast: [],
  planFuture: [],
  planSelectedId: null,
  panel: "planform",
  view: "split",
  // The planform is what the workbench opens on; the mass pieces and CG are one click away.
  show3d: { planform: true, mass: false },
  fitRequest: 0,

  select: (id) => set(id === null ? { selectedId: null } : { selectedId: id, planSelectedId: null, panel: "mass" }),

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
  loadProject: (name, model, planform) =>
    set((s) => ({
      ...withHistory(s, planform),
      projectName: name,
      model,
      selectedId: null,
      planSelectedId: null,
      fileError: null,
      fitRequest: s.fitRequest + 1,
    })),
  setResults: (results) => set({ results }),
  setFileError: (message) => set({ fileError: message }),

  setPlanform: (next) => set((s) => withHistory(s, next)),
  beginPlanGesture: () => set((s) => ({ planPast: [...s.planPast, s.planform].slice(-HISTORY_LIMIT), planFuture: [] })),
  setPlanformLive: (next) => set({ planform: next }),

  updatePlanElement: (id, update) =>
    set((s) =>
      withHistory(
        s,
        replaceElements(
          s.planform,
          s.planform.elements.map((e) => (e.id === id ? update(e) : e)),
        ),
      ),
    ),

  addPlanElements: (elements) =>
    set((s) => ({
      ...withHistory(s, replaceElements(s.planform, [...s.planform.elements, ...elements])),
      planSelectedId: elements.length === 1 ? elements[0]!.id : s.planSelectedId,
      selectedId: null,
      panel: "planform",
    })),

  removePlanElement: (id) =>
    set((s) => ({
      ...withHistory(
        s,
        replaceElements(
          s.planform,
          s.planform.elements.filter((e) => e.id !== id),
        ),
      ),
      planSelectedId: s.planSelectedId === id ? null : s.planSelectedId,
    })),

  duplicatePlanElement: (id) =>
    set((s) => {
      const original = s.planform.elements.find((e) => e.id === id);
      if (original === undefined) return {};
      // Offset the copy by 10 mm so it does not hide under the original.
      const copy = {
        ...translateElement(original, -0.01, 0.01),
        id: uniqueElementId(s.planform, original.id.replace(/-\d+$/, "")),
        name: `${original.name} (copia)`,
      };
      return {
        ...withHistory(s, replaceElements(s.planform, [...s.planform.elements, copy])),
        planSelectedId: copy.id,
      };
    }),

  selectPlanElement: (id) =>
    set(id === null ? { planSelectedId: null } : { planSelectedId: id, selectedId: null, panel: "planform" }),

  undoPlan: () =>
    set((s) => {
      const previous = s.planPast[s.planPast.length - 1];
      if (previous === undefined) return {};
      const selectionGone = s.planSelectedId !== null && !previous.elements.some((e) => e.id === s.planSelectedId);
      return {
        planform: previous,
        planPast: s.planPast.slice(0, -1),
        planFuture: [s.planform, ...s.planFuture].slice(0, HISTORY_LIMIT),
        ...(selectionGone ? { planSelectedId: null } : {}),
      };
    }),

  redoPlan: () =>
    set((s) => {
      const [next, ...rest] = s.planFuture;
      if (next === undefined) return {};
      const selectionGone = s.planSelectedId !== null && !next.elements.some((e) => e.id === s.planSelectedId);
      return {
        planform: next,
        planPast: [...s.planPast, s.planform].slice(-HISTORY_LIMIT),
        planFuture: rest,
        ...(selectionGone ? { planSelectedId: null } : {}),
      };
    }),

  setPanel: (panel) => set({ panel }),
  setView: (view) => set({ view }),
  setShow3d: (patch) => set((s) => ({ show3d: { ...s.show3d, ...patch } })),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
