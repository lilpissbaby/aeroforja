/** Console rendering of a Result envelope, shared by the examples. */
import type { Result } from "../packages/physics/src/index.ts";

export function printResult<T extends object>(
  result: Result<T>,
  units: { readonly [K in keyof T]: string },
): void {
  for (const key of Object.keys(units) as (keyof T & string)[]) {
    const value = Number(result.value[key]);
    console.log(`  ${key.padEnd(22)} ${value.toPrecision(6).padStart(14)} ${units[key]}`);
  }
  console.log(`Provenance: ${result.provenance}`);
  console.log(`Validity:   ${result.validity.level.toUpperCase()}`);
  for (const check of result.validity.checks) {
    console.log(
      `  - ${check.quantity}: ${check.level} (validated ${check.validated.min}..${check.validated.max} ${check.unit})`,
    );
  }
  console.log("Methods:");
  for (const method of result.methods) {
    console.log(`  - ${method.name}`);
    for (const ref of method.references) console.log(`      ${ref.citation}`);
  }
  console.log("Assumptions:");
  for (const assumption of result.assumptions) console.log(`  - ${assumption.description}`);
}
