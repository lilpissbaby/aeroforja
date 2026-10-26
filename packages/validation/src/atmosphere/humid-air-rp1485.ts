/**
 * Reference values for moist air and for the saturation pressure of water.
 *
 * These are not measurements or printed tables: they are evaluations of two
 * published reference formulations by their open-source reference
 * implementation, recorded with the exact library version so they can be
 * regenerated and audited.
 */
import type { DatasetSource, Tolerance } from "../types.ts";

export const HUMID_AIR_SOURCE: DatasetSource = {
  publication:
    "Moist-air density: ASHRAE RP-1485 real-gas model — Herrmann, S., Kretzschmar, H.-J., Gatley, D. P. (2009), Thermodynamic Properties of Real Moist Air, Dry Air, Steam, Water, and Ice, ASHRAE. Saturation pressure of water: IAPWS-95 — Wagner, W., Pruss, A. (2002), J. Phys. Chem. Ref. Data 31(2), 387-535.",
  transcription:
    "Computed on 2026-10-27 with CoolProp 8.0.0 (git ae81610e7d23efc57f9d051c8e70a4d66e87537f): HAPropsSI('Vha', T, P, R) for density (rho = 1/Vha, per kg of humid air) and PropsSI('P', 'T', T, 'Q', 0, 'Water') for saturation pressure. CoolProp: Bell, I. H., Wronski, J., Quoilin, S., Lemort, V. (2014), Ind. Eng. Chem. Res. 53(6), 2498-2508.",
  crossChecks: [
    "Saturation pressure at 273.16 K (611.655 Pa) matches the triple-point pressure of IAPWS-95 (611.657 Pa) to 3e-6.",
  ],
  retrieved: "2026-10-27",
  license: "Values computed with CoolProp (MIT license).",
};

/**
 * AeroForja models moist air as an ideal mixture: it neglects the
 * compressibility factor of real air (about 0.9994 at 0 degrees C, i.e. up to
 * ~0.07 % on density) and the vapour enhancement factor (~0.4 % on e, at most
 * ~0.03 % on density here). 0.1 % covers both with margin; anything larger is a
 * modelling or coding error.
 */
export const HUMID_AIR_DENSITY_TOLERANCE: Tolerance = {
  relative: 1e-3,
  rationale:
    "Ideal-mixture model vs real-gas RP-1485: compressibility up to ~0.07 % and enhancement factor up to ~0.03 % on density.",
};

/**
 * Magnus-type fits reproduce the IAPWS saturation curve to a few tenths of a
 * percent between 0 and 50 degrees C. Its effect on density is scaled by
 * (1 - eps) e / p, at most ~0.07 here (50 degrees C, saturated, 70 kPa), so
 * 0.3 % on e is at most ~0.02 % on rho.
 */
export const SATURATION_PRESSURE_TOLERANCE: Tolerance = {
  relative: 3e-3,
  rationale:
    "Accuracy of the Magnus fit against IAPWS-95 over 0..50 degrees C; its effect on density is at least an order of magnitude smaller.",
};

export const SATURATION_ROWS = [
  { temperature_K: 273.16, saturationPressure_Pa: 611.6548 },
  { temperature_K: 283.15, saturationPressure_Pa: 1228.1989 },
  { temperature_K: 293.15, saturationPressure_Pa: 2339.3182 },
  { temperature_K: 303.15, saturationPressure_Pa: 4246.9708 },
  { temperature_K: 313.15, saturationPressure_Pa: 7384.9381 },
  { temperature_K: 323.15, saturationPressure_Pa: 12351.9458 },
] as const;
export const HUMID_AIR_ROWS = [
  { pressure_Pa: 70000.0, temperature_K: 273.15, relativeHumidity: 0.0, density_kg_m3: 0.8931647 },
  { pressure_Pa: 70000.0, temperature_K: 273.15, relativeHumidity: 0.5, density_kg_m3: 0.8916931 },
  { pressure_Pa: 70000.0, temperature_K: 273.15, relativeHumidity: 1.0, density_kg_m3: 0.8902237 },
  { pressure_Pa: 70000.0, temperature_K: 283.15, relativeHumidity: 0.0, density_kg_m3: 0.8615489 },
  { pressure_Pa: 70000.0, temperature_K: 283.15, relativeHumidity: 0.5, density_kg_m3: 0.8586966 },
  { pressure_Pa: 70000.0, temperature_K: 283.15, relativeHumidity: 1.0, density_kg_m3: 0.8558505 },
  { pressure_Pa: 70000.0, temperature_K: 293.15, relativeHumidity: 0.0, density_kg_m3: 0.8320993 },
  { pressure_Pa: 70000.0, temperature_K: 293.15, relativeHumidity: 0.5, density_kg_m3: 0.8268529 },
  { pressure_Pa: 70000.0, temperature_K: 293.15, relativeHumidity: 1.0, density_kg_m3: 0.8216236 },
  { pressure_Pa: 70000.0, temperature_K: 303.15, relativeHumidity: 0.0, density_kg_m3: 0.8046001 },
  { pressure_Pa: 70000.0, temperature_K: 303.15, relativeHumidity: 0.5, density_kg_m3: 0.7953921 },
  { pressure_Pa: 70000.0, temperature_K: 303.15, relativeHumidity: 1.0, density_kg_m3: 0.7862277 },
  { pressure_Pa: 70000.0, temperature_K: 313.15, relativeHumidity: 0.0, density_kg_m3: 0.7788635 },
  { pressure_Pa: 70000.0, temperature_K: 313.15, relativeHumidity: 0.5, density_kg_m3: 0.7633697 },
  { pressure_Pa: 70000.0, temperature_K: 313.15, relativeHumidity: 1.0, density_kg_m3: 0.7479778 },
  { pressure_Pa: 70000.0, temperature_K: 323.15, relativeHumidity: 0.0, density_kg_m3: 0.7547249 },
  { pressure_Pa: 70000.0, temperature_K: 323.15, relativeHumidity: 0.5, density_kg_m3: 0.7296284 },
  { pressure_Pa: 70000.0, temperature_K: 323.15, relativeHumidity: 1.0, density_kg_m3: 0.7047520 },
  { pressure_Pa: 79501.4, temperature_K: 273.15, relativeHumidity: 0.0, density_kg_m3: 1.0144549 },
  { pressure_Pa: 79501.4, temperature_K: 273.15, relativeHumidity: 0.5, density_kg_m3: 1.0129835 },
  { pressure_Pa: 79501.4, temperature_K: 273.15, relativeHumidity: 1.0, density_kg_m3: 1.0115143 },
  { pressure_Pa: 79501.4, temperature_K: 283.15, relativeHumidity: 0.0, density_kg_m3: 0.9785347 },
  { pressure_Pa: 79501.4, temperature_K: 283.15, relativeHumidity: 0.5, density_kg_m3: 0.9756827 },
  { pressure_Pa: 79501.4, temperature_K: 283.15, relativeHumidity: 1.0, density_kg_m3: 0.9728371 },
  { pressure_Pa: 79501.4, temperature_K: 293.15, relativeHumidity: 0.0, density_kg_m3: 0.9450769 },
  { pressure_Pa: 79501.4, temperature_K: 293.15, relativeHumidity: 0.5, density_kg_m3: 0.9398313 },
  { pressure_Pa: 79501.4, temperature_K: 293.15, relativeHumidity: 1.0, density_kg_m3: 0.9346029 },
  { pressure_Pa: 79501.4, temperature_K: 303.15, relativeHumidity: 0.0, density_kg_m3: 0.9138363 },
  { pressure_Pa: 79501.4, temperature_K: 303.15, relativeHumidity: 0.5, density_kg_m3: 0.9046296 },
  { pressure_Pa: 79501.4, temperature_K: 303.15, relativeHumidity: 1.0, density_kg_m3: 0.8954667 },
  { pressure_Pa: 79501.4, temperature_K: 313.15, relativeHumidity: 0.0, density_kg_m3: 0.8845989 },
  { pressure_Pa: 79501.4, temperature_K: 313.15, relativeHumidity: 0.5, density_kg_m3: 0.8691071 },
  { pressure_Pa: 79501.4, temperature_K: 313.15, relativeHumidity: 1.0, density_kg_m3: 0.8537180 },
  { pressure_Pa: 79501.4, temperature_K: 323.15, relativeHumidity: 0.0, density_kg_m3: 0.8571777 },
  { pressure_Pa: 79501.4, temperature_K: 323.15, relativeHumidity: 0.5, density_kg_m3: 0.8320836 },
  { pressure_Pa: 79501.4, temperature_K: 323.15, relativeHumidity: 1.0, density_kg_m3: 0.8072127 },
  { pressure_Pa: 95000.0, temperature_K: 273.15, relativeHumidity: 0.0, density_kg_m3: 1.2123315 },
  { pressure_Pa: 95000.0, temperature_K: 273.15, relativeHumidity: 0.5, density_kg_m3: 1.2108605 },
  { pressure_Pa: 95000.0, temperature_K: 273.15, relativeHumidity: 1.0, density_kg_m3: 1.2093916 },
  { pressure_Pa: 95000.0, temperature_K: 283.15, relativeHumidity: 0.0, density_kg_m3: 1.1693832 },
  { pressure_Pa: 95000.0, temperature_K: 283.15, relativeHumidity: 0.5, density_kg_m3: 1.1665320 },
  { pressure_Pa: 95000.0, temperature_K: 283.15, relativeHumidity: 1.0, density_kg_m3: 1.1636871 },
  { pressure_Pa: 95000.0, temperature_K: 293.15, relativeHumidity: 0.0, density_kg_m3: 1.1293820 },
  { pressure_Pa: 95000.0, temperature_K: 293.15, relativeHumidity: 0.5, density_kg_m3: 1.1241376 },
  { pressure_Pa: 95000.0, temperature_K: 293.15, relativeHumidity: 1.0, density_kg_m3: 1.1189106 },
  { pressure_Pa: 95000.0, temperature_K: 303.15, relativeHumidity: 0.0, density_kg_m3: 1.0920337 },
  { pressure_Pa: 95000.0, temperature_K: 303.15, relativeHumidity: 0.5, density_kg_m3: 1.0828291 },
  { pressure_Pa: 95000.0, temperature_K: 303.15, relativeHumidity: 1.0, density_kg_m3: 1.0736688 },
  { pressure_Pa: 95000.0, temperature_K: 313.15, relativeHumidity: 0.0, density_kg_m3: 1.0570822 },
  { pressure_Pa: 95000.0, temperature_K: 313.15, relativeHumidity: 0.5, density_kg_m3: 1.0415937 },
  { pressure_Pa: 95000.0, temperature_K: 313.15, relativeHumidity: 1.0, density_kg_m3: 1.0262092 },
  { pressure_Pa: 95000.0, temperature_K: 323.15, relativeHumidity: 0.0, density_kg_m3: 1.0243033 },
  { pressure_Pa: 95000.0, temperature_K: 323.15, relativeHumidity: 0.5, density_kg_m3: 0.9992136 },
  { pressure_Pa: 95000.0, temperature_K: 323.15, relativeHumidity: 1.0, density_kg_m3: 0.9743511 },
  { pressure_Pa: 101325.0, temperature_K: 273.15, relativeHumidity: 0.0, density_kg_m3: 1.2930956 },
  { pressure_Pa: 101325.0, temperature_K: 273.15, relativeHumidity: 0.5, density_kg_m3: 1.2916248 },
  { pressure_Pa: 101325.0, temperature_K: 273.15, relativeHumidity: 1.0, density_kg_m3: 1.2901560 },
  { pressure_Pa: 101325.0, temperature_K: 283.15, relativeHumidity: 0.0, density_kg_m3: 1.2472768 },
  { pressure_Pa: 101325.0, temperature_K: 283.15, relativeHumidity: 0.5, density_kg_m3: 1.2444258 },
  { pressure_Pa: 101325.0, temperature_K: 283.15, relativeHumidity: 1.0, density_kg_m3: 1.2415812 },
  { pressure_Pa: 101325.0, temperature_K: 293.15, relativeHumidity: 0.0, density_kg_m3: 1.2046031 },
  { pressure_Pa: 101325.0, temperature_K: 293.15, relativeHumidity: 0.5, density_kg_m3: 1.1993593 },
  { pressure_Pa: 101325.0, temperature_K: 293.15, relativeHumidity: 1.0, density_kg_m3: 1.1941329 },
  { pressure_Pa: 101325.0, temperature_K: 303.15, relativeHumidity: 0.0, density_kg_m3: 1.1647607 },
  { pressure_Pa: 101325.0, temperature_K: 303.15, relativeHumidity: 0.5, density_kg_m3: 1.1555570 },
  { pressure_Pa: 101325.0, temperature_K: 303.15, relativeHumidity: 1.0, density_kg_m3: 1.1463977 },
  { pressure_Pa: 101325.0, temperature_K: 313.15, relativeHumidity: 0.0, density_kg_m3: 1.1274759 },
  { pressure_Pa: 101325.0, temperature_K: 313.15, relativeHumidity: 0.5, density_kg_m3: 1.1119888 },
  { pressure_Pa: 101325.0, temperature_K: 313.15, relativeHumidity: 1.0, density_kg_m3: 1.0966061 },
  { pressure_Pa: 101325.0, temperature_K: 323.15, relativeHumidity: 0.0, density_kg_m3: 1.0925095 },
  { pressure_Pa: 101325.0, temperature_K: 323.15, relativeHumidity: 0.5, density_kg_m3: 1.0674216 },
  { pressure_Pa: 101325.0, temperature_K: 323.15, relativeHumidity: 1.0, density_kg_m3: 1.0425625 },
  { pressure_Pa: 105000.0, temperature_K: 273.15, relativeHumidity: 0.0, density_kg_m3: 1.3400245 },
  { pressure_Pa: 105000.0, temperature_K: 273.15, relativeHumidity: 0.5, density_kg_m3: 1.3385538 },
  { pressure_Pa: 105000.0, temperature_K: 273.15, relativeHumidity: 1.0, density_kg_m3: 1.3370851 },
  { pressure_Pa: 105000.0, temperature_K: 283.15, relativeHumidity: 0.0, density_kg_m3: 1.2925372 },
  { pressure_Pa: 105000.0, temperature_K: 283.15, relativeHumidity: 0.5, density_kg_m3: 1.2896864 },
  { pressure_Pa: 105000.0, temperature_K: 283.15, relativeHumidity: 1.0, density_kg_m3: 1.2868420 },
  { pressure_Pa: 105000.0, temperature_K: 293.15, relativeHumidity: 0.0, density_kg_m3: 1.2483103 },
  { pressure_Pa: 105000.0, temperature_K: 293.15, relativeHumidity: 0.5, density_kg_m3: 1.2430668 },
  { pressure_Pa: 105000.0, temperature_K: 293.15, relativeHumidity: 1.0, density_kg_m3: 1.2378407 },
  { pressure_Pa: 105000.0, temperature_K: 303.15, relativeHumidity: 0.0, density_kg_m3: 1.2070182 },
  { pressure_Pa: 105000.0, temperature_K: 303.15, relativeHumidity: 0.5, density_kg_m3: 1.1978151 },
  { pressure_Pa: 105000.0, temperature_K: 303.15, relativeHumidity: 1.0, density_kg_m3: 1.1886564 },
  { pressure_Pa: 105000.0, temperature_K: 313.15, relativeHumidity: 0.0, density_kg_m3: 1.1683774 },
  { pressure_Pa: 105000.0, temperature_K: 313.15, relativeHumidity: 0.5, density_kg_m3: 1.1528911 },
  { pressure_Pa: 105000.0, temperature_K: 313.15, relativeHumidity: 1.0, density_kg_m3: 1.1375095 },
  { pressure_Pa: 105000.0, temperature_K: 323.15, relativeHumidity: 0.0, density_kg_m3: 1.1321396 },
  { pressure_Pa: 105000.0, temperature_K: 323.15, relativeHumidity: 0.5, density_kg_m3: 1.1070530 },
  { pressure_Pa: 105000.0, temperature_K: 323.15, relativeHumidity: 1.0, density_kg_m3: 1.0821957 },
] as const;
