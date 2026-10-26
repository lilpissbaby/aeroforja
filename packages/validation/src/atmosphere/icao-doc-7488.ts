/**
 * Reference values of the ICAO Standard Atmosphere for the lowest layer.
 *
 * The ICAO tables come in two forms: indexed by geometric altitude Z (Z exact,
 * H rounded) and by geopotential altitude H (H exact, Z rounded). Each row
 * records which altitude is exact; the test uses that one and converts it with
 * the standard's own relation.
 */
import type { DatasetSource, Tolerance } from "../types.ts";

export const ICAO_DOC_7488_SOURCE: DatasetSource = {
  publication:
    "ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere (extended to 80 kilometres), 3rd ed., 1993. Identical to ISO 2533:1975 and to the U.S. Standard Atmosphere 1976 below 32 km.",
  transcription:
    "Values transcribed from ICAO Doc 7488/3 by A. Dettmann in the test data of the open-source package 'ambiance' (tests/table_data.py, github.com/airinnova/ambiance, commit 232032bbac7a8ff12e8bf9e888f6179d9094b0e9). They were not read from the ICAO document directly: no legible copy was available when this case was written (the NASA scan of the 1976 report does not extract as text). Replace this note if the rows are re-checked against the printed tables.",
  crossChecks: [
    "Rows with Z >= 0 compared with the independent implementation 'ussa1976' 0.3.4 (U.S. Standard Atmosphere 1976): T, p, rho and a agree within 1.2e-5 relative; mu and nu agree to every printed digit (that package returns them scaled by 1e12, a unit bug of its own).",
    "Rows with Z < 0 were not covered by the second implementation; their only check is this validation suite.",
  ],
  retrieved: "2026-10-27",
  license:
    "Tabulated physical constants of an international standard (facts); transcription credited to the ambiance project, Apache-2.0.",
};

/**
 * All printed values have at least 5 significant figures (temperatures to
 * 0.001 K), so rounding alone is below 1e-5 relative. 1e-4 leaves margin for
 * that rounding and for the rounded altitude column, while any mistake in a
 * constant, an exponent or a unit shows up as an error far above it.
 */
export const ICAO_DOC_7488_TOLERANCE: Tolerance = {
  relative: 1e-4,
  rationale:
    "Table values are printed with >= 5 significant figures (rounding < 1e-5 relative); the ISA is a closed-form definition, so a larger discrepancy is a code error, not a model error.",
};

export interface IsaReferenceRow {
  readonly exactAltitude:
    | { readonly kind: "geometric"; readonly value_m: number }
    | { readonly kind: "geopotential"; readonly value_m: number };
  /** The other altitude column as printed (rounded), for traceability only. */
  readonly printedOtherAltitude_m: number;
  readonly temperature_K: number;
  readonly pressure_Pa: number;
  readonly density_kg_m3: number;
  readonly speedOfSound_m_s: number;
  readonly dynamicViscosity_Pa_s: number;
  readonly kinematicViscosity_m2_s: number;
}

/**
 * Rows inside the lowest layer (H from -5000 m to 11000 m). The transcription
 * also contains Z = -5000 m (H = -5004 m), which lies just below the layer as
 * defined in physics and is therefore not used.
 */
export const ICAO_DOC_7488_TROPOSPHERE: readonly IsaReferenceRow[] = [
  {
    exactAltitude: { kind: "geopotential", value_m: -5000 },
    printedOtherAltitude_m: -4996,
    temperature_K: 320.65,
    pressure_Pa: 1.77687e5,
    density_kg_m3: 1.93047,
    speedOfSound_m_s: 358.972,
    dynamicViscosity_Pa_s: 1.9421e-5,
    kinematicViscosity_m2_s: 1.006e-5,
  },
  {
    exactAltitude: { kind: "geometric", value_m: -2500 },
    printedOtherAltitude_m: -2501,
    temperature_K: 304.406,
    pressure_Pa: 1.35205e5,
    density_kg_m3: 1.54731,
    speedOfSound_m_s: 349.761,
    dynamicViscosity_Pa_s: 1.8668e-5,
    kinematicViscosity_m2_s: 1.2065e-5,
  },
  {
    exactAltitude: { kind: "geometric", value_m: 0 },
    printedOtherAltitude_m: 0,
    temperature_K: 288.15,
    pressure_Pa: 1.01325e5,
    density_kg_m3: 1.225,
    speedOfSound_m_s: 340.294,
    dynamicViscosity_Pa_s: 1.7894e-5,
    kinematicViscosity_m2_s: 1.4607e-5,
  },
  {
    exactAltitude: { kind: "geometric", value_m: 1000 },
    printedOtherAltitude_m: 1000,
    temperature_K: 281.651,
    pressure_Pa: 8.98763e4,
    density_kg_m3: 1.11166,
    speedOfSound_m_s: 336.435,
    dynamicViscosity_Pa_s: 1.7579e-5,
    kinematicViscosity_m2_s: 1.5813e-5,
  },
  {
    exactAltitude: { kind: "geometric", value_m: 2000 },
    printedOtherAltitude_m: 1999,
    temperature_K: 275.154,
    pressure_Pa: 7.95014e4,
    density_kg_m3: 1.00655,
    speedOfSound_m_s: 332.532,
    dynamicViscosity_Pa_s: 1.726e-5,
    kinematicViscosity_m2_s: 1.7147e-5,
  },
  {
    exactAltitude: { kind: "geometric", value_m: 11000 },
    printedOtherAltitude_m: 10981,
    temperature_K: 216.774,
    pressure_Pa: 2.26999e4,
    density_kg_m3: 3.64801e-1,
    speedOfSound_m_s: 295.154,
    dynamicViscosity_Pa_s: 1.4223e-5,
    kinematicViscosity_m2_s: 3.8988e-5,
  },
  {
    exactAltitude: { kind: "geopotential", value_m: 11000 },
    printedOtherAltitude_m: 11019,
    temperature_K: 216.65,
    pressure_Pa: 2.2632e4,
    density_kg_m3: 3.63918e-1,
    speedOfSound_m_s: 295.069,
    dynamicViscosity_Pa_s: 1.4216e-5,
    kinematicViscosity_m2_s: 3.9064e-5,
  },
];
