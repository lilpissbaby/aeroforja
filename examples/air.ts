/**
 * Air properties from your own measurements (barometer, thermometer, hygrometer).
 * Units as read on the instruments; conversion to SI happens here, as in the UI.
 *
 *   pnpm air 1008 24         -> 1008 hPa station pressure, 24 degrees C, dry air
 *   pnpm air 1008 24 65      -> same, 65 % relative humidity
 */
import {
  AIR_STATE_UNITS,
  dimensionless,
  kelvin,
  measuredAtmosphere,
  pascals,
} from "../packages/physics/src/index.ts";
import { printResult } from "./print.ts";

const [pressureHpaArg, temperatureCArg, humidityArg] = process.argv.slice(2);
if (pressureHpaArg === undefined || temperatureCArg === undefined) {
  console.error("Usage: pnpm air <station pressure hPa> <temperature degC> [relative humidity %]");
  process.exit(1);
}
const pressureHpa = Number(pressureHpaArg);
const temperatureC = Number(temperatureCArg);
const humidityPercent = humidityArg === undefined ? undefined : Number(humidityArg);

const result = measuredAtmosphere({
  pressure: pascals(pressureHpa * 100),
  temperature: kelvin(temperatureC + 273.15),
  ...(humidityPercent === undefined ? {} : { relativeHumidity: dimensionless(humidityPercent / 100) }),
});

console.log(
  `Measured: ${pressureHpa} hPa, ${temperatureC} degC, ` +
    (humidityPercent === undefined ? "dry air" : `RH ${humidityPercent} %`),
);
printResult(result, AIR_STATE_UNITS);
