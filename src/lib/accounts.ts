// Saved portfolios and the experience level, read and written through Supabase with the user's own session.
// Row Level Security (supabase/migrations) makes sure a user only ever sees their own rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Level } from "@/lib/level";
import type { ImportedHolding, PortfolioKind } from "@/lib/portfolio-store";

export type SavedPortfolio = { id: string; name: string; kind: PortfolioKind; updatedAt: string; holdings: ImportedHolding[] };

type Row = {
  id: string;
  name: string;
  kind: "real" | "practice" | "demo";
  updated_at: string;
  holdings: { ticker: string; name: string; industry: string | null; shares: number | string; price: number | string }[];
};

// The session calls an import "imported"; the schema (PRD §6) calls it "real".
const toKind = (k: Row["kind"]): PortfolioKind => (k === "practice" ? "practice" : "imported");
const fromKind = (k: PortfolioKind) => (k === "practice" ? "practice" : "real");

export async function loadLevel(db: SupabaseClient): Promise<Level | null> {
  const { data, error } = await db.from("profiles").select("experience_level").maybeSingle();
  if (error) throw error;
  return (data?.experience_level as Level | null) ?? null;
}

export async function saveLevel(db: SupabaseClient, userId: string, level: Level) {
  const { error } = await db.from("profiles").upsert({ id: userId, experience_level: level, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listPortfolios(db: SupabaseClient): Promise<SavedPortfolio[]> {
  const { data, error } = await db
    .from("portfolios")
    .select("id, name, kind, updated_at, holdings (ticker, name, industry, shares, price)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((p) => ({
    id: p.id,
    name: p.name,
    kind: toKind(p.kind),
    updatedAt: p.updated_at,
    holdings: p.holdings.map((h) => ({ ticker: h.ticker, name: h.name, industry: h.industry, shares: Number(h.shares), price: Number(h.price) })),
  }));
}

export async function savePortfolio(db: SupabaseClient, name: string, kind: PortfolioKind, holdings: ImportedHolding[]): Promise<string> {
  const { data, error } = await db.from("portfolios").insert({ name, kind: fromKind(kind) }).select("id").single();
  if (error) throw error;
  const rows = holdings.map((h) => ({ portfolio_id: data.id, ticker: h.ticker, name: h.name, industry: h.industry, shares: h.shares, price: h.price }));
  const { error: holdingsError } = await db.from("holdings").insert(rows);
  if (holdingsError) {
    await db.from("portfolios").delete().eq("id", data.id);
    throw holdingsError;
  }
  return data.id as string;
}

export async function deletePortfolio(db: SupabaseClient, id: string) {
  const { error } = await db.from("portfolios").delete().eq("id", id);
  if (error) throw error;
}

// Same positions (ticker and shares), in any order.
export function samePositions(a: ImportedHolding[], b: ImportedHolding[]) {
  const key = (list: ImportedHolding[]) => JSON.stringify(list.map((h) => [h.ticker, h.shares]).sort());
  return key(a) === key(b);
}
