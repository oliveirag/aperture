import type { PriceResponse } from "@/app/api/price/route";
import type { SnapHolding, SnapResponse } from "@/app/api/snap/route";
import { HOLDINGS } from "@/data/portfolio";
import type { MarketResponse } from "@/lib/finnhub";

// `source`: "gemini" when Gemini read a screenshot, "typed" for CSV or manual rows; the sample leaves it unset.
// `status` mirrors /api/snap: only "matched" and "unpriced" rows count toward the total.
export type ExtractedHolding = {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number | null;
  value: number;
  status: SnapHolding["status"];
  source?: "gemini" | "typed";
};

export type ExtractResult = { ok: true; holdings: ExtractedHolding[]; model?: string } | { ok: false; error: string };

// The sample read takes exactly this long; a real read lasts at least this long.
export const SCAN_MS = 2400;

// Gemini retries across models server-side; give up a little after the server would.
const LIVE_TIMEOUT_MS = 55000;

export const counts = (h: ExtractedHolding) => h.status !== "unknown";

// The sample screenshot is the demo portfolio. Its values use live Finnhub prices when they're available.
async function readSample(): Promise<ExtractResult> {
  let quotes: MarketResponse["quotes"] = {};
  try {
    const res = await fetch(`/api/market?symbols=${HOLDINGS.map((h) => h.ticker).join(",")}&fields=quote`);
    if (res.ok) quotes = ((await res.json()) as MarketResponse).quotes;
  } catch {}
  return {
    ok: true,
    holdings: HOLDINGS.map((h) => {
      const price = quotes[h.ticker]?.price ?? h.price;
      return { ticker: h.ticker, name: h.name, industry: h.category, shares: h.shares, price, value: h.shares * price, status: "matched" };
    }),
  };
}

// Posts the images (one to three) to /api/snap: Gemini reads them in one request, Finnhub prices the positions.
async function readLive(files: File[]): Promise<ExtractResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const body = new FormData();
    for (const file of files) body.append("file", file);
    const res = await fetch("/api/snap", { method: "POST", body, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Partial<SnapResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.holdings)) {
      return { ok: false, error: data.error ?? "Couldn't read the screenshot. Try again in a moment." };
    }
    return { ok: true, model: data.model, holdings: data.holdings.map((h) => ({ ...h, source: "gemini" as const })) };
  } catch {
    return {
      ok: false,
      error: controller.signal.aborted ? "Reading the screenshot took too long. Try again in a moment." : "Couldn't reach the server.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type TypedRow = { ticker: string; shares: number | null; marketValue: number | null; name?: string };

// Prices CSV or typed rows with Finnhub via /api/price. No Gemini involved.
async function readTyped(rows: TypedRow[]): Promise<ExtractResult> {
  try {
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: rows }),
      signal: AbortSignal.timeout(60000),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<PriceResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.holdings)) return { ok: false, error: data.error ?? "Couldn't price these positions." };
    return { ok: true, holdings: data.holdings.map((h) => ({ ...h, source: "typed" as const })) };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

// The only place holdings are produced. Dropped files always go to Gemini; the sample button replays the demo portfolio.
// Either way the scan lasts at least delayMs so the animation can finish.
export async function extractHoldings(
  input: { files?: File[]; sample?: boolean; rows?: TypedRow[] },
  { delayMs = SCAN_MS }: { delayMs?: number } = {},
): Promise<ExtractResult> {
  const wait = new Promise((resolve) => setTimeout(resolve, delayMs));
  const read = input.rows ? readTyped(input.rows) : input.files?.length ? readLive(input.files) : readSample();
  const [result] = await Promise.all([read, wait]);
  return result;
}
