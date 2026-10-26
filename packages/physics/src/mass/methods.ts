import type { Method } from "../core/result.ts";

export const RIGID_BODY_MASS_PROPERTIES: Method = {
  id: "rigid-body-mass-properties",
  name: "Mass, centre of gravity and inertia tensor of a rigid assembly (parallel-axis theorem)",
  references: [
    {
      citation:
        "Goldstein, H., Poole, C., Safko, J. (2002). Classical Mechanics, 3rd ed., Addison-Wesley, ch. 5 (inertia tensor, parallel-axis theorem).",
    },
    {
      citation:
        "Stevens, B. L., Lewis, F. L., Johnson, E. N. (2016). Aircraft Control and Simulation, 3rd ed., Wiley (body axes and inertia sign convention).",
    },
  ],
};

export const HOMOGENEOUS_SOLID_INERTIA: Method = {
  id: "homogeneous-solid-inertia",
  name: "Moments of inertia of homogeneous solids (box, cylinder, tube, sphere)",
  references: [
    {
      citation:
        "Meriam, J. L., Kraige, L. G., Bolton, J. N. Engineering Mechanics: Dynamics, Wiley, Appendix D (properties of homogeneous solids).",
    },
  ],
};

export const PRINCIPAL_AXES_JACOBI: Method = {
  id: "principal-axes-jacobi",
  name: "Principal moments and axes by cyclic Jacobi rotations of the symmetric inertia tensor",
  references: [
    {
      citation:
        "Press, W. H., Teukolsky, S. A., Vetterling, W. T., Flannery, B. P. (2007). Numerical Recipes, 3rd ed., Cambridge University Press, section 11.1.",
    },
  ],
};

export const GUM_FIRST_ORDER: Method = {
  id: "gum-first-order",
  name: "First-order propagation of independent standard uncertainties (law of propagation of uncertainty)",
  references: [
    {
      citation:
        "JCGM 100:2008, Evaluation of measurement data - Guide to the expression of uncertainty in measurement (GUM), section 5.1.",
      url: "https://www.bipm.org/en/committees/jc/jcgm/publications",
    },
  ],
};
