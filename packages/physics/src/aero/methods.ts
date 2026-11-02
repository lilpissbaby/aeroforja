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

export const UNSTEADY_VORTEX_LATTICE: Method = {
  id: "uvlm-linear-frozen-wake",
  name: "Linearised unsteady vortex-lattice method: vortex rings on the steady lattice, flat wake frozen in body axes and convected at V∞, unsteady Kutta–Joukowski loads",
  references: [
    { citation: "Katz, J., Plotkin, A. (2001). Low-Speed Aerodynamics, 2nd ed., Cambridge University Press, §12.3 (vortex rings) and §13.12 (unsteady motion of a three-dimensional wing), eq. 13.150." },
    { citation: "Murua, J., Palacios, R., Graham, J. M. R. (2012). Applications of the unsteady vortex-lattice method in aircraft aeroelasticity and flight dynamics. Progress in Aerospace Sciences 55, 46–72." },
  ],
};

export const DISCRETE_GUST: Method = {
  id: "discrete-gust-one-minus-cosine",
  name: "Discrete vertical gust 1 − cos, w = (U_ds/2)(1 − cos(π s/H)) for 0 ≤ s ≤ 2H, met by each panel at its own x (penetration)",
  references: [
    { citation: "MIL-F-8785C (1980). Flying Qualities of Piloted Airplanes, discrete gust model; MIL-HDBK-1797 (1997)." },
    { citation: "EASA CS-25.341(a) (gust shape U = (U_ds/2)[1 − cos(π s/H)])." },
    { citation: "Wright, J. R., Cooper, J. E. (2015). Introduction to Aircraft Aeroelasticity and Loads, 2nd ed., Wiley, ch. 16 (gust and turbulence encounters)." },
  ],
};

export const RIGID_LONGITUDINAL: Method = {
  id: "rigid-heave-pitch",
  name: "Rigid aircraft in vertical and pitch motion at constant forward speed, perturbation about trimmed 1 g flight, implicit trapezoidal integration of the joint aerodynamic and motion system",
  references: [
    { citation: "Wright, J. R., Cooper, J. E. (2015). Introduction to Aircraft Aeroelasticity and Loads, 2nd ed., Wiley, ch. 14 and 16." },
    { citation: "Newmark, N. M. (1959). A method of computation for structural dynamics. Journal of the Engineering Mechanics Division 85(3), 67–94 (average acceleration)." },
  ],
};

export const PRATT_WALKER: Method = {
  id: "pratt-walker-gust-formula",
  name: "Pratt–Walker gust load formula, Δn = ρ V a K_g U / (2 W/S), K_g = 0.88 μ_g / (5.3 + μ_g), μ_g = 2 (W/S) / (ρ c̄ a g)",
  references: [{ citation: "Pratt, K. G., Walker, W. G. (1954). A revised gust-load formula and a re-evaluation of V-G data taken on civil transport airplanes from 1933 to 1950. NACA Report 1206." }],
};

export const PLATE_BENDING: Method = {
  id: "cantilever-plate-bending",
  name: "Half wing as an Euler–Bernoulli cantilever clamped at the plane of symmetry: bending moment with inertia relief, σ = 6M/(c t²) in a solid plate, deflection from w'' = M/(EI), first frequency by matrix iteration",
  references: [
    { citation: "Megson, T. H. G. (2017). Aircraft Structures for Engineering Students, 6th ed., Butterworth-Heinemann, ch. 16." },
    { citation: "Timoshenko, S., Young, D. H., Weaver, W. (1974). Vibration Problems in Engineering, 4th ed., Wiley, §1.9 and §5.3." },
  ],
};
