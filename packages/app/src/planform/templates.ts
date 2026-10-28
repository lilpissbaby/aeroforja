/**
 * Parametric starting shapes for the planform editor, as the specification's
 * "Herramientas de dibujo" lists them: a multirotor frame from its motor
 * spacing and arm layout, and a wing from span, chords and sweep.
 *
 * They produce plain editable elements; after that the builder can drag any
 * vertex. Dimensions only: no masses, materials or aerodynamic data.
 */
import { meters } from "@aeroforja/physics";
import {
  planPoint,
  roundMicro,
  uniqueElementId,
  type CircleElement,
  type Planform,
  type PlanformElement,
  type PolygonElement,
} from "./model.ts";

export interface FrameParams {
  readonly arms: 3 | 4 | 6 | 8;
  /** "x": arms either side of the nose; "plus": one arm straight ahead. */
  readonly layout: "x" | "plus";
  /** Diameter of the circle through the motor axes, m (diagonal motor-to-motor distance for 4, 6 and 8 arms). */
  readonly motorCircle: number;
  /** m */
  readonly armWidth: number;
  /** Side of the square centre plate, m. */
  readonly plateSize: number;
  /** Diameter of the round motor mount at each arm tip, m. */
  readonly mountDiameter: number;
  /** m */
  readonly propDiameter: number;
  /** Height of the propeller plane above the plates' mid-plane, m. */
  readonly propHeight: number;
  /** Sheet thickness, m. */
  readonly thickness: number;
}

/** A 5-inch quad X, as a starting point to edit. */
export const DEFAULT_FRAME: FrameParams = {
  arms: 4,
  layout: "x",
  motorCircle: 0.22,
  armWidth: 0.014,
  plateSize: 0.05,
  mountDiameter: 0.028,
  propDiameter: 0.127,
  propHeight: 0.02,
  thickness: 0.003,
};

export interface WingParams {
  /** Tip-to-tip span, m. */
  readonly span: number;
  /** m */
  readonly rootChord: number;
  /** m; zero gives a pointed tip (delta). */
  readonly tipChord: number;
  /** Leading-edge sweep, rad (positive: tips behind the root). */
  readonly sweep: number;
  /** Body x of the root leading edge, m. */
  readonly rootLeadingEdgeX: number;
  /** m */
  readonly thickness: number;
  /** Mid-plane body z, m. */
  readonly z: number;
}

export interface WingPreset {
  readonly id: string;
  readonly label: string;
  readonly params: WingParams;
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const WING_PRESETS: readonly WingPreset[] = [
  {
    id: "flying-wing-800",
    label: "Ala volante de 800 mm",
    params: { span: 0.8, rootChord: 0.25, tipChord: 0.15, sweep: deg(25), rootLeadingEdgeX: 0.125, thickness: 0.003, z: 0 },
  },
  {
    id: "delta-800",
    label: "Delta de 800 mm",
    params: { span: 0.8, rootChord: 0.45, tipChord: 0, sweep: deg(48.4), rootLeadingEdgeX: 0.25, thickness: 0.003, z: 0 },
  },
  {
    id: "straight-1000",
    label: "Ala recta de 1000 mm",
    params: { span: 1, rootChord: 0.18, tipChord: 0.18, sweep: 0, rootLeadingEdgeX: 0.045, thickness: 0.003, z: 0 },
  },
];

export const DEFAULT_WING: WingParams = WING_PRESETS[0]!.params;

/** Arm directions in degrees from the nose towards the right, symmetric about the x axis. */
export function armAngles(arms: number, layout: "x" | "plus"): number[] {
  const step = 360 / arms;
  return Array.from({ length: arms }, (_, i) => (layout === "plus" ? i * step : (i + 0.5) * step));
}

const p = (x: number, y: number) => planPoint(roundMicro(x), roundMicro(y));

/**
 * Elements of a multirotor frame. Arms and rotors on the right side carry the
 * mirror flag, so editing one arm edits its twin; arms on the axis do not.
 */
export function frameElements(params: FrameParams, existing: Planform): PlanformElement[] {
  const out: PlanformElement[] = [];
  const planform = (): Planform => ({ elements: [...existing.elements, ...out] });
  const t = meters(params.thickness);
  const zero = meters(0);
  const half = params.plateSize / 2;
  out.push({
    id: uniqueElementId(planform(), "placa"),
    name: "Placa central",
    role: "plate",
    shape: "polygon",
    mirror: false,
    thickness: t,
    z: zero,
    points: [p(half, -half), p(half, half), p(-half, half), p(-half, -half)],
  });

  const r = params.motorCircle / 2;
  const w = params.armWidth / 2;
  let index = 0;
  for (const angle of armAngles(params.arms, params.layout)) {
    const a = Math.round(angle * 1e6) / 1e6;
    if (a > 180) continue; // built as the mirror image of a right-side arm
    const onAxis = a === 0 || a === 180;
    index++;
    const c = Math.cos(deg(a));
    const s = Math.sin(deg(a));
    const arm: PolygonElement = {
      id: uniqueElementId(planform(), "brazo"),
      name: onAxis ? `Brazo ${index}` : `Brazo ${index} (y su reflejo)`,
      role: "plate",
      shape: "polygon",
      mirror: !onAxis,
      thickness: t,
      z: zero,
      points: [p(-s * w, c * w), p(r * c - s * w, r * s + c * w), p(r * c + s * w, r * s - c * w), p(s * w, -c * w)],
    };
    out.push(arm);
    const center = p(r * c, r * s);
    const mount: CircleElement = {
      id: uniqueElementId(planform(), "bancada"),
      name: onAxis ? `Bancada ${index}` : `Bancada ${index} (y su reflejo)`,
      role: "plate",
      shape: "circle",
      mirror: !onAxis,
      thickness: t,
      z: zero,
      center,
      radius: meters(params.mountDiameter / 2),
    };
    out.push(mount);
    const rotor: CircleElement = {
      id: uniqueElementId(planform(), "helice"),
      name: onAxis ? `Hélice ${index}` : `Hélice ${index}`,
      role: "rotor",
      shape: "circle",
      mirror: !onAxis,
      thickness: t,
      z: meters(roundMicro(-params.propHeight)),
      center,
      radius: meters(params.propDiameter / 2),
    };
    out.push(rotor);
  }
  return out;
}

/** Right half of a straight-tapered wing, mirrored to the left. */
export function wingElement(params: WingParams, existing: Planform): PolygonElement {
  const semi = params.span / 2;
  const x0 = params.rootLeadingEdgeX;
  const tipLe = x0 - semi * Math.tan(params.sweep);
  const points = [p(x0, 0), p(tipLe, semi)];
  if (params.tipChord > 0) points.push(p(tipLe - params.tipChord, semi));
  points.push(p(x0 - params.rootChord, 0));
  return {
    id: uniqueElementId(existing, "ala"),
    name: "Ala",
    role: "wing",
    shape: "polygon",
    mirror: true,
    thickness: meters(params.thickness),
    z: meters(params.z),
    points,
  };
}

/** Problems with the template inputs, in the builder's words; empty when they can be built. */
export function frameParamsProblems(params: FrameParams): string[] {
  const problems: string[] = [];
  const positive: [number, string][] = [
    [params.motorCircle, "la distancia entre motores"],
    [params.armWidth, "el ancho de brazo"],
    [params.plateSize, "la placa central"],
    [params.mountDiameter, "la bancada"],
    [params.propDiameter, "la hélice"],
    [params.thickness, "el espesor"],
  ];
  for (const [v, what] of positive) if (!(v > 0)) problems.push(`Falta ${what} (tiene que ser mayor que cero).`);
  return problems;
}

export function wingParamsProblems(params: WingParams): string[] {
  const problems: string[] = [];
  if (!(params.span > 0)) problems.push("La envergadura tiene que ser mayor que cero.");
  if (!(params.rootChord > 0)) problems.push("La cuerda en la raíz tiene que ser mayor que cero.");
  if (!(params.tipChord >= 0)) problems.push("La cuerda en la punta no puede ser negativa.");
  if (!(params.thickness > 0)) problems.push("El espesor tiene que ser mayor que cero.");
  if (!(Math.abs(params.sweep) < deg(80))) problems.push("La flecha tiene que estar entre −80° y 80°.");
  return problems;
}
