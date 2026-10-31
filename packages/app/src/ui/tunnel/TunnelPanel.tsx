/**
 * Virtual wind tunnel (mini-design 004): α sweep of the design as drawn and
 * weighed. Lift and moments by the vortex-lattice method (CALCULATED),
 * parasite drag by component build-up (ESTIMATED), neutral point and static
 * margin, six-component balance, spanwise load and ΔCp map. Everything
 * beyond |α| = 5° is marked amber and beyond 10° red: stall is not modelled.
 */
import { useMemo, useState } from "react";
import type { TunnelPoint, TunnelSweep } from "@aeroforja/physics";
import { useAppStore } from "../../state/store.ts";
import { formatFixed, formatScientific, toDegrees } from "../../units/display.ts";
import { download, fileSafe } from "../download.ts";
import { NumberField } from "../NumberField.tsx";
import { MethodDetails, ProvenanceTag, ValidityBadge } from "../ResultMeta.tsx";
import { checkText } from "../../i18n/es.ts";
import { LineChart, type ChartSeries } from "./LineChart.tsx";
import { PressureMap } from "./PressureMap.tsx";

const LEVEL_TEXT = { green: "zona lineal validada", amber: "fuera de lo validado", red: "pérdida probable, no modelada" } as const;

const deg = (rad: number) => toDegrees(rad);
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : formatFixed(v, d));

function Settings() {
  const s = useAppStore((st) => st.tunnelSettings);
  const set = useAppStore((st) => st.setTunnelSettings);
  const run = useAppStore((st) => st.runTunnel);
  const running = useAppStore((st) => st.tunnel.running);
  return (
    <section className="panel-section tunnel-settings" data-tour="tunnel-settings">
      <h3>Ensayo</h3>
      <div className="grid-2">
        <NumberField label="Velocidad" unit="m/s" value={s.speed} decimals={1} min={0} exclusiveMin onCommit={(v) => v !== null && set({ speed: v })} />
        <NumberField label="Interferencia Q" unit="" value={s.interference} decimals={2} min={0} exclusiveMin onCommit={(v) => v !== null && set({ interference: v })} />
        <NumberField label="α mínimo" unit="°" value={s.alphaMin} decimals={1} min={-30} max={30} onCommit={(v) => v !== null && set({ alphaMin: v })} />
        <NumberField label="α máximo" unit="°" value={s.alphaMax} decimals={1} min={-30} max={30} onCommit={(v) => v !== null && set({ alphaMax: v })} />
        <NumberField label="Paso de α" unit="°" value={s.alphaStep} decimals={2} min={0.1} max={10} onCommit={(v) => v !== null && set({ alphaStep: v })} />
        <NumberField label="Franjas por semiala" unit="" value={s.spanwiseStrips} decimals={0} min={2} max={80} onCommit={(v) => v !== null && set({ spanwiseStrips: Math.round(v) })} />
        <NumberField label="Paneles en cuerda" unit="" value={s.chordwisePanels} decimals={0} min={1} max={20} onCommit={(v) => v !== null && set({ chordwisePanels: Math.round(v) })} />
      </div>
      <label className="inline check">
        <input type="checkbox" checked={s.massBlocks} onChange={(e) => set({ massBlocks: e.target.checked })} />
        <span>Bloques del modelo de masas como cuerpos romos</span>
      </label>
      <div className="row">
        <button type="button" className="button primary" onClick={run} disabled={running}>
          {running ? "Ensayando…" : "Ensayar"}
        </button>
      </div>
      <p className="hint">El ensayo se repite solo al cambiar el diseño mientras esta vista está abierta. Hélices paradas y sin modelar.</p>
    </section>
  );
}

function Summary({ sweep }: { sweep: TunnelSweep }) {
  const r = sweep.reference;
  const s = sweep.summary;
  if (r === null || s === null) {
    return (
      <section className="panel-section">
        <h3>Resultado</h3>
        <p className="hint">Sin ala dibujada: no hay coeficientes de sustentación. Resistencia del conjunto en avance:</p>
        <dl className="values">
          <dt>D/q (área de resistencia)</dt>
          <dd className="num">
            {formatFixed(sweep.dragArea * 1e4, 1)}
            <span className="u">cm²</span>
          </dd>
        </dl>
        <ProvenanceTag provenance="ESTIMATED" />
      </section>
    );
  }
  const stable = s.staticMargin > 0;
  return (
    <section className="panel-section" data-tour="tunnel-summary">
      <h3>Resultado</h3>
      <div className={`verdict ${stable ? (s.staticMargin >= 0.05 ? "ok" : "warn") : "bad"}`}>
        <b>{stable ? (s.staticMargin >= 0.05 ? "Estable en cabeceo" : "Estable, con poco margen") : "Inestable en cabeceo"}</b>
        <span>
          Margen estático {formatFixed(s.staticMargin * 100, 1)} % de c̄ · punto neutro al {formatFixed(s.neutralPointMac * 100, 1)} % de la CMA, CG al{" "}
          {formatFixed(s.cgMac * 100, 1)} %
        </span>
        {!stable && <span>El CG está detrás del punto neutro: el aparato no vuelve solo a su ángulo. Adelanta el CG o añade estabilizador.</span>}
      </div>
      <p className="provenance-line">
        Sustentación y momentos <ProvenanceTag provenance="CALCULATED" /> · resistencia parásita <ProvenanceTag provenance="ESTIMATED" />
      </p>
      <dl className="values tunnel-values">
        <dt>CLα</dt>
        <dd className="num">
          {f(s.CLalpha)}
          <span className="u">1/rad</span>
        </dd>
        <dt>CL₀</dt>
        <dd className="num">{f(s.CL0, 4)}</dd>
        <dt>CD₀ (parásita)</dt>
        <dd className="num">
          {f(s.CD0, 4)} <span className="u">({f(s.CD0Low, 4)} – {f(s.CD0High, 4)})</span>
        </dd>
        <dt>e (Oswald del VLM)</dt>
        <dd className="num">{f(s.oswald)}</dd>
        <dt>L/D máx. (|α| ≤ 10°)</dt>
        <dd className="num">
          {f(s.maxLD, 1)} <span className="u">a α = {f(deg(s.alphaMaxLD), 1)}°</span>
        </dd>
        <dt>x punto neutro</dt>
        <dd className="num">
          {f(s.neutralPointX * 1000, 1)}
          <span className="u">mm</span>
        </dd>
        <dt>S · b · AR</dt>
        <dd className="num">
          {f(r.area * 1e4, 1)} cm² · {f(r.span * 1000, 0)} mm · {f(r.aspectRatio, 2)}
        </dd>
        <dt>c̄ (CMA)</dt>
        <dd className="num">
          {f(r.mac * 1000, 1)}
          <span className="u">mm</span>
        </dd>
        <dt>Paneles</dt>
        <dd className="num">{sweep.panelCount}</dd>
      </dl>
    </section>
  );
}

function Balance({ point }: { point: TunnelPoint }) {
  const row = (label: string, v: number, unit: string) => (
    <>
      <dt>{label}</dt>
      <dd className="num">
        {formatFixed(v, 3)}
        <span className="u">{unit}</span>
      </dd>
    </>
  );
  return (
    <div>
      <h4>Balanza a α = {formatFixed(deg(point.alpha), 1)}° (ejes cuerpo, respecto al CG)</h4>
      <dl className="values">
        {row("Fx (adelante)", point.force[0], "N")}
        {row("Fy (derecha)", point.force[1], "N")}
        {row("Fz (abajo)", point.force[2], "N")}
        {row("L (alabeo)", point.moment[0], "N·m")}
        {row("M (cabeceo)", point.moment[1], "N·m")}
        {row("N (guiñada)", point.moment[2], "N·m")}
        {row("Sustentación", point.lift, "N")}
        {row("Resistencia", point.drag, "N")}
      </dl>
    </div>
  );
}

function csv(sweep: TunnelSweep): string {
  const head = "alpha_deg,validity,CL,CDi,CD0,CD,Cm,LD,lift_N,drag_N,Fx_N,Fy_N,Fz_N,L_Nm,M_Nm,N_Nm";
  const n = (v: number | null) => (v === null ? "" : String(v));
  const rows = sweep.points.map((p) =>
    [deg(p.alpha), p.level, n(p.CL), n(p.CDi), n(p.CD0), n(p.CD), n(p.Cm), n(p.LD), p.lift, p.drag, ...p.force, ...p.moment].join(","),
  );
  return [
    "# AeroForja virtual tunnel. Lift: VLM (CALCULATED). Drag: component build-up (ESTIMATED). Moments about the CG, body axes FRD, SI.",
    head,
    ...rows,
  ].join("\n");
}

export function TunnelPanel({ theme }: { theme: "light" | "dark" }) {
  const tunnel = useAppStore((s) => s.tunnel);
  const projectName = useAppStore((s) => s.projectName);
  const [picked, setPicked] = useState<number | null>(null);
  const response = tunnel.response;
  const sweep = response !== null && response.sweep.ok ? response.sweep.result : null;

  const charts = useMemo(() => {
    if (sweep === null) return null;
    const v = sweep.value;
    const pts = (y: (p: TunnelPoint) => number | null, x: (p: TunnelPoint) => number | null = (p) => deg(p.alpha)) =>
      v.points.flatMap((p) => {
        const yv = y(p);
        const xv = x(p);
        return yv === null || xv === null || !Number.isFinite(yv) ? [] : [{ x: xv, y: yv, level: p.level }];
      });
    const span = v.spanLoad.filter((s) => s.elliptic !== null);
    const spanSeries: ChartSeries[] = [
      { name: "VLM", points: span.map((s) => ({ x: s.s * 1000, y: s.load })) },
      { name: "Elíptica (misma sustentación)", points: span.map((s) => ({ x: s.s * 1000, y: s.elliptic! })), dashed: true, muted: true },
    ];
    return {
      cl: [{ name: "CL", points: pts((p) => p.CL) }],
      cm: [{ name: "Cm (CG)", points: pts((p) => p.Cm) }],
      polar: [{ name: "CD", points: pts((p) => p.CD, (p) => p.CL).map((q) => ({ x: q.y, y: q.x, level: q.level })) }],
      ld: [{ name: "L/D", points: pts((p) => p.LD) }],
      drag: [{ name: "Resistencia", points: pts((p) => p.drag) }],
      span: spanSeries,
    };
  }, [sweep]);

  if (sweep === null || charts === null) {
    return (
      <div className="tunnel" data-theme-hint={theme}>
        <aside className="tunnel-side">
          <Settings />
        </aside>
        <div className="tunnel-main">
          <p className="hint tunnel-empty">
            {tunnel.running
              ? "Ensayando…"
              : tunnel.error ?? (response !== null && !response.sweep.ok ? response.sweep.message : "Pulsa «Ensayar» para el primer barrido.")}
          </p>
        </div>
      </div>
    );
  }
  const v = sweep.value;
  const index = picked ?? Math.max(0, v.points.findIndex((p) => Math.abs(p.alpha - v.spanLoadAlpha) < 1e-9));
  const point = v.points[index] ?? v.points[0]!;
  const hasCoefficients = v.reference !== null;

  return (
    <div className="tunnel">
      <aside className="tunnel-side">
        <Settings />
        <Summary sweep={v} />
        <section className="panel-section">
          <h3>Validez</h3>
          <ValidityBadge level={sweep.validity.level} />
          <ul className="checks">
            {sweep.validity.checks.map((c) => (
              <li key={c.quantity} className={c.level}>
                <b>{checkText(c).label}:</b> {c.unit === "1" && c.quantity !== "parasiteDragCalibration" ? formatScientific(c.value, 3) : c.quantity === "parasiteDragCalibration" ? "" : `${formatFixed(c.value, 2)} ${c.unit}`}{" "}
                <span className="hint">{checkText(c).note}</span>
              </li>
            ))}
          </ul>
          {[...tunnel.notes, ...v.notes].map((n) => (
            <p key={n} className="hint">
              {n}
            </p>
          ))}
          <p className="hint">
            Calculado en {formatFixed(response!.elapsed / 1000, 2)} s.{" "}
            <button type="button" className="link-button" onClick={() => download(`${fileSafe(projectName)}-tunel.csv`, csv(v), "text/csv")}>
              Descargar CSV
            </button>
          </p>
          <MethodDetails result={sweep} />
        </section>
      </aside>
      <div className="tunnel-main">
        <div className="alpha-legend" aria-label="Leyenda de validez">
          {(["green", "amber", "red"] as const).map((l) => (
            <span key={l} className={`pill ${l}`}>
              <span className="dot" aria-hidden="true">
                {l === "green" ? "✓" : l === "amber" ? "!" : "✕"}
              </span>
              {l === "green" ? "|α| ≤ 5°" : l === "amber" ? "5° < |α| ≤ 10°" : "|α| > 10°"}: {LEVEL_TEXT[l]}
            </span>
          ))}
        </div>
        <div className="chart-grid">
          {hasCoefficients ? (
            <>
              <LineChart title="Sustentación" series={charts.cl} xLabel="α (°)" yLabel="CL" alphaBands marker={deg(point.alpha)} />
              <LineChart title="Momento de cabeceo respecto al CG" series={charts.cm} xLabel="α (°)" yLabel="Cm" alphaBands marker={deg(point.alpha)} />
              <LineChart title="Polar" series={charts.polar} xLabel="CD" yLabel="CL" />
              <LineChart title="Eficiencia" series={charts.ld} xLabel="α (°)" yLabel="L/D" alphaBands marker={deg(point.alpha)} />
              {charts.span[0]!.points.length > 0 && (
                <LineChart
                  title={`Carga en envergadura a α = ${formatFixed(deg(v.spanLoadAlpha), 0)}°`}
                  series={charts.span}
                  xLabel="y (mm)"
                  yLabel="N/m"
                />
              )}
              <PressureMap sweep={v} />
            </>
          ) : (
            <LineChart title="Resistencia del conjunto" series={charts.drag} xLabel="α (°)" yLabel="D (N)" alphaBands marker={deg(point.alpha)} />
          )}
        </div>
        <section className="panel-section balance" data-tour="tunnel-balance">
          <label className="inline">
            <span>α de la balanza</span>
            <input
              type="range"
              min={0}
              max={v.points.length - 1}
              value={index}
              onChange={(e) => setPicked(Number(e.target.value))}
              aria-valuetext={`${formatFixed(deg(point.alpha), 1)} grados`}
            />
            <span className={`pill ${point.level}`}>{formatFixed(deg(point.alpha), 1)}°</span>
          </label>
          <div className="columns">
            <Balance point={point} />
            <div>
              <h4>Resistencia por componentes (D/q)</h4>
              <table className="drag-table">
                <thead>
                  <tr>
                    <th scope="col">Componente</th>
                    <th scope="col">D/q (cm²)</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.components]
                    .sort((a, b) => b.dragArea - a.dragArea)
                    .map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td className="num">{formatFixed(c.dragArea * 1e4, 2)}</td>
                        <td className="hint">
                          {c.kind === "friction"
                            ? `Re ${formatScientific(c.reynolds ?? 0, 2)}, ${c.regime === "laminar" ? "laminar" : "turbulenta"}, Cf ${formatFixed(c.cf ?? 0, 4)}, FF ${formatFixed(c.formFactor ?? 0, 3)}`
                            : `Cd ${formatFixed(c.cd ?? 0, 3)}`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
