/**
 * Defining constants of the standard atmosphere.
 *
 * Source: ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere (3rd ed.,
 * 1993). Below 32 km geopotential it is identical to ISO 2533:1975 and to the
 * U.S. Standard Atmosphere, 1976.
 */
import {
  dimensionless,
  joulesPerKilogramKelvin,
  kelvin,
  kelvinPerMeter,
  meters,
  metersPerSecondSquared,
  pascals,
  quantity,
} from "../core/units.ts";

/** Standard acceleration of gravity, g0. */
export const STANDARD_GRAVITY = metersPerSecondSquared(9.80665);

/** Specific gas constant of dry air, R = R* / M0. */
export const AIR_GAS_CONSTANT = joulesPerKilogramKelvin(287.05287);

/** Ratio of specific heats of air, gamma = cp / cv. */
export const AIR_HEAT_CAPACITY_RATIO = dimensionless(1.4);

/** Mean sea-level temperature, T0. */
export const SEA_LEVEL_TEMPERATURE = kelvin(288.15);

/** Mean sea-level pressure, p0. */
export const SEA_LEVEL_PRESSURE = pascals(101325);

/** Temperature gradient of the lowest layer (troposphere), dT/dH. */
export const TROPOSPHERE_LAPSE_RATE = kelvinPerMeter(-0.0065);

/** Lower limit of the tabulated standard atmosphere (geopotential). */
export const TROPOSPHERE_BASE_ALTITUDE = meters(-5000);

/** Tropopause: above it the temperature gradient changes (geopotential). */
export const TROPOPAUSE_ALTITUDE = meters(11000);

/** Sutherland's constant beta for air: mu = beta * T^1.5 / (T + S). */
export const SUTHERLAND_BETA = quantity(1.458e-6, "kg/(m*s*K^0.5)");

/** Sutherland's temperature S for air. */
export const SUTHERLAND_TEMPERATURE = kelvin(110.4);

/** Nominal Earth radius used to relate geometric and geopotential altitude. */
export const NOMINAL_EARTH_RADIUS = meters(6356766);
