/**
 * Runs the physics core off the UI thread, as the specification requires.
 * Each request is answered with the same sequence number so the UI can drop
 * stale answers.
 */
import {
  atmosphere,
  dimensionless,
  kelvin,
  massProperties,
  meters,
  type Result,
} from "@aeroforja/physics";
import type { ComputeRequest, ComputeResponse, Outcome } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<ComputeRequest>) => void) | null;
  postMessage(message: ComputeResponse): void;
}

const scope = self as unknown as WorkerScope;

function attempt<T>(compute: () => Result<T>): Outcome<T> {
  try {
    return { ok: true, result: compute() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

scope.onmessage = (event) => {
  const { seq, model, air } = event.data;
  scope.postMessage({
    seq,
    mass: attempt(() => massProperties(model)),
    air: attempt(() =>
      atmosphere({
        altitude: { kind: "geometric", value: meters(air.altitude_m) },
        ...(air.deltaT_K === 0
          ? {}
          : { temperature: { kind: "offset", deltaT: kelvin(air.deltaT_K) } as const }),
        ...(air.relativeHumidity === null
          ? {}
          : { relativeHumidity: dimensionless(air.relativeHumidity) }),
      }),
    ),
  });
};
