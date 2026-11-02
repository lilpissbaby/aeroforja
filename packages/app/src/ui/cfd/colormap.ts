/**
 * Turbo colour map (Mikhailov 2019, Google AI blog), polynomial fit by
 * Ruofei Du: a perceptually smoother rainbow than jet, the look of the CFD
 * pictures the tunnel imitates. t in [0, 1].
 */
export function turbo(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const r = 0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b = 0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}

export function turboCss(t: number): string {
  const [r, g, b] = turbo(t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

export function turboGradient(steps = 12): string {
  return `linear-gradient(90deg, ${Array.from({ length: steps + 1 }, (_, i) => turboCss(i / steps)).join(", ")})`;
}

/** Robust range of finite values: the 2nd and 98th percentiles. */
export function robustRange(values: Float32Array, lo = 0.02, hi = 0.98): [number, number] {
  const finite: number[] = [];
  const stride = Math.max(1, Math.floor(values.length / 20000));
  for (let i = 0; i < values.length; i += stride) if (Number.isFinite(values[i]!)) finite.push(values[i]!);
  if (finite.length === 0) return [0, 1];
  finite.sort((a, b) => a - b);
  const a = finite[Math.floor(lo * (finite.length - 1))]!;
  const b = finite[Math.floor(hi * (finite.length - 1))]!;
  return b > a ? [a, b] : [a - 1, a + 1];
}
