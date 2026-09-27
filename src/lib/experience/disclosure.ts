"use client";

import { create } from "zustand";
import { isOpen, type Disclosure } from "./policy";

// Session overrides for sections the user opened or closed. They outlive a level change (a section you opened stays
// open) and reset when the portfolio changes, so one portfolio's reading state never carries into another.
type DisclosureState = {
  scope: string;
  open: Record<string, boolean>;
  set: (id: string, open: boolean) => void;
  reset: (scope: string) => void;
};

export const useDisclosures = create<DisclosureState>()((set) => ({
  scope: "",
  open: {},
  set: (id, open) => set((s) => ({ open: { ...s.open, [id]: open } })),
  reset: (scope) => set((s) => (s.scope === scope ? s : { scope, open: {} })),
}));

// Open state for one section: the user's choice this session, else the level's default.
export function useDisclosure(id: string, fallback: Disclosure): [boolean, (open: boolean) => void] {
  const override = useDisclosures((s) => s.open[id]);
  const set = useDisclosures((s) => s.set);
  return [override ?? isOpen(fallback), (open: boolean) => set(id, open)];
}
