/**
 * Parts imported from STL files (mini-design 005): a camera mount, a
 * canopy, a motor pod... placed on the aircraft with a position, an
 * orientation and a scale, in body axes FRD (SI).
 *
 * The triangles themselves live in the mesh store (IndexedDB in the
 * browser, embedded in the JSON when the project is saved), keyed by a hash
 * of their content, so the project in browser storage stays small.
 */
import type { Kilograms, KilogramsPerCubicMeter, Meters, Provenance, Radians } from "@aeroforja/physics";
import type { DragShapeId } from "./drag.ts";

export interface PartPlacement {
  /** Where the mesh's own origin goes, body FRD, m. */
  readonly position: { readonly x: Meters; readonly y: Meters; readonly z: Meters };
  /** Aeronautical z-y-x sequence from mesh axes to body axes, rad. */
  readonly yaw: Radians;
  readonly pitch: Radians;
  readonly roll: Radians;
  /** Uniform scale applied after the units, 1 = as modelled. */
  readonly scale: number;
}

/**
 * How the part's mass is known, best first (mini-design 005):
 * - weighed: the part was weighed; MEASURED. Density = mass / volume.
 * - density: volume × density of the material, with the density's own provenance.
 * - unknown: not given yet. The app does not guess a density: the part stays
 *   out of the mass model until it is weighed or its density is entered.
 */
export type PartMass =
  | { readonly kind: "weighed"; readonly mass: Kilograms; readonly standardUncertainty?: Kilograms }
  | { readonly kind: "density"; readonly density: KilogramsPerCubicMeter; readonly provenance: Provenance }
  | { readonly kind: "unknown" };

export interface ImportedPart {
  readonly id: string;
  readonly name: string;
  readonly fileName: string;
  /** Content hash of the triangles (mesh store key). */
  readonly meshKey: string;
  readonly triangleCount: number;
  /** Metres per unit of the file: 0.001 for millimetres. */
  readonly unit: number;
  readonly placement: PartPlacement;
  readonly mass: PartMass;
  /** Whether the part adds its mass, CG and inertia to the mass model. */
  readonly inMassModel: boolean;
  /** Shape class for the drag estimate (NASA Glenn values, parts/drag.ts), or none. */
  readonly dragShape: DragShapeId | "none";
}

export const UNIT_CHOICES: readonly { readonly unit: number; readonly label: string }[] = [
  { unit: 0.001, label: "mm" },
  { unit: 0.01, label: "cm" },
  { unit: 0.0254, label: "pulgadas" },
  { unit: 1, label: "m" },
];

export function uniquePartId(parts: readonly ImportedPart[], base: string): string {
  const taken = new Set(parts.map((p) => p.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}
