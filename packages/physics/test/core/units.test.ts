import { describe, expect, it } from "vitest";
import { kelvin, meters, quantity } from "../../src/core/units.ts";

describe("quantity constructors", () => {
  it("keep the numeric value unchanged", () => {
    expect(meters(1234.5)).toBe(1234.5);
    expect(kelvin(288.15)).toBe(288.15);
  });

  it("reject NaN and infinities", () => {
    expect(() => meters(Number.NaN)).toThrow(RangeError);
    expect(() => kelvin(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => quantity(Number.NEGATIVE_INFINITY, "Pa")).toThrow(RangeError);
  });

  it("are not interchangeable at compile time", () => {
    const altitude = meters(100);
    // @ts-expect-error a length is not a temperature
    const wrong: ReturnType<typeof kelvin> = altitude;
    expect(wrong).toBe(100);
  });
});
