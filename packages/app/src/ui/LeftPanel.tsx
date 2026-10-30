import { useRef } from "react";
import { parseProjectJson, toProjectFile } from "../model/projectFile.ts";
import { useAppStore, type Panel } from "../state/store.ts";
import { ComponentList } from "./ComponentList.tsx";
import { PlanformPanel } from "./planform/PlanformPanel.tsx";
import { download, fileSafe } from "./download.ts";

const TABS: readonly (readonly [Panel, string])[] = [
  ["planform", "Planta"],
  ["mass", "Masas"],
];

function ProjectFiles() {
  const model = useAppStore((s) => s.model);
  const planform = useAppStore((s) => s.planform);
  const projectName = useAppStore((s) => s.projectName);
  const fileError = useAppStore((s) => s.fileError);
  const loadProject = useAppStore((s) => s.loadProject);
  const setFileError = useAppStore((s) => s.setFileError);
  const fileInput = useRef<HTMLInputElement>(null);

  const importFile = async (file: File): Promise<void> => {
    try {
      const parsed = parseProjectJson(JSON.parse(await file.text()), file.name.replace(/(\.aeroforja)?\.json$/i, ""));
      if (parsed.ok) loadProject(parsed.name, parsed.model, parsed.planform);
      else setFileError(`No se pudo abrir ${file.name}: ${parsed.message}`);
    } catch {
      setFileError(`No se pudo abrir ${file.name}: no es un JSON válido.`);
    }
  };

  return (
    <section className="panel-section" data-tour="project-files">
      <h3>Proyecto</h3>
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
              JSON.stringify(toProjectFile(projectName, model, planform), null, 2),
              "application/json",
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
        El navegador guarda tu trabajo entre sesiones. El JSON lleva la planta y el modelo de masas: úsalo para copias y para
        pasarlo a otro equipo.
      </p>
    </section>
  );
}

export function LeftPanel() {
  const panel = useAppStore((s) => s.panel);
  const setPanel = useAppStore((s) => s.setPanel);
  return (
    <aside className="left" aria-label="Diseño">
      <div className="tabs" role="tablist" aria-label="Qué editar" data-tour="left-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>
            {label}
          </button>
        ))}
      </div>
      {panel === "planform" ? <PlanformPanel /> : <ComponentList />}
      <ProjectFiles />
    </aside>
  );
}
