/**
 * Reading and writing mass models as JSON files.
 *
 * The file format wraps the MassModel of the physics core with a schema
 * version so later formats can migrate old files. A bare MassModel (as in
 * examples/mass-model.example.json) is also accepted.
 */
import type { MassModel } from "@aeroforja/physics";

export const MASS_MODEL_FILE_KIND = "aeroforja.massModel";
export const MASS_MODEL_SCHEMA_VERSION = 1;

export interface MassModelFile {
  readonly kind: typeof MASS_MODEL_FILE_KIND;
  readonly schemaVersion: number;
  readonly name: string;
  readonly model: MassModel;
}

export type ParseOutcome =
  | { readonly ok: true; readonly name: string; readonly model: MassModel }
  | { readonly ok: false; readonly message: string };

const INERTIA_KINDS = new Set(["point", "box", "cylinder", "tube", "sphere", "given"]);
const PROVENANCES = new Set(["MEASURED", "CALCULATED", "ESTIMATED"]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function checkVector(v: unknown, where: string): string | null {
  if (!isRecord(v)) return `${where}: falta el vector`;
  if (v["frame"] !== "FRD") return `${where}: debe estar en ejes cuerpo FRD`;
  for (const axis of ["x", "y", "z"]) {
    if (!isFiniteNumber(v[axis])) return `${where}.${axis}: no es un número`;
  }
  return null;
}

/**
 * Structural check only: shapes and types. Physical consistency (positive
 * masses, valid tensors...) is checked by the physics core, which explains
 * its own errors.
 */
export function parseMassModelJson(json: unknown, fallbackName: string): ParseOutcome {
  let name = fallbackName;
  let candidate: unknown = json;
  if (isRecord(json) && json["kind"] === MASS_MODEL_FILE_KIND) {
    if (json["schemaVersion"] !== MASS_MODEL_SCHEMA_VERSION) {
      return {
        ok: false,
        message: `Versión de archivo ${String(json["schemaVersion"])} no soportada (se espera ${MASS_MODEL_SCHEMA_VERSION}).`,
      };
    }
    if (typeof json["name"] === "string" && json["name"].trim() !== "") name = json["name"];
    candidate = json["model"];
  }
  if (!isRecord(candidate)) return { ok: false, message: "El archivo no contiene un modelo de masas." };
  if (typeof candidate["referencePoint"] !== "string") {
    return { ok: false, message: "Falta referencePoint: el origen de los ejes cuerpo." };
  }
  const components = candidate["components"];
  if (!Array.isArray(components) || components.length === 0) {
    return { ok: false, message: "El modelo necesita al menos un componente." };
  }
  for (const [index, c] of components.entries()) {
    const where = `components[${index}]`;
    if (!isRecord(c)) return { ok: false, message: `${where}: no es un objeto` };
    if (typeof c["id"] !== "string" || typeof c["name"] !== "string") {
      return { ok: false, message: `${where}: faltan id o name` };
    }
    const mass = c["mass"];
    if (!isRecord(mass) || !isFiniteNumber(mass["value"]) || !PROVENANCES.has(String(mass["provenance"]))) {
      return { ok: false, message: `${where}.mass: falta el valor en kg o la procedencia` };
    }
    const positionError = checkVector(c["position"], `${where}.position`);
    if (positionError !== null) return { ok: false, message: positionError };
    if (c["positionUncertainty"] !== undefined) {
      const uError = checkVector(c["positionUncertainty"], `${where}.positionUncertainty`);
      if (uError !== null) return { ok: false, message: uError };
    }
    const inertia = c["inertia"];
    if (!isRecord(inertia) || !INERTIA_KINDS.has(String(inertia["kind"]))) {
      return { ok: false, message: `${where}.inertia: tipo de forma desconocido` };
    }
  }
  return { ok: true, name, model: candidate as unknown as MassModel };
}

export function toMassModelFile(name: string, model: MassModel): MassModelFile {
  return { kind: MASS_MODEL_FILE_KIND, schemaVersion: MASS_MODEL_SCHEMA_VERSION, name, model };
}
