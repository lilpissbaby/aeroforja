/**
 * SI quantities with their unit carried in the type.
 *
 * At runtime a quantity is a plain `number` (no allocation, no overhead in hot
 * loops). At compile time it is branded with its SI unit, so a pressure cannot
 * be passed where a temperature is expected. Arithmetic on quantities returns a
 * plain `number`; the result must be re-branded explicitly with the matching
 * constructor, which is where the unit of a derived quantity is stated.
 *
 * The whole physics core works in SI. Conversion to mm, g, inches, rpm or °C
 * belongs to the UI only.
 */

declare const unitBrand: unique symbol;

/** A finite number in the SI unit `U`. */
export type Quantity<U extends string> = number & { readonly [unitBrand]: U };

export type Meters = Quantity<"m">;
export type Kelvin = Quantity<"K">;
export type Pascals = Quantity<"Pa">;
export type KilogramsPerCubicMeter = Quantity<"kg/m^3">;
export type PascalSeconds = Quantity<"Pa*s">;
export type SquareMetersPerSecond = Quantity<"m^2/s">;
export type MetersPerSecond = Quantity<"m/s">;
export type MetersPerSecondSquared = Quantity<"m/s^2">;
export type KelvinPerMeter = Quantity<"K/m">;
export type JoulesPerKilogramKelvin = Quantity<"J/(kg*K)">;
export type Dimensionless = Quantity<"1">;

/** The unit symbol carried by a quantity type. */
export type UnitOf<Q> = Q extends Quantity<infer U> ? U : never;

/**
 * Runtime unit symbols for every quantity field of `T`. Declaring a units
 * table with `satisfies UnitsOf<T>` makes the compiler check that the strings
 * shown to the user match the branded types, so a displayed unit can never
 * drift from the computed one.
 */
export type UnitsOf<T> = { readonly [K in keyof T]: UnitOf<T[K]> };

/**
 * Brands a finite number with an SI unit. Prefer the named constructors below;
 * use this directly only for rare units such as Sutherland's constant.
 */
export function quantity<U extends string>(value: number, unit: U): Quantity<U> {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Quantity in ${unit} must be a finite number, got ${String(value)}`);
  }
  return value as Quantity<U>;
}

const brand = quantity;

export const meters = (value: number): Meters => brand(value, "m");
export const kelvin = (value: number): Kelvin => brand(value, "K");
export const pascals = (value: number): Pascals => brand(value, "Pa");
export const kilogramsPerCubicMeter = (value: number): KilogramsPerCubicMeter =>
  brand(value, "kg/m^3");
export const pascalSeconds = (value: number): PascalSeconds => brand(value, "Pa*s");
export const squareMetersPerSecond = (value: number): SquareMetersPerSecond =>
  brand(value, "m^2/s");
export const metersPerSecond = (value: number): MetersPerSecond => brand(value, "m/s");
export const metersPerSecondSquared = (value: number): MetersPerSecondSquared =>
  brand(value, "m/s^2");
export const kelvinPerMeter = (value: number): KelvinPerMeter => brand(value, "K/m");
export const joulesPerKilogramKelvin = (value: number): JoulesPerKilogramKelvin =>
  brand(value, "J/(kg*K)");
export const dimensionless = (value: number): Dimensionless => brand(value, "1");
