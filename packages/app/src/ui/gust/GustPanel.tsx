/**
 * Gust test (mini-design 007): a discrete 1 − cos vertical gust on the design
 * as drawn and weighed. Load factor, extra lift, pitch, root bending moment,
 * plate stress and (with the material's E) the deflection of the wing.
 */
import { useMemo } from "react";
import type { GustResponse } from "@aeroforja/physics";
import { useGustStore, type MaterialValue } from "../../gust/store.ts";
import { checkText } from "../../i18n/es.ts";
import { useAppStore } from "../../state/store.ts";
import { tunnelGeometry } from "../../tunnel/input.ts";
import { formatFixed } from "../../units/display.ts";
import { NumberField } from "../NumberField.tsx";
import { usePlanformAnalysis } from "../planform/usePlanformAnalysis.ts";
import { MethodDetails, ProvenanceTag, ValidityBadge } from "../ResultMeta.tsx";
import { LineChart, type ChartSeries } from "../tunnel/LineChart.tsx";
import { GustView } from "./GustView.tsx";

const DEG = 180 / Math.PI;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : formatFixed(v, d));

function MaterialField({ label, unit, scale, decimals, value, onChange }: { label: string; unit: string; scale: number; decimals: number; value: MaterialValue | null; onChange: (v: MaterialValue | null) => void }) {
  return (
    <div className="material-field">
      <NumberField
        label={label}
        unit={unit}
        value={value === null ? null : value.value / scale}
        decimals={decimals}
        allowEmpty
        min={0}
        exclusiveMin
        placeholder="sin dato"
        onCommit={(v) => onChange(v === null ? null : { value: v * scale, provenance: value?.provenance ?? "MEASURED" })}
      />
      <select
        aria-label={`Procedencia de ${label.toLowerCase()}`}
        value={value?.provenance ?? "MEASURED"}
        disabled={value === null}
        onChange={(e) => value !== null && onChange({ ...value, provenance: e.target.value as MaterialValue["provenance"] })}
      >
        <option value="MEASURED">Medido</option>
        <option value="ESTIMATED">De ficha (estimado)</option>
      </select>
    </div>
  );
}

function Settings() {
  const s = useGustStore((st) => st.settings);
  const set = useGustStore((st) => st.setSettings);
  const run = useGustStore((st) => st.run);
  const running = useGustStore((st) => st.running);
  return (
    <section className="panel-section" data-tour="gust-settings">
      <h3>Ráfaga 1 − cos</h3>
      <div className="grid-2">
        <NumberField label="Velocidad de vuelo" unit="m/s" value={s.speed} decimals={1} min={0} exclusiveMin max={80} onCommit={(v) => v !== null && set({ speed: v })} />
        <NumberField label="Intensidad U_ds" unit="m/s" value={s.amplitude} decimals={2} min={0} exclusiveMin max={30} onCommit={(v) => v !== null && set({ amplitude: v })} />
        <NumberField
          label="Distancia de gradiente H"
          unit="c̄"
          value={s.gradientChords ?? 12.5}
          decimals={1}
          min={0.5}
          max={200}
          onCommit={(v) => v !== null && set({ gradientChords: v === 12.5 ? null : v })}
        />
        <label className="field">
          <span>Sentido</span>
          <select value={s.up ? "up" : "down"} onChange={(e) => set({ up: e.target.value === "up" })}>
            <option value="up">Hacia arriba</option>
            <option value="down">Hacia abajo</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Aerodinámica</span>
        <select value={s.model} onChange={(e) => set({ model: e.target.value as "unsteady" | "quasi-steady" })}>
          <option value="unsteady">No estacionaria (VLM con estela)</option>
          <option value="quasi-steady">Casi estacionaria (para comparar)</option>
        </select>
      </label>
      <p className="hint">U_ds = 2 m/s y H = 12,5 c̄ son el escenario aprobado, no un dato: a 15 m/s, 2 m/s ya son 7,6° de α.</p>
      <h4>Material del ala (placa)</h4>
      <MaterialField label="Módulo E" unit="GPa" scale={1e9} decimals={2} value={s.young} onChange={(young) => set({ young })} />
      <MaterialField label="Resistencia a flexión" unit="MPa" scale={1e6} decimals={1} value={s.strength} onChange={(strength) => set({ strength })} />
      <MaterialField label="Masa por área" unit="kg/m²" scale={1} decimals={2} value={s.arealMass} onChange={(arealMass) => set({ arealMass })} />
      <p className="hint">
        Sin E no hay flecha; sin resistencia, no hay coeficiente de seguridad; sin masa por área no hay alivio inercial (conservador). Mídelos con los ensayos 5.1 y 5.2 del módulo de fabricación (pesada y
        voladizo) o tómalos de la ficha de tu tablero: no se inventan.
      </p>
      <div className="row">
        <button type="button" className="button primary" onClick={() => run(false)} disabled={running}>
          {running ? "Calculando…" : "Ensayar ráfaga"}
        </button>
        <button type="button" className="button" onClick={() => run(true)} disabled={running}>
          Con barrido de H
        </button>
      </div>
    </section>
  );
}

function Summary({ r }: { r: GustResponse }) {
  const s = useGustStore((st) => st.settings);
  const row = (label: string, v: string, unit = "", note?: string) => (
    <>
      <dt>{label}</dt>
      <dd className="num">
        {v}
        {unit && <span className="u">{unit}</span>}
        {note !== undefined && <span className="hint"> {note}</span>}
      </dd>
    </>
  );
  return (
    <dl className="values">
      {row("n máximo", f(r.maxLoadFactor.value, 3), "", `a t = ${f(r.maxLoadFactor.t, 3)} s`)}
      {row("n mínimo", f(r.minLoadFactor.value, 3))}
      {row("Pratt–Walker (Δn)", f(r.prattWalker.deltaN, 3), "", `K_g ${f(r.prattWalker.kg, 3)}, μ_g ${f(r.prattWalker.mu, 1)}`)}
      {row("α máximo", f(r.maxAlpha.value * DEG, 1), "°")}
      {row("α a 1 g", f(r.trim.alpha * DEG, 2), "°", `CL ${f(r.trim.CL, 3)}`)}
      {row("Margen estático", f(r.trim.staticMargin * 100, 1), "% c̄")}
      {row("H", f(r.gradient * 1000, 0), "mm", `${f(r.gradient / r.reference.mac, 1)} c̄`)}
      {row("Momento en la raíz", f(r.maxRootMoment.value, 3), "N·m")}
      {r.maxStress !== null && row("Tensión máxima", f(r.maxStress.value / 1e6, 2), "MPa")}
      {r.safetyFactor !== null && row("Coeficiente de seguridad", f(r.safetyFactor, 2))}
      {r.maxDeflection !== null && row("Flecha en punta", f(r.maxDeflection.value * 1000, 1), "mm", `${f((Math.abs(r.maxDeflection.value) / r.reference.semiSpan) * 100, 1)} % de b/2`)}
      {r.frequency !== null && row("1.ª frecuencia de flexión", f(r.frequency, 1), "Hz")}
      {s.young === null && row("Flecha", "—", "", "falta el módulo E")}
    </dl>
  );
}

export function GustPanel() {
  const result = useGustStore((st) => st.result);
  const sweep = useGustStore((st) => st.sweep);
  const error = useGustStore((st) => st.error);
  const notes = useGustStore((st) => st.notes);
  const running = useGustStore((st) => st.running);
  const elapsed = useGustStore((st) => st.elapsed);
  const settings = useGustStore((st) => st.settings);
  const planform = useAppStore((s) => s.planform);
  const model = useAppStore((s) => s.model);
  const analysis = usePlanformAnalysis();
  const surfaces = useMemo(() => tunnelGeometry(planform, analysis, model, [], false).surfaces, [planform, analysis, model]);

  const charts = useMemo(() => {
    if (result === null) return null;
    const h = result.value.history;
    const step = Math.max(1, Math.floor(h.t.length / 500));
    const series = (y: Float64Array, k = 1) => Array.from({ length: Math.ceil(h.t.length / step) }, (_, i) => ({ x: h.t[i * step]!, y: y[i * step]! * k }));
    const level = (a: Float64Array) =>
      Array.from({ length: Math.ceil(h.t.length / step) }, (_, i) => {
        const deg = Math.abs(a[i * step]!) * DEG;
        return { x: h.t[i * step]!, y: a[i * step]! * DEG, level: (deg <= 5 ? "green" : deg <= 10 ? "amber" : "red") as "green" | "amber" | "red" };
      });
    return {
      n: [{ name: "n", points: series(h.loadFactor) }] as ChartSeries[],
      gust: [{ name: "w en el morro", points: series(h.gustAtNose) }] as ChartSeries[],
      lift: [{ name: "ΔL", points: series(h.deltaLift) }] as ChartSeries[],
      angles: [
        { name: "α (°)", points: level(h.alpha) },
        { name: "θ (°)", points: series(h.theta, DEG), dashed: true, muted: true },
      ] as ChartSeries[],
      moment: [{ name: "M raíz", points: series(h.rootMoment) }] as ChartSeries[],
      stress: h.stress === null ? null : ([{ name: "σ máx", points: series(h.stress, 1e-6) }] as ChartSeries[]),
      tip: h.tipDeflection === null ? null : ([{ name: "flecha", points: series(h.tipDeflection, 1000) }] as ChartSeries[]),
    };
  }, [result]);

  const mac = result?.value.reference.mac ?? 1;
  const sweepSeries = useMemo<ChartSeries[] | null>(
    () => (sweep === null ? null : [{ name: "n extremo", points: sweep.map((p) => ({ x: p.gradient / mac, y: p.maxLoadFactor })) }]),
    [sweep, mac],
  );

  return (
    <div className="tunnel gust">
      <aside className="tunnel-side">
        <Settings />
        {notes.length > 0 && (
          <section className="panel-section">
            {notes.map((n) => (
              <p key={n} className="hint">
                {n}
              </p>
            ))}
          </section>
        )}
        {error !== null && !running && <p className="verdict bad panel-note">{error}</p>}
        {result !== null && (
          <section className="panel-section" data-tour="gust-summary">
            <h3>Resultado</h3>
            <p className="provenance-line">
              <ProvenanceTag provenance={result.provenance} /> <ValidityBadge level={result.validity.level} /> en {formatFixed(elapsed / 1000, 1)} s
            </p>
            <Summary r={result.value} />
            <ul className="checks">
              {result.validity.checks.map((c) => (
                <li key={c.quantity} className={c.level}>
                  <b>{checkText(c).label}:</b> <span className="hint">{checkText(c).note}</span>
                </li>
              ))}
            </ul>
            {result.value.notes.map((n) => (
              <p key={n} className="hint">
                {n.startsWith("Not trimmed")
                  ? `Sin trimar: Cm = ${f(result.value.trim.Cm, 3)} al α de 1 g; el diseño necesita mandos para volar a ese CL. Se analizan solo los incrementos.`
                  : n}
              </p>
            ))}
            <MethodDetails result={result} />
          </section>
        )}
      </aside>
      <div className="tunnel-main gust-main" data-tour="gust-main">
        {result === null ? (
          <p className="hint tunnel-empty">{running ? "Calculando la ráfaga…" : "Pulsa «Ensayar ráfaga». Necesita un ala horizontal y el modelo de masas."}</p>
        ) : (
          <>
            <div className="gust-top">
              <GustView surfaces={surfaces} response={result.value} speed={settings.speed} amplitude={settings.amplitude} up={settings.up} exaggeration={settings.exaggeration} />
              <label className="inline gust-exaggeration">
                <span>Exagerar la flecha</span>
                <select value={settings.exaggeration} onChange={(e) => useGustStore.getState().setSettings({ exaggeration: Number(e.target.value) })}>
                  <option value={1}>×1 (real)</option>
                  <option value={5}>×5</option>
                  <option value={10}>×10</option>
                </select>
              </label>
            </div>
            {charts !== null && (
              <div className="chart-grid" data-tour="gust-charts">
                <LineChart title="Factor de carga" series={charts.n} xLabel="t (s)" yLabel="n" marker={result.value.maxLoadFactor.t} />
                <LineChart title="Ráfaga en el morro" series={charts.gust} xLabel="t (s)" yLabel="w (m/s)" />
                <LineChart title="Sustentación extra" series={charts.lift} xLabel="t (s)" yLabel="ΔL (N)" />
                <LineChart title="Ángulo de ataque y cabeceo" series={charts.angles} xLabel="t (s)" yLabel="°" />
                <LineChart title="Momento flector en la raíz (semiala)" series={charts.moment} xLabel="t (s)" yLabel="N·m" marker={result.value.maxRootMoment.t} />
                {charts.stress !== null && <LineChart title="Tensión máxima en la placa" series={charts.stress} xLabel="t (s)" yLabel="MPa" />}
                {charts.tip !== null && <LineChart title="Flecha en punta" series={charts.tip} xLabel="t (s)" yLabel="mm" />}
                {sweepSeries !== null && <LineChart title="Ráfaga crítica: n extremo frente a H" series={sweepSeries} xLabel="H / c̄" yLabel="n" />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
