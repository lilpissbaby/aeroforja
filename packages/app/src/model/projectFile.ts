/**
 * The project file: mass model plus planform drawing.
 *
 * Schema history (the specification asks for versioned JSON with
 * migrations):
 * - v1, kind "aeroforja.massModel": mass model only. Still read; it opens
 *   with an empty planform.
 * - v2, kind "aeroforja.project": adds the planform.
 */
import type { MassModel } from "@aeroforja/physics";
import { parsePlanformJson } from "../planform/file.ts";
import { EMPTY_PLANFORM, type Planform } from "../planform/model.ts";
import { parseMassModelJson } from "./massModelFile.ts";

export const PROJECT_FILE_KIND = "aeroforja.project";
export const PROJECT_SCHEMA_VERSION = 2;

export interface ProjectFile {
  readonly kind: typeof PROJECT_FILE_KIND;
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly name: string;
  readonly model: MassModel;
  readonly planform: Planform;
}

export type ProjectParse =
  | { readonly ok: true; readonly name: string; readonly model: MassModel; readonly planform: Planform }
  | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseProjectJson(json: unknown, fallbackName: string): ProjectParse {
  if (isRecord(json) && json["kind"] === PROJECT_FILE_KIND) {
    if (json["schemaVersion"] !== PROJECT_SCHEMA_VERSION) {
      return {
        ok: false,
        message: `Versión de proyecto ${String(json["schemaVersion"])} no soportada (se espera ${PROJECT_SCHEMA_VERSION}).`,
      };
    }
    const name = typeof json["name"] === "string" && json["name"].trim() !== "" ? json["name"] : fallbackName;
    const mass = parseMassModelJson(json["model"], name);
    if (!mass.ok) return mass;
    const planform = json["planform"] === undefined ? { ok: true as const, planform: EMPTY_PLANFORM } : parsePlanformJson(json["planform"]);
    if (!planform.ok) return planform;
    return { ok: true, name, model: mass.model, planform: planform.planform };
  }
  // v1 file or a bare mass model: migrate with an empty planform.
  const mass = parseMassModelJson(json, fallbackName);
  if (!mass.ok) return mass;
  return { ok: true, name: mass.name, model: mass.model, planform: EMPTY_PLANFORM };
}

export function toProjectFile(name: string, model: MassModel, planform: Planform): ProjectFile {
  return { kind: PROJECT_FILE_KIND, schemaVersion: PROJECT_SCHEMA_VERSION, name, model, planform };
}
