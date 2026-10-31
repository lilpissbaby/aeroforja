/**
 * Virtual wind tunnel: an angle-of-attack sweep of the aircraft as drawn and
 * weighed (mini-design 004).
 *
 * - Lift, side force and moments of the lifting surfaces: vortex-lattice
 *   method (vlm.ts), CALCULATED.
 * - Induced drag: Trefftz plane, CALCULATED.
 * - Parasite drag: component build-up (Raymer sec. 12.5) with smooth
 *   flat-plate friction and bluff-body Cd values, ESTIMATED.
 * - Neutral point and static margin from dCm/dCL in the linear range.
 *
 * Body axes FRD, SI. Moments about the centre of gravity. α positive nose up
 * relative to the wind; β = 0 in this delivery.
 */
import type { Assumption, Method, Provenance, Result, ValidityCheck } from "../core/result.ts";
import { checkRange, combineValidity } from "../core/validity.ts";
import type { Triple } from "../core/vector.ts";
import { skinFriction, thinSectionFormFactor, TRANSITION_REYNOLDS } from "./friction.ts";
import {
  BLUFF_BODY_DRAG,
  COMPONENT_DRAG_BUILDUP,
  KUTTA_JOUKOWSKI_FORCES,
  NEUTRAL_POINT,
  SKIN_FRICTION_FLAT_PLATE,
  TREFFTZ_INDUCED_DRAG,
  VORTEX_LATTICE,
} from "./methods.ts";
import {
  DEFAULT_LATTICE,
  buildLattice,
  factorLattice,
  freeStream,
  solveVlm,
  type LatticeOptions,
  type LiftingSurfaceInput,
} from "./vlm.ts";

/** A surface that rubs the flow: plates, wings, fins (skin friction with a thin-section form factor). */
export interface FrictionComponent {
  readonly id: string;
  readonly name: string;
  /** m² */
  readonly wettedArea: number;
  /** Length along the flow, for the Reynolds number, m. */
  readonly flowLength: number;
  /** Thickness / flow length. */
  readonly thicknessRatio: number;
  /** Where its drag acts, body axes, m. */
  readonly centroid: Triple;
}

/** A blunt body or a blunt edge: (D/q) = Cd · A_frontal. */
export interface BluffComponent {
  readonly id: string;
  readonly name: string;
  readonly cd: number;
  /** Area seen by the flow, m². */
  readonly frontalArea: number;
  readonly centroid: Triple;
  /** Where the Cd comes from, in English. */
  readonly source: string;
}

export interface TunnelInput {
  readonly surfaces: readonly LiftingSurfaceInput[];
  readonly friction: readonly FrictionComponent[];
  readonly bluff: readonly BluffComponent[];
  /** Centre of gravity, body axes, m. */
  readonly cg: Triple;
  /** m/s */
  readonly speed: number;
  /** Angles of attack of the sweep, rad. */
  readonly alphas: readonly number[];
  readonly air: { readonly density: number; readonly kinematicViscosity: number; readonly speedOfSound: number };
  /** Interference factor applied to every parasite component (Raymer's Q). */
  readonly interference: number;
  readonly lattice?: LatticeOptions;
}

export interface TunnelPoint {
  /** rad */
  readonly alpha: number;
  /** Validity of this α for a flat plate at low Reynolds: green ≤ 5°, amber ≤ 10°, red above (stall not modelled). */
  readonly level: "green" | "amber" | "red";
  readonly CL: number | null;
  readonly CDi: number | null;
  readonly CD0: number | null;
  readonly CD: number | null;
  readonly Cm: number | null;
  readonly CY: number | null;
  readonly Cl: number | null;
  readonly Cn: number | null;
  readonly LD: number | null;
  /** Lift, drag (along the wind) and induced drag, N. */
  readonly lift: number;
  readonly drag: number;
  readonly inducedDrag: number;
  /** Balance: force (N) and moment about the CG (N·m), body axes. */
  readonly force: Triple;
  readonly moment: Triple;
}

export interface ComponentDrag {
  readonly id: string;
  readonly name: string;
  readonly kind: "friction" | "bluff";
  /** D/q, m². */
  readonly dragArea: number;
  readonly reynolds?: number;
  readonly cf?: number;
  readonly regime?: "laminar" | "turbulent";
  readonly formFactor?: number;
  readonly cd?: number;
  readonly source?: string;
}

export interface SpanStation {
  readonly surface: string;
  /** Span coordinate (y or z), m. */
  readonly s: number;
  /** m */
  readonly chord: number;
  /** Lift per unit span normal to the surface, N/m. */
  readonly load: number;
  /** Elliptic load with the same total, N/m (horizontal surfaces crossing y = 0 only). */
  readonly elliptic: number | null;
}

export interface PanelPressure {
  /** Corners, body axes, m. */
  readonly corners: readonly [Triple, Triple, Triple, Triple];
  /** Pressure jump coefficient across the panel, positive when it pushes along the panel normal (up on a wing). */
  readonly dCp: number;
  readonly surface: number;
}

export interface TunnelReference {
  /** Projected area of the horizontal lifting surfaces, m². */
  readonly area: number;
  /** Span of the horizontal lifting surfaces, m. */
  readonly span: number;
  readonly aspectRatio: number;
  /** Mean aerodynamic chord (1/S)∫c² dy, m. */
  readonly mac: number;
  /** x of the leading edge of the mean aerodynamic chord, m. */
  readonly macLeadingEdgeX: number;
}

export interface TunnelSummary {
  /** Lift slope from a least-squares fit of the points with |α| ≤ 5°, 1/rad. */
  readonly CLalpha: number;
  readonly CL0: number;
  /** Parasite drag coefficient (does not depend on α in this model). */
  readonly CD0: number;
  /** Band of CD0 from the ±40 % of the bluff components (friction band unknown). */
  readonly CD0Low: number;
  readonly CD0High: number;
  /** Span efficiency from the VLM, CDi = CL² / (π AR e). */
  readonly oswald: number;
  /** dCm/dCL about the CG in the linear range. */
  readonly dCmdCL: number;
  /** Neutral point x, m (FRD). */
  readonly neutralPointX: number;
  /** (x_CG − x_NP) / c̄; positive: stable. */
  readonly staticMargin: number;
  /** Neutral point as a fraction of the MAC from its leading edge. */
  readonly neutralPointMac: number;
  /** CG as a fraction of the MAC from its leading edge. */
  readonly cgMac: number;
  /** Best L/D among the points with |α| ≤ 10° (beyond, stall is not modelled). */
  readonly maxLD: number;
  readonly alphaMaxLD: number;
}

export interface TunnelSweep {
  readonly reference: TunnelReference | null;
  readonly points: readonly TunnelPoint[];
  readonly summary: TunnelSummary | null;
  readonly components: readonly ComponentDrag[];
  /** Total parasite drag area D/q, m² (what a multirotor gets instead of coefficients). */
  readonly dragArea: number;
  /** Spanwise load at the α closest to 5°. */
  readonly spanLoad: readonly SpanStation[];
  readonly spanLoadAlpha: number;
  /** ΔCp of every panel at the same α. */
  readonly pressures: readonly PanelPressure[];
  readonly panelCount: number;
  readonly provenance: { readonly lift: Provenance; readonly drag: Provenance };
  readonly notes: readonly string[];
}

const ASSUMPTIONS: readonly Assumption[] = [
  { id: "potential-flow", description: "Potential, incompressible, steady flow: no separation and no stall. Results beyond the linear range are not physical." },
  { id: "flat-wake", description: "Flat wake along the body x axis (small angles); the influence matrix does not depend on α." },
  { id: "flat-plates", description: "Lifting surfaces are flat plates without thickness, camber, twist or dihedral in the VLM; thickness only enters the drag." },
  { id: "no-propellers", description: "Propellers are not modelled: no thrust, no slipstream; their discs are ignored." },
  { id: "smooth-plate-friction", description: `Smooth flat-plate friction with transition at Re = ${TRANSITION_REYNOLDS.toExponential(0)}; sharp-edged sheets have separation bubbles at low Reynolds numbers, so the real drag is higher.` },
  { id: "bluff-drag-estimated", description: "Bluff-body and blunt-edge drag from tabulated Cd values of generic shapes, ±40 %; interference only through the factor Q." },
  { id: "beta-zero", description: "Sideslip β = 0." },
];

const METHODS: readonly Method[] = [VORTEX_LATTICE, KUTTA_JOUKOWSKI_FORCES, TREFFTZ_INDUCED_DRAG, COMPONENT_DRAG_BUILDUP, SKIN_FRICTION_FLAT_PLATE, BLUFF_BODY_DRAG, NEUTRAL_POINT];

const DEG = Math.PI / 180;
export const ALPHA_GREEN = 5 * DEG;
export const ALPHA_AMBER = 10 * DEG;
export const BLUFF_RELATIVE_UNCERTAINTY = 0.4;

const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Triple, b: Triple): Triple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scalev = (a: Triple, k: number): Triple => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Triple, b: Triple): Triple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function alphaLevel(alpha: number): "green" | "amber" | "red" {
  const a = Math.abs(alpha);
  return a <= ALPHA_GREEN + 1e-12 ? "green" : a <= ALPHA_AMBER + 1e-12 ? "amber" : "red";
}

/** Least-squares line y = a + b x. */
function fitLine(xs: readonly number[], ys: readonly number[]): { a: number; b: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

export function tunnelSweep(input: TunnelInput): Result<TunnelSweep> {
  if (!(input.speed > 0)) throw new RangeError("The tunnel speed must be positive.");
  if (input.alphas.length === 0) throw new RangeError("The sweep needs at least one angle of attack.");
  if (!(input.interference > 0)) throw new RangeError("The interference factor must be positive.");
  const { density: rho, kinematicViscosity: nu, speedOfSound } = input.air;
  const V = input.speed;
  const q = 0.5 * rho * V * V;
  const notes: string[] = [];

  // ---------- parasite drag areas (D/q), independent of α ----------
  const components: ComponentDrag[] = [];
  const reynoldsChecks: ValidityCheck[] = [];
  let frictionArea = 0;
  let bluffArea = 0;
  const parasiteAt: { area: number; centroid: Triple }[] = [];
  for (const c of input.friction) {
    if (!(c.wettedArea > 0) || !(c.flowLength > 0)) continue;
    const re = (V * c.flowLength) / nu;
    const { cf, regime } = skinFriction(re);
    const ff = thinSectionFormFactor(Math.max(0, c.thicknessRatio));
    const area = cf * ff * input.interference * c.wettedArea;
    frictionArea += area;
    parasiteAt.push({ area, centroid: c.centroid });
    components.push({ id: c.id, name: c.name, kind: "friction", dragArea: area, reynolds: re, cf, regime, formFactor: ff });
    reynoldsChecks.push(
      checkRange({
        quantity: `reynolds[${c.id}]`,
        value: re,
        unit: "1",
        validated: { min: 5e4, max: 5e5 },
        applicable: { min: 2e4, max: 1e8 },
        note: "Flat-plate friction: laminar Blasius validated up to transition; below 2·10⁴ the boundary layer of a drone part is not a flat-plate layer.",
      }),
    );
  }
  for (const b of input.bluff) {
    if (!(b.frontalArea > 0) || !(b.cd > 0)) continue;
    const area = b.cd * b.frontalArea * input.interference;
    bluffArea += area;
    parasiteAt.push({ area, centroid: b.centroid });
    components.push({ id: b.id, name: b.name, kind: "bluff", dragArea: area, cd: b.cd, source: b.source });
  }
  const dragArea = frictionArea + bluffArea;

  // ---------- lattice ----------
  const horizontal = input.surfaces.filter((s) => s.orientation === "horizontal");
  let reference: TunnelReference | null = null;
  let factored: ReturnType<typeof factorLattice> | null = null;
  if (input.surfaces.length > 0) {
    const lattice = buildLattice(input.surfaces, input.lattice ?? DEFAULT_LATTICE);
    notes.push(...lattice.notes);
    factored = factorLattice(lattice);
    if (horizontal.length > 0) {
      let area = 0;
      let c2 = 0;
      let cx = 0;
      let sMin = Infinity;
      let sMax = -Infinity;
      for (const s of lattice.strips) {
        if (input.surfaces[s.surface]!.orientation !== "horizontal") continue;
        const width = s.s1 - s.s0;
        area += s.chord * width;
        c2 += s.chord * s.chord * width;
        cx += s.leadingEdgeX * s.chord * width;
        sMin = Math.min(sMin, s.s0);
        sMax = Math.max(sMax, s.s1);
      }
      if (area > 0) {
        const span = sMax - sMin;
        reference = { area, span, aspectRatio: (span * span) / area, mac: c2 / area, macLeadingEdgeX: cx / area };
      }
    } else {
      notes.push("No horizontal lifting surface: coefficients are not defined; forces are given in newtons and drag as D/q.");
    }
  } else {
    notes.push("No lifting surface drawn (a multirotor in forward flight): only parasite drag, as D/q in m² and forces in N.");
  }

  // ---------- sweep ----------
  const points: TunnelPoint[] = [];
  let spanLoad: SpanStation[] = [];
  let pressures: PanelPressure[] = [];
  const target = 5 * DEG;
  let spanLoadAlpha = input.alphas[0]!;
  for (const alpha of input.alphas) if (Math.abs(alpha - target) < Math.abs(spanLoadAlpha - target)) spanLoadAlpha = alpha;

  for (const alpha of input.alphas) {
    const wind = freeStream(alpha, 0, V);
    const windDir = scalev(wind, 1 / V);
    const liftDir: Triple = [Math.sin(alpha), 0, -Math.cos(alpha)];
    let force: Triple = [0, 0, 0];
    let moment: Triple = [0, 0, 0];
    let inducedDrag = 0;
    if (factored !== null) {
      const sol = solveVlm(factored, { alpha, beta: 0, speed: V, density: rho }, input.cg);
      force = sol.force;
      moment = sol.moment;
      inducedDrag = sol.inducedDrag;
      if (alpha === spanLoadAlpha) {
        const lat = factored.lattice;
        pressures = lat.panels.map((p, i) => ({
          corners: p.corners,
          dCp: p.area > 0 ? dot(sol.panelForces[i]!, p.normal) / (q * p.area) : 0,
          surface: p.surface,
        }));
        // Strip loads per surface; elliptic reference for horizontal surfaces that cross y = 0.
        const bySurface = new Map<number, SpanStation[]>();
        lat.strips.forEach((s, k) => {
          const surface = input.surfaces[s.surface]!;
          let f: Triple = [0, 0, 0];
          for (const id of s.panels) f = addv(f, sol.panelForces[id]!);
          const n = lat.panels[s.panels[0]!]!.normal;
          const load = dot(f, n) / (s.s1 - s.s0);
          const list = bySurface.get(s.surface) ?? [];
          list.push({ surface: surface.id, s: s.sMid, chord: s.chord, load, elliptic: null });
          bySurface.set(s.surface, list);
          void k;
        });
        spanLoad = [];
        for (const [si, list] of bySurface) {
          const surface = input.surfaces[si]!;
          const strips = lat.strips.filter((s) => s.surface === si);
          const s0 = Math.min(...strips.map((s) => s.s0));
          const s1 = Math.max(...strips.map((s) => s.s1));
          const total = strips.reduce((acc, s, i) => acc + list[i]!.load * (s.s1 - s.s0), 0);
          const half = (s1 - s0) / 2;
          const centre = (s0 + s1) / 2;
          const elliptic = surface.orientation === "horizontal" && s0 < 0 && s1 > 0;
          for (const st of list) {
            const t = (st.s - centre) / half;
            spanLoad.push({ ...st, elliptic: elliptic ? ((4 * total) / (Math.PI * 2 * half)) * Math.sqrt(Math.max(0, 1 - t * t)) : null });
          }
        }
      }
    }
    // Parasite drag along the wind, at each component's centroid.
    for (const p of parasiteAt) {
      const f = scalev(windDir, q * p.area);
      force = addv(force, f);
      moment = addv(moment, cross(sub(p.centroid, input.cg), f));
    }
    const lift = dot(force, liftDir);
    const drag = dot(force, windDir);
    const ref = reference;
    const coef = (v: number, len = 1) => (ref === null ? null : v / (q * ref.area * len));
    const CL = coef(lift);
    const CD = coef(drag);
    points.push({
      alpha,
      level: alphaLevel(alpha),
      CL,
      CDi: coef(inducedDrag),
      CD0: coef(q * dragArea),
      CD,
      Cm: ref === null ? null : moment[1] / (q * ref.area * ref.mac),
      CY: coef(force[1]),
      Cl: ref === null ? null : moment[0] / (q * ref.area * ref.span),
      Cn: ref === null ? null : moment[2] / (q * ref.area * ref.span),
      LD: drag > 0 ? lift / drag : null,
      lift,
      drag,
      inducedDrag,
      force,
      moment,
    });
  }

  // ---------- summary in the linear range ----------
  let summary: TunnelSummary | null = null;
  if (reference !== null) {
    const linear = points.filter((p) => Math.abs(p.alpha) <= ALPHA_GREEN + 1e-12 && p.CL !== null && p.Cm !== null);
    const lift = fitLine(
      linear.map((p) => p.alpha),
      linear.map((p) => p.CL!),
    );
    const pitch = fitLine(
      linear.map((p) => p.CL!),
      linear.map((p) => p.Cm!),
    );
    const withCl = linear.filter((p) => Math.abs(p.CL!) > 1e-6);
    // Least squares through the origin of CDi = k CL², e = 1 / (π AR k).
    const k = withCl.reduce((s, p) => s + p.CL! ** 2 * p.CDi!, 0) / withCl.reduce((s, p) => s + p.CL! ** 4, 0);
    const oswaldFit = withCl.length > 0 && k > 0 ? 1 / (Math.PI * reference.aspectRatio * k) : NaN;
    if (lift !== null && pitch !== null) {
      // x forward: dCm/dCL = (x_NP − x_ref)/c̄ about a reference point (here the CG).
      const neutralPointX = input.cg[0] + pitch.b * reference.mac;
      // Beyond |α| = 10° the flat plate has stalled and potential flow keeps L/D rising: those points do not count.
      const best = points
        .filter((p) => p.LD !== null && p.level !== "red")
        .reduce<TunnelPoint | null>((b, p) => (b === null || p.LD! > b.LD! ? p : b), null);
      const CD0 = dragArea / reference.area;
      summary = {
        CLalpha: lift.b,
        CL0: lift.a,
        CD0,
        CD0Low: (frictionArea + (1 - BLUFF_RELATIVE_UNCERTAINTY) * bluffArea) / reference.area,
        CD0High: (frictionArea + (1 + BLUFF_RELATIVE_UNCERTAINTY) * bluffArea) / reference.area,
        oswald: oswaldFit,
        dCmdCL: pitch.b,
        neutralPointX,
        staticMargin: (input.cg[0] - neutralPointX) / reference.mac,
        neutralPointMac: (reference.macLeadingEdgeX - neutralPointX) / reference.mac,
        cgMac: (reference.macLeadingEdgeX - input.cg[0]) / reference.mac,
        maxLD: best?.LD ?? NaN,
        alphaMaxLD: best?.alpha ?? NaN,
      };
    } else {
      notes.push("Not enough points with |α| ≤ 5° to fit the lift slope and the neutral point.");
    }
  }

  // ---------- validity ----------
  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "mach",
      value: V / speedOfSound,
      unit: "1",
      validated: { min: 0, max: 0.3 },
      applicable: { min: 0, max: 0.3 },
      note: "Incompressible flow: compressibility is neglected below Mach 0.3 only.",
    }),
    checkRange({
      quantity: "alphaRangeOfSummary",
      value: Math.min(ALPHA_GREEN, Math.max(...input.alphas.map(Math.abs))) / DEG,
      unit: "deg",
      validated: { min: 0, max: 5 },
      applicable: { min: 0, max: 10 },
      note: "Lift slope, neutral point and Oswald factor are fitted with |α| ≤ 5° only (flat plate at low Reynolds number).",
    }),
    ...reynoldsChecks,
    {
      quantity: "parasiteDragCalibration",
      value: 1,
      unit: "1",
      validated: { min: 0, max: 0 },
      applicable: { min: 0, max: 1 },
      level: "amber",
      note: "Component drag build-up is not calibrated against a test of this aircraft: amber until a measured drag exists.",
    },
  ];

  return {
    value: {
      reference,
      points,
      summary,
      components,
      dragArea,
      spanLoad,
      spanLoadAlpha,
      pressures,
      panelCount: factored?.lattice.panels.length ?? 0,
      provenance: { lift: "CALCULATED", drag: "ESTIMATED" },
      notes,
    },
    provenance: "ESTIMATED",
    methods: METHODS,
    assumptions: ASSUMPTIONS,
    validity: combineValidity(checks),
  };
}
