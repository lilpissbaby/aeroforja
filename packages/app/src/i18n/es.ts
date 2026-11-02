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
  "lbm-d3q19-regularized-les": "Lattice Boltzmann D3Q19 con colisión BGK regularizada y LES de Smagorinsky, en FP32 con distribuciones desplazadas",
  "lbm-boundaries": "Rebote a mitad de enlace en las paredes de vóxeles; entrada y campo lejano por equilibrio con la densidad de la celda interior; salida a ρ = 1 con gradiente de velocidad nulo",
  "lbm-momentum-exchange": "Fuerzas y momentos por intercambio de momento en cada enlace de rebote, ΔF = −2 c_i f_ī",
  "voxelization-ray-parity": "Voxelización por paridad de rayos en x, y y z (las piezas finas conservan su celda más cercana); mallas abiertas por solape triángulo–caja",
  "uvlm-linear-frozen-wake": "VLM no estacionario linealizado: anillos de vórtice sobre la red estacionaria, estela plana congelada que se convecta a V∞, cargas por Kutta–Joukowski no estacionario",
  "discrete-gust-one-minus-cosine": "Ráfaga vertical discreta 1 − cos, w = (U_ds/2)(1 − cos(π s/H)), que cada panel encuentra en su x (penetración)",
  "rigid-heave-pitch": "Avión rígido en movimiento vertical y de cabeceo a velocidad constante, perturbación sobre vuelo a 1 g, integración implícita por la regla del trapecio",
  "pratt-walker-gust-formula": "Fórmula de ráfaga de Pratt y Walker, Δn = ρ V a K_g U / (2 W/S), K_g = 0,88 μ_g / (5,3 + μ_g)",
  "cantilever-plate-bending": "Semiala como viga de Euler–Bernoulli empotrada en el plano de simetría: momento con alivio inercial, σ = 6M/(c t²), flecha por w'' = M/(EI) y primera frecuencia por iteración matricial",
  "massless-tracers": "Humo: trazadores sin masa movidos con la velocidad instantánea (RK2, trilineal); líneas de corriente por RK4 sobre la velocidad media",
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
  "lbm-weakly-compressible": "Casi incompresible: la red trabaja a Mach 0,087, con un error de compresibilidad del orden de Ma² ≈ 1 %.",
  "lbm-les-no-wall-model":
    "LES sin modelo de pared: la capa límite no se resuelve y la transición y las burbujas laminares no se modelan. La separación en cantos vivos (placas de DM) sí aparece, porque la fija la geometría.",
  "lbm-staircase": "Geometría en escalera de vóxeles cúbicos: las placas alineadas con la rejilla son exactas en su plano y se engrosan a una celda si son más finas.",
  "lbm-propellers-off": "Hélices paradas y no modeladas. En un multirrotor en vuelo el flujo lo dominan las estelas de los rotores.",
  "lbm-free-stream": "Corriente libre sin turbulencia en una caja finita con caras de equilibrio (el bloqueo se informa).",
  "lbm-rigid-fixed": "Cuerpo rígido y fijo.",
  "gust-potential-flow": "Flujo potencial sin pérdida: por encima de 10° de ángulo de ataque la carga real la limita la pérdida, que no se modela.",
  "gust-longitudinal": "Velocidad de avance constante y solo movimiento vertical y de cabeceo; sin mandos ni controladora.",
  "gust-frozen-wake": "Estela plana y congelada en ejes cuerpo (pequeñas perturbaciones).",
  "gust-rigid-flight":
    "Avión rígido para la mecánica de vuelo; la flexión se calcula en un sentido (de cargas a deformación), sin aeroelasticidad ni dinámica estructural.",
  "gust-solid-plate": "Placa maciza sin torsión: los vaciados hacen el ala menos rígida y la flecha en planta descarga la punta por acoplamiento flexión-torsión (no modelado).",
  "gust-trim-loads": "La carga en envergadura a 1 g es la de la red al α de 1 g, como si se trimase sin cambiarla.",
  "gust-quasi-steady": "Aerodinámica casi estacionaria: la sustentación sigue al ángulo de ataque al instante, sin retraso; sobrestima las ráfagas cortas.",
  "inertia-about-calculated-cg":
    "El CG es medido pero la inercia es calculada: la inercia sigue referida al CG calculado.",
};

const CHECKS: Readonly<Record<string, { label: string; note: string }>> = {
  mach: { label: "Mach", note: "Flujo incompresible: solo por debajo de Mach 0,3." },
  gustAlpha: {
    label: "α con la ráfaga",
    note: "α de 1 g más el incremento de la ráfaga: verde hasta 5°, ámbar hasta 10°; por encima una placa plana entra en pérdida y la carga real la limita la pérdida (no modelada).",
  },
  staticMargin: { label: "Margen estático", note: "Con el CG detrás del punto neutro la respuesta diverge: el resultado no es físico." },
  tipDeflectionRatio: {
    label: "Flecha / semienvergadura",
    note: "Viga lineal: verde hasta 5 %, ámbar hasta 10 %; por encima la deformación cambiaría las cargas (aeroelasticidad, no modelada).",
  },
  gustToBendingPeriod: {
    label: "Duración de la ráfaga / periodo de flexión",
    note: "Si la ráfaga dura menos de 3 periodos de la primera flexión, el ala vibra y la flecha dinámica puede ser mayor (no modelada).",
  },
  youngModulus: { label: "Módulo E", note: "Verde si es medido; ámbar si es de ficha." },
  flexuralStrength: { label: "Resistencia a flexión", note: "Verde si es medida; ámbar si es de ficha." },
  arealMass: { label: "Masa por área", note: "Verde si es medida; ámbar si es de ficha." },
  cfdForces: {
    label: "Fuerzas del CFD",
    note: "Semicuantitativas en esta entrega: ámbar como máximo (mini-diseño 006, decisión 2). Sirven para comparar diseños entre sí.",
  },
  cellsPerFeature: {
    label: "Resolución",
    note: "Celdas a lo ancho de la cuerda media o de la pieza STL más pequeña: por debajo de 8 la forma no está resuelta (rojo).",
  },
  blockage: {
    label: "Bloqueo",
    note: "Área frontal sobre la sección de la caja: hasta 2 % sin efecto apreciable, de 2 a 5 % ámbar, por encima de 5 % las paredes de la caja cambian el flujo.",
  },
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
