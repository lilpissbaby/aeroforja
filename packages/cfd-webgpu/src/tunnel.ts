/**
 * Virtual CFD tunnel (mini-design 006): from the drone's meshes and the test
 * conditions to the lattice the GPU runs (plan), and from lattice forces back
 * to SI and coefficients with their validity. Pure: no GPU here.
 */
import { checkRange, combineValidity, type Assumption, type Result, type ValidityCheck } from "@aeroforja/physics";
import { boundsOf, tunnelDomain, windDirection, type Domain } from "./domain.ts";
import { EQUILIBRIUM, FLUID, OUTLET, SOLID } from "./lattice.ts";
import { LBM_BOUNDARIES, LBM_D3Q19, MOMENTUM_EXCHANGE, TRACERS, VOXELIZATION } from "./methods.ts";
import type { Vec3 } from "./reference.ts";
import { voxelize, type MeshVoxels, type VoxelGrid } from "./voxelize.ts";

/** Lattice speed of the free stream (Ma of the lattice 0.087). */
export const U_LATTICE = 0.05;
export const DEFAULT_SMAGORINSKY = 0.17;

export interface CfdBody {
  readonly id: string;
  readonly name: string;
  /** FRD metres, nine numbers per triangle, closed if possible. */
  readonly triangles: Float64Array;
  readonly kind: "plate" | "part" | "block";
  /** For plates: normal axis (0 x, 1 y, 2 z), mid-plane coordinate and thickness, m. */
  readonly plate?: { readonly axis: 0 | 1 | 2; readonly offset: number; readonly thickness: number; readonly area: number };
}

export interface CfdAir {
  /** kg/m³ */
  readonly density: number;
  /** m²/s */
  readonly kinematicViscosity: number;
  /** m/s */
  readonly speedOfSound: number;
}

export interface CfdReference {
  /** m² */
  readonly area: number;
  /** m */
  readonly mac: number;
  /** m */
  readonly span: number;
}

export interface CfdSettings {
  /** m/s */
  readonly speed: number;
  /** rad */
  readonly alpha: number;
  /** rad */
  readonly beta: number;
  /** Cell budget. */
  readonly cells: number;
  readonly smagorinsky: number;
  /** Total simulated time in passes of the stream through the box, and the last part averaged. */
  readonly flowThroughs: number;
  readonly averageFlowThroughs: number;
}

export const DEFAULT_CFD: CfdSettings = {
  speed: 15,
  alpha: (4 * Math.PI) / 180,
  beta: 0,
  cells: 2_000_000,
  smagorinsky: DEFAULT_SMAGORINSKY,
  flowThroughs: 3,
  averageFlowThroughs: 1,
};

export interface PlateCells {
  readonly id: string;
  readonly name: string;
  /** m */
  readonly thickness: number;
  /** Thickness on the lattice, m. */
  readonly represented: number;
}

export interface CfdPlan {
  readonly grid: VoxelGrid;
  readonly flags: Uint8Array;
  /** Free stream in lattice units (cells per step), FRD axes. */
  readonly uLattice: Vec3;
  readonly tau0: number;
  readonly smagorinsky: number;
  /** s per step */
  readonly dt: number;
  /** N per lattice force unit. */
  readonly forceScale: number;
  /** CG in cell coordinates (moments are taken about it). */
  readonly momentOrigin: Vec3;
  readonly totalSteps: number;
  readonly averageFrom: number;
  readonly speed: number;
  readonly alpha: number;
  readonly beta: number;
  readonly air: CfdAir;
  readonly reference: CfdReference | null;
  readonly length: number;
  readonly reynolds: number;
  readonly mach: number;
  readonly blockage: number;
  readonly cellsPerFeature: number;
  readonly featureName: string;
  readonly solidCells: number;
  /** Part of the drone reached the edge of the box and was cut off. */
  readonly cut: boolean;
  readonly plates: readonly PlateCells[];
  readonly meshes: readonly (MeshVoxels & { readonly name: string })[];
  readonly notes: readonly string[];
}

export const CFD_ASSUMPTIONS: readonly Assumption[] = [
  { id: "lbm-weakly-compressible", description: "Weakly compressible: the lattice runs at Mach 0.087, compressibility error of order Ma² ≈ 1 %." },
  { id: "lbm-les-no-wall-model", description: "LES without a wall model: the boundary layer is not resolved; transition and laminar bubbles are not modelled. Separation at sharp edges does appear, fixed by the geometry." },
  { id: "lbm-staircase", description: "Staircase geometry of cubic cells; plates aligned with the lattice are exact in their plane and thickened to one cell when thinner." },
  { id: "lbm-propellers-off", description: "Propellers stopped and not modelled." },
  { id: "lbm-free-stream", description: "Free stream without turbulence in a finite box with equilibrium faces (blockage reported)." },
  { id: "lbm-rigid-fixed", description: "Rigid body held fixed." },
];

export const CFD_METHODS = [LBM_D3Q19, LBM_BOUNDARIES, MOMENTUM_EXCHANGE, VOXELIZATION, TRACERS] as const;

/** Builds the lattice of a tunnel run. Throws if there is nothing to test. */
export function planTunnel(bodies: readonly CfdBody[], settings: CfdSettings, air: CfdAir, cg: Vec3, reference: CfdReference | null): Result<CfdPlan> {
  const bounds = boundsOf(bodies.map((b) => b.triangles));
  if (bounds === null) throw new RangeError("Nothing to put in the tunnel: the drone has no 3D geometry");
  if (!(settings.speed > 0)) throw new RangeError("The speed must be positive");
  // Anchor each axis on the mid-plane of the largest plate with that normal.
  const anchors: [number | null, number | null, number | null] = [null, null, null];
  const best = [0, 0, 0];
  for (const b of bodies) {
    if (b.plate === undefined) continue;
    if (b.plate.area > best[b.plate.axis]!) {
      best[b.plate.axis] = b.plate.area;
      anchors[b.plate.axis] = b.plate.offset;
    }
  }
  const domain: Domain = tunnelDomain(bounds, { cells: settings.cells, anchors });
  const { grid } = domain;
  const { nx, ny, nz, dx } = grid;
  const solid = new Uint8Array(nx * ny * nz);
  const voxels = voxelize(grid, bodies.map((b) => ({ id: b.id, triangles: b.triangles })), solid);
  const flags = new Uint8Array(nx * ny * nz);
  let solidCells = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (i === 0) flags[c] = OUTLET;
        else if (i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) flags[c] = EQUILIBRIUM;
        else if (solid[c] === 1) {
          flags[c] = SOLID;
          solidCells++;
        } else flags[c] = FLUID;
      }
  const notes: string[] = [];
  const touching = solid.some((v, c) => v === 1 && flags[c] !== SOLID);
  if (touching) notes.push("Part of the drone reaches the edge of the box and was cut.");

  // ---- units ----
  const dir = windDirection(settings.alpha, settings.beta);
  const uLattice: Vec3 = [U_LATTICE * dir[0], U_LATTICE * dir[1], U_LATTICE * dir[2]];
  const dt = (U_LATTICE * dx) / settings.speed;
  const nuLattice = (air.kinematicViscosity * dt) / (dx * dx);
  const tau0 = 3 * nuLattice + 0.5;
  const forceScale = (air.density * dx ** 4) / (dt * dt);
  const momentOrigin: Vec3 = [(cg[0] - grid.origin[0]) / dx, (cg[1] - grid.origin[1]) / dx, (cg[2] - grid.origin[2]) / dx];
  const stepsPerPass = nx / U_LATTICE;
  const totalSteps = Math.ceil(settings.flowThroughs * stepsPerPass);
  const averageFrom = Math.max(0, totalSteps - Math.ceil(settings.averageFlowThroughs * stepsPerPass));

  // ---- blockage: columns along x holding a solid cell ----
  let blocked = 0;
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++)
        if (flags[i + nx * (j + ny * k)] === SOLID) {
          blocked++;
          break;
        }
    }
  const blockage = blocked / ((ny - 2) * (nz - 2));

  // ---- resolution of the smallest feature the semáforo looks at ----
  let feature = reference?.mac ?? Infinity;
  let featureName = reference !== null ? "mean aerodynamic chord" : "";
  for (const b of bodies) {
    if (b.kind !== "part") continue;
    const bb = boundsOf([b.triangles]);
    if (bb === null) continue;
    const smallest = Math.min(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    if (smallest < feature) {
      feature = smallest;
      featureName = b.name;
    }
  }
  const cellsPerFeature = Number.isFinite(feature) ? feature / dx : Infinity;

  // ---- plates: thickness on the lattice ----
  const plates: PlateCells[] = [];
  for (const b of bodies) {
    if (b.plate === undefined) continue;
    const { axis, offset, thickness } = b.plate;
    const o = grid.origin[axis]!;
    const lo = Math.ceil((offset - thickness / 2 - o) / dx - 1e-9);
    const hi = Math.floor((offset + thickness / 2 - o) / dx + 1e-9);
    const layers = Math.max(1, hi - lo + 1);
    plates.push({ id: b.id, name: b.name, thickness, represented: layers * dx });
  }

  const L = reference?.mac ?? domain.length;
  const reynolds = (settings.speed * L) / air.kinematicViscosity;
  const mach = settings.speed / air.speedOfSound;

  const checks: ValidityCheck[] = [
    checkRange({
      quantity: "cfdForces",
      value: 1,
      unit: "1",
      validated: { min: 0, max: 0 },
      applicable: { min: 0, max: 1 },
      note: "CFD forces are semi-quantitative in this delivery: amber at best (mini-design 006, decision 2).",
    }),
    checkRange({
      quantity: "cellsPerFeature",
      value: Number.isFinite(cellsPerFeature) ? cellsPerFeature : 1e9,
      unit: "1",
      validated: { min: 1e9, max: Infinity },
      applicable: { min: 8, max: Infinity },
      note: `Cells across ${featureName || "the smallest feature"}: below 8 the shape is not resolved.`,
    }),
    checkRange({
      quantity: "blockage",
      value: blockage,
      unit: "1",
      validated: { min: 0, max: 0.02 },
      applicable: { min: 0, max: 0.05 },
      note: "Frontal area over the cross-section of the box: above 5 % the walls of the box change the flow.",
    }),
    checkRange({
      quantity: "mach",
      value: mach,
      unit: "1",
      validated: { min: 0, max: 0.3 },
      applicable: { min: 0, max: 0.3 },
      note: "Incompressible flight only (M < 0.3).",
    }),
  ];
  for (const p of plates)
    if (p.represented > 2 * p.thickness) notes.push(`${p.name}: ${(p.thickness * 1000).toFixed(1)} mm thick, ${(p.represented * 1000).toFixed(1)} mm on the lattice (×${(p.represented / p.thickness).toFixed(1)}).`);
  for (const m of voxels) if (!m.closed) notes.push(`${bodies.find((b) => b.id === m.id)?.name ?? m.id}: open mesh, voxelized by its surface (it may come out thicker).`);
  void TRACERS;

  return {
    value: {
      grid,
      flags,
      uLattice,
      tau0,
      smagorinsky: settings.smagorinsky,
      dt,
      forceScale,
      momentOrigin,
      totalSteps,
      averageFrom,
      speed: settings.speed,
      alpha: settings.alpha,
      beta: settings.beta,
      air,
      reference,
      length: domain.length,
      reynolds,
      mach,
      blockage,
      cellsPerFeature,
      featureName,
      solidCells,
      cut: touching,
      plates,
      meshes: voxels.map((v) => ({ ...v, name: bodies.find((b) => b.id === v.id)?.name ?? v.id })),
      notes,
    },
    provenance: "CALCULATED",
    methods: [...CFD_METHODS],
    assumptions: [...CFD_ASSUMPTIONS],
    validity: combineValidity(checks),
  };
}

export interface CfdLoads {
  /** N, body axes FRD. */
  readonly force: Vec3;
  /** N·m about the CG. */
  readonly moment: Vec3;
  /** N, along the relative wind. */
  readonly drag: number;
  /** N, perpendicular to the wind in the plane of symmetry, positive up. */
  readonly lift: number;
  readonly side: number;
  /** m², D/q */
  readonly dragArea: number;
  readonly CL: number | null;
  readonly CD: number | null;
  readonly CY: number | null;
  readonly Cl: number | null;
  readonly Cm: number | null;
  readonly Cn: number | null;
}

/** Lattice force and moment (about the CG, arms in cells) to SI loads and coefficients. */
export function loadsFromLattice(plan: CfdPlan, force: Vec3, moment: Vec3): CfdLoads {
  const s = plan.forceScale;
  const F: Vec3 = [force[0] * s, force[1] * s, force[2] * s];
  const M: Vec3 = [moment[0] * s * plan.grid.dx, moment[1] * s * plan.grid.dx, moment[2] * s * plan.grid.dx];
  const d = windDirection(plan.alpha, plan.beta);
  const lAxis: Vec3 = [Math.sin(plan.alpha), 0, -Math.cos(plan.alpha)];
  const drag = F[0] * d[0] + F[1] * d[1] + F[2] * d[2];
  const lift = F[0] * lAxis[0] + F[2] * lAxis[2];
  const q = 0.5 * plan.air.density * plan.speed * plan.speed;
  const r = plan.reference;
  return {
    force: F,
    moment: M,
    drag,
    lift,
    side: F[1],
    dragArea: drag / q,
    CL: r === null ? null : lift / (q * r.area),
    CD: r === null ? null : drag / (q * r.area),
    CY: r === null ? null : F[1] / (q * r.area),
    Cl: r === null ? null : M[0] / (q * r.area * r.span),
    Cm: r === null ? null : M[1] / (q * r.area * r.mac),
    Cn: r === null ? null : M[2] / (q * r.area * r.span),
  };
}

/** Pressure coefficient from the lattice density: Cp = c_s² (ρ − 1) / (½ U²). */
export function cpFromDensity(rhoMinusOne: number): number {
  return rhoMinusOne / 3 / (0.5 * U_LATTICE * U_LATTICE);
}
