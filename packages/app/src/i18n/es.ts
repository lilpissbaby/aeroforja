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
  "vortex-lattice-horseshoe": "Red de vórtices en herradura (VLM): segmento ligado al 1/4 del panel, punto de control al 3/4, estela por −x cuerpo",
  "kutta-joukowski-panel-forces": "Fuerzas de panel por Kutta–Joukowski, F = ρ Γ (V × l), momentos respecto al CG",
  "trefftz-plane-induced-drag": "Resistencia inducida en el plano de Trefftz",
  "flat-plate-skin-friction": "Fricción de placa plana lisa: Blasius (laminar) y Prandtl–Schlichting (turbulenta)",
  "component-drag-buildup": "Resistencia parásita por componentes (Raymer, 12.5)",
  "bluff-body-drag-coefficients": "Resistencia de cuerpos romos, (D/q) = Cd · A frontal (NASA Glenn)",
  "neutral-point-static-margin": "Punto neutro por dCm/dCL en la zona lineal y margen estático",
  "polyhedral-mass-properties": "Propiedades de masa de una malla cerrada por tetraedros con signo (Mirtich, Tonon)",
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
  "potential-flow": "Flujo potencial, incompresible y estacionario: sin separación ni pérdida. Fuera de la zona lineal los resultados no son físicos.",
  "flat-wake": "Estela plana a lo largo del eje x cuerpo (ángulos pequeños).",
  "flat-plates": "Las superficies sustentadoras son placas planas sin espesor, curvatura, torsión ni diedro en el VLM; el espesor solo entra en la resistencia.",
  "no-propellers": "Las hélices no se modelan: ni tracción ni estela; sus discos se ignoran.",
  "smooth-plate-friction": "Fricción de placa lisa con transición en Re = 5·10⁵; las placas de cantos vivos tienen burbujas de separación a bajo Reynolds, así que la resistencia real será mayor.",
  "bluff-drag-estimated": "Resistencia de cuerpos y cantos romos con Cd tabulados de formas genéricas, ±40 %; la interferencia solo entra con el factor Q.",
  "beta-zero": "Derrape β = 0.",
  "uniform-density": "Densidad uniforme: vale para resina y piezas macizas; una pieza FDM con relleno hay que pesarla y su inercia es aproximada.",
  "mesh-is-the-part": "La malla es la pieza: su exactitud es la del archivo exportado.",
  "inertia-about-calculated-cg":
    "El CG es medido pero la inercia es calculada: la inercia sigue referida al CG calculado.",
};

const CHECKS: Readonly<Record<string, { label: string; note: string }>> = {
  mach: { label: "Mach", note: "Flujo incompresible: solo por debajo de Mach 0,3." },
  alphaRangeOfSummary: {
    label: "α del resumen",
    note: "La pendiente, el punto neutro y el factor de Oswald se ajustan solo con |α| ≤ 5° (placa plana a bajo Reynolds).",
  },
  parasiteDragCalibration: {
    label: "Resistencia parásita",
    note: "La suma por componentes no está calibrada con un ensayo de este aparato: ámbar hasta que haya una resistencia medida.",
  },
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
  const re = /^reynolds\[(.+)\]$/.exec(check.quantity);
  if (re !== null) {
    return {
      label: `Reynolds de ${re[1]}`,
      note: "Fricción de placa plana: validada de 5·10⁴ a 5·10⁵ (laminar); por debajo de 2·10⁴ la capa límite no es la de una placa plana.",
    };
  }
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
