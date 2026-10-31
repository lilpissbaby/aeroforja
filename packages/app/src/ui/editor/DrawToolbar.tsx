/**
 * Drawing tools shared by the three views (planta, alzado, perfil): the
 * tool, the type of the next element, symmetry, grid snapping, history and
 * framing. The settings live in the store so every view draws the same way.
 */
import { ROLE_LABELS, type PlanformRole } from "../../planform/model.ts";
import { PLANE_SPECS } from "../../planform/planes.ts";
import { useAppStore, type Tool } from "../../state/store.ts";

export const TOOL_LABELS: readonly (readonly [Tool, string, string])[] = [
  ["select", "Seleccionar", "V"],
  ["polygon", "Contorno", "P"],
  ["rect", "Rectángulo", "R"],
  ["circle", "Círculo", "C"],
];

/** Changes the tool; a propeller disc is always a circle, so other drawing tools fall back to a plate. */
export function chooseTool(next: Tool): void {
  const { editor, setEditor } = useAppStore.getState();
  const role = next !== "circle" && next !== "select" && editor.role === "rotor" ? "plate" : editor.role;
  setEditor({ tool: next, role });
}

export function chooseRole(next: PlanformRole): void {
  const { editor, setEditor } = useAppStore.getState();
  setEditor(next === "rotor" && editor.tool !== "circle" ? { role: next, tool: "circle" } : { role: next });
}

export function DrawToolbar() {
  const editor = useAppStore((s) => s.editor);
  const setEditor = useAppStore((s) => s.setEditor);
  const canUndo = useAppStore((s) => s.planPast.length > 0);
  const canRedo = useAppStore((s) => s.planFuture.length > 0);
  const view = useAppStore((s) => s.view);
  const several = view === "three";

  return (
    <div className="plan-toolbar" role="toolbar" aria-label="Herramientas de dibujo" data-tour="plan-toolbar">
      <div className="seg" role="group" aria-label="Herramienta">
        {TOOL_LABELS.map(([id, label, key]) => (
          <button key={id} type="button" aria-pressed={editor.tool === id} onClick={() => chooseTool(id)} title={`${label} (${key})`}>
            {label}
          </button>
        ))}
      </div>
      <label className="inline">
        <span>Tipo</span>
        <select value={editor.role} onChange={(e) => chooseRole(e.target.value as PlanformRole)}>
          {(["plate", "wing", "hole", "rotor"] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="inline check" title="Dibuja también la imagen simétrica respecto al plano y = 0">
        <input type="checkbox" checked={editor.mirror} onChange={(e) => setEditor({ mirror: e.target.checked })} />
        <span>Simetría</span>
      </label>
      <label className="inline">
        <span>Rejilla</span>
        <select
          value={String(editor.snap)}
          onChange={(e) => {
            const v = e.target.value;
            setEditor({ snap: v === "off" || v === "auto" ? v : Number(v) });
          }}
        >
          <option value="auto">auto</option>
          {[0.5, 1, 2, 5, 10].map((v) => (
            <option key={v} value={String(v)}>
              {String(v).replace(".", ",")} mm
            </option>
          ))}
          <option value="off">sin ajuste</option>
        </select>
      </label>
      <div className="seg" role="group" aria-label="Historial y vista">
        <button type="button" disabled={!canUndo} onClick={() => useAppStore.getState().undoPlan()} title="Deshacer (Ctrl+Z)">
          Deshacer
        </button>
        <button type="button" disabled={!canRedo} onClick={() => useAppStore.getState().redoPlan()} title="Rehacer (Ctrl+Y)">
          Rehacer
        </button>
        <button type="button" onClick={() => useAppStore.getState().requestFit()} title="Encuadrar (F)">
          Encuadrar
        </button>
      </div>
      {several && (
        <span className="toolbar-note" aria-live="polite">
          Teclado en: <b>{PLANE_SPECS[editor.activePlane].label}</b>
        </span>
      )}
    </div>
  );
}
