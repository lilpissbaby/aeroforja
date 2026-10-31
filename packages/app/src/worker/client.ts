/**
 * Sends every change of the project state to the physics worker and stores
 * the latest answer. Older answers that arrive late are ignored.
 *
 * The mass model sent includes the imported STL parts that count in it
 * (parts/massLink.ts). Wind-tunnel sweeps run on request, and again by
 * themselves while the tunnel view is open and the design changes.
 */
import { effectiveMassModel } from "../parts/massLink.ts";
import { getMesh, loadMeshes, subscribe as onMeshes } from "../parts/meshStore.ts";
import { placedTriangles } from "../parts/transform.ts";
import { saveState, useAppStore, type AppState } from "../state/store.ts";
import { sweepAlphas, tunnelGeometry } from "../tunnel/input.ts";
import { analysisFor } from "../ui/planform/usePlanformAnalysis.ts";
import type { TunnelRequest, WorkerResponse } from "./protocol.ts";

export function startPhysicsWorker(): () => void {
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  let seq = 0;
  let latestCompute = 0;
  let latestTunnel = 0;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const data = event.data;
    const store = useAppStore.getState();
    if (data.kind === "compute") {
      if (data.seq === latestCompute) store.setResults(data);
      return;
    }
    if (data.seq !== latestTunnel) return;
    store.setTunnelState({
      running: false,
      response: data,
      error: data.sweep.ok ? null : data.sweep.message,
    });
  };

  const send = (): void => {
    const { model, air, parts } = useAppStore.getState();
    latestCompute = ++seq;
    worker.postMessage({ kind: "compute", seq: latestCompute, model: effectiveMassModel(model, parts), air });
  };

  const sendTunnel = (): void => {
    const s = useAppStore.getState();
    const mass = s.results?.mass;
    if (mass === undefined || !mass.ok) {
      s.setTunnelState({ running: false, error: "Sin centro de gravedad: el modelo de masas no se ha podido calcular." });
      return;
    }
    const cg = mass.result.value.centerOfGravity.value;
    const settings = s.tunnelSettings;
    const alphas = sweepAlphas(settings);
    if (alphas.length === 0) {
      s.setTunnelState({ running: false, error: "El barrido de α está vacío: revisa el mínimo, el máximo y el paso." });
      return;
    }
    const geometry = tunnelGeometry(
      s.planform,
      analysisFor(s.planform),
      s.model,
      s.parts.map((part) => {
        const mesh = getMesh(part.meshKey);
        return { part, triangles: mesh === undefined ? null : placedTriangles(part, mesh) };
      }),
      settings.massBlocks,
    );
    latestTunnel = ++seq;
    const request: TunnelRequest = {
      kind: "tunnel",
      seq: latestTunnel,
      surfaces: geometry.surfaces,
      friction: geometry.friction,
      bluff: geometry.bluff,
      parts: geometry.parts,
      cg: [cg.x, cg.y, cg.z],
      speed: settings.speed,
      alphas,
      interference: settings.interference,
      spanwiseStrips: settings.spanwiseStrips,
      chordwisePanels: settings.chordwisePanels,
      air: s.air,
    };
    s.setTunnelState({ running: true, error: null, notes: geometry.notes });
    worker.postMessage(request);
  };

  // Drags change the planform on every pointer move; storage is written once
  // things settle.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSave = (): void => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(useAppStore.getState()), 300);
  };
  const flush = (): void => {
    clearTimeout(saveTimer);
    saveState(useAppStore.getState());
  };
  window.addEventListener("pagehide", flush);

  let tunnelTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleTunnel = (): void => {
    clearTimeout(tunnelTimer);
    tunnelTimer = setTimeout(sendTunnel, 450);
  };

  const designChanged = (a: AppState, b: AppState): boolean =>
    a.planform !== b.planform || a.parts !== b.parts || a.air !== b.air || a.tunnelSettings !== b.tunnelSettings || a.results?.mass !== b.results?.mass;

  send();
  void loadMeshes(useAppStore.getState().parts.map((p) => p.meshKey));
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.model !== previous.model || state.air !== previous.air || state.parts !== previous.parts) send();
    if (
      state.model !== previous.model ||
      state.planform !== previous.planform ||
      state.parts !== previous.parts ||
      state.projectName !== previous.projectName ||
      state.theme !== previous.theme
    ) {
      scheduleSave();
    }
    if (state.tunnelRequest !== previous.tunnelRequest) sendTunnel();
    else if (state.view === "tunnel" && (designChanged(state, previous) || previous.view !== "tunnel")) scheduleTunnel();
  });
  // Meshes arrive from IndexedDB after start-up: the mass model changes with them.
  const unsubscribeMeshes = onMeshes(send);

  return () => {
    window.removeEventListener("pagehide", flush);
    flush();
    unsubscribe();
    unsubscribeMeshes();
    clearTimeout(tunnelTimer);
    worker.terminate();
  };
}
