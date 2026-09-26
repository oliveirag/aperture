"use client";

import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { useLevel, type Level } from "@/lib/level";
import { usePortfolio, type ImportedHolding, type PortfolioKind } from "@/lib/portfolio-store";
import { supabase } from "@/lib/supabase";

// Accounts on top of the session portfolio store: sign in with Google, then your own portfolio and experience level
// are saved to Supabase and come back in any browser. Without Supabase configured, status stays "disabled".

type User = { id: string; email: string | null; name: string | null; avatar: string | null };
type SaveState = "idle" | "saving" | "saved" | "error";

type AccountState = {
  status: "disabled" | "loading" | "signed-out" | "signed-in";
  user: User | null;
  saveState: SaveState;
  savedAt: number | null;
  // The session holds a portfolio the account doesn't have yet; the UI offers to save it (once per sign-in).
  offerSave: boolean;
  error: string | null;
  signIn: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  dismissOffer: () => void;
};

const DB_KIND: Record<PortfolioKind, "real" | "practice"> = { imported: "real", practice: "practice" };
const APP_KIND: Record<"real" | "practice", PortfolioKind> = { real: "imported", practice: "practice" };

const sameHoldings = (a: ImportedHolding[], b: ImportedHolding[]) =>
  a.length === b.length && a.every((h, i) => h.ticker === b[i].ticker && Math.abs(h.shares - b[i].shares) < 1e-9);

function toUser(session: Session | null): User | null {
  const u = session?.user;
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  return { id: u.id, email: u.email ?? null, name: meta.full_name ?? meta.name ?? null, avatar: meta.avatar_url ?? null };
}

export const useAccount = create<AccountState>()((set, get) => ({
  status: supabase ? "loading" : "disabled",
  user: null,
  saveState: "idle",
  savedAt: null,
  offerSave: false,
  error: null,

  signIn: async (next = "/xray") => {
    if (!supabase) return;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) set({ error: `Couldn't start Google sign-in: ${error.message}` });
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Your data stays in your account; this browser tab goes back to the demo.
    usePortfolio.getState().resetToDemo();
    usePortfolio.setState({ stashed: null });
    set({ status: "signed-out", user: null, saveState: "idle", savedAt: null, offerSave: false });
  },

  saveCurrent: async () => {
    const { imported, kind } = usePortfolio.getState();
    if (!supabase || !imported || get().status !== "signed-in") return;
    set({ saveState: "saving", offerSave: false });
    const holdings = imported.map(({ ticker, name, industry, shares, price }) => ({ ticker, name, industry, shares, price }));
    const { error } = await supabase.rpc("save_portfolio", { p_kind: DB_KIND[kind], p_holdings: holdings });
    if (error) set({ saveState: "error", error: `Couldn't save your portfolio: ${error.message}` });
    else set({ saveState: "saved", savedAt: Date.now(), error: null });
  },

  dismissOffer: () => set({ offerSave: false }),
}));

// Guards so restoring data from the account doesn't immediately write it back.
let applyingRemote = false;
let loadedFor: string | null = null;

async function loadAccount(user: User) {
  if (!supabase || loadedFor === user.id) return;
  loadedFor = user.id;
  // Compare against the real session portfolio, not the empty store before sessionStorage has been read.
  if (!usePortfolio.persist.hasHydrated()) await usePortfolio.persist.rehydrate();
  const [profile, saved] = await Promise.all([
    supabase.from("profiles").select("experience_level").eq("id", user.id).maybeSingle(),
    supabase
      .from("portfolios")
      .select("kind, updated_at, holdings(ticker, name, industry, shares, price, position)")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  applyingRemote = true;
  try {
    const level = profile.data?.experience_level as Level | null | undefined;
    if (level) useLevel.getState().setLevel(level);
    else void supabase.from("profiles").update({ experience_level: useLevel.getState().level }).eq("id", user.id);

    const session = usePortfolio.getState();
    const row = saved.data as { kind: "real" | "practice"; updated_at: string; holdings: (ImportedHolding & { position: number })[] } | null;
    const remote = row
      ? row.holdings
          .sort((a, b) => a.position - b.position)
          .map(({ ticker, name, industry, shares, price }) => ({ ticker, name, industry, shares: Number(shares), price: Number(price) }))
      : null;

    if (!session.imported && remote?.length) {
      // New browser, empty session: bring the saved portfolio back.
      session.setImported(remote, APP_KIND[row!.kind]);
      useAccount.setState({ saveState: "saved", savedAt: Date.parse(row!.updated_at) });
    } else if (session.imported && remote && sameHoldings(session.imported, remote)) {
      useAccount.setState({ saveState: "saved", savedAt: Date.parse(row!.updated_at) });
    } else if (session.imported) {
      // The session has a portfolio the account doesn't: ask before overwriting anything.
      useAccount.setState({ offerSave: true });
    }
  } finally {
    applyingRemote = false;
  }
}

let started = false;

// Wires Supabase auth to the stores. Idempotent; called from the app shell and the callback page.
export function startAccount() {
  if (started || !supabase) return;
  started = true;
  const client = supabase;

  const apply = (session: Session | null) => {
    const user = toUser(session);
    if (!user) {
      loadedFor = null;
      useAccount.setState({ status: "signed-out", user: null });
      return;
    }
    useAccount.setState({ status: "signed-in", user });
    void loadAccount(user).catch(() => useAccount.setState({ error: "Couldn't load your saved portfolio." }));
  };

  client.auth.getSession().then(({ data }) => apply(data.session));
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") apply(session);
  });

  // Once signed in, a new import or practice portfolio is saved automatically.
  usePortfolio.subscribe((s, prev) => {
    // Loading the session from sessionStorage isn't a new import; only changes after hydration are saved.
    if (applyingRemote || !prev.hydrated || s.imported === prev.imported || !s.imported) return;
    if (useAccount.getState().status === "signed-in") void useAccount.getState().saveCurrent();
  });

  // The experience level follows you too.
  useLevel.subscribe((s, prev) => {
    const { status, user } = useAccount.getState();
    if (applyingRemote || s.level === prev.level || status !== "signed-in" || !user) return;
    void client.from("profiles").update({ experience_level: s.level }).eq("id", user.id);
  });
}
