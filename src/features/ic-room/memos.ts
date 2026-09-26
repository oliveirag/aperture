"use client";

import { create } from "zustand";
import type { AskMemo } from "@/features/ask/context";

// Memos from live IC runs this session, newest first, one per ticker. Ask reads them.
export const useIcMemos = create<{ memos: AskMemo[]; add: (m: AskMemo) => void }>()((set) => ({
  memos: [],
  add: (m) => set((s) => ({ memos: [m, ...s.memos.filter((x) => x.ticker !== m.ticker)].slice(0, 5) })),
}));
