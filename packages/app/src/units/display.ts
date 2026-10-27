/**
 * Display units of the UI. The physics core works in SI only; every
 * conversion to the units a builder reads on a ruler or a scale lives here.
 */

export const toMillimeters = (meters: number): number => meters * 1000;
export const fromMillimeters = (millimeters: number): number => millimeters / 1000;
export const toGrams = (kilograms: number): number => kilograms * 1000;
export const fromGrams = (grams: number): number => grams / 1000;
export const toCelsius = (kelvin: number): number => kelvin - 273.15;
export const toHectopascals = (pascals: number): number => pascals / 100;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
export const fromDegrees = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Parses what a person types in a numeric field. Accepts a decimal comma or
 * point, surrounding spaces and a leading sign; rejects anything else so a
 * typo never reaches the physics core as a silent zero.
 */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(minimumFractionDigits: number, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.NumberFormat("es-ES", { minimumFractionDigits, maximumFractionDigits, useGrouping: true });
    formatters.set(key, f);
  }
  return f;
}

/** Fixed decimals, Spanish separators ("1.234,5"). Normalises -0 to 0. */
export function formatFixed(value: number, decimals: number): string {
  const v = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
  return formatter(decimals, decimals).format(v);
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** Scientific notation for small or large values: "9,791 × 10⁻⁴". */
export function formatScientific(value: number, significant = 4): string {
  if (value === 0 || Object.is(value, -0)) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent >= -2 && exponent <= 4) {
    return formatFixed(value, Math.max(0, significant - 1 - exponent));
  }
  const mantissa = value / 10 ** exponent;
  const sup = String(exponent)
    .split("")
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join("");
  return `${formatFixed(mantissa, significant - 1)} × 10${sup}`;
}
