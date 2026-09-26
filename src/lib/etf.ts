// Server-only ETF look-through data: the committed seed first, then Alpha Vantage live (reads ALPHA_VANTAGE_API_KEY).
import seed from "@/data/etf-seed.json";
import { sectorFromGics, type SectorLabel } from "@/lib/sectors";

export interface EtfHolding {
  ticker: string;
  name: string;
  // Fraction of the fund, 0..1.
  weight: number;
}

export interface EtfProfile {
  ticker: string;
  holdings: EtfHolding[];
  sectors: { sector: SectorLabel; weight: number }[];
  asOf: string;
  source: "seed" | "live";
}

const BASE = "https://www.alphavantage.co/query";
const TIMEOUT_MS = 8000;
const TTL_MS = 24 * 60 * 60 * 1000;
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// Alpha Vantage's free key allows 25 calls a day, so every answer (including "not an ETF") is cached.
const cache = new Map<string, { expires: number; value: EtfProfile | null }>();
const inflight = new Map<string, Promise<EtfProfile | null>>();

export function normalizeTicker(t: string) {
  return t.trim().toUpperCase().replace(/[/-]/g, ".");
}

// "NVIDIA CORP" -> "Nvidia Corp". Keeps short all-caps tokens like "ETF" or "S&P".
function prettyName(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /[&.]/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

type RawProfile = {
  last_updated?: string;
  sectors?: { sector: string; weight: string }[];
  holdings?: { symbol: string; description: string; weight: string }[];
};

// Turns an ETF_PROFILE response into an EtfProfile, or null if it holds no usable positions (stocks, errors).
export function parseProfile(ticker: string, raw: RawProfile, source: EtfProfile["source"]): EtfProfile | null {
  const merged = new Map<string, EtfHolding>();
  for (const h of raw.holdings ?? []) {
    const t = normalizeTicker(h.symbol ?? "");
    const weight = Number(h.weight);
    if (!TICKER.test(t) || !(weight > 0)) continue;
    const prev = merged.get(t);
    merged.set(t, { ticker: t, name: prev?.name ?? prettyName(h.description ?? t), weight: (prev?.weight ?? 0) + weight });
  }
  if (merged.size === 0) return null;

  const sectors = new Map<SectorLabel, number>();
  for (const s of raw.sectors ?? []) {
    const w = Number(s.weight);
    if (!(w > 0)) continue;
    const label = sectorFromGics(s.sector);
    sectors.set(label, (sectors.get(label) ?? 0) + w);
  }

  return {
    ticker,
    holdings: [...merged.values()].sort((a, b) => b.weight - a.weight),
    sectors: [...sectors].map(([sector, weight]) => ({ sector, weight })),
    asOf: (raw.last_updated ?? "").slice(0, 10),
    source,
  };
}

const SEED = seed as unknown as Record<string, RawProfile>;

async function fetchLive(ticker: string): Promise<EtfProfile | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;
  const url = `${BASE}?function=ETF_PROFILE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`alphavantage ${res.status}`);
  const raw = (await res.json()) as RawProfile & { Information?: string; Note?: string };
  // Rate-limit and key messages come back as 200 with a note; don't cache those as "not an ETF".
  if (raw.Information || raw.Note) throw new Error("alphavantage limit");
  return parseProfile(ticker, raw, "live");
}

// Look-through data for an ETF, or null when there is none (not an ETF, not seeded and no key, or the lookup failed).
export async function getEtfProfile(ticker: string): Promise<EtfProfile | null> {
  const t = normalizeTicker(ticker);
  if (SEED[t]) return parseProfile(t, SEED[t], "seed");

  const hit = cache.get(t);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = inflight.get(t);
  if (pending) return pending;

  const p = fetchLive(t)
    .then((value) => {
      cache.set(t, { expires: Date.now() + TTL_MS, value });
      return value;
    })
    .catch((err) => {
      console.error(`[etf] ${t}:`, err instanceof Error ? err.message : "unknown");
      return null;
    })
    .finally(() => inflight.delete(t));
  inflight.set(t, p);
  return p;
}
