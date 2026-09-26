import { create } from "zustand";

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

type GraphUiState = {
  settings: GraphSettings;
  set: <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => void;
  reset: () => void;
};

export const useGraphUi = create<GraphUiState>()((set) => ({
  settings: DEFAULT_SETTINGS,
  set: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
  reset: () => set({ settings: DEFAULT_SETTINGS }),
}));

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
