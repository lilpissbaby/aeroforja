/**
 * The project file: mass model, drawing and imported parts.
 *
 * Schema history (the specification asks for versioned JSON with
 * migrations):
 * - v1, kind "aeroforja.massModel": mass model only. Opens with an empty drawing.
 * - v2, kind "aeroforja.project": adds the drawing, planta only (points {x, y}, z).
 *   Opens with every element in the planta.
 * - v3: elements in planta, alzado or perfil (plane, points {u, v}, offset),
 *   and imported STL parts with their meshes embedded.
 */
import type { MassModel } from "@aeroforja/physics";
import { encodeMesh, parsePartsJson } from "../parts/file.ts";
import type { ImportedPart } from "../parts/model.ts";
import { parsePlanformJson } from "../planform/file.ts";
import { EMPTY_PLANFORM, type Planform } from "../planform/model.ts";
import { parseMassModelJson } from "./massModelFile.ts";

export const PROJECT_FILE_KIND = "aeroforja.project";
export const PROJECT_SCHEMA_VERSION = 3;

export interface ProjectFile {
  readonly kind: typeof PROJECT_FILE_KIND;
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly name: string;
  readonly model: MassModel;
  readonly planform: Planform;
  readonly parts: readonly ImportedPart[];
  /** base64 of each part's triangles, by mesh key. */
  readonly meshes: Readonly<Record<string, string>>;
}

export type ProjectParse =
  | {
      readonly ok: true;
      readonly name: string;
      readonly model: MassModel;
      readonly planform: Planform;
      readonly parts: ImportedPart[];
      readonly meshes: Map<string, Float32Array>;
    }
  | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseProjectJson(json: unknown, fallbackName: string): ProjectParse {
  if (isRecord(json) && json["kind"] === PROJECT_FILE_KIND) {
    const version = json["schemaVersion"];
    if (version !== 2 && version !== PROJECT_SCHEMA_VERSION) {
      return { ok: false, message: `Versión de proyecto ${String(version)} no soportada (se esperan 2 o ${PROJECT_SCHEMA_VERSION}).` };
    }
    const name = typeof json["name"] === "string" && json["name"].trim() !== "" ? json["name"] : fallbackName;
    const mass = parseMassModelJson(json["model"], name);
    if (!mass.ok) return mass;
    const planform = json["planform"] === undefined ? { ok: true as const, planform: EMPTY_PLANFORM } : parsePlanformJson(json["planform"]);
    if (!planform.ok) return planform;
    const parts = parsePartsJson(json["parts"], json["meshes"]);
    if (!parts.ok) return parts;
    return { ok: true, name, model: mass.model, planform: planform.planform, parts: parts.parts, meshes: parts.meshes };
  }
  // v1 file or a bare mass model: migrate with an empty drawing.
  const mass = parseMassModelJson(json, fallbackName);
  if (!mass.ok) return mass;
  return { ok: true, name: mass.name, model: mass.model, planform: EMPTY_PLANFORM, parts: [], meshes: new Map() };
}

export function toProjectFile(
  name: string,
  model: MassModel,
  planform: Planform,
  parts: readonly ImportedPart[] = [],
  meshes: ReadonlyMap<string, Float32Array> = new Map(),
): ProjectFile {
  const embedded: Record<string, string> = {};
  for (const part of parts) {
    const mesh = meshes.get(part.meshKey);
    if (mesh !== undefined) embedded[part.meshKey] = encodeMesh(mesh);
  }
  return { kind: PROJECT_FILE_KIND, schemaVersion: PROJECT_SCHEMA_VERSION, name, model, planform, parts, meshes: embedded };
}
