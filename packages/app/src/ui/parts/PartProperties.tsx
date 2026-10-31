/**
 * Right panel for an imported part: placement, mass, drag shape and what the
 * mesh gives (closed or not, volume, mass properties), mini-design 005.
 */
import { useEffect, useState } from "react";
import { kilograms, kilogramsPerCubicMeter, meters, radians, type Provenance } from "@aeroforja/physics";
import { DRAG_RELATIVE_UNCERTAINTY, DRAG_SHAPES, DRAG_SHAPE_IDS, DRAG_SOURCE, type DragShapeId } from "../../parts/drag.ts";
import { analysePart } from "../../parts/massLink.ts";
import { getMesh, useMeshVersion } from "../../parts/meshStore.ts";
import { UNIT_CHOICES, type ImportedPart, type PartPlacement } from "../../parts/model.ts";
import { writeBinaryStl } from "../../parts/stl.ts";
import { placedTriangles, trianglesBox } from "../../parts/transform.ts";
import { useAppStore } from "../../state/store.ts";
import { formatFixed, formatScientific, fromDegrees, fromMillimeters, toDegrees, toMillimeters } from "../../units/display.ts";
import { download, fileSafe } from "../download.ts";
import { NumberField } from "../NumberField.tsx";
import { MethodDetails, ProvenanceTag } from "../ResultMeta.tsx";

function Placement({ part }: { part: ImportedPart }) {
  const update = useAppStore((s) => s.updatePart);
  const p = part.placement;
  const set = (patch: Partial<PartPlacement>) => update(part.id, (q) => ({ ...q, placement: { ...q.placement, ...patch } }));
  const pos = (axis: "x" | "y" | "z", label: string) => (
    <NumberField
      label={label}
      unit="mm"
      value={toMillimeters(p.position[axis])}
      decimals={1}
      onCommit={(v) => v !== null && set({ position: { ...p.position, [axis]: meters(fromMillimeters(v)) } })}
    />
  );
  const angle = (key: "yaw" | "pitch" | "roll", label: string) => (
    <NumberField label={label} unit="°" value={toDegrees(p[key])} decimals={1} onCommit={(v) => v !== null && set({ [key]: radians(fromDegrees(v)) })} />
  );
  const centre = () => {
    const mesh = getMesh(part.meshKey);
    if (mesh === undefined) return;
    const box = trianglesBox(placedTriangles(part, mesh));
    if (box === null) return;
    const c = [0, 1, 2].map((i) => (box.min[i]! + box.max[i]!) / 2);
    set({ position: { x: meters(p.position.x - c[0]!), y: meters(p.position.y - c[1]!), z: meters(p.position.z - c[2]!) } });
  };
  return (
    <section className="panel-section" data-tour="part-placement">
      <h3>Colocación (ejes cuerpo FRD)</h3>
      <div className="grid-2">
        {pos("x", "x (adelante)")}
        {pos("y", "y (derecha)")}
        {pos("z", "z (abajo)")}
        <NumberField label="Escala" unit="×" value={p.scale} decimals={3} min={0} exclusiveMin onCommit={(v) => v !== null && set({ scale: v })} />
        {angle("yaw", "Guiñada ψ")}
        {angle("pitch", "Cabeceo θ")}
        {angle("roll", "Alabeo φ")}
        <div className="field">
          <label htmlFor="part-unit">Unidades del archivo</label>
          <select id="part-unit" value={part.unit} onChange={(e) => update(part.id, (q) => ({ ...q, unit: Number(e.target.value) }))}>
            {UNIT_CHOICES.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button type="button" className="button" onClick={centre}>
          Centrar en el origen
        </button>
      </div>
      <p className="hint">
        La posición es dónde va el origen del archivo; el giro es la secuencia aeronáutica z-y-x (guiñada, cabeceo, alabeo) de
        los ejes de la pieza a los del dron.
      </p>
    </section>
  );
}

function Mass({ part }: { part: ImportedPart }) {
  const update = useAppStore((s) => s.updatePart);
  const m = part.mass;
  // The way of knowing the mass can be chosen before its value exists: no number is made up meanwhile.
  const [mode, setMode] = useState<ImportedPart["mass"]["kind"]>(m.kind);
  useEffect(() => setMode(part.mass.kind), [part.id, part.mass.kind]);
  const [provenance, setProvenance] = useState<Provenance>(m.kind === "density" ? m.provenance : "ESTIMATED");
  const setMass = (mass: ImportedPart["mass"]) => update(part.id, (q) => ({ ...q, mass, inMassModel: mass.kind === "unknown" ? false : q.inMassModel }));
  return (
    <section className="panel-section" data-tour="part-mass">
      <h3>Masa</h3>
      <div className="field">
        <label htmlFor="part-mass-kind">Cómo se conoce</label>
        <select
          id="part-mass-kind"
          value={mode}
          onChange={(e) => {
            const kind = e.target.value as ImportedPart["mass"]["kind"];
            setMode(kind);
            if (kind === "unknown") setMass({ kind: "unknown" });
          }}
        >
          <option value="unknown">Sin dato todavía</option>
          <option value="weighed">Pesada en báscula (medida)</option>
          <option value="density">Volumen × densidad del material</option>
        </select>
      </div>
      {mode === "weighed" && (
        <div className="grid-2">
          <NumberField
            label="Masa"
            unit="g"
            value={m.kind === "weighed" ? m.mass * 1000 : null}
            decimals={2}
            allowEmpty
            min={0}
            exclusiveMin
            placeholder="pésala"
            onCommit={(v) =>
              v !== null &&
              setMass(
                m.kind === "weighed" && m.standardUncertainty !== undefined
                  ? { kind: "weighed", mass: kilograms(v / 1000), standardUncertainty: m.standardUncertainty }
                  : { kind: "weighed", mass: kilograms(v / 1000) },
              )
            }
          />
          <NumberField
            label="Incertidumbre (1σ)"
            unit="g"
            value={m.kind === "weighed" && m.standardUncertainty !== undefined ? m.standardUncertainty * 1000 : null}
            decimals={2}
            allowEmpty
            min={0}
            placeholder="desconocida"
            onCommit={(v) => {
              if (m.kind !== "weighed") return;
              setMass(v === null ? { kind: "weighed", mass: m.mass } : { kind: "weighed", mass: m.mass, standardUncertainty: kilograms(v / 1000) });
            }}
          />
        </div>
      )}
      {mode === "density" && (
        <div className="grid-2">
          <NumberField
            label="Densidad"
            unit="kg/m³"
            value={m.kind === "density" ? m.density : null}
            decimals={0}
            allowEmpty
            min={0}
            exclusiveMin
            placeholder="de la ficha"
            onCommit={(v) => v !== null && setMass({ kind: "density", density: kilogramsPerCubicMeter(v), provenance })}
          />
          <div className="field">
            <label htmlFor="part-density-prov">Procedencia</label>
            <select
              id="part-density-prov"
              value={provenance}
              onChange={(e) => {
                const next = e.target.value as Provenance;
                setProvenance(next);
                if (m.kind === "density") setMass({ ...m, provenance: next });
              }}
            >
              <option value="MEASURED">Medida por ti</option>
              <option value="ESTIMATED">Ficha del fabricante o catálogo</option>
            </select>
          </div>
        </div>
      )}
      {m.kind === "unknown" && (
        <p className="hint">
          Pésala (lo mejor) o escribe la densidad de la ficha de tu resina o filamento. La app no supone ninguna densidad.
        </p>
      )}
      {m.kind === "density" && m.provenance === "ESTIMATED" && (
        <p className="hint">Densidad de catálogo: la masa sale ESTIMADA. Una pieza FDM con relleno no es maciza: pésala.</p>
      )}
      <label className="inline check">
        <input
          type="checkbox"
          checked={part.inMassModel}
          disabled={m.kind === "unknown"}
          onChange={(e) => update(part.id, (q) => ({ ...q, inMassModel: e.target.checked }))}
        />
        <span>Cuenta en el modelo de masas (masa, CG e inercia)</span>
      </label>
    </section>
  );
}

function Drag({ part }: { part: ImportedPart }) {
  const update = useAppStore((s) => s.updatePart);
  const area = useAppStore((s) => s.tunnel.response?.partAreas.find((a) => a.id === `stl.${part.id}`)?.area);
  return (
    <section className="panel-section">
      <h3>
        Resistencia en el túnel <ProvenanceTag provenance="ESTIMATED" />
      </h3>
      <div className="field">
        <label htmlFor="part-drag">Forma</label>
        <select id="part-drag" value={part.dragShape} onChange={(e) => update(part.id, (q) => ({ ...q, dragShape: e.target.value as DragShapeId | "none" }))}>
          {DRAG_SHAPE_IDS.map((id) => (
            <option key={id} value={id}>
              {DRAG_SHAPES[id].label} · Cd {formatFixed(DRAG_SHAPES[id].cd, 3)}
            </option>
          ))}
          <option value="none">No cuenta (va dentro de otra pieza)</option>
        </select>
      </div>
      {area !== undefined && (
        <p className="num">
          Área frontal {formatFixed(area * 1e4, 2)} cm² → D/q ≈ {formatFixed(area * 1e4 * (part.dragShape === "none" ? 0 : DRAG_SHAPES[part.dragShape].cd), 2)} cm²
        </p>
      )}
      <p className="hint">
        (D/q) = Cd · A frontal, con A la unión de los triángulos proyectados. Banda ±{DRAG_RELATIVE_UNCERTAINTY * 100} %. Fuente:{" "}
        <a href={DRAG_SOURCE.url} target="_blank" rel="noreferrer">
          NASA Glenn, Shape Effects on Drag
        </a>
        . Sin interferencia con el fuselaje ni mapa de presiones (eso sería CFD).
      </p>
    </section>
  );
}

function MeshFacts({ part }: { part: ImportedPart }) {
  useMeshVersion();
  const a = analysePart(part);
  if (a === null) {
    return (
      <section className="panel-section">
        <p className="error-box">
          La malla no está en este navegador. Vuelve a importar {part.fileName} o abre el proyecto JSON que la contiene.
        </p>
      </section>
    );
  }
  if (!a.ok) {
    return (
      <section className="panel-section">
        <h3>Malla</h3>
        <p className="error-box">
          {a.topology !== null
            ? `Malla no cerrada: ${a.topology.boundaryEdges} aristas abiertas y ${a.topology.badEdges} no manifold o con triángulos girados.`
            : a.message}{" "}
          Sin volumen, masa ni inercia: repárala en el laminador o en tu CAD (exportar sólido cerrado). Sigue contando en la
          resistencia.
        </p>
      </section>
    );
  }
  const v = a.mass.value;
  const known = a.unknownMass !== true;
  const I = v.inertia;
  return (
    <section className="panel-section" data-tour="part-facts">
      <h3>
        Lo que da la malla <ProvenanceTag provenance="CALCULATED" />
      </h3>
      <dl className="values">
        <dt>Triángulos</dt>
        <dd className="num">{v.topology.triangles} · cerrada</dd>
        <dt>Volumen</dt>
        <dd className="num">
          {formatFixed(v.volume * 1e6, 3)}
          <span className="u">cm³</span>
        </dd>
        <dt>Superficie</dt>
        <dd className="num">
          {formatFixed(v.surfaceArea * 1e4, 2)}
          <span className="u">cm²</span>
        </dd>
        <dt>Centroide x, y, z</dt>
        <dd className="num">
          {v.centroid.map((c) => formatFixed(c * 1000, 1)).join(" · ")}
          <span className="u">mm</span>
        </dd>
        {known && (
          <>
            <dt>Masa</dt>
            <dd className="num">
              {formatFixed(a.massValue * 1000, 2)}
              <span className="u">g</span> <ProvenanceTag provenance={a.massProvenance} />
            </dd>
            <dt>Densidad</dt>
            <dd className="num">
              {formatFixed(v.density, 0)}
              <span className="u">kg/m³</span>
            </dd>
            <dt>Ixx, Iyy, Izz (CG pieza)</dt>
            <dd className="num">
              {[I[0], I[4], I[8]].map((x) => formatScientific(x!, 3)).join(" · ")}
              <span className="u">kg·m²</span>
            </dd>
            <dt>Ixy, Ixz, Iyz</dt>
            <dd className="num">
              {[I[1], I[2], I[5]].map((x) => formatScientific(-x!, 3)).join(" · ")}
              <span className="u">kg·m²</span>
            </dd>
          </>
        )}
      </dl>
      <MethodDetails result={a.mass} />
    </section>
  );
}

export function PartProperties() {
  const part = useAppStore((s) => s.parts.find((p) => p.id === s.partSelectedId));
  const update = useAppStore((s) => s.updatePart);
  const remove = useAppStore((s) => s.removePart);
  if (part === undefined) {
    return (
      <aside className="right" aria-label="Propiedades">
        <section className="panel-section">
          <h2>Propiedades</h2>
          <p className="hint">Elige una pieza en la lista o en el visor 3D, o importa un STL desde el panel izquierdo.</p>
        </section>
      </aside>
    );
  }
  return (
    <aside className="right" aria-label="Propiedades de la pieza" data-tour="part-properties">
      <section className="panel-section">
        <h2>{part.name}</h2>
        <div className="field">
          <label htmlFor="part-name">Nombre</label>
          <input
            id="part-name"
            className="text-input"
            defaultValue={part.name}
            key={part.id}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name !== "" && name !== part.name) update(part.id, (q) => ({ ...q, name }));
            }}
          />
        </div>
        <p className="hint">Archivo: {part.fileName}</p>
      </section>
      <Placement part={part} />
      <Mass part={part} />
      <MeshFacts part={part} />
      <Drag part={part} />
      <section className="panel-section row">
        <button
          type="button"
          className="button"
          onClick={() => {
            const mesh = getMesh(part.meshKey);
            if (mesh === undefined) return;
            // Placed in body axes, in millimetres, as slicers expect.
            const mm = placedTriangles(part, mesh).map((v) => v * 1000);
            download(`${fileSafe(part.name)}-colocada.stl`, writeBinaryStl(mm, `AeroForja ${part.name} body FRD mm`), "model/stl");
          }}
        >
          STL colocado (mm)
        </button>
        <button type="button" className="button danger" onClick={() => remove(part.id)}>
          Eliminar
        </button>
      </section>
    </aside>
  );
}
