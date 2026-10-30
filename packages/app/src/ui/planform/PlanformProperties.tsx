import { useEffect, useState } from "react";
import { meters } from "@aeroforja/physics";
import { elementArea, elementBounds, elementPerimeter } from "../../planform/geometry.ts";
import { ROLE_LABELS, ROLES, planPoint, type PlanformElement, type PlanformRole } from "../../planform/model.ts";
import { mm1 } from "../../planform/view.ts";
import { useAppStore } from "../../state/store.ts";
import { formatFixed, fromMillimeters, toMillimeters } from "../../units/display.ts";
import { NumberField } from "../NumberField.tsx";
import { IssueBadge, ProvenanceTag } from "../ResultMeta.tsx";
import { usePlanformAnalysis } from "./usePlanformAnalysis.ts";

const INCH = 0.0254;

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
  const copies = element.mirror && !(element.shape === "circle" && Math.abs(element.center.y) < 1e-6) ? 2 : 1;
  const area = elementArea(element);
  return (
    <section className="panel-section" data-tour="geometry">
      <h3>
        Geometría <ProvenanceTag provenance="CALCULATED" />
      </h3>
      <dl className="values">
        <Value label="Largo en x" value={mm1(b.maxX - b.minX)} unit="mm" />
        <Value label="Ancho en y" value={mm1(b.maxY - b.minY)} unit="mm" />
        <Value label="Área" value={formatFixed(area * 1e4, 2)} unit="cm²" />
        {copies === 2 && <Value label="Con su reflejo" value={formatFixed(2 * area * 1e4, 2)} unit="cm²" />}
        <Value label="Perímetro" value={mm1(elementPerimeter(element))} unit="mm" />
        {(element.role === "plate" || element.role === "wing") && (
          <Value label="Volumen (sin vaciados)" value={formatFixed(copies * area * element.thickness * 1e6, 2)} unit="cm³" />
        )}
      </dl>
      <p className="hint">
        Área por la fórmula de Gauss del contorno dibujado (círculos: π r²). Antes de fundirse con las piezas que toca y de
        restar vaciados; el total está en la pestaña Planta de abajo.
      </p>
    </section>
  );
}

function Vertices({ element }: { element: Extract<PlanformElement, { shape: "polygon" }> }) {
  const update = useAppStore((s) => s.updatePlanElement);
  const setPoint = (index: number, axis: "x" | "y", value: number) =>
    update(element.id, (e) =>
      e.shape === "polygon"
        ? { ...e, points: e.points.map((p, i) => (i === index ? planPoint(axis === "x" ? value : p.x, axis === "y" ? value : p.y) : p)) }
        : e,
    );
  return (
    <section className="panel-section" data-tour="vertices">
      <h3>Vértices</h3>
      <table className="vertex-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">x (adelante)</th>
            <th scope="col">y (derecha)</th>
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
                <Mm label={`x del vértice ${i + 1}`} hideLabel value={p.x} onCommit={(v) => setPoint(i, "x", v)} />
              </td>
              <td>
                <Mm label={`y del vértice ${i + 1}`} hideLabel value={p.y} onCommit={(v) => setPoint(i, "y", v)} />
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
            Elige un elemento en la lista, en el plano o en el visor 3D. El plano es la vista desde arriba con el morro hacia
            arriba: x adelante, y a la derecha, en milímetros.
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
          <p className="hint">La planta y el modelo de masas comparten este origen y los ejes FRD (z hacia abajo).</p>
        </section>
        <section className="panel-section">
          <h3>Del plano al 3D</h3>
          <p className="hint">
            Las placas y alas se extruyen con su espesor centrado en su altura z. Las que comparten altura y espesor se funden
            en una sola pieza; los vaciados recortan las capas que atraviesan. Los discos de hélice son planos sin espesor.
          </p>
        </section>
      </aside>
    );
  }

  const set = (fn: (e: PlanformElement) => PlanformElement) => update(element.id, fn);
  const issues = analysis.issues.filter((i) => i.elementId === element.id);
  const solid = element.role === "plate" || element.role === "wing";
  const roles = element.shape === "circle" ? ROLES : ROLES.filter((r) => r !== "rotor");

  return (
    <aside className="right" aria-label="Propiedades" data-tour="properties">
      <section className="panel-section">
        <h2>Propiedades</h2>
        <NameField value={element.name} onCommit={(name) => set((e) => ({ ...e, name }))} />
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
            <span>Simétrico (reflejo en y)</span>
          </label>
        </div>
        {issues.map((i) => (
          <p key={i.message} className="issue">
            <IssueBadge level={i.level} /> <span>{i.message}</span>
          </p>
        ))}
      </section>

      <section className="panel-section">
        <h3>Altura y espesor</h3>
        <div className="grid-2">
          <Mm
            label={element.role === "rotor" ? "z del disco (+ abajo)" : "z del plano medio (+ abajo)"}
            value={element.z}
            onCommit={(v) => set((e) => ({ ...e, z: meters(v) }))}
          />
          {solid && <Mm label="Espesor" value={element.thickness} positive onCommit={(v) => set((e) => ({ ...e, thickness: meters(v) }))} />}
        </div>
        <p className="hint">
          {element.role === "hole"
            ? "El vaciado recorta las placas y alas cuyo espesor contiene esta altura."
            : element.role === "rotor"
              ? "Plano de giro de la hélice. Negativo: por encima de las placas (z apunta hacia abajo)."
              : "Piezas con la misma z y el mismo espesor forman una sola plancha."}
        </p>
      </section>

      {element.shape === "circle" ? (
        <section className="panel-section">
          <h3>Círculo</h3>
          <div className="grid-2">
            <Mm label="Centro x" value={element.center.x} onCommit={(v) => set((e) => (e.shape === "circle" ? { ...e, center: planPoint(v, e.center.y) } : e))} />
            <Mm label="Centro y" value={element.center.y} onCommit={(v) => set((e) => (e.shape === "circle" ? { ...e, center: planPoint(e.center.x, v) } : e))} />
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
