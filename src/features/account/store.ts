"use client";

import { create } from "zustand";
import { deletePortfolio, listPortfolios, loadLevel, samePositions, savePortfolio, saveLevel, type SavedPortfolio } from "@/lib/accounts";
import { useLevel } from "@/lib/level";
import { usePortfolio } from "@/lib/portfolio-store";
import { supabase } from "@/lib/supabase";
import { cancelImportDrafts } from "@/lib/imports/client";
import { useSnapshots } from "@/lib/imports/snapshot-store";

type Status = "disabled" | "loading" | "signed-out" | "signed-in";

type AccountState = {
  status: Status;
  email: string | null;
  userId: string | null;
  saved: SavedPortfolio[];
  error: string | null;
  // The session portfolio is unsaved and the user hasn't dismissed the offer to save it.
  offerSave: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  saveCurrent: (name?: string) => Promise<void>;
  open: (p: SavedPortfolio) => void;
  remove: (id: string) => Promise<void>;
  dismissOffer: () => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : "Something went wrong");

// Is the portfolio showing (or stashed behind the demo) one the user hasn't saved yet?
function unsavedPortfolio(saved: SavedPortfolio[]) {
  const { imported, kind, stashed } = usePortfolio.getState();
  const current = imported ? { holdings: imported, kind } : stashed;
  if (!current) return null;
  return saved.some((s) => samePositions(s.holdings, current.holdings)) ? null : current;
}

export const useAccount = create<AccountState>()((set, get) => ({
  status: "loading",
  email: null,
  userId: null,
  saved: [],
  error: null,
  offerSave: false,

  signIn: async () => {
    const db = supabase();
    if (!db) return;
    set({ error: null });
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
    if (error) set({ error: `Google sign-in isn't available right now (${error.message}). The demo still works without an account.` });
  },

  signOut: async () => {
    try { await cancelImportDrafts(); }
    catch (error) { set({error:message(error)}); return; }
    await supabase()?.auth.signOut();
    useSnapshots.setState({snapshot:null});
    set({ status: "signed-out", email: null, userId: null, saved: [], offerSave: false });
  },

  saveCurrent: async (name) => {
    const db = supabase();
    const current = unsavedPortfolio(get().saved);
    if (!db || !current) return;
    try {
      const label = name ?? (current.kind === "practice" ? "Practice portfolio" : "My portfolio");
      await savePortfolio(db, `${label} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, current.kind, current.holdings);
      set({ saved: await listPortfolios(db), offerSave: false, error: null });
    } catch (err) {
      set({ error: `Couldn't save the portfolio (${message(err)}).` });
    }
  },

  open: (p) => usePortfolio.getState().setImported(p.holdings, p.kind),

  remove: async (id) => {
    const db = supabase();
    if (!db) return;
    try {
      await deletePortfolio(db, id);
      set((s) => ({ saved: s.saved.filter((p) => p.id !== id) }));
    } catch (err) {
      set({ error: `Couldn't delete the portfolio (${message(err)}).` });
    }
  },

  dismissOffer: () => set({ offerSave: false }),
}));

// After sign-in: restore the saved level (or save the current one), load saved portfolios, bring back the latest one
// in a fresh browser session, and offer to save a portfolio that only lives in this session.
async function onSignedIn(userId: string, email: string | null) {
  const db = supabase();
  if (!db) return;
  useAccount.setState({ status: "signed-in", userId, email, error: null });
  try {
    const [level, saved] = await Promise.all([loadLevel(db), listPortfolios(db)]);
    if (level) useLevel.getState().setLevel(level);
    else await saveLevel(db, userId, useLevel.getState().level);
    const session = usePortfolio.getState();
    if (!session.imported && !session.stashed && saved[0]) session.setImported(saved[0].holdings, saved[0].kind);
    useAccount.setState({ saved, offerSave: unsavedPortfolio(saved) !== null });
  } catch (err) {
    useAccount.setState({ error: `Couldn't load your account (${message(err)}).` });
  }
}

let started = false;

// Called once on the client. Never throws: a misconfigured project leaves accounts off and the demo untouched.
export function startAccounts() {
  if (started) return;
  started = true;
  const db = supabase();
  if (!db) {
    useAccount.setState({ status: "disabled" });
    return;
  }
  const portfolioReady = () =>
    new Promise<void>((resolve) => {
      if (usePortfolio.getState().hydrated) return resolve();
      const unsub = usePortfolio.subscribe((s) => {
        if (!s.hydrated) return;
        unsub();
        resolve();
      });
    });
  let current: string | null = null;
  db.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    if (user?.id === current) return;
    current = user?.id ?? null;
    if (!user) {
      useAccount.setState({ status: "signed-out", userId: null, email: null, saved: [], offerSave: false });
      return;
    }
    // Supabase runs this callback under its auth lock; do the follow-up work outside it.
    setTimeout(() => portfolioReady().then(() => onSignedIn(user.id, user.email ?? null)), 0);
  });
  // Keep the saved level in step with the level switcher.
  useLevel.subscribe((s, prev) => {
    const { status, userId } = useAccount.getState();
    if (s.level === prev.level || status !== "signed-in" || !userId) return;
    saveLevel(db, userId, s.level).catch(() => {});
  });
  // A new import or practice portfolio in this session: offer to save it.
  usePortfolio.subscribe((s, prev) => {
    if (s.imported === prev.imported || useAccount.getState().status !== "signed-in") return;
    useAccount.setState({ offerSave: unsavedPortfolio(useAccount.getState().saved) !== null });
  });
}
