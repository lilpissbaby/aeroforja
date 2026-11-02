/**
 * WGSL kernels of the CFD tunnel (mini-design 006). Line by line the same
 * algorithm as ReferenceSolver.step (reference.ts), in FP32 with shifted
 * populations; the GPU = CPU check (scripts/gpu-check.ts) holds them
 * together. Layout: populations g[q·N + n], n = i + nx·(j + ny·k).
 */
import { CX, CY, CZ, OPPOSITE, W } from "./lattice.ts";

const list = (values: readonly number[], float: boolean): string =>
  values.map((v) => (float ? (Number.isInteger(v) ? `${v}.0` : v.toPrecision(9)) : String(v))).join(", ");

const COMMON = /* wgsl */ `
const Q: u32 = 19u;
const FLUID: u32 = 0u;
const SOLID: u32 = 1u;
const EQUILIBRIUM: u32 = 2u;
const OUTLET: u32 = 3u;
const WALL: u32 = 4u;
var<private> CX: array<i32, 19> = array<i32, 19>(${list(CX, false)});
var<private> CY: array<i32, 19> = array<i32, 19>(${list(CY, false)});
var<private> CZ: array<i32, 19> = array<i32, 19>(${list(CZ, false)});
var<private> OPP: array<u32, 19> = array<u32, 19>(${list(OPPOSITE, false)});
var<private> WQ: array<f32, 19> = array<f32, 19>(${list(W, true)});

struct Lattice {
  nx: u32, ny: u32, nz: u32, n: u32,
  tau0: f32, smag: f32, periodic: u32, accumulate: u32,
  ub: vec4<f32>,
};

fn cellIndex(gid: vec3<u32>, nwg: vec3<u32>) -> u32 {
  return gid.x + gid.y * nwg.x * 64u;
}

// Index of (i, j, k) after periodic wrap, or -1 outside the box.
fn wrapIndex(L: Lattice, i0: i32, j0: i32, k0: i32) -> i32 {
  var i = i0; var j = j0; var k = k0;
  let nx = i32(L.nx); let ny = i32(L.ny); let nz = i32(L.nz);
  if (i < 0 || i >= nx) { if ((L.periodic & 1u) == 0u) { return -1; } i = (i + nx) % nx; }
  if (j < 0 || j >= ny) { if ((L.periodic & 2u) == 0u) { return -1; } j = (j + ny) % ny; }
  if (k < 0 || k >= nz) { if ((L.periodic & 4u) == 0u) { return -1; } k = (k + nz) % nz; }
  return i + nx * (j + ny * k);
}

fn shiftedEq(q: u32, rho: f32, u: vec3<f32>, uu: f32) -> f32 {
  let cu = f32(CX[q]) * u.x + f32(CY[q]) * u.y + f32(CZ[q]) * u.z;
  return WQ[q] * (rho - 1.0 + rho * (3.0 * cu + 4.5 * cu * cu - uu));
}
`;

/** One fused pull–collide step for every cell. */
export const STEP_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(0) var<storage, read> gin: array<f32>;
@group(0) @binding(1) var<storage, read_write> gout: array<f32>;
@group(0) @binding(2) var<storage, read> flags: array<u32>;
@group(0) @binding(3) var<uniform> L: Lattice;
@group(0) @binding(4) var<storage, read_write> mac: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> meanSum: array<vec4<f32>>;

// Same rule as inwardNeighbour() in reference.ts.
fn inward(i: u32, j: u32, k: u32) -> i32 {
  var si = i; var sj = j; var sk = k;
  if (i == 0u && L.nx > 1u) { si = 1u; }
  else if (i == L.nx - 1u && L.nx > 1u) { si = L.nx - 2u; }
  else if (j == 0u && L.ny > 1u) { sj = 1u; }
  else if (j == L.ny - 1u && L.ny > 1u) { sj = L.ny - 2u; }
  else if (k == 0u && L.nz > 1u) { sk = 1u; }
  else if (k == L.nz - 1u && L.nz > 1u) { sk = L.nz - 2u; }
  else { return -1; }
  return i32(si + L.nx * (sj + L.ny * sk));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let c = cellIndex(gid, nwg);
  if (c >= L.n) { return; }
  let t = flags[c];
  if (t == SOLID || t == WALL) { return; }
  let n = L.n;
  let i = c % L.nx;
  let j = (c / L.nx) % L.ny;
  let k = c / (L.nx * L.ny);
  if (t == EQUILIBRIUM || t == OUTLET) {
    let s = inward(i, j, k);
    var r = 1.0;
    var jm = vec3<f32>(0.0);
    if (s >= 0) {
      for (var q = 0u; q < Q; q++) {
        let v = gin[q * n + u32(s)];
        r += v;
        jm += vec3<f32>(f32(CX[q]), f32(CY[q]), f32(CZ[q])) * v;
      }
    }
    var rb = 1.0;
    var ub = L.ub.xyz;
    if (t == EQUILIBRIUM) {
      if (s >= 0) { rb = r; }
    } else {
      ub = jm / r;
    }
    let uu = 1.5 * dot(ub, ub);
    for (var q = 0u; q < Q; q++) {
      gout[q * n + c] = shiftedEq(q, rb, ub, uu);
    }
    mac[c] = vec4<f32>(rb, ub);
    return;
  }
  // ---- fluid: pull, with half-way bounce-back ----
  var g: array<f32, 19>;
  var rho = 1.0;
  var jm = vec3<f32>(0.0);
  for (var q = 0u; q < Q; q++) {
    let s = wrapIndex(L, i32(i) - CX[q], i32(j) - CY[q], i32(k) - CZ[q]);
    var ts = WALL;
    if (s >= 0) { ts = flags[u32(s)]; }
    var v: f32;
    if (ts == SOLID || ts == WALL) {
      v = gin[OPP[q] * n + c];
    } else {
      v = gin[q * n + u32(s)];
    }
    g[q] = v;
    rho += v;
    jm += vec3<f32>(f32(CX[q]), f32(CY[q]), f32(CZ[q])) * v;
  }
  let u = jm / rho;
  let uu = 1.5 * dot(u, u);
  var geq: array<f32, 19>;
  var pxx = 0.0; var pyy = 0.0; var pzz = 0.0; var pxy = 0.0; var pxz = 0.0; var pyz = 0.0;
  for (var q = 0u; q < Q; q++) {
    let e = shiftedEq(q, rho, u, uu);
    geq[q] = e;
    let ne = g[q] - e;
    let cx = f32(CX[q]); let cy = f32(CY[q]); let cz = f32(CZ[q]);
    pxx += cx * cx * ne; pyy += cy * cy * ne; pzz += cz * cz * ne;
    pxy += cx * cy * ne; pxz += cx * cz * ne; pyz += cy * cz * ne;
  }
  var tau = L.tau0;
  if (L.smag > 0.0) {
    let norm = sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2.0 * (pxy * pxy + pxz * pxz + pyz * pyz));
    tau = 0.5 * (L.tau0 + sqrt(L.tau0 * L.tau0 + (L.smag * norm) / rho));
  }
  let keep = 4.5 * (1.0 - 1.0 / tau);
  let tr = (pxx + pyy + pzz) / 3.0;
  for (var q = 0u; q < Q; q++) {
    let cx = f32(CX[q]); let cy = f32(CY[q]); let cz = f32(CZ[q]);
    let qp = cx * cx * pxx + cy * cy * pyy + cz * cz * pzz + 2.0 * (cx * cy * pxy + cx * cz * pxz + cy * cz * pyz) - tr;
    gout[q * n + c] = geq[q] + keep * WQ[q] * qp;
  }
  mac[c] = vec4<f32>(rho, u);
  if (L.accumulate != 0u) {
    meanSum[c] = meanSum[c] + vec4<f32>(rho - 1.0, u);
  }
}
`;

/**
 * Momentum exchange on the list of bounce-back links of the body, from the
 * populations after the last step, reduced per workgroup of 256 links:
 * partial[2w] = (Fx, Fy, Fz, 0), partial[2w + 1] = (Mx, My, Mz, 0), lattice units.
 * A link is encoded as cell·32 + q, q the pulled direction.
 */
export const FORCE_WGSL = /* wgsl */ `
${COMMON}
struct ForceParams {
  count: u32, nx: u32, ny: u32, n: u32,
  origin: vec4<f32>,
};
@group(0) @binding(0) var<storage, read> g: array<f32>;
@group(0) @binding(1) var<storage, read> links: array<u32>;
@group(0) @binding(2) var<uniform> F: ForceParams;
@group(0) @binding(3) var<storage, read_write> partial: array<vec4<f32>>;
var<workgroup> shF: array<vec3<f32>, 256>;
var<workgroup> shM: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let id = gid.x + gid.y * nwg.x * 256u;
  var f = vec3<f32>(0.0);
  var m = vec3<f32>(0.0);
  if (id < F.count) {
    let link = links[id];
    let c = link >> 5u;
    let q = link & 31u;
    let o = OPP[q];
    let full = g[o * F.n + c] + WQ[o];
    let cq = vec3<f32>(f32(CX[q]), f32(CY[q]), f32(CZ[q]));
    f = -2.0 * cq * full;
    let i = f32(c % F.nx);
    let j = f32((c / F.nx) % F.ny);
    let k = f32(c / (F.nx * F.ny));
    let r = vec3<f32>(i, j, k) - 0.5 * cq - F.origin.xyz;
    m = cross(r, f);
  }
  shF[li] = f;
  shM[li] = m;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (li < s) {
      shF[li] = shF[li] + shF[li + s];
      shM[li] = shM[li] + shM[li + s];
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let w = wid.x + wid.y * nwg.x;
    partial[2u * w] = vec4<f32>(shF[0], 0.0);
    partial[2u * w + 1u] = vec4<f32>(shM[0], 0.0);
  }
}
`;

/** Copies one plane of a vec4 field (macro or mean sums) into a compact buffer. */
export const SLICE_WGSL = /* wgsl */ `
struct SliceParams { nx: u32, ny: u32, nz: u32, axis: u32, index: u32, count: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> field: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> S: SliceParams;
@group(0) @binding(2) var<storage, read_write> plane: array<vec4<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let p = gid.x + gid.y * nwg.x * 64u;
  if (p >= S.count) { return; }
  var c: u32;
  if (S.axis == 0u) {
    // x plane: p = j + ny·k
    let j = p % S.ny; let k = p / S.ny;
    c = S.index + S.nx * (j + S.ny * k);
  } else if (S.axis == 1u) {
    // y plane: p = i + nx·k
    let i = p % S.nx; let k = p / S.nx;
    c = i + S.nx * (S.index + S.ny * k);
  } else {
    // z plane: p = i + nx·j
    c = p + S.nx * S.ny * S.index;
  }
  plane[p] = field[c];
}
`;

/**
 * Smoke: massless tracers moved with the instantaneous velocity (RK2,
 * trilinear over fluid cells only). A tracer older than its life, outside
 * the box or inside a solid goes back to its seed. Positions in cells.
 */
export const PARTICLES_WGSL = /* wgsl */ `
struct ParticleParams { nx: u32, ny: u32, nz: u32, count: u32, dt: f32, life: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<storage, read> mac: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> flags: array<u32>;
@group(0) @binding(2) var<uniform> P: ParticleParams;
@group(0) @binding(3) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> seeds: array<vec4<f32>>;

fn inside(p: vec3<f32>) -> bool {
  return p.x >= 0.0 && p.y >= 0.0 && p.z >= 0.0 && p.x <= f32(P.nx - 1u) && p.y <= f32(P.ny - 1u) && p.z <= f32(P.nz - 1u);
}

fn cellAt(i: u32, j: u32, k: u32) -> u32 { return i + P.nx * (j + P.ny * k); }

// Trilinear velocity over the fluid corners; w = total fluid weight.
fn sample(p: vec3<f32>) -> vec4<f32> {
  let b = floor(p);
  let f = p - b;
  let i0 = u32(b.x); let j0 = u32(b.y); let k0 = u32(b.z);
  let i1 = min(i0 + 1u, P.nx - 1u); let j1 = min(j0 + 1u, P.ny - 1u); let k1 = min(k0 + 1u, P.nz - 1u);
  var acc = vec3<f32>(0.0);
  var w = 0.0;
  for (var corner = 0u; corner < 8u; corner++) {
    let ci = select(i0, i1, (corner & 1u) != 0u);
    let cj = select(j0, j1, (corner & 2u) != 0u);
    let ck = select(k0, k1, (corner & 4u) != 0u);
    let wx = select(1.0 - f.x, f.x, (corner & 1u) != 0u);
    let wy = select(1.0 - f.y, f.y, (corner & 2u) != 0u);
    let wz = select(1.0 - f.z, f.z, (corner & 4u) != 0u);
    let c = cellAt(ci, cj, ck);
    let t = flags[c];
    if (t != 1u && t != 4u) {
      let wc = wx * wy * wz;
      acc += mac[c].yzw * wc;
      w += wc;
    }
  }
  if (w <= 1e-6) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
  return vec4<f32>(acc / w, w);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let id = gid.x + gid.y * nwg.x * 64u;
  if (id >= P.count) { return; }
  var p = particles[id];
  let seed = seeds[id];
  p.w = p.w + P.dt;
  // Waiting to be emitted (staggered start), or back to the seed when too old or out of the box.
  if (p.w < 0.0) { particles[id] = vec4<f32>(seed.xyz, p.w); return; }
  if (p.w > P.life || !inside(p.xyz)) { particles[id] = vec4<f32>(seed.xyz, 0.0); return; }
  let s1 = sample(p.xyz);
  let mid = p.xyz + 0.5 * P.dt * s1.xyz;
  var s2 = s1;
  if (inside(mid)) { s2 = sample(mid); }
  let q = p.xyz + P.dt * s2.xyz;
  if (s1.w <= 1e-6 || !inside(q)) {
    particles[id] = vec4<f32>(seed.xyz, 0.0);
    return;
  }
  particles[id] = vec4<f32>(q, p.w);
}
`;
