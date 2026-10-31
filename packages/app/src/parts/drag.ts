/**
 * Drag coefficients of bluff and streamlined shapes for the drag estimate
 * of imported parts (mini-design 005): (D/q) = Cd · A_frontal.
 *
 * Values transcribed from NASA Glenn Research Center, «Beginner's Guide to
 * Aeronautics: Shape Effects on Drag», measured in low-speed wind tunnels
 * with the projected frontal area as reference. The sphere's value is the
 * upper end of the range given there (subcritical flow, the regime of small
 * drone parts). Always ESTIMATED with a ±40 % band: interference with the
 * airframe and the real shape of each part are not modelled.
 */

export type DragShapeId = "flat-face" | "rocket" | "sphere" | "bullet" | "streamlined";

export interface DragShape {
  readonly label: string;
  /** Drag coefficient on the projected frontal area. */
  readonly cd: number;
}

export const DRAG_SHAPES: Readonly<Record<DragShapeId, DragShape>> = {
  "flat-face": { label: "Cara plana de frente (placa, bloque)", cd: 1.28 },
  rocket: { label: "Cuerpo cilíndrico con morro (tipo cohete)", cd: 0.75 },
  sphere: { label: "Esfera o cúpula", cd: 0.5 },
  bullet: { label: "Morro de bala", cd: 0.295 },
  streamlined: { label: "Carenado o perfil", cd: 0.045 },
};

export const DRAG_SHAPE_IDS = Object.keys(DRAG_SHAPES) as DragShapeId[];

/** Relative half-width of the ESTIMATED band. */
export const DRAG_RELATIVE_UNCERTAINTY = 0.4;

export const DRAG_SOURCE = {
  citation: "NASA Glenn Research Center, Beginner's Guide to Aeronautics: Shape Effects on Drag (ensayos en túnel subsónico, área frontal)",
  url: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/shape-effects-on-drag/",
} as const;
