/**
 * The CFD tunnel (mini-design 006) in its own Web Worker: plans the lattice
 * on the CPU, runs it on the GPU with WebGPU and streams back forces, smoke,
 * slices and the pressure on the skin while it runs.
 */
import {
  GPU_CASES,
  GpuLattice,
  U_LATTICE,
  boundsOf,
  loadsFromLattice,
  planTunnel,
  rakeSeeds,
  requestLatticeDevice,
  runGpuCase,
  sliceValues,
  streamlines,
  subdivide,
  surfaceCp,
  type CfdLoads,
  type CfdPlan,
  type Vec3,
} from "@aeroforja/cfd-webgpu";
import { airState, sweepFor } from "./tunnelRun.ts";
import { SMOKE, type CfdRequest, type CfdResponse, type CfdStart, type HistorySample, type SliceSpec } from "../cfd/protocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<CfdRequest>) => void) | null;
  postMessage(message: CfdResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const post = (m: CfdResponse, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

/** Steps per command buffer, smoke every 4 steps, forces every 2 batches. */
const BATCH = 40;
const SMOKE_EVERY = 4;
const SEEDS = SMOKE;

let device: { device: GPUDevice; adapter: GPUAdapter; maxCells: number } | null = null;
let running: { runId: number; stop: boolean } | null = null;
/** The last finished run stays on the GPU so its slices can still be moved; freed when the next one starts. */
let finished: { runId: number; plan: CfdPlan; lattice: GpuLattice } | null = null;
function releaseFinished(): void {
  finished?.lattice.destroy();
  finished = null;
}
let sliceSpec: SliceSpec | null = null;
let sliceDirty = false;

async function gpuDevice(cells: number) {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (gpu === undefined) throw new Error("Este navegador no tiene WebGPU: el túnel CFD necesita Chrome, Edge o Firefox recientes.");
  if (device === null) {
    device = await requestLatticeDevice(gpu);
    void device.device.lost.then(() => {
      device = null;
    });
  }
  if (cells > device.maxCells) {
    throw new Error(
      `Tu tarjeta admite hasta ${(device.maxCells / 1e6).toFixed(1)} M celdas por búfer y este ensayo pide ${(cells / 1e6).toFixed(1)} M. Baja la resolución.`,
    );
  }
  return device;
}

function planeIndex(plan: CfdPlan, s: SliceSpec): number {
  const n = [plan.grid.nx, plan.grid.ny, plan.grid.nz][s.axis]!;
  const i = Math.round((s.position - plan.grid.origin[s.axis]!) / plan.grid.dx);
  return Math.min(n - 2, Math.max(1, i));
}

async function sendSlice(runId: number, plan: CfdPlan, lattice: GpuLattice, s: SliceSpec): Promise<void> {
  const index = planeIndex(plan, s);
  const source = s.source === "mean" && lattice.meanSteps > 0 ? "mean" : "macro";
  const planes = (await Promise.all([index - 1, index, index + 1].map((k) => lattice.slice(s.axis, k, source)))) as [Float32Array, Float32Array, Float32Array];
  const { values, width, height } = sliceValues(plan, s.axis, index, planes, s.quantity, source === "mean" ? 0 : 1);
  const axes: [0 | 1 | 2, 0 | 1 | 2] = s.axis === 0 ? [1, 2] : s.axis === 1 ? [0, 2] : [0, 1];
  const origin: [number, number, number] = [...plan.grid.origin];
  origin[s.axis] = plan.grid.origin[s.axis]! + index * plan.grid.dx;
  post(
    { kind: "slice", runId, spec: s, index, position: origin[s.axis]!, width, height, origin, axes, dx: plan.grid.dx, values },
    [values.buffer],
  );
}

function meanAndSpread(samples: readonly HistorySample[]): { mean: CfdLoads; spread: { drag: number; lift: number } } | null {
  if (samples.length === 0) return null;
  const n = samples.length;
  const avg = (f: (l: CfdLoads) => number) => samples.reduce((s, x) => s + f(x.loads), 0) / n;
  const avgN = (f: (l: CfdLoads) => number | null) => (samples[0]!.loads.CL === null ? null : samples.reduce((s, x) => s + (f(x.loads) ?? 0), 0) / n);
  const v3 = (f: (l: CfdLoads) => Vec3): Vec3 => [avg((l) => f(l)[0]), avg((l) => f(l)[1]), avg((l) => f(l)[2])];
  const drag = avg((l) => l.drag);
  const lift = avg((l) => l.lift);
  const sd = (f: (l: CfdLoads) => number, m: number) => Math.sqrt(samples.reduce((s, x) => s + (f(x.loads) - m) ** 2, 0) / Math.max(1, n - 1));
  return {
    mean: {
      force: v3((l) => l.force),
      moment: v3((l) => l.moment),
      drag,
      lift,
      side: avg((l) => l.side),
      dragArea: avg((l) => l.dragArea),
      CL: avgN((l) => l.CL),
      CD: avgN((l) => l.CD),
      CY: avgN((l) => l.CY),
      Cl: avgN((l) => l.Cl),
      Cm: avgN((l) => l.Cm),
      Cn: avgN((l) => l.Cn),
    },
    spread: { drag: sd((l) => l.drag, drag), lift: sd((l) => l.lift, lift) },
  };
}

async function run(r: CfdStart): Promise<void> {
  const started = performance.now();
  releaseFinished();
  const state = { runId: r.runId, stop: false };
  running = state;
  const a = airState(r.air).value;
  const air = { density: a.density, kinematicViscosity: a.kinematicViscosity, speedOfSound: a.speedOfSound };
  const vlm = r.vlm === null ? null : sweepFor(r.vlm).sweep;
  const reference = vlm !== null && vlm.ok && vlm.result.value.reference !== null ? vlm.result.value.reference : null;
  const planResult = planTunnel(r.bodies, r.settings, air, [r.cg[0], r.cg[1], r.cg[2]], reference === null ? null : { area: reference.area, mac: reference.mac, span: reference.span });
  const plan = planResult.value;
  const { device: gpu, adapter } = await gpuDevice(plan.grid.nx * plan.grid.ny * plan.grid.nz);

  // ---- surface to colour and smoke seeds ----
  const allTris = r.bodies.map((b) => b.triangles);
  const merged = new Float64Array(allTris.reduce((s, t) => s + t.length, 0));
  let o = 0;
  for (const t of allTris) {
    merged.set(t, o);
    o += t.length;
  }
  const surface = subdivide(merged, Math.max(plan.grid.dx, plan.length / 150));
  const bounds = boundsOf(allTris)!;
  const rake = rakeSeeds(bounds.min, bounds.max, 0.15 * plan.length, SEEDS.columns, SEEDS.rows);
  const seeds = Float32Array.from(rake.flat());
  const { flags: _flags, ...summary } = plan;
  void _flags;
  post({
    kind: "planned",
    runId: r.runId,
    plan: { ...planResult, value: summary },
    surface: { positions: surface.positions.slice(), normals: surface.normals.slice() },
    seeds: seeds.slice(),
    perSeed: SEEDS.perSeed,
    vlm,
    adapter: adapter.info.description || adapter.info.architecture || adapter.info.vendor || "WebGPU",
  });

  const lattice = new GpuLattice(gpu, {
    nx: plan.grid.nx,
    ny: plan.grid.ny,
    nz: plan.grid.nz,
    flags: plan.flags,
    tau0: plan.tau0,
    smagorinsky: plan.smagorinsky,
    boundaryVelocity: plan.uLattice,
    momentOrigin: plan.momentOrigin,
  });
  // Tracers: each seed emits `perSeed` of them, staggered over their life.
  const life = Math.ceil((plan.grid.nx * 0.9) / U_LATTICE);
  const tracer = new Float32Array(4 * rake.length * SEEDS.perSeed);
  rake.forEach((s, si) => {
    for (let p = 0; p < SEEDS.perSeed; p++) {
      const t = 4 * (si * SEEDS.perSeed + p);
      tracer[t] = (s[0] - plan.grid.origin[0]) / plan.grid.dx;
      tracer[t + 1] = (s[1] - plan.grid.origin[1]) / plan.grid.dx;
      tracer[t + 2] = (s[2] - plan.grid.origin[2]) / plan.grid.dx;
      tracer[t + 3] = -(p / SEEDS.perSeed) * life;
    }
  });
  lattice.setParticles(tracer, life, SMOKE_EVERY);

  const history: HistorySample[] = [];
  let unsent: HistorySample[] = [];
  let lastPost = 0;
  let lastSurface = performance.now();
  let lastSlice = 0;
  const t0 = performance.now();
  let stepsDone = 0;
  let accumulating = false;
  try {
    for (let step = 0; step < plan.totalSteps; step += BATCH) {
      if (state.stop) break;
      if (!accumulating && step >= plan.averageFrom) {
        lattice.resetMean();
        lattice.setAccumulate(true);
        accumulating = true;
      }
      lattice.step(BATCH, SMOKE_EVERY);
      stepsDone = step + BATCH;
      if ((step / BATCH) % 2 === 0) {
        const f = await lattice.forces();
        if (f.force.some((v) => !Number.isFinite(v))) throw new Error("La simulación se ha vuelto inestable (valores no finitos). Prueba con más celdas o menos velocidad.");
        const sample = { t: lattice.time * plan.dt, step: lattice.time, loads: loadsFromLattice(plan, f.force, f.moment) };
        history.push(sample);
        unsent.push(sample);
      }
      const now = performance.now();
      if (now - lastPost > 120) {
        lastPost = now;
        const raw = await lattice.particles();
        const particles = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i += 4) {
          particles[i] = plan.grid.origin[0] + raw[i]! * plan.grid.dx;
          particles[i + 1] = plan.grid.origin[1] + raw[i + 1]! * plan.grid.dx;
          particles[i + 2] = plan.grid.origin[2] + raw[i + 2]! * plan.grid.dx;
          particles[i + 3] = raw[i + 3]!;
        }
        const elapsed = (now - t0) / 1000;
        post(
          {
            kind: "progress",
            runId: r.runId,
            step: lattice.time,
            total: plan.totalSteps,
            averaging: lattice.meanSteps > 0,
            mlups: (lattice.time * plan.grid.nx * plan.grid.ny * plan.grid.nz) / Math.max(1e-3, elapsed) / 1e6,
            history: unsent,
            particles,
          },
          [particles.buffer],
        );
        unsent = [];
      }
      if (sliceSpec !== null && (sliceDirty || now - lastSlice > 700)) {
        sliceDirty = false;
        lastSlice = now;
        await sendSlice(r.runId, plan, lattice, sliceSpec);
      }
      if (now - lastSurface > 2500) {
        lastSurface = now;
        const macro = await lattice.macroscopic();
        const cp = surfaceCp(plan, macro, surface.positions, surface.normals, 1);
        post({ kind: "surface", runId: r.runId, source: "instant", cp }, [cp.buffer]);
      }
    }
    await lattice.idle();
    const window = history.filter((h) => h.step >= plan.averageFrom);
    const stats = state.stop || window.length === 0 ? null : meanAndSpread(window);
    let lines: Float32Array[] = [];
    if (lattice.meanSteps > 0) {
      const mean = await lattice.meanFields();
      const cp = surfaceCp(plan, mean, surface.positions, surface.normals, 0);
      post({ kind: "surface", runId: r.runId, source: "mean", cp }, [cp.buffer]);
      lines = streamlines(plan, mean, rake, 3 * plan.length);
      if (sliceSpec !== null) await sendSlice(r.runId, plan, lattice, sliceSpec);
    }
    if (unsent.length > 0) post({ kind: "progress", runId: r.runId, step: lattice.time, total: plan.totalSteps, averaging: true, mlups: 0, history: unsent, particles: null });
    post(
      {
        kind: "done",
        runId: r.runId,
        stopped: state.stop,
        mean: stats?.mean ?? null,
        spread: stats?.spread ?? null,
        samples: window.length,
        streamlines: lines,
        seconds: (performance.now() - started) / 1000,
      },
      lines.map((l) => l.buffer),
    );
    void stepsDone;
    // A run superseded by a newer one frees its lattice; the latest one keeps it for its slices.
    if (running === state) {
      releaseFinished();
      finished = { runId: r.runId, plan, lattice };
    } else lattice.destroy();
  } catch (e) {
    lattice.destroy();
    throw e;
  } finally {
    if (running === state) running = null;
  }
}

scope.onmessage = (event) => {
  const m = event.data;
  switch (m.kind) {
    case "start":
      if (running !== null) running.stop = true;
      void run(m).catch((e: unknown) => post({ kind: "error", runId: m.runId, message: e instanceof Error ? e.message : String(e) }));
      break;
    case "stop":
      if (running !== null) running.stop = true;
      break;
    case "slice":
      sliceSpec = m.slice;
      sliceDirty = true;
      if (running === null && finished !== null && m.slice !== null) {
        const f = finished;
        void sendSlice(f.runId, f.plan, f.lattice, m.slice).catch((e: unknown) => post({ kind: "error", runId: f.runId, message: e instanceof Error ? e.message : String(e) }));
      }
      break;
    case "validate": {
      const c = GPU_CASES.find((k) => k.id === m.caseId);
      if (c === undefined) return;
      void (async () => {
        try {
          const { device: gpu } = await gpuDevice(Math.round(12 * m.d * 8 * m.d * 8 * m.d));
          const outcome = await runGpuCase(gpu, c, m.d, 4, c.smagorinsky, (f) => post({ kind: "validation", caseId: c.id, progress: f, outcome: null, error: null }));
          post({ kind: "validation", caseId: c.id, progress: 1, outcome, error: null });
        } catch (e) {
          post({ kind: "validation", caseId: c.id, progress: 0, outcome: null, error: e instanceof Error ? e.message : String(e) });
        }
      })();
      break;
    }
  }
};
