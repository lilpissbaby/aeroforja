/**
 * Published reference cases of the CFD tunnel (mini-design 006) and the
 * GPU runner behind the app's «Validar en tu GPU» (cases 3 and 7).
 * Tolerances as approved by the owner on 01-11-2026.
 */
import { cylinderInBox, sphereInBox, type CaseSetup } from "./cases.ts";
import { GpuLattice } from "./gpu.ts";
import type { Vec3 } from "./reference.ts";

export interface CfdReferenceCase {
  readonly id: string;
  readonly name: string;
  readonly reynolds: number;
  readonly cd: { readonly min: number; readonly max: number };
  readonly tolerance: number;
  /** Smagorinsky constant of the run: 0 for a laminar case, as in the tunnel otherwise. */
  readonly smagorinsky: number;
  readonly source: string;
}

export const SCHAFER_TUREK_2D1 = {
  id: "schafer-turek-2d1",
  reynolds: 20,
  cd: { min: 5.57, max: 5.59 },
  deltaP: { min: 0.1172, max: 0.1176 },
  tolerance: 0.05,
  cellsPerDiameter: 20,
  source:
    "Schäfer, M., Turek, S. (1996). Benchmark computations of laminar flow around a cylinder. In: Flow Simulation with High-Performance Computers II, Notes on Numerical Fluid Mechanics 52, Vieweg, 547–566 (test case 2D-1).",
} as const;

export const SPHERE_RE100: CfdReferenceCase = {
  id: "sphere-re100",
  name: "Esfera, Re = 100",
  reynolds: 100,
  cd: { min: 1.087, max: 1.087 },
  tolerance: 0.06,
  smagorinsky: 0,
  source:
    "Clift, R., Grace, J. R., Weber, M. E. (1978). Bubbles, Drops, and Particles. Academic Press, table 5.2: CD = 24/Re (1 + 0.1935 Re^0.6305), 20 < Re ≤ 260; Johnson, T. A., Patel, V. C. (1999), J. Fluid Mech. 378, 19–70.",
};

export const SPHERE_RE1E5: CfdReferenceCase = {
  id: "sphere-re1e5",
  name: "Esfera, Re = 1·10⁵",
  reynolds: 1e5,
  cd: { min: 0.47, max: 0.47 },
  tolerance: 0.25,
  smagorinsky: 0.17,
  source: "Achenbach, E. (1972). Experiments on the flow past spheres at very high Reynolds numbers. J. Fluid Mech. 54, 565–575 (subcritical CD ≈ 0.47).",
};

export const CYLINDER_RE1E5: CfdReferenceCase = {
  id: "cylinder-re1e5",
  name: "Cilindro, Re = 1·10⁵",
  reynolds: 1e5,
  cd: { min: 1.2, max: 1.2 },
  tolerance: 0.25,
  smagorinsky: 0.17,
  source: "Achenbach, E. (1968). Distribution of local pressure and skin friction around a circular cylinder in cross-flow up to Re = 5·10⁶. J. Fluid Mech. 34, 625–639; Roshko, A. (1961), J. Fluid Mech. 10, 345–356 (subcritical CD ≈ 1.2).",
};

export const GPU_CASES = [SPHERE_RE100, SPHERE_RE1E5, CYLINDER_RE1E5] as const;

export interface CaseOutcome {
  readonly id: string;
  readonly cd: number;
  readonly error: number;
  readonly pass: boolean;
  readonly cells: number;
  readonly steps: number;
  readonly seconds: number;
}

/** Relative error against a reference band (0 inside it). */
export function bandError(value: number, band: { readonly min: number; readonly max: number }): number {
  if (value < band.min) return (value - band.min) / band.min;
  if (value > band.max) return (value - band.max) / band.max;
  return 0;
}

function setupFor(c: CfdReferenceCase, d: number): CaseSetup & { readonly centre: Vec3 } {
  return c.id === "cylinder-re1e5" ? cylinderInBox(d, c.reynolds) : sphereInBox(d, c.reynolds);
}

/**
 * Runs one case on the GPU: `passes` passes of the stream through the box,
 * the drag averaged over the last third (sampled every 20 steps).
 */
export async function runGpuCase(
  device: GPUDevice,
  c: CfdReferenceCase,
  d: number,
  passes = 4,
  smagorinsky = c.smagorinsky,
  progress?: (fraction: number) => void,
): Promise<CaseOutcome> {
  const s = setupFor(c, d);
  const t0 = performance.now();
  const lattice = new GpuLattice(device, {
    nx: s.grid.nx,
    ny: s.grid.ny,
    nz: s.grid.nz,
    ...(s.grid.periodic ? { periodic: s.grid.periodic } : {}),
    flags: s.flags,
    tau0: s.tau0,
    smagorinsky,
    boundaryVelocity: s.boundaryVelocity,
    momentOrigin: s.centre,
  });
  const total = Math.ceil((passes * s.grid.nx) / s.referenceSpeed);
  const from = Math.floor((2 * total) / 3);
  let sum = 0;
  let samples = 0;
  const batch = 20;
  for (let step = 0; step < total; step += batch) {
    lattice.step(batch);
    if (step + batch >= from) {
      const f = await lattice.forces();
      sum += f.force[0];
      samples++;
    } else if (step % 400 === 0) {
      await lattice.idle();
    }
    progress?.(Math.min(1, (step + batch) / total));
  }
  await lattice.idle();
  const fx = sum / Math.max(1, samples);
  lattice.destroy();
  const cd = (2 * fx) / (s.referenceSpeed ** 2 * s.referenceArea);
  const error = bandError(cd, c.cd);
  return { id: c.id, cd, error, pass: Math.abs(error) <= c.tolerance, cells: s.grid.nx * s.grid.ny * s.grid.nz, steps: total, seconds: (performance.now() - t0) / 1000 };
}
