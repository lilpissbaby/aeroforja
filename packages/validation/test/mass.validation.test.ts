/**
 * Validation: mass model against closed forms and exact discrete identities.
 * See src/mass/cases.ts for references and tolerances.
 */
import { describe, expect, it } from "vitest";
import {
  bodyPosition,
  kilograms,
  massProperties,
  mat3,
  meters,
  quaternionFromAxisAngle,
  radians,
  rotationMatrix,
  tensorToMatrix,
  type InertiaTensor,
  type MassComponent,
  type Quaternion,
} from "@aeroforja/physics";
import { CONVERGENCE_TOLERANCE, EXACT_TOLERANCE } from "../src/index.ts";

const close = (actual: number, expected: number, relative: number, label: string): void => {
  const scale = Math.max(Math.abs(expected), 1e-300);
  expect(Math.abs(actual - expected) / scale, `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(relative);
};

let counter = 0;
const pointMass = (mass: number, x: number, y: number, z: number): MassComponent => ({
  id: `p${counter++}`,
  name: "point",
  mass: { value: kilograms(mass), provenance: "CALCULATED" },
  position: bodyPosition(x, y, z),
  inertia: { kind: "point" },
});

const inertiaOf = (components: MassComponent[]): InertiaTensor =>
  massProperties({ referencePoint: "origin", components }).value.inertia.value;

/** Cell-centred coordinates of n cells spanning [-length/2, length/2]. */
const cellCentres = (n: number, length: number): number[] =>
  Array.from({ length: n }, (_, k) => ((k + 0.5) / n - 0.5) * length);

describe("homogeneous box vs point-mass grid (exact discrete identity)", () => {
  // Sum of squared cell centres = continuous value * (1 - 1/N^2), exactly.
  const m = 0.42;
  const [a, b, c] = [0.21, 0.08, 0.035];
  const n = 20;
  const cells: MassComponent[] = [];
  for (const x of cellCentres(n, a)) for (const y of cellCentres(n, b)) for (const z of cellCentres(n, c)) {
    cells.push(pointMass(m / n ** 3, x, y, z));
  }
  const grid = inertiaOf(cells);
  const shape = inertiaOf([
    {
      id: "box",
      name: "box",
      mass: { value: kilograms(m), provenance: "CALCULATED" },
      position: bodyPosition(0, 0, 0),
      inertia: { kind: "box", size: { x: meters(a), y: meters(b), z: meters(c) } },
    },
  ]);
  const factor = 1 - 1 / n ** 2;

  it("Ixx, Iyy, Izz", () => {
    close(grid.Ixx, shape.Ixx * factor, EXACT_TOLERANCE.relative, "Ixx");
    close(grid.Iyy, shape.Iyy * factor, EXACT_TOLERANCE.relative, "Iyy");
    close(grid.Izz, shape.Izz * factor, EXACT_TOLERANCE.relative, "Izz");
  });

  it("products of inertia vanish by symmetry", () => {
    for (const p of [grid.Ixy, grid.Ixz, grid.Iyz]) expect(Math.abs(p)).toBeLessThanOrEqual(1e-15);
  });
});

/** Annuli with midpoint radii; annulus area 2 pi r_j h is exact, so ring masses are exact. */
function ringGrid(mass: number, rInner: number, rOuter: number, length: number, nr: number, k: number, nl: number) {
  const h = (rOuter - rInner) / nr;
  const radii = Array.from({ length: nr }, (_, j) => rInner + (j + 0.5) * h);
  const areaSum = radii.reduce((s, r) => s + r * h, 0); // = (ro^2 - ri^2) / 2 exactly
  const cells: MassComponent[] = [];
  for (const r of radii) {
    const ringMass = (mass * (r * h)) / areaSum;
    for (let q = 0; q < k; q++) {
      const theta = (2 * Math.PI * q) / k;
      for (const x of cellCentres(nl, length)) {
        cells.push(pointMass(ringMass / (k * nl), x, r * Math.cos(theta), r * Math.sin(theta)));
      }
    }
  }
  return { cells, h };
}

describe("homogeneous cylinder and tube vs ring grid (exact discrete identities)", () => {
  // Midpoint rule on r^3 over [ri, ro]: error is exactly -h^2 (ro^2 - ri^2) / 8, so the
  // axial moment of the grid is m * ((ro^2 + ri^2)/2 - h^2/4). Uniform angles (k >= 3)
  // give sum sin^2 = k/2 exactly; axial cells give (1 - 1/nl^2) on L^2/12.
  const m = 0.035;
  const length = 0.3;
  const nl = 12;
  const k = 6;
  const nr = 40;

  const cases = [
    { name: "solid cylinder", ri: 0, ro: 0.006 },
    { name: "carbon tube", ri: 0.004, ro: 0.005 },
  ] as const;

  for (const { name, ri, ro } of cases) {
    it(name, () => {
      const { cells, h } = ringGrid(m, ri, ro, length, nr, k, nl);
      const grid = inertiaOf(cells);
      const shape = inertiaOf([
        {
          id: "solid",
          name,
          mass: { value: kilograms(m), provenance: "CALCULATED" },
          position: bodyPosition(0, 0, 0),
          inertia:
            ri === 0
              ? { kind: "cylinder", radius: meters(ro), length: meters(length), axis: "x" }
              : { kind: "tube", outerRadius: meters(ro), innerRadius: meters(ri), length: meters(length), axis: "x" },
        },
      ]);
      const axialGrid = shape.Ixx - (m * h * h) / 4;
      const radialHalf = axialGrid / 2;
      const lengthTerm = ((m * length * length) / 12) * (1 - 1 / nl ** 2);
      close(grid.Ixx, axialGrid, EXACT_TOLERANCE.relative, "axial");
      close(grid.Iyy, radialHalf + lengthTerm, EXACT_TOLERANCE.relative, "transverse y");
      close(grid.Izz, radialHalf + lengthTerm, EXACT_TOLERANCE.relative, "transverse z");
      // And the closed form itself: transverse = axial/2 + m L^2/12.
      close(shape.Iyy, shape.Ixx / 2 + (m * length * length) / 12, EXACT_TOLERANCE.relative, "closed form");
    });
  }
});

describe("homogeneous sphere vs stack of cylindrical discs (convergence)", () => {
  it(`Ixx and Iyy within ${CONVERGENCE_TOLERANCE.relative}`, () => {
    const m = 0.1;
    const radius = 0.04;
    const n = 400;
    const h = (2 * radius) / n;
    const xs = cellCentres(n, 2 * radius);
    const weights = xs.map((x) => radius * radius - x * x);
    const total = weights.reduce((s, w) => s + w, 0);
    const discs: MassComponent[] = xs.map((x, j) => ({
      id: `d${j}`,
      name: "disc",
      mass: { value: kilograms((m * weights[j]!) / total), provenance: "CALCULATED" },
      position: bodyPosition(x, 0, 0),
      inertia: { kind: "cylinder", radius: meters(Math.sqrt(weights[j]!)), length: meters(h), axis: "x" },
    }));
    const stack = inertiaOf(discs);
    const sphere = inertiaOf([
      {
        id: "s",
        name: "sphere",
        mass: { value: kilograms(m), provenance: "CALCULATED" },
        position: bodyPosition(0, 0, 0),
        inertia: { kind: "sphere", radius: meters(radius) },
      },
    ]);
    close(sphere.Ixx, 0.4 * m * radius * radius, EXACT_TOLERANCE.relative, "2/5 m R^2");
    close(stack.Ixx, sphere.Ixx, CONVERGENCE_TOLERANCE.relative, "axial");
    close(stack.Iyy, sphere.Iyy, CONVERGENCE_TOLERANCE.relative, "transverse");
  });
});

describe("composite bodies", () => {
  it("dumbbell: two masses at y = +-L/2 give Ixx = Izz = 2 m (L/2)^2, Iyy = 0", () => {
    const m = 0.15;
    const l = 0.45;
    const t = inertiaOf([pointMass(m, 0, -l / 2, 0), pointMass(m, 0, l / 2, 0)]);
    close(t.Ixx, 2 * m * (l / 2) ** 2, EXACT_TOLERANCE.relative, "Ixx");
    close(t.Izz, 2 * m * (l / 2) ** 2, EXACT_TOLERANCE.relative, "Izz");
    expect(t.Iyy).toBe(0);
  });

  it("rod rotated +45 deg about z: positive product Ixy = (I_transverse - I_axial)/2", () => {
    const m = 0.05;
    const r = 0.002;
    const l = 0.4;
    const q: Quaternion = quaternionFromAxisAngle([0, 0, 1], radians(Math.PI / 4));
    const t = inertiaOf([
      {
        id: "rod",
        name: "rod",
        mass: { value: kilograms(m), provenance: "CALCULATED" },
        position: bodyPosition(0, 0, 0),
        orientation: q,
        inertia: { kind: "cylinder", radius: meters(r), length: meters(l), axis: "x" },
      },
    ]);
    const axial = (m * r * r) / 2;
    const transverse = (m * (3 * r * r + l * l)) / 12;
    close(t.Ixx, (axial + transverse) / 2, EXACT_TOLERANCE.relative, "Ixx");
    close(t.Iyy, (axial + transverse) / 2, EXACT_TOLERANCE.relative, "Iyy");
    close(t.Izz, transverse, EXACT_TOLERANCE.relative, "Izz");
    close(t.Ixy, (transverse - axial) / 2, EXACT_TOLERANCE.relative, "Ixy");
    expect(t.Ixy).toBeGreaterThan(0); // mass along (1, 1, 0): integral of x*y dm > 0
  });

  it("quad X of point masses: zero products and Izz = Ixx + Iyy (perpendicular axes)", () => {
    const arm = 0.11;
    const t = inertiaOf([
      pointMass(0.03, arm, arm, 0),
      pointMass(0.03, arm, -arm, 0),
      pointMass(0.03, -arm, arm, 0),
      pointMass(0.03, -arm, -arm, 0),
      pointMass(0.2, 0, 0, 0),
    ]);
    for (const p of [t.Ixy, t.Ixz, t.Iyz]) expect(Math.abs(p)).toBeLessThanOrEqual(1e-18);
    close(t.Izz, t.Ixx + t.Iyy, EXACT_TOLERANCE.relative, "perpendicular axes");
    close(t.Ixx, 4 * 0.03 * arm * arm, EXACT_TOLERANCE.relative, "Ixx");
  });

  const mixed = (offset: readonly [number, number, number], rotation?: Quaternion): MassComponent[] => {
    const r = rotation === undefined ? mat3.IDENTITY : rotationMatrix(rotation);
    const place = (x: number, y: number, z: number) => {
      const p = mat3.multiplyVector(r, [x, y, z]);
      return bodyPosition(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]);
    };
    const orient = (local?: Quaternion): Quaternion | undefined => {
      if (rotation === undefined) return local;
      if (local === undefined) return rotation;
      // Hamilton product rotation * local
      const a = rotation;
      const b = local;
      return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      };
    };
    const tilt = quaternionFromAxisAngle([1, 1, 0], radians(0.3));
    const parts: Omit<MassComponent, "position" | "orientation">[] = [
      { id: "battery", name: "battery", mass: { value: kilograms(0.18), provenance: "MEASURED" }, inertia: { kind: "box", size: { x: meters(0.07), y: meters(0.035), z: meters(0.025) } } },
      { id: "motor", name: "motor", mass: { value: kilograms(0.045), provenance: "MEASURED" }, inertia: { kind: "cylinder", radius: meters(0.014), length: meters(0.02), axis: "z" } },
      { id: "boom", name: "boom", mass: { value: kilograms(0.03), provenance: "MEASURED" }, inertia: { kind: "tube", outerRadius: meters(0.005), innerRadius: meters(0.004), length: meters(0.4), axis: "x" } },
    ];
    const positions: [number, number, number][] = [[0.05, 0, 0.01], [-0.2, 0.01, -0.02], [-0.05, 0, 0]];
    const local: (Quaternion | undefined)[] = [undefined, tilt, undefined];
    return parts.map((p, i) => {
      const o = orient(local[i]);
      return { ...p, position: place(...positions[i]!), ...(o === undefined ? {} : { orientation: o }) };
    });
  };

  it("translating the whole assembly moves the CG by the same vector and leaves the inertia unchanged", () => {
    const base = massProperties({ referencePoint: "a", components: mixed([0, 0, 0]) }).value;
    const moved = massProperties({ referencePoint: "b", components: mixed([0.3, -0.1, 0.05]) }).value;
    close(moved.centerOfGravity.value.x, base.centerOfGravity.value.x + 0.3, EXACT_TOLERANCE.relative, "cg x");
    const a = tensorToMatrix(base.inertia.value);
    const b = tensorToMatrix(moved.inertia.value);
    const scale = Math.max(...a.map(Math.abs));
    for (let i = 0; i < 9; i++) expect(Math.abs(a[i]! - b[i]!) / scale).toBeLessThanOrEqual(1e-11);
  });

  it("rotating the whole assembly by R gives R J R^T", () => {
    const q = quaternionFromAxisAngle([0.3, -0.5, 0.8], radians(1.1));
    const base = tensorToMatrix(massProperties({ referencePoint: "a", components: mixed([0, 0, 0]) }).value.inertia.value);
    const turned = tensorToMatrix(
      massProperties({ referencePoint: "a", components: mixed([0, 0, 0], q) }).value.inertia.value,
    );
    const expected = mat3.rotateTensor(rotationMatrix(q), base);
    const scale = Math.max(...base.map(Math.abs));
    for (let i = 0; i < 9; i++) expect(Math.abs(turned[i]! - expected[i]!) / scale).toBeLessThanOrEqual(1e-11);
  });
});
