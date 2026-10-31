/**
 * Skin friction of a smooth flat plate (mini-design 004).
 *
 *   laminar (Blasius):                  Cf = 1.328 / √Re
 *   turbulent (Prandtl–Schlichting):    Cf = 0.455 / (log10 Re)^2.58
 *
 * Cf is the average over a plate of length L, Re = V L / ν. The transition
 * is taken at Re = 5·10⁵ on the whole plate (assumption, smooth plate,
 * no roughness or turbulence in the incoming flow).
 */

export const TRANSITION_REYNOLDS = 5e5;

export const blasiusCf = (re: number): number => {
  if (!(re > 0)) throw new RangeError(`Reynolds number must be positive, got ${re}.`);
  return 1.328 / Math.sqrt(re);
};

export const prandtlSchlichtingCf = (re: number): number => {
  if (!(re > 1)) throw new RangeError(`Reynolds number must be above 1, got ${re}.`);
  return 0.455 / Math.log10(re) ** 2.58;
};

export interface SkinFriction {
  readonly cf: number;
  readonly regime: "laminar" | "turbulent";
}

export function skinFriction(re: number, transition = TRANSITION_REYNOLDS): SkinFriction {
  return re < transition ? { cf: blasiusCf(re), regime: "laminar" } : { cf: prandtlSchlichtingCf(re), regime: "turbulent" };
}

/**
 * Form factor of a thin section, Raymer eq. 12.30:
 *   FF = 1 + 0.6/(x/c)_m · (t/c) + 100 (t/c)⁴
 * with (x/c)_m the chordwise position of maximum thickness (0.5 for a flat plate).
 */
export function thinSectionFormFactor(thicknessRatio: number, maxThicknessPosition = 0.5): number {
  if (!(thicknessRatio >= 0)) throw new RangeError(`Thickness ratio must be non-negative, got ${thicknessRatio}.`);
  if (!(maxThicknessPosition > 0 && maxThicknessPosition < 1)) throw new RangeError("Position of maximum thickness must be in (0, 1).");
  return 1 + (0.6 / maxThicknessPosition) * thicknessRatio + 100 * thicknessRatio ** 4;
}
