/**
 * Unit tests: internal consistency of the ISA module. Agreement with published
 * tables is checked in packages/validation.
 */
import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_STATE_UNITS,
  atmosphere,
  geometricFromGeopotential,
  geopotentialFromGeometric,
} from "../../src/atmosphere/isa.ts";
import { AIR_GAS_CONSTANT } from "../../src/atmosphere/constants.ts";
import { kelvin, meters } from "../../src/core/units.ts";

const geopotential = (value: number) => ({ kind: "geopotential", value: meters(value) }) as const;

describe("atmosphere: consistency", () => {
  it("satisfies the ideal gas law, p = rho R T", () => {
    for (const h of [-5000, 0, 1500, 11000]) {
      const { value } = atmosphere({ altitude: geopotential(h) });
      expect(value.density * AIR_GAS_CONSTANT * value.temperature).toBeCloseTo(value.pressure, 6);
    }
  });

  it("returns nu = mu / rho", () => {
    const { value } = atmosphere({ altitude: geopotential(800) });
    expect(value.kinematicViscosity).toBeCloseTo(value.dynamicViscosity / value.density, 15);
  });

  it("is deterministic", () => {
    const q = { altitude: geopotential(1234.5) };
    expect(atmosphere(q)).toStrictEqual(atmosphere(q));
  });

  it("exposes a unit for every output field", () => {
    const { value } = atmosphere({ altitude: geopotential(0) });
    expect(Object.keys(ATMOSPHERE_STATE_UNITS).sort()).toStrictEqual(Object.keys(value).sort());
  });
});

describe("atmosphere: non-standard temperature", () => {
  it("keeps the standard pressure and scales density with 1/T (pressure altitude)", () => {
    const standard = atmosphere({ altitude: geopotential(500) }).value;
    const hot = atmosphere({
      altitude: geopotential(500),
      temperature: { kind: "offset", deltaT: kelvin(20) },
    });
    expect(hot.value.pressure).toBe(standard.pressure);
    expect(hot.value.temperature).toBeCloseTo(standard.temperature + 20, 12);
    expect(hot.value.density).toBeCloseTo(
      (standard.density * standard.temperature) / hot.value.temperature,
      12,
    );
    expect(hot.assumptions.map((a) => a.id)).toContain("pressure-altitude");
  });

  it("accepts an absolute temperature", () => {
    const r = atmosphere({
      altitude: geopotential(0),
      temperature: { kind: "absolute", value: kelvin(303.15) },
    });
    expect(r.value.temperature).toBe(303.15);
    expect(r.validity.level).toBe("green");
  });

  it("rejects temperatures at or below 0 K", () => {
    expect(() =>
      atmosphere({ altitude: geopotential(0), temperature: { kind: "absolute", value: kelvin(0) } }),
    ).toThrow(RangeError);
    expect(() =>
      atmosphere({ altitude: geopotential(0), temperature: { kind: "offset", deltaT: kelvin(-300) } }),
    ).toThrow(RangeError);
  });

  it("is amber when the temperature leaves the validated band", () => {
    const r = atmosphere({
      altitude: geopotential(0),
      temperature: { kind: "absolute", value: kelvin(200) },
    });
    expect(r.validity.level).toBe("amber");
    expect(r.validity.checks.find((c) => c.quantity === "temperature")?.level).toBe("amber");
  });
});

describe("atmosphere: validity of altitude", () => {
  it("is green across the whole lowest layer", () => {
    for (const h of [-5000, 0, 3000, 11000]) {
      expect(atmosphere({ altitude: geopotential(h) }).validity.level).toBe("green");
    }
  });

  it("is red above the tropopause and below -5000 m, without hiding the value", () => {
    const high = atmosphere({ altitude: geopotential(12000) });
    expect(high.validity.level).toBe("red");
    expect(Number.isFinite(high.value.density)).toBe(true);
    expect(atmosphere({ altitude: geopotential(-5001) }).validity.level).toBe("red");
  });

  it("throws where the troposphere law gives a non-positive temperature", () => {
    expect(() => atmosphere({ altitude: geopotential(50000) })).toThrow(RangeError);
  });
});

describe("geometric and geopotential altitude", () => {
  it("coincide at sea level and round-trip", () => {
    expect(geopotentialFromGeometric(meters(0))).toBe(0);
    for (const z of [-5000, 1000, 3000, 11019]) {
      expect(geometricFromGeopotential(geopotentialFromGeometric(meters(z)))).toBeCloseTo(z, 8);
    }
  });

  it("geopotential is below geometric above sea level (gravity decreases)", () => {
    expect(geopotentialFromGeometric(meters(3000))).toBeLessThan(3000);
    // 3000 m geometric is about 1.4 m lower in geopotential terms.
    expect(3000 - geopotentialFromGeometric(meters(3000))).toBeCloseTo(1.415, 3);
  });

  it("geometric input records the conversion method and assumption", () => {
    const r = atmosphere({ altitude: { kind: "geometric", value: meters(1000) } });
    expect(r.methods.map((m) => m.id)).toContain("geopotential-altitude");
    expect(r.assumptions.map((a) => a.id)).toContain("geometric-to-geopotential");
  });
});

describe("result envelope", () => {
  it("carries provenance, methods with references and assumptions", () => {
    const r = atmosphere({ altitude: geopotential(0) });
    expect(r.provenance).toBe("CALCULATED");
    expect(r.methods.map((m) => m.id)).toStrictEqual([
      "isa-troposphere",
      "ideal-gas-air",
      "sutherland-viscosity",
    ]);
    for (const m of r.methods) expect(m.references.length).toBeGreaterThan(0);
    expect(r.assumptions.map((a) => a.id)).toContain("dry-air");
  });
});
