/**
 * Validation: moist air (ideal mixture + Magnus) against ASHRAE RP-1485 and
 * IAPWS-95, and the measured-conditions mode against the same rows.
 */
import { describe, expect, it } from "vitest";
import {
  DRY_AIR_PRESSURE_RANGE,
  HUMID_AIR_PRESSURE_RANGE,
  HUMID_AIR_TEMPERATURE_RANGE,
  dimensionless,
  kelvin,
  measuredAtmosphere,
  pascals,
  saturationVapourPressure,
} from "@aeroforja/physics";
import {
  HUMID_AIR_DENSITY_TOLERANCE,
  HUMID_AIR_ROWS,
  ICAO_DOC_7488_TROPOSPHERE,
  SATURATION_PRESSURE_TOLERANCE,
  SATURATION_ROWS,
} from "../src/index.ts";

const relativeError = (computed: number, reference: number): number =>
  Math.abs(computed / reference - 1);

describe(`Magnus saturation pressure vs IAPWS-95 (tolerance ${SATURATION_PRESSURE_TOLERANCE.relative})`, () => {
  for (const row of SATURATION_ROWS) {
    it(`T = ${row.temperature_K} K`, () => {
      const error = relativeError(saturationVapourPressure(row.temperature_K), row.saturationPressure_Pa);
      expect(error).toBeLessThanOrEqual(SATURATION_PRESSURE_TOLERANCE.relative);
    });
  }
});

describe(`Moist-air density vs ASHRAE RP-1485 (tolerance ${HUMID_AIR_DENSITY_TOLERANCE.relative})`, () => {
  for (const row of HUMID_AIR_ROWS) {
    it(`p = ${row.pressure_Pa} Pa, T = ${row.temperature_K} K, RH = ${row.relativeHumidity}`, () => {
      const result = measuredAtmosphere({
        pressure: pascals(row.pressure_Pa),
        temperature: kelvin(row.temperature_K),
        relativeHumidity: dimensionless(row.relativeHumidity),
      });
      const error = relativeError(result.value.density, row.density_kg_m3);
      expect(
        error,
        `computed ${result.value.density} vs RP-1485 ${row.density_kg_m3} (rel. error ${error.toExponential(2)})`,
      ).toBeLessThanOrEqual(HUMID_AIR_DENSITY_TOLERANCE.relative);
      expect(result.validity.checks.find((c) => c.quantity === "humidAirTemperature")?.level).toBe("green");
      expect(result.validity.checks.find((c) => c.quantity === "humidAirPressure")?.level).toBe("green");
    });
  }
});

describe("validated humid and measured ranges are covered by reference rows", () => {
  const temperatures = HUMID_AIR_ROWS.map((r) => r.temperature_K);
  const pressures = HUMID_AIR_ROWS.map((r) => r.pressure_Pa);

  it("humid-air temperature band", () => {
    expect(Math.min(...temperatures)).toBeLessThanOrEqual(HUMID_AIR_TEMPERATURE_RANGE.validated.min);
    expect(Math.max(...temperatures)).toBeGreaterThanOrEqual(HUMID_AIR_TEMPERATURE_RANGE.validated.max);
  });

  it("humid-air pressure band", () => {
    expect(Math.min(...pressures)).toBeLessThanOrEqual(HUMID_AIR_PRESSURE_RANGE.validated.min);
    expect(Math.max(...pressures)).toBeGreaterThanOrEqual(HUMID_AIR_PRESSURE_RANGE.validated.max);
  });

  it("dry-air pressure band of the measured mode (standard-atmosphere rows)", () => {
    const icaoPressures = ICAO_DOC_7488_TROPOSPHERE.map((r) => r.pressure_Pa);
    expect(Math.min(...icaoPressures)).toBeLessThanOrEqual(DRY_AIR_PRESSURE_RANGE.validated.min);
    expect(Math.max(...icaoPressures)).toBeGreaterThanOrEqual(DRY_AIR_PRESSURE_RANGE.validated.max);
  });
});
