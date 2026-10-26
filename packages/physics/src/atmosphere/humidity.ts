/**
 * Moist air as an ideal mixture of dry air and water vapour.
 *
 *   e      = RH * e_s(T)
 *   e_s(T) = 610.94 Pa * exp(17.625 t / (t + 243.04)),  t in degrees Celsius
 *            (Magnus form over liquid water, Alduchov & Eskridge 1996)
 *   rho    = (p - e) / (R_d T) + e / (R_v T)            (partial pressures)
 *
 * R_d is the dry-air constant of the standard atmosphere; R_v uses the same
 * universal gas constant and the molar mass of water, so both are consistent.
 */
import type { Method } from "../core/result.ts";
import { joulesPerKilogramKelvin, kelvin, pascals } from "../core/units.ts";

/** Universal gas constant as adopted by ICAO Doc 7488/3, J/(kmol*K). */
const UNIVERSAL_GAS_CONSTANT_ICAO = 8314.32;

/** Molar mass of water, kg/kmol. */
const WATER_MOLAR_MASS = 18.01528;

/** Specific gas constant of water vapour, R* / M_w. */
export const WATER_VAPOUR_GAS_CONSTANT = joulesPerKilogramKelvin(
  UNIVERSAL_GAS_CONSTANT_ICAO / WATER_MOLAR_MASS,
);

const MAGNUS_E0 = pascals(610.94);
const MAGNUS_A = 17.625;
const MAGNUS_B = kelvin(243.04);
const CELSIUS_ZERO = 273.15;

/** Saturation vapour pressure over liquid water (Pa) at temperature T (K). */
export function saturationVapourPressure(temperature: number): number {
  const t = temperature - CELSIUS_ZERO;
  return MAGNUS_E0 * Math.exp((MAGNUS_A * t) / (t + MAGNUS_B));
}

/**
 * Temperatures the Magnus fit was derived for (-40 to 50 degrees C), and the
 * band validated in this project against IAPWS-95 and ASHRAE RP-1485 (0 to
 * 50 degrees C). Below 0 degrees C relative humidity is taken over
 * supercooled water, as is meteorological practice.
 */
export const HUMID_AIR_TEMPERATURE_RANGE = {
  validated: { min: 273.15, max: 323.15 },
  applicable: { min: 233.15, max: 323.15 },
} as const;

/** Pressures covered by the humid-air validation cases. */
export const HUMID_AIR_PRESSURE_RANGE = {
  validated: { min: 70000, max: 105000 },
  applicable: { min: 0, max: Number.POSITIVE_INFINITY },
} as const;

export const MAGNUS_SATURATION_PRESSURE: Method = {
  id: "magnus-alduchov-eskridge",
  name: "Saturation vapour pressure over water, Magnus form with the coefficients of Alduchov & Eskridge",
  references: [
    {
      citation:
        'Alduchov, O. A., Eskridge, R. E. (1996). "Improved Magnus Form Approximation of Saturation Vapor Pressure". Journal of Applied Meteorology 35(4), 601-609.',
    },
  ],
};

export const MOIST_AIR_PARTIAL_PRESSURES: Method = {
  id: "moist-air-ideal-mixture",
  name: "Moist air density as an ideal mixture of dry air and water vapour (Dalton's law of partial pressures)",
  references: [
    {
      citation:
        "Wallace, J. M., Hobbs, P. V. (2006). Atmospheric Science: An Introductory Survey, 2nd ed., Academic Press, ch. 3 (gas laws for moist air, virtual temperature).",
    },
    {
      citation:
        "ICAO Doc 7488/3 (1993) for the dry-air and universal gas constants; molar mass of water 18.01528 kg/kmol.",
    },
  ],
};
