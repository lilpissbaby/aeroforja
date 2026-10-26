/**
 * Air properties: International Standard Atmosphere (lowest layer) and
 * measured ambient conditions, optionally with humidity.
 *
 * Standard atmosphere — ICAO Doc 7488/3 (1993) = ISO 2533:1975 = U.S.
 * Standard Atmosphere 1976 below 32 km. Temperature falls linearly with
 * geopotential altitude H; pressure follows from hydrostatic balance of an
 * ideal gas with constant g0:
 *
 *   T(H)  = T0 + L * H
 *   p(H)  = p0 * (T / T0)^(-g0 / (L * R))
 *
 * Air state from (p, T, RH), shared by both entry points:
 *
 *   rho   = (p - e) / (R_d T) + e / (R_v T),  e = RH * e_s(T)   (dry: e = 0)
 *   mu    = beta * T^1.5 / (T + S)                              (Sutherland)
 *   nu    = mu / rho
 *   a     = sqrt(gamma * R_d * T)
 *
 * Non-standard temperature in the ISA (ISA + dT, or a given temperature):
 * pressure stays the ISA value at that altitude (pressure altitude) and
 * density follows from the actual temperature.
 *
 * Measured conditions: pressure and temperature come from the user's
 * barometer and thermometer; no altitude is involved.
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
  type Dimensionless,
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
import {
  HUMID_AIR_PRESSURE_RANGE,
  HUMID_AIR_TEMPERATURE_RANGE,
  MAGNUS_SATURATION_PRESSURE,
  MOIST_AIR_PARTIAL_PRESSURES,
  WATER_VAPOUR_GAS_CONSTANT,
  saturationVapourPressure,
} from "./humidity.ts";
import {
  GEOPOTENTIAL_ALTITUDE,
  IDEAL_GAS_AIR,
  ISA_TROPOSPHERE,
  SUTHERLAND_VISCOSITY,
} from "./methods.ts";

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
  /** Relative humidity over liquid water, as a fraction 0..1. Omit for dry air. */
  readonly relativeHumidity?: Dimensionless;
}

/** Ambient conditions measured by the user (barometer, thermometer, hygrometer). */
export interface MeasuredAmbient {
  /** Static (station) pressure, not the sea-level QNH value. */
  readonly pressure: Pascals;
  readonly temperature: Kelvin;
  /** Relative humidity over liquid water, as a fraction 0..1. Omit for dry air. */
  readonly relativeHumidity?: Dimensionless;
}

export interface AirState {
  readonly temperature: Kelvin;
  readonly pressure: Pascals;
  /** Partial pressure of water vapour; 0 for dry air. */
  readonly vapourPressure: Pascals;
  readonly density: KilogramsPerCubicMeter;
  readonly dynamicViscosity: PascalSeconds;
  readonly kinematicViscosity: SquareMetersPerSecond;
  readonly speedOfSound: MetersPerSecond;
}

export interface AtmosphereState extends AirState {
  readonly geopotentialAltitude: Meters;
}

/** Display units of every field, checked by the compiler against the types. */
export const AIR_STATE_UNITS = {
  temperature: "K",
  pressure: "Pa",
  vapourPressure: "Pa",
  density: "kg/m^3",
  dynamicViscosity: "Pa*s",
  kinematicViscosity: "m^2/s",
  speedOfSound: "m/s",
} as const satisfies UnitsOf<AirState>;

export const ATMOSPHERE_STATE_UNITS = {
  geopotentialAltitude: "m",
  ...AIR_STATE_UNITS,
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

/** Dry-air pressures covered by the standard-atmosphere reference rows. */
export const DRY_AIR_PRESSURE_RANGE = {
  validated: { min: 22632, max: 177687 },
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
  moistAir: {
    id: "moist-air-ideal-mixture",
    description:
      "Moist air is an ideal mixture of dry air and water vapour; real-gas compressibility (about 0.07 % on density) is neglected.",
  },
  moistTransport: {
    id: "moist-air-dry-transport",
    description:
      "Viscosity and speed of sound are those of dry air at the same temperature: the effect of water vapour on them is not modelled (small in temperate air, up to a few percent in hot saturated air).",
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
  measuredAmbient: {
    id: "measured-ambient",
    description:
      "Pressure, temperature and humidity are the user's measurements; the result is as accurate as those instruments.",
  },
} as const satisfies Record<string, Assumption>;

// ---------------------------------------------------------------------------
// Shared air-state computation
// ---------------------------------------------------------------------------

interface AirStateParts {
  readonly state: AirState;
  readonly checks: ValidityCheck[];
  readonly methods: Method[];
  readonly assumptions: Assumption[];
}

function computeAirState(
  pressure: number,
  temperature: number,
  relativeHumidity: number | undefined,
): AirStateParts {
  if (!(temperature > 0)) {
    throw new RangeError(`Air temperature must be above 0 K, got ${temperature} K.`);
  }
  if (!(pressure > 0)) {
    throw new RangeError(`Air pressure must be above 0 Pa, got ${pressure} Pa.`);
  }
  if (relativeHumidity !== undefined && !(relativeHumidity >= 0 && relativeHumidity <= 1)) {
    throw new RangeError(
      `Relative humidity is a fraction between 0 and 1, got ${relativeHumidity}.`,
    );
  }

  const humid = relativeHumidity !== undefined;
  const vapourPressure = humid ? relativeHumidity * saturationVapourPressure(temperature) : 0;
  if (!(vapourPressure < pressure)) {
    throw new RangeError(
      `Vapour pressure ${vapourPressure} Pa is not below the total pressure ${pressure} Pa.`,
    );
  }

  const density =
    (pressure - vapourPressure) / (AIR_GAS_CONSTANT * temperature) +
    vapourPressure / (WATER_VAPOUR_GAS_CONSTANT * temperature);
  const dynamicViscosity = sutherlandViscosity(temperature);

  const state: AirState = {
    temperature: kelvin(temperature),
    pressure: pascals(pressure),
    vapourPressure: pascals(vapourPressure),
    density: kilogramsPerCubicMeter(density),
    dynamicViscosity: pascalSeconds(dynamicViscosity),
    kinematicViscosity: squareMetersPerSecond(dynamicViscosity / density),
    speedOfSound: metersPerSecond(
      Math.sqrt(AIR_HEAT_CAPACITY_RATIO * AIR_GAS_CONSTANT * temperature),
    ),
  };

  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "temperature",
      value: temperature,
      unit: "K",
      ...ISA_TEMPERATURE_RANGE,
      note: "Sutherland's law and the ideal-gas density are validated between 216.65 K and 320.65 K. Outside that band no validation case covers them.",
    }),
  ];
  const methods: Method[] = [IDEAL_GAS_AIR, SUTHERLAND_VISCOSITY];
  const assumptions: Assumption[] = [ASSUMPTIONS.idealGas];

  if (humid) {
    checks.push(
      checkRange({
        quantity: "humidAirTemperature",
        value: temperature,
        unit: "K",
        ...HUMID_AIR_TEMPERATURE_RANGE,
        note: "Magnus saturation pressure is fitted from -40 to 50 degrees C and validated here from 0 to 50 degrees C (IAPWS-95, ASHRAE RP-1485).",
      }),
      checkRange({
        quantity: "humidAirPressure",
        value: pressure,
        unit: "Pa",
        ...HUMID_AIR_PRESSURE_RANGE,
        note: "Moist-air density is validated against ASHRAE RP-1485 between 70 kPa and 105 kPa.",
      }),
    );
    methods.push(MOIST_AIR_PARTIAL_PRESSURES, MAGNUS_SATURATION_PRESSURE);
    assumptions.push(ASSUMPTIONS.moistAir, ASSUMPTIONS.moistTransport);
  } else {
    assumptions.push(ASSUMPTIONS.dryAir);
  }

  return { state, checks, methods, assumptions };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Air properties at an altitude in the standard atmosphere, with method,
 * assumptions and validity.
 *
 * Outside the lowest standard layer (H < -5000 m or H > 11000 m) the
 * troposphere law no longer applies: the values are still returned so the UI
 * can show them, but validity is red. Throws on non-physical input.
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

  const air = computeAirState(standardPressure(standardT), actualT, query.relativeHumidity);

  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "geopotentialAltitude",
      value: geopotential,
      unit: "m",
      ...ISA_ALTITUDE_RANGE,
      note: "Lowest layer of the standard atmosphere (H from -5000 m to the tropopause at 11000 m). Above 11000 m the temperature gradient changes and this law does not apply.",
    }),
    ...air.checks,
  ];

  const methods: Method[] = [ISA_TROPOSPHERE, ...air.methods];
  const assumptions: Assumption[] = [...air.assumptions, ASSUMPTIONS.standardGravity];
  if (altitude.kind === "geometric") {
    methods.push(GEOPOTENTIAL_ALTITUDE);
    assumptions.push(ASSUMPTIONS.geometricConversion);
  }
  if (temperatureInput.kind !== "standard") {
    assumptions.push(ASSUMPTIONS.pressureAltitude);
  }

  return {
    value: { geopotentialAltitude: geopotential, ...air.state },
    provenance: "CALCULATED",
    methods,
    assumptions,
    validity: combineValidity(checks),
  };
}

/**
 * Air properties from measured pressure and temperature (and optionally
 * humidity), for comparing simulations with real tests. Use the station
 * pressure read on site, not the sea-level QNH of a weather report.
 */
export function measuredAtmosphere(ambient: MeasuredAmbient): Result<AirState> {
  const air = computeAirState(ambient.pressure, ambient.temperature, ambient.relativeHumidity);
  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "pressure",
      value: ambient.pressure,
      unit: "Pa",
      ...DRY_AIR_PRESSURE_RANGE,
      note: "Ideal-gas density of dry air is validated between 22.6 kPa and 177.7 kPa (standard-atmosphere reference rows).",
    }),
    ...air.checks,
  ];
  return {
    value: air.state,
    provenance: "CALCULATED",
    methods: air.methods,
    assumptions: [ASSUMPTIONS.measuredAmbient, ...air.assumptions],
    validity: combineValidity(checks),
  };
}
