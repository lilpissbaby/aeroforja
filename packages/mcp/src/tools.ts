/**
 * The tools Claude uses to design with AeroForja. Inputs in millimetres,
 * grams and degrees; results with method, provenance and validity, as the
 * project rules ask. The physics is the same core the web app runs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
  atmosphere,
  bodyPosition,
  kilograms,
  massProperties,
  meters,
  quaternionFromEulerZYX,
  radians,
  tunnelSweep,
  type MassComponent,
  type Provenance,
  type Result,
} from "@aeroforja/physics";
import { analysePlanform } from "../../app/src/planform/geometry.ts";
import { DEFAULT_FRAME, DEFAULT_WING, frameElements, frameParamsProblems, wingElements, wingParamsProblems, type FrameParams, type WingParams } from "../../app/src/planform/templates.ts";
import { sweepAlphas, tunnelGeometry } from "../../app/src/tunnel/input.ts";
import { elementFromInput, elementToOutput, round, type ElementInput, type ProjectStore } from "./project.ts";
import { renderThreeViews } from "./render.ts";

export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" };
export interface ToolResult {
  readonly content: ToolContent[];
  readonly isError?: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: { readonly readOnlyHint?: boolean; readonly destructiveHint?: boolean; readonly idempotentHint?: boolean };
  run(args: Record<string, unknown>, store: ProjectStore, bridge: BridgeInfo): ToolResult | Promise<ToolResult>;
}

export interface BridgeInfo {
  readonly url: string | null;
  readonly browsers: () => number;
}

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
const json = (v: unknown): ToolResult => text(JSON.stringify(v, null, 2));
const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });

const DEG = Math.PI / 180;
const num = (v: unknown, name: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
  return v;
};
const opt = (v: unknown, fallback: number, name: string): number => (v === undefined ? fallback : num(v, name));

const POINT_2D = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } as const;

const ELEMENT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    role: { type: "string", enum: ["plate", "wing", "hole", "rotor"], description: "plate: flat sheet; wing: lifting surface (counts in the VLM tunnel when drawn in top or side); hole: cut-out of the sheets of its view; rotor: propeller disc (circle, top or front only)." },
    plane: { type: "string", enum: ["top", "side", "front"], description: "top = planta (u = x forward, v = y right); side = perfil (u = x forward, v = z DOWN); front = alzado (u = y right, v = z DOWN)." },
    shape: { type: "string", enum: ["polygon", "circle"] },
    points_mm: { type: "array", items: POINT_2D, minItems: 3, description: "Polygon vertices [u, v] in mm in the view's coordinates, in order (no closing repeat)." },
    center_mm: { ...POINT_2D, description: "Circle centre [u, v] in mm." },
    radius_mm: { type: "number", exclusiveMinimum: 0 },
    diameter_in: { type: "number", exclusiveMinimum: 0, description: "Propeller diameter in inches (instead of radius_mm)." },
    mirror: { type: "boolean", description: "Also build its mirror image about y = 0 (symmetric aircraft). In the side view it is the twin at −offset." },
    thickness_mm: { type: "number", exclusiveMinimum: 0, description: "Sheet thickness (default 3 mm)." },
    offset_mm: { type: "number", description: "Position of the sheet's mid-plane along the view's normal: z for top (+ down), y for side (+ right), x for front (+ forward). Rotors in top default to −20 mm (above the plates)." },
  },
  required: ["role", "plane", "shape"],
} as const;

/** Mass properties of the current mass model (imported parts' meshes live in the browser, not here). */
function massOf(store: ProjectStore) {
  return massProperties(store.project.model);
}

function resultMeta(r: Result<unknown>) {
  return {
    provenance: r.provenance,
    validity: r.validity.level,
    checks: r.validity.checks.filter((c) => c.level !== "green").map((c) => ({ quantity: c.quantity, value: c.value, level: c.level, note: c.note })),
    methods: r.methods.map((m) => m.name),
    assumptions: r.assumptions.map((a) => a.description),
  };
}

function summary(store: ProjectStore) {
  const p = store.project;
  const a = analysePlanform(p.planform);
  return {
    name: p.name,
    units: "mm for lengths, body axes FRD (x forward, y right, z down), origin = aircraft reference point",
    referencePoint: p.model.referencePoint,
    elements: p.planform.elements.map(elementToOutput),
    issues: a.issues.map((i) => ({ level: i.level, element: i.elementId, message: i.message })),
    geometry:
      a.box === null
        ? null
        : {
            span_mm: round((a.box.max[1] - a.box.min[1]) * 1000, 1),
            length_mm: round((a.box.max[0] - a.box.min[0]) * 1000, 1),
            height_mm: round((a.box.max[2] - a.box.min[2]) * 1000, 1),
            planformArea_cm2: round(a.projectedArea * 1e4, 1),
            frontalArea_cm2: round(a.frontalArea * 1e4, 1),
            wing: a.wing === null ? null : { area_cm2: round(a.wing.area * 1e4, 1), span_mm: round(a.wing.span * 1000, 1), aspectRatio: round(a.wing.aspectRatio, 3) },
            fins: a.vertical === null ? null : { count: a.vertical.count, area_cm2: round(a.vertical.area * 1e4, 1), height_mm: round(a.vertical.height * 1000, 1) },
            rotors: a.rotorSummary === null ? null : { count: a.rotorSummary.count, maxAxisDistance_mm: round(a.rotorSummary.maxAxisDistance * 1000, 1) },
          },
    massComponents: p.model.components.map((c) => ({
      id: c.id,
      name: c.name,
      mass_g: round(c.mass.value * 1000, 2),
      provenance: c.mass.provenance,
      position_mm: [c.position.x, c.position.y, c.position.z].map((v) => round(v * 1000, 1)),
      shape: c.inertia.kind,
    })),
    importedParts: p.parts.map((x) => ({ id: x.id, name: x.name, file: x.fileName, inMassModel: x.inMassModel })),
  };
}

interface MassInput {
  readonly id?: string;
  readonly name: string;
  readonly mass_g: number;
  readonly uncertainty_g?: number;
  readonly provenance: Provenance;
  readonly position_mm: readonly [number, number, number];
  readonly orientation_deg?: { readonly yaw?: number; readonly pitch?: number; readonly roll?: number };
  readonly shape:
    | { readonly kind: "point" }
    | { readonly kind: "box"; readonly size_mm: readonly [number, number, number] }
    | { readonly kind: "cylinder"; readonly radius_mm: number; readonly length_mm: number; readonly axis: "x" | "y" | "z" }
    | { readonly kind: "tube"; readonly outer_radius_mm: number; readonly inner_radius_mm: number; readonly length_mm: number; readonly axis: "x" | "y" | "z" }
    | { readonly kind: "sphere"; readonly radius_mm: number };
}

function massComponent(input: MassInput, taken: Set<string>): MassComponent {
  if (!(input.mass_g > 0)) throw new Error(`${input.name}: mass_g must be positive`);
  if (!["MEASURED", "CALCULATED", "ESTIMATED"].includes(input.provenance)) throw new Error(`${input.name}: provenance must be MEASURED, CALCULATED or ESTIMATED`);
  const base = (input.id ?? input.name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pieza";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  const m = (v: number) => meters(v / 1000);
  const s = input.shape;
  const inertia =
    s.kind === "box"
      ? { kind: "box" as const, size: { x: m(s.size_mm[0]), y: m(s.size_mm[1]), z: m(s.size_mm[2]) } }
      : s.kind === "cylinder"
        ? { kind: "cylinder" as const, radius: m(s.radius_mm), length: m(s.length_mm), axis: s.axis }
        : s.kind === "tube"
          ? { kind: "tube" as const, outerRadius: m(s.outer_radius_mm), innerRadius: m(s.inner_radius_mm), length: m(s.length_mm), axis: s.axis }
          : s.kind === "sphere"
            ? { kind: "sphere" as const, radius: m(s.radius_mm) }
            : { kind: "point" as const };
  const o = input.orientation_deg;
  return {
    id,
    name: input.name,
    mass: {
      value: kilograms(input.mass_g / 1000),
      provenance: input.provenance,
      ...(input.uncertainty_g !== undefined ? { standardUncertainty: kilograms(input.uncertainty_g / 1000) } : {}),
    },
    position: bodyPosition(input.position_mm[0] / 1000, input.position_mm[1] / 1000, input.position_mm[2] / 1000),
    ...(o !== undefined ? { orientation: quaternionFromEulerZYX({ yaw: radians((o.yaw ?? 0) * DEG), pitch: radians((o.pitch ?? 0) * DEG), roll: radians((o.roll ?? 0) * DEG) }) } : {}),
    inertia,
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "get_design",
    title: "Leer el diseño",
    description:
      "Returns the current AeroForja design: every drawing element (in mm, in its view's coordinates), the issues found, the main dimensions, the mass-model components and the imported STL parts. Call it first, and whenever the user may have edited the design in the browser.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (_a, store) => json(summary(store)),
  },
  {
    name: "set_design_name",
    title: "Nombrar el diseño",
    description: "Renames the project.",
    inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"] },
    run: (a, store) => {
      const name = String(a["name"] ?? "").trim();
      if (name === "") return fail("name must not be empty");
      store.update((p) => ({ ...p, name }));
      return text(`Renamed to «${name}».`);
    },
  },
  {
    name: "add_elements",
    title: "Dibujar elementos",
    description:
      "Adds flat elements to the three-view drawing. Each element lives in one view (top = planta, side = perfil, front = alzado) and is extruded along that view's normal by its thickness, centred on offset_mm. Use mirror: true for symmetric parts (draw only the right half, y ≥ 0, for top and front; for side, the twin goes to −offset). Wings drawn in top (horizontal) and side (fins) are lifting surfaces for the wind tunnel; plates only add drag. Coordinates in mm: top [x forward, y right]; side [x forward, z down]; front [y right, z down]. Returns the new ids and any problems.",
    inputSchema: { type: "object", properties: { elements: { type: "array", items: ELEMENT_SCHEMA, minItems: 1 } }, required: ["elements"] },
    run: (a, store) => {
      const list = a["elements"];
      if (!Array.isArray(list) || list.length === 0) return fail("elements must be a non-empty array");
      let planform = store.project.planform;
      const added: string[] = [];
      for (const [i, raw] of list.entries()) {
        try {
          const e = elementFromInput(raw as ElementInput, planform);
          planform = { elements: [...planform.elements, e] };
          added.push(e.id);
        } catch (error) {
          return fail(`elements[${i}]: ${(error as Error).message}. Nothing was added.`);
        }
      }
      store.update((p) => ({ ...p, planform }));
      const issues = analysePlanform(planform).issues.filter((x) => x.elementId === undefined || added.includes(x.elementId));
      return json({ added, issues: issues.map((x) => ({ level: x.level, element: x.elementId, message: x.message })) });
    },
  },
  {
    name: "update_element",
    title: "Cambiar un elemento",
    description: "Replaces the given fields of one element (same field names and units as add_elements; points_mm replaces all vertices). The element keeps its id.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, changes: { type: "object", properties: ELEMENT_SCHEMA.properties } }, required: ["id", "changes"] },
    run: (a, store) => {
      const id = String(a["id"]);
      const current = store.project.planform.elements.find((e) => e.id === id);
      if (current === undefined) return fail(`No element ${id}. Call get_design for the ids.`);
      const before = elementToOutput(current) as Record<string, unknown>;
      const merged = { ...before, ...(a["changes"] as Record<string, unknown>) } as unknown as ElementInput & { shape: "polygon" | "circle" };
      if (merged.shape === "circle") delete (merged as { points_mm?: unknown }).points_mm;
      try {
        const others = { elements: store.project.planform.elements.filter((e) => e.id !== id) };
        const rebuilt = { ...elementFromInput(merged, others), id };
        store.update((p) => ({ ...p, planform: { elements: p.planform.elements.map((e) => (e.id === id ? rebuilt : e)) } }));
        return json({ updated: elementToOutput(rebuilt) });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "remove_elements",
    title: "Borrar elementos",
    description: "Removes drawing elements by id. Use clear: true to empty the whole drawing.",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, clear: { type: "boolean" } } },
    annotations: { destructiveHint: true },
    run: (a, store) => {
      if (a["clear"] === true) {
        store.update((p) => ({ ...p, planform: { elements: [] } }));
        return text("Drawing cleared (the browser can undo it with Ctrl+Z).");
      }
      const ids = new Set(Array.isArray(a["ids"]) ? a["ids"].map(String) : []);
      const missing = [...ids].filter((id) => !store.project.planform.elements.some((e) => e.id === id));
      store.update((p) => ({ ...p, planform: { elements: p.planform.elements.filter((e) => !ids.has(e.id)) } }));
      return text(`Removed ${ids.size - missing.length} element(s).${missing.length > 0 ? ` Not found: ${missing.join(", ")}.` : ""}`);
    },
  },
  {
    name: "apply_template",
    title: "Plantilla",
    description:
      "Builds a parametric starting point. multirotor: arms (3, 4, 6, 8), layout (x | plus), motor_circle_mm (diagonal motor-to-motor), arm_width_mm, plate_mm, mount_diameter_mm, prop_in, prop_height_mm, thickness_mm. wing: span_mm, root_chord_mm, tip_chord_mm, sweep_deg (leading edge), root_le_x_mm, thickness_mm, z_mm, fin_height_mm (tip fins in the side view, 0 for none). replace: true starts from an empty drawing.",
    inputSchema: {
      type: "object",
      properties: { template: { type: "string", enum: ["multirotor", "wing"] }, replace: { type: "boolean" }, params: { type: "object" } },
      required: ["template"],
    },
    run: (a, store) => {
      const params = (a["params"] ?? {}) as Record<string, unknown>;
      const replace = a["replace"] === true;
      const base = replace ? { elements: [] } : store.project.planform;
      try {
        let added;
        if (a["template"] === "multirotor") {
          const arms = opt(params["arms"], DEFAULT_FRAME.arms, "arms");
          if (![3, 4, 6, 8].includes(arms)) return fail("arms must be 3, 4, 6 or 8");
          const f: FrameParams = {
            arms: arms as FrameParams["arms"],
            layout: params["layout"] === "plus" ? "plus" : "x",
            motorCircle: opt(params["motor_circle_mm"], DEFAULT_FRAME.motorCircle * 1000, "motor_circle_mm") / 1000,
            armWidth: opt(params["arm_width_mm"], DEFAULT_FRAME.armWidth * 1000, "arm_width_mm") / 1000,
            plateSize: opt(params["plate_mm"], DEFAULT_FRAME.plateSize * 1000, "plate_mm") / 1000,
            mountDiameter: opt(params["mount_diameter_mm"], DEFAULT_FRAME.mountDiameter * 1000, "mount_diameter_mm") / 1000,
            propDiameter: (opt(params["prop_in"], DEFAULT_FRAME.propDiameter / 0.0254, "prop_in") * 25.4) / 1000,
            propHeight: opt(params["prop_height_mm"], DEFAULT_FRAME.propHeight * 1000, "prop_height_mm") / 1000,
            thickness: opt(params["thickness_mm"], DEFAULT_FRAME.thickness * 1000, "thickness_mm") / 1000,
          };
          const problems = frameParamsProblems(f);
          if (problems.length > 0) return fail(problems.join(" "));
          added = frameElements(f, base);
        } else if (a["template"] === "wing") {
          const w: WingParams = {
            span: opt(params["span_mm"], DEFAULT_WING.span * 1000, "span_mm") / 1000,
            rootChord: opt(params["root_chord_mm"], DEFAULT_WING.rootChord * 1000, "root_chord_mm") / 1000,
            tipChord: opt(params["tip_chord_mm"], DEFAULT_WING.tipChord * 1000, "tip_chord_mm") / 1000,
            sweep: opt(params["sweep_deg"], DEFAULT_WING.sweep / DEG, "sweep_deg") * DEG,
            rootLeadingEdgeX: opt(params["root_le_x_mm"], DEFAULT_WING.rootLeadingEdgeX * 1000, "root_le_x_mm") / 1000,
            thickness: opt(params["thickness_mm"], DEFAULT_WING.thickness * 1000, "thickness_mm") / 1000,
            z: opt(params["z_mm"], 0, "z_mm") / 1000,
            finHeight: opt(params["fin_height_mm"], DEFAULT_WING.finHeight * 1000, "fin_height_mm") / 1000,
          };
          const problems = wingParamsProblems(w);
          if (problems.length > 0) return fail(problems.join(" "));
          added = wingElements(w, base);
        } else return fail("template must be multirotor or wing");
        store.update((p) => ({ ...p, planform: { elements: [...base.elements, ...added] } }));
        return json({ added: added.map((e) => e.id) });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "set_mass_components",
    title: "Modelo de masas",
    description:
      "Adds (or with replace: true, replaces) components of the mass model: motors, battery, flight controller, camera... Each has mass_g, provenance (MEASURED if the user weighed it, ESTIMATED for datasheet or guessed values — never present a guess as measured), position_mm [x, y, z] of its own centre of mass in body axes FRD, optional orientation_deg {yaw, pitch, roll} and a shape for its inertia: point | box {size_mm [x,y,z]} | cylinder {radius_mm, length_mm, axis} | tube {outer_radius_mm, inner_radius_mm, length_mm, axis} | sphere {radius_mm}. Ask the user for real masses before estimating them.",
    inputSchema: {
      type: "object",
      properties: {
        replace: { type: "boolean" },
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              mass_g: { type: "number", exclusiveMinimum: 0 },
              uncertainty_g: { type: "number", minimum: 0 },
              provenance: { type: "string", enum: ["MEASURED", "CALCULATED", "ESTIMATED"] },
              position_mm: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
              orientation_deg: { type: "object", properties: { yaw: { type: "number" }, pitch: { type: "number" }, roll: { type: "number" } } },
              shape: { type: "object", properties: { kind: { type: "string", enum: ["point", "box", "cylinder", "tube", "sphere"] } }, required: ["kind"] },
            },
            required: ["name", "mass_g", "provenance", "position_mm", "shape"],
          },
          minItems: 1,
        },
      },
      required: ["components"],
    },
    run: (a, store) => {
      const list = a["components"];
      if (!Array.isArray(list) || list.length === 0) return fail("components must be a non-empty array");
      const keep = a["replace"] === true ? [] : store.project.model.components;
      const taken = new Set(keep.map((c) => c.id));
      try {
        const added = list.map((c) => massComponent(c as MassInput, taken));
        const model = { ...store.project.model, components: [...keep, ...added] };
        const check = massProperties(model);
        store.update((p) => ({ ...p, model }));
        const v = check.value;
        return json({
          added: added.map((c) => c.id),
          totalMass_g: round(v.mass.value * 1000, 2),
          cg_mm: [v.centerOfGravity.value.x, v.centerOfGravity.value.y, v.centerOfGravity.value.z].map((x) => round(x * 1000, 1)),
          ...resultMeta(check),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "analyse",
    title: "Analizar",
    description: "Geometry of the drawing and mass properties of the mass model (total mass, centre of gravity, inertia tensor about the CG), with method, provenance and validity.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (_a, store) => {
      try {
        const m = massOf(store);
        const v = m.value;
        const I = v.inertia.value;
        return json({
          ...summary(store),
          mass: {
            total_g: round(v.mass.value * 1000, 2),
            massProvenance: v.mass.provenance,
            cg_mm: [v.centerOfGravity.value.x, v.centerOfGravity.value.y, v.centerOfGravity.value.z].map((x) => round(x * 1000, 2)),
            inertia_kg_m2_about_cg: { Ixx: I.Ixx, Iyy: I.Iyy, Izz: I.Izz, Ixy: I.Ixy, Ixz: I.Ixz, Iyz: I.Iyz, note: "products of inertia with the positive definition, ∫xy dm" },
            ...resultMeta(m),
          },
          note:
            store.project.parts.length > 0
              ? "Imported STL parts are counted in the mass model by the browser app (their meshes live there); open the app to see their effect."
              : undefined,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "render_views",
    title: "Ver las tres vistas",
    description:
      "Renders the planta, perfil and alzado at one common scale as a PNG, with a panel of key numbers. Use it after every change to check the drawing against what the user described or against their reference image, and fix proportions before analysing.",
    inputSchema: { type: "object", properties: { width_px: { type: "number", minimum: 600, maximum: 2400 } } },
    annotations: { readOnlyHint: true },
    run: (a, store) => {
      const png = renderThreeViews(store.project, a["width_px"] === undefined ? {} : { width: num(a["width_px"], "width_px") });
      return {
        content: [
          { type: "image", data: png.toString("base64"), mimeType: "image/png" },
          { type: "text", text: "Top left: planta (nose up). Top right: perfil (nose right, z down). Bottom left: alzado (seen from the front: the right wing is on the viewer's left). Dashed: elements drawn in another view." },
        ],
      };
    },
  },
  {
    name: "run_tunnel",
    title: "Túnel de viento",
    description:
      "Virtual wind tunnel (mini-design 004): angle-of-attack sweep with the vortex-lattice method for lift and moments (CALCULATED), Trefftz-plane induced drag and component build-up parasite drag (ESTIMATED), neutral point and static margin about the current CG. Results beyond |α| = 5° are amber and beyond 10° red (flat-plate stall is not modelled). Report provenance and validity to the user; never present the drag as measured.",
    inputSchema: {
      type: "object",
      properties: {
        speed_ms: { type: "number", exclusiveMinimum: 0, description: "Default 15 m/s." },
        alpha_min_deg: { type: "number" },
        alpha_max_deg: { type: "number" },
        alpha_step_deg: { type: "number", exclusiveMinimum: 0 },
        altitude_m: { type: "number", description: "ISA altitude, default 0." },
        mass_blocks: { type: "boolean", description: "Count the mass-model blocks as bluff bodies (default true)." },
      },
    },
    annotations: { readOnlyHint: true },
    run: (a, store) => {
      try {
        const p = store.project;
        const settings = {
          speed: opt(a["speed_ms"], 15, "speed_ms"),
          alphaMin: opt(a["alpha_min_deg"], -4, "alpha_min_deg"),
          alphaMax: opt(a["alpha_max_deg"], 14, "alpha_max_deg"),
          alphaStep: opt(a["alpha_step_deg"], 1, "alpha_step_deg"),
          spanwiseStrips: 24,
          chordwisePanels: 6,
          interference: 1,
          massBlocks: a["mass_blocks"] !== false,
        };
        const analysis = analysePlanform(p.planform);
        const g = tunnelGeometry(p.planform, analysis, p.model, [], settings.massBlocks);
        const mass = massOf(store).value;
        const air = atmosphere({ altitude: { kind: "geometric", value: meters(opt(a["altitude_m"], 0, "altitude_m")) } }).value;
        const r = tunnelSweep({
          surfaces: g.surfaces,
          friction: g.friction,
          bluff: g.bluff,
          cg: [mass.centerOfGravity.value.x, mass.centerOfGravity.value.y, mass.centerOfGravity.value.z],
          speed: settings.speed,
          alphas: sweepAlphas(settings),
          air: { density: air.density, kinematicViscosity: air.kinematicViscosity, speedOfSound: air.speedOfSound },
          interference: settings.interference,
        });
        const v = r.value;
        const s = v.summary;
        return json({
          reference: v.reference === null ? null : { area_cm2: round(v.reference.area * 1e4, 1), span_mm: round(v.reference.span * 1000, 1), aspectRatio: round(v.reference.aspectRatio, 3), mac_mm: round(v.reference.mac * 1000, 1) },
          summary:
            s === null
              ? null
              : {
                  CLalpha_per_rad: round(s.CLalpha, 4),
                  CL0: round(s.CL0, 5),
                  CD0: round(s.CD0, 5),
                  CD0_band: [round(s.CD0Low, 5), round(s.CD0High, 5)],
                  oswald_e: round(s.oswald, 4),
                  maxLD: round(s.maxLD, 2),
                  alphaMaxLD_deg: round(s.alphaMaxLD / DEG, 1),
                  neutralPoint_x_mm: round(s.neutralPointX * 1000, 1),
                  staticMargin_percentMAC: round(s.staticMargin * 100, 2),
                  verdict: s.staticMargin > 0.05 ? "stable in pitch" : s.staticMargin > 0 ? "stable with little margin" : "UNSTABLE in pitch: CG behind the neutral point",
                },
          dragArea_cm2: round(v.dragArea * 1e4, 2),
          points: v.points.map((pt) => ({
            alpha_deg: round(pt.alpha / DEG, 2),
            validity: pt.level,
            CL: pt.CL === null ? null : round(pt.CL, 4),
            CD: pt.CD === null ? null : round(pt.CD, 5),
            Cm: pt.Cm === null ? null : round(pt.Cm, 5),
            LD: pt.LD === null ? null : round(pt.LD, 2),
            lift_N: round(pt.lift, 3),
            drag_N: round(pt.drag, 4),
          })),
          largestDragComponents: [...v.components].sort((x, y) => y.dragArea - x.dragArea).slice(0, 6).map((c) => ({ name: c.name, dragArea_cm2: round(c.dragArea * 1e4, 2) })),
          ...resultMeta(r),
          provenance: { lift: "CALCULATED", drag: "ESTIMATED", whole: r.provenance },
          notes: [...g.notes, ...v.notes],
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "save_project",
    title: "Guardar proyecto",
    description: "Writes the project as an .aeroforja.json file the web app opens («Abrir JSON»). Give an absolute path on this computer.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    run: (a, store) => {
      const path = String(a["path"]);
      writeFileSync(path, JSON.stringify(store.toFile(), null, 2));
      return text(`Saved ${path}.`);
    },
  },
  {
    name: "open_project",
    title: "Abrir proyecto",
    description: "Loads an .aeroforja.json project file (from the web app or save_project). Replaces the current design.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    annotations: { destructiveHint: true },
    run: (a, store) => {
      const path = String(a["path"]);
      try {
        const message = store.open(JSON.parse(readFileSync(path, "utf8")), basename(path).replace(/(\.aeroforja)?\.json$/i, ""));
        return message === null ? json(summary(store)) : fail(message);
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  },
  {
    name: "app_status",
    title: "Estado de la app",
    description: "Whether the AeroForja web app is connected to this server (it mirrors every change live) and where the project file is.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (_a, store, bridge) =>
      json({
        bridge: bridge.url,
        browsersConnected: bridge.browsers(),
        revision: store.revision,
        hint: bridge.browsers() === 0 ? "Open the AeroForja app on this computer (pnpm dev, or the Docker image) and it connects by itself." : "Changes appear in the app as you make them.",
      }),
  },
];

export const INSTRUCTIONS = `AeroForja is a drone design workbench with published physics. You edit the same project the user sees in the web app.

Conventions: body axes FRD (x forward, y right, z DOWN), origin at the aircraft reference point, lengths in mm in tool inputs. The drawing has three views: top (planta: [x, y]), side (perfil: [x, z]) and front (alzado: [y, z]). Each element is a flat sheet in one view, extruded by its thickness around offset_mm along that view's normal. Symmetric aircraft: draw the right half with mirror: true.

Workflow: get_design → apply_template or add_elements → render_views and compare with what the user described or with their reference image (proportions, positions) → fix → set_mass_components with the user's real masses (ask; mark guesses as ESTIMATED) → analyse → run_tunnel → explain results with their provenance (MEASURED, CALCULATED, ESTIMATED) and validity (green/amber/red). Never invent coefficients or present estimates as measured. If the user's design is unstable, unsafe or physically unworkable, say so.`;
