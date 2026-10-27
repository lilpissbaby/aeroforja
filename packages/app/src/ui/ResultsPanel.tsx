import { useState } from "react";
import type { ValidityCheck } from "@aeroforja/physics";
import { checkText } from "../i18n/es.ts";
import { useAppStore } from "../state/store.ts";
import {
  formatFixed,
  formatScientific,
  toCelsius,
  toGrams,
  toHectopascals,
  toMillimeters,
} from "../units/display.ts";
import type { Outcome } from "../worker/protocol.ts";
import { MethodDetails, ProvenanceTag, ResultHead, ValidityBadge } from "./ResultMeta.tsx";

type Tab = "mass" | "inertia" | "air" | "warnings";

function Value({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="num">
        {value}
        <span className="u">{unit}</span>
      </dd>
    </>
  );
}

const withUncertainty = (value: string, u: string | null): string => (u === null ? value : `${value} ± ${u}`);

function Failure({ outcome }: { outcome: Outcome<unknown> }) {
  if (outcome.ok) return null;
  return (
    <p className="error-box" role="alert">
      El núcleo físico no ha podido calcular con estos datos: {outcome.message}
    </p>
  );
}

function MassTab() {
  const outcome = useAppStore((s) => s.results?.mass);
  if (outcome === undefined) return <p className="hint">Calculando…</p>;
  if (!outcome.ok) return <Failure outcome={outcome} />;
  const { mass, centerOfGravity: cg, fromComponents } = outcome.result.value;
  const mm = (v: number) => formatFixed(toMillimeters(v), 1);
  const showComponents = mass.provenance === "MEASURED" || cg.provenance === "MEASURED";
  return (
    <>
      <ResultHead validity={outcome.result.validity} provenance={outcome.result.provenance} />
      <div className="columns">
        <dl className="values">
          <Value
            label="Masa"
            value={withUncertainty(
              formatFixed(toGrams(mass.value), 1),
              mass.standardUncertainty === undefined ? null : formatFixed(toGrams(mass.standardUncertainty), 1),
            )}
            unit="g"
          />
          {(["x", "y", "z"] as const).map((axis) => (
            <Value
              key={axis}
              label={`CG en ${axis}`}
              value={withUncertainty(
                mm(cg.value[axis]),
                cg.standardUncertainty === undefined ? null : mm(cg.standardUncertainty[axis]),
              )}
              unit="mm"
            />
          ))}
        </dl>
        <div>
          <p className="hint">
            Masa <ProvenanceTag provenance={mass.provenance} /> CG <ProvenanceTag provenance={cg.provenance} />
          </p>
          <p className="hint">Incertidumbres típicas (1σ). CG medido desde: {outcome.result.value.referencePoint}.</p>
          {showComponents && (
            <p className="hint num">
              Según las piezas: {formatFixed(toGrams(fromComponents.mass), 1)} g, CG x{" "}
              {mm(fromComponents.centerOfGravity.x)} mm
            </p>
          )}
        </div>
      </div>
      <MethodDetails result={outcome.result} />
    </>
  );
}

function InertiaTab() {
  const outcome = useAppStore((s) => s.results?.mass);
  if (outcome === undefined) return <p className="hint">Calculando…</p>;
  if (!outcome.ok) return <Failure outcome={outcome} />;
  const { inertia, principal } = outcome.result.value;
  const t = inertia.value;
  return (
    <>
      <ResultHead validity={outcome.result.validity} provenance={inertia.provenance} />
      <div className="columns">
        <dl className="values">
          <Value label="Ixx (alabeo)" value={formatScientific(t.Ixx)} unit="kg·m²" />
          <Value label="Iyy (cabeceo)" value={formatScientific(t.Iyy)} unit="kg·m²" />
          <Value label="Izz (guiñada)" value={formatScientific(t.Izz)} unit="kg·m²" />
        </dl>
        <dl className="values">
          <Value label="Ixy" value={formatScientific(t.Ixy)} unit="kg·m²" />
          <Value label="Ixz" value={formatScientific(t.Ixz)} unit="kg·m²" />
          <Value label="Iyz" value={formatScientific(t.Iyz)} unit="kg·m²" />
        </dl>
        <dl className="values">
          {principal.moments.map((m, i) => (
            <Value key={i} label={`Principal ${i + 1}`} value={formatScientific(m)} unit="kg·m²" />
          ))}
        </dl>
      </div>
      <p className="hint">
        Respecto al CG, en ejes cuerpo. Productos de inercia definidos en positivo (Ixz = ∫xz dm); el tensor los lleva con
        signo menos, como en Stevens-Lewis y Beard-McLain.
      </p>
      <MethodDetails result={outcome.result} />
    </>
  );
}

function AirTab() {
  const outcome = useAppStore((s) => s.results?.air);
  if (outcome === undefined) return <p className="hint">Calculando…</p>;
  if (!outcome.ok) return <Failure outcome={outcome} />;
  const a = outcome.result.value;
  return (
    <>
      <ResultHead validity={outcome.result.validity} provenance={outcome.result.provenance} />
      <div className="columns">
        <dl className="values">
          <Value label="Temperatura" value={formatFixed(toCelsius(a.temperature), 2)} unit="°C" />
          <Value label="Presión" value={formatFixed(toHectopascals(a.pressure), 2)} unit="hPa" />
          <Value label="Presión de vapor" value={formatFixed(toHectopascals(a.vapourPressure), 2)} unit="hPa" />
          <Value label="Densidad" value={formatFixed(a.density, 4)} unit="kg/m³" />
        </dl>
        <dl className="values">
          <Value label="Viscosidad dinámica" value={formatScientific(a.dynamicViscosity)} unit="Pa·s" />
          <Value label="Viscosidad cinemática" value={formatScientific(a.kinematicViscosity)} unit="m²/s" />
          <Value label="Velocidad del sonido" value={formatFixed(a.speedOfSound, 1)} unit="m/s" />
          <Value label="Altitud geopotencial" value={formatFixed(a.geopotentialAltitude, 1)} unit="m" />
        </dl>
      </div>
      <MethodDetails result={outcome.result} />
    </>
  );
}

interface Warning {
  readonly source: string;
  readonly check?: ValidityCheck;
  readonly message?: string;
}

function collectWarnings(results: ReturnType<typeof useAppStore.getState>["results"]): Warning[] {
  if (results === null) return [];
  const out: Warning[] = [];
  for (const [source, outcome] of [
    ["Masas", results.mass],
    ["Aire", results.air],
  ] as const) {
    if (!outcome.ok) out.push({ source, message: outcome.message });
    else for (const check of outcome.result.validity.checks) if (check.level !== "green") out.push({ source, check });
  }
  return out;
}

function WarningsTab({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return <p className="hint">Todo lo calculado está dentro del rango validado.</p>;
  return (
    <ul className="warnings">
      {warnings.map((w, i) => {
        if (w.check === undefined) {
          return (
            <li key={i}>
              <ValidityBadge level="red" />
              <span>
                {w.source}: el cálculo no se ha podido hacer
              </span>
              <span className="note">{w.message}</span>
            </li>
          );
        }
        const text = checkText(w.check);
        return (
          <li key={i}>
            <ValidityBadge level={w.check.level} />
            <span>
              {w.source}: {text.label}
            </span>
            <span className="note">{text.note}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ResultsPanel() {
  const [tab, setTab] = useState<Tab>("mass");
  const results = useAppStore((s) => s.results);
  const warnings = collectWarnings(results);
  const tabs: readonly [Tab, string][] = [
    ["mass", "Masa y CG"],
    ["inertia", "Inercia"],
    ["air", "Aire"],
    ["warnings", warnings.length === 0 ? "Avisos" : `Avisos (${warnings.length})`],
  ];
  return (
    <section className="bottom" aria-label="Resultados">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel">
        {tab === "mass" && <MassTab />}
        {tab === "inertia" && <InertiaTab />}
        {tab === "air" && <AirTab />}
        {tab === "warnings" && <WarningsTab warnings={warnings} />}
      </div>
    </section>
  );
}
