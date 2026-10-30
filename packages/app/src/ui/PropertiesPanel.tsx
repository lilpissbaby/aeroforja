import {
  bodyPosition,
  eulerZYXFromQuaternion,
  kilograms,
  kilogramSquareMeters,
  meters,
  quaternionFromEulerZYX,
  radians,
  type Axis,
  type InertiaSpec,
  type InertiaTensor,
  type MassComponent,
  type Provenance,
} from "@aeroforja/physics";
import { PROVENANCE_ES } from "../i18n/es.ts";
import { SHAPE_LABELS, defaultInertia, type ShapeKind } from "../model/newComponent.ts";
import { useAppStore } from "../state/store.ts";
import {
  fromDegrees,
  fromGrams,
  fromMillimeters,
  toDegrees,
  toGrams,
  toMillimeters,
} from "../units/display.ts";
import { NumberField } from "./NumberField.tsx";

const AXIS_LABEL: Readonly<Record<Axis, string>> = { x: "x (adelante)", y: "y (derecha)", z: "z (abajo)" };

type Update = (update: (c: MassComponent) => MassComponent) => void;

function MillimeterField(props: {
  label: string;
  value: number;
  onCommit: (meters: number) => void;
  positive?: boolean;
  min?: number;
}) {
  return (
    <NumberField
      label={props.label}
      unit="mm"
      value={toMillimeters(props.value)}
      decimals={1}
      {...(props.positive === true ? { min: 0, exclusiveMin: true } : {})}
      {...(props.min !== undefined ? { min: props.min } : {})}
      onCommit={(v) => v !== null && props.onCommit(fromMillimeters(v))}
    />
  );
}

function ShapeFields({ inertia, update }: { inertia: InertiaSpec; update: Update }) {
  const setInertia = (next: InertiaSpec) => update((c) => ({ ...c, inertia: next }));
  switch (inertia.kind) {
    case "point":
      return <p className="hint">Sin inercia propia: úsala para piezas pequeñas y densas.</p>;
    case "box":
      return (
        <div className="grid-3">
          {(["x", "y", "z"] as const).map((axis) => (
            <MillimeterField
              key={axis}
              label={`Lado en ${axis}`}
              value={inertia.size[axis]}
              positive
              onCommit={(v) => setInertia({ ...inertia, size: { ...inertia.size, [axis]: meters(v) } })}
            />
          ))}
        </div>
      );
    case "cylinder":
    case "tube": {
      const axisSelect = (
        <div className="field">
          <label>Eje</label>
          <select
            value={inertia.axis}
            onChange={(e) => setInertia({ ...inertia, axis: e.target.value as Axis })}
          >
            {(["x", "y", "z"] as const).map((a) => (
              <option key={a} value={a}>
                {AXIS_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
      );
      if (inertia.kind === "cylinder") {
        return (
          <div className="grid-3">
            <MillimeterField
              label="Radio"
              value={inertia.radius}
              positive
              onCommit={(v) => setInertia({ ...inertia, radius: meters(v) })}
            />
            <MillimeterField
              label="Longitud"
              value={inertia.length}
              positive
              onCommit={(v) => setInertia({ ...inertia, length: meters(v) })}
            />
            {axisSelect}
          </div>
        );
      }
      return (
        <div className="grid-3">
          <MillimeterField
            label="Radio exterior"
            value={inertia.outerRadius}
            positive
            onCommit={(v) => setInertia({ ...inertia, outerRadius: meters(v) })}
          />
          <MillimeterField
            label="Radio interior"
            value={inertia.innerRadius}
            min={0}
            onCommit={(v) => setInertia({ ...inertia, innerRadius: meters(v) })}
          />
          <MillimeterField
            label="Longitud"
            value={inertia.length}
            positive
            onCommit={(v) => setInertia({ ...inertia, length: meters(v) })}
          />
          {axisSelect}
        </div>
      );
    }
    case "sphere":
      return (
        <MillimeterField
          label="Radio"
          value={inertia.radius}
          positive
          onCommit={(v) => setInertia({ ...inertia, radius: meters(v) })}
        />
      );
    case "given": {
      const keys: readonly (keyof InertiaTensor)[] = ["Ixx", "Iyy", "Izz", "Ixy", "Ixz", "Iyz"];
      return (
        <>
          <div className="grid-3">
            {keys.map((k) => (
              <NumberField
                key={k}
                label={k}
                unit="g·cm²"
                value={inertia.tensor[k] * 1e7}
                decimals={1}
                onCommit={(v) =>
                  v !== null &&
                  setInertia({ ...inertia, tensor: { ...inertia.tensor, [k]: kilogramSquareMeters(v / 1e7) } })
                }
              />
            ))}
          </div>
          <p className="hint">
            Respecto al centro de masas de la pieza, en sus ejes. Productos de inercia en positivo (Ixy = ∫xy dm).
          </p>
        </>
      );
    }
  }
}

export function PropertiesPanel() {
  const component = useAppStore((s) => s.model.components.find((c) => c.id === s.selectedId));
  const componentCount = useAppStore((s) => s.model.components.length);
  const referencePoint = useAppStore((s) => s.model.referencePoint);
  const updateComponent = useAppStore((s) => s.updateComponent);
  const duplicateComponent = useAppStore((s) => s.duplicateComponent);
  const removeComponent = useAppStore((s) => s.removeComponent);
  const setReferencePoint = useAppStore((s) => s.setReferencePoint);

  if (component === undefined) {
    return (
      <aside className="right" aria-label="Propiedades" data-tour="properties">
        <section className="panel-section">
          <h2>Propiedades</h2>
          <p className="hint">Elige una pieza en la lista o haz clic sobre ella en el visor.</p>
        </section>
        <section className="panel-section">
          <h3>Origen de los ejes cuerpo</h3>
          <input
            className="text-input"
            aria-label="Origen de los ejes cuerpo"
            value={referencePoint}
            onChange={(e) => setReferencePoint(e.target.value)}
          />
          <p className="hint">
            Todas las posiciones se miden desde aquí: x hacia delante, y a la derecha, z hacia abajo (FRD).
          </p>
        </section>
      </aside>
    );
  }

  const update: Update = (fn) => updateComponent(component.id, fn);
  const euler = component.orientation === undefined ? null : eulerZYXFromQuaternion(component.orientation);
  const angles = {
    roll: euler === null ? 0 : toDegrees(euler.roll),
    pitch: euler === null ? 0 : toDegrees(euler.pitch),
    yaw: euler === null ? 0 : toDegrees(euler.yaw),
  };
  const setAngle = (which: "roll" | "pitch" | "yaw", degrees: number) => {
    const next = { ...angles, [which]: degrees };
    const isIdentity = next.roll === 0 && next.pitch === 0 && next.yaw === 0;
    update((c) => {
      const { orientation: _drop, ...rest } = c;
      return isIdentity
        ? rest
        : {
            ...rest,
            orientation: quaternionFromEulerZYX({
              roll: radians(fromDegrees(next.roll)),
              pitch: radians(fromDegrees(next.pitch)),
              yaw: radians(fromDegrees(next.yaw)),
            }),
          };
    });
  };

  const setPositionUncertainty = (axis: "x" | "y" | "z", millimeters: number | null) => {
    update((c) => {
      const current = c.positionUncertainty ?? bodyPosition(0, 0, 0);
      const next = { ...current, [axis]: meters(fromMillimeters(millimeters ?? 0)) };
      const { positionUncertainty: _drop, ...rest } = c;
      return next.x === 0 && next.y === 0 && next.z === 0 ? rest : { ...rest, positionUncertainty: next };
    });
  };

  return (
    <aside className="right" aria-label="Propiedades" data-tour="properties">
      <section className="panel-section">
        <h2>Propiedades</h2>
        <div className="field">
          <label htmlFor="component-name">Nombre</label>
          <input
            id="component-name"
            className="text-input"
            value={component.name}
            onChange={(e) => update((c) => ({ ...c, name: e.target.value }))}
          />
        </div>
      </section>

      <section className="panel-section">
        <h3>Masa</h3>
        <div className="grid-3">
          <NumberField
            label="Masa"
            unit="g"
            value={toGrams(component.mass.value)}
            decimals={2}
            min={0}
            exclusiveMin
            onCommit={(v) => v !== null && update((c) => ({ ...c, mass: { ...c.mass, value: kilograms(fromGrams(v)) } }))}
          />
          <NumberField
            label="Incertidumbre (1σ)"
            unit="g"
            value={component.mass.standardUncertainty === undefined ? null : toGrams(component.mass.standardUncertainty)}
            decimals={2}
            allowEmpty
            min={0}
            placeholder="—"
            onCommit={(v) =>
              update((c) => {
                const { standardUncertainty: _drop, ...mass } = c.mass;
                return {
                  ...c,
                  mass: v === null || v === 0 ? mass : { ...mass, standardUncertainty: kilograms(fromGrams(v)) },
                };
              })
            }
          />
          <div className="field">
            <label htmlFor="mass-provenance">Procedencia</label>
            <select
              id="mass-provenance"
              value={component.mass.provenance}
              onChange={(e) =>
                update((c) => ({ ...c, mass: { ...c.mass, provenance: e.target.value as Provenance } }))
              }
            >
              {(["MEASURED", "CALCULATED", "ESTIMATED"] as const).map((p) => (
                <option key={p} value={p}>
                  {PROVENANCE_ES[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">Medido: pesado en báscula. Estimado: de catálogo o a ojo.</p>
      </section>

      <section className="panel-section">
        <h3>Posición de su centro de masas</h3>
        <div className="grid-3">
          {(["x", "y", "z"] as const).map((axis) => (
            <MillimeterField
              key={axis}
              label={AXIS_LABEL[axis]}
              value={component.position[axis]}
              onCommit={(v) => update((c) => ({ ...c, position: { ...c.position, [axis]: meters(v) } }))}
            />
          ))}
          {(["x", "y", "z"] as const).map((axis) => (
            <NumberField
              key={`u${axis}`}
              label={`± en ${axis}`}
              unit="mm"
              value={component.positionUncertainty === undefined ? null : toMillimeters(component.positionUncertainty[axis])}
              decimals={1}
              allowEmpty
              min={0}
              placeholder="—"
              onCommit={(v) => setPositionUncertainty(axis, v)}
            />
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h3>Orientación</h3>
        <div className="grid-3">
          <NumberField label="Guiñada (z)" unit="°" value={angles.yaw} decimals={1} onCommit={(v) => v !== null && setAngle("yaw", v)} />
          <NumberField label="Cabeceo (y)" unit="°" value={angles.pitch} decimals={1} min={-90} max={90} onCommit={(v) => v !== null && setAngle("pitch", v)} />
          <NumberField label="Alabeo (x)" unit="°" value={angles.roll} decimals={1} onCommit={(v) => v !== null && setAngle("roll", v)} />
        </div>
        <p className="hint">Secuencia aeronáutica z-y-x de los ejes de la pieza respecto a los ejes cuerpo.</p>
      </section>

      <section className="panel-section">
        <h3>Forma</h3>
        <div className="field">
          <label htmlFor="shape-kind">Tipo</label>
          <select
            id="shape-kind"
            value={component.inertia.kind}
            onChange={(e) => {
              const kind = e.target.value as InertiaSpec["kind"];
              if (kind !== "given") update((c) => ({ ...c, inertia: defaultInertia(kind as ShapeKind) }));
            }}
          >
            {(Object.keys(SHAPE_LABELS) as InertiaSpec["kind"][]).map((k) => (
              <option key={k} value={k} disabled={k === "given" && component.inertia.kind !== "given"}>
                {SHAPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <ShapeFields inertia={component.inertia} update={update} />
      </section>

      <section className="panel-section row">
        <button type="button" className="button" onClick={() => duplicateComponent(component.id)}>
          Duplicar
        </button>
        <button
          type="button"
          className="button danger"
          disabled={componentCount <= 1}
          onClick={() => removeComponent(component.id)}
        >
          Eliminar pieza
        </button>
      </section>
    </aside>
  );
}
