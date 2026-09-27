"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isLevel, policyFor, type ExperiencePolicy, type Level } from "./policy";

// The device's experience preference. Kept in localStorage (a preference, not account data), rehydrated after the
// first render so server and client markup agree. Falls back to memory when storage is unavailable.
type ExperienceState = {
  level: Level;
  // When the user last picked a level on purpose; null means the default was never changed.
  chosenAt: string | null;
  onboarded: boolean;
  noticeDismissed: boolean;
  hydrated: boolean;
  // An explicit choice (switcher, onboarding): stamps chosenAt.
  setLevel: (level: Level) => void;
  // Adopting the account's saved level: no new timestamp, so it can't outrank a later explicit choice.
  adoptLevel: (level: Level, at: string | null) => void;
  finishOnboarding: () => void;
  dismissNotice: () => void;
};

const safeStorage = createJSONStorage(() => {
  try {
    const probe = "__aperture_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
  }
});

export const useExperience = create<ExperienceState>()(
  persist(
    (set) => ({
      level: "intermediate",
      chosenAt: null,
      onboarded: false,
      noticeDismissed: false,
      hydrated: false,
      setLevel: (level) => set({ level, chosenAt: new Date().toISOString() }),
      adoptLevel: (level, at) => set({ level, chosenAt: at }),
      finishOnboarding: () => set({ onboarded: true, noticeDismissed: true }),
      dismissNotice: () => set({ noticeDismissed: true }),
    }),
    {
      name: "aperture-experience",
      version: 1,
      storage: safeStorage,
      skipHydration: true,
      partialize: (s) => ({ level: s.level, chosenAt: s.chosenAt, onboarded: s.onboarded, noticeDismissed: s.noticeDismissed }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ExperienceState>;
        return {
          ...current,
          level: isLevel(p.level) ? p.level : current.level,
          chosenAt: typeof p.chosenAt === "string" ? p.chosenAt : null,
          onboarded: p.onboarded === true,
          noticeDismissed: p.noticeDismissed === true,
        };
      },
      onRehydrateStorage: () => () => useExperience.setState({ hydrated: true }),
    },
  ),
);

let listening = false;

// Mounted once (root layout): loads the saved preference and keeps other tabs in step.
export function useHydrateExperience() {
  useEffect(() => {
    if (!useExperience.persist.hasHydrated()) void useExperience.persist.rehydrate();
    if (listening) return;
    listening = true;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "aperture-experience") void useExperience.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
  }, []);
}

export function useLevelValue(): Level {
  return useExperience((s) => s.level);
}

export function usePolicy(): ExperiencePolicy {
  return policyFor(useExperience((s) => s.level));
}
