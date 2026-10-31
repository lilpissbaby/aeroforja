import { describe, expect, it } from "vitest";
import { meters } from "@aeroforja/physics";
import example from "../../../examples/mass-model.example.json";
import { fromBody, localToBody, toBody } from "../src/planform/planes.ts";
import {
  analysePlanform,
  projectToView,
  centroid,
  circleRing,
  circleSegments,
  CIRCLE_CHORD_TOLERANCE,
  elementAtPoint,
  perimeter,
  ringArea,
  selfIntersects,
  signedArea,
  type Ring,
} from "../src/planform/geometry.ts";
import { layerGeometries, meshVolume, triangles } from "../src/planform/mesh.ts";
import { binaryStl, planformSvg, stlTriangles } from "../src/planform/export.ts";
import { parsePlanformJson } from "../src/planform/file.ts";
import { planePoint, type Planform, type PlanformElement } from "../src/planform/model.ts";
import { DEFAULT_FRAME, DEFAULT_WING, WING_PRESETS, armAngles, frameElements, wingElement, wingElements } from "../src/planform/templates.ts";
import { parseProjectJson, toProjectFile } from "../src/model/projectFile.ts";
import { parseMassModelJson } from "../src/model/massModelFile.ts";

const square = (side: number): Ring => [
  [-side / 2, -side / 2],
  [side / 2, -side / 2],
  [side / 2, side / 2],
  [-side / 2, side / 2],
];

const plate = (id: string, points: [number, number][], extra: Partial<PlanformElement> = {}): PlanformElement =>
  ({
    id,
    name: id,
    role: "plate",
    shape: "polygon",
    plane: "top",
    mirror: false,
    thickness: meters(0.003),
    offset: meters(0),
    points: points.map(([x, y]) => planePoint(x, y)),
    ...extra,
  }) as PlanformElement;

const circle = (id: string, x: number, y: number, r: number, extra: Partial<PlanformElement> = {}): PlanformElement =>
  ({
    id,
    name: id,
    role: "hole",
    shape: "circle",
    plane: "top",
    mirror: false,
    thickness: meters(0.003),
    offset: meters(0),
    center: planePoint(x, y),
    radius: meters(r),
    ...extra,
  }) as PlanformElement;

describe("plane geometry", () => {
  it("Gauss's area formula, perimeter and centroid of a rectangle", () => {
    const r: Ring = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.1],
      [0, 0.1],
    ];
    expect(signedArea(r)).toBeCloseTo(0.02, 15);
    expect(signedArea([...r].reverse())).toBeCloseTo(-0.02, 15);
    expect(perimeter(r)).toBeCloseTo(0.6, 15);
    const [cx, cy] = centroid(r);
    expect(cx).toBeCloseTo(0.1, 15);
    expect(cy).toBeCloseTo(0.05, 15);
  });

  it("detects a contour that crosses itself", () => {
    expect(selfIntersects(square(0.1))).toBe(false);
    expect(
      selfIntersects([
        [0, 0],
        [0.1, 0.1],
        [0.1, 0],
        [0, 0.1],
      ]),
    ).toBe(true);
  });

  it("keeps circles within the chord tolerance", () => {
    for (const r of [0.001, 0.0635, 0.4, 1.5]) {
      const n = circleSegments(r);
      expect(r * (1 - Math.cos(Math.PI / n))).toBeLessThanOrEqual(CIRCLE_CHORD_TOLERANCE * 1.0000001);
      expect(circleRing([0, 0], r).length).toBe(n);
    }
  });
});

describe("planform analysis", () => {
  it("joins a half drawn on the axis with its mirror image into one piece", () => {
    const half = plate("ala", [
      [0.1, 0],
      [0.1, 0.2],
      [-0.1, 0.2],
      [-0.1, 0],
    ], { mirror: true, role: "wing" });
    const a = analysePlanform({ elements: [half] });
    expect(a.layers).toHaveLength(1);
    expect(a.layers[0]!.bodies).toHaveLength(1);
    expect(a.layers[0]!.area).toBeCloseTo(0.08, 9);
    expect(a.bounds).toEqual({ minX: -0.1, maxX: 0.1, minY: -0.2, maxY: 0.2 });
    expect(a.wing?.span).toBeCloseTo(0.4, 9);
    expect(a.wing?.aspectRatio).toBeCloseTo(2, 9);
  });

  it("cuts holes only through the sheets they cross at their height", () => {
    const sheet = plate("placa", [
      [-0.05, -0.05],
      [0.05, -0.05],
      [0.05, 0.05],
      [-0.05, 0.05],
    ]);
    const hole = circle("hueco", 0, 0, 0.01);
    const through = analysePlanform({ elements: [sheet, hole] });
    // Inscribed polygon: area deficit below perimeter × tolerance.
    expect(Math.abs(through.layers[0]!.area - (0.01 - Math.PI * 1e-4))).toBeLessThan(2 * Math.PI * 0.01 * CIRCLE_CHORD_TOLERANCE);
    expect(through.layers[0]!.holeIds).toEqual(["hueco"]);
    expect(through.issues).toEqual([]);

    const above = analysePlanform({ elements: [sheet, circle("hueco", 0, 0, 0.01, { offset: meters(-0.02) })] });
    expect(above.layers[0]!.area).toBeCloseTo(0.01, 12);
    expect(above.issues.map((i) => i.level)).toEqual(["amber"]);
  });

  it("extrudes a closed solid whose volume is area × thickness", () => {
    const sheet = plate("placa", [
      [-0.05, -0.05],
      [0.05, -0.05],
      [0.05, 0.05],
      [-0.05, 0.05],
    ], { offset: meters(0.01) });
    const a = analysePlanform({ elements: [sheet, circle("hueco", 0.01, 0.02, 0.008, { offset: meters(0.0105) })] });
    const layer = a.layers[0]!;
    const volume = layerGeometries(layer).reduce((s, g) => s + meshVolume(triangles(g)), 0);
    expect(volume).toBeGreaterThan(0);
    // three.js stores vertices in float32: relative agreement to 1e-6.
    expect(Math.abs(volume / (layer.area * 0.003) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(a.volume / volume - 1)).toBeLessThan(1e-6);
  });

  it("rejects contours that cannot be built and says why", () => {
    const bow = plate("lazo", [
      [0, 0],
      [0.1, 0.1],
      [0.1, 0],
      [0, 0.1],
    ]);
    const tiny = plate("punto", [
      [0, 0],
      [0.0001, 0],
      [0, 0.0001],
    ]);
    const a = analysePlanform({ elements: [bow, tiny] });
    expect(a.layers).toHaveLength(0);
    expect(a.issues.filter((i) => i.level === "red")).toHaveLength(2);
    // A crossed contour has zero signed area; it must be reported as crossed, not as empty.
    expect(a.issues.find((i) => i.elementId === "lazo")?.message).toMatch(/se corta a sí mismo/);
    expect(a.issues.find((i) => i.elementId === "punto")?.message).toMatch(/no encierra superficie/);
  });

  it("finds which drawn element covers a point of a sheet", () => {
    const a = plate("a", [
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
    ]);
    const b = plate("b", [
      [0.05, 0.05],
      [0.2, 0.05],
      [0.2, 0.2],
      [0.05, 0.2],
    ]);
    const planform: Planform = { elements: [a, b] };
    const layer = analysePlanform(planform).layers[0]!;
    expect(elementAtPoint(planform, layer, [0.02, 0.02, 0])).toBe("a");
    expect(elementAtPoint(planform, layer, [0.07, 0.07, 0])).toBe("b");
  });
});

describe("parametric templates", () => {
  it("arm layouts are symmetric about the nose", () => {
    expect(armAngles(4, "x")).toEqual([45, 135, 225, 315]);
    expect(armAngles(4, "plus")).toEqual([0, 90, 180, 270]);
    expect(armAngles(3, "x")).toEqual([60, 180, 300]);
  });

  it("a quad X frame is one piece with four discs at the requested spacing", () => {
    const elements = frameElements(DEFAULT_FRAME, { elements: [] });
    const a = analysePlanform({ elements });
    expect(a.layers).toHaveLength(1);
    expect(a.layers[0]!.bodies).toHaveLength(1);
    expect(a.rotorSummary?.count).toBe(4);
    // Generated coordinates are rounded to the micrometre.
    expect(Math.abs(a.rotorSummary!.maxAxisDistance - 0.22)).toBeLessThan(2e-6);
    expect(a.rotorSummary?.discArea).toBeCloseTo(4 * Math.PI * 0.0635 ** 2, 12);
    expect(a.issues).toEqual([]);
    // Mirrored motors sit exactly opposite each other.
    const front = a.rotors.filter((r) => r.center[0] > 0);
    expect(front.map((r) => r.center[1]).sort((x, y) => x - y)).toEqual([-0.077782, 0.077782]);
  });

  it("warns in red when propellers would hit each other or the frame", () => {
    const big = analysePlanform({ elements: frameElements({ ...DEFAULT_FRAME, propDiameter: 0.2 }, { elements: [] }) });
    expect(big.issues.some((i) => i.level === "red" && /chocarían/.test(i.message))).toBe(true);
    const low = analysePlanform({ elements: frameElements({ ...DEFAULT_FRAME, propHeight: 0 }, { elements: [] }) });
    expect(low.issues.some((i) => i.level === "red" && /golpearía/.test(i.message))).toBe(true);
  });

  it("tapered wing: S = (cr + ct)/2 · b, AR = b²/S, mean chord S/b", () => {
    const a = analysePlanform({ elements: [wingElement(DEFAULT_WING, { elements: [] })] });
    expect(a.wing!.area).toBeCloseTo(((0.25 + 0.15) / 2) * 0.8, 9);
    expect(a.wing!.span).toBeCloseTo(0.8, 9);
    expect(a.wing!.aspectRatio).toBeCloseTo(4, 9);
    expect(a.wing!.meanChord).toBeCloseTo(0.2, 9);
  });

  it("a delta has a pointed tip: S = cr · b / 2", () => {
    const delta = WING_PRESETS.find((p) => p.id === "delta-800")!.params;
    const element = wingElement(delta, { elements: [] });
    expect(element.points).toHaveLength(3);
    expect(analysePlanform({ elements: [element] }).wing!.area).toBeCloseTo((0.45 * 0.8) / 2, 9);
  });
});

describe("workshop files", () => {
  const frame = analysePlanform({ elements: frameElements(DEFAULT_FRAME, { elements: [] }) });

  it("binary STL in mm, Z up, with the solid's volume and outward faces", () => {
    const tris = stlTriangles(frame.layers);
    const stl = binaryStl(tris, "solid Cuerpo de ejemplo (sintético)");
    expect(stl.byteLength).toBe(84 + (tris.length / 9) * 50);
    const header = String.fromCharCode(...new Uint8Array(stl, 0, 80)).trimEnd();
    expect(header).toBe("_solid Cuerpo de ejemplo (sintetico)");
    expect(new DataView(stl).getUint32(80, true)).toBe(tris.length / 9);
    const volumeMm3 = meshVolume(Float64Array.from(tris));
    expect(volumeMm3 / 1e9).toBeCloseTo(frame.volume, 9);
    // The frame lies between z = −1.5 and +1.5 mm.
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < tris.length; i += 3) {
      minZ = Math.min(minZ, tris[i]!);
      maxZ = Math.max(maxZ, tris[i]!);
    }
    expect(minZ).toBeCloseTo(-1.5, 4);
    expect(maxZ).toBeCloseTo(1.5, 4);
  });

  it("SVG at 1:1 in millimetres with a control bar", () => {
    const svg = planformSvg(frame.layers, "Quad <prueba>");
    expect(svg).toMatch(/width="[\d.]+mm" height="[\d.]+mm"/);
    expect(svg).toContain('width="50" height="3"');
    expect(svg).toContain("Quad &lt;prueba&gt;");
    expect(svg).toContain("espesor 3,0 mm");
  });
});

describe("planform and project files", () => {
  it("round-trips a planform and explains broken ones", () => {
    const planform: Planform = { elements: frameElements(DEFAULT_FRAME, { elements: [] }) };
    const parsed = parsePlanformJson(JSON.parse(JSON.stringify(planform)));
    expect(parsed).toEqual({ ok: true, planform });
    expect(parsePlanformJson({})).toMatchObject({ ok: false });
    expect(parsePlanformJson({ elements: [{ id: "a", name: "a", role: "laser", shape: "circle" }] })).toMatchObject({ ok: false });
  });

  it("opens v1 mass-model files with an empty planform and round-trips v2 projects", () => {
    const v1 = parseProjectJson({ kind: "aeroforja.massModel", schemaVersion: 1, name: "Viejo", model: example }, "x");
    expect(v1).toMatchObject({ ok: true, name: "Viejo", planform: { elements: [] } });

    const mass = parseMassModelJson(example, "ejemplo");
    if (!mass.ok) throw new Error(mass.message);
    const planform: Planform = { elements: [wingElement(DEFAULT_WING, { elements: [] })] };
    const file = JSON.parse(JSON.stringify(toProjectFile("Mi ala", mass.model, planform))) as unknown;
    expect(parseProjectJson(file, "otro")).toEqual({ ok: true, name: "Mi ala", model: mass.model, planform, parts: [], meshes: new Map() });
    expect(parseProjectJson({ kind: "aeroforja.project", schemaVersion: 7 }, "x")).toMatchObject({ ok: false });
  });
});

describe("three views: planta, alzado y perfil", () => {
  const det = (m: readonly number[]): number =>
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);

  it("maps every plane to body axes with a proper rotation", () => {
    for (const plane of ["top", "side", "front"] as const) {
      expect(det(localToBody(plane))).toBe(1);
      const p = toBody(plane, 0.1, 0.2, 0.3);
      expect(fromBody(plane, p)).toEqual({ u: 0.1, v: 0.2, offset: 0.3 });
    }
    expect(toBody("side", 0.1, -0.05, 0.4)).toEqual([0.1, 0.4, -0.05]);
    expect(toBody("front", 0.3, 0.02, -0.1)).toEqual([-0.1, 0.3, 0.02]);
  });

  it("opens planta-only elements of project files v2", () => {
    const legacy = {
      elements: [{ id: "p", name: "p", role: "plate", shape: "circle", mirror: false, thickness: 0.003, z: -0.01, center: { x: 0.02, y: 0.03 }, radius: 0.01 }],
    };
    const parsed = parsePlanformJson(legacy);
    expect(parsed.ok && parsed.planform.elements[0]).toMatchObject({ plane: "top", offset: -0.01, center: { u: 0.02, v: 0.03 } });
  });

  it("a fin drawn in the perfil with symmetry is two vertical sheets at ±y, each a closed solid", () => {
    const fin = plate("deriva", [
      [0, 0],
      [-0.1, 0],
      [-0.1, -0.08],
      [-0.05, -0.08],
    ], { plane: "side", role: "wing", mirror: true, offset: meters(0.4) });
    const a = analysePlanform({ elements: [fin] });
    expect(a.layers.map((l) => [l.plane, l.offset])).toEqual([
      ["side", -0.4],
      ["side", 0.4],
    ]);
    const area = (0.1 + 0.05) / 2 * 0.08;
    for (const layer of a.layers) {
      const volume = layerGeometries(layer).reduce((s, g) => s + meshVolume(triangles(g)), 0);
      // float32 vertices 0,4 m from the origin carry ~2·10⁻⁸ m of rounding on a 3 mm thickness.
      expect(Math.abs(volume / (area * 0.003) - 1)).toBeLessThan(1e-5);
    }
    expect(a.box!.min[1]).toBeCloseTo(-0.4015, 9);
    expect(a.box!.max[1]).toBeCloseTo(0.4015, 9);
    expect(a.box!.min[2]).toBeCloseTo(-0.08, 9);
    expect(a.vertical).toMatchObject({ count: 2, height: 0.08 });
    expect(a.vertical!.area).toBeCloseTo(2 * area, 12);
    expect(a.wing).toBeNull();
  });

  it("projects a sheet into the other views as the rectangle of its extent and thickness", () => {
    const ring: Ring = [
      [0, -0.1],
      [0.05, -0.1],
      [0.05, 0.1],
      [0, 0.1],
    ];
    // A planta plate 50 × 200 mm, 3 mm thick at z = 0, seen from the front: y from −0.1 to 0.1, z ±1.5 mm.
    expect(projectToView("top", ring, 0, 0.003, "front")).toEqual([
      [-0.1, -0.0015],
      [0.1, -0.0015],
      [0.1, 0.0015],
      [-0.1, 0.0015],
    ]);
    const a = analysePlanform({ elements: [plate("p", ring.map((p) => [p[0], p[1]] as [number, number]))] });
    expect(a.frontalArea).toBeCloseTo(0.2 * 0.003, 12);
    expect(a.projectedArea).toBeCloseTo(0.05 * 0.2, 12);
  });

  it("finds a horizontal propeller that would hit a vertical fin", () => {
    const fin = plate("deriva", [
      [0.05, 0.01],
      [-0.05, 0.01],
      [-0.05, -0.05],
      [0.05, -0.05],
    ], { plane: "side", offset: meters(0) });
    const prop = circle("helice", 0, 0, 0.06, { role: "rotor", offset: meters(-0.02) });
    const hit = analysePlanform({ elements: [fin, prop] });
    expect(hit.issues.some((i) => i.level === "red" && i.elementId === "helice" && /perfil/.test(i.message))).toBe(true);
    const clear = analysePlanform({ elements: [fin, circle("helice", 0, 0, 0.06, { role: "rotor", offset: meters(-0.06) })] });
    expect(clear.issues.filter((i) => i.level === "red")).toEqual([]);
  });

  it("a pusher propeller in the alzado is a disc with its axis along x", () => {
    const pusher = circle("pusher", 0, 0, 0.0635, { role: "rotor", plane: "front", offset: meters(-0.2) });
    const a = analysePlanform({ elements: [pusher] });
    expect(a.rotors).toHaveLength(1);
    expect(a.rotors[0]!.center3).toEqual([-0.2, 0, 0]);
    expect(a.box!.min).toEqual([-0.2, -0.0635, -0.0635]);
  });

  it("the wing template can add tip fins in the perfil", () => {
    const flyingWing = WING_PRESETS.find((p) => p.id === "flying-wing-800")!.params;
    const elements = wingElements(flyingWing, { elements: [] });
    expect(elements.map((e) => e.plane)).toEqual(["top", "side"]);
    const a = analysePlanform({ elements });
    expect(a.vertical?.count).toBe(2);
    expect(a.wing!.area).toBeCloseTo(0.16, 9);
    expect(a.issues).toEqual([]);
  });

  it("the SVG names the view and the offset axis of each sheet", () => {
    const fin = plate("deriva", [
      [0, 0],
      [-0.1, 0],
      [-0.1, -0.08],
    ], { plane: "side", offset: meters(0.1) });
    expect(planformSvg(analysePlanform({ elements: [fin] }).layers, "x")).toContain("perfil · espesor 3,0 mm · y 100,0 mm");
  });
});
