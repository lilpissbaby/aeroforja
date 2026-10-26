/**
 * Validation: ISA troposphere against ICAO Doc 7488/3 tabulated values.
 * Gate: every quantity within ICAO_DOC_7488_TOLERANCE (relative).
 */
import { describe, expect, it } from "vitest";
import {
  ISA_ALTITUDE_RANGE,
  ISA_TEMPERATURE_RANGE,
  atmosphere,
  geopotentialFromGeometric,
  meters,
  type AtmosphereState,
} from "@aeroforja/physics";
import {
  ICAO_DOC_7488_SOURCE,
  ICAO_DOC_7488_TOLERANCE,
  ICAO_DOC_7488_TROPOSPHERE,
  type IsaReferenceRow,
} from "../src/index.ts";

const relativeError = (computed: number, reference: number): number =>
  Math.abs(computed / reference - 1);

const label = (row: IsaReferenceRow): string =>
  `${row.exactAltitude.kind === "geometric" ? "Z" : "H"} = ${row.exactAltitude.value_m} m`;

const compared: ReadonlyArray<[keyof AtmosphereState, keyof IsaReferenceRow]> = [
  ["temperature", "temperature_K"],
  ["pressure", "pressure_Pa"],
  ["density", "density_kg_m3"],
  ["speedOfSound", "speedOfSound_m_s"],
  ["dynamicViscosity", "dynamicViscosity_Pa_s"],
  ["kinematicViscosity", "kinematicViscosity_m2_s"],
];

describe(`ISA troposphere vs ICAO Doc 7488/3 (tolerance ${ICAO_DOC_7488_TOLERANCE.relative} relative)`, () => {
  for (const row of ICAO_DOC_7488_TROPOSPHERE) {
    describe(label(row), () => {
      const result = atmosphere({
        altitude: { kind: row.exactAltitude.kind, value: meters(row.exactAltitude.value_m) },
      });

      for (const [field, refField] of compared) {
        it(field, () => {
          const reference = row[refField];
          if (typeof reference !== "number") throw new TypeError(`${refField} is not numeric`);
          const error = relativeError(result.value[field], reference);
          expect(
            error,
            `${field}: computed ${result.value[field]} vs table ${reference} (rel. error ${error.toExponential(2)})`,
          ).toBeLessThanOrEqual(ICAO_DOC_7488_TOLERANCE.relative);
        });
      }

      it("is flagged green", () => {
        expect(result.validity.level).toBe("green");
      });
    });
  }
});

describe("validated ranges declared by physics are covered by reference rows", () => {
  const geopotentials = ICAO_DOC_7488_TROPOSPHERE.map((row) =>
    row.exactAltitude.kind === "geopotential"
      ? row.exactAltitude.value_m
      : geopotentialFromGeometric(meters(row.exactAltitude.value_m)),
  );
  const temperatures = ICAO_DOC_7488_TROPOSPHERE.map((row) => row.temperature_K);

  it("altitude: the reference rows reach both ends of the validated range", () => {
    expect(Math.min(...geopotentials)).toBeLessThanOrEqual(ISA_ALTITUDE_RANGE.validated.min);
    expect(Math.max(...geopotentials)).toBeGreaterThanOrEqual(ISA_ALTITUDE_RANGE.validated.max);
  });

  it("temperature: the reference rows reach both ends of the validated band", () => {
    expect(Math.min(...temperatures)).toBeLessThanOrEqual(ISA_TEMPERATURE_RANGE.validated.min);
    expect(Math.max(...temperatures)).toBeGreaterThanOrEqual(ISA_TEMPERATURE_RANGE.validated.max);
  });

  it("the dataset states its publication, transcription chain and tolerance rationale", () => {
    expect(ICAO_DOC_7488_SOURCE.publication).toMatch(/Doc 7488/);
    expect(ICAO_DOC_7488_SOURCE.transcription.length).toBeGreaterThan(0);
    expect(ICAO_DOC_7488_TOLERANCE.rationale.length).toBeGreaterThan(0);
  });
});
