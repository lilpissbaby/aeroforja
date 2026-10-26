/**
 * Prints the full ISA result envelope for an altitude.
 *
 *   pnpm isa 1500            -> geometric altitude 1500 m, standard day
 *   pnpm isa 1500 10         -> same, ISA + 10 K
 *   pnpm isa 12000           -> above the tropopause: red
 */
import { atmosphere, kelvin, meters, ATMOSPHERE_STATE_UNITS } from "../packages/physics/src/index.ts";

const [altitudeArg = "0", deltaTArg] = process.argv.slice(2);
const altitude = Number(altitudeArg);
const deltaT = deltaTArg === undefined ? undefined : Number(deltaTArg);

const result = atmosphere({
  altitude: { kind: "geometric", value: meters(altitude) },
  ...(deltaT === undefined ? {} : { temperature: { kind: "offset", deltaT: kelvin(deltaT) } as const }),
});

console.log(`Geometric altitude ${altitude} m${deltaT === undefined ? "" : `, ISA ${deltaT >= 0 ? "+" : ""}${deltaT} K`}`);
for (const [key, unit] of Object.entries(ATMOSPHERE_STATE_UNITS)) {
  const value = result.value[key as keyof typeof result.value];
  console.log(`  ${key.padEnd(22)} ${value.toPrecision(6).padStart(12)} ${unit}`);
}
console.log(`Provenance: ${result.provenance}`);
console.log(`Validity:   ${result.validity.level.toUpperCase()}`);
for (const check of result.validity.checks) {
  console.log(`  - ${check.quantity}: ${check.level} (validated ${check.validated.min}..${check.validated.max} ${check.unit})`);
}
console.log("Methods:");
for (const method of result.methods) {
  console.log(`  - ${method.name}`);
  for (const ref of method.references) console.log(`      ${ref.citation}`);
}
console.log("Assumptions:");
for (const assumption of result.assumptions) console.log(`  - ${assumption.description}`);
