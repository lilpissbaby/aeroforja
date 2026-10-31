import { useEffect, useState } from "react";
import { meters } from "@aeroforja/physics";
import { elementArea, elementBounds, elementPerimeter, isOnSymmetryPlane } from "../../planform/geometry.ts";
import { ROLE_LABELS, ROLES, planePoint, type PlanformElement, type PlanformRole } from "../../planform/model.ts";
import { AXIS_NAMES, OFFSET_LABEL, PLANE_SPECS, type PlaneId } from "../../planform/planes.ts";
import { mm1 } from "../../planform/view.ts";
import { useAppStore } from "../../state/store.ts";
import { formatFixed, fromMillimeters, toMillimeters } from "../../units/display.ts";
import { NumberField } from "../NumberField.tsx";
import { IssueBadge, ProvenanceTag } from "../ResultMeta.tsx";
import { usePlanformAnalysis } from "./usePlanformAnalysis.ts";

const INCH = 0.0254;

const AXIS_WORDS = ["x (adelante)", "y (derecha)", "z (abajo)"] as const;

/** Names of the in-plane coordinates of a view: planta x, y; perfil x, z; alzado y, z. */
function planeAxes(plane: PlaneId): { u: string; v: string; uWord: string; vWord: string } {
  const s = PLANE_SPECS[plane];
  return { u: AXIS_NAMES[s.u], v: AXIS_NAMES[s.v], uWord: AXIS_WORDS[s.u], vWord: AXIS_WORDS[s.v] };
}

/** Text input that commits on blur or Enter, so each rename is one undo step. */
function NameField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="field">
      <label htmlFor="plan-name">Nombre</label>
      <input
        id="plan-name"
        className="text-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (t !== "" && t !== value) onCommit(t);
          else setText(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function Mm(props: { label: string; value: number; onCommit: (m: number) => void; positive?: boolean; hideLabel?: boolean }) {
  return (
    <NumberField
      label={props.label}
      unit="mm"
      value={toMillimeters(props.value)}
      decimals={1}
      {...(props.positive === true ? { min: 0, exclusiveMin: true } : {})}
      {...(props.hideLabel === true ? { hideLabel: true } : {})}
      onCommit={(v) => v !== null && props.onCommit(fromMillimeters(v))}
    />
  );
}

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

function Geometry({ element }: { element: PlanformElement }) {
  const own = { ...element, mirror: false };
  const b = elementBounds(own);
  const copies = element.mirror && !isOnSymmetryPlane(element) ? 2 : 1;
  const axes = planeAxes(element.plane);
  const area = elementArea(element);
  return (
    <section className="panel-section" data-tour="geometry">
      <h3>
        Geometría <ProvenanceTag provenance="CALCULATED" />
      </h3>
      <dl className="values">
        <Value label={`Medida en ${axes.u}`} value={mm1(b.maxX - b.minX)} unit="mm" />
        <Value label={`Medida en ${axes.v}`} value={mm1(b.maxY - b.minY)} unit="mm" />
        <Value label="Área" value={formatFixed(area * 1e4, 2)} unit="cm²" />
        {copies === 2 && <Value label="Con su reflejo" value={formatFixed(2 * area * 1e4, 2)} unit="cm²" />}
        <Value label="Perímetro" value={mm1(elementPerimeter(element))} unit="mm" />
        {(element.role === "plate" || element.role === "wing") && (
          <Value label="Volumen (sin vaciados)" value={formatFixed(copies * area * element.thickness * 1e6, 2)} unit="cm³" />
        )}
      </dl>
      <p className="hint">
        Área por la fórmula de Gauss del contorno dibujado (círculos: π r²). Antes de fundirse con las piezas que toca y de
        restar vaciados; el total está en la pestaña Dibujo de abajo.
      </p>
    </section>
  );
}

function Vertices({ element }: { element: Extract<PlanformElement, { shape: "polygon" }> }) {
  const update = useAppStore((s) => s.updatePlanElement);
  const axes = planeAxes(element.plane);
  const setPoint = (index: number, axis: "u" | "v", value: number) =>
    update(element.id, (e) =>
      e.shape === "polygon"
        ? { ...e, points: e.points.map((p, i) => (i === index ? planePoint(axis === "u" ? value : p.u, axis === "v" ? value : p.v) : p)) }
        : e,
    );
  return (
    <section className="panel-section" data-tour="vertices">
      <h3>Vértices</h3>
      <table className="vertex-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{axes.uWord}</th>
            <th scope="col">{axes.vWord}</th>
            <th scope="col">
              <span className="visually-hidden">Quitar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {element.points.map((p, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td>
                <Mm label={`${axes.u} del vértice ${i + 1}`} hideLabel value={p.u} onCommit={(v) => setPoint(i, "u", v)} />
              </td>
              <td>
                <Mm label={`${axes.v} del vértice ${i + 1}`} hideLabel value={p.v} onCommit={(v) => setPoint(i, "v", v)} />
              </td>
              <td>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar el vértice ${i + 1}`}
                  title="Quitar vértice"
                  disabled={element.points.length <= 3}
                  onClick={() =>
                    update(element.id, (e) => (e.shape === "polygon" ? { ...e, points: e.points.filter((_, k) => k !== i) } : e))
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">En el plano: arrastra los puntos medios (+) para añadir vértices; doble clic en uno para quitarlo.</p>
    </section>
  );
}

export function PlanformProperties() {
  const element = useAppStore((s) => s.planform.elements.find((e) => e.id === s.planSelectedId));
  const referencePoint = useAppStore((s) => s.model.referencePoint);
  const setReferencePoint = useAppStore((s) => s.setReferencePoint);
  const update = useAppStore((s) => s.updatePlanElement);
  const duplicate = useAppStore((s) => s.duplicatePlanElement);
  const remove = useAppStore((s) => s.removePlanElement);
  const analysis = usePlanformAnalysis();

  if (element === undefined) {
    return (
      <aside className="right" aria-label="Propiedades" data-tour="properties">
        <section className="panel-section">
          <h2>Propiedades</h2>
          <p className="hint">
            Elige un elemento en la lista, en cualquiera de las tres vistas o en el visor 3D. Planta: desde arriba, morro hacia
            arriba (x, y). Perfil: desde la derecha, morro a la derecha (x, z). Alzado: desde delante (y, z). En milímetros,
            ejes FRD: x adelante, y derecha, z abajo.
          </p>
        </section>
        <section className="panel-section">
          <h3>Origen de los ejes cuerpo</h3>
          <input
            className="text-input"
            aria-label="Origen de los ejes cuerpo"
            value={referencePoint}
            onChange={(e) => setReferencePoint(e.target.value)}
          />
          <p className="hint">El dibujo, las piezas STL y el modelo de masas comparten este origen y los ejes FRD (z hacia abajo).</p>
        </section>
        <section className="panel-section">
          <h3>Del plano al 3D</h3>
          <p className="hint">
            Cada placa o ala se extruye perpendicular a su vista, con el espesor centrado en su plano medio. Las de la misma
            vista, plano medio y espesor se funden en una sola pieza; los vaciados recortan las capas de su vista que atraviesan.
            Los discos de hélice son planos sin espesor.
          </p>
        </section>
      </aside>
    );
  }

  const set = (fn: (e: PlanformElement) => PlanformElement) => update(element.id, fn);
  const issues = analysis.issues.filter((i) => i.elementId === element.id);
  const solid = element.role === "plate" || element.role === "wing";
  const roles = element.shape === "circle" && element.plane !== "side" ? ROLES : ROLES.filter((r) => r !== "rotor");
  const axes = planeAxes(element.plane);
  const offsetAxis = AXIS_NAMES[PLANE_SPECS[element.plane].n];
  const offsetLabel =
    element.role === "rotor" ? (element.plane === "front" ? "x del disco (+ adelante)" : "z del disco (+ abajo)") : OFFSET_LABEL[element.plane];

  return (
    <aside className="right" aria-label="Propiedades" data-tour="properties">
      <section className="panel-section">
        <h2>Propiedades</h2>
        <NameField value={element.name} onCommit={(name) => set((e) => ({ ...e, name }))} />
        <p className="hint">
          Dibujado en el <b>{PLANE_SPECS[element.plane].label.toLowerCase()}</b> ({axes.u}, {axes.v}), visto {PLANE_SPECS[element.plane].seenFrom}.
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="plan-role">Tipo</label>
            <select id="plan-role" value={element.role} onChange={(e) => set((el) => ({ ...el, role: e.target.value as PlanformRole }))}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <label className="inline check standalone">
            <input type="checkbox" checked={element.mirror} onChange={(e) => set((el) => ({ ...el, mirror: e.target.checked }))} />
            <span>Simétrico (reflejo en y = 0)</span>
          </label>
        </div>
        {issues.map((i) => (
          <p key={i.message} className="issue">
            <IssueBadge level={i.level} /> <span>{i.message}</span>
          </p>
        ))}
      </section>

      <section className="panel-section">
        <h3>Posición del plano y espesor</h3>
        <div className="grid-2">
          <Mm label={offsetLabel} value={element.offset} onCommit={(v) => set((e) => ({ ...e, offset: meters(v) }))} />
          {solid && <Mm label="Espesor" value={element.thickness} positive onCommit={(v) => set((e) => ({ ...e, thickness: meters(v) }))} />}
        </div>
        <p className="hint">
          {element.role === "hole"
            ? `El vaciado recorta las placas y alas de su vista cuyo espesor contiene este ${offsetAxis}.`
            : element.role === "rotor"
              ? element.plane === "front"
                ? "Plano de giro de una hélice tractora (delante, x positiva) o propulsora (detrás)."
                : "Plano de giro de la hélice. Negativo: por encima de las placas (z apunta hacia abajo)."
              : element.plane === "side"
                ? `Deriva o pieza vertical: ${offsetAxis} es su distancia al plano de simetría; con simetría se crea la pareja al otro lado.`
                : `Piezas de la misma vista con el mismo ${offsetAxis} y espesor forman una sola plancha.`}
        </p>
      </section>

      {element.shape === "circle" ? (
        <section className="panel-section">
          <h3>Círculo</h3>
          <div className="grid-2">
            <Mm label={`Centro ${axes.u}`} value={element.center.u} onCommit={(v) => set((e) => (e.shape === "circle" ? { ...e, center: planePoint(v, e.center.v) } : e))} />
            <Mm label={`Centro ${axes.v}`} value={element.center.v} onCommit={(v) => set((e) => (e.shape === "circle" ? { ...e, center: planePoint(e.center.u, v) } : e))} />
            <Mm
              label="Diámetro"
              value={element.radius * 2}
              positive
              onCommit={(v) => set((e) => (e.shape === "circle" ? { ...e, radius: meters(v / 2) } : e))}
            />
            {element.role === "rotor" && (
              <NumberField
                label="Diámetro"
                unit="in"
                value={(element.radius * 2) / INCH}
                decimals={2}
                min={0}
                exclusiveMin
                onCommit={(v) => v !== null && set((e) => (e.shape === "circle" ? { ...e, radius: meters((v * INCH) / 2) } : e))}
              />
            )}
          </div>
        </section>
      ) : (
        <Vertices element={element} />
      )}

      <Geometry element={element} />

      <section className="panel-section row">
        <button type="button" className="button" onClick={() => duplicate(element.id)}>
          Duplicar
        </button>
        <button type="button" className="button danger" onClick={() => remove(element.id)}>
          Eliminar
        </button>
      </section>
    </aside>
  );
}
