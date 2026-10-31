import { useEffect } from "react";
import { useAppStore, type ViewMode } from "../state/store.ts";
import type { PlaneId } from "../planform/planes.ts";
import { DrawToolbar } from "./editor/DrawToolbar.tsx";
import { PlaneEditor } from "./editor/PlaneEditor.tsx";
import { TunnelPanel } from "./tunnel/TunnelPanel.tsx";
import { Viewer3D } from "./Viewer3D.tsx";

const VIEWS: readonly (readonly [ViewMode, string, string])[] = [
  ["plan", "Planta", "Vista desde arriba (x, y)"],
  ["side", "Perfil", "Vista desde la derecha (x, z)"],
  ["front", "Alzado", "Vista desde delante (y, z)"],
  ["three", "Tres vistas + 3D", "Planta, perfil y alzado alineados, con el modelo 3D"],
  ["split", "Planta + 3D", "Planta junto al modelo 3D"],
  ["3d", "3D", "Solo el modelo 3D"],
  ["tunnel", "Túnel de viento", "Barrido de ángulo de ataque: VLM + resistencia por componentes"],
];

const SINGLE: Partial<Record<ViewMode, PlaneId>> = { plan: "top", side: "side", front: "front" };

/**
 * Centre of the workbench: one view of the three-view drawing, the classic
 * layout (planta over alzado, perfil beside, as in a first-angle sheet laid
 * out for screens), the planta with the 3D model, the 3D model alone or the
 * wind tunnel. All views share the drawing and stay in sync.
 */
export function Workspace({ theme }: { theme: "light" | "dark" }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const single = SINGLE[view];

  // A single view owns the keyboard: make it the active plane too.
  useEffect(() => {
    if (single !== undefined) useAppStore.getState().setEditor({ activePlane: single });
    if (view === "split") useAppStore.getState().setEditor({ activePlane: "top" });
  }, [single, view]);

  const drawing = view !== "3d" && view !== "tunnel";
  return (
    <main className={`workspace view-${view}`}>
      <div className="view-switch" role="tablist" aria-label="Vistas" data-tour="view-switch">
        {VIEWS.map(([id, label, title]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} title={title} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {drawing && <DrawToolbar />}
      {view === "three" ? (
        <div className="workspace-panes three-views">
          <PlaneEditor plane="top" exclusive={false} compact />
          <PlaneEditor plane="side" exclusive={false} compact />
          <PlaneEditor plane="front" exclusive={false} compact />
          <Viewer3D theme={theme} />
        </div>
      ) : view === "tunnel" ? (
        <div className="workspace-panes">
          <TunnelPanel theme={theme} />
        </div>
      ) : (
        <div className="workspace-panes">
          {single !== undefined && <PlaneEditor plane={single} exclusive />}
          {view === "split" && <PlaneEditor plane="top" exclusive />}
          {(view === "split" || view === "3d") && <Viewer3D theme={theme} />}
        </div>
      )}
    </main>
  );
}
