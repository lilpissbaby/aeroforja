/**
 * Unit tests: humidity and measured ambient conditions. Agreement with
 * IAPWS-95 and ASHRAE RP-1485 is checked in packages/validation.
 */
import { describe, expect, it } from "vitest";
import { atmosphere, measuredAtmosphere } from "../../src/atmosphere/isa.ts";
import {
  WATER_VAPOUR_GAS_CONSTANT,
  saturationVapourPressure,
} from "../../src/atmosphere/humidity.ts";
import { AIR_GAS_CONSTANT } from "../../src/atmosphere/constants.ts";
import { dimensionless, kelvin, meters, pascals } from "../../src/core/units.ts";

const sea = { kind: "geopotential", value: meters(0) } as const;

describe("humidity", () => {
  it("humid air is less dense than dry air at the same p and T", () => {
    const dry = atmosphere({ altitude: sea }).value;
    const humid = atmosphere({ altitude: sea, relativeHumidity: dimensionless(0.7) }).value;
    expect(humid.pressure).toBe(dry.pressure);
    expect(humid.density).toBeLessThan(dry.density);
    expect(humid.vapourPressure).toBeGreaterThan(0);
  });

  it("matches the virtual-temperature form rho = rho_dry * (1 - (1 - eps) e / p)", () => {
    const p = 101325;
    const t = 303.15;
    const dry = measuredAtmosphere({ pressure: pascals(p), temperature: kelvin(t) }).value;
    const humid = measuredAtmosphere({
      pressure: pascals(p),
      temperature: kelvin(t),
      relativeHumidity: dimensionless(0.7),
    }).value;
    const eps = AIR_GAS_CONSTANT / WATER_VAPOUR_GAS_CONSTANT; // = M_w / M_d, about 0.622
    expect(humid.density).toBeCloseTo(dry.density * (1 - ((1 - eps) * humid.vapourPressure) / p), 12);
    // About 1.1 % lighter at 30 degrees C and 70 % RH, as stated in the mini-design.
    expect(1 - humid.density / dry.density).toBeCloseTo(0.011, 3);
  });

  it("relative humidity 0 gives dry density but declares the moist model", () => {
    const dry = atmosphere({ altitude: sea }).value;
    const zero = atmosphere({ altitude: sea, relativeHumidity: dimensionless(0) });
    expect(zero.value.density).toBe(dry.density);
    expect(zero.assumptions.map((a) => a.id)).toContain("moist-air-ideal-mixture");
  });

  it("saturation pressure is monotonic in temperature", () => {
    let previous = 0;
    for (let t = 233.15; t <= 323.15; t += 5) {
      const e = saturationVapourPressure(t);
      expect(e).toBeGreaterThan(previous);
      previous = e;
    }
  });

  it("rejects relative humidity outside 0..1", () => {
    expect(() => atmosphere({ altitude: sea, relativeHumidity: dimensionless(1.2) })).toThrow(RangeError);
    expect(() => atmosphere({ altitude: sea, relativeHumidity: dimensionless(-0.1) })).toThrow(RangeError);
  });

  it("is green inside the validated humid box and red outside the Magnus range", () => {
    const ok = measuredAtmosphere({
      pressure: pascals(101325),
      temperature: kelvin(298.15),
      relativeHumidity: dimensionless(0.6),
    });
    expect(ok.validity.level).toBe("green");
    const tooHot = measuredAtmosphere({
      pressure: pascals(101325),
      temperature: kelvin(330),
      relativeHumidity: dimensionless(0.2),
    });
    expect(tooHot.validity.checks.find((c) => c.quantity === "humidAirTemperature")?.level).toBe("red");
    const subzero = measuredAtmosphere({
      pressure: pascals(101325),
      temperature: kelvin(263.15),
      relativeHumidity: dimensionless(0.5),
    });
    expect(subzero.validity.level).toBe("amber");
  });
});

describe("measured ambient", () => {
  it("uses the given pressure and temperature, with no altitude", () => {
    const r = measuredAtmosphere({ pressure: pascals(98000), temperature: kelvin(295.15) });
    expect(r.value.pressure).toBe(98000);
    expect(r.value.temperature).toBe(295.15);
    expect("geopotentialAltitude" in r.value).toBe(false);
    expect(r.assumptions.map((a) => a.id)).toContain("measured-ambient");
    expect(r.validity.level).toBe("green");
  });

  it("agrees with the ISA when given the ISA pressure and temperature", () => {
    const isa = atmosphere({ altitude: { kind: "geopotential", value: meters(1200) } }).value;
    const measured = measuredAtmosphere({ pressure: isa.pressure, temperature: isa.temperature }).value;
    expect(measured.density).toBe(isa.density);
    expect(measured.kinematicViscosity).toBe(isa.kinematicViscosity);
  });

  it("rejects non-positive pressure", () => {
    expect(() => measuredAtmosphere({ pressure: pascals(0), temperature: kelvin(288) })).toThrow(RangeError);
  });
});
