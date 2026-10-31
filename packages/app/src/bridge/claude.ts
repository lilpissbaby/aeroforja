/**
 * Live link with the AeroForja MCP server that Claude Desktop runs on this
 * computer (packages/mcp): Claude's changes appear here as it makes them,
 * and the user's edits reach Claude.
 *
 * The server listens on 127.0.0.1 only. When it is not running the app
 * tries again every few seconds, silently; nothing leaves the computer.
 */
import { create } from "zustand";
import { parseProjectJson, toProjectFile } from "../model/projectFile.ts";
import { useAppStore, type AppState } from "../state/store.ts";

export const BRIDGE_URL = "http://127.0.0.1:47615";
const RETRY_MS = 8000;

export interface ClaudeLink {
  readonly status: "off" | "connected";
  /** Claude's server holds a different design than the browser at connection time. */
  readonly conflict: { readonly name: string; readonly elements: number } | null;
  readonly lastChange: number | null;
}

export const useClaudeLink = create<ClaudeLink>(() => ({ status: "off", conflict: null, lastChange: null }));

let applying = false;
let pendingRemote: unknown = null;

function projectOf(s: AppState) {
  // Meshes stay in the browser: the server does not need megabytes of triangles.
  return toProjectFile(s.projectName, s.model, s.planform, s.parts);
}

function apply(project: unknown): void {
  const parsed = parseProjectJson(project, "Diseño con Claude");
  if (!parsed.ok) return;
  applying = true;
  try {
    useAppStore.getState().loadProject(parsed.name, parsed.model, parsed.planform, parsed.parts, parsed.meshes);
  } finally {
    applying = false;
  }
  useClaudeLink.setState({ lastChange: Date.now() });
}

const sameDesign = (a: unknown, b: unknown) => {
  const strip = (p: unknown) => JSON.stringify({ ...(p as object), meshes: undefined });
  return strip(a) === strip(b);
};

async function push(): Promise<void> {
  if (useClaudeLink.getState().status !== "connected" || useClaudeLink.getState().conflict !== null) return;
  try {
    await fetch(`${BRIDGE_URL}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: projectOf(useAppStore.getState()) }),
    });
  } catch {
    // The server went away; the event stream notices and reconnects.
  }
}

/** Keep Claude's design (it replaces the browser's, undoable with Ctrl+Z) or send the browser's to Claude. */
export function resolveConflict(keep: "claude" | "browser"): void {
  const remote = pendingRemote;
  pendingRemote = null;
  useClaudeLink.setState({ conflict: null });
  if (keep === "claude" && remote !== null) apply(remote);
  else void push();
}

export function startClaudeBridge(): () => void {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const connect = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`${BRIDGE_URL}/state`, { signal: AbortSignal.timeout(1500) });
      const remote = ((await res.json()) as { project: unknown }).project;
      const local = projectOf(useAppStore.getState());
      if (!sameDesign(remote, local)) {
        const parsed = parseProjectJson(remote, "Diseño con Claude");
        pendingRemote = remote;
        useClaudeLink.setState({ conflict: { name: parsed.ok ? parsed.name : "?", elements: parsed.ok ? parsed.planform.elements.length : 0 } });
      }
      source = new EventSource(`${BRIDGE_URL}/events`);
      source.addEventListener("project", (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as { project: unknown };
        if (useClaudeLink.getState().conflict !== null) pendingRemote = data.project;
        else apply(data.project);
      });
      source.onerror = () => {
        source?.close();
        source = null;
        useClaudeLink.setState({ status: "off" });
        timer = setTimeout(() => void connect(), RETRY_MS);
      };
      useClaudeLink.setState({ status: "connected" });
    } catch {
      useClaudeLink.setState({ status: "off" });
      timer = setTimeout(() => void connect(), RETRY_MS);
    }
  };

  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (applying) return;
    if (state.planform !== previous.planform || state.model !== previous.model || state.parts !== previous.parts || state.projectName !== previous.projectName) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void push(), 600);
    }
  });

  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(pushTimer);
    source?.close();
    unsubscribe();
  };
}
