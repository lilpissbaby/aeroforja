import { useDeferredValue } from "react";
import { analysePlanform, type PlanformAnalysis } from "../../planform/geometry.ts";
import type { Planform } from "../../planform/model.ts";
import { useAppStore } from "../../state/store.ts";

const cache = new WeakMap<Planform, PlanformAnalysis>();

/** One analysis per planform state, shared by the editor, the 3D viewer and the panels. */
export function analysisFor(planform: Planform): PlanformAnalysis {
  let analysis = cache.get(planform);
  if (analysis === undefined) {
    try {
      analysis = analysePlanform(planform);
    } catch (error) {
      analysis = {
        layers: [],
        rotors: [],
        issues: [
          {
            level: "red",
            message: `No se ha podido construir la geometría: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        bounds: null,
        box: null,
        projectedArea: 0,
        frontalArea: 0,
        volume: 0,
        wing: null,
        vertical: null,
        rotorSummary: null,
      };
    }
    cache.set(planform, analysis);
  }
  return analysis;
}

/**
 * The boolean operations can take a few milliseconds on a busy drawing, so
 * they follow the latest planform with React's deferred value: dragging a
 * vertex stays smooth and the 3D model catches up right after.
 */
export function usePlanformAnalysis(): PlanformAnalysis {
  const planform = useAppStore((s) => s.planform);
  return analysisFor(useDeferredValue(planform));
}
