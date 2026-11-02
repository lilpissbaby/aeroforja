import type { Method, Reference } from "@aeroforja/physics";

const KRUGER: Reference = {
  citation: "Krüger, T., Kusumaatmaja, H., Kuzmin, A., Shardt, O., Silva, G., Viggen, E. M. (2017). The Lattice Boltzmann Method: Principles and Practice. Springer, ch. 3–5.",
};

export const LBM_D3Q19: Method = {
  id: "lbm-d3q19-regularized-les",
  name: "Lattice Boltzmann D3Q19, regularized BGK collision with the Smagorinsky subgrid model, FP32 with shifted populations",
  references: [
    { citation: "Qian, Y. H., d'Humières, D., Lallemand, P. (1992). Lattice BGK models for Navier–Stokes equation. Europhysics Letters 17, 479–484." },
    { citation: "Latt, J., Chopard, B. (2006). Lattice Boltzmann method with regularized pre-collision distribution functions. Mathematics and Computers in Simulation 72, 165–168." },
    { citation: "Hou, S., Sterling, J., Chen, S., Doolen, G. D. (1996). A lattice Boltzmann subgrid model for high Reynolds number flows. Fields Institute Communications 6, 151–166." },
    { citation: "Lilly, D. K. (1967). The representation of small-scale turbulence in numerical simulation experiments. Proc. IBM Scientific Computing Symposium on Environmental Sciences, 195–210 (C_s ≈ 0.17)." },
    { citation: "Lehmann, M., Krause, M. J., Amati, G., Sega, M., Harting, J., Gekle, S. (2022). Accuracy and performance of the lattice Boltzmann method with 64-bit, 32-bit, and customized 16-bit number formats. Physical Review E 106, 015308." },
    KRUGER,
  ],
};

export const LBM_BOUNDARIES: Method = {
  id: "lbm-boundaries",
  name: "Half-way bounce-back on voxelized walls; velocity inlet and far field by equilibrium with the density of the inner neighbour; outlet at ρ = 1 with zero velocity gradient",
  references: [
    { citation: "Ladd, A. J. C. (1994). Numerical simulations of particulate suspensions via a discretized Boltzmann equation. Part 1. Journal of Fluid Mechanics 271, 285–309." },
    KRUGER,
  ],
};

export const MOMENTUM_EXCHANGE: Method = {
  id: "lbm-momentum-exchange",
  name: "Forces and moments on the body by momentum exchange on every bounce-back link, ΔF = −2 c_i f_ī",
  references: [
    { citation: "Mei, R., Yu, D., Shyy, W., Luo, L.-S. (2002). Force evaluation in lattice Boltzmann methods involving curved geometry. Physical Review E 65, 041203." },
    { citation: "Ladd, A. J. C. (1994). Journal of Fluid Mechanics 271, 285–309." },
  ],
};

export const VOXELIZATION: Method = {
  id: "voxelization-ray-parity",
  name: "Voxelization by ray parity along x, y and z (thin pieces keep their nearest cell); open meshes by triangle–box overlap",
  references: [{ citation: "Akenine-Möller, T. (2001). Fast 3D triangle-box overlap testing. Journal of Graphics Tools 6(1), 29–33." }],
};

export const TRACERS: Method = {
  id: "massless-tracers",
  name: "Smoke: massless tracers advected with the instantaneous velocity (RK2, trilinear); streamlines integrated with RK4 on the time-averaged velocity",
  references: [KRUGER],
};
