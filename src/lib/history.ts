// Server-only: weekly price history from Alpha Vantage (reads ALPHA_VANTAGE_API_KEY). Finnhub candles are premium on our key.
// One call per ticker, cached a day, so a 10-position portfolio costs at most 10 of the 25 free daily calls.
import { memo } from "@/lib/cache";
import type { NumericProvenance, Provenance } from "@/lib/provenance";

// Compatibility contract with the sourced keyless history adapter on ws/a.
export type HistoryResult = {
  symbol: string; status: "available" | "unavailable" | "unsupported";
  daily: Weekly; weekly: Weekly; provenance?: Provenance; numericProvenance: NumericProvenance;
  adjustment: { status: "provider-adjusted" | "unverified" | "mismatch" | "verified-overlap"; suspiciousDates: string[]; reason: string };
  crossValidation: { status: "not-comparable" | "matched" | "discrepancy"; primary: string; secondary: string; selected: string; reason: string; differencePct?: number };
  stale: boolean; warning?: string;
};

export function unavailableHistory(symbol: string, status: "unavailable" | "unsupported", warning: string): HistoryResult {
  return { symbol, status, daily: [], weekly: [], numericProvenance: {}, stale: false, warning,
    adjustment: { status: "unverified", suspiciousDates: [], reason: "No modeled history" },
    crossValidation: { status: "not-comparable", primary: "alpha-vantage", secondary: "none", selected: "none", reason: "No independent close comparison" } };
}

const BASE = "https://www.alphavantage.co/query";
const TIMEOUT_MS = 8000;
const DAY = 24 * 60 * 60 * 1000;
// The free key rejects bursts; one request at a time with a gap stays under it.
const GAP_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, GAP_MS)));
  return result;
}

// Weekly closes, oldest first, adjusted for splits and dividends.
export type Weekly = { date: string; close: number }[];

export function historyConfigured() {
  return Boolean(process.env.ALPHA_VANTAGE_API_KEY);
}

type Raw = { "Weekly Adjusted Time Series"?: Record<string, Record<string, string>>; Information?: string; Note?: string; "Error Message"?: string };

export function parseWeekly(raw: Raw): Weekly | null {
  const series = raw["Weekly Adjusted Time Series"];
  if (!series) return null;
  return Object.entries(series)
    .map(([date, row]) => ({ date, close: Number(row["5. adjusted close"]) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Date.parse(p.date)) && new Date(p.date).toISOString().slice(0,10) === p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Store the retrieval date with the response, never invent a new one on cache hits.
// ws/a replaces this legacy transport with keyless Stooq while keeping this contract.
export async function getHistory(ticker: string): Promise<HistoryResult> {
  if (!/^[A-Z][A-Z.]{0,5}$/.test(ticker) || ticker === "USD") return unavailableHistory(ticker, "unsupported", "No supported equity history basis");
  if (!historyConfigured()) return unavailableHistory(ticker, "unavailable", "Price history is not configured");
  try {
    const result = await memo<HistoryResult>(`history:sourced:${ticker}`, DAY, async () => {
      const endpoint = `${BASE}?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${encodeURIComponent(ticker)}`;
      const res = await throttled(() => fetch(`${endpoint}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }));
      if (!res.ok) throw new Error(`alphavantage ${res.status}`);
      const raw = (await res.json()) as Raw;
      if (raw.Information || raw.Note) throw new Error("alphavantage limit");
      const weekly = parseWeekly(raw);
      if (!weekly?.length) throw new Error("No valid adjusted history");
      const provenance: Provenance = {kind:"retrieved",provider:"alpha-vantage",endpoint,retrievedAt:new Date().toISOString(),asOf:weekly.at(-1)!.date};
      return {...unavailableHistory(ticker,"unavailable",""),status:"available",weekly,provenance,warning:undefined,
        adjustment:{status:"provider-adjusted",suspiciousDates:[],reason:"Provider adjusted weekly closes; no independent cross-validation"}};
    }, { persist: true });
    const source = result.provenance;
    const stale = source?.kind === "retrieved" && Date.now() - Date.parse(source.retrievedAt) >= DAY;
    const provenance = source ? {...source,stale} : undefined;
    const numericProvenance: Record<string,Provenance> = {};
    if(provenance) result.weekly.forEach((point,index)=>{numericProvenance[`/weekly/${index}/close`]={...provenance,asOf:point.date};});
    return {...result,provenance,numericProvenance,stale,warning:stale?"Cached history is stale; original dates retained":result.warning};
  } catch { return unavailableHistory(ticker,"unavailable","Price history unavailable; no sourced cached history"); }
}

export async function getWeekly(ticker: string): Promise<Weekly | null> {
  const result = await getHistory(ticker);
  return result.status === "available" ? result.weekly : null;
}
