/**
 * Spanish UI text for the stable ids the physics core attaches to methods,
 * assumptions and validity checks. The core's English text is the fallback,
 * so a new id never shows up blank.
 */
import type { Assumption, Method, Provenance, ValidityCheck, ValidityLevel } from "@aeroforja/physics";

export const PROVENANCE_ES: Readonly<Record<Provenance, string>> = {
  MEASURED: "Medido",
  CALCULATED: "Calculado",
  ESTIMATED: "Estimado",
};

export const VALIDITY_ES: Readonly<Record<ValidityLevel, string>> = {
  green: "Validado",
  amber: "Fuera de lo validado",
  red: "Fuera de rango",
};

const METHODS: Readonly<Record<string, string>> = {
  "isa-troposphere": "Atmósfera estándar (ICAO/ISO/US 1976), capa inferior",
  "ideal-gas-air": "Ecuación de estado del gas ideal para el aire",
  "sutherland-viscosity": "Viscosidad del aire por la ley de Sutherland",
  "geopotential-altitude": "Altitud geopotencial a partir de la geométrica",
  "moist-air-ideal-mixture": "Aire húmedo como mezcla ideal de aire seco y vapor",
  "magnus-alduchov-eskridge": "Presión de saturación del agua (Magnus, Alduchov y Eskridge)",
  "rigid-body-mass-properties": "Masa, CG e inercia de un sólido rígido (teorema de Steiner)",
  "homogeneous-solid-inertia": "Inercia de sólidos homogéneos (caja, cilindro, tubo, esfera)",
  "principal-axes-jacobi": "Ejes principales por rotaciones de Jacobi",
  "gum-first-order": "Propagación de incertidumbre de primer orden (GUM)",
};

const ASSUMPTIONS: Readonly<Record<string, string>> = {
  "dry-air": "Aire seco: no se tiene en cuenta la humedad.",
  "moist-air-ideal-mixture":
    "El aire húmedo es una mezcla ideal; se desprecia la compresibilidad del aire real (hasta un 0,07 % en densidad).",
  "moist-air-dry-transport":
    "La viscosidad y la velocidad del sonido son las del aire seco a esa temperatura.",
  "ideal-gas": "El aire es un gas ideal con R = 287,05287 J/(kg·K) y γ = 1,4.",
  "standard-gravity": "Gravedad constante g0 = 9,80665 m/s²; por eso la altitud es geopotencial.",
  "geometric-to-geopotential": "La altitud geométrica se convierte a geopotencial con r0 = 6 356 766 m.",
  "pressure-altitude":
    "La presión es la estándar a esa altitud; solo cambia la temperatura. La presión real varía con el tiempo meteorológico.",
  "measured-ambient": "Presión, temperatura y humedad son medidas tuyas.",
  "rigid-body": "El aparato es un sólido rígido: los componentes no se mueven entre sí.",
  "homogeneous-shapes": "Los componentes descritos por una forma tienen densidad uniforme.",
  "point-masses": "Las masas puntuales no tienen inercia propia.",
  "first-order-uncertainty":
    "Incertidumbre de masa y CG por propagación de primer orden; un dato sin incertidumbre cuenta como exacto.",
  "no-input-uncertainty": "Ningún dato tiene incertidumbre, así que masa y CG se dan sin banda.",
  "inertia-uncertainty-not-propagated": "La incertidumbre de la inercia todavía no se propaga.",
  "inertia-about-calculated-cg":
    "El CG es medido pero la inercia es calculada: la inercia sigue referida al CG calculado.",
};

const CHECKS: Readonly<Record<string, { label: string; note: string }>> = {
  geopotentialAltitude: {
    label: "Altitud",
    note: "La ley de la troposfera vale de −5 000 a 11 000 m de altitud geopotencial.",
  },
  temperature: {
    label: "Temperatura del aire",
    note: "Sutherland y el gas ideal están validados entre 216,65 y 320,65 K (−56,5 a 47,5 °C).",
  },
  humidAirTemperature: {
    label: "Temperatura con humedad",
    note: "Magnus está validado de 0 a 50 °C; su ajuste vale de −40 a 50 °C.",
  },
  humidAirPressure: {
    label: "Presión con humedad",
    note: "La densidad del aire húmedo está validada entre 70 y 105 kPa.",
  },
  pressure: {
    label: "Presión",
    note: "La densidad del aire seco está validada entre 22,6 y 177,7 kPa.",
  },
  smallestPrincipalMoment: {
    label: "Momento principal mínimo",
    note: "Un tensor de inercia real no tiene momentos principales negativos.",
  },
  principalMomentTriangle: {
    label: "Desigualdad I₁ + I₂ ≥ I₃",
    note: "Los momentos principales de un cuerpo real la cumplen; si falla, hay un dato mal medido o mal escrito.",
  },
};

export const methodName = (m: Method): string => METHODS[m.id] ?? m.name;
export const assumptionText = (a: Assumption): string => ASSUMPTIONS[a.id] ?? a.description;

export function checkText(check: ValidityCheck): { label: string; note: string } {
  const component = /^component\[(.+)\]\.(.+)$/.exec(check.quantity);
  if (component !== null) {
    const inner = CHECKS[component[2] ?? ""];
    return {
      label: `${inner?.label ?? component[2]} (componente ${component[1]})`,
      note: inner?.note ?? check.note,
    };
  }
  return CHECKS[check.quantity] ?? { label: check.quantity, note: check.note };
}
