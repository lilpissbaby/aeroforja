import { describe, expect, it } from "vitest";
import { DOCK_BELOW, placeCard } from "../src/ui/tour/position.ts";
import { TOUR_STEPS } from "../src/ui/tour/steps.tsx";

const viewport = { width: 1600, height: 1000 };
const card = { width: 380, height: 240 };

describe("tour card placement", () => {
  it("goes beside the target on the preferred side", () => {
    const target = { x: 0, y: 100, width: 250, height: 400 };
    const p = placeCard(target, card, viewport, ["right"]);
    expect(p.placement).toBe("right");
    expect(p.x).toBe(250 + 14);
    expect(p.y).toBe(100 + 200 - 120);
  });

  it("falls back to another side when the preferred one has no room", () => {
    const target = { x: 1350, y: 100, width: 250, height: 300 };
    expect(placeCard(target, card, viewport, ["right"]).placement).not.toBe("right");
  });

  it("always stays inside the window", () => {
    for (const target of [
      { x: 0, y: 0, width: 1600, height: 1000 },
      { x: 10, y: 950, width: 40, height: 40 },
      { x: 1500, y: 0, width: 100, height: 30 },
    ]) {
      const p = placeCard(target, card, viewport);
      expect(p.x).toBeGreaterThanOrEqual(12);
      expect(p.y).toBeGreaterThanOrEqual(12);
      expect(p.x + card.width).toBeLessThanOrEqual(viewport.width - 12);
      expect(p.y + card.height).toBeLessThanOrEqual(viewport.height - 12);
    }
  });

  it("centres when there is no target and docks at the bottom on phones", () => {
    expect(placeCard(null, card, viewport).placement).toBe("center");
    const phone = placeCard({ x: 0, y: 0, width: 100, height: 100 }, card, { width: DOCK_BELOW - 1, height: 800 });
    expect(phone).toEqual({ x: 12, y: 800 - 240 - 12, placement: "dock" });
    const lowTarget = placeCard({ x: 0, y: 600, width: 100, height: 100 }, card, { width: DOCK_BELOW - 1, height: 800 });
    expect(lowTarget).toEqual({ x: 12, y: 12, placement: "dock" });
  });
});

/** Every data-tour="…" written in the app's source files. */
const SOURCES = import.meta.glob<string>("../src/**/*.tsx", { query: "?raw", import: "default", eager: true });
function anchorsInSource(): Set<string> {
  const found = new Set<string>();
  for (const text of Object.values(SOURCES)) {
    for (const m of text.matchAll(/data-tour="([a-z0-9-]+)"/g)) found.add(m[1]!);
  }
  return found;
}

describe("tour steps", () => {
  it("have unique ids, a title and text", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body).toBeTruthy();
    }
  });

  it("only point at parts of the screen that exist in the app", () => {
    const anchors = anchorsInSource();
    expect(anchors.size).toBeGreaterThan(10);
    for (const step of TOUR_STEPS) {
      if (step.target !== null) expect(anchors, `step ${step.id}`).toContain(step.target);
    }
  });
});
