/**
 * Inertia tensor representation and the inertia of homogeneous solids.
 *
 * Sign convention (aeronautical, Stevens, Lewis & Johnson; Beard & McLain):
 * products of inertia are defined positive, Ixy = integral of x*y dm, and the
 * tensor carries them with a minus sign:
 *
 *       [  Ixx  -Ixy  -Ixz ]
 *   J = [ -Ixy   Iyy  -Iyz ]
 *       [ -Ixz  -Iyz   Izz ]
 *
 * so that the angular momentum is h = J * omega. A body symmetric about its
 * x-z plane (most aircraft) has Ixy = Iyz = 0; Ixz is usually small.
 */
import type { Mat3 } from "../core/mat3.ts";
import { kilogramSquareMeters, type KilogramSquareMeters, type Meters } from "../core/units.ts";

export interface InertiaTensor {
  readonly Ixx: KilogramSquareMeters;
  readonly Iyy: KilogramSquareMeters;
  readonly Izz: KilogramSquareMeters;
  /** Product of inertia, integral of x*y dm (positive definition). */
  readonly Ixy: KilogramSquareMeters;
  /** Product of inertia, integral of x*z dm (positive definition). */
  readonly Ixz: KilogramSquareMeters;
  /** Product of inertia, integral of y*z dm (positive definition). */
  readonly Iyz: KilogramSquareMeters;
}

export function tensorToMatrix(t: InertiaTensor): Mat3 {
  return [t.Ixx, -t.Ixy, -t.Ixz, -t.Ixy, t.Iyy, -t.Iyz, -t.Ixz, -t.Iyz, t.Izz];
}

/**
 * Reads a tensor matrix back into components. The matrix must be symmetric
 * (to rounding); the mean of the two off-diagonal entries is used.
 */
export function matrixToTensor(m: Mat3): InertiaTensor {
  // "+ 0" turns -0 into 0, so exports never show "-0".
  const sym = (i: number, j: number): number => ((m[i] as number) + (m[j] as number)) / 2 + 0;
  return {
    Ixx: kilogramSquareMeters(m[0]),
    Iyy: kilogramSquareMeters(m[4]),
    Izz: kilogramSquareMeters(m[8]),
    Ixy: kilogramSquareMeters(-sym(1, 3) + 0),
    Ixz: kilogramSquareMeters(-sym(2, 6) + 0),
    Iyz: kilogramSquareMeters(-sym(5, 7) + 0),
  };
}

export type Axis = "x" | "y" | "z";

/**
 * How a component's own inertia (about its own centre of mass, in its own
 * axes) is obtained.
 */
export type InertiaSpec =
  /** No inertia about its own centre (small, dense parts far from the CG). */
  | { readonly kind: "point" }
  /** Homogeneous rectangular block; edge lengths along the component axes. */
  | {
      readonly kind: "box";
      readonly size: { readonly x: Meters; readonly y: Meters; readonly z: Meters };
    }
  /** Homogeneous solid cylinder along a component axis. */
  | { readonly kind: "cylinder"; readonly radius: Meters; readonly length: Meters; readonly axis: Axis }
  /** Homogeneous tube (hollow cylinder) along a component axis: booms, arms, spars. */
  | {
      readonly kind: "tube";
      readonly outerRadius: Meters;
      readonly innerRadius: Meters;
      readonly length: Meters;
      readonly axis: Axis;
    }
  /** Homogeneous solid sphere. */
  | { readonly kind: "sphere"; readonly radius: Meters }
  /**
   * Tensor about the component's own centre of mass, in its axes: MEASURED
   * (a test), ESTIMATED (a datasheet) or CALCULATED by a published method
   * outside this module (e.g. the polyhedral mass properties of an STL part).
   */
  | {
      readonly kind: "given";
      readonly tensor: InertiaTensor;
      readonly provenance: "MEASURED" | "CALCULATED" | "ESTIMATED";
    };

const positive = (value: number, what: string): number => {
  if (!(value > 0)) throw new RangeError(`${what} must be positive, got ${value}.`);
  return value;
};

function axisymmetric(mass: number, axial: number, transverse: number, axis: Axis): Mat3 {
  return [
    axis === "x" ? axial : transverse, 0, 0,
    0, axis === "y" ? axial : transverse, 0,
    0, 0, axis === "z" ? axial : transverse,
  ].map((v) => v * mass) as unknown as Mat3;
}

/**
 * Inertia matrix of a component about its own centre of mass, in its own
 * axes. Homogeneous-solid formulas: Meriam, Kraige & Bolton, Engineering
 * Mechanics: Dynamics, Appendix D (properties of homogeneous solids).
 */
export function componentInertiaMatrix(spec: InertiaSpec, mass: number): Mat3 {
  switch (spec.kind) {
    case "point":
      return [0, 0, 0, 0, 0, 0, 0, 0, 0];
    case "box": {
      const a = positive(spec.size.x, "Box size x");
      const b = positive(spec.size.y, "Box size y");
      const c = positive(spec.size.z, "Box size z");
      return [
        (mass * (b * b + c * c)) / 12, 0, 0,
        0, (mass * (a * a + c * c)) / 12, 0,
        0, 0, (mass * (a * a + b * b)) / 12,
      ];
    }
    case "cylinder": {
      const r = positive(spec.radius, "Cylinder radius");
      const l = positive(spec.length, "Cylinder length");
      return axisymmetric(mass, (r * r) / 2, (3 * r * r + l * l) / 12, spec.axis);
    }
    case "tube": {
      const ro = positive(spec.outerRadius, "Tube outer radius");
      const ri = spec.innerRadius;
      if (!(ri >= 0 && ri < ro)) {
        throw new RangeError(`Tube inner radius must be in [0, outer radius), got ${ri}.`);
      }
      const l = positive(spec.length, "Tube length");
      const r2 = ro * ro + ri * ri;
      return axisymmetric(mass, r2 / 2, (3 * r2 + l * l) / 12, spec.axis);
    }
    case "sphere": {
      const r = positive(spec.radius, "Sphere radius");
      const i = (2 / 5) * mass * r * r;
      return [i, 0, 0, 0, i, 0, 0, 0, i];
    }
    case "given":
      return tensorToMatrix(spec.tensor);
  }
}
