/**
 * Imported parts read from JSON. Meshes travel as base64 of the binary
 * float32 triangle array (9 numbers per triangle, file units) next to the
 * parts, keyed by their content hash.
 */
import { kilograms, kilogramsPerCubicMeter, meters, radians } from "@aeroforja/physics";
import { DRAG_SHAPE_IDS, type DragShapeId } from "./drag.ts";
import type { ImportedPart, PartMass } from "./model.ts";

export type PartsParse =
  | { readonly ok: true; readonly parts: ImportedPart[]; readonly meshes: Map<string, Float32Array> }
  | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const PROVENANCES = ["MEASURED", "CALCULATED", "ESTIMATED"] as const;

export function encodeMesh(triangles: Float32Array): string {
  const bytes = new Uint8Array(triangles.buffer, triangles.byteOffset, triangles.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeMesh(base64: string): Float32Array | null {
  try {
    const binary = atob(base64);
    if (binary.length % 36 !== 0) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  } catch {
    return null;
  }
}

function parseMass(v: unknown): PartMass | null {
  if (!isRecord(v)) return null;
  if (v["kind"] === "unknown") return { kind: "unknown" };
  if (v["kind"] === "weighed" && num(v["mass"]) && v["mass"] > 0) {
    const u = v["standardUncertainty"];
    return num(u) && u > 0
      ? { kind: "weighed", mass: kilograms(v["mass"]), standardUncertainty: kilograms(u) }
      : { kind: "weighed", mass: kilograms(v["mass"]) };
  }
  if (v["kind"] === "density" && num(v["density"]) && v["density"] > 0 && PROVENANCES.includes(v["provenance"] as never)) {
    return { kind: "density", density: kilogramsPerCubicMeter(v["density"]), provenance: v["provenance"] as (typeof PROVENANCES)[number] };
  }
  return null;
}

export function parsePartsJson(partsJson: unknown, meshesJson: unknown): PartsParse {
  if (partsJson === undefined) return { ok: true, parts: [], meshes: new Map() };
  if (!Array.isArray(partsJson)) return { ok: false, message: "parts tiene que ser una lista." };
  const parts: ImportedPart[] = [];
  const meshes = new Map<string, Float32Array>();
  const embedded = isRecord(meshesJson) ? meshesJson : {};
  for (const [i, p] of partsJson.entries()) {
    const where = `parts[${i}]`;
    if (!isRecord(p)) return { ok: false, message: `${where}: no es un objeto` };
    const { id, name, fileName, meshKey, triangleCount, unit, inMassModel, dragShape } = p;
    if (typeof id !== "string" || typeof name !== "string" || typeof fileName !== "string" || typeof meshKey !== "string") {
      return { ok: false, message: `${where}: faltan id, name, fileName o meshKey` };
    }
    if (!num(triangleCount) || !num(unit) || unit <= 0 || typeof inMassModel !== "boolean") {
      return { ok: false, message: `${where}: faltan triangleCount, unit o inMassModel` };
    }
    if (dragShape !== "none" && !DRAG_SHAPE_IDS.includes(dragShape as DragShapeId)) {
      return { ok: false, message: `${where}: forma de resistencia desconocida` };
    }
    const placement = p["placement"];
    if (!isRecord(placement) || !isRecord(placement["position"])) return { ok: false, message: `${where}: falta placement` };
    const pos = placement["position"];
    const { yaw, pitch, roll, scale } = placement;
    if (!num(pos["x"]) || !num(pos["y"]) || !num(pos["z"]) || !num(yaw) || !num(pitch) || !num(roll) || !num(scale) || scale <= 0) {
      return { ok: false, message: `${where}: posición, orientación o escala incorrectas` };
    }
    const mass = parseMass(p["mass"]);
    if (mass === null) return { ok: false, message: `${where}: la masa tiene que ser pesada (kg), por densidad (kg/m³) con su procedencia, o «unknown»` };
    const encoded = embedded[meshKey];
    if (typeof encoded === "string") {
      const mesh = decodeMesh(encoded);
      if (mesh === null) return { ok: false, message: `${where}: la malla ${meshKey} está dañada` };
      meshes.set(meshKey, mesh);
    }
    parts.push({
      id,
      name,
      fileName,
      meshKey,
      triangleCount,
      unit,
      inMassModel,
      dragShape: dragShape as DragShapeId | "none",
      mass,
      placement: {
        position: { x: meters(pos["x"]), y: meters(pos["y"]), z: meters(pos["z"]) },
        yaw: radians(yaw),
        pitch: radians(pitch),
        roll: radians(roll),
        scale,
      },
    });
  }
  return { ok: true, parts, meshes };
}
