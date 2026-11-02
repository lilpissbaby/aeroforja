/**
 * Runs the physics core off the UI thread, as the specification requires.
 * Each request is answered with the same sequence number so the UI can drop
 * stale answers.
 */
import { gustResponse, gustSetup, gustSweep, massProperties } from "@aeroforja/physics";
import { airState, attempt, sweepFor } from "./tunnelRun.ts";
import type { GustRequest, GustResponseMessage, TunnelRequest, WorkerRequest, WorkerResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

function runTunnel(r: TunnelRequest) {
  const started = performance.now();
  const { sweep, partAreas } = sweepFor(r);
  scope.postMessage({ kind: "tunnel", seq: r.seq, sweep, partAreas, elapsed: performance.now() - started });
}

function runGust(r: GustRequest) {
  const started = performance.now();
  const a = attempt(() => airState(r.air));
  if (!a.ok) {
    scope.postMessage({ kind: "gust", seq: r.seq, response: a, sweep: null, elapsed: 0 });
    return;
  }
  const air = a.result.value;
  const input = { ...r.input, air: { density: air.density, kinematicViscosity: air.kinematicViscosity, speedOfSound: air.speedOfSound } };
  let setup: ReturnType<typeof gustSetup> | undefined;
  const response = attempt(() => {
    setup = gustSetup(input);
    return gustResponse(input, setup);
  });
  let sweep: GustResponseMessage["sweep"] = null;
  if (r.sweep !== null && response.ok) {
    try {
      sweep = { ok: true, points: gustSweep(input, r.sweep, setup) };
    } catch (e) {
      sweep = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  scope.postMessage({ kind: "gust", seq: r.seq, response, sweep, elapsed: performance.now() - started });
}

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === "tunnel") {
    runTunnel(request);
    return;
  }
  if (request.kind === "gust") {
    runGust(request);
    return;
  }
  scope.postMessage({
    kind: "compute",
    seq: request.seq,
    mass: attempt(() => massProperties(request.model)),
    air: attempt(() => airState(request.air)),
  });
};
