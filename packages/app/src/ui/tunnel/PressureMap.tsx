/**
 * ΔCp of every VLM panel of the horizontal surfaces, seen from above (nose
 * up, as the planta), on a diverging scale: one hue for lift-producing jumps,
 * the other for negative ones, neutral grey at zero. Hover gives the value.
 */
import { useMemo, useState } from "react";
import type { PanelPressure, TunnelSweep } from "@aeroforja/physics";
import { formatFixed } from "../../units/display.ts";

const W = 360;
const H = 260;

/** Diverging ramp: neutral grey at 0, warm (MDF) for positive, cool (blue) for negative. */
function color(v: number, max: number): string {
  const t = Math.max(-1, Math.min(1, max > 0 ? v / max : 0));
  const neutral = [176, 184, 182];
  const warm = [143, 76, 30];
  const cool = [32, 92, 140];
  const end = t >= 0 ? warm : cool;
  const k = Math.abs(t) ** 0.8;
  const c = neutral.map((n, i) => Math.round(n + (end[i]! - n) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function PressureMap({ sweep }: { sweep: TunnelSweep }) {
  const [hover, setHover] = useState<number | null>(null);
  const horizontal = useMemo(
    () => sweep.pressures.map((p, i) => ({ p, i })).filter(({ p }) => Math.abs(p.corners[0][2] - p.corners[2][2]) < 1e-9 && Math.abs(p.corners[0][1] - p.corners[1][1]) > 0),
    [sweep],
  );
  if (horizontal.length === 0) return <p className="hint">Sin superficies horizontales: no hay mapa de ΔCp.</p>;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let max = 0;
  for (const { p } of horizontal) {
    for (const c of p.corners) {
      minX = Math.min(minX, c[0]);
      maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]);
      maxY = Math.max(maxY, c[1]);
    }
    // The leading-edge row carries a singular ΔCp; the 95th percentile keeps the scale readable.
  }
  const values = horizontal.map(({ p }) => Math.abs(p.dCp)).sort((a, b) => a - b);
  max = values[Math.floor(0.95 * (values.length - 1))] ?? 1;
  const scale = Math.min((W - 20) / (maxY - minY || 1), (H - 40) / (maxX - minX || 1));
  // Planta: screen x = y, screen y = −x (nose up).
  const sx = (y: number) => W / 2 + (y - (minY + maxY) / 2) * scale;
  const sy = (x: number) => 14 + (maxX - x) * scale;
  const pts = (p: PanelPressure) => p.corners.map((c) => `${sx(c[1]).toFixed(1)},${sy(c[0]).toFixed(1)}`).join(" ");
  const hovered = hover === null ? null : sweep.pressures[hover]!;
  return (
    <figure className="chart">
      <figcaption>
        ΔCp por panel a α = {formatFixed((sweep.spanLoadAlpha * 180) / Math.PI, 0)}° (vista en planta, morro arriba)
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de salto de presión por panel" onPointerLeave={() => setHover(null)}>
        {horizontal.map(({ p, i }) => (
          <polygon key={i} points={pts(p)} fill={color(p.dCp, max)} className="cp-cell" onPointerEnter={() => setHover(i)} />
        ))}
        {hovered !== null && (
          <g className="tip" transform={`translate(8, ${H - 30})`}>
            <rect width={170} height={22} rx={3} />
            <text x={6} y={15}>
              ΔCp = {formatFixed(hovered.dCp, 3)} {Math.abs(hovered.dCp) > max ? "(fuera de escala)" : ""}
            </text>
          </g>
        )}
      </svg>
      <div className="legend scale">
        <span>{formatFixed(-max, 2)}</span>
        <span className="ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${color(-max, max)}, ${color(0, max)}, ${color(max, max)})` }} />
        <span>+{formatFixed(max, 2)}</span>
        <span className="hint">positivo: empuja hacia arriba. Escala al percentil 95: el borde de ataque de una placa plana es singular.</span>
      </div>
    </figure>
  );
}
