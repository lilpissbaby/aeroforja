import { useEffect, useState, type CSSProperties } from "react";
import { useAppStore } from "./state/store.ts";
import { DOCK_MAX_SHARE, RAIL_WIDTH, useLayout, visibleDocks, type DockId } from "./state/layout.ts";
import { startPhysicsWorker } from "./worker/client.ts";
import { startClaudeBridge } from "./bridge/claude.ts";
import { LeftPanel } from "./ui/LeftPanel.tsx";
import { PlanformProperties } from "./ui/planform/PlanformProperties.tsx";
import { PropertiesPanel } from "./ui/PropertiesPanel.tsx";
import { PartProperties } from "./ui/parts/PartProperties.tsx";
import { ResultsPanel } from "./ui/ResultsPanel.tsx";
import { TopBar } from "./ui/TopBar.tsx";
import { Workspace } from "./ui/Workspace.tsx";
import { Dock } from "./ui/Dock.tsx";
import { Tour, tourSeen } from "./ui/tour/Tour.tsx";

function useEffectiveTheme(): "light" | "dark" {
  const choice = useAppStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const effective = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  useEffect(() => {
    document.documentElement.dataset["theme"] = effective;
  }, [effective]);
  return effective;
}

/** Grid tracks of the panels, as CSS custom properties on the workbench. */
function useDockTracks(): CSSProperties {
  const collapsed = useLayout((s) => s.collapsed);
  const size = useLayout((s) => s.size);
  const touring = useAppStore((s) => s.tourStep !== null);
  const folded = (id: DockId) => collapsed[id] && !touring;
  return {
    "--dock-left": folded("left") ? `${RAIL_WIDTH}px` : `min(${size.left}px, ${DOCK_MAX_SHARE.left * 100}vw)`,
    "--dock-right": folded("right") ? `${RAIL_WIDTH}px` : `min(${size.right}px, ${DOCK_MAX_SHARE.right * 100}vw)`,
    "--dock-bottom": folded("bottom") ? "auto" : `min(${size.bottom}px, ${DOCK_MAX_SHARE.bottom * 100}vh)`,
  } as CSSProperties;
}

/** «A» folds or gives back every panel on screen (the «Ampliar vista» button of the top bar). */
function useFocusKey(bench: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "a" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (useAppStore.getState().tourStep !== null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable='true']") != null) return;
      e.preventDefault();
      useLayout.getState().toggleFocus(visibleDocks(bench));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bench]);
}

/** Name of what the properties panel is showing, for its rail when it is folded. */
function PropertiesRail() {
  const name = useAppStore((s) => {
    if (s.panel === "planform") return s.planform.elements.find((e) => e.id === s.planSelectedId)?.name ?? null;
    if (s.panel === "parts") return s.parts.find((p) => p.id === s.partSelectedId)?.name ?? null;
    return s.model.components.find((c) => c.id === s.selectedId)?.name ?? null;
  });
  return (
    <>
      Propiedades{name !== null && <b> · {name}</b>}
    </>
  );
}

const LEFT_TABS = { planform: "Dibujo", parts: "Piezas", mass: "Masas" } as const;

export function App() {
  const theme = useEffectiveTheme();
  const panel = useAppStore((s) => s.panel);
  // The CFD tunnel and the gust test need the room of the properties and results panels.
  const bench = useAppStore((s) => s.view === "cfd" || s.view === "gust");
  const tracks = useDockTracks();
  useFocusKey(bench);
  useEffect(() => startPhysicsWorker(), []);
  useEffect(() => startClaudeBridge(), []);
  // First visit: the guided tour opens by itself once.
  useEffect(() => {
    if (!tourSeen()) useAppStore.getState().startTour();
  }, []);
  return (
    <div className={bench ? "app view-bench" : "app"} style={tracks}>
      <TopBar />
      <Dock id="left" label="el panel de diseño" rail={`Diseño · ${LEFT_TABS[panel]}`}>
        <LeftPanel />
      </Dock>
      <Workspace theme={theme} />
      <Dock id="right" label="las propiedades" rail={<PropertiesRail />}>
        {panel === "planform" ? <PlanformProperties /> : panel === "parts" ? <PartProperties /> : <PropertiesPanel />}
      </Dock>
      <Dock id="bottom" label="los resultados">
        <ResultsPanel />
      </Dock>
      <Tour />
    </div>
  );
}
