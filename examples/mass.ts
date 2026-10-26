/**
 * Mass, CG and inertia of a mass model stored as JSON.
 *
 *   pnpm mass                               -> the synthetic example body
 *   pnpm mass path/to/my-quad.json          -> your own model
 *
 * The JSON follows the MassModel type of @aeroforja/physics (SI units, FRD).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { massProperties, type MassModel } from "../packages/physics/src/index.ts";

const path = process.argv[2] ?? fileURLToPath(new URL("./mass-model.example.json", import.meta.url));
const model = JSON.parse(readFileSync(path, "utf8")) as MassModel;
const result = massProperties(model);
const { mass, centerOfGravity: cg, inertia, principal, fromComponents } = result.value;

const u = (value: number | undefined, factor: number, digits: number): string =>
  value === undefined ? "" : ` ± ${(value * factor).toFixed(digits)}`;

console.log(`Model: ${path}`);
console.log(`Reference point: ${result.value.referencePoint}`);
console.log(
  `Mass: ${mass.value.toFixed(4)} kg (${(mass.value * 1000).toFixed(1)}${u(mass.standardUncertainty, 1000, 1)} g) [${mass.provenance}]`,
);
for (const axis of ["x", "y", "z"] as const) {
  console.log(
    `CG ${axis}: ${cg.value[axis].toFixed(5)} m (${(cg.value[axis] * 1000).toFixed(1)}${u(cg.standardUncertainty?.[axis], 1000, 1)} mm) [${cg.provenance}]`,
  );
}
console.log(`Inertia about CG, body axes (kg*m^2) [${inertia.provenance}]:`);
for (const key of ["Ixx", "Iyy", "Izz", "Ixy", "Ixz", "Iyz"] as const) {
  console.log(`  ${key} = ${inertia.value[key].toExponential(4)}`);
}
console.log(`Principal moments (kg*m^2): ${principal.moments.map((m) => m.toExponential(4)).join(", ")}`);
if (model.measured !== undefined) {
  console.log(
    `From components: ${fromComponents.mass.toFixed(4)} kg, CG x ${(fromComponents.centerOfGravity.x * 1000).toFixed(1)} mm`,
  );
}
console.log(`Provenance: ${result.provenance}`);
console.log(`Validity:   ${result.validity.level.toUpperCase()}`);
for (const check of result.validity.checks) console.log(`  - ${check.quantity}: ${check.level}`);
console.log("Methods:");
for (const method of result.methods) console.log(`  - ${method.name}`);
console.log("Assumptions:");
for (const assumption of result.assumptions) console.log(`  - ${assumption.description}`);
