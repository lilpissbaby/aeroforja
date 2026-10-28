/**
 * Structural check of a planform read from JSON (project file or browser
 * storage). Explains what is wrong instead of loading a broken drawing.
 */
import { meters } from "@aeroforja/physics";
import { ROLES, type PlanPoint, type Planform, type PlanformElement, type PlanformRole } from "./model.ts";

export type PlanformParse =
  | { readonly ok: true; readonly planform: Planform }
  | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function point(v: unknown): PlanPoint | null {
  if (!isRecord(v) || !isFiniteNumber(v["x"]) || !isFiniteNumber(v["y"])) return null;
  return { x: meters(v["x"]), y: meters(v["y"]) };
}

export function parsePlanformJson(json: unknown): PlanformParse {
  if (!isRecord(json) || !Array.isArray(json["elements"])) {
    return { ok: false, message: "La planta no tiene lista de elementos." };
  }
  const elements: PlanformElement[] = [];
  const ids = new Set<string>();
  for (const [index, e] of json["elements"].entries()) {
    const where = `planta.elements[${index}]`;
    if (!isRecord(e)) return { ok: false, message: `${where}: no es un objeto` };
    const { id, name, role, mirror, thickness, z, shape } = e;
    if (typeof id !== "string" || id === "" || typeof name !== "string") {
      return { ok: false, message: `${where}: faltan id o name` };
    }
    if (ids.has(id)) return { ok: false, message: `${where}: el id ${id} está repetido` };
    ids.add(id);
    if (typeof role !== "string" || !ROLES.includes(role as PlanformRole)) {
      return { ok: false, message: `${where}: tipo de elemento desconocido` };
    }
    if (typeof mirror !== "boolean") return { ok: false, message: `${where}: falta mirror` };
    if (!isFiniteNumber(thickness) || thickness <= 0) {
      return { ok: false, message: `${where}: el espesor tiene que ser un número mayor que cero, en m` };
    }
    if (!isFiniteNumber(z)) return { ok: false, message: `${where}: falta la altura z en m` };
    const common = { id, name, role: role as PlanformRole, mirror, thickness: meters(thickness), z: meters(z) };
    if (shape === "polygon") {
      const raw = e["points"];
      if (!Array.isArray(raw)) return { ok: false, message: `${where}: faltan los vértices` };
      const points: PlanPoint[] = [];
      for (const [i, v] of raw.entries()) {
        const p = point(v);
        if (p === null) return { ok: false, message: `${where}.points[${i}]: no es un punto {x, y} en m` };
        points.push(p);
      }
      elements.push({ ...common, shape: "polygon", points });
    } else if (shape === "circle") {
      const center = point(e["center"]);
      const radius = e["radius"];
      if (center === null) return { ok: false, message: `${where}: falta el centro {x, y} en m` };
      if (!isFiniteNumber(radius) || radius <= 0) return { ok: false, message: `${where}: el radio tiene que ser mayor que cero` };
      elements.push({ ...common, shape: "circle", center, radius: meters(radius) });
    } else {
      return { ok: false, message: `${where}: forma desconocida` };
    }
  }
  return { ok: true, planform: { elements } };
}
