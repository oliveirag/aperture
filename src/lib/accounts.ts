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

export type SavedLevel = { level: Level | null; updatedAt: string | null };

// Postgres "undefined column" (select) or PostgREST "column not in schema cache" (write): the experience migration
// isn't applied yet, so fall back to the original columns.
const missingColumn = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

export async function loadLevel(db: SupabaseClient): Promise<SavedLevel> {
  const first = await db.from("profiles").select("experience_level, experience_level_updated_at").maybeSingle();
  if (!first.error) {
    const row = first.data as { experience_level: Level | null; experience_level_updated_at: string | null } | null;
    return { level: row?.experience_level ?? null, updatedAt: row?.experience_level_updated_at ?? null };
  }
  if (!missingColumn(first.error)) throw first.error;
  const { data, error } = await db.from("profiles").select("experience_level").maybeSingle();
  if (error) throw error;
  return { level: (data?.experience_level as Level | null) ?? null, updatedAt: null };
}

// `chosenAt` is when the user picked the level, so a slower write from another tab can't overwrite a newer choice
// (the experience migration's trigger keeps the newest).
export async function saveLevel(db: SupabaseClient, userId: string, level: Level, chosenAt: string | null) {
  const now = new Date().toISOString();
  const row = { id: userId, experience_level: level, updated_at: now, experience_level_updated_at: chosenAt ?? now };
  const { error } = await db.from("profiles").upsert(row);
  if (!error) return;
  if (!missingColumn(error)) throw error;
  const { error: legacy } = await db.from("profiles").upsert({ id: userId, experience_level: level, updated_at: now });
  if (legacy) throw legacy;
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
