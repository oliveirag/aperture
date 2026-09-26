import { create } from "zustand";

export type Level = "beginner" | "intermediate" | "advanced";

export const useLevel = create<{ level: Level; setLevel: (l: Level) => void }>()((set) => ({
  level: "intermediate",
  setLevel: (level) => set({ level }),
}));
