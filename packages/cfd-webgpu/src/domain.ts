/**
 * The tunnel box around the drone (mini-design 006, «Dominio, rejilla y
 * geometría»): body fixed and aligned with the lattice, the wind enters with
 * α and β. Box: 0.5 L ahead, 2 L behind, 0.5 L to each side and 0.6 L above
 * and below, with L the largest planform dimension of the drone.
 */
import type { Vec3 } from "./reference.ts";
import type { VoxelGrid } from "./voxelize.ts";

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const BOX_MARGINS = { ahead: 0.5, behind: 2, side: 0.5, vertical: 0.6 } as const;

export interface DomainOptions {
  /** Cell budget. */
  readonly cells: number;
  /**
   * Coordinates (FRD, m) that should fall on cell centres, one per axis: the
   * mid-plane of the main plate of each orientation, so flat plates are
   * represented exactly in their plane and as few layers as possible.
   */
  readonly anchors?: readonly [number | null, number | null, number | null];
}

export interface Domain {
  readonly grid: VoxelGrid;
  /** Largest planform dimension of the drone, m. */
  readonly length: number;
  /** Box extent, m. */
  readonly size: Vec3;
}

export function boundsOf(meshes: readonly Float64Array[]): Bounds | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const t of meshes)
    for (let i = 0; i < t.length; i += 3)
      for (let d = 0; d < 3; d++) {
        min[d] = Math.min(min[d]!, t[i + d]!);
        max[d] = Math.max(max[d]!, t[i + d]!);
      }
  if (!Number.isFinite(min[0]!)) return null;
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

export function tunnelDomain(bounds: Bounds, options: DomainOptions): Domain {
  const ext = [0, 1, 2].map((d) => bounds.max[d]! - bounds.min[d]!);
  const L = Math.max(ext[0]!, ext[1]!);
  if (!(L > 0)) throw new RangeError("The drone has no planform extent");
  // FRD: x forward, so the wind comes from +x and the wake goes to −x.
  const lo: Vec3 = [bounds.min[0] - BOX_MARGINS.behind * L, bounds.min[1] - BOX_MARGINS.side * L, bounds.min[2] - BOX_MARGINS.vertical * L];
  const hi: Vec3 = [bounds.max[0] + BOX_MARGINS.ahead * L, bounds.max[1] + BOX_MARGINS.side * L, bounds.max[2] + BOX_MARGINS.vertical * L];
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const dx = Math.cbrt((size[0] * size[1] * size[2]) / options.cells);
  const n = size.map((s) => Math.max(8, Math.ceil(s / dx) + 1)) as [number, number, number];
  const origin = [0, 1, 2].map((d) => {
    const anchor = options.anchors?.[d] ?? null;
    if (anchor === null) return lo[d]!;
    // Shift the box by less than a cell so the anchor lands on a cell centre.
    return anchor - Math.ceil((anchor - lo[d]!) / dx) * dx;
  }) as unknown as Vec3;
  return { grid: { origin, dx, nx: n[0], ny: n[1], nz: n[2] }, length: L, size };
}

/** Free-stream velocity of the air relative to the body, unit vector in FRD: −(cos α cos β, sin β, sin α cos β). */
export function windDirection(alpha: number, beta: number): Vec3 {
  return [-Math.cos(alpha) * Math.cos(beta), -Math.sin(beta), -Math.sin(alpha) * Math.cos(beta)];
}
