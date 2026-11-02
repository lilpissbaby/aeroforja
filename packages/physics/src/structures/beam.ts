/**
 * Half wing as an Euler–Bernoulli cantilever clamped at the plane of
 * symmetry (mini-design 007): bending moment from point loads, stress in a
 * solid flat plate, deflection by double integration of the curvature, and
 * the first bending frequency by matrix iteration (Stodola–Vianello).
 *
 * References: Megson, T. H. G. (2017). Aircraft Structures for Engineering
 * Students, 6th ed., Butterworth-Heinemann, ch. 16 (bending of open beams);
 * Timoshenko, S., Young, D. H., Weaver, W. (1974). Vibration Problems in
 * Engineering, 4th ed., Wiley, §5.3 (cantilever modes) and §1.9 (Rayleigh–Stodola).
 */

export interface BeamLoad {
  /** Span position, m (0 at the root). */
  readonly y: number;
  /** Force, N, positive up. */
  readonly force: number;
}

export interface PlateBeam {
  /** Stations from the root (0) to the tip, m, increasing. */
  readonly stations: readonly number[];
  /** Chord at each station, m. */
  readonly chord: readonly number[];
  /** Plate thickness, m. */
  readonly thickness: number;
}

/** Bending moment at each station from point loads outboard of it, N·m (positive: tip bent up). */
export function bendingMoments(beam: PlateBeam, loads: readonly BeamLoad[]): Float64Array {
  const m = new Float64Array(beam.stations.length);
  beam.stations.forEach((y, j) => {
    let s = 0;
    for (const l of loads) if (l.y > y) s += l.force * (l.y - y);
    m[j] = s;
  });
  return m;
}

/** Bending stress at the surface of a solid rectangular plate, σ = 6 M / (c t²), Pa. */
export function plateStress(moment: number, chord: number, thickness: number): number {
  return (6 * moment) / (chord * thickness * thickness);
}

/** Second moment of area of the plate section about its chordwise axis, I = c t³ / 12, m⁴. */
export function plateInertia(chord: number, thickness: number): number {
  return (chord * thickness ** 3) / 12;
}

/** Deflection at each station (m, up) for the moments given there: w'' = M / (E I), w(0) = w'(0) = 0, trapezoidal rule. */
export function deflection(beam: PlateBeam, moments: ArrayLike<number>, youngModulus: number): Float64Array {
  const n = beam.stations.length;
  const slope = new Float64Array(n);
  const w = new Float64Array(n);
  const k = (j: number) => moments[j]! / (youngModulus * plateInertia(beam.chord[j]!, beam.thickness));
  for (let j = 1; j < n; j++) {
    const h = beam.stations[j]! - beam.stations[j - 1]!;
    slope[j] = slope[j - 1]! + (h / 2) * (k(j - 1) + k(j));
    w[j] = w[j - 1]! + (h / 2) * (slope[j - 1]! + slope[j]!);
  }
  return w;
}

/**
 * First bending frequency, Hz, of the cantilever with point masses `mass`
 * (kg) at `stations` (one per station; the root one is ignored), by matrix
 * iteration: the deflection under inertia loads m·w converges to the first
 * mode, and ω² = Σ m w w' / Σ m w'² (Rayleigh quotient).
 */
export function firstBendingFrequency(beam: PlateBeam, mass: ArrayLike<number>, youngModulus: number): number {
  const n = beam.stations.length;
  let w = Float64Array.from(beam.stations, (y) => y * y);
  let omega2 = 0;
  for (let it = 0; it < 60; it++) {
    const loads = beam.stations.map((y, j) => ({ y, force: mass[j]! * w[j]! }));
    const next = deflection(beam, bendingMoments(beam, loads), youngModulus);
    let num = 0, den = 0;
    for (let j = 0; j < n; j++) {
      num += mass[j]! * w[j]! * next[j]!;
      den += mass[j]! * next[j]! * next[j]!;
    }
    const estimate = num / den;
    const tip = next[n - 1]!;
    w = next.map((v) => v / tip);
    if (Math.abs(estimate - omega2) <= 1e-12 * estimate) {
      omega2 = estimate;
      break;
    }
    omega2 = estimate;
  }
  return Math.sqrt(omega2) / (2 * Math.PI);
}
