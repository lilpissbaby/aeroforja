/**
 * Mass model: total mass, centre of gravity and inertia tensor of an aircraft
 * built from components, with measured values overriding calculated ones.
 *
 *   M   = sum m_i
 *   c   = sum m_i r_i / M
 *   J_c = sum ( R_i J_i R_i^T + m_i ( |d_i|^2 1 - d_i d_i^T ) ),  d_i = r_i - c
 *
 * r_i is the component's own centre of mass in body axes FRD (from the
 * aircraft reference point), R_i its orientation (component to body) and J_i
 * its inertia about its own centre in its own axes.
 *
 * Uncertainty (GUM, first order, independent inputs):
 *
 *   u^2(M)   = sum u^2(m_i)
 *   u^2(c_k) = sum [ ((r_ik - c_k) / M)^2 u^2(m_i) + (m_i / M)^2 u^2(r_ik) ]
 *
 * Inertia uncertainty is not propagated yet (planned: Monte Carlo).
 */
import {
  IDENTITY,
  ZERO,
  add,
  rotateTensor,
  scale,
  symmetricEigen,
  type Mat3,
} from "../core/mat3.ts";
import type { Assumption, Method, Provenance, Result, ValidityCheck } from "../core/result.ts";
import { rotationMatrix, type Quaternion } from "../core/rotation.ts";
import { kilogramSquareMeters, kilograms, type KilogramSquareMeters, type Kilograms } from "../core/units.ts";
import { checkRange, combineValidity } from "../core/validity.ts";
import { bodyPosition, toTriple, type BodyPosition, type Triple, type Vec3 } from "../core/vector.ts";
import { componentInertiaMatrix, matrixToTensor, tensorToMatrix, type InertiaSpec, type InertiaTensor } from "./inertia.ts";
import {
  GUM_FIRST_ORDER,
  HOMOGENEOUS_SOLID_INERTIA,
  PRINCIPAL_AXES_JACOBI,
  RIGID_BODY_MASS_PROPERTIES,
} from "./methods.ts";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface MassInput {
  readonly value: Kilograms;
  /** Standard uncertainty (1 sigma). Omit if unknown. */
  readonly standardUncertainty?: Kilograms;
  /** MEASURED (weighed), CALCULATED (volume x density) or ESTIMATED (catalogue). */
  readonly provenance: Provenance;
}

export interface MassComponent {
  /** Stable identifier, unique within the model. */
  readonly id: string;
  readonly name: string;
  readonly mass: MassInput;
  /** Position of the component's own centre of mass, body axes FRD, from the reference point. */
  readonly position: BodyPosition;
  /** Standard uncertainty of each coordinate of `position`. Omit if unknown. */
  readonly positionUncertainty?: BodyPosition;
  /** Component axes to body axes. Defaults to aligned with the body. */
  readonly orientation?: Quaternion;
  readonly inertia: InertiaSpec;
}

/** Values measured on the real aircraft; each one replaces the calculated value. */
export interface MeasuredMassProperties {
  readonly mass?: { readonly value: Kilograms; readonly standardUncertainty?: Kilograms };
  readonly centerOfGravity?: {
    readonly value: BodyPosition;
    readonly standardUncertainty?: BodyPosition;
  };
  /** Inertia about the centre of gravity, body axes (e.g. bifilar pendulum). */
  readonly inertia?: { readonly value: InertiaTensor };
}

export interface MassModel {
  /** Human description of the body-axes origin, e.g. "wing-root leading edge". */
  readonly referencePoint: string;
  readonly components: readonly MassComponent[];
  readonly measured?: MeasuredMassProperties;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface Estimate<T> {
  readonly value: T;
  readonly provenance: Provenance;
  /** Standard uncertainty (1 sigma); absent when it is unknown. */
  readonly standardUncertainty?: T;
}

export interface PrincipalAxes {
  /** Principal moments, ascending. */
  readonly moments: readonly [KilogramSquareMeters, KilogramSquareMeters, KilogramSquareMeters];
  /** Unit vectors in body axes, axes[i] belongs to moments[i]; right-handed. */
  readonly axes: readonly [Vec3<"FRD">, Vec3<"FRD">, Vec3<"FRD">];
}

export interface MassProperties {
  readonly referencePoint: string;
  readonly mass: Estimate<Kilograms>;
  readonly centerOfGravity: Estimate<BodyPosition>;
  /** About the centre of gravity, body axes. */
  readonly inertia: { readonly value: InertiaTensor; readonly provenance: Provenance };
  readonly principal: PrincipalAxes;
  /** Always the values built from components, to compare with measurements. */
  readonly fromComponents: {
    readonly mass: Kilograms;
    readonly centerOfGravity: BodyPosition;
    readonly inertia: InertiaTensor;
  };
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

const ASSUMPTIONS = {
  rigidBody: {
    id: "rigid-body",
    description: "The aircraft is a rigid body: components do not move relative to each other.",
  },
  homogeneousShapes: {
    id: "homogeneous-shapes",
    description: "Components described by a shape (box, cylinder, tube, sphere) are homogeneous: uniform density.",
  },
  pointMasses: {
    id: "point-masses",
    description: "Components declared as point masses have no inertia about their own centre.",
  },
  firstOrderUncertainty: {
    id: "first-order-uncertainty",
    description:
      "Mass and CG uncertainties: first-order propagation of independent standard uncertainties; inputs without a stated uncertainty count as exact.",
  },
  noUncertainty: {
    id: "no-input-uncertainty",
    description: "No input uncertainty was given, so mass and CG are reported without uncertainty.",
  },
  inertiaUncertainty: {
    id: "inertia-uncertainty-not-propagated",
    description: "The uncertainty of the calculated inertia tensor is not propagated yet.",
  },
  inertiaAboutCalculatedCg: {
    id: "inertia-about-calculated-cg",
    description:
      "The CG is measured but the inertia is calculated: the inertia stays about the calculated CG. The error is about M*d^2 for a CG offset d, usually negligible.",
  },
} as const satisfies Record<string, Assumption>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const weakest = (provenances: readonly Provenance[]): Provenance =>
  provenances.includes("ESTIMATED")
    ? "ESTIMATED"
    : provenances.includes("CALCULATED")
      ? "CALCULATED"
      : "MEASURED";

function requireFrd(position: Vec3<"FRD">, what: string): void {
  if (position.frame !== "FRD") {
    throw new RangeError(`${what} must be given in body axes FRD, got frame "${String(position.frame)}".`);
  }
}

function pointMassTensor(mass: number, d: Triple): Mat3 {
  const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  return [
    mass * (d2 - d[0] * d[0]), -mass * d[0] * d[1], -mass * d[0] * d[2],
    -mass * d[1] * d[0], mass * (d2 - d[1] * d[1]), -mass * d[1] * d[2],
    -mass * d[2] * d[0], -mass * d[2] * d[1], mass * (d2 - d[2] * d[2]),
  ];
}

function tensorChecks(tensor: Mat3, prefix: string): ValidityCheck[] {
  const { values } = symmetricEigen(tensor);
  const [i1, i2, i3] = values;
  const nonNegative = { min: 0, max: Number.POSITIVE_INFINITY };
  return [
    checkRange({
      quantity: `${prefix}smallestPrincipalMoment`,
      value: i1,
      unit: "kg*m^2",
      validated: nonNegative,
      applicable: nonNegative,
      note: "A physical inertia tensor is positive semi-definite: no principal moment can be negative.",
    }),
    checkRange({
      quantity: `${prefix}principalMomentTriangle`,
      value: i1 + i2 - i3,
      unit: "kg*m^2",
      validated: nonNegative,
      applicable: nonNegative,
      note: "Principal moments of a real body satisfy I1 + I2 >= I3; a violation means a wrong measurement or entry.",
    }),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function massProperties(model: MassModel): Result<MassProperties> {
  const { components } = model;
  if (components.length === 0) throw new RangeError("A mass model needs at least one component.");
  const ids = new Set<string>();
  for (const c of components) {
    if (ids.has(c.id)) throw new RangeError(`Duplicate component id "${c.id}".`);
    ids.add(c.id);
    if (!(c.mass.value > 0)) throw new RangeError(`Mass of "${c.id}" must be positive, got ${c.mass.value}.`);
    if (c.mass.standardUncertainty !== undefined && !(c.mass.standardUncertainty >= 0)) {
      throw new RangeError(`Mass uncertainty of "${c.id}" must be non-negative.`);
    }
    requireFrd(c.position, `Position of "${c.id}"`);
    if (c.positionUncertainty !== undefined) {
      requireFrd(c.positionUncertainty, `Position uncertainty of "${c.id}"`);
      if (!(c.positionUncertainty.x >= 0 && c.positionUncertainty.y >= 0 && c.positionUncertainty.z >= 0)) {
        throw new RangeError(`Position uncertainty of "${c.id}" must be non-negative.`);
      }
    }
  }

  // Mass and centre of gravity from components.
  let totalMass = 0;
  const moment: [number, number, number] = [0, 0, 0];
  for (const c of components) {
    const r = toTriple(c.position);
    totalMass += c.mass.value;
    moment[0] += c.mass.value * r[0];
    moment[1] += c.mass.value * r[1];
    moment[2] += c.mass.value * r[2];
  }
  const cg: Triple = [moment[0] / totalMass, moment[1] / totalMass, moment[2] / totalMass];

  // Inertia about the calculated CG.
  let tensor: Mat3 = ZERO;
  for (const c of components) {
    const r = toTriple(c.position);
    const own = componentInertiaMatrix(c.inertia, c.mass.value);
    const rotation = c.orientation === undefined ? IDENTITY : rotationMatrix(c.orientation);
    const d: Triple = [r[0] - cg[0], r[1] - cg[1], r[2] - cg[2]];
    tensor = add(tensor, add(rotateTensor(rotation, own), pointMassTensor(c.mass.value, d)));
  }
  // Enforce exact symmetry (rotations leave ~1e-17 asymmetry).
  tensor = scale(add(tensor, [
    tensor[0], tensor[3], tensor[6], tensor[1], tensor[4], tensor[7], tensor[2], tensor[5], tensor[8],
  ]), 0.5);

  // First-order uncertainty of mass and CG.
  const hasUncertainty = components.some(
    (c) => c.mass.standardUncertainty !== undefined || c.positionUncertainty !== undefined,
  );
  let massUncertainty: number | undefined;
  let cgUncertainty: Triple | undefined;
  if (hasUncertainty) {
    let um2 = 0;
    let ux2 = 0;
    let uy2 = 0;
    let uz2 = 0;
    for (const c of components) {
      const um = c.mass.standardUncertainty ?? 0;
      const up: Triple = c.positionUncertainty === undefined ? [0, 0, 0] : toTriple(c.positionUncertainty);
      const r = toTriple(c.position);
      um2 += um * um;
      const sensitivityPosition = c.mass.value / totalMass;
      // d c_k / d m_i = (r_ik - c_k) / M ;  d c_k / d r_ik = m_i / M
      ux2 += (((r[0] - cg[0]) / totalMass) * um) ** 2 + (sensitivityPosition * up[0]) ** 2;
      uy2 += (((r[1] - cg[1]) / totalMass) * um) ** 2 + (sensitivityPosition * up[1]) ** 2;
      uz2 += (((r[2] - cg[2]) / totalMass) * um) ** 2 + (sensitivityPosition * up[2]) ** 2;
    }
    massUncertainty = Math.sqrt(um2);
    cgUncertainty = [Math.sqrt(ux2), Math.sqrt(uy2), Math.sqrt(uz2)];
  }

  // Provenance of the calculated values.
  const massProvenances = components.map((c) => c.mass.provenance);
  const inertiaProvenances: Provenance[] = [
    ...massProvenances,
    ...components.flatMap((c) => (c.inertia.kind === "given" ? [c.inertia.provenance] : [])),
  ];
  const calculatedMassProvenance: Provenance = massProvenances.includes("ESTIMATED") ? "ESTIMATED" : "CALCULATED";
  const calculatedInertiaProvenance: Provenance = inertiaProvenances.includes("ESTIMATED")
    ? "ESTIMATED"
    : "CALCULATED";

  const fromComponents = {
    mass: kilograms(totalMass),
    centerOfGravity: bodyPosition(cg[0], cg[1], cg[2]),
    inertia: matrixToTensor(tensor),
  };

  // Measured values replace calculated ones.
  const measured = model.measured;
  if (measured?.centerOfGravity !== undefined) requireFrd(measured.centerOfGravity.value, "Measured CG");
  if (measured?.mass !== undefined && !(measured.mass.value > 0)) {
    throw new RangeError("Measured mass must be positive.");
  }

  const mass: Estimate<Kilograms> =
    measured?.mass !== undefined
      ? {
          value: measured.mass.value,
          provenance: "MEASURED",
          ...(measured.mass.standardUncertainty === undefined
            ? {}
            : { standardUncertainty: measured.mass.standardUncertainty }),
        }
      : {
          value: fromComponents.mass,
          provenance: calculatedMassProvenance,
          ...(massUncertainty === undefined ? {} : { standardUncertainty: kilograms(massUncertainty) }),
        };

  const centerOfGravity: Estimate<BodyPosition> =
    measured?.centerOfGravity !== undefined
      ? {
          value: measured.centerOfGravity.value,
          provenance: "MEASURED",
          ...(measured.centerOfGravity.standardUncertainty === undefined
            ? {}
            : { standardUncertainty: measured.centerOfGravity.standardUncertainty }),
        }
      : {
          value: fromComponents.centerOfGravity,
          provenance: calculatedMassProvenance,
          ...(cgUncertainty === undefined
            ? {}
            : { standardUncertainty: bodyPosition(cgUncertainty[0], cgUncertainty[1], cgUncertainty[2]) }),
        };

  const inertia =
    measured?.inertia !== undefined
      ? { value: measured.inertia.value, provenance: "MEASURED" as const }
      : { value: fromComponents.inertia, provenance: calculatedInertiaProvenance };

  const effectiveTensor = tensorToMatrix(inertia.value);
  const eigen = symmetricEigen(effectiveTensor);
  const axis = (t: Triple): Vec3<"FRD"> => ({ frame: "FRD", x: t[0], y: t[1], z: t[2] });
  const principal: PrincipalAxes = {
    moments: [
      kilogramSquareMeters(eigen.values[0]),
      kilogramSquareMeters(eigen.values[1]),
      kilogramSquareMeters(eigen.values[2]),
    ],
    axes: [axis(eigen.vectors[0]), axis(eigen.vectors[1]), axis(eigen.vectors[2])],
  };

  // Validity: physical consistency of the effective tensor and of given tensors.
  const checks: ValidityCheck[] = [
    ...tensorChecks(effectiveTensor, ""),
    ...components.flatMap((c) =>
      c.inertia.kind === "given" ? tensorChecks(tensorToMatrix(c.inertia.tensor), `component[${c.id}].`) : [],
    ),
  ];

  const usesShapes = components.some((c) => ["box", "cylinder", "tube", "sphere"].includes(c.inertia.kind));
  const usesPoints = components.some((c) => c.inertia.kind === "point");

  const methods: Method[] = [RIGID_BODY_MASS_PROPERTIES];
  if (usesShapes) methods.push(HOMOGENEOUS_SOLID_INERTIA);
  methods.push(PRINCIPAL_AXES_JACOBI);
  if (hasUncertainty) methods.push(GUM_FIRST_ORDER);

  const assumptions: Assumption[] = [ASSUMPTIONS.rigidBody];
  if (usesShapes) assumptions.push(ASSUMPTIONS.homogeneousShapes);
  if (usesPoints) assumptions.push(ASSUMPTIONS.pointMasses);
  assumptions.push(hasUncertainty ? ASSUMPTIONS.firstOrderUncertainty : ASSUMPTIONS.noUncertainty);
  if (measured?.inertia === undefined) assumptions.push(ASSUMPTIONS.inertiaUncertainty);
  if (measured?.centerOfGravity !== undefined && measured.inertia === undefined) {
    assumptions.push(ASSUMPTIONS.inertiaAboutCalculatedCg);
  }

  return {
    value: {
      referencePoint: model.referencePoint,
      mass,
      centerOfGravity,
      inertia,
      principal,
      fromComponents,
    },
    provenance: weakest([mass.provenance, centerOfGravity.provenance, inertia.provenance]),
    methods,
    assumptions,
    validity: combineValidity(checks),
  };
}
