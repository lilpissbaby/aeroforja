/**
 * Structural check of a drawing read from JSON (project file, browser
 * storage or the MCP bridge). Explains what is wrong instead of loading a
 * broken drawing.
 *
 * Accepts the current elements (plane, points {u, v}, offset) and the
 * planta-only elements of project files v2 (points {x, y}, z), which open
 * as planta elements.
 */
import { meters } from "@aeroforja/physics";
import { ROLES, type PlanePoint, type Planform, type PlanformElement, type PlanformRole } from "./model.ts";
import { PLANES, type PlaneId } from "./planes.ts";

export type PlanformParse =
  | { readonly ok: true; readonly planform: Planform }
  | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function point(v: unknown, legacy: boolean): PlanePoint | null {
  if (!isRecord(v)) return null;
  const u = legacy ? v["x"] : v["u"];
  const w = legacy ? v["y"] : v["v"];
  if (!isFiniteNumber(u) || !isFiniteNumber(w)) return null;
  return { u: meters(u), v: meters(w) };
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
    const { id, name, role, mirror, thickness, shape } = e;
    // Project files v2 had no plane: planta, with z as the offset.
    const legacy = e["plane"] === undefined;
    const plane = legacy ? "top" : e["plane"];
    const offset = legacy ? e["z"] : e["offset"];
    if (typeof id !== "string" || id === "" || typeof name !== "string") {
      return { ok: false, message: `${where}: faltan id o name` };
    }
    if (ids.has(id)) return { ok: false, message: `${where}: el id ${id} está repetido` };
    ids.add(id);
    if (typeof role !== "string" || !ROLES.includes(role as PlanformRole)) {
      return { ok: false, message: `${where}: tipo de elemento desconocido` };
    }
    if (typeof plane !== "string" || !PLANES.includes(plane as PlaneId)) {
      return { ok: false, message: `${where}: vista desconocida (top, side o front)` };
    }
    if (typeof mirror !== "boolean") return { ok: false, message: `${where}: falta mirror` };
    if (!isFiniteNumber(thickness) || thickness <= 0) {
      return { ok: false, message: `${where}: el espesor tiene que ser un número mayor que cero, en m` };
    }
    if (!isFiniteNumber(offset)) return { ok: false, message: `${where}: falta la posición del plano medio (offset) en m` };
    const common = {
      id,
      name,
      role: role as PlanformRole,
      plane: plane as PlaneId,
      mirror,
      thickness: meters(thickness),
      offset: meters(offset),
    };
    if (shape === "polygon") {
      const raw = e["points"];
      if (!Array.isArray(raw)) return { ok: false, message: `${where}: faltan los vértices` };
      const points: PlanePoint[] = [];
      for (const [i, v] of raw.entries()) {
        const p = point(v, legacy);
        if (p === null) return { ok: false, message: `${where}.points[${i}]: no es un punto {u, v} en m` };
        points.push(p);
      }
      elements.push({ ...common, shape: "polygon", points });
    } else if (shape === "circle") {
      const center = point(e["center"], legacy);
      const radius = e["radius"];
      if (center === null) return { ok: false, message: `${where}: falta el centro {u, v} en m` };
      if (!isFiniteNumber(radius) || radius <= 0) return { ok: false, message: `${where}: el radio tiene que ser mayor que cero` };
      elements.push({ ...common, shape: "circle", center, radius: meters(radius) });
    } else {
      return { ok: false, message: `${where}: forma desconocida` };
    }
  }
  return { ok: true, planform: { elements } };
}
