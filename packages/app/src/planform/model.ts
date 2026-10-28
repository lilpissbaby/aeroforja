/**
 * Planform (top view) of the aircraft as the 2D editor draws it.
 *
 * Every coordinate is in SI and in body axes FRD seen from above: x forward,
 * y right, and z (positive down) for the height of each element. The origin
 * is the same reference point as the mass model, so both share one body
 * frame.
 *
 * This is geometry only. It does not carry masses or aerodynamic data: the
 * link to the mass model (volume × measured density of each material) needs
 * the material bank of the fabrication module and its own mini-design.
 */
import { meters, type Meters } from "@aeroforja/physics";

/**
 * What an element is:
 * - plate: structure cut or printed from a sheet, extruded to its thickness.
 * - wing: a lifting surface, also extruded as a flat plate for now; the VLM
 *   will read these elements as its planform.
 * - hole: a cut-out through the plates and wings it crosses at its height.
 * - rotor: a propeller disc, drawn as a plane with no thickness.
 */
export type PlanformRole = "plate" | "wing" | "hole" | "rotor";

export const ROLES: readonly PlanformRole[] = ["plate", "wing", "hole", "rotor"];

export const ROLE_LABELS: Readonly<Record<PlanformRole, string>> = {
  plate: "Placa",
  wing: "Ala",
  hole: "Vaciado",
  rotor: "Hélice (disco)",
};

/** A point of the top view, body axes FRD: x forward, y right. */
export interface PlanPoint {
  readonly x: Meters;
  readonly y: Meters;
}

interface ElementCommon {
  readonly id: string;
  readonly name: string;
  readonly role: PlanformRole;
  /** Also build the mirror image about the plane of symmetry (y → −y). */
  readonly mirror: boolean;
  /** Thickness along body z. Not used by holes and rotor discs. */
  readonly thickness: Meters;
  /** Body z (positive down) of the element's mid-plane; for a rotor, the disc plane. */
  readonly z: Meters;
}

export interface PolygonElement extends ElementCommon {
  readonly shape: "polygon";
  readonly points: readonly PlanPoint[];
}

export interface CircleElement extends ElementCommon {
  readonly shape: "circle";
  readonly center: PlanPoint;
  readonly radius: Meters;
}

export type PlanformElement = PolygonElement | CircleElement;

export interface Planform {
  readonly elements: readonly PlanformElement[];
}

export const EMPTY_PLANFORM: Planform = { elements: [] };

/** Starting values for a new element; the builder edits them afterwards. */
export const DEFAULT_THICKNESS = meters(0.003);
/** A drawn propeller disc starts 20 mm above the mid-plane of the plates. */
export const DEFAULT_ROTOR_Z = meters(-0.02);

export const planPoint = (x: number, y: number): PlanPoint => ({ x: meters(x), y: meters(y) });

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

export function defaultZ(role: PlanformRole): Meters {
  return role === "rotor" ? DEFAULT_ROTOR_Z : meters(0);
}

/** Translates an element in the plan by (dx, dy) metres. */
export function translateElement(element: PlanformElement, dx: number, dy: number): PlanformElement {
  const move = (p: PlanPoint): PlanPoint => planPoint(roundMicro(p.x + dx), roundMicro(p.y + dy));
  return element.shape === "polygon"
    ? { ...element, points: element.points.map(move) }
    : { ...element, center: move(element.center) };
}
