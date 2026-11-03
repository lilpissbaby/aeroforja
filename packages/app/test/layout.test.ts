import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DOCK_LIMITS, clampDockSize, focusToggle, parseLayout, visibleDocks } from "../src/state/layout.ts";

const screen = { width: 1366, height: 768 };
const open = { left: false, right: false, bottom: false };

describe("panel sizes", () => {
  it("stay inside each panel's limits", () => {
    expect(clampDockSize("left", 10, screen)).toBe(DOCK_LIMITS.left.min);
    expect(clampDockSize("left", 300.4, screen)).toBe(300);
    expect(clampDockSize("right", 5000, { width: 4000, height: 2000 })).toBe(DOCK_LIMITS.right.max);
  });

  it("never take more than their share of the window", () => {
    // 40 % of 1366 px for a side panel, 60 % of 768 px for the results.
    expect(clampDockSize("right", 900, screen)).toBe(Math.round(1366 * 0.4));
    expect(clampDockSize("bottom", 900, screen)).toBe(Math.round(768 * 0.6));
  });

  it("keep the minimum on a window too small for it, and fall back on nonsense", () => {
    expect(clampDockSize("right", 400, { width: 500, height: 400 })).toBe(DOCK_LIMITS.right.min);
    expect(clampDockSize("bottom", Number.NaN, screen)).toBe(DOCK_LIMITS.bottom.initial);
  });
});

describe("«Ampliar vista»", () => {
  it("folds every panel on screen and gives back the ones that were open", () => {
    const before = { left: false, right: true, bottom: false };
    const focused = focusToggle(before, null, visibleDocks(false));
    expect(focused.collapsed).toEqual({ left: true, right: true, bottom: true });
    const back = focusToggle(focused.collapsed, focused.beforeFocus, visibleDocks(false));
    expect(back.collapsed).toEqual(before);
    expect(back.beforeFocus).toBeNull();
  });

  it("opens them all when they were folded one by one", () => {
    const folded = { left: true, right: true, bottom: true };
    expect(focusToggle(folded, null, visibleDocks(false)).collapsed).toEqual(open);
    expect(focusToggle(folded, folded, visibleDocks(false)).collapsed).toEqual(open);
  });

  it("leaves alone the panels a bench view hides", () => {
    // CFD and gust views show only the left panel.
    const focused = focusToggle(open, null, visibleDocks(true));
    expect(focused.collapsed).toEqual({ left: true, right: false, bottom: false });
    expect(focusToggle(focused.collapsed, focused.beforeFocus, visibleDocks(true)).collapsed).toEqual(open);
  });
});

describe("stored layout", () => {
  it("reads back what was saved", () => {
    const saved = { collapsed: { left: true, right: false, bottom: true }, size: { left: 300, right: 400, bottom: 200 }, sections: { templates: true } };
    expect(parseLayout(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("falls back to the default on missing or malformed data", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("panels")).toEqual(DEFAULT_LAYOUT);
    const parsed = parseLayout({ collapsed: { left: "yes", bottom: true }, size: { left: 99999, right: "wide" }, sections: { a: 1, b: false } });
    expect(parsed.collapsed).toEqual({ left: false, right: false, bottom: true });
    expect(parsed.size).toEqual({ left: DOCK_LIMITS.left.max, right: DOCK_LIMITS.right.initial, bottom: DOCK_LIMITS.bottom.initial });
    expect(parsed.sections).toEqual({ b: false });
  });
});
