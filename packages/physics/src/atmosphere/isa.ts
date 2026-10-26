/**
 * International Standard Atmosphere, lowest layer (troposphere).
 *
 * Method: ICAO Doc 7488/3 (1993) = ISO 2533:1975 = U.S. Standard Atmosphere
 * 1976 below 32 km. Temperature falls linearly with geopotential altitude H;
 * pressure follows from hydrostatic balance of an ideal gas with constant g0:
 *
 *   T(H)  = T0 + L * H
 *   p(H)  = p0 * (T / T0)^(-g0 / (L * R))
 *   rho   = p / (R * T)
 *   mu    = beta * T^1.5 / (T + S)          (Sutherland)
 *   nu    = mu / rho
 *   a     = sqrt(gamma * R * T)
 *
 * Non-standard temperature (ISA + dT, or a given temperature): pressure stays
 * the ISA value at that altitude (the altitude acts as a pressure altitude) and
 * density follows from the ideal gas law with the actual temperature.
 *
 * Validated against ICAO Doc 7488/3 tabulated values from H = -5000 m to
 * H = 11000 m (see packages/validation). Humidity is not modelled.
 */
import type { Assumption, Method, Result, ValidityCheck } from "../core/result.ts";
import {
  kelvin,
  kilogramsPerCubicMeter,
  meters,
  metersPerSecond,
  pascalSeconds,
  pascals,
  squareMetersPerSecond,
  type Kelvin,
  type KilogramsPerCubicMeter,
  type Meters,
  type MetersPerSecond,
  type PascalSeconds,
  type Pascals,
  type SquareMetersPerSecond,
  type UnitsOf,
} from "../core/units.ts";
import { checkRange, combineValidity } from "../core/validity.ts";
import {
  AIR_GAS_CONSTANT,
  AIR_HEAT_CAPACITY_RATIO,
  NOMINAL_EARTH_RADIUS,
  SEA_LEVEL_PRESSURE,
  SEA_LEVEL_TEMPERATURE,
  STANDARD_GRAVITY,
  SUTHERLAND_BETA,
  SUTHERLAND_TEMPERATURE,
  TROPOPAUSE_ALTITUDE,
  TROPOSPHERE_BASE_ALTITUDE,
  TROPOSPHERE_LAPSE_RATE,
} from "./constants.ts";
import { GEOPOTENTIAL_ALTITUDE, ISA_TROPOSPHERE, SUTHERLAND_VISCOSITY } from "./methods.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Altitude, always stated with its kind. Geometric altitude is what a GPS or a
 * map gives; geopotential altitude is what the standard atmosphere uses.
 */
export type AltitudeInput =
  | { readonly kind: "geometric"; readonly value: Meters }
  | { readonly kind: "geopotential"; readonly value: Meters };

/** Air temperature: standard, standard plus an offset, or a given value. */
export type TemperatureInput =
  | { readonly kind: "standard" }
  | { readonly kind: "offset"; readonly deltaT: Kelvin }
  | { readonly kind: "absolute"; readonly value: Kelvin };

export interface AtmosphereQuery {
  readonly altitude: AltitudeInput;
  /** Defaults to the standard temperature at that altitude. */
  readonly temperature?: TemperatureInput;
}

export interface AtmosphereState {
  readonly geopotentialAltitude: Meters;
  readonly temperature: Kelvin;
  readonly pressure: Pascals;
  readonly density: KilogramsPerCubicMeter;
  readonly dynamicViscosity: PascalSeconds;
  readonly kinematicViscosity: SquareMetersPerSecond;
  readonly speedOfSound: MetersPerSecond;
}

/** Display units of every field, checked by the compiler against the types. */
export const ATMOSPHERE_STATE_UNITS = {
  geopotentialAltitude: "m",
  temperature: "K",
  pressure: "Pa",
  density: "kg/m^3",
  dynamicViscosity: "Pa*s",
  kinematicViscosity: "m^2/s",
  speedOfSound: "m/s",
} as const satisfies UnitsOf<AtmosphereState>;

// ---------------------------------------------------------------------------
// Validity ranges
// ---------------------------------------------------------------------------

/**
 * Altitude range of the lowest standard layer. It is also the validated
 * range: the reference cases cover H = -5000 m and H = 11000 m and points in
 * between. A test in packages/validation fails if this range is widened
 * without adding reference cases that cover it.
 */
export const ISA_ALTITUDE_RANGE = {
  validated: { min: TROPOSPHERE_BASE_ALTITUDE, max: TROPOPAUSE_ALTITUDE },
  applicable: { min: TROPOSPHERE_BASE_ALTITUDE, max: TROPOPAUSE_ALTITUDE },
} as const;

/**
 * Temperatures at which Sutherland's law and the ideal-gas density are
 * checked against reference values: the standard temperatures at
 * H = 11000 m (216.65 K) and H = -5000 m (320.65 K). No cited upper or lower
 * limit of Sutherland's law is asserted here, so outside this band results
 * are amber, never green; non-physical temperatures (<= 0 K) are rejected.
 */
export const ISA_TEMPERATURE_RANGE = {
  validated: { min: 216.65, max: 320.65 },
  applicable: { min: 0, max: Number.POSITIVE_INFINITY },
} as const;

// ---------------------------------------------------------------------------
// Building blocks (exact relations of the standard)
// ---------------------------------------------------------------------------

/** H = r0 * Z / (r0 + Z), with the nominal Earth radius r0 of the standard. */
export function geopotentialFromGeometric(geometric: Meters): Meters {
  const r0 = NOMINAL_EARTH_RADIUS;
  return meters((r0 * geometric) / (r0 + geometric));
}

/** Z = r0 * H / (r0 - H), inverse of `geopotentialFromGeometric`. */
export function geometricFromGeopotential(geopotential: Meters): Meters {
  const r0 = NOMINAL_EARTH_RADIUS;
  return meters((r0 * geopotential) / (r0 - geopotential));
}

function standardTemperature(geopotential: Meters): number {
  return SEA_LEVEL_TEMPERATURE + TROPOSPHERE_LAPSE_RATE * geopotential;
}

/** Hydrostatic exponent -g0 / (L * R) of the lowest layer (about 5.2559). */
const PRESSURE_EXPONENT = -STANDARD_GRAVITY / (TROPOSPHERE_LAPSE_RATE * AIR_GAS_CONSTANT);

function standardPressure(standardT: number): number {
  return SEA_LEVEL_PRESSURE * (standardT / SEA_LEVEL_TEMPERATURE) ** PRESSURE_EXPONENT;
}

function sutherlandViscosity(temperature: number): number {
  return (SUTHERLAND_BETA * temperature ** 1.5) / (temperature + SUTHERLAND_TEMPERATURE);
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

const ASSUMPTIONS = {
  dryAir: {
    id: "dry-air",
    description: "Dry air: humidity is neglected (humid air is less dense than dry air).",
  },
  idealGas: {
    id: "ideal-gas",
    description: "Air is an ideal gas with R = 287.05287 J/(kg*K) and gamma = 1.4.",
  },
  standardGravity: {
    id: "standard-gravity",
    description:
      "Hydrostatics use constant standard gravity g0 = 9.80665 m/s^2, which is why altitude is geopotential.",
  },
  geometricConversion: {
    id: "geometric-to-geopotential",
    description: "Geometric altitude is converted to geopotential with the nominal Earth radius r0 = 6356766 m.",
  },
  pressureAltitude: {
    id: "pressure-altitude",
    description:
      "Pressure is the standard value at this altitude (the altitude acts as a pressure altitude); only the temperature departs from standard. Real pressure also varies with the weather.",
  },
} as const satisfies Record<string, Assumption>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Air properties at an altitude, with method, assumptions and validity.
 *
 * Outside the lowest standard layer (H < -5000 m or H > 11000 m) the
 * troposphere law no longer applies: the values are still returned so the UI
 * can show them, but validity is red. Throws on non-physical input (a
 * temperature at or below 0 K).
 */
export function atmosphere(query: AtmosphereQuery): Result<AtmosphereState> {
  const { altitude } = query;
  const temperatureInput: TemperatureInput = query.temperature ?? { kind: "standard" };

  const geopotential =
    altitude.kind === "geopotential" ? altitude.value : geopotentialFromGeometric(altitude.value);

  const standardT = standardTemperature(geopotential);
  if (!(standardT > 0)) {
    throw new RangeError(
      `Standard temperature at H = ${geopotential} m is not positive; the troposphere law cannot be evaluated there.`,
    );
  }

  const actualT =
    temperatureInput.kind === "standard"
      ? standardT
      : temperatureInput.kind === "offset"
        ? standardT + temperatureInput.deltaT
        : temperatureInput.value;
  if (!(actualT > 0)) {
    throw new RangeError(`Air temperature must be above 0 K, got ${actualT} K.`);
  }

  const pressure = standardPressure(standardT);
  const density = pressure / (AIR_GAS_CONSTANT * actualT);
  const dynamicViscosity = sutherlandViscosity(actualT);

  const value: AtmosphereState = {
    geopotentialAltitude: geopotential,
    temperature: kelvin(actualT),
    pressure: pascals(pressure),
    density: kilogramsPerCubicMeter(density),
    dynamicViscosity: pascalSeconds(dynamicViscosity),
    kinematicViscosity: squareMetersPerSecond(dynamicViscosity / density),
    speedOfSound: metersPerSecond(Math.sqrt(AIR_HEAT_CAPACITY_RATIO * AIR_GAS_CONSTANT * actualT)),
  };

  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "geopotentialAltitude",
      value: geopotential,
      unit: "m",
      ...ISA_ALTITUDE_RANGE,
      note: "Lowest layer of the standard atmosphere (H from -5000 m to the tropopause at 11000 m). Above 11000 m the temperature gradient changes and this law does not apply.",
    }),
    checkRange({
      quantity: "temperature",
      value: actualT,
      unit: "K",
      ...ISA_TEMPERATURE_RANGE,
      note: "Sutherland's law and the ideal-gas density are validated between 216.65 K and 320.65 K. Outside that band no validation case covers them.",
    }),
  ];

  const methods: Method[] = [ISA_TROPOSPHERE, SUTHERLAND_VISCOSITY];
  const assumptions: Assumption[] = [
    ASSUMPTIONS.dryAir,
    ASSUMPTIONS.idealGas,
    ASSUMPTIONS.standardGravity,
  ];
  if (altitude.kind === "geometric") {
    methods.push(GEOPOTENTIAL_ALTITUDE);
    assumptions.push(ASSUMPTIONS.geometricConversion);
  }
  if (temperatureInput.kind !== "standard") {
    assumptions.push(ASSUMPTIONS.pressureAltitude);
  }

  return {
    value,
    provenance: "CALCULATED",
    methods,
    assumptions,
    validity: combineValidity(checks),
  };
}
