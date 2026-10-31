/**
 * The drawing of the aircraft as the editor makes it: flat elements drawn in
 * one of three planes (planta, alzado, perfil; see planes.ts) and extruded
 * along that plane's normal by their thickness.
 *
 * Everything is SI and body axes FRD (x forward, y right, z down), with the
 * same origin as the mass model, so both share one body frame.
 *
 * Geometry only: no masses or aerodynamic data. Lifting surfaces are the
 * elements of role "wing", which the VLM of the wind tunnel reads.
 */
import { meters, type Meters } from "@aeroforja/physics";
import type { PlaneId } from "./planes.ts";

/**
 * What an element is:
 * - plate: structure cut or printed from a sheet, extruded to its thickness.
 * - wing: a lifting surface (wing, tail, fin), also extruded as a flat plate.
 * - hole: a cut-out through the plates and wings of its plane that it crosses.
 * - rotor: a propeller disc, a plane with no thickness. Horizontal rotors are
 *   drawn in the planta, tractor and pusher propellers in the alzado.
 */
export type PlanformRole = "plate" | "wing" | "hole" | "rotor";

export const ROLES: readonly PlanformRole[] = ["plate", "wing", "hole", "rotor"];

export const ROLE_LABELS: Readonly<Record<PlanformRole, string>> = {
  plate: "Placa",
  wing: "Ala",
  hole: "Vaciado",
  rotor: "Hélice (disco)",
};

/** A point in the element's drawing plane, metres (see planes.ts for the axes). */
export interface PlanePoint {
  readonly u: Meters;
  readonly v: Meters;
}

interface ElementCommon {
  readonly id: string;
  readonly name: string;
  readonly role: PlanformRole;
  readonly plane: PlaneId;
  /**
   * Also build the mirror image about the plane of symmetry (y → −y). In the
   * planta and the alzado it is drawn in the same plane; in the perfil it is
   * a copy at the opposite offset (y → −y).
   */
  readonly mirror: boolean;
  /** Thickness along the plane's normal. Not used by holes and rotor discs. */
  readonly thickness: Meters;
  /** Position of the mid-plane along the plane's normal: z (planta), y (perfil) or x (alzado). */
  readonly offset: Meters;
}

export interface PolygonElement extends ElementCommon {
  readonly shape: "polygon";
  readonly points: readonly PlanePoint[];
}

export interface CircleElement extends ElementCommon {
  readonly shape: "circle";
  readonly center: PlanePoint;
  readonly radius: Meters;
}

export type PlanformElement = PolygonElement | CircleElement;

export interface Planform {
  readonly elements: readonly PlanformElement[];
}

export const EMPTY_PLANFORM: Planform = { elements: [] };

/** Starting values for a new element; the builder edits them afterwards. */
export const DEFAULT_THICKNESS = meters(0.003);
/** A drawn propeller disc in the planta starts 20 mm above the mid-plane of the plates. */
export const DEFAULT_ROTOR_Z = meters(-0.02);

export const planePoint = (u: number, v: number): PlanePoint => ({ u: meters(u), v: meters(v) });

/** Rounds to the micrometre so generated shapes have no 1e-17 noise. */
export const roundMicro = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

export function uniqueElementId(planform: Planform, base: string): string {
  const taken = new Set(planform.elements.map((e) => e.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function defaultOffset(role: PlanformRole, plane: PlaneId): Meters {
  return role === "rotor" && plane === "top" ? DEFAULT_ROTOR_Z : meters(0);
}

/** Translates an element within its plane by (du, dv) and along its normal by dOffset, metres. */
export function translateElement(element: PlanformElement, du: number, dv: number, dOffset = 0): PlanformElement {
  const move = (p: PlanePoint): PlanePoint => planePoint(roundMicro(p.u + du), roundMicro(p.v + dv));
  const offset = meters(roundMicro(element.offset + dOffset));
  return element.shape === "polygon"
    ? { ...element, offset, points: element.points.map(move) }
    : { ...element, offset, center: move(element.center) };
}
