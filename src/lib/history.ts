// Server-only: weekly price history from Alpha Vantage (reads ALPHA_VANTAGE_API_KEY). Finnhub candles are premium on our key.
// One call per ticker, cached a day, so a 10-position portfolio costs at most 10 of the 25 free daily calls.
import { memo } from "@/lib/cache";

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
    .map(([date, row]) => ({ date, close: Number(row["5. adjusted close"] ?? row["4. close"]) }))
    .filter((p) => p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Null when Alpha Vantage has no history for the symbol. Throws on rate limits so they aren't cached as "no history".
export function getWeekly(ticker: string): Promise<Weekly | null> {
  return memo(`history:${ticker}`, DAY, async () => {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) return null;
    const url = `${BASE}?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await throttled(() => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }));
    if (!res.ok) throw new Error(`alphavantage ${res.status}`);
    const raw = (await res.json()) as Raw;
    if (raw.Information || raw.Note) throw new Error("alphavantage limit");
    return parseWeekly(raw);
  }, { persist: true });
}
