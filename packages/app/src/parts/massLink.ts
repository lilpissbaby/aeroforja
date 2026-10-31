/**
 * Mass of an imported part and its place in the mass model (mini-design
 * 005): polyhedral mass properties of the placed mesh, with the mass either
 * weighed (MEASURED, density = m / V) or volume × density (CALCULATED when
 * the density is yours measured, ESTIMATED when it is a catalogue value).
 */
import {
  bodyPosition,
  kilograms,
  matrixToTensor,
  meshMassProperties,
  meshTopology,
  type MassComponent,
  type MassModel,
  type MeshMassProperties,
  type MeshTopology,
  type Provenance,
  type Result,
} from "@aeroforja/physics";
import { getMesh } from "./meshStore.ts";
import type { ImportedPart } from "./model.ts";
import { placedTriangles } from "./transform.ts";

export type PartAnalysis =
  | {
      readonly ok: true;
      readonly mass: Result<MeshMassProperties>;
      /** kg */
      readonly massValue: number;
      readonly massProvenance: Provenance;
      readonly massUncertainty?: number;
      /** No mass or density given: geometry only (density 1 in `mass`). */
      readonly unknownMass?: boolean;
    }
  | { readonly ok: false; readonly topology: MeshTopology | null; readonly message: string };

const cache = new WeakMap<ImportedPart, { mesh: Float32Array; analysis: PartAnalysis }>();

function densityProvenance(part: ImportedPart): Provenance {
  if (part.mass.kind === "weighed") return "MEASURED";
  if (part.mass.kind === "unknown") return "ESTIMATED";
  return part.mass.provenance === "ESTIMATED" ? "ESTIMATED" : "CALCULATED";
}

/** Mass properties of a placed part, remembered per part object. */
export function analysePart(part: ImportedPart): PartAnalysis | null {
  const mesh = getMesh(part.meshKey);
  if (mesh === undefined) return null;
  const hit = cache.get(part);
  if (hit !== undefined && hit.mesh === mesh) return hit.analysis;
  const tris = placedTriangles(part, mesh);
  let analysis: PartAnalysis;
  try {
    // Volume first with unit density, then the density the user's data gives.
    const unit = meshMassProperties(tris, 1);
    const volume = unit.value.volume;
    if (part.mass.kind === "unknown") {
      analysis = { ok: true, mass: unit, massValue: Number.NaN, massProvenance: "ESTIMATED", unknownMass: true };
      cache.set(part, { mesh, analysis });
      return analysis;
    }
    const density = part.mass.kind === "weighed" ? part.mass.mass / volume : part.mass.density;
    const mass = meshMassProperties(tris, density);
    analysis = {
      ok: true,
      mass,
      massValue: mass.value.mass,
      massProvenance: densityProvenance(part),
      ...(part.mass.kind === "weighed" && part.mass.standardUncertainty !== undefined
        ? { massUncertainty: part.mass.standardUncertainty }
        : {}),
    };
  } catch (error) {
    let extent = 0;
    for (let i = 0; i < tris.length; i++) extent = Math.max(extent, Math.abs(tris[i]!));
    analysis = {
      ok: false,
      topology: meshTopology(tris, Math.max(extent, 1e-3) * 1e-9),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  cache.set(part, { mesh, analysis });
  return analysis;
}

export const partComponentId = (part: ImportedPart): string => `stl-${part.id}`;

/** The mass model the physics sees: the user's components plus the imported parts that count. */
export function effectiveMassModel(model: MassModel, parts: readonly ImportedPart[]): MassModel {
  const extra: MassComponent[] = [];
  for (const part of parts) {
    if (!part.inMassModel) continue;
    const a = analysePart(part);
    if (a === null || !a.ok || a.unknownMass === true) continue;
    const v = a.mass.value;
    extra.push({
      id: partComponentId(part),
      name: `${part.name} (STL)`,
      mass: {
        value: kilograms(v.mass),
        provenance: a.massProvenance,
        ...(a.massUncertainty !== undefined ? { standardUncertainty: kilograms(a.massUncertainty) } : {}),
      },
      position: bodyPosition(v.centroid[0], v.centroid[1], v.centroid[2]),
      // Tensor already in body axes about the part's own centroid: identity orientation.
      inertia: { kind: "given", tensor: matrixToTensor(v.inertia), provenance: a.massProvenance === "ESTIMATED" ? "ESTIMATED" : "CALCULATED" },
    });
  }
  return extra.length === 0 ? model : { ...model, components: [...model.components, ...extra] };
}
