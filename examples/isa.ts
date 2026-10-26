/**
 * Standard atmosphere at a geometric altitude.
 *
 *   pnpm isa 1500            -> 1500 m, standard day, dry air
 *   pnpm isa 1500 10         -> same, ISA + 10 K
 *   pnpm isa 1500 10 70      -> same, 70 % relative humidity
 *   pnpm isa 12000           -> above the tropopause: red
 */
import {
  ATMOSPHERE_STATE_UNITS,
  atmosphere,
  dimensionless,
  kelvin,
  meters,
} from "../packages/physics/src/index.ts";
import { printResult } from "./print.ts";

const [altitudeArg = "0", deltaTArg, humidityArg] = process.argv.slice(2);
const altitude = Number(altitudeArg);
const deltaT = deltaTArg === undefined ? 0 : Number(deltaTArg);
const humidityPercent = humidityArg === undefined ? undefined : Number(humidityArg);

const result = atmosphere({
  altitude: { kind: "geometric", value: meters(altitude) },
  ...(deltaT === 0 ? {} : { temperature: { kind: "offset", deltaT: kelvin(deltaT) } as const }),
  ...(humidityPercent === undefined ? {} : { relativeHumidity: dimensionless(humidityPercent / 100) }),
});

console.log(
  `Geometric altitude ${altitude} m, ISA ${deltaT >= 0 ? "+" : ""}${deltaT} K, ` +
    (humidityPercent === undefined ? "dry air" : `RH ${humidityPercent} %`),
);
printResult(result, ATMOSPHERE_STATE_UNITS);
