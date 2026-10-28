import { useAppStore, type ViewMode } from "../state/store.ts";
import { PlanformEditor } from "./planform/PlanformEditor.tsx";
import { Viewer3D } from "./Viewer3D.tsx";

const VIEWS: readonly (readonly [ViewMode, string])[] = [
  ["plan", "Planta"],
  ["split", "Planta + 3D"],
  ["3d", "3D"],
];

/** Centre of the workbench: the 2D planform, the 3D model, or both side by side and in sync. */
export function Workspace({ theme }: { theme: "light" | "dark" }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  return (
    <main className={`workspace view-${view}`}>
      <div className="view-switch" role="tablist" aria-label="Vistas">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="workspace-panes">
        {view !== "3d" && <PlanformEditor />}
        {view !== "plan" && <Viewer3D theme={theme} />}
      </div>
    </main>
  );
}
