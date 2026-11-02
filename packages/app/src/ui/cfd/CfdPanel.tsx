/**
 * The CFD tunnel bench (mini-design 006): test conditions, the run with its
 * progress, the mean six-component balance beside the VLM, the lattice and
 * its validity, the force history and «Validar en tu GPU».
 */
import { useMemo } from "react";
import { CYLINDER_RE1E5, GPU_CASES, SPHERE_RE100, SPHERE_RE1E5, type CfdLoads } from "@aeroforja/cfd-webgpu";
import type { Result } from "@aeroforja/physics";
import { runCfd, stopCfd, validateOnGpu } from "../../cfd/client.ts";
import { useCfdStore } from "../../cfd/store.ts";
import type { CfdPlanSummary } from "../../cfd/protocol.ts";
import { checkText } from "../../i18n/es.ts";
import { useAppStore } from "../../state/store.ts";
import { formatFixed, formatScientific } from "../../units/display.ts";
import { download, fileSafe } from "../download.ts";
import { NumberField } from "../NumberField.tsx";
import { MethodDetails, ProvenanceTag, ValidityBadge } from "../ResultMeta.tsx";
import { LineChart, type ChartSeries } from "../tunnel/LineChart.tsx";
import { CfdView } from "./CfdView.tsx";

const DEG = Math.PI / 180;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : formatFixed(v, d));
const RESOLUTIONS = [
  { cells: 150_000, label: "Vista previa (0,15 M celdas)" },
  { cells: 500_000, label: "Rápida (0,5 M celdas)" },
  { cells: 2_000_000, label: "Normal (2 M celdas)" },
  { cells: 8_000_000, label: "Fina (8 M celdas, ~1,2 GB de VRAM)" },
] as const;
/** Cells across the body for each GPU case in the app. */
const CASE_D: Readonly<Record<string, number>> = { [SPHERE_RE100.id]: 12, [SPHERE_RE1E5.id]: 12, [CYLINDER_RE1E5.id]: 16 };

function Settings() {
  const s = useCfdStore((st) => st.settings);
  const set = useCfdStore((st) => st.setSettings);
  const status = useCfdStore((st) => st.status);
  const busy = status === "planning" || status === "running";
  return (
    <section className="panel-section" data-tour="cfd-settings">
      <h3>Ensayo CFD</h3>
      <div className="grid-2">
        <NumberField label="Velocidad" unit="m/s" value={s.speed} decimals={1} min={0} exclusiveMin max={100} onCommit={(v) => v !== null && set({ speed: v })} />
        <NumberField label="α" unit="°" value={s.alpha / DEG} decimals={1} min={-20} max={20} onCommit={(v) => v !== null && set({ alpha: v * DEG })} />
        <NumberField label="β (derrape)" unit="°" value={s.beta / DEG} decimals={1} min={-20} max={20} onCommit={(v) => v !== null && set({ beta: v * DEG })} />
        <NumberField label="Pasadas por la caja" unit="" value={s.flowThroughs} decimals={1} min={1.5} max={20} onCommit={(v) => v !== null && set({ flowThroughs: v })} />
      </div>
      <label className="field">
        <span>Resolución</span>
        <select value={s.cells} onChange={(e) => set({ cells: Number(e.target.value) })}>
          {RESOLUTIONS.map((r) => (
            <option key={r.cells} value={r.cells}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Avanzado</summary>
        <div className="grid-2">
          <NumberField label="Constante de Smagorinsky" unit="" value={s.smagorinsky} decimals={2} min={0} max={0.3} onCommit={(v) => v !== null && set({ smagorinsky: v })} />
          <NumberField label="Pasadas promediadas" unit="" value={s.averageFlowThroughs} decimals={1} min={0.5} max={s.flowThroughs - 0.5} onCommit={(v) => v !== null && set({ averageFlowThroughs: v })} />
        </div>
        <p className="hint">C_s = 0,17 (Lilly) es el valor aprobado; 0 apaga el modelo de submalla.</p>
      </details>
      <label className="inline check">
        <input type="checkbox" checked={s.massBlocks} onChange={(e) => set({ massBlocks: e.target.checked })} />
        <span>Bloques del modelo de masas como sólidos</span>
      </label>
      <div className="row">
        <button type="button" className="button primary" onClick={runCfd} disabled={busy}>
          {busy ? "Ensayando…" : "Ensayar"}
        </button>
        {busy && (
          <button type="button" className="button" onClick={stopCfd}>
            Detener
          </button>
        )}
      </div>
      <p className="hint">Necesita WebGPU. El cálculo va en la tarjeta gráfica y tarda de segundos a minutos; el resultado no se guarda con el proyecto.</p>
    </section>
  );
}

function Progress() {
  const status = useCfdStore((s) => s.status);
  const p = useCfdStore((s) => s.progress);
  const adapter = useCfdStore((s) => s.adapter);
  const result = useCfdStore((s) => s.result);
  const error = useCfdStore((s) => s.error);
  if (status === "idle") return null;
  if (status === "error") return <p className="verdict bad">{error}</p>;
  const fraction = p.total > 0 ? p.step / p.total : 0;
  return (
    <section className="panel-section" data-tour="cfd-progress">
      <h3>Marcha</h3>
      <progress max={1} value={fraction} aria-label="Progreso del ensayo" />
      <p className="hint">
        {status === "planning"
          ? "Preparando la rejilla…"
          : `Paso ${p.step} de ${p.total}${p.averaging ? " · promediando" : " · transitorio"}${p.mlups > 0 ? ` · ${formatFixed(p.mlups, p.mlups < 10 ? 2 : 0)} MLUPS` : ""}`}
        {adapter !== null && ` · ${adapter}`}
      </p>
      {result !== null && (
        <p className="hint">
          {result.stopped ? "Detenido" : "Terminado"} en {formatFixed(result.seconds, 1)} s.
        </p>
      )}
    </section>
  );
}

function Balance({ loads, vlm, spread }: { loads: CfdLoads; vlm: { CL: number | null; CD: number | null; Cm: number | null } | null; spread: { drag: number; lift: number } | null }) {
  const row = (label: string, v: number, unit: string, d = 3) => (
    <>
      <dt>{label}</dt>
      <dd className="num">
        {f(v, d)}
        <span className="u">{unit}</span>
      </dd>
    </>
  );
  return (
    <>
      <dl className="values">
        {row("Fx (adelante)", loads.force[0], "N")}
        {row("Fy (derecha)", loads.force[1], "N")}
        {row("Fz (abajo)", loads.force[2], "N")}
        {row("L (alabeo)", loads.moment[0], "N·m", 4)}
        {row("M (cabeceo)", loads.moment[1], "N·m", 4)}
        {row("N (guiñada)", loads.moment[2], "N·m", 4)}
        {row("Sustentación", loads.lift, "N")}
        {row("Resistencia", loads.drag, "N")}
        {row("D/q", loads.dragArea * 1e4, "cm²", 1)}
      </dl>
      {spread !== null && (
        <p className="hint">
          Oscilación (1σ) en la ventana: resistencia ±{f(spread.drag)} N, sustentación ±{f(spread.lift)} N.
        </p>
      )}
      {loads.CL !== null && (
        <table className="drag-table cfd-compare">
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">CFD (LBM)</th>
              <th scope="col">VLM + componentes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">CL</th>
              <td className="num">{f(loads.CL, 4)}</td>
              <td className="num">{f(vlm?.CL, 4)}</td>
            </tr>
            <tr>
              <th scope="row">CD</th>
              <td className="num">{f(loads.CD, 4)}</td>
              <td className="num">{f(vlm?.CD, 4)}</td>
            </tr>
            <tr>
              <th scope="row">Cm (CG)</th>
              <td className="num">{f(loads.Cm, 4)}</td>
              <td className="num">{f(vlm?.Cm, 4)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}

function Lattice({ plan }: { plan: Result<CfdPlanSummary> }) {
  const p = plan.value;
  const g = p.grid;
  const notes: string[] = [];
  if (p.cut) notes.push("Parte del dron llega al borde de la caja y queda cortada.");
  for (const pl of p.plates)
    if (pl.represented > 2 * pl.thickness)
      notes.push(`${pl.name}: ${formatFixed(pl.thickness * 1000, 1)} mm de espesor, ${formatFixed(pl.represented * 1000, 1)} mm en la rejilla (×${formatFixed(pl.represented / pl.thickness, 1)}).`);
  for (const m of p.meshes) if (!m.closed) notes.push(`${m.name}: malla abierta, voxelizada por su superficie (puede salir más gruesa).`);
  return (
    <section className="panel-section" data-tour="cfd-lattice">
      <h3>Rejilla y validez</h3>
      <ValidityBadge level={plan.validity.level} /> <ProvenanceTag provenance={plan.provenance} />
      <dl className="values">
        <dt>Celda Δx</dt>
        <dd className="num">
          {f(g.dx * 1000, 2)}
          <span className="u">mm</span>
        </dd>
        <dt>Celdas</dt>
        <dd className="num">
          {g.nx} × {g.ny} × {g.nz} = {formatFixed((g.nx * g.ny * g.nz) / 1e6, 2)} M
        </dd>
        <dt>Celdas en {p.featureName === "mean aerodynamic chord" ? "c̄" : p.featureName || "la pieza menor"}</dt>
        <dd className="num">{Number.isFinite(p.cellsPerFeature) ? f(p.cellsPerFeature, 1) : "—"}</dd>
        <dt>Bloqueo</dt>
        <dd className="num">
          {f(p.blockage * 100, 2)}
          <span className="u">%</span>
        </dd>
        <dt>Reynolds ({p.reference !== null ? "c̄" : "L"})</dt>
        <dd className="num">{formatScientific(p.reynolds, 3)}</dd>
        <dt>Mach</dt>
        <dd className="num">{f(p.mach, 3)}</dd>
        <dt>τ₀ · paso Δt</dt>
        <dd className="num">
          {f(p.tau0, 6)} · {formatScientific(p.dt, 3)} s
        </dd>
        <dt>Pasos (promedio desde)</dt>
        <dd className="num">
          {p.totalSteps} ({p.averageFrom})
        </dd>
      </dl>
      <ul className="checks">
        {plan.validity.checks.map((c) => (
          <li key={c.quantity} className={c.level}>
            <b>{checkText(c).label}:</b> <span className="hint">{checkText(c).note}</span>
          </li>
        ))}
      </ul>
      {notes.map((n) => (
        <p key={n} className="hint">
          {n}
        </p>
      ))}
      <MethodDetails result={plan} />
    </section>
  );
}

function Validation() {
  const v = useCfdStore((s) => s.validation);
  return (
    <section className="panel-section" data-tour="cfd-validate">
      <h3>Validar en tu GPU</h3>
      <p className="hint">Casos publicados con este mismo solver en tu tarjeta (mini-diseño 006, casos 3 y 7). Pasar el caso a Re 10⁵ no pone las fuerzas en verde: siguen en ámbar.</p>
      <ul className="checks">
        {GPU_CASES.map((c) => {
          const st = v[c.id];
          const o = st?.outcome ?? null;
          return (
            <li key={c.id} className={o === null ? "" : o.pass ? "green" : "red"}>
              <b>{c.name}:</b> CD de referencia {formatFixed(c.cd.min, 3)} ±{formatFixed(c.tolerance * 100, 0)} %.{" "}
              {o !== null ? (
                <span>
                  CD = {formatFixed(o.cd, 3)} ({o.error >= 0 ? "+" : ""}
                  {formatFixed(o.error * 100, 1)} %), {o.pass ? "pasa" : "no pasa"}; {formatFixed(o.cells / 1e6, 2)} M celdas, {formatFixed(o.seconds, 0)} s.
                </span>
              ) : st?.error ? (
                <span className="hint">{st.error}</span>
              ) : st !== undefined ? (
                <span className="hint">{formatFixed(st.progress * 100, 0)} %…</span>
              ) : (
                <button type="button" className="link-button" onClick={() => validateOnGpu(c.id, CASE_D[c.id] ?? 16)}>
                  Ejecutar
                </button>
              )}
              <span className="ref hint"> {c.source}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function historyCsv(name: string): string {
  const s = useCfdStore.getState();
  const rows = s.history.map((h) => [h.t, h.step, ...h.loads.force, ...h.loads.moment, h.loads.lift, h.loads.drag].join(","));
  return [`# AeroForja CFD tunnel (LBM D3Q19, mini-design 006), ${name}. Body axes FRD, SI, moments about the CG. Semi-quantitative (amber).`, "t_s,step,Fx_N,Fy_N,Fz_N,L_Nm,M_Nm,N_Nm,lift_N,drag_N", ...rows].join("\n");
}

export function CfdPanel() {
  const plan = useCfdStore((s) => s.plan);
  const history = useCfdStore((s) => s.history);
  const result = useCfdStore((s) => s.result);
  const vlm = useCfdStore((s) => s.vlm);
  const notes = useCfdStore((s) => s.notes);
  const projectName = useAppStore((s) => s.projectName);
  const averageFrom = plan?.value.averageFrom ?? 0;

  const series = useMemo<ChartSeries[]>(() => {
    // The start-up impulse of the first instants would flatten the rest: the chart begins after the first tenth.
    const shown = history.filter((h) => h.step >= 0.1 * (plan?.value.totalSteps ?? 0));
    const step = Math.max(1, Math.floor(shown.length / 400));
    const pts = shown.filter((_, i) => i % step === 0);
    return [
      { name: "Sustentación (N)", points: pts.map((h) => ({ x: h.t, y: h.loads.lift, level: h.step >= averageFrom ? "amber" : "red" })) },
      { name: "Resistencia (N)", points: pts.map((h) => ({ x: h.t, y: h.loads.drag })), dashed: true, muted: true },
    ];
  }, [history, averageFrom, plan]);

  const vlmPoint = vlm !== null && vlm.ok ? (vlm.result.value.points[0] ?? null) : null;
  const vlmCoefficients = vlmPoint === null ? null : { CL: vlmPoint.CL, CD: vlmPoint.CD, Cm: vlmPoint.Cm };

  return (
    <div className="tunnel cfd">
      <aside className="tunnel-side">
        <Settings />
        <Progress />
        {result?.mean != null && (
          <section className="panel-section" data-tour="cfd-balance">
            <h3>Balanza media</h3>
            <p className="provenance-line">
              <ProvenanceTag provenance="CALCULATED" /> <ValidityBadge level={plan?.validity.level === "red" ? "red" : "amber"} /> semicuantitativo: compara diseños entre sí, no saques decimales.
            </p>
            <Balance loads={result.mean} vlm={vlmCoefficients} spread={result.spread} />
            <p className="hint">
              Media de {result.samples} muestras de la última pasada. Ejes cuerpo FRD, momentos respecto al CG.{" "}
              <button type="button" className="link-button" onClick={() => download(`${fileSafe(projectName)}-cfd.csv`, historyCsv(projectName), "text/csv")}>
                Descargar CSV
              </button>
            </p>
          </section>
        )}
        {plan !== null && <Lattice plan={plan} />}
        {notes.map((n) => (
          <p key={n} className="hint panel-note">
            {n}
          </p>
        ))}
        <Validation />
      </aside>
      <div className="tunnel-main cfd-main">
        <CfdView />
        {history.length > 1 && (
          <div className="cfd-chart">
            <LineChart title="Fuerzas frente al tiempo, sin el arranque (rojo: transitorio, ámbar: ventana de promedio)" series={series} xLabel="t (s)" yLabel="N" />
          </div>
        )}
      </div>
    </div>
  );
}
