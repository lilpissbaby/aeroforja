/**
 * @aeroforja/cfd-webgpu — virtual CFD tunnel (mini-design 006).
 *
 * Lattice Boltzmann D3Q19 with regularized BGK collision and Smagorinsky LES:
 * WGSL kernels for WebGPU (gpu.ts, kernels.ts) and the TypeScript reference
 * solver the validation cases and the kernels are checked against
 * (reference.ts). Geometry to lattice (voxelize.ts, domain.ts), lattice to SI
 * (tunnel.ts) and post-processing (post.ts). No UI.
 */
export * from "./lattice.ts";
export * from "./reference.ts";
export * from "./cases.ts";
export * from "./voxelize.ts";
export * from "./domain.ts";
export * from "./tunnel.ts";
export * from "./post.ts";
export * from "./methods.ts";
export * from "./validation.ts";
export { GpuLattice, requestLatticeDevice, gpuBytes, bodyLinks, equilibriumPopulations, type GpuLatticeSetup, type GpuForces } from "./gpu.ts";
