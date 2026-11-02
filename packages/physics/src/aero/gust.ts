/**
 * Gust test (mini-design 007): a fixed-wing design flying level at 1 g meets
 * a discrete vertical 1 − cos gust. Unsteady vortex lattice (uvlm.ts), rigid
 * vertical and pitch motion, and the bending of each half wing as a plate.
 */
import { checkRange, combineValidity } from "../core/validity.ts";
import type { Assumption, Provenance, Result, ValidityCheck } from "../core/result.ts";
import type { Triple } from "../core/vector.ts";
import { bendingMoments, deflection, firstBendingFrequency, plateStress, type PlateBeam } from "../structures/beam.ts";
import { DISCRETE_GUST, PLATE_BENDING, PRATT_WALKER, RIGID_LONGITUDINAL, UNSTEADY_VORTEX_LATTICE, VORTEX_LATTICE } from "./methods.ts";
import { buildUvlm, simulateLongitudinal, type AeroModel, type UvlmModel } from "./uvlm.ts";
import { buildLattice, factorLattice, solveVlm, type Lattice, type LatticeOptions, type LiftingSurfaceInput } from "./vlm.ts";

const G0 = 9.80665;
const DEG = Math.PI / 180;

export interface GivenValue {
  readonly value: number;
  readonly provenance: Provenance;
}

export interface GustInput {
  readonly surfaces: readonly LiftingSurfaceInput[];
  readonly lattice: LatticeOptions;
  /** kg, kg·m², FRD m */
  readonly mass: number;
  readonly iyy: number;
  readonly cg: Triple;
  /** m/s */
  readonly speed: number;
  readonly air: { readonly density: number; readonly kinematicViscosity: number; readonly speedOfSound: number };
  readonly gust: {
    /** U_ds, m/s */
    readonly amplitude: number;
    /** H, m; null: 12.5 c̄ (Pratt & Walker). */
    readonly gradient: number | null;
    readonly up: boolean;
  };
  readonly model: AeroModel;
  readonly wing: {
    /** Plate thickness of the main wing, m (null: not a plate, no stress). */
    readonly thickness: number | null;
    /** Young's modulus, Pa. */
    readonly young: GivenValue | null;
    /** Flexural strength, Pa. */
    readonly strength: GivenValue | null;
    /** Mass per area of the wing, kg/m². */
    readonly arealMass: GivenValue | null;
  };
  /** Simulated time, s; default 2H/V + 1 s. */
  readonly duration?: number;
}

export interface GustTrim {
  readonly CL: number;
  /** rad */
  readonly alpha: number;
  readonly Cm: number;
  readonly CLalpha: number;
  readonly staticMargin: number;
}

export interface GustReference {
  readonly area: number;
  readonly span: number;
  readonly mac: number;
  /** Semi-span of the main wing, m. */
  readonly semiSpan: number;
}

export interface GustHistory {
  /** s */
  readonly t: Float64Array;
  /** Gust velocity at the nose, m/s (up positive). */
  readonly gustAtNose: Float64Array;
  readonly loadFactor: Float64Array;
  /** Extra lift, N. */
  readonly deltaLift: Float64Array;
  /** Angle of attack at the quarter chord of the mean chord, rad (1 g + increment). */
  readonly alpha: Float64Array;
  /** rad, rad/s */
  readonly theta: Float64Array;
  readonly q: Float64Array;
  /** Root bending moment of the right half wing, N·m (up positive). */
  readonly rootMoment: Float64Array;
  /** Largest bending stress along the half wing, Pa (null without plate thickness). */
  readonly stress: Float64Array | null;
  /** Tip deflection, m (null without E). */
  readonly tipDeflection: Float64Array | null;
}

export interface GustPeak {
  readonly value: number;
  readonly t: number;
}

export interface GustResponse {
  readonly reference: GustReference;
  readonly trim: GustTrim;
  readonly gradient: number;
  readonly history: GustHistory;
  readonly maxLoadFactor: GustPeak;
  readonly minLoadFactor: GustPeak;
  readonly maxRootMoment: GustPeak;
  readonly maxStress: GustPeak | null;
  readonly maxDeflection: GustPeak | null;
  readonly maxAlpha: GustPeak;
  /** Shape of the right half wing at the largest root moment: y (m) and deflection (m, null without E). */
  readonly spanStations: Float64Array;
  readonly deflectedShape: Float64Array | null;
  readonly safetyFactor: number | null;
  /** First bending frequency of the half wing, Hz (null without E or mass per area). */
  readonly frequency: number | null;
  /** Pratt–Walker reference for the same gust: Δn and K_g. */
  readonly prattWalker: { readonly deltaN: number; readonly kg: number; readonly mu: number };
  readonly notes: readonly string[];
}

export const GUST_ASSUMPTIONS: readonly Assumption[] = [
  { id: "gust-potential-flow", description: "Potential flow without stall: beyond 10° of angle of attack the real load is limited by stall, which is not modelled." },
  { id: "gust-longitudinal", description: "Constant forward speed, vertical and pitch motion only; no controls and no flight controller." },
  { id: "gust-frozen-wake", description: "Flat wake frozen in body axes (small perturbations)." },
  { id: "gust-rigid-flight", description: "Rigid aircraft for the flight mechanics; the bending is computed one way (loads to deflection), without aeroelasticity or structural dynamics." },
  { id: "gust-solid-plate", description: "Solid flat plate without torsion: holes make the wing less stiff and sweep unloads the tip through bending–torsion coupling (not modelled)." },
  { id: "gust-trim-loads", description: "The 1 g span loading is that of the lattice at the 1 g angle of attack, as if trimmed without changing it." },
];

/** 1 − cos gust: w(s) = (U/2)(1 − cos(π s/H)) for 0 ≤ s ≤ 2H. */
export function oneMinusCosine(s: number, amplitude: number, gradient: number): number {
  if (s <= 0 || s >= 2 * gradient) return 0;
  return 0.5 * amplitude * (1 - Math.cos((Math.PI * s) / gradient));
}

/** Pratt–Walker gust alleviation factor K_g = 0.88 μ / (5.3 + μ). */
export function prattWalkerKg(mu: number): number {
  return (0.88 * mu) / (5.3 + mu);
}

export function mainWingReference(lattice: Lattice): GustReference & { readonly surface: number; readonly macLeadingEdgeX: number } {
  let best = -1;
  let bestArea = 0;
  lattice.surfaces.forEach((s, i) => {
    if (s.orientation !== "horizontal") return;
    const a = lattice.strips.filter((k) => k.surface === i).reduce((sum, k) => sum + k.chord * (k.s1 - k.s0), 0);
    if (a > bestArea) {
      bestArea = a;
      best = i;
    }
  });
  if (best < 0) throw new RangeError("The gust test needs a horizontal wing.");
  let area = 0, c2 = 0, cx = 0, sMin = Infinity, sMax = -Infinity;
  for (const s of lattice.strips) {
    if (lattice.surfaces[s.surface]!.orientation !== "horizontal") continue;
    const w = s.s1 - s.s0;
    area += s.chord * w;
    c2 += s.chord * s.chord * w;
    cx += s.leadingEdgeX * s.chord * w;
    sMin = Math.min(sMin, s.s0);
    sMax = Math.max(sMax, s.s1);
  }
  const own = lattice.strips.filter((k) => k.surface === best);
  const semiSpan = Math.max(...own.map((k) => k.s1));
  return { area, span: sMax - sMin, mac: c2 / area, surface: best, macLeadingEdgeX: cx / area, semiSpan };
}

export interface GustSetup {
  readonly lattice: Lattice;
  readonly model: UvlmModel;
  readonly reference: ReturnType<typeof mainWingReference>;
  readonly trim: GustTrim;
  /** Steady 1 g z force of each strip, N. */
  readonly baseStripFz: Float64Array;
}

/** Lattice, trim and the unsteady model: built once, reused for every gust of a sweep. */
export function gustSetup(input: GustInput): GustSetup {
  if (!(input.mass > 0) || !(input.iyy > 0)) throw new RangeError("The gust test needs the mass and the pitch inertia.");
  const lattice = buildLattice(input.surfaces, input.lattice);
  const reference = mainWingReference(lattice);
  const f = factorLattice(lattice);
  const V = input.speed;
  const rho = input.air.density;
  const q = 0.5 * rho * V * V;
  const solve = (alpha: number) => solveVlm(f, { alpha, beta: 0, speed: V, density: rho }, input.cg);
  const lift = (s: ReturnType<typeof solve>, a: number) => s.force[0] * Math.sin(a) - s.force[2] * Math.cos(a);
  const a0 = 0, a1 = 4 * DEG;
  const s0 = solve(a0), s1 = solve(a1);
  const CL0 = lift(s0, a0) / (q * reference.area);
  const CL1 = lift(s1, a1) / (q * reference.area);
  const CLalpha = (CL1 - CL0) / (a1 - a0);
  const Cm0 = s0.moment[1] / (q * reference.area * reference.mac);
  const Cm1 = s1.moment[1] / (q * reference.area * reference.mac);
  const CL = (input.mass * G0) / (q * reference.area);
  const alpha = (CL - CL0) / CLalpha;
  const s1g = solve(alpha);
  const Cm = s1g.moment[1] / (q * reference.area * reference.mac);
  const staticMargin = -((Cm1 - Cm0) / (CL1 - CL0));
  const baseStripFz = new Float64Array(lattice.strips.length);
  lattice.strips.forEach((s, k) => {
    for (const p of s.panels) baseStripFz[k]! += s1g.panelForces[p]![2];
  });
  const nc = Math.max(1, Math.round(input.lattice.chordwisePanels));
  const dt = reference.mac / (nc * V);
  const model = buildUvlm(lattice, { speed: V, density: rho, dt, wakeRows: Math.ceil(20 * nc), model: input.model });
  return { lattice, model, reference, trim: { CL, alpha, Cm, CLalpha, staticMargin }, baseStripFz };
}

export function gustResponse(input: GustInput, prepared?: GustSetup): Result<GustResponse> {
  const setup = prepared ?? gustSetup(input);
  const { lattice, model, reference, trim, baseStripFz } = setup;
  const V = input.speed;
  const rho = input.air.density;
  const H = input.gust.gradient ?? 12.5 * reference.mac;
  if (!(H > 0)) throw new RangeError("The gust gradient distance must be positive.");
  const U = input.gust.up ? input.gust.amplitude : -input.gust.amplitude;
  const dt = model.options.dt;
  const duration = input.duration ?? (2 * H) / V + 1;
  const steps = Math.min(6000, Math.ceil(duration / dt));
  const xs = model.controlX;
  const front = Math.max(...lattice.panels.map((p) => Math.max(p.corners[0][0], p.corners[1][0])));
  const run = simulateLongitudinal(model, { mass: input.mass, iyy: input.iyy, cgX: input.cg[0], freeHeave: true, freePitch: true }, steps, (t, i) =>
    oneMinusCosine(V * t - (front - xs[i]!), U, H),
  );

  // ---- half wing as a beam: right half of the main wing ----
  const S = lattice.strips.length;
  const half = lattice.strips.map((s, k) => ({ s, k })).filter(({ s }) => s.surface === reference.surface && s.sMid > 0).sort((a, b) => a.s.sMid - b.s.sMid);
  const stations = [0, ...half.map(({ s }) => s.sMid), half.length > 0 ? half[half.length - 1]!.s.s1 : 0];
  const chords = [half[0]?.s.chord ?? 0, ...half.map(({ s }) => s.chord), half[half.length - 1]?.s.chord ?? 0];
  const t = input.wing.thickness;
  const beam: PlateBeam = { stations, chord: chords, thickness: t ?? 0 };
  const areal = input.wing.arealMass?.value ?? 0;
  const stripMass = half.map(({ s }) => areal * s.chord * (s.s1 - s.s0));
  const E = input.wing.young?.value ?? null;

  const history: GustHistory = {
    t: run.t,
    gustAtNose: Float64Array.from(run.t, (tt) => oneMinusCosine(V * tt, U, H)),
    loadFactor: new Float64Array(steps + 1),
    deltaLift: new Float64Array(steps + 1),
    alpha: new Float64Array(steps + 1),
    theta: run.theta,
    q: run.q,
    rootMoment: new Float64Array(steps + 1),
    stress: t === null ? null : new Float64Array(steps + 1),
    tipDeflection: E === null || t === null ? null : new Float64Array(steps + 1),
  };
  const xRef = reference.macLeadingEdgeX - reference.mac / 4;
  let peakMoment = { value: -Infinity, t: 0, step: 0 };
  const loadsAt = (step: number, n: number) =>
    half.map(({ s, k }, j) => ({ y: s.sMid, force: -(baseStripFz[k]! + run.stripFz[step * S + k]!) - n * stripMass[j]! * G0 }));
  for (let step = 0; step <= steps; step++) {
    const dn = -run.fz[step]! / (input.mass * G0);
    const n = 1 + dn;
    history.loadFactor[step] = n;
    history.deltaLift[step] = -run.fz[step]!;
    const up = V * run.theta[step]! + run.zDot[step]! - run.q[step]! * (xRef - input.cg[0]) + oneMinusCosine(V * run.t[step]! - (front - xRef), U, H);
    history.alpha[step] = trim.alpha + up / V;
    const loads = loadsAt(step, n);
    const m = bendingMoments(beam, loads);
    history.rootMoment[step] = m[0]!;
    if (history.stress !== null && t !== null) {
      let smax = 0;
      for (let j = 0; j < stations.length - 1; j++) smax = Math.max(smax, Math.abs(plateStress(m[j]!, chords[j]!, t)));
      history.stress[step] = smax;
    }
    if (history.tipDeflection !== null && E !== null) {
      const w = deflection(beam, m, E);
      history.tipDeflection[step] = w[w.length - 1]!;
    }
    if (m[0]! > peakMoment.value) peakMoment = { value: m[0]!, t: run.t[step]!, step };
  }
  const peak = (a: Float64Array, sign = 1): GustPeak => {
    let best = 0;
    for (let i = 1; i < a.length; i++) if (sign * a[i]! > sign * a[best]!) best = i;
    return { value: a[best]!, t: run.t[best]! };
  };
  const maxLoadFactor = peak(history.loadFactor);
  const minLoadFactor = peak(history.loadFactor, -1);
  const maxAlpha = peak(history.alpha);
  const maxStress = history.stress === null ? null : peak(history.stress);
  const maxDeflection = history.tipDeflection === null ? null : peak(history.tipDeflection);
  const shapeMoments = bendingMoments(beam, loadsAt(peakMoment.step, history.loadFactor[peakMoment.step]!));
  const deflectedShape = E === null || t === null ? null : deflection(beam, shapeMoments, E);
  const strength = input.wing.strength?.value ?? null;
  const safetyFactor = strength !== null && maxStress !== null && maxStress.value > 0 ? strength / maxStress.value : null;
  const frequency =
    E !== null && t !== null && areal > 0 && half.length > 0 ? firstBendingFrequency(beam, [0, ...stripMass, 0], E) : null;

  // ---- Pratt–Walker reference ----
  const wingLoading = (input.mass * G0) / reference.area;
  const mu = (2 * wingLoading) / (rho * reference.mac * trim.CLalpha * G0);
  const kg = prattWalkerKg(mu);
  const prattWalker = { deltaN: (rho * V * trim.CLalpha * kg * Math.abs(U)) / (2 * wingLoading), kg, mu };

  // ---- validity ----
  const notes: string[] = [...lattice.notes];
  if (Math.abs(trim.Cm) > 0.01) notes.push(`Not trimmed: Cm = ${trim.Cm.toFixed(3)} at the 1 g angle of attack; the design needs controls to fly at this CL. Only the increments are analysed.`);
  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "gustAlpha",
      value: Math.max(Math.abs(maxAlpha.value), Math.abs(peak(history.alpha, -1).value)) / DEG,
      unit: "deg",
      validated: { min: 0, max: 5 },
      applicable: { min: 0, max: 10 },
      note: "1 g angle of attack plus the gust increment: beyond 10° a flat plate stalls and the real load is limited by the stall (not modelled).",
    }),
    checkRange({
      quantity: "staticMargin",
      value: trim.staticMargin,
      unit: "1",
      validated: { min: 0, max: Infinity },
      applicable: { min: 0, max: Infinity },
      note: "With the CG behind the neutral point the response diverges.",
    }),
  ];
  if (maxDeflection !== null) {
    checks.push(
      checkRange({
        quantity: "tipDeflectionRatio",
        value: Math.abs(maxDeflection.value) / reference.semiSpan,
        unit: "1",
        validated: { min: 0, max: 0.05 },
        applicable: { min: 0, max: 0.1 },
        note: "Linear beam theory: beyond 10 % of the semi-span the deflection changes the loads (aeroelasticity, not modelled).",
      }),
    );
  }
  if (frequency !== null) {
    const ratio = (2 * H) / V / (1 / frequency);
    checks.push(
      checkRange({
        quantity: "gustToBendingPeriod",
        value: ratio,
        unit: "1",
        validated: { min: 3, max: Infinity },
        applicable: { min: 0, max: Infinity },
        note: "Gust passage time over the first bending period: below 3 the wing vibrates and the dynamic deflection may be larger (not modelled).",
      }),
    );
  }
  for (const [name, given] of [["youngModulus", input.wing.young], ["flexuralStrength", input.wing.strength], ["arealMass", input.wing.arealMass]] as const) {
    if (given === null) continue;
    checks.push(
      checkRange({
        quantity: name,
        value: given.provenance === "MEASURED" ? 0 : 1,
        unit: "1",
        validated: { min: 0, max: 0 },
        applicable: { min: 0, max: 1 },
        note: "Material data: green when measured, amber from a datasheet.",
      }),
    );
  }
  const validity = combineValidity(checks);
  return {
    value: {
      reference: { area: reference.area, span: reference.span, mac: reference.mac, semiSpan: reference.semiSpan },
      trim,
      gradient: H,
      history,
      maxLoadFactor,
      minLoadFactor,
      maxRootMoment: peak(history.rootMoment),
      maxStress,
      maxDeflection,
      maxAlpha,
      spanStations: Float64Array.from(stations),
      deflectedShape,
      safetyFactor,
      frequency,
      prattWalker,
      notes,
    },
    provenance: input.wing.young?.provenance === "ESTIMATED" || input.wing.strength?.provenance === "ESTIMATED" ? "ESTIMATED" : "CALCULATED",
    methods: [input.model === "unsteady" ? UNSTEADY_VORTEX_LATTICE : VORTEX_LATTICE, DISCRETE_GUST, RIGID_LONGITUDINAL, PLATE_BENDING, PRATT_WALKER],
    assumptions: [...GUST_ASSUMPTIONS, ...(input.model === "quasi-steady" ? [{ id: "gust-quasi-steady", description: "Quasi-steady aerodynamics: the lift follows the angle of attack instantly (no lag); it overestimates short gusts." }] : [])],
    validity,
  };
}

/** n_max and root moment for a list of gradient distances (m), reusing one setup. */
export function gustSweep(
  input: GustInput,
  gradients: readonly number[],
  prepared?: GustSetup,
): { readonly gradient: number; readonly maxLoadFactor: number; readonly maxRootMoment: number }[] {
  const setup = prepared ?? gustSetup(input);
  return gradients.map((H) => {
    const r = gustResponse({ ...input, gust: { ...input.gust, gradient: H }, wing: { ...input.wing, young: null } }, setup).value;
    return { gradient: H, maxLoadFactor: input.gust.up ? r.maxLoadFactor.value : r.minLoadFactor.value, maxRootMoment: r.maxRootMoment.value };
  });
}
