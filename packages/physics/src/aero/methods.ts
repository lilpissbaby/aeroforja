import type { Method, Reference } from "../core/result.ts";

const KATZ_PLOTKIN: Reference = {
  citation: "Katz, J., Plotkin, A. (2001). Low-Speed Aerodynamics, 2nd ed., Cambridge University Press, sec. 10.4 (Biot–Savart for a straight vortex segment) and 12.2–12.3 (vortex-lattice method).",
};

export const VORTEX_LATTICE: Method = {
  id: "vortex-lattice-horseshoe",
  name: "Vortex-lattice method with horseshoe vortices: bound segment at 1/4 of each panel, control point at 3/4, trailing legs along body −x",
  references: [
    KATZ_PLOTKIN,
    { citation: "Bertin, J. J., Cummings, R. M. (2014). Aerodynamics for Engineers, 6th ed., Pearson, sec. 7.4 (vortex-lattice method)." },
  ],
};

export const KUTTA_JOUKOWSKI_FORCES: Method = {
  id: "kutta-joukowski-panel-forces",
  name: "Panel forces from the Kutta–Joukowski theorem on each bound segment, F = ρ Γ (V × l), moments about the centre of gravity",
  references: [KATZ_PLOTKIN],
};

export const TREFFTZ_INDUCED_DRAG: Method = {
  id: "trefftz-plane-induced-drag",
  name: "Induced drag in the Trefftz plane from the trailing vorticity, D_i = −½ ρ Σ Γ (w·n) Δs",
  references: [
    { citation: "Drela, M. (2014). Flight Vehicle Aerodynamics, MIT Press, sec. 5.5 (Trefftz-plane analysis) and ch. 6." },
  ],
};

export const SKIN_FRICTION_FLAT_PLATE: Method = {
  id: "flat-plate-skin-friction",
  name: "Smooth flat-plate skin friction: Blasius (laminar) Cf = 1.328/√Re, Prandtl–Schlichting (turbulent) Cf = 0.455/(log10 Re)^2.58",
  references: [
    { citation: "Blasius, H. (1908). Grenzschichten in Flüssigkeiten mit kleiner Reibung. Z. Math. Phys. 56, 1–37." },
    { citation: "Schlichting, H., Gersten, K. (2017). Boundary-Layer Theory, 9th ed., Springer, ch. 6 and 18 (flat-plate friction laws)." },
    { citation: "Raymer, D. P. (2018). Aircraft Design: A Conceptual Approach, 6th ed., AIAA, eqs. 12.25–12.27." },
  ],
};

export const COMPONENT_DRAG_BUILDUP: Method = {
  id: "component-drag-buildup",
  name: "Parasite drag by component build-up, CD0 = Σ Cf·FF·Q·S_wet / S_ref + Σ (D/q) / S_ref",
  references: [
    { citation: "Raymer, D. P. (2018). Aircraft Design: A Conceptual Approach, 6th ed., AIAA, sec. 12.5 (component build-up method), eq. 12.30 (form factor of a thin section)." },
  ],
};

export const BLUFF_BODY_DRAG: Method = {
  id: "bluff-body-drag-coefficients",
  name: "Drag of bluff and streamlined shapes, (D/q) = Cd · A_frontal, with low-speed wind-tunnel Cd values",
  references: [
    {
      citation: "NASA Glenn Research Center, Beginner's Guide to Aeronautics: Shape Effects on Drag (subsonic wind-tunnel values, frontal-area reference).",
      url: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/shape-effects-on-drag/",
    },
  ],
};

export const NEUTRAL_POINT: Method = {
  id: "neutral-point-static-margin",
  name: "Stick-fixed neutral point from the slope dCm/dCL of the linear range and static margin SM = (x_CG − x_NP)/c̄ (FRD, x forward)",
  references: [
    { citation: "Etkin, B., Reid, L. D. (1996). Dynamics of Flight: Stability and Control, 3rd ed., Wiley, sec. 2.3 (neutral point and static margin)." },
  ],
};
