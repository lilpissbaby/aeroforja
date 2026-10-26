/**
 * Unit tests: behaviour of the mass model (overrides, provenance, uncertainty,
 * input checks). Agreement with closed forms is in packages/validation.
 */
import { describe, expect, it } from "vitest";
import { massProperties, type MassComponent } from "../../src/mass/massProperties.ts";
import { bodyPosition } from "../../src/core/vector.ts";
import { kilogramSquareMeters, kilograms, meters } from "../../src/core/units.ts";

const point = (id: string, mass: number, x: number, y = 0, z = 0, extra: Partial<MassComponent> = {}): MassComponent => ({
  id,
  name: id,
  mass: { value: kilograms(mass), provenance: "MEASURED" },
  position: bodyPosition(x, y, z),
  inertia: { kind: "point" },
  ...extra,
});

describe("massProperties: composition", () => {
  it("one component: CG at its position, inertia equals its own", () => {
    const r = massProperties({
      referencePoint: "test",
      components: [
        {
          id: "box",
          name: "box",
          mass: { value: kilograms(0.3), provenance: "MEASURED" },
          position: bodyPosition(0.1, -0.02, 0.03),
          inertia: { kind: "box", size: { x: meters(0.1), y: meters(0.05), z: meters(0.02) } },
        },
      ],
    });
    expect(r.value.centerOfGravity.value).toStrictEqual(bodyPosition(0.1, -0.02, 0.03));
    expect(r.value.inertia.value.Ixx).toBeCloseTo((0.3 * (0.05 ** 2 + 0.02 ** 2)) / 12, 15);
    expect(r.value.inertia.value.Ixy).toBe(0);
    expect(r.validity.level).toBe("green");
  });

  it("CG is the mass-weighted mean of positions", () => {
    const r = massProperties({
      referencePoint: "test",
      components: [point("a", 1, 0), point("b", 3, 0.4)],
    });
    expect(r.value.centerOfGravity.value.x).toBeCloseTo(0.3, 15);
    expect(r.value.mass.value).toBe(4);
  });
});

describe("massProperties: provenance and measured overrides", () => {
  it("calculated from measured masses is CALCULATED; one catalogue mass makes it ESTIMATED", () => {
    const allMeasured = massProperties({ referencePoint: "t", components: [point("a", 1, 0), point("b", 1, 1)] });
    expect(allMeasured.value.mass.provenance).toBe("CALCULATED");
    const withCatalogue = massProperties({
      referencePoint: "t",
      components: [point("a", 1, 0), { ...point("b", 1, 1), mass: { value: kilograms(1), provenance: "ESTIMATED" } }],
    });
    expect(withCatalogue.value.mass.provenance).toBe("ESTIMATED");
    expect(withCatalogue.provenance).toBe("ESTIMATED");
  });

  it("measured mass and CG replace calculated ones and keep the calculated values for comparison", () => {
    const r = massProperties({
      referencePoint: "t",
      components: [point("a", 1, 0), point("b", 1, 1)],
      measured: {
        mass: { value: kilograms(2.05), standardUncertainty: kilograms(0.005) },
        centerOfGravity: { value: bodyPosition(0.48, 0, 0) },
      },
    });
    expect(r.value.mass).toStrictEqual({ value: 2.05, provenance: "MEASURED", standardUncertainty: 0.005 });
    expect(r.value.centerOfGravity.provenance).toBe("MEASURED");
    expect(r.value.fromComponents.mass).toBe(2);
    expect(r.value.fromComponents.centerOfGravity.x).toBeCloseTo(0.5, 15);
    expect(r.assumptions.map((a) => a.id)).toContain("inertia-about-calculated-cg");
  });

  it("a measured tensor replaces the calculated inertia", () => {
    const tensor = {
      Ixx: kilogramSquareMeters(0.01),
      Iyy: kilogramSquareMeters(0.02),
      Izz: kilogramSquareMeters(0.028),
      Ixy: kilogramSquareMeters(0),
      Ixz: kilogramSquareMeters(0.001),
      Iyz: kilogramSquareMeters(0),
    };
    const r = massProperties({ referencePoint: "t", components: [point("a", 1, 0)], measured: { inertia: { value: tensor } } });
    expect(r.value.inertia).toStrictEqual({ value: tensor, provenance: "MEASURED" });
    expect(r.validity.level).toBe("green");
  });
});

describe("massProperties: uncertainty (GUM first order)", () => {
  it("matches the hand-derived result for two equal masses", () => {
    const u = { standardUncertainty: kilograms(0.01) };
    const r = massProperties({
      referencePoint: "t",
      components: [
        { ...point("a", 1, -0.5), mass: { value: kilograms(1), provenance: "MEASURED", ...u } },
        { ...point("b", 1, 0.5), mass: { value: kilograms(1), provenance: "MEASURED", ...u } },
      ],
    });
    expect(r.value.mass.standardUncertainty).toBeCloseTo(Math.SQRT2 * 0.01, 15);
    // u(cx)^2 = sum ((x_i - cx)/M)^2 u^2(m_i) = 2 * (0.5/2)^2 * 1e-4
    expect(r.value.centerOfGravity.standardUncertainty?.x).toBeCloseTo(Math.sqrt(2 * 0.25 ** 2 * 1e-4), 15);
    expect(r.methods.map((m) => m.id)).toContain("gum-first-order");
  });

  it("position uncertainty propagates with weight m_i / M", () => {
    const r = massProperties({
      referencePoint: "t",
      components: [point("a", 3, 0, 0, 0, { positionUncertainty: bodyPosition(0.002, 0, 0) }), point("b", 1, 0.4)],
    });
    expect(r.value.centerOfGravity.standardUncertainty?.x).toBeCloseTo(0.75 * 0.002, 15);
  });

  it("without any input uncertainty, the output has none and says so", () => {
    const r = massProperties({ referencePoint: "t", components: [point("a", 1, 0)] });
    expect(r.value.mass.standardUncertainty).toBeUndefined();
    expect(r.assumptions.map((a) => a.id)).toContain("no-input-uncertainty");
  });
});

describe("massProperties: input checks and validity", () => {
  it("rejects non-physical input", () => {
    expect(() => massProperties({ referencePoint: "t", components: [] })).toThrow(RangeError);
    expect(() => massProperties({ referencePoint: "t", components: [point("a", 0, 0)] })).toThrow(RangeError);
    expect(() => massProperties({ referencePoint: "t", components: [point("a", 1, 0), point("a", 1, 1)] })).toThrow(
      RangeError,
    );
    expect(() =>
      massProperties({
        referencePoint: "t",
        components: [
          {
            ...point("tube", 0.05, 0),
            inertia: { kind: "tube", outerRadius: meters(0.005), innerRadius: meters(0.005), length: meters(0.3), axis: "x" },
          },
        ],
      }),
    ).toThrow(RangeError);
    const wrongFrame = { ...point("a", 1, 0), position: { frame: "NED", x: 0, y: 0, z: 0 } } as unknown as MassComponent;
    expect(() => massProperties({ referencePoint: "t", components: [wrongFrame] })).toThrow(RangeError);
  });

  it("flags a given tensor that breaks the triangle inequality in red", () => {
    const r = massProperties({
      referencePoint: "t",
      components: [
        {
          ...point("bad", 0.2, 0),
          inertia: {
            kind: "given",
            provenance: "MEASURED",
            tensor: {
              Ixx: kilogramSquareMeters(0.001),
              Iyy: kilogramSquareMeters(0.001),
              Izz: kilogramSquareMeters(0.005),
              Ixy: kilogramSquareMeters(0),
              Ixz: kilogramSquareMeters(0),
              Iyz: kilogramSquareMeters(0),
            },
          },
        },
      ],
    });
    expect(r.validity.level).toBe("red");
    expect(r.validity.checks.find((c) => c.quantity === "component[bad].principalMomentTriangle")?.level).toBe("red");
  });
});
