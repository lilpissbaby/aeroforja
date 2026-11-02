/**
 * WebGPU host of the lattice Boltzmann tunnel: buffers, pipelines and the
 * step loop. Runs in a Web Worker (navigator.gpu). Everything here is in
 * lattice units; tunnel.ts converts to SI.
 */
import { FORCE_WGSL, PARTICLES_WGSL, SLICE_WGSL, STEP_WGSL } from "./kernels.ts";
import { OPPOSITE, Q, SOLID } from "./lattice.ts";
import { inwardNeighbour, type Vec3 } from "./reference.ts";

void inwardNeighbour;

/** WebGPU usage and map flags (values of the WebGPU specification; the TypeScript library only types them). */
const GPUBufferUsage = { MAP_READ: 0x0001, COPY_SRC: 0x0004, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080 } as const;
const GPUMapMode = { READ: 0x0001 } as const;

export interface GpuLatticeSetup {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly periodic?: readonly [boolean, boolean, boolean];
  readonly flags: Uint8Array;
  readonly tau0: number;
  readonly smagorinsky: number;
  readonly boundaryVelocity: Vec3;
  readonly momentOrigin: Vec3;
  /** Shifted populations to start from (Q·N); default: equilibrium of ρ = 1 and the boundary velocity in every non-solid cell. */
  readonly initial?: Float32Array;
}

export interface GpuForces {
  /** Lattice units, on the SOLID cells. */
  readonly force: Vec3;
  readonly moment: Vec3;
}

/** Bytes needed on the GPU for a lattice of n cells (populations ×2, flags, macro, mean). */
export function gpuBytes(n: number): { readonly total: number; readonly largestBuffer: number } {
  const pop = Q * 4 * n;
  return { total: 2 * pop + 4 * n + 16 * n + 16 * n, largestBuffer: pop };
}

/**
 * Requests an adapter and a device with the largest storage buffers the
 * adapter allows, so one device serves every resolution. `maxCells` is the
 * largest lattice whose populations fit in one buffer.
 */
export async function requestLatticeDevice(gpu: GPU): Promise<{ device: GPUDevice; adapter: GPUAdapter; maxCells: number }> {
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (adapter === null) throw new Error("WebGPU: no adapter");
  const maxBinding = adapter.limits.maxStorageBufferBindingSize;
  const maxBuffer = adapter.limits.maxBufferSize;
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: maxBinding,
      maxBufferSize: maxBuffer,
      maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
    },
  });
  return { device, adapter, maxCells: Math.floor(Math.min(maxBinding, maxBuffer) / (Q * 4)) };
}

const MAX_GROUPS = 65535;

function dispatchSize(threads: number, size: number): [number, number] {
  const groups = Math.ceil(threads / size);
  if (groups <= MAX_GROUPS) return [groups, 1];
  return [MAX_GROUPS, Math.ceil(groups / MAX_GROUPS)];
}

export class GpuLattice {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly n: number;
  /** Steps done. */
  time = 0;
  /** Steps accumulated in the mean fields. */
  meanSteps = 0;
  readonly linkCount: number;
  private readonly device: GPUDevice;
  private readonly pop: [GPUBuffer, GPUBuffer];
  private readonly flagsBuffer: GPUBuffer;
  private readonly params: GPUBuffer;
  private readonly paramsData: ArrayBuffer;
  readonly macro: GPUBuffer;
  readonly mean: GPUBuffer;
  private readonly stepPipeline: GPUComputePipeline;
  private readonly stepGroups: [GPUBindGroup, GPUBindGroup];
  private readonly forcePipeline: GPUComputePipeline | null;
  private readonly forceGroups: [GPUBindGroup, GPUBindGroup] | null;
  private readonly partial: GPUBuffer | null;
  private readonly forceGroupsCount: number;
  private readonly slicePipeline: GPUComputePipeline;
  private particleState: { pipeline: GPUComputePipeline; group: GPUBindGroup; particles: GPUBuffer; params: GPUBuffer; count: number } | null = null;
  private current = 0;
  private accumulate = false;

  constructor(device: GPUDevice, setup: GpuLatticeSetup) {
    const { nx, ny, nz } = setup;
    const n = nx * ny * nz;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.n = n;
    this.device = device;
    if (setup.flags.length !== n) throw new RangeError("flags must have one entry per cell");
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.pop = [
      device.createBuffer({ size: Q * 4 * n, usage: storage, label: "populations A" }),
      device.createBuffer({ size: Q * 4 * n, usage: storage, label: "populations B" }),
    ];
    const initial = setup.initial ?? equilibriumPopulations(setup.flags, setup.boundaryVelocity);
    device.queue.writeBuffer(this.pop[0], 0, initial);
    device.queue.writeBuffer(this.pop[1], 0, initial);
    this.flagsBuffer = device.createBuffer({ size: 4 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: "flags" });
    device.queue.writeBuffer(this.flagsBuffer, 0, Uint32Array.from(setup.flags));
    this.macro = device.createBuffer({ size: 16 * n, usage: storage, label: "macro" });
    this.mean = device.createBuffer({ size: 16 * n, usage: storage, label: "mean sums" });
    this.paramsData = new ArrayBuffer(48);
    this.params = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: "lattice params" });
    const p = setup.periodic ?? [false, false, false];
    const u32 = new Uint32Array(this.paramsData);
    const f32 = new Float32Array(this.paramsData);
    u32[0] = nx;
    u32[1] = ny;
    u32[2] = nz;
    u32[3] = n;
    f32[4] = setup.tau0;
    f32[5] = 18 * Math.SQRT2 * setup.smagorinsky * setup.smagorinsky;
    u32[6] = (p[0] ? 1 : 0) | (p[1] ? 2 : 0) | (p[2] ? 4 : 0);
    u32[7] = 0;
    f32[8] = setup.boundaryVelocity[0];
    f32[9] = setup.boundaryVelocity[1];
    f32[10] = setup.boundaryVelocity[2];
    device.queue.writeBuffer(this.params, 0, this.paramsData);

    const stepModule = device.createShaderModule({ code: STEP_WGSL, label: "lbm step" });
    this.stepPipeline = device.createComputePipeline({ layout: "auto", compute: { module: stepModule, entryPoint: "main" }, label: "lbm step" });
    const stepGroup = (from: GPUBuffer, to: GPUBuffer) =>
      device.createBindGroup({
        layout: this.stepPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: from } },
          { binding: 1, resource: { buffer: to } },
          { binding: 2, resource: { buffer: this.flagsBuffer } },
          { binding: 3, resource: { buffer: this.params } },
          { binding: 4, resource: { buffer: this.macro } },
          { binding: 5, resource: { buffer: this.mean } },
        ],
      });
    this.stepGroups = [stepGroup(this.pop[0], this.pop[1]), stepGroup(this.pop[1], this.pop[0])];

    // ---- bounce-back links of the body ----
    const links = bodyLinks(setup);
    this.linkCount = links.length;
    if (links.length > 0) {
      const linkBuffer = device.createBuffer({ size: 4 * links.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: "links" });
      device.queue.writeBuffer(linkBuffer, 0, links);
      const fp = new ArrayBuffer(32);
      const fu = new Uint32Array(fp);
      const ff = new Float32Array(fp);
      fu[0] = links.length;
      fu[1] = nx;
      fu[2] = ny;
      fu[3] = n;
      ff[4] = setup.momentOrigin[0];
      ff[5] = setup.momentOrigin[1];
      ff[6] = setup.momentOrigin[2];
      const forceParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(forceParams, 0, fp);
      const [gx, gy] = dispatchSize(links.length, 256);
      this.forceGroupsCount = gx * gy;
      this.partial = device.createBuffer({ size: 32 * this.forceGroupsCount, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: "force partials" });
      const module = device.createShaderModule({ code: FORCE_WGSL, label: "momentum exchange" });
      this.forcePipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
      const group = (pop: GPUBuffer) =>
        device.createBindGroup({
          layout: this.forcePipeline!.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: pop } },
            { binding: 1, resource: { buffer: linkBuffer } },
            { binding: 2, resource: { buffer: forceParams } },
            { binding: 3, resource: { buffer: this.partial! } },
          ],
        });
      this.forceGroups = [group(this.pop[0]), group(this.pop[1])];
    } else {
      this.forcePipeline = null;
      this.forceGroups = null;
      this.partial = null;
      this.forceGroupsCount = 0;
    }
    const sliceModule = device.createShaderModule({ code: SLICE_WGSL, label: "slice" });
    this.slicePipeline = device.createComputePipeline({ layout: "auto", compute: { module: sliceModule, entryPoint: "main" } });
  }

  /** Starts (or stops) adding ρ − 1 and u of every step to the mean sums. */
  setAccumulate(on: boolean): void {
    if (on === this.accumulate) return;
    this.accumulate = on;
    new Uint32Array(this.paramsData)[7] = on ? 1 : 0;
    this.device.queue.writeBuffer(this.params, 0, this.paramsData);
  }

  /** Clears the mean sums. */
  resetMean(): void {
    const encoder = this.device.createCommandEncoder();
    encoder.clearBuffer(this.mean);
    this.device.queue.submit([encoder.finish()]);
    this.meanSteps = 0;
  }

  /** Encodes and submits `steps` time steps (and the smoke, every `particleEvery` steps). */
  step(steps: number, particleEvery = 0): void {
    const encoder = this.device.createCommandEncoder();
    const [gx, gy] = dispatchSize(this.n, 64);
    for (let s = 0; s < steps; s++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.stepPipeline);
      pass.setBindGroup(0, this.stepGroups[this.current]!);
      pass.dispatchWorkgroups(gx, gy);
      pass.end();
      this.current = 1 - this.current;
      this.time++;
      if (this.accumulate) this.meanSteps++;
      if (particleEvery > 0 && this.particleState !== null && this.time % particleEvery === 0) {
        const ps = this.particleState;
        const pp = encoder.beginComputePass();
        pp.setPipeline(ps.pipeline);
        pp.setBindGroup(0, ps.group);
        const [px, py] = dispatchSize(ps.count, 64);
        pp.dispatchWorkgroups(px, py);
        pp.end();
      }
    }
    this.device.queue.submit([encoder.finish()]);
  }

  /** Waits until the GPU has finished what was submitted. */
  async idle(): Promise<void> {
    await this.device.queue.onSubmittedWorkDone();
  }

  /** Force and moment on the body from the current populations (the ones the next step will bounce back). */
  async forces(): Promise<GpuForces> {
    if (this.forcePipeline === null || this.forceGroups === null || this.partial === null) return { force: [0, 0, 0], moment: [0, 0, 0] };
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.forcePipeline);
    pass.setBindGroup(0, this.forceGroups[this.current]!);
    const [gx, gy] = dispatchSize(this.linkCount, 256);
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
    const read = this.device.createBuffer({ size: this.partial.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    encoder.copyBufferToBuffer(this.partial, 0, read, 0, this.partial.size);
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    read.destroy();
    let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0;
    for (let w = 0; w < this.forceGroupsCount; w++) {
      fx += data[8 * w]!;
      fy += data[8 * w + 1]!;
      fz += data[8 * w + 2]!;
      mx += data[8 * w + 4]!;
      my += data[8 * w + 5]!;
      mz += data[8 * w + 6]!;
    }
    return { force: [fx, fy, fz], moment: [mx, my, mz] };
  }

  private async readBuffer(buffer: GPUBuffer, size = buffer.size): Promise<ArrayBuffer> {
    const read = this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, read, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const data = read.getMappedRange().slice(0);
    read.unmap();
    read.destroy();
    return data;
  }

  /** Current populations (shifted), Q·N. */
  async populations(): Promise<Float32Array> {
    return new Float32Array(await this.readBuffer(this.pop[this.current]!));
  }

  /** ρ, ux, uy, uz of every cell after the last step (vec4 per cell). */
  async macroscopic(): Promise<Float32Array> {
    return new Float32Array(await this.readBuffer(this.macro));
  }

  /** Mean of ρ − 1, ux, uy, uz over the accumulated steps (vec4 per cell). */
  async meanFields(): Promise<Float32Array> {
    const sums = new Float32Array(await this.readBuffer(this.mean));
    const k = this.meanSteps > 0 ? 1 / this.meanSteps : 0;
    for (let i = 0; i < sums.length; i++) sums[i]! *= k;
    return sums;
  }

  /** One plane (axis 0 = x, 1 = y, 2 = z) of the instantaneous or mean field, vec4 per cell. */
  async slice(axis: 0 | 1 | 2, index: number, source: "macro" | "mean"): Promise<Float32Array> {
    const { nx, ny, nz } = this;
    const count = axis === 0 ? ny * nz : axis === 1 ? nx * nz : nx * ny;
    const out = this.device.createBuffer({ size: 16 * count, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const params = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(params, 0, Uint32Array.from([nx, ny, nz, axis, index, count, 0, 0]));
    const group = this.device.createBindGroup({
      layout: this.slicePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: source === "macro" ? this.macro : this.mean } },
        { binding: 1, resource: { buffer: params } },
        { binding: 2, resource: { buffer: out } },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.slicePipeline);
    pass.setBindGroup(0, group);
    const [gx, gy] = dispatchSize(count, 64);
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    const data = new Float32Array(await this.readBuffer(out));
    out.destroy();
    params.destroy();
    if (source === "mean") {
      const k = this.meanSteps > 0 ? 1 / this.meanSteps : 0;
      for (let i = 0; i < data.length; i++) data[i]! *= k;
    }
    return data;
  }

  /**
   * Smoke tracers: `seeds` (x, y, z in cells; w = start delay in steps, ≤ 0)
   * are emitted continuously and live `life` steps. Advected every `every`
   * steps with that time step.
   */
  setParticles(seeds: Float32Array, life: number, every: number): void {
    const count = seeds.length / 4;
    this.particleState?.particles.destroy();
    if (count === 0) {
      this.particleState = null;
      return;
    }
    const device = this.device;
    const particles = device.createBuffer({ size: 16 * count, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(particles, 0, seeds);
    const seedBuffer = device.createBuffer({ size: 16 * count, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(seedBuffer, 0, seeds);
    const params = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const pd = new ArrayBuffer(32);
    const pu = new Uint32Array(pd);
    const pf = new Float32Array(pd);
    pu[0] = this.nx;
    pu[1] = this.ny;
    pu[2] = this.nz;
    pu[3] = count;
    pf[4] = every;
    pf[5] = life;
    device.queue.writeBuffer(params, 0, pd);
    const module = device.createShaderModule({ code: PARTICLES_WGSL, label: "smoke" });
    const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.macro } },
        { binding: 1, resource: { buffer: this.flagsBuffer } },
        { binding: 2, resource: { buffer: params } },
        { binding: 3, resource: { buffer: particles } },
        { binding: 4, resource: { buffer: seedBuffer } },
      ],
    });
    this.particleState = { pipeline, group, particles, params, count };
  }

  /** Smoke positions (x, y, z in cells, w = age in steps; negative = not yet emitted). */
  async particles(): Promise<Float32Array> {
    if (this.particleState === null) return new Float32Array(0);
    return new Float32Array(await this.readBuffer(this.particleState.particles));
  }

  destroy(): void {
    for (const b of this.pop) b.destroy();
    this.flagsBuffer.destroy();
    this.params.destroy();
    this.macro.destroy();
    this.mean.destroy();
    this.partial?.destroy();
    this.particleState?.particles.destroy();
  }
}

/** Shifted equilibrium of ρ = 1 and u in every non-solid cell (0 in solid ones), Q·N. */
export function equilibriumPopulations(flags: Uint8Array, u: Vec3): Float32Array {
  const n = flags.length;
  const out = new Float32Array(Q * n);
  const W = [1 / 3, ...Array<number>(6).fill(1 / 18), ...Array<number>(12).fill(1 / 36)];
  const C = [
    [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, 1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, -1, -1],
    [1, -1, 0], [-1, 1, 0], [1, 0, -1], [-1, 0, 1], [0, 1, -1], [0, -1, 1],
  ];
  const uu = 1.5 * (u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  const values = C.map((c, q) => {
    const cu = c[0]! * u[0] + c[1]! * u[1] + c[2]! * u[2];
    return W[q]! * (3 * cu + 4.5 * cu * cu - uu);
  });
  for (let q = 0; q < Q; q++) {
    const v = values[q]!;
    for (let c = 0; c < n; c++) if (flags[c] !== SOLID && flags[c] !== 4) out[q * n + c] = v;
  }
  return out;
}

/**
 * Bounce-back links of the body: every (fluid cell, pulled direction q) whose
 * source cell is SOLID, encoded as cell·32 + q. Same links, same order of
 * directions as ReferenceSolver.step.
 */
export function bodyLinks(setup: { nx: number; ny: number; nz: number; flags: Uint8Array; periodic?: readonly [boolean, boolean, boolean] }): Uint32Array {
  const { nx, ny, nz, flags } = setup;
  const p = setup.periodic ?? [false, false, false];
  const CXl = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 0, 0, 1, -1, 1, -1, 0, 0];
  const CYl = [0, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 1, -1];
  const CZl = [0, 0, 0, 0, 0, 1, -1, 0, 0, 1, -1, 1, -1, 0, 0, -1, 1, -1, 1];
  const out: number[] = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (flags[c] !== 0) continue;
        for (let q = 1; q < Q; q++) {
          let si = i - CXl[q]!, sj = j - CYl[q]!, sk = k - CZl[q]!;
          if (si < 0 || si >= nx) { if (!p[0]) continue; si = (si + nx) % nx; }
          if (sj < 0 || sj >= ny) { if (!p[1]) continue; sj = (sj + ny) % ny; }
          if (sk < 0 || sk >= nz) { if (!p[2]) continue; sk = (sk + nz) % nz; }
          if (flags[si + nx * (sj + ny * sk)] === SOLID) out.push(c * 32 + q);
        }
      }
  void OPPOSITE;
  return Uint32Array.from(out);
}
