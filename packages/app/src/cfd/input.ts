/**
 * From the workbench to the CFD tunnel (mini-design 006): the closed solids
 * of the drawing (each piece of each sheet, extruded), the STL parts placed
 * on the drone and, optionally, the blocks of the mass model, all as triangle
 * meshes in body axes FRD (metres).
 */
import { rotationMatrix, type MassModel } from "@aeroforja/physics";
import type { CfdBody } from "@aeroforja/cfd-webgpu";
import { polygonArea, type PlanformAnalysis } from "../planform/geometry.ts";
import { layerGeometries, triangles } from "../planform/mesh.ts";
import { PLANE_SPECS } from "../planform/planes.ts";
import type { ImportedPart } from "../parts/model.ts";

export interface CfdGeometry {
  readonly bodies: CfdBody[];
  /** What was left out and why (Spanish). */
  readonly notes: string[];
}

function transform(tris: number[], R: readonly number[], at: readonly [number, number, number]): Float64Array {
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i]!, y = tris[i + 1]!, z = tris[i + 2]!;
    out[i] = at[0] + R[0]! * x + R[1]! * y + R[2]! * z;
    out[i + 1] = at[1] + R[3]! * x + R[4]! * y + R[5]! * z;
    out[i + 2] = at[2] + R[6]! * x + R[7]! * y + R[8]! * z;
  }
  return out;
}

/** Closed prism of a circle (radius r, length l) along the local axis k, centred at the origin. */
function cylinderTriangles(r: number, l: number, k: 0 | 1 | 2, segments = 24): number[] {
  const out: number[] = [];
  const point = (angle: number, h: number): number[] => {
    const a = r * Math.cos(angle), b = r * Math.sin(angle);
    return k === 0 ? [h, a, b] : k === 1 ? [b, h, a] : [a, b, h];
  };
  const c0 = k === 0 ? [-l / 2, 0, 0] : k === 1 ? [0, -l / 2, 0] : [0, 0, -l / 2];
  const c1 = k === 0 ? [l / 2, 0, 0] : k === 1 ? [0, l / 2, 0] : [0, 0, l / 2];
  for (let s = 0; s < segments; s++) {
    const a0 = (2 * Math.PI * s) / segments, a1 = (2 * Math.PI * (s + 1)) / segments;
    const p00 = point(a0, -l / 2), p01 = point(a1, -l / 2), p10 = point(a0, l / 2), p11 = point(a1, l / 2);
    out.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
    out.push(...c0, ...p01, ...p00);
    out.push(...c1, ...p10, ...p11);
  }
  return out;
}

function boxTriangles(sx: number, sy: number, sz: number): number[] {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]];
  return f.flatMap((t) => t.flatMap((i) => v[i]!));
}

function sphereTriangles(r: number, segments = 24, rings = 12): number[] {
  const out: number[] = [];
  const p = (ri: number, si: number) => {
    const th = (Math.PI * ri) / rings, ph = (2 * Math.PI * si) / segments;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  for (let ri = 0; ri < rings; ri++)
    for (let si = 0; si < segments; si++) {
      const a = p(ri, si), b = p(ri + 1, si), c = p(ri + 1, si + 1), d = p(ri, si + 1);
      if (ri > 0) out.push(...a, ...b, ...d);
      if (ri < rings - 1) out.push(...b, ...c, ...d);
    }
  return out;
}

export function cfdGeometry(
  analysis: PlanformAnalysis,
  model: MassModel,
  parts: readonly { part: ImportedPart; triangles: Float64Array | null }[],
  massBlocks: boolean,
): CfdGeometry {
  const bodies: CfdBody[] = [];
  const notes: string[] = [];
  analysis.layers.forEach((layer, li) => {
    const geoms = layerGeometries(layer);
    geoms.forEach((g, bi) => {
      const tris = triangles(g);
      g.dispose();
      if (tris.length === 0) return;
      const body = layer.bodies[bi];
      const outerArea = body === undefined ? layer.area : polygonArea(body);
      bodies.push({
        id: `capa${li + 1}.${bi + 1}`,
        name: `Capa ${li + 1} (${PLANE_SPECS[layer.plane].label.toLowerCase()}), pieza ${bi + 1}`,
        kind: "plate",
        triangles: tris,
        plate: { axis: PLANE_SPECS[layer.plane].n, offset: layer.offset, thickness: layer.thickness, area: outerArea },
      });
    });
  });
  if (analysis.rotors.length > 0) notes.push(`${analysis.rotors.length} disco(s) de hélice sin modelar: hélices paradas.`);
  for (const { part, triangles: tris } of parts) {
    if (tris === null) {
      notes.push(`${part.name}: falta la malla en este navegador; vuelve a importarla o abre el proyecto que la contiene.`);
      continue;
    }
    bodies.push({ id: `stl.${part.id}`, name: `${part.name} (STL)`, kind: "part", triangles: tris });
  }
  if (massBlocks) {
    let skipped = 0;
    for (const c of model.components) {
      if (c.id.startsWith("stl-")) continue;
      const R = rotationMatrix(c.orientation ?? { w: 1, x: 0, y: 0, z: 0 }) as unknown as number[];
      const at: [number, number, number] = [c.position.x, c.position.y, c.position.z];
      const spec = c.inertia;
      let local: number[] | null = null;
      switch (spec.kind) {
        case "box":
          local = boxTriangles(spec.size.x, spec.size.y, spec.size.z);
          break;
        case "cylinder":
          local = cylinderTriangles(spec.radius, spec.length, spec.axis === "x" ? 0 : spec.axis === "y" ? 1 : 2);
          break;
        case "tube":
          local = cylinderTriangles(spec.outerRadius, spec.length, spec.axis === "x" ? 0 : spec.axis === "y" ? 1 : 2);
          break;
        case "sphere":
          local = sphereTriangles(spec.radius);
          break;
        default:
          skipped++;
      }
      if (local !== null) bodies.push({ id: `masa.${c.id}`, name: `${c.name} (modelo de masas)`, kind: "block", triangles: transform(local, R, at) });
    }
    if (skipped > 0) notes.push(`${skipped} componente(s) del modelo de masas sin forma: no entran en el túnel.`);
    notes.push("Los bloques del modelo de masas entran como sólidos; desactívalo si ya están dibujados o importados.");
  }
  return { bodies, notes };
}
