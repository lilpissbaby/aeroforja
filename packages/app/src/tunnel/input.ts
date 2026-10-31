/**
 * From the workbench to the tunnel (mini-design 004): which parts of the
 * drawing are lifting surfaces, which only rub the flow, and which are blunt
 * bodies, with the geometry the physics core needs, in body axes FRD (SI).
 *
 * - Lifting surfaces: the «Ala» elements of the planta (horizontal) and of
 *   the perfil (vertical fins), merged per plane and mid-plane position.
 *   Holes in a wing do not cut the lattice (assumed covered by film).
 * - Skin friction: every plate and wing piece of the planta and the perfil,
 *   S_wet = 2·A + perimeter·t, Reynolds on its length along x.
 * - Blunt edges of those pieces: flat-face Cd on thickness × width seen from the front.
 * - Sheets of the alzado: they face the flow, flat-face Cd on their area.
 * - Mass-model blocks (box, cylinder, tube, sphere): Cd of their shape on
 *   their frontal area (optional; they may already be drawn).
 * - STL parts with a drag shape: Cd of the shape on the projected frontal
 *   area (worker, parts/projection.ts).
 * - Propeller discs: ignored (propeller stopped and not modelled).
 */
import {
  rotationMatrix,
  type BluffComponent,
  type FrictionComponent,
  type LiftingSurfaceInput,
  type MassModel,
  type Triple,
} from "@aeroforja/physics";
import { DRAG_SHAPES, DRAG_SOURCE } from "../parts/drag.ts";
import type { ImportedPart } from "../parts/model.ts";
import {
  centroid,
  elementOutlines,
  perimeter,
  signedArea,
  unionRings,
  type PlanformAnalysis,
  type Ring,
} from "../planform/geometry.ts";
import type { Planform } from "../planform/model.ts";
import { toBody, type PlaneId } from "../planform/planes.ts";

export interface TunnelSettings {
  /** m/s */
  readonly speed: number;
  /** deg */
  readonly alphaMin: number;
  readonly alphaMax: number;
  readonly alphaStep: number;
  readonly spanwiseStrips: number;
  readonly chordwisePanels: number;
  /** Raymer's interference factor Q. */
  readonly interference: number;
  /** Count the blocks of the mass model as blunt bodies. */
  readonly massBlocks: boolean;
}

export const DEFAULT_TUNNEL: TunnelSettings = {
  speed: 15,
  alphaMin: -4,
  alphaMax: 14,
  alphaStep: 1,
  spanwiseStrips: 24,
  chordwisePanels: 6,
  interference: 1,
  massBlocks: true,
};

/** A part whose frontal area the worker projects. */
export interface TunnelPart {
  readonly id: string;
  readonly name: string;
  readonly cd: number;
  readonly source: string;
  /** Body-axes triangles, m. */
  readonly triangles: Float64Array;
  /** x where its drag acts (middle of its length), m. */
  readonly x: number;
}

export interface TunnelGeometry {
  readonly surfaces: LiftingSurfaceInput[];
  readonly friction: FrictionComponent[];
  readonly bluff: BluffComponent[];
  readonly parts: TunnelPart[];
  /** What was left out and why, in Spanish for the panel. */
  readonly notes: string[];
}

const FLAT_FACE = DRAG_SHAPES["flat-face"].cd;
const FLAT_SOURCE = `flat-face Cd ${FLAT_FACE} (${DRAG_SOURCE.citation})`;

function ringExtent(ring: Ring, index: 0 | 1): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    lo = Math.min(lo, p[index]);
    hi = Math.max(hi, p[index]);
  }
  return hi - lo;
}

export function tunnelGeometry(
  planform: Planform,
  analysis: PlanformAnalysis,
  model: MassModel,
  parts: readonly { part: ImportedPart; triangles: Float64Array | null }[],
  massBlocks: boolean,
): TunnelGeometry {
  const notes: string[] = [];
  const invalid = new Set(analysis.issues.filter((i) => i.level === "red" && i.elementId !== undefined).map((i) => i.elementId));

  // ---------- lifting surfaces ----------
  const groups = new Map<string, { plane: PlaneId; offset: number; rings: Ring[]; names: string[] }>();
  let frontWings = 0;
  for (const e of planform.elements) {
    if (e.role !== "wing" || invalid.has(e.id)) continue;
    if (e.plane === "front") {
      frontWings++;
      continue;
    }
    for (const o of elementOutlines(e)) {
      const key = `${o.plane}:${Math.round(o.offset * 1e6)}`;
      const g = groups.get(key) ?? { plane: o.plane, offset: o.offset, rings: [], names: [] };
      g.rings.push(o.ring);
      if (!g.names.includes(e.name)) g.names.push(e.name);
      groups.set(key, g);
    }
  }
  if (frontWings > 0) notes.push(`${frontWings} ala(s) dibujadas en el alzado no sustentan (están de cara al flujo): cuentan solo como resistencia.`);
  const surfaces: LiftingSurfaceInput[] = [];
  for (const [key, g] of groups) {
    const merged = unionRings(g.rings);
    merged.forEach((poly, i) => {
      const outer = poly[0]!;
      surfaces.push({
        id: merged.length > 1 ? `${key}#${i + 1}` : key,
        name: g.names.join(" + ") + (merged.length > 1 ? ` (${i + 1})` : ""),
        orientation: g.plane === "top" ? "horizontal" : "vertical",
        // Planta (u, v) = (x, y); perfil (u, v) = (x, z): already (x, s).
        outline: outer.map(([u, v]) => [u, v] as const),
        offset: g.offset,
      });
    });
  }

  // ---------- friction and blunt edges of the sheets ----------
  const friction: FrictionComponent[] = [];
  const bluff: BluffComponent[] = [];
  analysis.layers.forEach((layer, li) => {
    layer.bodies.forEach((body, bi) => {
      const outer = body[0]!;
      const area = Math.abs(signedArea(outer)) - body.slice(1).reduce((s, h) => s + Math.abs(signedArea(h)), 0);
      if (!(area > 0)) return;
      const c = centroid(outer);
      const where = toBody(layer.plane, c[0], c[1], layer.offset);
      const id = `capa${li + 1}.${bi + 1}`;
      const name = `Capa ${li + 1}, pieza ${bi + 1}`;
      if (layer.plane === "front") {
        bluff.push({ id, name: `${name} (de cara al flujo)`, cd: FLAT_FACE, frontalArea: area, centroid: where, source: FLAT_SOURCE });
        return;
      }
      const length = ringExtent(outer, 0);
      const width = ringExtent(outer, 1);
      const wetted = 2 * area + body.reduce((s, r) => s + perimeter(r), 0) * layer.thickness;
      friction.push({ id, name, wettedArea: wetted, flowLength: length, thicknessRatio: layer.thickness / length, centroid: where });
      bluff.push({ id: `${id}.canto`, name: `${name}: canto frontal`, cd: FLAT_FACE, frontalArea: layer.thickness * width, centroid: where, source: FLAT_SOURCE });
    });
  });
  if (analysis.rotors.length > 0) notes.push(`${analysis.rotors.length} disco(s) de hélice ignorados: hélice parada y sin modelar.`);

  // ---------- mass-model blocks ----------
  if (massBlocks) {
    let points = 0;
    for (const c of model.components) {
      if (c.id.startsWith("stl-")) continue; // imported parts get their own projected area
      const R = rotationMatrix(c.orientation ?? { w: 1, x: 0, y: 0, z: 0 });
      // x-component of the body image of each component axis: row 0 of R.
      const ax = [Math.abs(R[0]), Math.abs(R[1]), Math.abs(R[2])] as const;
      const where: Triple = [c.position.x, c.position.y, c.position.z];
      const spec = c.inertia;
      let area = 0;
      let cd = FLAT_FACE;
      let source = FLAT_SOURCE;
      switch (spec.kind) {
        case "box":
          // Projected area of a box along x: Σ |n_face · x| · face area over the three face pairs.
          area = ax[0] * spec.size.y * spec.size.z + ax[1] * spec.size.x * spec.size.z + ax[2] * spec.size.x * spec.size.y;
          break;
        case "cylinder":
        case "tube": {
          const r = spec.kind === "cylinder" ? spec.radius : spec.outerRadius;
          const k = spec.axis === "x" ? 0 : spec.axis === "y" ? 1 : 2;
          const along = ax[k];
          area = Math.PI * r * r * along + 2 * r * spec.length * Math.sqrt(Math.max(0, 1 - along * along));
          break;
        }
        case "sphere":
          area = Math.PI * spec.radius ** 2;
          cd = DRAG_SHAPES.sphere.cd;
          source = `sphere Cd ${cd} (${DRAG_SOURCE.citation})`;
          break;
        default:
          points++;
          continue;
      }
      bluff.push({ id: `masa.${c.id}`, name: `${c.name} (modelo de masas)`, cd, frontalArea: area, centroid: where, source });
    }
    if (points > 0) notes.push(`${points} componente(s) del modelo de masas sin forma (puntuales o con tensor dado): sin resistencia.`);
    notes.push("Los bloques del modelo de masas cuentan como cuerpos romos con el Cd de cara plana (conservador), salvo las esferas. Desactívalo si ya están dibujados.");
  }

  // ---------- STL parts ----------
  const tunnelParts: TunnelPart[] = [];
  for (const { part, triangles } of parts) {
    if (part.dragShape === "none") continue;
    if (triangles === null) {
      notes.push(`${part.name}: falta la malla en este navegador; vuelve a importarla o abre el proyecto que la contiene.`);
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < triangles.length; i += 3) {
      lo = Math.min(lo, triangles[i]!);
      hi = Math.max(hi, triangles[i]!);
    }
    const shape = DRAG_SHAPES[part.dragShape];
    tunnelParts.push({
      id: `stl.${part.id}`,
      name: `${part.name} (STL, ${shape.label.toLowerCase()})`,
      cd: shape.cd,
      source: `${shape.label}: Cd ${shape.cd} (${DRAG_SOURCE.citation})`,
      triangles,
      x: (lo + hi) / 2,
    });
  }

  return { surfaces, friction, bluff, parts: tunnelParts, notes };
}

/** Angles of the sweep, rad. */
export function sweepAlphas(s: TunnelSettings): number[] {
  const out: number[] = [];
  if (!(s.alphaStep > 0) || !(s.alphaMax >= s.alphaMin)) return out;
  const n = Math.min(200, Math.floor((s.alphaMax - s.alphaMin) / s.alphaStep + 1e-9));
  for (let i = 0; i <= n; i++) out.push(((s.alphaMin + i * s.alphaStep) * Math.PI) / 180);
  return out;
}
