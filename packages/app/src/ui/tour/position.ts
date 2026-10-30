/**
 * Where the guided tour's card goes: next to the highlighted part of the
 * screen, inside the window, and never on top of it when there is room.
 * Pure, so it is tested without a browser.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Side = "right" | "left" | "bottom" | "top";
export type Placement = Side | "center" | "dock";

export interface CardPosition {
  readonly x: number;
  readonly y: number;
  readonly placement: Placement;
}

/** Below this width the card docks to the bottom of the screen. */
export const DOCK_BELOW = 640;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Tries the preferred sides first, then the rest. A side works when the card
 * fits between the target and the window edge; along the other axis the card
 * is centred on the target and kept inside the window. When nothing fits
 * (a target that fills the screen) the card goes to the bottom-right corner,
 * over the target.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  viewport: Size,
  preferred: readonly Side[] = ["right", "bottom", "left", "top"],
  gap = 14,
  margin = 12,
): CardPosition {
  if (viewport.width < DOCK_BELOW) {
    // Phones: full width, at the bottom, or at the top when the target is in the lower half.
    const lower = target !== null && target.y + target.height / 2 > viewport.height / 2;
    return { x: margin, y: lower ? margin : Math.max(margin, viewport.height - card.height - margin), placement: "dock" };
  }
  if (target === null) {
    return {
      x: Math.max(margin, (viewport.width - card.width) / 2),
      y: Math.max(margin, (viewport.height - card.height) / 2),
      placement: "center",
    };
  }
  const order: Side[] = [...preferred, ...(["right", "bottom", "left", "top"] as const).filter((s) => !preferred.includes(s))];
  const maxX = viewport.width - card.width - margin;
  const maxY = viewport.height - card.height - margin;
  const centredX = clamp(target.x + target.width / 2 - card.width / 2, margin, maxX);
  const centredY = clamp(target.y + target.height / 2 - card.height / 2, margin, maxY);
  for (const side of order) {
    switch (side) {
      case "right": {
        const x = target.x + target.width + gap;
        if (x <= maxX) return { x, y: centredY, placement: side };
        break;
      }
      case "left": {
        const x = target.x - gap - card.width;
        if (x >= margin) return { x, y: centredY, placement: side };
        break;
      }
      case "bottom": {
        const y = target.y + target.height + gap;
        if (y <= maxY) return { x: centredX, y, placement: side };
        break;
      }
      case "top": {
        const y = target.y - gap - card.height;
        if (y >= margin) return { x: centredX, y, placement: side };
        break;
      }
    }
  }
  return { x: Math.max(margin, maxX), y: Math.max(margin, maxY), placement: "center" };
}
