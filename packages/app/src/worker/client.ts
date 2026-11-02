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
import type { GustRequest, TunnelRequest, WorkerResponse } from "./protocol.ts";
import { gustInput } from "../gust/input.ts";
import { SWEEP_CHORDS, useGustStore } from "../gust/store.ts";

/** Mean aerodynamic chord of the horizontal surfaces, c̄ = ∫c² dy / S, from their outlines (m). */
function meanChord(surfaces: readonly { readonly orientation: string; readonly outline: readonly (readonly [number, number])[] }[]): number {
  let area = 0, c2 = 0;
  for (const s of surfaces) {
    if (s.orientation !== "horizontal") continue;
    const ys = s.outline.map((p) => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const n = 400;
    for (let k = 0; k < n; k++) {
      const y = lo + ((k + 0.5) * (hi - lo)) / n;
      const xs: number[] = [];
      for (let i = 0; i < s.outline.length; i++) {
        const [x1, y1] = s.outline[i]!;
        const [x2, y2] = s.outline[(i + 1) % s.outline.length]!;
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      if (xs.length < 2) continue;
      const c = Math.max(...xs) - Math.min(...xs);
      area += (c * (hi - lo)) / n;
      c2 += (c * c * (hi - lo)) / n;
    }
  }
  return area > 0 ? c2 / area : 0;
}

export function startPhysicsWorker(): () => void {
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  let seq = 0;
  let latestCompute = 0;
  let latestTunnel = 0;
  let latestGust = 0;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const data = event.data;
    const store = useAppStore.getState();
    if (data.kind === "compute") {
      if (data.seq === latestCompute) store.setResults(data);
      return;
    }
    if (data.kind === "gust") {
      if (data.seq !== latestGust) return;
      useGustStore.getState().patch({
        running: false,
        result: data.response.ok ? data.response.result : null,
        error: data.response.ok ? (data.sweep !== null && !data.sweep.ok ? data.sweep.message : null) : data.response.message,
        sweep: data.sweep !== null && data.sweep.ok ? data.sweep.points : null,
        elapsed: data.elapsed,
      });
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

  const sendGust = (): void => {
    const s = useAppStore.getState();
    const g = useGustStore.getState();
    const mass = s.results?.mass;
    const analysis = analysisFor(s.planform);
    const geometry = tunnelGeometry(s.planform, analysis, s.model, [], false);
    const build = gustInput(geometry.surfaces, s.planform, mass !== undefined && mass.ok ? mass.result.value : null, g.settings, s.tunnelSettings);
    if (build.input === null) {
      g.patch({ running: false, result: null, sweep: null, error: build.notes.join(" "), notes: build.notes });
      return;
    }
    const input = build.input;
    // H is chosen in mean chords; c̄ from the outlines (the lattice gives the same to its discretisation).
    latestGust = ++seq;
    const request: GustRequest = {
      kind: "gust",
      seq: latestGust,
      air: s.air,
      input: { ...input, gust: { ...input.gust, gradient: g.settings.gradientChords === null ? null : g.settings.gradientChords * meanChord(input.surfaces) } },
      sweep: g.withSweep ? SWEEP_CHORDS.map((k) => k * meanChord(input.surfaces)) : null,
    };
    g.patch({ notes: build.notes });
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
  const unsubscribeGust = useGustStore.subscribe((state, previous) => {
    if (state.request !== previous.request) sendGust();
  });

  return () => {
    window.removeEventListener("pagehide", flush);
    flush();
    unsubscribe();
    unsubscribeMeshes();
    unsubscribeGust();
    clearTimeout(tunnelTimer);
    worker.terminate();
  };
}
