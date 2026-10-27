import { describe, expect, it } from "vitest";
import { massProperties } from "@aeroforja/physics";
import example from "../../../examples/mass-model.example.json";
import { parseMassModelJson, toMassModelFile } from "../src/model/massModelFile.ts";

describe("mass model files", () => {
  it("accepts the bare example model and the physics core computes it", () => {
    const parsed = parseMassModelJson(example, "ejemplo");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(massProperties(parsed.model).validity.level).toBe("green");
  });

  it("round-trips through the versioned file format", () => {
    const parsed = parseMassModelJson(example, "ejemplo");
    if (!parsed.ok) throw new Error(parsed.message);
    const file = JSON.parse(JSON.stringify(toMassModelFile("Mi quad", parsed.model))) as unknown;
    const again = parseMassModelJson(file, "otro");
    expect(again).toEqual({ ok: true, name: "Mi quad", model: parsed.model });
  });

  it("explains what is wrong instead of loading a broken model", () => {
    expect(parseMassModelJson({ kind: "aeroforja.massModel", schemaVersion: 99 }, "x")).toMatchObject({ ok: false });
    expect(parseMassModelJson({ referencePoint: "o", components: [] }, "x")).toMatchObject({ ok: false });
    const wrongFrame = {
      referencePoint: "o",
      components: [
        {
          id: "a",
          name: "a",
          mass: { value: 0.1, provenance: "MEASURED" },
          position: { frame: "NED", x: 0, y: 0, z: 0 },
          inertia: { kind: "point" },
        },
      ],
    };
    const result = parseMassModelJson(wrongFrame, "x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/FRD/);
  });
});
