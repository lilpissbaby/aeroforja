import { useAppStore, type ThemeChoice } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";
import { resolveConflict, useClaudeLink } from "../bridge/claude.ts";
import { useLayout, visibleDocks } from "../state/layout.ts";

/** Shown only when Claude Desktop's AeroForja server is running on this computer. */
function ClaudeChip() {
  const link = useClaudeLink();
  if (link.status !== "connected") return null;
  return (
    <>
      <span className="claude-chip" title="El servidor MCP de AeroForja está activo: lo que Claude cambia aparece aquí al momento.">
        <span className="dot" aria-hidden="true" /> Claude conectado
      </span>
      {link.conflict !== null && (
        <div className="claude-conflict" role="alertdialog" aria-label="Diseño distinto en Claude">
          <p>
            Claude Desktop tiene otro diseño («{link.conflict.name}», {link.conflict.elements} elementos). ¿Con cuál seguís?
          </p>
          <div className="row">
            <button type="button" className="button" onClick={() => resolveConflict("claude")}>
              Abrir el de Claude
            </button>
            <button type="button" className="button primary" onClick={() => resolveConflict("browser")}>
              Enviar el mío a Claude
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Folds every panel on screen so the view takes the whole window, and gives them back. */
function FocusButton() {
  const bench = useAppStore((s) => s.view === "cfd" || s.view === "gust");
  const visible = visibleDocks(bench);
  const allFolded = useLayout((s) => visible.every((id) => s.collapsed[id]));
  const touring = useAppStore((s) => s.tourStep !== null);
  const label = allFolded && !touring ? "Mostrar paneles" : "Ampliar vista";
  return (
    <button
      type="button"
      className="button focus-button"
      aria-pressed={allFolded && !touring}
      title={allFolded ? "Vuelve a abrir los paneles que tenías (A)" : "Pliega los paneles para ver el plano entero (A)"}
      onClick={() => useLayout.getState().toggleFocus(visible)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {allFolded && !touring ? (
          <path d="M5 1.5V5H1.5M9 1.5V5h3.5M5 12.5V9H1.5M9 12.5V9h3.5" />
        ) : (
          <path d="M1.5 5V1.5H5M12.5 5V1.5H9M1.5 9v3.5H5M12.5 9v3.5H9" />
        )}
      </svg>
      {label}
      <kbd>A</kbd>
    </button>
  );
}

export function TopBar() {
  const projectName = useAppStore((s) => s.projectName);
  const air = useAppStore((s) => s.air);
  const theme = useAppStore((s) => s.theme);
  const setAir = useAppStore((s) => s.setAir);
  const setTheme = useAppStore((s) => s.setTheme);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const startTour = useAppStore((s) => s.startTour);

  return (
    <header className="topbar">
      <div className="brand" data-tour="project">
        <span className="wordmark">
          Aero<b>Forja</b>
        </span>
        <input
          className="project-name"
          aria-label="Nombre del proyecto"
          size={Math.max(12, projectName.length + 1)}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      <fieldset className="air" data-tour="air">
        <legend className="visually-hidden">Condiciones del aire</legend>
        <span>Aire</span>
        <NumberField
          label="Altitud"
          unit="m"
          value={air.altitude_m}
          decimals={0}
          onCommit={(v) => v !== null && setAir({ altitude_m: v })}
        />
        <NumberField
          label="Temperatura, ISA +"
          unit="K"
          value={air.deltaT_K}
          decimals={1}
          onCommit={(v) => v !== null && setAir({ deltaT_K: v })}
        />
        <NumberField
          label="Humedad"
          unit="%"
          value={air.relativeHumidity === null ? null : air.relativeHumidity * 100}
          decimals={0}
          allowEmpty
          min={0}
          max={100}
          placeholder="seco"
          onCommit={(v) => setAir({ relativeHumidity: v === null ? null : v / 100 })}
        />
      </fieldset>

      <div className="topbar-end" data-tour="topbar-end">
        <ClaudeChip />
        <FocusButton />
        <button type="button" className="button tour-button" onClick={startTour}>
          <span className="tour-glyph" aria-hidden="true">
            ?
          </span>
          Tour guiado
        </button>
        <label className="theme-select">
          <span className="visually-hidden">Tema</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}>
            <option value="system">Tema del sistema</option>
            <option value="light">Tema claro</option>
            <option value="dark">Tema oscuro</option>
          </select>
        </label>
      </div>
    </header>
  );
}
