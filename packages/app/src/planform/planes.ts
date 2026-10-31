/**
 * The three drawing planes of the editor, as in a three-view drawing:
 *
 * - top   (planta): seen from above. In-plane (u, v) = body (x, y); offset along z.
 * - side  (perfil): seen from the right side. (u, v) = (x, z); offset along y.
 * - front (alzado): seen from the front. (u, v) = (y, z); offset along x.
 *
 * Every element is drawn in one plane and extruded along that plane's
 * normal by its thickness, centred on its offset. Body axes are FRD
 * (x forward, y right, z down), metres.
 *
 * For meshes, local coordinates (u, v, w) map to body axes with a proper
 * rotation (determinant +1) so extruded faces keep their outward
 * orientation; in the side plane that makes w = −y.
 */
import type { Mat3, Triple } from "@aeroforja/physics";

export type PlaneId = "top" | "side" | "front";

export const PLANES: readonly PlaneId[] = ["top", "front", "side"];

export type BodyAxis = 0 | 1 | 2;

export interface PlaneSpec {
  readonly id: PlaneId;
  /** Name in the UI: planta, alzado, perfil. */
  readonly label: string;
  /** Short description of how the view looks at the aircraft. */
  readonly seenFrom: string;
  /** Body axis of u, of v and of the offset (0 = x, 1 = y, 2 = z). */
  readonly u: BodyAxis;
  readonly v: BodyAxis;
  readonly n: BodyAxis;
  /** Local w = sign × body offset axis, so that (u, v, w) is right-handed. */
  readonly wSign: 1 | -1;
}

export const PLANE_SPECS: Readonly<Record<PlaneId, PlaneSpec>> = {
  top: { id: "top", label: "Planta", seenFrom: "desde arriba", u: 0, v: 1, n: 2, wSign: 1 },
  side: { id: "side", label: "Perfil", seenFrom: "desde la derecha", u: 0, v: 2, n: 1, wSign: -1 },
  front: { id: "front", label: "Alzado", seenFrom: "desde delante", u: 1, v: 2, n: 0, wSign: 1 },
};

export const AXIS_NAMES = ["x", "y", "z"] as const;

/** Body point (m) of an in-plane point at a given offset along the plane's normal. */
export function toBody(plane: PlaneId, u: number, v: number, offset: number): Triple {
  const s = PLANE_SPECS[plane];
  const p: [number, number, number] = [0, 0, 0];
  p[s.u] = u;
  p[s.v] = v;
  p[s.n] = offset;
  return p;
}

/** In-plane coordinates and offset of a body point. */
export function fromBody(plane: PlaneId, p: Triple): { u: number; v: number; offset: number } {
  const s = PLANE_SPECS[plane];
  return { u: p[s.u], v: p[s.v], offset: p[s.n] };
}

/**
 * Row-major rotation from local (u, v, w) to body (x, y, z). Proper
 * (det = +1) for all three planes.
 */
export function localToBody(plane: PlaneId): Mat3 {
  const s = PLANE_SPECS[plane];
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  m[s.u * 3 + 0] = 1;
  m[s.v * 3 + 1] = 1;
  m[s.n * 3 + 2] = s.wSign;
  return m as unknown as Mat3;
}

/**
 * Whether the mirror image about the plane of symmetry (y → −y) stays in
 * the drawing plane (top and front: y is an in-plane axis) or is a copy at
 * the opposite offset (side: y is the offset axis).
 */
export const mirrorsInPlane = (plane: PlaneId): boolean => PLANE_SPECS[plane].n !== 1;

/** Which in-plane coordinate y is, when it is one: "u" in the front plane, "v" in the top plane. */
export function yCoordinate(plane: PlaneId): "u" | "v" | null {
  const s = PLANE_SPECS[plane];
  if (s.u === 1) return "u";
  if (s.v === 1) return "v";
  return null;
}

/**
 * Screen direction of each in-plane axis in the editor, in millimetres on
 * screen (right, down):
 *   top:   nose up, right wing to the right  → (v, −u)
 *   side:  nose to the right, down is down   → (u, v)
 *   front: right wing on the viewer's left   → (−u, v)
 * Each is the true view of a viewer looking along the plane's normal,
 * without reflection.
 */
export function planeToScreen(plane: PlaneId, u: number, v: number): [number, number] {
  switch (plane) {
    case "top":
      return [v, -u];
    case "side":
      return [u, v];
    case "front":
      return [-u, v];
  }
}

export function screenToPlane(plane: PlaneId, h: number, vScreen: number): [number, number] {
  switch (plane) {
    case "top":
      return [-vScreen, h];
    case "side":
      return [h, vScreen];
    case "front":
      return [-h, vScreen];
  }
}

/**
 * Axis labels and ruler signs of each view. The rulers show body
 * coordinates (FRD), so the value at a screen position s (mm, right or
 * down) is sign × s:
 *   top:   right = +y, down = −x
 *   side:  right = +x, down = +z
 *   front: right = −y, down = +z
 */
export interface ScreenAxes {
  /** Label of the horizontal axis and the end of the screen it goes at. */
  readonly horizontal: string;
  readonly horizontalAtRight: boolean;
  /** Label of the vertical axis and whether it goes at the top. */
  readonly vertical: string;
  readonly verticalAtTop: boolean;
  /** Body value per screen millimetre to the right and downwards. */
  readonly hSign: 1 | -1;
  readonly vSign: 1 | -1;
}

export const SCREEN_AXES: Readonly<Record<PlaneId, ScreenAxes>> = {
  top: { horizontal: "y · derecha →", horizontalAtRight: true, vertical: "x · adelante ↑", verticalAtTop: true, hSign: 1, vSign: -1 },
  side: { horizontal: "x · adelante →", horizontalAtRight: true, vertical: "z · abajo ↓", verticalAtTop: false, hSign: 1, vSign: 1 },
  front: { horizontal: "← y · derecha", horizontalAtRight: false, vertical: "z · abajo ↓", verticalAtTop: false, hSign: -1, vSign: 1 },
};

/** Names of the dimensions along the screen axes of each view. */
export const VIEW_DIMENSIONS: Readonly<Record<PlaneId, { horizontal: string; vertical: string }>> = {
  top: { horizontal: "Envergadura", vertical: "Longitud" },
  side: { horizontal: "Longitud", vertical: "Altura" },
  front: { horizontal: "Envergadura", vertical: "Altura" },
};

/** Name of the offset axis of each plane for the properties panel. */
export const OFFSET_LABEL: Readonly<Record<PlaneId, string>> = {
  top: "z del plano medio (+ abajo)",
  side: "y del plano medio (+ derecha)",
  front: "x del plano medio (+ adelante)",
};
