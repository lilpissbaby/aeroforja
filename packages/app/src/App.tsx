import { useEffect, useState } from "react";
import { useAppStore } from "./state/store.ts";
import { startPhysicsWorker } from "./worker/client.ts";
import { startClaudeBridge } from "./bridge/claude.ts";
import { LeftPanel } from "./ui/LeftPanel.tsx";
import { PlanformProperties } from "./ui/planform/PlanformProperties.tsx";
import { PropertiesPanel } from "./ui/PropertiesPanel.tsx";
import { PartProperties } from "./ui/parts/PartProperties.tsx";
import { ResultsPanel } from "./ui/ResultsPanel.tsx";
import { TopBar } from "./ui/TopBar.tsx";
import { Workspace } from "./ui/Workspace.tsx";
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

export function App() {
  const theme = useEffectiveTheme();
  const panel = useAppStore((s) => s.panel);
  useEffect(() => startPhysicsWorker(), []);
  useEffect(() => startClaudeBridge(), []);
  // First visit: the guided tour opens by itself once.
  useEffect(() => {
    if (!tourSeen()) useAppStore.getState().startTour();
  }, []);
  return (
    <div className="app">
      <TopBar />
      <LeftPanel />
      <Workspace theme={theme} />
      {panel === "planform" ? <PlanformProperties /> : panel === "parts" ? <PartProperties /> : <PropertiesPanel />}
      <ResultsPanel />
      <Tour />
    </div>
  );
}
