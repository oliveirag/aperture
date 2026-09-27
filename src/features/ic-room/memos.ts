"use client";

import { create } from "zustand";
import type { AskMemo } from "@/features/ask/context";

// Memos from live IC runs for the current account and portfolio, newest first, one per ticker. Ask reads them.
// Cleared whenever the account or portfolio changes (features/account/scope-sync.ts).
export const useIcMemos = create<{ memos: AskMemo[]; add: (m: AskMemo) => void; clear: () => void }>()((set) => ({
  memos: [],
  add: (m) => set((s) => ({ memos: [m, ...s.memos.filter((x) => x.ticker !== m.ticker)].slice(0, 5) })),
  clear: () => set({ memos: [] }),
}));
