import { describe, expect, it } from "vitest";
import {
  formatFixed,
  formatScientific,
  fromDegrees,
  fromGrams,
  fromMillimeters,
  parseNumber,
  toCelsius,
  toDegrees,
  toGrams,
  toMillimeters,
} from "../src/units/display.ts";

describe("display units", () => {
  it("convert to and from SI exactly", () => {
    expect(toMillimeters(0.0125)).toBeCloseTo(12.5, 12);
    expect(fromMillimeters(12.5)).toBeCloseTo(0.0125, 15);
    expect(toGrams(0.43)).toBeCloseTo(430, 12);
    expect(fromGrams(430)).toBeCloseTo(0.43, 15);
    expect(toCelsius(288.15)).toBeCloseTo(15, 12);
    expect(toDegrees(fromDegrees(37.5))).toBeCloseTo(37.5, 12);
  });
});

describe("parseNumber", () => {
  it("accepts decimal comma or point, spaces and sign", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("-0,25")).toBe(-0.25);
    expect(parseNumber("1e-3")).toBe(0.001);
    expect(parseNumber(",5")).toBe(0.5);
  });

  it("rejects anything that is not a plain number", () => {
    for (const bad of ["", "abc", "12,5,1", "1.2.3", "12 g", "--1", "Infinity", "NaN"]) {
      expect(parseNumber(bad), bad).toBeNull();
    }
  });
});

describe("formatting (es-ES)", () => {
  it("uses a decimal comma and never prints -0", () => {
    expect(formatFixed(12.345, 1)).toBe("12,3");
    expect(formatFixed(-0.0001, 1)).toBe("0,0");
  });

  it("switches to scientific notation outside 1e-2..1e4", () => {
    expect(formatScientific(9.7913e-4)).toBe("9,791 × 10⁻⁴");
    expect(formatScientific(1.225, 4)).toBe("1,225");
    expect(formatScientific(0)).toBe("0");
  });
});
