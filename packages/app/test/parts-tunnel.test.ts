/**
 * STL parts (mini-design 005) and the bridge from the drawing to the tunnel
 * (mini-design 004).
 */
import { describe, expect, it } from "vitest";
import { meshMassProperties, meters, radians, tunnelSweep, type MassModel } from "@aeroforja/physics";
import { toProjectFile, parseProjectJson } from "../src/model/projectFile.ts";
import type { ImportedPart } from "../src/parts/model.ts";
import { projectTriangles } from "../src/parts/projection.ts";
import { meshKey, parseStl, writeBinaryStl } from "../src/parts/stl.ts";
import { bodyTriangles } from "../src/parts/transform.ts";
import { analysePlanform } from "../src/planform/geometry.ts";
import { planePoint, type Planform } from "../src/planform/model.ts";
import { sweepAlphas, tunnelGeometry, DEFAULT_TUNNEL } from "../src/tunnel/input.ts";

function box(a: number, b: number, c: number): Float32Array {
  const v = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  return Float32Array.from(faces.flatMap(([p, q, r, s]) => [p, q, r, p, r, s].flatMap((i) => v[i!]!)));
}

const part = (mesh: Float32Array, extra: Partial<ImportedPart> = {}): ImportedPart => ({
  id: "montura",
  name: "Montura de cámara",
  fileName: "montura.stl",
  meshKey: meshKey(mesh),
  triangleCount: mesh.length / 9,
  unit: 0.001,
  placement: { position: { x: meters(0.05), y: meters(0), z: meters(0.01) }, yaw: radians(0), pitch: radians(0), roll: radians(0), scale: 1 },
  mass: { kind: "weighed", mass: 0.012 as never },
  inMassModel: true,
  dragShape: "flat-face",
  ...extra,
});

describe("STL files", () => {
  it("binary STL round trip keeps every coordinate", () => {
    const mesh = box(30, 20, 15);
    const parsed = parseStl(writeBinaryStl(mesh));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Array.from(parsed.triangles)).toEqual(Array.from(mesh));
  });
  it("ASCII STL is read", () => {
    const text = `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n`;
    const parsed = parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(parsed.ok && parsed.format === "ascii" && parsed.triangles.length === 9).toBe(true);
  });
  it("rejects a file that is neither", () => {
    expect(parseStl(new Uint8Array(200).buffer).ok).toBe(false);
  });
});

describe("placed part", () => {
  const mesh = box(30, 20, 15);
  it("volume and centroid follow units and placement", () => {
    const tris = bodyTriangles(part(mesh), mesh);
    const m = meshMassProperties(tris, 1000).value;
    expect(m.volume).toBeCloseTo(30e-3 * 20e-3 * 15e-3, 12);
    expect(m.centroid[0]).toBeCloseTo(0.05 + 0.015, 9);
    expect(m.centroid[2]).toBeCloseTo(0.01 + 0.0075, 9);
  });
  it("frontal area of a box is its y × z face, exactly", () => {
    const tris = bodyTriangles(part(mesh), mesh);
    const p = projectTriangles(tris, 0);
    expect(p.area).toBeCloseTo(20e-3 * 15e-3, 10);
    expect(p.centroid[0]).toBeCloseTo(0.01, 9);
  });
  it("yaw of 90° turns the long side to the flow", () => {
    const tris = bodyTriangles(part(mesh, { placement: { ...part(mesh).placement, yaw: radians(Math.PI / 2) } }), mesh);
    expect(projectTriangles(tris, 0).area).toBeCloseTo(30e-3 * 15e-3, 9);
  });
  it("project file v3 carries the part and its mesh", () => {
    const model: MassModel = {
      referencePoint: "o",
      components: [{ id: "c", name: "c", mass: { value: 0.1 as never, provenance: "MEASURED" }, position: { frame: "FRD", x: 0 as never, y: 0 as never, z: 0 as never }, inertia: { kind: "point" } }],
    };
    const file = JSON.parse(JSON.stringify(toProjectFile("p", model, { elements: [] }, [part(mesh)], new Map([[part(mesh).meshKey, mesh]]))));
    const back = parseProjectJson(file, "x");
    expect(back.ok ? "ok" : back.message).toBe("ok");
    if (back.ok) {
      expect(back.parts[0]!.name).toBe("Montura de cámara");
      expect(Array.from(back.meshes.get(part(mesh).meshKey)!)).toEqual(Array.from(mesh));
    }
  });
});

describe("drawing to tunnel", () => {
  const model: MassModel = { referencePoint: "o", components: [] };
  const air = { density: 1.225, kinematicViscosity: 1.46e-5, speedOfSound: 340 };
  const run = (planform: Planform) => {
    const g = tunnelGeometry(planform, analysePlanform(planform), model, [], false);
    return tunnelSweep({ surfaces: g.surfaces, friction: g.friction, bluff: g.bluff, cg: [0, 0, 0], speed: 15, alphas: sweepAlphas({ ...DEFAULT_TUNNEL, alphaMin: 0, alphaMax: 4, alphaStep: 2 }), air, interference: 1 }).value;
  };
  const wing = (points: [number, number][], mirror: boolean): Planform => ({
    elements: [{ id: "ala-1", name: "Ala", role: "wing", plane: "top", shape: "polygon", mirror, thickness: meters(0.003), offset: meters(0), points: points.map(([u, v]) => planePoint(u, v)) }],
  });
  it("a whole wing and a half wing with symmetry give the same lift (mini-design 004, case 5)", () => {
    const whole = run(wing([[0.1, -0.4], [0.1, 0.4], [-0.1, 0.4], [-0.1, -0.4]], false));
    const half = run(wing([[0.1, 0], [0.1, 0.4], [-0.1, 0.4], [-0.1, 0]], true));
    for (let i = 0; i < whole.points.length; i++) expect(Math.abs(whole.points[i]!.CL! - half.points[i]!.CL!)).toBeLessThan(1e-9);
  });
  it("plates rub and their edges are blunt; a wing also lifts", () => {
    const g = tunnelGeometry(wing([[0.1, 0], [0.1, 0.4], [-0.1, 0.4], [-0.1, 0]], true), analysePlanform(wing([[0.1, 0], [0.1, 0.4], [-0.1, 0.4], [-0.1, 0]], true)), model, [], false);
    expect(g.surfaces).toHaveLength(1);
    expect(g.friction).toHaveLength(1);
    expect(g.friction[0]!.wettedArea).toBeCloseTo(2 * 0.16 + (0.8 * 2 + 0.2 * 2) * 0.003, 9);
    expect(g.bluff[0]!.frontalArea).toBeCloseTo(0.003 * 0.8, 9);
  });
});
