/**
 * GPU = CPU check of mini-design 006 (case 4): the WGSL kernels against the
 * TypeScript reference solver on small lattices with every boundary type,
 * the Smagorinsky model on and a body in the flow. Driven by gpu-check.cjs.
 */
import { EQUILIBRIUM, FLUID, OUTLET, Q, SOLID } from "../../src/lattice.ts";
import { ReferenceSolver, type Vec3 } from "../../src/reference.ts";
import { GpuLattice, requestLatticeDevice } from "../../src/gpu.ts";
import { GPU_CASES, runGpuCase } from "../../src/validation.ts";

interface CaseReport {
  name: string;
  steps: number;
  maxDu: number;
  maxDrho: number;
  forceCpu: Vec3;
  forceGpu: Vec3;
  maxDforceRel: number;
  momentCpu: Vec3;
  momentGpu: Vec3;
}

function tunnelBox(nx: number, ny: number, nz: number): Uint8Array {
  const flags = new Uint8Array(nx * ny * nz).fill(FLUID);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (i === 0) flags[c] = OUTLET;
        else if (i === nx - 1 || j === 0 || j === ny - 1 || k === 0 || k === nz - 1) flags[c] = EQUILIBRIUM;
        else if (i >= 12 && i <= 15 && j >= 6 && j <= 9 && k >= 5 && k <= 10) flags[c] = SOLID;
        else if (i === 9 && j >= 4 && j <= 11 && k === 8) flags[c] = SOLID; // a one-cell plate
      }
  return flags;
}

async function compare(device: GPUDevice, name: string, nx: number, ny: number, nz: number, flags: Uint8Array, u: Vec3, tau0: number, cs: number, steps: number, periodic?: [boolean, boolean, boolean]): Promise<CaseReport> {
  const origin: Vec3 = [nx / 2, ny / 2, nz / 2];
  const cpu = new ReferenceSolver({ grid: { nx, ny, nz, ...(periodic ? { periodic } : {}) }, flags, tau0, smagorinsky: cs, boundaryVelocity: u, momentOrigin: origin });
  cpu.initialize((i, j, k) => ({
    rho: 1 + 0.001 * Math.sin(i * 0.7) * Math.cos(k * 0.3),
    u: [u[0] + 0.01 * Math.sin(j * 0.5), u[1] + 0.005 * Math.cos(i * 0.4), u[2] + 0.004 * Math.sin(k * 0.6)],
  }));
  const initial = Float32Array.from(cpu.g);
  const gpu = new GpuLattice(device, { nx, ny, nz, ...(periodic ? { periodic } : {}), flags, tau0, smagorinsky: cs, boundaryVelocity: u, momentOrigin: origin, initial });
  cpu.run(steps);
  gpu.step(steps);
  await gpu.idle();
  const macro = await gpu.macroscopic();
  const forces = await gpu.forces();
  cpu.step(); // the CPU computes the force of step t+1 from the populations after step t
  let maxDu = 0, maxDrho = 0;
  // Compare with the macroscopic fields after `steps` steps: re-run a fresh CPU solver is not needed,
  // the GPU macro buffer holds step `steps`; recompute the CPU one from a second solver.
  const cpu2 = new ReferenceSolver({ grid: { nx, ny, nz, ...(periodic ? { periodic } : {}) }, flags, tau0, smagorinsky: cs, boundaryVelocity: u, momentOrigin: origin });
  cpu2.g.set(initial);
  cpu2.run(steps);
  for (let c = 0; c < nx * ny * nz; c++) {
    if (flags[c] === SOLID) continue;
    maxDrho = Math.max(maxDrho, Math.abs(macro[4 * c]! - cpu2.rho[c]!));
    maxDu = Math.max(maxDu, Math.abs(macro[4 * c + 1]! - cpu2.ux[c]!), Math.abs(macro[4 * c + 2]! - cpu2.uy[c]!), Math.abs(macro[4 * c + 3]! - cpu2.uz[c]!));
  }
  const fc = cpu.force;
  const fg = forces.force;
  const scale = Math.max(1e-12, Math.hypot(...fc));
  const maxDforceRel = Math.max(Math.abs(fg[0] - fc[0]), Math.abs(fg[1] - fc[1]), Math.abs(fg[2] - fc[2])) / scale;
  gpu.destroy();
  void Q;
  return { name, steps, maxDu, maxDrho, forceCpu: fc, forceGpu: fg, maxDforceRel, momentCpu: cpu.moment, momentGpu: forces.moment };
}

async function main(): Promise<void> {
  const out = document.getElementById("out")!;
  const gpu = navigator.gpu;
  if (gpu === undefined) {
    out.textContent = "Sin WebGPU";
    (window as unknown as { __result: unknown }).__result = { error: "no WebGPU" };
    return;
  }
  const { device, adapter } = await requestLatticeDevice(gpu);
  const gpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (e) => gpuErrors.push((e as GPUUncapturedErrorEvent).error.message));
  const params = new URLSearchParams(location.search);
  const caseId = params.get("case");
  if (caseId !== null) {
    const c = GPU_CASES.find((k) => k.id === caseId);
    if (c === undefined) throw new Error(`unknown case ${caseId}`);
    const d = Number(params.get("d") ?? "10");
    const outcome = await runGpuCase(device, c, d, Number(params.get("passes") ?? "4"), c.smagorinsky, (f) => (out.textContent = `${c.name}: ${(100 * f).toFixed(0)} %`));
    const result = { adapter: adapter.info.architecture || adapter.info.vendor, case: c, outcome };
    out.textContent = JSON.stringify(result, null, 2);
    (window as unknown as { __result: unknown }).__result = result;
    return;
  }
  const reports: CaseReport[] = [];
  reports.push(await compare(device, "tunnel box 24×16×16, body + plate, Smagorinsky 0.17, τ₀ = 0.5003", 24, 16, 16, tunnelBox(24, 16, 16), [-0.05, 0.003, 0.004], 0.5003, 0.17, 300));
  reports.push(await compare(device, "periodic 16×12×10, no body, τ₀ = 0.8", 16, 12, 10, new Uint8Array(16 * 12 * 10), [0.02, -0.01, 0.0], 0.8, 0, 300, [true, true, true]));
  await device.queue.onSubmittedWorkDone();
  if (gpuErrors.length > 0) throw new Error(gpuErrors.join("\n"));
  const result = { adapter: adapter.info.architecture || adapter.info.vendor, reports };
  out.textContent = JSON.stringify(result, null, 2);
  (window as unknown as { __result: unknown }).__result = result;
}

main().catch((e: unknown) => {
  (window as unknown as { __result: unknown }).__result = { error: String(e) };
  document.getElementById("out")!.textContent = String(e);
});
