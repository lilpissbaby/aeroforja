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
import type { PlanformIssue } from "../planform/geometry.ts";
import { mm1 } from "../planform/view.ts";
import { ExportButtons } from "./planform/ExportButtons.tsx";
import { usePlanformAnalysis } from "./planform/usePlanformAnalysis.ts";
import { IssueBadge, MethodDetails, ProvenanceTag, ResultHead, ValidityBadge } from "./ResultMeta.tsx";

type Tab = "plan" | "mass" | "inertia" | "air" | "warnings";

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


function PlanTab() {
  const a = usePlanformAnalysis();
  const select = useAppStore((s) => s.selectPlanElement);
  if (a.bounds === null) {
    return <p className="hint">La planta está vacía: dibuja en el plano o usa una plantilla del panel izquierdo.</p>;
  }
  const b = a.bounds;
  const cm2 = (m2: number) => formatFixed(m2 * 1e4, 1);
  return (
    <>
      <div className="result-head">
        <ProvenanceTag provenance="CALCULATED" />
        <span className="hint">Solo geometría: sin masas ni aerodinámica.</span>
      </div>
      <div className="columns">
        <dl className="values">
          <Value label="Envergadura (y)" value={mm1(b.maxY - b.minY)} unit="mm" />
          <Value label="Longitud (x)" value={mm1(b.maxX - b.minX)} unit="mm" />
          <Value label="Área en planta" value={cm2(a.projectedArea)} unit="cm²" />
          <Value label="Volumen de piezas" value={formatFixed(a.volume * 1e6, 2)} unit="cm³" />
        </dl>
        {a.wing !== null && (
          <dl className="values">
            <Value label="Superficie alar S" value={formatFixed(a.wing.area * 100, 2)} unit="dm²" />
            <Value label="Envergadura alar b" value={mm1(a.wing.span)} unit="mm" />
            <Value label="Alargamiento b²/S" value={formatFixed(a.wing.aspectRatio, 2)} unit="" />
            <Value label="Cuerda media S/b" value={mm1(a.wing.meanChord)} unit="mm" />
          </dl>
        )}
        {a.rotorSummary !== null && (
          <dl className="values">
            <Value label="Hélices" value={String(a.rotorSummary.count)} unit="" />
            <Value label="Área de discos" value={formatFixed(a.rotorSummary.discArea * 100, 2)} unit="dm²" />
            <Value label="Máx. entre ejes" value={mm1(a.rotorSummary.maxAxisDistance)} unit="mm" />
          </dl>
        )}
        <dl className="values">
          {a.layers.map((l, i) => (
            <Value
              key={l.key}
              label={`Capa ${i + 1}: z ${mm1(l.z)}, ${mm1(l.thickness)} mm`}
              value={`${cm2(l.area)} cm² · ${l.bodies.length} ${l.bodies.length === 1 ? "pieza" : "piezas"}`}
              unit=""
            />
          ))}
        </dl>
      </div>
      {a.issues.length > 0 && (
        <ul className="warnings plan-issues">
          {a.issues.map((issue, i) => (
            <li key={i}>
              <IssueBadge level={issue.level} />
              {issue.elementId !== undefined ? (
                <button type="button" className="link" onClick={() => select(issue.elementId ?? null)}>
                  {issue.message}
                </button>
              ) : (
                <span>{issue.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <ExportButtons />
      <details className="method">
        <summary>Método, referencias y supuestos</summary>
        <ul>
          <li>
            Áreas y centroides por la fórmula del área de Gauss (shoelace).
          </li>
          <li>
            Uniones y vaciados por operaciones booleanas de polígonos: algoritmo de barrido de Martínez, Rueda y Feito
            <span className="ref">
              F. Martínez, A. J. Rueda, F. R. Feito (2009). A new algorithm for computing Boolean operations on polygons.
              Computers &amp; Geosciences 35(6), 1177–1185 (implementación: librería polygon-clipping).
            </span>
          </li>
          <li>
            Alargamiento A = b²/S y cuerda media geométrica S/b, por definición
            <span className="ref">J. D. Anderson, Fundamentals of Aerodynamics, cap. 5.</span>
          </li>
        </ul>
        <ul>
          <li>Piezas planas de espesor uniforme: cada una es la extrusión de su contorno en planta.</li>
          <li>Los círculos se discretizan en polígonos inscritos con un error de cuerda de 0,01 mm como máximo.</li>
          <li>Los discos de hélice son planos sin espesor: el aviso de choque solo mira si el plano corta una pieza.</li>
          <li>La superficie alar no descuenta los vaciados (se suponen entelados).</li>
          <li>Las coordenadas generadas se redondean a la micra.</li>
        </ul>
      </details>
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

function WarningsTab({ warnings, planIssues }: { warnings: Warning[]; planIssues: readonly PlanformIssue[] }) {
  if (warnings.length === 0 && planIssues.length === 0) {
    return <p className="hint">Todo lo calculado está dentro del rango validado y la planta no tiene problemas.</p>;
  }
  return (
    <ul className="warnings">
      {planIssues.map((issue, i) => (
        <li key={`plan${i}`}>
          <IssueBadge level={issue.level} />
          <span>Planta: {issue.message}</span>
        </li>
      ))}
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
  const [tab, setTab] = useState<Tab>("plan");
  const results = useAppStore((s) => s.results);
  const planIssues = usePlanformAnalysis().issues;
  const warnings = collectWarnings(results);
  const count = warnings.length + planIssues.length;
  const tabs: readonly [Tab, string][] = [
    ["plan", "Planta"],
    ["mass", "Masa y CG"],
    ["inertia", "Inercia"],
    ["air", "Aire"],
    ["warnings", count === 0 ? "Avisos" : `Avisos (${count})`],
  ];
  return (
    <section className="bottom" aria-label="Resultados" data-tour="results">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel">
        {tab === "plan" && <PlanTab />}
        {tab === "mass" && <MassTab />}
        {tab === "inertia" && <InertiaTab />}
        {tab === "air" && <AirTab />}
        {tab === "warnings" && <WarningsTab warnings={warnings} planIssues={planIssues} />}
      </div>
    </section>
  );
}
