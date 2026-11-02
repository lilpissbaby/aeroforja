/**
 * The D3Q19 velocity set (Qian, d'Humières & Lallemand 1992; Krüger et al.
 * 2017, table 3.3). Order: rest, the six axis neighbours, then the twelve
 * edge diagonals, arranged so that the opposite of direction i (i ≥ 1) is
 * i + 1 when i is odd and i − 1 when i is even. The WGSL kernels use the
 * same order (kernels.ts); a test checks both against this table.
 */
export const Q = 19;

/** Lattice velocities c_i, components in cells per time step. */
export const CX: readonly number[] = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 0, 0, 1, -1, 1, -1, 0, 0];
export const CY: readonly number[] = [0, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 1, -1];
export const CZ: readonly number[] = [0, 0, 0, 0, 0, 1, -1, 0, 0, 1, -1, 1, -1, 0, 0, -1, 1, -1, 1];

/** Weights w_i: 1/3 at rest, 1/18 on the axes, 1/36 on the diagonals. */
export const W: readonly number[] = [1 / 3, ...Array<number>(6).fill(1 / 18), ...Array<number>(12).fill(1 / 36)];

/** Index of the direction opposite to i. */
export const OPPOSITE: readonly number[] = Array.from({ length: Q }, (_, i) => (i === 0 ? 0 : i % 2 === 1 ? i + 1 : i - 1));

/** Lattice speed of sound squared, c_s² = 1/3. */
export const CS2 = 1 / 3;

/**
 * Cell types. The outermost layer of a tunnel box is made of boundary cells,
 * so a fluid cell always pulls from inside the box (or wraps on periodic
 * axes, used by the validation cases).
 */
export const FLUID = 0;
export const SOLID = 1;
/** Velocity inlet and far field: f = f_eq(ρ of the neighbour inside, u_b) every step. */
export const EQUILIBRIUM = 2;
/** Outflow: f = f_eq(ρ = 1, u of the upstream neighbour), zero gradient. */
export const OUTLET = 3;
/**
 * A no-slip wall that is not part of the body under test (the channel walls
 * of a validation case): bounce-back like SOLID, but its links do not count
 * in the force balance.
 */
export const WALL = 4;

export type CellType = typeof FLUID | typeof SOLID | typeof EQUILIBRIUM | typeof OUTLET | typeof WALL;

/** True for the two bounce-back types. */
export const isSolid = (t: number): boolean => t === SOLID || t === WALL;

/**
 * Coefficient of the Smagorinsky term in the effective relaxation time of
 * Hou et al. (1996): τ_eff = ½ [τ₀ + √(τ₀² + 18√2 · C_s² · ‖Π_neq‖ / ρ)].
 */
export function smagorinskyFactor(cs: number): number {
  return 18 * Math.SQRT2 * cs * cs;
}
