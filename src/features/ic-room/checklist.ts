"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// The research checklist's ticks, per idea (ticker + thesis), kept on this device so a thesis can be revisited after
// the next earnings or filing. Holds only which "what must be true" items were checked, never portfolio data.
type ChecklistState = {
  checked: Record<string, Record<string, boolean>>;
  toggle: (idea: string, item: string) => void;
};

export const ideaKey = (ticker: string, thesis: string) => `${ticker}:${thesis.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200)}`;

export const useChecklist = create<ChecklistState>()(
  persist(
    (set) => ({
      checked: {},
      toggle: (idea, item) =>
        set((s) => ({ checked: { ...s.checked, [idea]: { ...s.checked[idea], [item]: !s.checked[idea]?.[item] } } })),
    }),
    { name: "aperture-ic-checklist", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
