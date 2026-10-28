/**
 * Sends every change of the project state to the physics worker and stores
 * the latest answer. Older answers that arrive late are ignored.
 */
import { saveState, useAppStore } from "../state/store.ts";
import type { ComputeResponse } from "./protocol.ts";

export function startPhysicsWorker(): () => void {
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  let seq = 0;
  let latestSent = 0;

  worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
    if (event.data.seq === latestSent) useAppStore.getState().setResults(event.data);
  };

  const send = (): void => {
    const { model, air } = useAppStore.getState();
    latestSent = ++seq;
    worker.postMessage({ seq: latestSent, model, air });
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

  send();
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.model !== previous.model || state.air !== previous.air) send();
    if (
      state.model !== previous.model ||
      state.planform !== previous.planform ||
      state.projectName !== previous.projectName ||
      state.theme !== previous.theme
    ) {
      scheduleSave();
    }
  });

  return () => {
    window.removeEventListener("pagehide", flush);
    flush();
    unsubscribe();
    worker.terminate();
  };
}
