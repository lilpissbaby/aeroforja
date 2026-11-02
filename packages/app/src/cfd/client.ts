/**
 * Starts the CFD worker and connects it to the CFD store. Runs only on
 * request («Ensayar»): a run takes the GPU for seconds to minutes.
 */
import { effectiveMassModel } from "../parts/massLink.ts";
import { getMesh } from "../parts/meshStore.ts";
import { placedTriangles } from "../parts/transform.ts";
import { useAppStore } from "../state/store.ts";
import { tunnelGeometry } from "../tunnel/input.ts";
import { analysisFor } from "../ui/planform/usePlanformAnalysis.ts";
import { cfdGeometry } from "./input.ts";
import type { CfdRequest, CfdResponse, SliceSpec } from "./protocol.ts";
import { useCfdStore } from "./store.ts";

let worker: Worker | null = null;

function ensureWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL("../worker/cfd.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<CfdResponse>) => {
    const m = event.data;
    const store = useCfdStore.getState();
    if (m.kind === "validation") {
      store.patch({ validation: { ...store.validation, [m.caseId]: { progress: m.progress, outcome: m.outcome, error: m.error } } });
      return;
    }
    if (m.runId !== null && m.runId !== store.runId) return;
    switch (m.kind) {
      case "planned":
        store.patch({ status: "running", plan: m.plan, surface: m.surface, perSeed: m.perSeed, vlm: m.vlm, adapter: m.adapter, progress: { step: 0, total: m.plan.value.totalSteps, averaging: false, mlups: 0 } });
        break;
      case "progress":
        store.patch({
          progress: { step: m.step, total: m.total, averaging: m.averaging, mlups: m.mlups > 0 ? m.mlups : store.progress.mlups },
          history: [...store.history, ...m.history],
          ...(m.particles !== null ? { particles: m.particles } : {}),
        });
        break;
      case "surface":
        store.patch({ cp: { ...store.cp, [m.source]: m.cp } });
        break;
      case "slice":
        store.patch({ slice: m });
        break;
      case "done":
        store.patch({ status: m.stopped ? "stopped" : "done", result: m });
        break;
      case "error":
        store.patch({ status: "error", error: m.message });
        break;
    }
  };
  worker.onerror = (e) => useCfdStore.getState().patch({ status: "error", error: e.message || "Error en el trabajador del CFD." });
  return worker;
}

const send = (m: CfdRequest) => ensureWorker().postMessage(m);

export function runCfd(): void {
  const s = useAppStore.getState();
  const cfd = useCfdStore.getState();
  const mass = s.results?.mass;
  if (mass === undefined || !mass.ok) {
    cfd.patch({ status: "error", error: "Sin centro de gravedad: el modelo de masas no se ha podido calcular." });
    return;
  }
  const cg = mass.result.value.centerOfGravity.value;
  const analysis = analysisFor(s.planform);
  const parts = s.parts.map((part) => {
    const mesh = getMesh(part.meshKey);
    return { part, triangles: mesh === undefined ? null : placedTriangles(part, mesh) };
  });
  const geometry = cfdGeometry(analysis, effectiveMassModel(s.model, s.parts), parts, cfd.settings.massBlocks);
  if (geometry.bodies.length === 0) {
    cfd.patch({ status: "error", error: "No hay nada que meter en el túnel: dibuja el dron o importa sus piezas." });
    return;
  }
  const vlmGeometry = tunnelGeometry(s.planform, analysis, s.model, parts, false);
  const settings = cfd.settings;
  const runId = cfd.runId + 1;
  cfd.patch({
    runId,
    status: "planning",
    error: null,
    notes: geometry.notes,
    plan: null,
    vlm: null,
    surface: null,
    cp: { instant: null, mean: null },
    particles: null,
    history: [],
    slice: null,
    result: null,
    progress: { step: 0, total: 0, averaging: false, mlups: 0 },
  });
  send({
    kind: "start",
    runId,
    bodies: geometry.bodies,
    settings: {
      speed: settings.speed,
      alpha: settings.alpha,
      beta: settings.beta,
      cells: settings.cells,
      smagorinsky: settings.smagorinsky,
      flowThroughs: settings.flowThroughs,
      averageFlowThroughs: settings.averageFlowThroughs,
    },
    air: s.air,
    cg: [cg.x, cg.y, cg.z],
    vlm:
      vlmGeometry.surfaces.length === 0
        ? null
        : {
            surfaces: vlmGeometry.surfaces,
            friction: vlmGeometry.friction,
            bluff: vlmGeometry.bluff,
            parts: vlmGeometry.parts,
            cg: [cg.x, cg.y, cg.z],
            speed: settings.speed,
            alphas: [settings.alpha],
            interference: s.tunnelSettings.interference,
            spanwiseStrips: s.tunnelSettings.spanwiseStrips,
            chordwisePanels: s.tunnelSettings.chordwisePanels,
            air: s.air,
          },
  });
  send({ kind: "slice", slice: cfd.view.slice });
}

export function stopCfd(): void {
  send({ kind: "stop" });
}

export function setCfdSlice(slice: SliceSpec | null): void {
  useCfdStore.getState().setView({ slice });
  if (slice === null) useCfdStore.getState().patch({ slice: null });
  send({ kind: "slice", slice });
}

export function validateOnGpu(caseId: string, d: number): void {
  const store = useCfdStore.getState();
  store.patch({ validation: { ...store.validation, [caseId]: { progress: 0, outcome: null, error: null } } });
  send({ kind: "validate", caseId, d });
}
