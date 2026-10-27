import { useRef, useState } from "react";
import { parseMassModelJson, toMassModelFile } from "../model/massModelFile.ts";
import { SHAPE_LABELS, type ShapeKind } from "../model/newComponent.ts";
import { useAppStore } from "../state/store.ts";
import { formatFixed, toGrams } from "../units/display.ts";
import { ProvenanceTag } from "./ResultMeta.tsx";

const ADDABLE: readonly ShapeKind[] = ["box", "cylinder", "tube", "sphere", "point"];

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fileSafe = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "modelo";

export function ComponentList() {
  const model = useAppStore((s) => s.model);
  const projectName = useAppStore((s) => s.projectName);
  const selectedId = useAppStore((s) => s.selectedId);
  const fileError = useAppStore((s) => s.fileError);
  const select = useAppStore((s) => s.select);
  const addComponent = useAppStore((s) => s.addComponent);
  const loadModel = useAppStore((s) => s.loadModel);
  const setFileError = useAppStore((s) => s.setFileError);
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ShapeKind>("box");

  const total = model.components.reduce((sum, c) => sum + c.mass.value, 0);

  const importFile = async (file: File): Promise<void> => {
    try {
      const parsed = parseMassModelJson(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ""));
      if (parsed.ok) loadModel(parsed.name, parsed.model);
      else setFileError(`No se pudo abrir ${file.name}: ${parsed.message}`);
    } catch {
      setFileError(`No se pudo abrir ${file.name}: no es un JSON válido.`);
    }
  };

  return (
    <aside className="left" aria-label="Componentes">
      <section className="panel-section">
        <h2>Componentes</h2>
        <div className="totals num">
          <span>{model.components.length} piezas</span>
          <span>{formatFixed(toGrams(total), 1)} g</span>
        </div>
      </section>

      <ul className="component-list">
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

      <section className="panel-section">
        <div className="row">
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Abrir JSON
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              download(
                `${fileSafe(projectName)}.aeroforja.json`,
                JSON.stringify(toMassModelFile(projectName, model), null, 2),
              )
            }
          >
            Guardar JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) void importFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {fileError !== null && (
          <p className="error-box" role="alert">
            {fileError}
          </p>
        )}
        <p className="hint">
          El navegador guarda tu trabajo entre sesiones. Para copias y para pasarlo a otro equipo, guarda el JSON.
        </p>
      </section>
    </aside>
  );
}
