import { create } from "zustand";
import { isOpen } from "@/lib/experience/policy";
import { usePolicy } from "@/lib/experience/store";

// Obsidian's graph settings, same four groups: filters, groups (the legend), display, forces.
export type GraphSettings = {
  showSources: boolean;
  showContext: boolean;
  showUnaffected: boolean;
  arrows: boolean;
  flow: boolean;
  textFade: number;
  nodeSize: number;
  linkThickness: number;
  center: number;
  repel: number;
  linkForce: number;
  linkDistance: number;
};

export const DEFAULT_SETTINGS: GraphSettings = {
  showSources: true,
  showContext: true,
  showUnaffected: true,
  arrows: false,
  flow: true,
  textFade: 1.1,
  nodeSize: 1,
  linkThickness: 1,
  center: 0.5,
  repel: 10,
  linkForce: 1,
  linkDistance: 45,
};

// Filters whose default comes from the experience level until the user flips them; after that their choice holds.
export const LEVEL_FILTERS = ["showSources", "showContext", "showUnaffected"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];
const isLevelFilter = (k: keyof GraphSettings): k is LevelFilter => (LEVEL_FILTERS as readonly string[]).includes(k);

type GraphUiState = {
  settings: GraphSettings;
  // Level filters the user has set explicitly this session.
  explicit: LevelFilter[];
  set: <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => void;
  reset: () => void;
};

export const useGraphUi = create<GraphUiState>()((set) => ({
  settings: DEFAULT_SETTINGS,
  explicit: [],
  set: (key, value) =>
    set((s) => ({
      settings: { ...s.settings, [key]: value },
      explicit: isLevelFilter(key) && !s.explicit.includes(key) ? [...s.explicit, key] : s.explicit,
    })),
  reset: () => set({ settings: DEFAULT_SETTINGS, explicit: [] }),
}));

// The settings the graph draws with: level defaults for the filters the user hasn't touched, their choice otherwise.
export function useEffectiveGraphSettings(): GraphSettings {
  const policy = usePolicy();
  const settings = useGraphUi((s) => s.settings);
  const explicit = useGraphUi((s) => s.explicit);
  const levelDefault: Record<LevelFilter, boolean> = {
    showSources: isOpen(policy.shock.sources),
    showContext: isOpen(policy.shock.context),
    showUnaffected: isOpen(policy.shock.unaffected),
  };
  const out = { ...settings };
  for (const k of LEVEL_FILTERS) out[k] = explicit.includes(k) ? settings[k] : levelDefault[k];
  return out;
}

// Obsidian's dark theme, plus the heat the shock paints on what it reaches.
export const PALETTE = {
  bg: "#1e1e1e",
  node: "#8f8f8f",
  nodeDim: "#5c5c5c",
  line: "rgba(255,255,255,0.13)",
  accent: "#a882ff",
  text: "#dadada",
  textMuted: "#8f8f8f",
  hotLow: [255, 184, 77] as const,
  hotHigh: [255, 59, 48] as const,
  channel: "#ffa24c",
  source: "#a882ff",
};

// Milliseconds for the shock to cross one hop.
export const HOP_MS = 650;
