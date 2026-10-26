import { describe, expect, it } from "vitest";
import type { ValidityCheck } from "../../src/core/result.ts";
import { checkRange, combineValidity } from "../../src/core/validity.ts";

const spec = {
  quantity: "x",
  unit: "m",
  validated: { min: 0, max: 10 },
  applicable: { min: -5, max: 20 },
  note: "test",
};

describe("checkRange", () => {
  it("is green inside the validated range, bounds included", () => {
    expect(checkRange({ ...spec, value: 0 }).level).toBe("green");
    expect(checkRange({ ...spec, value: 10 }).level).toBe("green");
  });

  it("is amber inside the applicable range but outside the validated one", () => {
    expect(checkRange({ ...spec, value: -5 }).level).toBe("amber");
    expect(checkRange({ ...spec, value: 15 }).level).toBe("amber");
  });

  it("is red outside the applicable range", () => {
    expect(checkRange({ ...spec, value: -5.0001 }).level).toBe("red");
    expect(checkRange({ ...spec, value: 21 }).level).toBe("red");
  });

  it("refuses a validated range that sticks out of the applicable one", () => {
    expect(() =>
      checkRange({ ...spec, value: 1, validated: { min: 0, max: 30 } }),
    ).toThrow(RangeError);
  });

  it("refuses NaN", () => {
    expect(() => checkRange({ ...spec, value: Number.NaN })).toThrow(RangeError);
  });
});

describe("combineValidity", () => {
  const at = (value: number): ValidityCheck => checkRange({ ...spec, value });

  it("takes the worst level", () => {
    expect(combineValidity([at(1), at(2)]).level).toBe("green");
    expect(combineValidity([at(1), at(15)]).level).toBe("amber");
    expect(combineValidity([at(15), at(100), at(1)]).level).toBe("red");
  });

  it("is green with no checks", () => {
    expect(combineValidity([]).level).toBe("green");
  });
});
