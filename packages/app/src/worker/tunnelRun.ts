/**
 * One VLM sweep from a tunnel request (mini-design 004), shared by the
 * physics worker and the CFD worker (which runs the VLM at the CFD angle to
 * show both side by side).
 */
import { atmosphere, dimensionless, kelvin, meters, tunnelSweep, type BluffComponent, type Result, type TunnelSweep } from "@aeroforja/physics";
import { projectTriangles } from "../parts/projection.ts";
import type { AirInput, Outcome, TunnelRequest } from "./protocol.ts";

export function attempt<T>(compute: () => Result<T>): Outcome<T> {
  try {
    return { ok: true, result: compute() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export const airState = (input: AirInput) =>
  atmosphere({
    altitude: { kind: "geometric", value: meters(input.altitude_m) },
    ...(input.deltaT_K === 0 ? {} : { temperature: { kind: "offset", deltaT: kelvin(input.deltaT_K) } as const }),
    ...(input.relativeHumidity === null ? {} : { relativeHumidity: dimensionless(input.relativeHumidity) }),
  });

/** Projected areas are a boolean union of many triangles: kept between sweeps. */
const projections = new Map<string, { area: number; centroid: readonly [number, number] }>();

function fingerprint(t: Float64Array): string {
  let h = 0;
  const step = Math.max(1, Math.floor(t.length / 4096));
  for (let i = 0; i < t.length; i += step) h = (h * 31 + Math.round(t[i]! * 1e7)) | 0;
  return `${t.length}:${h}`;
}

export function sweepFor(r: Omit<TunnelRequest, "kind" | "seq">): { sweep: Outcome<TunnelSweep>; partAreas: { id: string; area: number }[] } {
  const partAreas: { id: string; area: number }[] = [];
  const bluff: BluffComponent[] = [...r.bluff];
  for (const p of r.parts) {
    const key = `${p.id}:${fingerprint(p.triangles)}`;
    let proj = projections.get(key);
    if (proj === undefined) {
      const full = projectTriangles(p.triangles, 0);
      proj = { area: full.area, centroid: full.centroid };
      projections.set(key, proj);
    }
    partAreas.push({ id: p.id, area: proj.area });
    bluff.push({ id: p.id, name: p.name, cd: p.cd, frontalArea: proj.area, centroid: [p.x, proj.centroid[0], proj.centroid[1]], source: p.source });
  }
  const sweep = attempt(() => {
    const a = airState(r.air).value;
    return tunnelSweep({
      surfaces: r.surfaces,
      friction: r.friction,
      bluff,
      cg: r.cg,
      speed: r.speed,
      alphas: r.alphas,
      air: { density: a.density, kinematicViscosity: a.kinematicViscosity, speedOfSound: a.speedOfSound },
      interference: r.interference,
      lattice: { spanwiseStrips: r.spanwiseStrips, chordwisePanels: r.chordwisePanels, spacing: "cosine" },
    });
  });
  return { sweep, partAreas };
}

