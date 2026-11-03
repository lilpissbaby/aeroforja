/**
 * Workbench layout: which side panels are folded, how wide or tall each one
 * is and which foldable sections are open. A per-viewer convenience kept in
 * the browser, apart from the project file: it never changes a result.
 */
import { create } from "zustand";

export type DockId = "left" | "right" | "bottom";
export const DOCKS: readonly DockId[] = ["left", "right", "bottom"];

/** Panels on screen in a view: the CFD and gust benches hide the right and bottom ones. */
export function visibleDocks(bench: boolean): readonly DockId[] {
  return bench ? ["left"] : DOCKS;
}

/** Sizes in CSS pixels: width of the side panels, height of the results panel. */
export const DOCK_LIMITS: Readonly<Record<DockId, { readonly min: number; readonly max: number; readonly initial: number }>> = {
  left: { min: 210, max: 520, initial: 250 },
  right: { min: 260, max: 600, initial: 330 },
  bottom: { min: 110, max: 720, initial: 270 },
};

/** Share of the window a panel may take at most, so the view always keeps room. */
export const DOCK_MAX_SHARE: Readonly<Record<DockId, number>> = { left: 0.4, right: 0.4, bottom: 0.6 };

/** Width of a folded side panel. The folded results panel keeps its tab row. */
export const RAIL_WIDTH = 32;

type DockFlags = Readonly<Record<DockId, boolean>>;
type DockSizes = Readonly<Record<DockId, number>>;

export interface SavedLayout {
  readonly collapsed: DockFlags;
  readonly size: DockSizes;
  /** Sections the viewer opened or closed, by id; a missing id uses the section's default. */
  readonly sections: Readonly<Record<string, boolean>>;
}

export const DEFAULT_LAYOUT: SavedLayout = {
  collapsed: { left: false, right: false, bottom: false },
  size: { left: DOCK_LIMITS.left.initial, right: DOCK_LIMITS.right.initial, bottom: DOCK_LIMITS.bottom.initial },
  sections: {},
};

/** Keeps a size inside the panel's limits and its share of the window. */
export function clampDockSize(id: DockId, px: number, viewport: { readonly width: number; readonly height: number }): number {
  const { min, max } = DOCK_LIMITS[id];
  const room = (id === "bottom" ? viewport.height : viewport.width) * DOCK_MAX_SHARE[id];
  const upper = Math.max(min, Math.min(max, room));
  if (!Number.isFinite(px)) return DOCK_LIMITS[id].initial;
  return Math.round(Math.min(upper, Math.max(min, px)));
}

/**
 * «Ampliar vista»: folds every visible panel; pressed again, gives back the
 * panels that were open before. Panels not on screen (the CFD and gust views
 * hide the right and bottom ones) are left as they are.
 */
export function focusToggle(
  collapsed: DockFlags,
  beforeFocus: DockFlags | null,
  visible: readonly DockId[],
): { collapsed: DockFlags; beforeFocus: DockFlags | null } {
  const anyOpen = visible.some((id) => !collapsed[id]);
  if (anyOpen) {
    const next: Record<DockId, boolean> = { ...collapsed };
    for (const id of visible) next[id] = true;
    return { collapsed: next, beforeFocus: collapsed };
  }
  const restored: Record<DockId, boolean> = { ...collapsed };
  for (const id of visible) restored[id] = beforeFocus?.[id] ?? false;
  // Nothing to give back (they were folded one by one): open them all.
  if (visible.every((id) => restored[id])) for (const id of visible) restored[id] = false;
  return { collapsed: restored, beforeFocus: null };
}

/** Reads a stored layout; anything missing or malformed falls back to the default. */
export function parseLayout(raw: unknown): SavedLayout {
  if (typeof raw !== "object" || raw === null) return DEFAULT_LAYOUT;
  const data = raw as { collapsed?: unknown; size?: unknown; sections?: unknown };
  const flags = (typeof data.collapsed === "object" && data.collapsed !== null ? data.collapsed : {}) as Record<string, unknown>;
  const sizes = (typeof data.size === "object" && data.size !== null ? data.size : {}) as Record<string, unknown>;
  const collapsed: Record<DockId, boolean> = { ...DEFAULT_LAYOUT.collapsed };
  const size: Record<DockId, number> = { ...DEFAULT_LAYOUT.size };
  for (const id of DOCKS) {
    if (typeof flags[id] === "boolean") collapsed[id] = flags[id];
    const s = sizes[id];
    if (typeof s === "number" && Number.isFinite(s)) size[id] = Math.round(Math.min(DOCK_LIMITS[id].max, Math.max(DOCK_LIMITS[id].min, s)));
  }
  const sections: Record<string, boolean> = {};
  if (typeof data.sections === "object" && data.sections !== null) {
    for (const [key, value] of Object.entries(data.sections)) if (typeof value === "boolean") sections[key] = value;
  }
  return { collapsed, size, sections };
}

const STORAGE_KEY = "aeroforja.layout.v1";

function load(): SavedLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_LAYOUT : parseLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function save(layout: SavedLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Private windows or blocked storage: the layout just resets next time.
  }
}

export interface LayoutState extends SavedLayout {
  /** Panels that were open before «Ampliar vista», to give them back. */
  readonly beforeFocus: DockFlags | null;
  setCollapsed(id: DockId, collapsed: boolean): void;
  toggleDock(id: DockId): void;
  setDockSize(id: DockId, px: number): void;
  toggleFocus(visible: readonly DockId[]): void;
  setSection(id: string, open: boolean): void;
}

const initial = typeof window === "undefined" ? DEFAULT_LAYOUT : load();

export const useLayout = create<LayoutState>()((set) => ({
  ...initial,
  beforeFocus: null,
  setCollapsed: (id, collapsed) => set((s) => ({ collapsed: { ...s.collapsed, [id]: collapsed }, beforeFocus: null })),
  toggleDock: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] }, beforeFocus: null })),
  setDockSize: (id, px) =>
    set((s) => ({ size: { ...s.size, [id]: clampDockSize(id, px, { width: window.innerWidth, height: window.innerHeight }) } })),
  toggleFocus: (visible) => set((s) => focusToggle(s.collapsed, s.beforeFocus, visible)),
  setSection: (id, open) => set((s) => ({ sections: { ...s.sections, [id]: open } })),
}));

if (typeof window !== "undefined") {
  useLayout.subscribe((s, prev) => {
    if (s.collapsed !== prev.collapsed || s.size !== prev.size || s.sections !== prev.sections) {
      save({ collapsed: s.collapsed, size: s.size, sections: s.sections });
    }
  });
}
