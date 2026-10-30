import { useState } from "react";
import { SHAPE_LABELS, type ShapeKind } from "../model/newComponent.ts";
import { useAppStore } from "../state/store.ts";
import { formatFixed, toGrams } from "../units/display.ts";
import { ProvenanceTag } from "./ResultMeta.tsx";

const ADDABLE: readonly ShapeKind[] = ["box", "cylinder", "tube", "sphere", "point"];

export function ComponentList() {
  const model = useAppStore((s) => s.model);
  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);
  const addComponent = useAppStore((s) => s.addComponent);
  const [kind, setKind] = useState<ShapeKind>("box");

  const total = model.components.reduce((sum, c) => sum + c.mass.value, 0);

  return (
    <>
      <section className="panel-section">
        <h2>Componentes</h2>
        <div className="totals num">
          <span>{model.components.length} piezas</span>
          <span>{formatFixed(toGrams(total), 1)} g</span>
        </div>
      </section>

      <ul className="component-list" data-tour="mass-list">
        {model.components.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-current={c.id === selectedId}
              onClick={() => select(c.id === selectedId ? null : c.id)}
            >
              <span>{c.name}</span>
              <span className="num">{formatFixed(toGrams(c.mass.value), 1)} g</span>
              <span className="meta">
                {SHAPE_LABELS[c.inertia.kind]} <ProvenanceTag provenance={c.mass.provenance} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="panel-section">
        <div className="row">
          <select aria-label="Forma de la pieza nueva" value={kind} onChange={(e) => setKind(e.target.value as ShapeKind)}>
            {ADDABLE.map((k) => (
              <option key={k} value={k}>
                {SHAPE_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="button" className="button" onClick={() => addComponent(kind)}>
            Añadir pieza
          </button>
        </div>
      </section>
    </>
  );
}
