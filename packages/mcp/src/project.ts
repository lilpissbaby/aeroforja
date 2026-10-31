/**
 * The design Claude works on: the same project the web app edits (schema
 * v3: three-view drawing, imported parts, mass model), kept in memory, saved
 * to a file after every change and mirrored to the browser through the
 * local bridge (bridge.ts).
 *
 * Tools speak millimetres, grams and degrees, which is how people describe a
 * drone; everything is converted to SI (m, kg, rad) here, before it reaches
 * the shared code.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { meters, type MassModel } from "@aeroforja/physics";
import exampleJson from "../../../examples/mass-model.example.json" with { type: "json" };
import { parseMassModelJson } from "../../app/src/model/massModelFile.ts";
import { parseProjectJson, toProjectFile, type ProjectFile } from "../../app/src/model/projectFile.ts";
import type { ImportedPart } from "../../app/src/parts/model.ts";
import {
  DEFAULT_THICKNESS,
  ROLES,
  defaultOffset,
  planePoint,
  uniqueElementId,
  type PlanformElement,
  type Planform,
  type PlanformRole,
} from "../../app/src/planform/model.ts";
import { PLANES, type PlaneId } from "../../app/src/planform/planes.ts";

export interface Project {
  readonly name: string;
  readonly model: MassModel;
  readonly planform: Planform;
  readonly parts: readonly ImportedPart[];
}

export const PROJECT_PATH = process.env["AEROFORJA_PROJECT"] ?? join(homedir(), ".aeroforja", "claude-desktop.aeroforja.json");

function exampleModel(): MassModel {
  const parsed = parseMassModelJson(exampleJson, "Cuerpo de ejemplo (sintético)");
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.model;
}

type Listener = (project: Project, version: number, origin: "claude" | "browser") => void;

/** The single project of this server, with a version that grows on every change. */
export class ProjectStore {
  private current: Project;
  private version = 0;
  private readonly listeners = new Set<Listener>();
  private readonly path: string | null;

  constructor(path: string | null = PROJECT_PATH) {
    this.path = path;
    this.current = this.load() ?? { name: "Diseño con Claude", model: exampleModel(), planform: { elements: [] }, parts: [] };
  }

  get project(): Project {
    return this.current;
  }

  get revision(): number {
    return this.version;
  }

  private load(): Project | null {
    if (this.path === null) return null;
    try {
      const parsed = parseProjectJson(JSON.parse(readFileSync(this.path, "utf8")), "Diseño con Claude");
      return parsed.ok ? { name: parsed.name, model: parsed.model, planform: parsed.planform, parts: parsed.parts } : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    if (this.path === null) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.toFile(), null, 2));
    } catch {
      // A read-only home: the session keeps working in memory.
    }
  }

  toFile(): ProjectFile {
    return toProjectFile(this.current.name, this.current.model, this.current.planform, this.current.parts);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the project. `origin` says who changed it so the bridge does not echo the browser's own edits back. */
  set(next: Project, origin: "claude" | "browser" = "claude"): number {
    this.current = next;
    this.version++;
    this.save();
    for (const l of this.listeners) l(next, this.version, origin);
    return this.version;
  }

  update(change: (p: Project) => Project): number {
    return this.set(change(this.current));
  }

  /** Opens a project file written by the app or by this server. */
  open(json: unknown, fallbackName: string): string | null {
    const parsed = parseProjectJson(json, fallbackName);
    if (!parsed.ok) return parsed.message;
    this.set({ name: parsed.name, model: parsed.model, planform: parsed.planform, parts: parsed.parts });
    return null;
  }
}

// ---------- element input in millimetres ----------

export interface ElementInput {
  readonly name?: string;
  readonly role: PlanformRole;
  readonly plane: PlaneId;
  readonly shape: "polygon" | "circle";
  /** Polygon vertices [u, v] in mm in the view's coordinates. */
  readonly points_mm?: readonly (readonly [number, number])[];
  readonly center_mm?: readonly [number, number];
  readonly radius_mm?: number;
  readonly diameter_in?: number;
  readonly mirror?: boolean;
  readonly thickness_mm?: number;
  /** Mid-plane position along the view's normal, mm: z (planta), y (perfil), x (alzado). */
  readonly offset_mm?: number;
}

const ID_BASE: Readonly<Record<PlanformRole, string>> = { plate: "placa", wing: "ala", hole: "vaciado", rotor: "helice" };
const ROLE_NAME: Readonly<Record<PlanformRole, string>> = { plate: "Placa", wing: "Ala", hole: "Vaciado", rotor: "Hélice" };
const mm = (v: number) => meters(Math.round(v * 1000) / 1e6);

/** Builds a drawing element from tool input; throws with a message Claude can act on. */
export function elementFromInput(input: ElementInput, existing: Planform): PlanformElement {
  if (!ROLES.includes(input.role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
  if (!PLANES.includes(input.plane)) throw new Error(`plane must be one of ${PLANES.join(", ")} (top = planta, side = perfil, front = alzado)`);
  const thickness = input.thickness_mm ?? DEFAULT_THICKNESS * 1000;
  if (!(thickness > 0)) throw new Error("thickness_mm must be positive");
  const common = {
    id: uniqueElementId(existing, ID_BASE[input.role]),
    name: input.name ?? `${ROLE_NAME[input.role]} ${existing.elements.filter((e) => e.role === input.role).length + 1}`,
    role: input.role,
    plane: input.plane,
    mirror: input.mirror ?? false,
    thickness: mm(thickness),
    offset: input.offset_mm === undefined ? defaultOffset(input.role, input.plane) : mm(input.offset_mm),
  };
  if (input.shape === "circle") {
    const c = input.center_mm;
    const radius = input.radius_mm ?? (input.diameter_in === undefined ? undefined : (input.diameter_in * 25.4) / 2);
    if (c === undefined || radius === undefined || !(radius > 0)) throw new Error("a circle needs center_mm [u, v] and radius_mm (or diameter_in for a propeller)");
    return { ...common, shape: "circle", center: planePoint(c[0] / 1000, c[1] / 1000), radius: mm(radius) };
  }
  if (input.role === "rotor") throw new Error("a rotor (propeller disc) must be a circle");
  const pts = input.points_mm;
  if (pts === undefined || pts.length < 3) throw new Error("a polygon needs at least 3 points_mm [[u, v], ...]");
  return { ...common, shape: "polygon", points: pts.map(([u, v]) => planePoint(u / 1000, v / 1000)) };
}

/** An element as Claude reads it: millimetres, view coordinates. */
export function elementToOutput(e: PlanformElement) {
  const base = {
    id: e.id,
    name: e.name,
    role: e.role,
    plane: e.plane,
    shape: e.shape,
    mirror: e.mirror,
    thickness_mm: round(e.thickness * 1000),
    offset_mm: round(e.offset * 1000),
  };
  return e.shape === "polygon"
    ? { ...base, points_mm: e.points.map((p) => [round(p.u * 1000), round(p.v * 1000)]) }
    : { ...base, center_mm: [round(e.center.u * 1000), round(e.center.v * 1000)], radius_mm: round(e.radius * 1000) };
}

export const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;
