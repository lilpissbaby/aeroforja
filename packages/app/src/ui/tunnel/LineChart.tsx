/**
 * Small SVG line chart for the tunnel: one axis pair, thin lines, point
 * markers coloured by validity, hover read-out. When x is the angle of
 * attack, the bands beyond the validated range are shaded and labelled, so
 * colour is never the only cue.
 */
import { useId, useMemo, useState } from "react";

export type Level = "green" | "amber" | "red";

export interface ChartSeries {
  readonly name: string;
  readonly points: readonly { readonly x: number; readonly y: number; readonly level?: Level }[];
  readonly dashed?: boolean;
  /** Second series in a chart: muted ink. */
  readonly muted?: boolean;
}

export interface LineChartProps {
  readonly title: string;
  readonly series: readonly ChartSeries[];
  readonly xLabel: string;
  readonly yLabel: string;
  readonly xFormat?: (v: number) => string;
  readonly yFormat?: (v: number) => string;
  /** Shade |x| > 5 (amber) and |x| > 10 (red): x is α in degrees. */
  readonly alphaBands?: boolean;
  /** Mark a vertical line (selected α). */
  readonly marker?: number | null;
}

const W = 360;
const H = 220;
const M = { l: 46, r: 12, t: 12, b: 34 };

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) {
    const d = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    return niceTicks(lo - d, hi + d, count);
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const fmt = (v: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(v);

export function LineChart({ title, series, xLabel, yLabel, xFormat = fmt, yFormat = fmt, alphaBands = false, marker = null }: LineChartProps) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const scales = useMemo(() => {
    const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (all.length === 0) return null;
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const xt = niceTicks(Math.min(...xs), Math.max(...xs));
    const yt = niceTicks(Math.min(...ys, 0), Math.max(...ys, 0));
    const x0 = Math.min(xt[0]!, Math.min(...xs));
    const x1 = Math.max(xt[xt.length - 1]!, Math.max(...xs));
    const y0 = Math.min(yt[0]!, Math.min(...ys));
    const y1 = Math.max(yt[yt.length - 1]!, Math.max(...ys));
    const X = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
    const Y = (v: number) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
    return { xt, yt, X, Y, x0, x1, y0, y1 };
  }, [series]);

  if (scales === null) {
    return (
      <figure className="chart">
        <figcaption>{title}</figcaption>
        <p className="hint">Sin datos.</p>
      </figure>
    );
  }
  const { xt, yt, X, Y, x0, x1 } = scales;
  const first = series[0]!;
  const hovered = hover === null ? null : first.points[hover] ?? null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    first.points.forEach((p, i) => {
      const d = Math.abs(X(p.x) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${yLabel} frente a ${xLabel}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <clipPath id={clip}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>
        {alphaBands && (
          <g clipPath={`url(#${clip})`} aria-hidden="true">
            {[
              [5, 10, "amber"],
              [10, 90, "red"],
              [-10, -5, "amber"],
              [-90, -10, "red"],
            ].map(([a, b, level]) => {
              const lo = Math.max(Number(a), x0);
              const hi = Math.min(Number(b), x1);
              if (!(hi > lo)) return null;
              return <rect key={`${a}`} x={X(lo)} y={M.t} width={X(hi) - X(lo)} height={H - M.t - M.b} className={`band ${level}`} />;
            })}
          </g>
        )}
        <g className="grid" aria-hidden="true">
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? "zero" : ""} />
              <text x={M.l - 6} y={Y(v) + 3.5} textAnchor="end">
                {yFormat(v)}
              </text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={X(v)} y={H - M.b + 14} textAnchor="middle">
              {xFormat(v)}
            </text>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="axis-title">
            {xLabel}
          </text>
          <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" className="axis-title" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>
            {yLabel}
          </text>
        </g>
        {marker !== null && Number.isFinite(marker) && <line className="marker" x1={X(marker)} x2={X(marker)} y1={M.t} y2={H - M.b} />}
        <g clipPath={`url(#${clip})`}>
          {series.map((s) => (
            <polyline
              key={s.name}
              className={`series${s.dashed === true ? " dashed" : ""}${s.muted === true ? " muted" : ""}`}
              points={s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")}
            />
          ))}
          {first.points.map((p, i) => (
            <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={hover === i ? 4.5 : 3} className={`pt ${p.level ?? "green"}`} />
          ))}
        </g>
        {hovered !== null && (
          <g className="tip" transform={`translate(${Math.min(X(hovered.x) + 8, W - 128)}, ${M.t + 4})`}>
            <rect width={120} height={series.length > 1 ? 46 : 32} rx={3} />
            <text x={6} y={13}>
              {xLabel.split(" ")[0]} {xFormat(hovered.x)}
            </text>
            <text x={6} y={27}>
              {first.name}: {yFormat(hovered.y)}
            </text>
            {series.length > 1 && series[1]!.points[hover!] !== undefined && (
              <text x={6} y={41}>
                {series[1]!.name}: {yFormat(series[1]!.points[hover!]!.y)}
              </text>
            )}
          </g>
        )}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" x2="21" y1="4" y2="4" className={`series${s.dashed === true ? " dashed" : ""}${s.muted === true ? " muted" : ""}`} />
              </svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
